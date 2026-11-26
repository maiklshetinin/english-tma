// Курсы (редактор «рельс»): courses/<id> — { teacherId, title, mode, progress, items, loose, notes, updatedAt }.
//  • notes — стикеры-заметки на холсте: { id, x, y, text, color, by?, sz?, font?, b?, st?, list?, nob? }; ink — рисунки маркером: { id, c, w, p: [x0, y0, x1, y1, …] }.
//  • items — задания по порядку на рельсе; loose — черновики на холсте (с x, y), среди них type 'screen' — экран урока прямо на доске (steps: [один]); у кружка и фото — file: ключ файла в S3.
//  • У урока (и «Слова», «Домашка», «Тест») — steps: экраны интерактивного урока (src/utils/lesson.ts). Файлы экранов — ключи
//    файлов курса в S3 или https-ссылки (фото и озвучка карточек); остальное (файлы, которые пока только в браузере) выкидываем.
//  • Общее рабочее пространство: все преподаватели (TEACHER_IDS) видят и правят все курсы — как учеников и расписание.
//    teacherId — кто создал, updatedBy — кто правил последним (пригодится, когда преподаватели разделятся: claude/multi-tutor-plan.md).
// Ученикам курс назначает преподаватель (assigned — id учеников), проходят его в своём «Пути» — learn.ts.
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import { fail } from './login.js'
import { isOurKey } from './storage.js'
import { isMediaUrl } from './media.js'

export interface CoursesDeps { db: Firestore; FieldValue: Pick<typeof FV, 'serverTimestamp'> }
export const COURSE_TYPES = ['unit', 'video', 'photo', 'lesson', 'checkpoint', 'words', 'hw', 'test', 'tutor', 'reward']
export const COURSE_ITEMS_MAX = 500, COURSES_MAX = 100
export const INTERACTIVE = ['lesson', 'checkpoint', 'words', 'hw', 'test'], STEP_KINDS = ['intro', 'choice', 'pairs', 'order', 'tip', 'speak', 'gap', 'answer', 'sort', 'odd', 'kp', 'talk', 'stt', 'mf'], STEPS_MAX = 40
const ID = /^[\w-]{1,64}$/
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
/** Число в пределах (иначе — нет поля): настройки моделей экрана — пауза, температура */
const within = (v: unknown, lo: number, hi: number, int = false) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!int || Number.isInteger(v)) ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(-1e6, Math.min(1e6, v))) : 0)

export interface Step { id: string; kind: string; [k: string]: unknown }
export interface CourseItem { id: string; type: string; title: string; sub?: string; file?: string; ck?: 'photo' | 'video'; hl?: 'none'; look?: 'sq'; qn?: 'off'; rs?: 'off'; hlw?: true; hlc?: string; hlo?: number; grp?: string; x?: number; y?: number; steps?: Step[]; topic?: string }
export interface Note { id: string; x: number; y: number; text: string; color: string }
export interface Ink { id: string; c: string; w: number; p: number[] }
export interface Course { id: string; title: string; mode: 'wave' | 'line'; progress: number; items: CourseItem[]; loose: CourseItem[]; notes: Note[]; ink: Ink[]; templates?: { id: string; t: string; d: string; step: Step }[]; thumbs?: Record<string, string>; cover?: string; presets?: Record<string, Record<string, unknown>>; updatedAt?: number; assigned?: string[] }
// Настройки упражнений курса (21.11.2026, «{ }» на плитке меню Exercise; src/exercises/presets.ts): промпты и настройки «Ответа по
// смыслу» и «Разговора» на весь курс. Хранятся как поля экрана своего шаблона — те же проверки, что у экрана, без вопроса и эталона
export const PRESET_TPLS: Record<string, Record<string, unknown>> = { kp: { kind: 'kp' }, kpfile: { kind: 'kp', dic: 'file' }, kpapi: { kind: 'kp', engine: 'api' },
  talk: { kind: 'talk' }, talkava: { kind: 'talk', avatar: true }, talkptt: { kind: 'talk', avatar: true, ptt: true }, talkptt2: { kind: 'talk', avatar: true, ptt: true, busuu: true },
  talkvn: { kind: 'talk', avatar: true, ptt: true, vn: true },          // 24.11.2026: «Рация · голосовые»
  talkexam: { kind: 'talk', avatar: true, ptt: true, exam: true },          // 24.11.2026: «Собеседование · рация»
  es_talk: { kind: 'talk', lang: 'es-ES' }, es_talkptt: { kind: 'talk', avatar: true, ptt: true, lang: 'es-ES' },
  kpballive: { kind: 'kp', ball: true, ballLive: true }, kpballive2: { kind: 'kp', ball: true, ballLive: true, ballV2: true }, kpballfix: { kind: 'kp', ball: true, ballLive: true, ballV2: true, ballFix: true }, kpballtext: { kind: 'kp', ball: true, ballLive: true, ballText: true }, kpballsess: { kind: 'kp', ball: true, ballLive: true, ballText: true, ballSess: true }, kpballflow: { kind: 'kp', ball: true, ballLive: true, ballText: true, ballFlow: true } }          // kpballive2 — «Шар Live · новый вид» (25.11.2026)          // 25.11.2026: «Ответ по смыслу · шар Live» — свой промпт (ballPrompt, ballTool) на курс и пресеты          // 24.11.2026: вкладка «Испанский» (es-talk, es-talkptt)
const PRESET_DROP = ['id', 'kind', 'text', 'ideal', 'head', 'star', 'n', 'look', 'plain', 'autoplay', 'engine', 'dic', 'ball', 'ballLive', 'ballV2', 'ballFix', 'ballText', 'ballSess', 'ballFlow', 'keys', 'pv', 'avatar', 'ptt', 'busuu', 'vn', 'exam', 'image', 'audio', 'video', 'exAudio', 'audioBy', 'skills', 'min', 'topic', 'lang', 'lock', 'guard']          // язык и замок — из типа, в настройках не хранятся (24.11.2026)
export const INK_MAX = 300, INK_POINTS = 4000, TEMPLATES_MAX = 30          // TEMPLATES_MAX — своих упражнений из конструктора в курсе
export const NOTE_COLORS = ['#ffffff', '#e6e6e6', '#ffc4b8', '#ffd6a8', '#ffe99a', '#c7efc4', '#bdeee9', '#c4e1ff', '#ddd0ff', '#ffc9e6'], NOTES_MAX = 200

export const TTS_BY = /^[a-z0-9.-]{3,80}\|[A-Za-z]{2,20}$/          // «gemini-2.5-flash-preview-tts|Kore»
export function makeCourses({ db, FieldValue }: CoursesDeps) {
  const col = () => db.collection('courses')
  const checkId = (v: unknown) => { const id = String(v ?? ''); if (!ID.test(id)) throw fail(400, 'bad id'); return id }
  // Файл экрана: свой ключ курса или https-ссылка (фото и озвучка карточек); иначе — нет файла
  const ref = (v: unknown) => (typeof v === 'string' && v.length <= 600 && (isOurKey(v) || isMediaUrl(v)) ? v : undefined)
  const put = (o: Record<string, unknown>, k: string, v: unknown) => { if (v !== undefined && v !== '') o[k] = v }
  // промпты «Ответа по смыслу» и «Разговора»: пустая строка — тоже значение (стёрли в JSON экрана — пусто, умолчание не подставлять; 21.11.2026)
  const putT = (o: Record<string, unknown>, k: string, v: unknown, n: number) => { if (typeof v === 'string') o[k] = v.slice(0, n) }
  // 24.11.2026: язык ответа (польский — умолчание, не хранится) и свои поля запросов в API (request — объект до 8000 знаков, src/utils/overlay.js)
  const LANG_OK = ['en-US', 'en-GB', 'es-ES']
  const putReq = (o: Record<string, unknown>, v: unknown) => { if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) { const s = JSON.stringify(v); if (s.length <= 8000) o.request = JSON.parse(s) } }
  const step = (raw: unknown): Step => {
    const r = (raw ?? {}) as Record<string, unknown>, kind = String(r.kind)
    if (!ID.test(String(r.id)) || !STEP_KINDS.includes(kind)) throw fail(400, 'bad step')
    const o: Step = { id: String(r.id), kind }
    if (kind === 'intro') { for (const k of ['word', 'tr']) put(o, k, str(r[k], 120)); for (const k of ['ex', 'exTr']) put(o, k, str(r[k], 300)) }
    for (const k of ['image', 'audio', 'video', 'exAudio']) put(o, k, ref(r[k]))
    if (typeof r.bk === 'string' && /^[a-z]{2,12}$/.test(r.bk)) o.bk = r.bk
    if (r.bs === 'page') o.bs = 'page'          // вид «Как в учебнике» (страница); без него — Настин
    if (Number.isInteger(r.bn) && (r.bn as number) > 0 && (r.bn as number) < 100) o.bn = r.bn          // номер задания, как в учебнике          // из какого задания учебника (группа «Тест · упражнения Насти»)
    // своё упражнение из конструктора: своё задание вверху экрана, название и описание плитки
    put(o, 'head', str(r.head, 160)); put(o, 'tn', str(r.tn, 60)); put(o, 'td', str(r.td, 120))
    // примерное время экрана (минуты, шаг ½) — своё, если репетитор поставил
    if (typeof r.min === 'number' && Number.isFinite(r.min) && r.min > 0) (o as Record<string, unknown>).min = Math.min(60, Math.max(0.5, Math.round(r.min * 2) / 2))
    if (kind === 'choice') {
      o.ask = r.ask === 'tr' ? 'tr' : 'audio'; o.show = r.show === 'text' ? 'text' : 'pics'
      o.opts = (Array.isArray(r.opts) ? r.opts : []).slice(0, 4).map((x) => {
        const q = (x ?? {}) as Record<string, unknown>, out: Record<string, unknown> = { w: str(q.w, 120) }
        put(out, 't', str(q.t, 120)); put(out, 'image', ref(q.image)); put(out, 'audio', ref(q.audio))
        return out
      })
      o.ans = Math.max(0, Math.min((o.opts as unknown[]).length - 1, num(r.ans)))
    }
    if (kind === 'tip') {
      put(o, 'text', str(r.text, 1500))
      o.opts = (Array.isArray(r.opts) ? r.opts : []).slice(0, 6).map((x) => { const q = (x ?? {}) as Record<string, unknown>, out: Record<string, unknown> = { w: str(q.w, 120) }; put(out, 't', str(q.t, 600)); put(out, 'audio', ref(q.audio)); return out })          // пояснение в строке подсказки — до 600 знаков (18.11.2026: резалось на 120 — «…но для с»)
    }
    if (kind === 'order') { put(o, 'phrase', str(r.phrase, 300)); put(o, 'tr', str(r.tr, 300)); put(o, 'note', str(r.note, 600)); if (r.by === 'letters') o.by = 'letters' }          // «Собери слово» — по буквам
    if (kind === 'speak' || kind === 'gap') { put(o, 'phrase', str(r.phrase, 300)); put(o, 'tr', str(r.tr, 300)) }
    if (kind === 'gap') o.opts = (Array.isArray(r.opts) ? r.opts : []).slice(0, 8).map((x) => ({ w: str(((x ?? {}) as Record<string, unknown>).w, 120) }))          // до 8 — банк слов из учебника (предлоги)
    if (kind === 'answer') { put(o, 'text', str(r.text, 300)); put(o, 'note', str(r.note, 600)); put(o, 'tr', str(r.tr, 300)) }
    if (kind === 'kp') { put(o, 'text', str(r.text, 300)); put(o, 'ideal', str(r.ideal, 6000)); if (r.star === true) o.star = true; if (r.look === 'lines' || r.look === 'cards') o.look = r.look; if (r.plain === true) o.plain = true; { const n = Number(r.n); if (Number.isInteger(n) && n > 0 && n < 100) o.n = n } putT(o, 'prompt', r.prompt, 4000); const p = Number(r.pass); if (Number.isInteger(p) && p > 0 && p <= 100) o.pass = p; if (r.autoplay === true) o.autoplay = true; if (r.dic === 'file') o.dic = 'file'          // 21.11.2026: «Ответ по смыслу · целым аудио» — диктовка целой записью
      // 21.11.2026: всё, что уходит в чат и в модели, — из JSON экрана (src/exercises/kp/defaults.ts), клиент хранит только отличия от умолчаний:
      // у моста и у Gemini API — свои message и format; язык; «целым аудио» — промпт и просьба расшифровки
      for (const k of ['format', 'message', 'sttPrompt', 'sttAsk']) putT(o, k, r[k], 4000)
      if (LANG_OK.includes(String(r.lang))) o.lang = r.lang
      if (r.ball === true) o.ball = true          // «Ответ по смыслу · шар» (24.11.2026): шар и свои блоки (keys)
      if (r.ballLive === true) { o.ballLive = true; putT(o, 'ballPrompt', r.ballPrompt, 6000); putT(o, 'ballTool', r.ballTool, 2000); if (r.ballV2 === true) o.ballV2 = true; if (r.ballFix === true) o.ballFix = true; if (r.ballText === true) o.ballText = true; if (r.ballSess === true) o.ballSess = true; if (r.ballFlow === true) o.ballFlow = true }          // ballV2 — новый вид (25.11.2026)          // «шар Live» (24.11.2026): сверка речи через Live-модель, без моста; 25.11.2026 — свой промпт Live-сессии и описание функции cover (JSON экрана)
      { const pv = Number(r.pv); if (Number.isInteger(pv) && pv > 0 && pv < 100) o.pv = pv }          // пресет типа (kp-2), 24.11.2026
      if (Array.isArray(r.keys)) { const k = r.keys.slice(0, 16).map((x: any) => ({ label: str(x?.label, 60).trim(), words: (Array.isArray(x?.words) ? x.words : []).slice(0, 3).map((w: unknown) => str(w, 40)).filter(Boolean) })).filter((x: { label: string }) => x.label); if (k.length) o.keys = k }
      putT(o, 'topic', r.topic, 300); if (typeof r.dicModel === 'string' && /^[a-z0-9.-]{3,80}$/.test(r.dicModel)) o.dicModel = r.dicModel; putReq(o, r.request)          // тема, чем диктовать, свои поля запросов (23–24.11.2026)
      if (r.engine === 'api' || r.engine === 'live') { o.engine = 'api'; if (typeof r.model === 'string' && /^[a-z0-9.-]{3,80}$/.test(r.model)) o.model = r.model
        if (typeof r.liveModel === 'string' && /^[a-z0-9.-]{3,80}$/.test(r.liveModel)) o.liveModel = r.liveModel
        if (typeof r.voice === 'string' && /^[A-Za-z]{2,20}$/.test(r.voice)) o.voice = r.voice
        for (const k of ['livePrompt', 'liveAsk', 'liveMore', 'liveTool', 'discussPrompt', 'discussOpener', 'discussNone']) putT(o, k, r[k], 4000)
        put(o, 'temperature', within(r.temperature, 0, 2)); if (r.thinking === true) o.thinking = true } }          // engine: 'api' (model: 'live' — проверка голосовой моделью); старый 'live' («Live (голос)», убран 20.11.2026) — тоже 'api'; свой промпт для Gemini и порог, %          // «Ответ по смыслу»: вопрос и эталон (Gemini сверяет)
    // чем озвучен звук экрана (Gemini, 20.11.2026): «модель|голос» — показать в редакторе
    { const by = r.audioBy; if (typeof by === 'string' && TTS_BY.test(by)) o.audioBy = by }
    // «Разговор с Gemini» (Live API, 20.11.2026, эксперимент): задание, роль ИИ, голос, модель
    if (kind === 'talk') { put(o, 'text', str(r.text, 300)); putT(o, 'prompt', r.prompt, 4000); if (typeof r.voice === 'string' && /^[A-Za-z]{2,20}$/.test(r.voice)) o.voice = r.voice; if (typeof r.model === 'string' && /^[a-z0-9.-]{3,80}$/.test(r.model)) o.model = r.model; if (LANG_OK.includes(String(r.lang))) o.lang = r.lang
      // 20.11.2026: всё, что уходит в Live-модель, из JSON экрана (src/exercises/talk/defaults.ts; только отличия от умолчаний) и персонаж (шаблон «Разговор с персонажем»)
      putT(o, 'lock', r.lock, 2000); putT(o, 'opener', r.opener, 500); putT(o, 'guard', r.guard, 500); putT(o, 'evalPrompt', r.evalPrompt, 6000); putT(o, 'evalAsk', r.evalAsk, 2000)          // guard, eval* — 21.11.2026
      put(o, 'silenceMs', within(r.silenceMs, 200, 5000, true)); if (r.endSens === 'high') o.endSens = 'high'; put(o, 'temperature', within(r.temperature, 0, 2))
      if (r.noiseSuppression === true) o.noiseSuppression = true; if (r.avatar === true) o.avatar = true; if (r.ptt === true) o.ptt = true; if (r.busuu === true) o.busuu = true; if (r.vn === true) o.vn = true
      putReq(o, r.request)
      put(o, 'ideal', str(r.ideal, 6000)); if (r.star === true) o.star = true; { const n = Number(r.n); if (Number.isInteger(n) && n > 0 && n < 100) o.n = n }          // 24.11.2026: вопрос (text), эталон, звезда, номер — у всех разговоров, не только у собеседования
      if (r.exam === true) { o.exam = true; o.ptt = true }
      { const pv = Number(r.pv); if (Number.isInteger(pv) && pv > 0 && pv < 100) o.pv = pv } }          // пресет типа (talkexam-2), 24.11.2026          // «Собеседование · рация» (24.11.2026): эталон, звезда, номер
    // «Транскрипция» (Gemini 3.5 Transcribe Live, 20.11.2026, эксперимент): подсказка, язык
    if (kind === 'stt') { put(o, 'text', str(r.text, 300)); if (['en-US', 'es-ES'].includes(String(r.lang))) o.lang = r.lang }
    // Книжные (экспериментальные, 17.11.2026): «Найди лишнее» — плитки слов, одна лишняя; «Распредели по колонкам» — фразы по 2–3 колонкам.
    // k — цвет плитки (o/g/y/p/b), mix — перемешивать у ученика, hint — подсказка «Нажмите фразу, затем колонку»
    // цвет плитки — код #rrggbb (19.11.2026); старые буквы — в коды тех же цветов
    const KC: Record<string, string> = { o: '#fbe1c8', g: '#cfeccf', y: '#fbedb0', p: '#f8d3e2', b: '#cfe6f7' }, kc = (v: unknown) => (KC[String(v)] ?? (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : undefined))
    if (kind === 'odd' || kind === 'sort') { put(o, 'note', str(r.note, 600)); if (r.mix === false) o.mix = false }
    if (kind === 'odd') {
      o.opts = (Array.isArray(r.opts) ? r.opts : []).slice(0, 6).map((x) => { const q = (x ?? {}) as Record<string, unknown>, out: Record<string, unknown> = { w: str(q.w, 120) }; put(out, 'k', kc(q.k)); return out })
      o.ans = Math.max(0, Math.min((o.opts as unknown[]).length - 1, num(r.ans)))
    }
    if (kind === 'sort') {
      o.cols = (Array.isArray(r.cols) ? r.cols : []).slice(0, 5).map((x) => ({ t: str(((x ?? {}) as Record<string, unknown>).t, 60) }))          // до 5 — таблица -s / -es / -ies / -ves / other
      const n = (o.cols as unknown[]).length
      o.items = (Array.isArray(r.items) ? r.items : []).slice(0, 30).map((x) => { const q = (x ?? {}) as Record<string, unknown>, out: Record<string, unknown> = { w: str(q.w, 120), c: Math.max(0, Math.min(Math.max(0, n - 1), num(q.c))) }; put(out, 'k', kc(q.k)); put(out, 'a', str(q.a, 120)); if (q.ex === true) out.ex = true; return out })
      if (r.hint === false) o.hint = false
      if (r.tw === true) { o.tw = true; if (Number.isInteger(r.rows) && (r.rows as number) > 0) o.rows = Math.min(8, r.rows as number); if (r.cs === true) o.cs = true; if (r.noEx === true) o.noEx = true }          // «Заполни таблицу» (Настя, 18.11.2026): a — что вписать, ex — образец
    }
    // «Красный Мерфи» (25.11.2026, src/exercises/mf/data.ts): вид, номер, задание, рамки слов, строки (q, a, ex, r, pre, h), разделы / картинки / буквы (opts), кружок (video)
    if (kind === 'mf') {
      const S = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.slice(0, n) : undefined)
      const L = (v: unknown, n: number, m: number) => (Array.isArray(v) ? v.map((x) => S(x, m)).filter(Boolean).slice(0, n) as string[] : [])
      if (['info', 'gaps', 'match', 'order'].includes(String(r.mode))) o.mode = r.mode
      put(o, 'no', S(r.no, 8)); put(o, 'who', S(r.who, 30)); put(o, 'post', S(r.post, 4)); put(o, 'note', S(r.note, 600)); put(o, 'head', S(r.head, 300))
      for (const k of ['two', 'inl', 'copy', 'below']) if (r[k] === true) o[k] = true
      { const h = L(r.hints, 6, 40); if (h.length) o.hints = h }
      if (Array.isArray(r.banks)) { const b = r.banks.slice(0, 3).map((x) => { const q = (x ?? {}) as Record<string, unknown>; return { t: S(q.t, 30) ?? '', w: L(q.w, 14, 40), x: L(q.x, 14, 40) } }).filter((x) => x.w.length); if (b.length) o.banks = b }
      if (Array.isArray(r.rows)) o.rows = r.rows.slice(0, 16).map((x) => { const q = (x ?? {}) as Record<string, unknown>, out: Record<string, unknown> = { q: S(q.q, 300) ?? '' }; for (const [k, n] of [['a', 300], ['r', 40], ['pre', 30], ['h', 40]] as const) put(out, k, S(q[k], n)); if (q.ex === true) out.ex = true; return out })
      if (Array.isArray(r.opts)) o.opts = r.opts.slice(0, 8).map((x) => { const q = (x ?? {}) as Record<string, unknown>, out: Record<string, unknown> = { w: str(q.w, 300) }; put(out, 't', str(q.t, 1500)); put(out, 'image', ref(q.image)); return out })
    }
    if (kind === 'pairs') o.pairs = (Array.isArray(r.pairs) ? r.pairs : []).slice(0, 6).map((x) => { const q = (x ?? {}) as Record<string, unknown>; return { a: str(q.a, 120), b: str(q.b, 120) } })
    return o
  }
  // Чистим всё, что пришло с сайта: лишние поля выкидываем, длину режем, видео — только свои ключи
  const item = (uid: string, raw: unknown, loose: boolean): CourseItem => {
    const r = (raw ?? {}) as Record<string, unknown>, type = String(r.type)
    // screen — экран урока, положенный прямо на доску (только среди черновиков, один экран)
    if (!ID.test(String(r.id)) || !(COURSE_TYPES.includes(type) || (type === 'screen' && loose))) throw fail(400, 'bad item')
    const out: CourseItem = { id: String(r.id), type, title: str(r.title, 120) }
    if (type === 'unit' || (INTERACTIVE.includes(type) && typeof r.sub === 'string' && r.sub)) out.sub = str(r.sub, 120)          // у урока — описание под названием
    // тема грамматики урока (id из src/utils/skills.ts TOPICS; 'none' — без темы; нет — угадать по названию)
    if (INTERACTIVE.includes(type) && typeof r.topic === 'string' && /^[a-z0-9-]{1,40}$/.test(r.topic)) out.topic = r.topic
    // подсветка главы на доске: hl 'none' — без неё, hlw — вместе с ветками экранов, hlc — цвет (#rrggbb, по умолчанию зелёный)
    if (type === 'unit' && r.hl === 'none') out.hl = 'none'
    if (type === 'unit' && r.qn === 'off') out.qn = 'off'
    if (type === 'unit' && r.rs === 'off') out.rs = 'off'          // 26.11.2026: «продолжить с места» в Chapter выключено          // 26.11.2026: номера вопросов под уроками выключены
    if (type === 'unit' && r.look === 'sq') out.look = 'sq'          // 25.11.2026: уроки Chapter у ученика — квадратиками (как иконки iPhone), линия-путь та же
    if (type === 'unit' && r.hlw === true) out.hlw = true
    if (type === 'unit' && typeof r.hlc === 'string' && /^#[0-9a-f]{6}$/i.test(r.hlc)) out.hlc = r.hlc.toLowerCase()
    if (type === 'unit' && typeof r.hlo === 'number' && r.hlo >= 0 && r.hlo <= 100) out.hlo = Math.round(r.hlo)          // прозрачность плашки, %
    // обложка урока (фото или кружок, как в Busuu): ck — вид, файл — в file
    const cover = INTERACTIVE.includes(type) && (r.ck === 'photo' || r.ck === 'video')
    if (cover) out.ck = r.ck as 'photo' | 'video'
    if ((type === 'video' || type === 'photo' || cover) && r.file != null) {
      const v = String(r.file)
      if (!isOurKey(v)) throw fail(403, 'foreign file')
      out.file = v
    }
    if ((INTERACTIVE.includes(type) || type === 'screen') && Array.isArray(r.steps)) {
      out.steps = r.steps.slice(0, type === 'screen' ? 1 : STEPS_MAX).map(step)
      if (new Set(out.steps.map((x) => x.id)).size !== out.steps.length) throw fail(400, 'duplicate step id')
    }
    if (loose) { out.x = num(r.x); out.y = num(r.y) }
    if (loose && typeof r.grp === 'string' && ID.test(r.grp)) out.grp = r.grp          // урок / чекпоинт главы, лежащей на доске (едут вместе с ней)
    return out
  }
  const pub = (id: string, d: Record<string, any>): Course => ({ id, title: d.title ?? '', mode: d.mode === 'line' ? 'line' : 'wave', progress: d.progress ?? 0,
    items: d.items ?? [], loose: d.loose ?? [], notes: d.notes ?? [], ink: d.ink ?? [], templates: d.templates ?? [], presets: d.presets ?? {}, thumbs: d.thumbs ?? {}, ...(d.cover ? { cover: d.cover } : {}), updatedAt: d.updatedAt?.toMillis?.() ?? undefined, assigned: d.assigned ?? [] })          // assigned — кому назначен (learn.ts)
  const found = async (id: string) => {
    const s = await col().doc(id).get()
    if (!s.exists) throw fail(404, 'course not found')
    return s
  }

  return {
    /** Список своих курсов (без заданий): [{ id, title, count, updatedAt }] */
    async list() {
      const docs = (await col().get()).docs
      return docs.map((d) => { const c = pub(d.id, d.data()); return { id: c.id, title: c.title, count: c.items.length, ...(c.cover ? { cover: c.cover } : {}), updatedAt: c.updatedAt, assigned: c.assigned?.length ?? 0 } })
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    },
    async get(rawId: unknown) { const id = checkId(rawId), s = await found(id); return pub(id, s.data()!) },
    /** Сохранить курс целиком (создать, если ещё нет). */
    async put(uid: string, rawId: unknown, input: unknown) {
      const id = checkId(rawId), b = (input ?? {}) as Record<string, unknown>
      if (!Array.isArray(b.items) || !Array.isArray(b.loose ?? [])) throw fail(400, 'items required')
      const items = (b.items as unknown[]).map((x) => item(uid, x, false)), loose = ((b.loose ?? []) as unknown[]).map((x) => item(uid, x, true))
      if (items.length + loose.length > COURSE_ITEMS_MAX) throw fail(413, 'too many items')
      if (new Set([...items, ...loose].map((x) => x.id)).size !== items.length + loose.length) throw fail(400, 'duplicate item id')
      // Стикеры-заметки на холсте (как в FigJam)
      const notes = (Array.isArray(b.notes) ? b.notes : []).slice(0, NOTES_MAX).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>
        if (!ID.test(String(r.id))) throw fail(400, 'bad note')
        const n: Record<string, unknown> = { id: String(r.id), x: num(r.x), y: num(r.y), text: str(r.text, 1000), color: NOTE_COLORS.includes(String(r.color)) ? String(r.color) : '#ffe99a' }
        // как в FigJam: кто поставил, размер и шрифт текста, жирный / зачёркнутый / список, скрыть подпись
        put(n, 'by', str(r.by, 60)); if (r.sz === 'm' || r.sz === 'l') n.sz = r.sz; if (r.font === 'hand') n.font = 'hand'
        for (const k of ['b', 'st', 'list', 'nob']) if (r[k] === true) n[k] = true
        return n
      })
      // Рисунки маркером: цвет #rrggbb, толщина 1–20, до 4000 чисел (2000 точек) в штрихе
      const ink = (Array.isArray(b.ink) ? b.ink : []).slice(0, INK_MAX).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>
        if (!ID.test(String(r.id))) throw fail(400, 'bad ink')
        const p = (Array.isArray(r.p) ? r.p : []).slice(0, INK_POINTS).map(num)
        return { id: String(r.id), c: /^#[0-9a-f]{6}$/i.test(String(r.c)) ? String(r.c) : '#1e1e1e', w: Math.max(1, Math.min(20, num(r.w) || 4)), p: p.length % 2 ? p.slice(0, -1) : p }
      })
      // Свои упражнения из конструктора (меню «Exercise» → «Мои»): образец экрана, название, описание
      const templates = (Array.isArray(b.templates) ? b.templates : []).slice(0, TEMPLATES_MAX).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>
        if (!ID.test(String(r.id))) throw fail(400, 'bad template')
        return { id: String(r.id), t: str(r.t, 60) || 'Моё упражнение', d: str(r.d, 120), step: step(r.step) }
      })
      // настройки упражнений курса: те же поля и проверки, что у экрана этого шаблона; вопрос, эталон, файлы — не берём
      const presets: Record<string, Record<string, unknown>> = {}
      const bp = b.presets
      // 24.11.2026: и пресеты типа — «talkexam-1» … «talkexam-99»: те же поля + имя (name); не больше 20 на тип
      const nOf = (k: string) => { const m = /^(.+)-([1-9]\d?)$/.exec(k); return m && PRESET_TPLS[m[1]] ? { tpl: m[1], n: +m[2] } : PRESET_TPLS[k] ? { tpl: k, n: 0 } : null }
      const per: Record<string, number> = {}
      if (bp && typeof bp === 'object' && !Array.isArray(bp)) for (const [key, raw] of Object.entries(bp as Record<string, unknown>)) {
        const kn = nOf(key); if (!kn) continue
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        if (kn.n && (per[kn.tpl] = (per[kn.tpl] ?? 0) + 1) > 20) continue
        const o: Record<string, unknown> = { ...step({ ...(raw as object), ...PRESET_TPLS[kn.tpl], id: 'preset' }) }
        for (const k of PRESET_DROP) delete o[k]
        if (kn.n) { const nm = str((raw as any).name, 60).trim(); if (nm) o.name = nm }
        if (Object.keys(o).length || kn.n) presets[key] = o
      }
      // свои превью плиток меню (25.11.2026): id шаблона → ключ картинки в хранилище; не больше 300
      const thumbs: Record<string, string> = {}
      if (b.thumbs && typeof b.thumbs === 'object' && !Array.isArray(b.thumbs)) for (const [k, v] of Object.entries(b.thumbs as Record<string, unknown>).slice(0, 300)) {
        if (/^[A-Za-z0-9_-]{1,60}$/.test(k) && typeof v === 'string' && v.length <= 600 && (isOurKey(v) || isMediaUrl(v))) thumbs[k] = v
      }
      const ref = col().doc(id), s = await ref.get()
      if (!s.exists && (await col().get()).size >= COURSES_MAX) throw fail(413, 'too many courses')
      const tasks = items.filter((x) => x.type !== 'unit').length
      const doc = { updatedBy: uid, title: str(b.title, 120) || 'Без названия', mode: b.mode === 'line' ? 'line' : 'wave',
        progress: Math.max(0, Math.min(tasks, num(b.progress))), items, loose, notes, ink, templates, presets, thumbs, updatedAt: FieldValue.serverTimestamp() }
      // 24.11.2026: курс уже есть — update, а не set({ merge: true }): merge сливает вложенные поля (presets), и удалённый пресет
      // или сброшенная настройка возвращались из базы. update меняет поле целиком; teacherId, createdAt, assigned не трогает
      if (s.exists) await ref.update(doc)
      else await ref.set({ ...doc, teacherId: uid, createdAt: FieldValue.serverTimestamp() })
      return { id, ok: true }
    },
    /** Файлы, которые нужны другим курсам (экран скопировали из курса в курс — файл общий): при удалении курса их не трогаем */
    async filesElsewhere(exceptId: string) {
      const docs = (await col().get()).docs.filter((d) => d.id !== exceptId)
      return new Set(docs.flatMap((d) => { const c = pub(d.id, d.data()); return this.filesOf(c) }))
    },
    /** Картинка на иконке курса (вкладка «Курсы», 25.11.2026): ключ файла в хранилище или пусто — убрать. Сохранение курса из редактора её не трогает (update только своих полей) */
    async setCover(rawId: unknown, raw: unknown) {
      const id = checkId(rawId); await found(id)
      const v = (raw as { cover?: unknown } | null)?.cover
      if (v == null || v === '') { await col().doc(id).update({ cover: '' }); return { ok: true } }          // пустая строка = без картинки (pub её не отдаёт)
      if (typeof v !== 'string' || v.length > 600 || !(isOurKey(v) || isMediaUrl(v))) throw fail(400, 'bad cover')
      await col().doc(id).update({ cover: v }); return { ok: true }
    },
    async remove(rawId: unknown) { const id = checkId(rawId); await found(id); await col().doc(id).delete() },
    /** Ключи файлов курса (кружки, фото, файлы экранов уроков) — чтобы после удаления курса почистить хранилище */
    filesOf: (c: Pick<Course, 'items' | 'loose'> & { thumbs?: Record<string, string>; cover?: string }) => [...c.items, ...c.loose].flatMap((x) => [x.file, ...(x.steps ?? []).flatMap((s) =>
      [s.image, s.audio, s.video, s.exAudio, ...((s.opts as Record<string, unknown>[] | undefined) ?? []).flatMap((o) => [o.image, o.audio])])]).concat(Object.values(c.thumbs ?? {}), c.cover ? [c.cover] : [])
      .filter((k): k is string => typeof k === 'string' && isOurKey(k)),
  }
}

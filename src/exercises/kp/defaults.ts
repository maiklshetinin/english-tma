// «Ответ по смыслу» (kind: 'kp'): ВСЁ, что уходит в модели и в чат, — из JSON экрана, с умолчаниями здесь (20.11.2026; 21.11.2026 — без
// скрытых текстов в коде: что видно на вкладке JSON «{ }», то и уходит, ни слова сверху).
// kpCfg(step) — действующие настройки (свои поля экрана поверх умолчаний); kpShown — что из них показать у этой формы;
// kpFields(raw) — из JSON оставить только отличия от умолчаний (их и храним в экране и на сервере).
// У моста (чат) и у «· Gemini API» свои умолчания message и format — правятся независимо:
//   мост: в чат уходит prompt + message + format (в format обязательно {id} — по нему мост находит ответ в чате), склеивает сервер;
//   Gemini API: systemInstruction = prompt + format, сообщение = message; голосом — prompt + livePrompt, message + liveAsk, функция liveTool.
// 21.11.2026: + настройки упражнения в курсе (src/exercises/presets.ts, «{ }» на плитке меню): код ← курс ← экран.
// В шаблонах: {question} — вопрос, {reference} — эталон без разметки, {answer} — ответ ученика, {score} — процент, {missed} — чего не прозвучало,
// {id} — метка задания (только format моста), {lang} — язык словами (sttPrompt).

import { same as sameV } from '../../utils/overlay'
import { presetFor } from '../presets'

export const PASS = 60                                    // зачёт — от 60 % (рекомендация курса: 60–70 % «идеального» ответа — уже хорошо)
/** Промпт по умолчанию — тот же текст, что SYSTEM в server/ai.ts */
// 23.11.2026: тема и язык — метками {topic}, {lang}, {langHow}: подставляются перед отправкой (kpReady) из topic и lang JSON экрана / курса
export const TOPIC = 'подготовка к собеседованию на Карту поляка'
export const SYSTEM = 'Ты проверяешь устный ответ ученика на вопрос ({topic}, {lang} язык). '
  + 'Оценивай ответ по смыслу относительно эталона, а не по буквальному совпадению слов. Засчитывай синонимы, перефразирование и иной порядок слов, если смысл сохранён. '
  + 'Ответ надиктован — не снижай оценку за мелкие ошибки распознавания речи. Эталон намеренно полный: 60–70 % его смысла — уже хороший ответ. '
  + 'score — целое 0–100 (полнота передачи смысла эталона); missed_points — короткие пункты на русском только о важных фактах эталона, которые не прозвучали (всё ключевое есть — пустой массив); '
  + 'feedback — одно короткое предложение на русском: по смыслу или по языку ответа ({lang}), доброжелательно.'

export type KpLang = 'pl-PL' | 'en-US' | 'en-GB' | 'es-ES'
export const LANGS: KpLang[] = ['pl-PL', 'en-US', 'en-GB', 'es-ES']
const LANG_RU: Record<KpLang, string> = { 'pl-PL': 'польский', 'en-US': 'английский', 'en-GB': 'английский', 'es-ES': 'испанский' }
const LANG_HOW: Record<KpLang, string> = { 'pl-PL': 'по-польски', 'en-US': 'по-английски', 'en-GB': 'по-английски', 'es-ES': 'по-испански' }

export interface KpCfg {
  prompt: string; pass: number; lang: KpLang; message: string; format: string
  topic: string          // тема — в промптах меткой {topic} (по умолчанию — собеседование на Карту поляка); 23.11.2026
  dicModel: string          // «Надиктовать с Gemini» (потоком): auto — свежая …transcribe-live ключа; модель Live API; browser — распознавание браузера (23.11.2026)
  model: string; temperature: number | null; thinking: boolean
  request: Record<string, any>          // свои поля запросов в API поверх собранных: check, liveCheck, discuss, dictation, stt (utils/overlay.js; 24.11.2026)
  livePrompt: string; liveAsk: string; liveMore: string; liveTool: string; liveModel: string; voice: string
  discussPrompt: string; discussOpener: string; discussNone: string
  sttPrompt: string; sttAsk: string
  ballPrompt: string; ballTool: string          // «· шар Live» (25.11.2026): системная инструкция Live-сессии шара и описание её функции cover
}

/** Мост (чат): сервер склеит prompt + message + format, {id} — его метка задания */
export const CHAT = {
  message: 'Это отдельная проверка: прошлые сообщения этого чата не учитывай.\n\nВопрос: {question}\nЭталон: {reference}\nОтвет ученика: {answer}',
  format: 'Ответь ТОЛЬКО одним JSON-объектом без пояснений. Первое поле — id со значением {id}, затем score, missed_points, feedback. ' +
    'Пример формы: {"id": "…", "score": 70, "missed_points": ["…"], "feedback": "…"}',
}
/** Gemini API */
export const DEF = {
  model: 'auto',          // 'auto' — самая свежая Flash Lite ключа; 'live' — проверка голосовой Live-моделью
  format: 'Ответь только JSON: {"score": число 0–100, "missed_points": ["…"], "feedback": "…"}.',
  message: 'Вопрос:\n{question}\n\nЭталон:\n{reference}\n\nОтвет ученика:\n{answer}',
  temperature: null as number | null,
  thinking: false,          // false — размышления выключены (3.x — thinkingLevel minimal, 2.x — thinkingBudget 0): проверка быстрее
  livePrompt: 'Ты проверяешь ответ голосом. Порядок строго такой: 1) СРАЗУ, ничего не говоря, вызови функцию submit_grade. ' +
    '2) Потом скажи {langHow} 1–2 коротких предложения: что хорошо и чего не хватило. 3) Замолчи и жди. ' +
    'Если ученик попросит подробнее — разбери ответ подробно {langHow} (простым языком), задай один наводящий вопрос и попроси ответить ещё раз. ' +
    'Ученик говорит {langHow} с акцентом — это {lang} язык; если он попросит по-русски — можно коротко пояснить по-русски.',
  liveAsk: 'Oceń moją odpowiedź.',
  liveMore: 'Proszę omówić moją odpowiedź szczegółowo.',
  liveTool: 'Выставить оценку ответа ученика (обязательно, до любых слов). score — 0–100: полнота передачи смысла эталона; ' +
    'missed_points — важные факты эталона, которых нет в ответе, коротко по-русски; feedback — одно короткое предложение по-русски.',
  liveModel: 'auto',          // какая Live-модель проверяет голосом и ведёт разбор; 'auto' — самая свежая у ключа
  voice: 'Kore',
  discussPrompt: 'Jesteś życzliwym nauczycielem polskiego. Uczeń przygotowuje się do rozmowy na Kartę Polaka. Mów po polsku, prosto i niezbyt szybko; ' +
    'jeśli uczeń poprosi po rosyjsku — możesz krótko wyjaśnić po rosyjsku. Rozmówca mówi po polsku z akcentem — to nadal polski.\n' +
    'Pytanie: {question}\nWzorcowa odpowiedź: {reference}\nOdpowiedź ucznia: {answer}\n' +
    'Ocena: {score}%. Czego zabrakło: {missed}.\n' +
    'Najpierw w 2–3 zdaniach powiedz, co było dobrze i czego zabrakło. Potem zadaj jedno pytanie pomocnicze i poproś, żeby uczeń odpowiedział jeszcze raz, pełniej. ' +
    'Po jego odpowiedzi krótko ją oceń i, jeśli trzeba, popraw błędy językowe jednym zdaniem.',
  discussOpener: 'Proszę omówić moją odpowiedź.',
  discussNone: 'nic ważnego',          // {missed}, когда ничего не упущено
}
/** «Целым аудио» (dic: "file"): расшифровка записи моделью Flash Lite */
export const STT = {
  sttPrompt: 'Ты — стенографист. Запиши дословно, что говорит человек на записи ({lang} язык). ' +
    'Не исправляй ошибки в грамматике и словах, ничего не добавляй и не пересказывай, без комментариев и кавычек; знаки препинания — обычные. ' +
    'Ответь только текстом расшифровки. Речи не слышно — ответь пустой строкой.',
  sttAsk: 'Расшифруй запись.',
}
/** «Ответ по смыслу · шар Live» (ballLive, 25.11.2026): одна Live-сессия на экран. Модель знает эталон и после каждой реплики (выключили
 *  микрофон) вызывает cover — какие куски эталона ученик передал (ref дословно, said — что сказал). Процент и «не прозвучало» считает
 *  фронт (utils/kpball.js, refCover) — модель их не считает. {question}, {reference} — вопрос и эталон, {topic}, {lang}, {langHow} — как везде */
export const BALL = {
  ballPrompt: 'Ты — молчаливый помощник в устном упражнении ({topic}, {lang} язык). Ты НИЧЕГО не говоришь и не пишешь ученику: ' +
    'весь твой ответ — только вызов функции, его читает приложение.\n\nВопрос: {question}\n\nЭталонный ответ:\n{reference}\n\n' +
    'Ученик отвечает устно частями, как по рации: включает микрофон, говорит, выключает — реплика кончилась; потом может включить и добавить ещё. ' +
    'Ты слышишь его сам. СРАЗУ после каждой реплики сверь сказанное с эталоном и вызови функцию cover: ' +
    'found — что из эталона ученик передал в этой реплике впервые. Для каждого: ref — кусок эталона, скопированный ДОСЛОВНО, слово в слово, как написан в эталоне ' +
    '(одна мысль, 3–12 слов; если ученик передал всё предложение — всё предложение); said — что сказал ученик (2–8 слов, как услышал). ' +
    'Засчитывай по смыслу: синонимы, другие слова, порядок, грамматические ошибки и оговорки не мешают; о чём не сказано — не засчитывай. ' +
    'Уже найденное в прошлых репликах не повторяй. Нового нет — всё равно вызови cover с пустым found: приложение ждёт ответ. ' +
    'Отвечай мгновенно, одним вызовом; проценты не считай, ошибки не разбирай, не говори и не пиши ничего, кроме вызова функции.',
  ballTool: 'Какие куски эталона (дословно) ученик передал в последней реплике',
}
/** «Шар Live · новый вид» (kpballive2, 25.11.2026) — промпт, который автор отладил на пресете: + условие «не дописывать хвост предложения» */
export const BALL2 = {
  ballPrompt: 'Ты — молчаливый помощник в устном упражнении ({topic}, {lang} язык). Ты НИЧЕГО не говоришь и не пишешь ученику: весь твой ответ — только вызов функции, его читает приложение.\n\n' +
    'Вопрос: {question}\n\nЭталонный ответ:\n{reference}\n\n' +
    'Ученик отвечает устно частями, как по рации: включает микрофон, говорит, выключает — реплика кончилась; потом может включить и добавить ещё. Ты слышишь его сам. ' +
    'СРАЗУ после каждой реплики сверь сказанное с эталоном и вызови функцию cover: found — что из эталона ученик передал в этой реплике впервые. ' +
    'Для каждого: ref — кусок эталона, скопированный ДОСЛОВНО, слово в слово, как написан в эталоне (одна мысль, 3–12 слов; если ученик передал всё предложение — всё предложение); ' +
    'said — что сказал ученик (2–8 слов, как услышал). ' +
    'Не дописывай ref до конца предложения: если ученик остановился раньше и последнюю часть фразы не сказал ни так, ни своими словами, ref заканчивается там, где закончилась его мысль; ' +
    'то, что он передал своими словами, остаётся в ref. ' +
    'Засчитывай по смыслу: синонимы, другие слова, порядок, грамматические ошибки и оговорки не мешают; о чём не сказано — не засчитывай. ' +
    'Уже найденное в прошлых репликах не повторяй. Нового нет — всё равно вызови cover с пустым found: приложение ждёт ответ. ' +
    'Отвечай мгновенно, одним вызовом; проценты не считай, ошибки не разбирай, не говори и не пиши ничего, кроме вызова функции.',
  ballTool: BALL.ballTool,
}
/** «Шар Live · разбор ошибок» (kpballfix, 25.11.2026, тест) — промпт BALL2 почти без изменений: said — дословно со всеми ошибками, + fix — как правильно */
export const BALL3 = {
  ballPrompt: BALL2.ballPrompt
    .replace("said — что сказал ученик (2–8 слов, как услышал). ", "said — что сказал ученик по этому куску, ДОСЛОВНО как услышал, со всеми его ошибками (2–12 слов); " +
      "fix — та же фраза ученика, но исправленная: падежи, окончания, предлоги, род, вид глагола, порядок слов — меняй только ошибочные слова, остальное оставь его словами; ошибок нет — fix такой же, как said. ")
    .replace("проценты не считай, ошибки не разбирай, не говори", "проценты не считай, не говори"),
  ballTool: 'Какие куски эталона (дословно) ученик передал в последней реплике; said — как сказал ученик, fix — как правильно',
}
const BALL_TEXTS = ['ballPrompt', 'ballTool'] as const
const API_TEXTS = ['livePrompt', 'liveAsk', 'liveMore', 'liveTool', 'discussPrompt', 'discussOpener', 'discussNone'] as const
const STT_TEXTS = ['sttPrompt', 'sttAsk'] as const

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '')
const same = (a: string, b: string) => a.trim() === b.trim()
const okPass = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 100
const okTemp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2
const okModel = (v: unknown) => typeof v === 'string' && /^[a-z0-9.-]{3,80}$/.test(v.trim())
/** модель диктовки: auto, browser или имя модели */
export const DIC_AUTO = 'auto'

/** «Gemini API» у экрана (engine 'api'; старое 'live' идёт так же) — у него есть модель и все промпты, у моста — prompt, message, format */
export const kpApi = (s: any) => s?.engine === 'api' || s?.engine === 'live'
/** запись «целым аудио» — у экрана есть sttPrompt и sttAsk */
export const kpFile = (s: any) => s?.dic === 'file'
/** умолчания message и format у этой формы: мост — чат, иначе Gemini API */
const base = (s: any) => (kpApi(s) ? { message: DEF.message, format: DEF.format } : CHAT)
/** format моста без {id} мост не разберёт — такой не принимаем */
const okFormat = (s: any, v: string) => kpApi(s) || v.includes('{id}')

/** Умолчания кода, свои поля поверх (без настроек курса) */
/** текстовые поля: свои у экрана — как есть, даже пустые (стёрли в JSON — значит пусто, умолчание не подставляем; 21.11.2026) */
export const KP_TEXTS = ['prompt', 'message', 'format', ...API_TEXTS, ...STT_TEXTS, ...BALL_TEXTS] as const
/** «· шар Live» — у экрана есть ballPrompt и ballTool */
export const kpBallLive = (s: any) => s?.ballLive === true
const own = (s: any, k: string) => (typeof s?.[k] === 'string' ? (s[k] as string) : undefined)
function kpCode(s: any): KpCfg {
  const b = base(s), f = own(s, 'format')
  const o: any = {
    prompt: own(s, 'prompt')?.trim() ?? SYSTEM, pass: okPass(s?.pass) ? s.pass : PASS, lang: 'pl-PL',          /* 24.11.2026: Ответ по смыслу — тип Карты поляка, язык только польский */ topic: own(s, 'topic')?.trim() || TOPIC,
    dicModel: okModel(s?.dicModel) ? s.dicModel.trim() : DIC_AUTO,
    message: own(s, 'message') ?? b.message, format: f !== undefined && okFormat(s, f) ? f : b.format,
    model: okModel(s?.model) ? s.model.trim() : DEF.model, temperature: okTemp(s?.temperature) ? s.temperature : DEF.temperature, thinking: s?.thinking === true,
    request: s?.request && typeof s.request === 'object' && !Array.isArray(s.request) ? s.request : {},
    liveModel: okModel(s?.liveModel) ? s.liveModel.trim() : DEF.liveModel, voice: typeof s?.voice === 'string' && /^[A-Za-z]{2,20}$/.test(s.voice) ? s.voice : DEF.voice,
  }
  for (const k of API_TEXTS) o[k] = own(s, k) ?? DEF[k]
  for (const k of STT_TEXTS) o[k] = own(s, k) ?? STT[k]
  for (const k of BALL_TEXTS) o[k] = own(s, k) ?? (s?.ballFix === true ? BALL3 : s?.ballV2 === true || s?.ballText === true ? BALL2 : BALL)[k]          // новый вид — свой отлаженный промпт
  return o
}
/** шаблон экрана — по нему настройки курса (presets) */
export const kpTpl = (s: any) => (s?.ballLive === true ? (s?.ballText === true ? (s?.ballSess === true ? 'kpballsess' : 'kpballtext') : s?.ballFix === true ? 'kpballfix' : s?.ballV2 === true ? 'kpballive2' : 'kpballive') : kpApi(s) ? 'kpapi' : kpFile(s) ? 'kpfile' : 'kp')          // шар Live — свои настройки курса (25.11.2026)
/** Действующие настройки экрана: умолчания кода ← настройки упражнения в курсе ← свои поля экрана */
export function kpCfg(s: any): KpCfg {
  const mine: any = {}
  for (const [k, v] of Object.entries(s ?? {})) if (v !== undefined && v !== null) mine[k] = v
  return kpCode({ ...presetFor(kpTpl(s), s?.pv), ...mine })          // pv — пресет типа (kp-2), 24.11.2026
}

/** Что показывать в JSON экрана — ровно то, что уходит у этой формы: мост — prompt, message, format; Gemini API — всё; «целым аудио» — + sttPrompt, sttAsk */
export function kpShown(s: any): Partial<KpCfg> {
  const c = kpCfg(s)
  const o: any = kpApi(s) ? { ...c } : { prompt: c.prompt, message: c.message, format: c.format, pass: c.pass, lang: c.lang, topic: c.topic, dicModel: c.dicModel, request: c.request }
  for (const k of STT_TEXTS) { if (kpFile(s)) o[k] = c[k]; else delete o[k] }
  for (const k of BALL_TEXTS) delete o[k]
  if (kpBallLive(s)) return { ballPrompt: c.ballPrompt, ballTool: c.ballTool, pass: c.pass, topic: c.topic, request: c.request }          // шар Live: мост, проверка и диктовка не участвуют — только его промпт
  delete o.lang          // 24.11.2026: язык — польский, зашит в тип (pl-kp); в JSON его нет
  if (kpFile(s)) delete o.dicModel          // «целым аудио» распознаёт Flash Lite файлом — потоковая модель ему не нужна
  return o
}

const API_ONLY = ['temperature', 'thinking', 'liveModel', 'voice', ...API_TEXTS] as const
const eq = sameV
/** Поля экрана из JSON: только отличия от действующих умолчаний этой формы (код ← курс) и только верного вида. Форму (engine, dic) — из того же JSON */
export function kpFields(raw: any): Partial<KpCfg> {
  const o: any = {}
  if (!raw || typeof raw !== 'object') return o
  const form = { engine: raw.engine, dic: raw.dic, ballLive: raw.ballLive, ballV2: raw.ballV2, ballFix: raw.ballFix, ballText: raw.ballText, ballSess: raw.ballSess }
  const x: any = kpCode({ ...form, ...raw }), d: any = kpCfg(form)          // x — значения JSON (неверные — умолчания кода), d — что было бы без своих полей
  for (const k of Object.keys(x)) {
    if (raw[k] === undefined) continue
    if (!kpApi(raw) && (API_ONLY as readonly string[]).includes(k)) continue
    if (!kpFile(raw) && (STT_TEXTS as readonly string[]).includes(k)) continue
    if (!kpBallLive(raw) && (BALL_TEXTS as readonly string[]).includes(k)) continue
    if (k === 'temperature' && raw.temperature === null && d.temperature === null) continue
    if (!eq(x[k], d[k])) o[k] = x[k]
  }
  return o
}

/** {lang} в sttPrompt — язык словами */
export const langRu = (l: string) => LANG_RU[l as KpLang] ?? 'польский'
/** «по-польски», «по-испански»… — для подсказок на экране */
export const langHow = (l: string) => LANG_HOW[l as KpLang] ?? 'по-польски'

/** Подставить {question}, {reference}, {answer}, {score}, {missed} в шаблон */
export const fill = (t: string, v: Record<string, unknown>) => t.replace(/\{(question|reference|answer|score|missed|id|lang|langHow|topic)\}/g, (m, k) => (k in v ? String(v[k] ?? '') : m))
/** Перед отправкой в модель (23.11.2026): во всех текстах настроек — {lang} (польский…), {langHow} (по-польски…), {topic} — из lang и topic.
 *  Остальные метки ({question}, {answer}, {id}…) не трогаем — их подставляют дальше */
export function kpReady(c: KpCfg): KpCfg {
  const v = { lang: langRu(c.lang), langHow: LANG_HOW[c.lang] ?? 'по-польски', topic: c.topic || TOPIC }
  const o: any = { ...c }
  for (const [k, x] of Object.entries(o)) if (typeof x === 'string' && k !== 'lang' && k !== 'topic') o[k] = fill(x, v)
  return o
}

/** умолчания кода для формы (без настроек курса) — от них считаются отличия настроек упражнения курса (presetJson.ts) */
export const kpDefaults = (form: any): KpCfg => kpCode(form)

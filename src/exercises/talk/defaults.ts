// «Разговор с Gemini» (kind: 'talk'): всё, что уходит в Live-модель, и умолчания (20.11.2026).
// Язык — из JSON экрана (lang): pl-PL (умолчание), en-US или en-GB (21.11.2026). От языка зависят умолчания роли, «замка» и первой
// реплики, подпись-замок на экране (PL / EN) и то, на каком языке просим Gemini ответить, если она съехала на другой.
// talkCfg(step) — действующие настройки (свои поля экрана поверх умолчаний): их показывает JSON экрана (кнопка «{ }»), по ним идёт разговор.
// talkFields(raw) — из JSON оставить только отличия от умолчаний (их и храним в экране и на сервере).

export type EndSens = 'low' | 'high'
export interface TalkCfg {
  lang: Lang; prompt: string; lock: string; opener: string; voice: string; model: string
  silenceMs: number; endSens: EndSens; temperature: number | null; noiseSuppression: boolean
  guard: string; evalPrompt: string; evalAsk: string
  request: Record<string, any>          // свои поля запросов в API поверх собранных: live, transcribe, eval (utils/overlay.js; 24.11.2026)          // 21.11.2026: просьба вернуться к языку, промпт и сообщение «Оценивать речь» — тоже из JSON
}

import { same as sameV } from '../../utils/overlay'
import { presetFor } from '../presets'

export const LANG = 'pl-PL' as const          // язык по умолчанию; явно уходит в Live-модель: speechConfig.languageCode и inputAudioTranscription.languageCodes

export const DEF_PROMPT = 'Jesteś konsulem RP. Prowadzisz rozmowę kwalifikacyjną na Kartę Polaka. Mówisz tylko po polsku, spokojnie i życzliwie. ' +
  'Zadajesz po jednym pytaniu: o historię Polski, tradycje i święta, kulturę, geografię, o polskie korzenie i rodzinę rozmówcy. ' +
  'Czekasz na odpowiedź. Jeśli odpowiedź jest niepełna — dopytaj. Jeśli rozmówca robi błąd językowy — delikatnie popraw jednym zdaniem i idź dalej. ' +
  'Po 8–10 pytaniach podziękuj i krótko oceń rozmowę: co było dobrze, co poćwiczyć.'
// «замок» языка — перед ролью: расшифровка и голос закреплены, а модель иначе сама угадывает язык и с акцентом «слышит» русский
export const LOCK = 'WAŻNE: Rozmówca mówi wyłącznie po polsku, często z rosyjskim lub ukraińskim akcentem i z błędami — to nadal jest polski. Zawsze rozumiej jego wypowiedzi jako polskie i odpowiadaj tylko po polsku. Nie przechodź na inny język.'
// первая реплика (уходит модели текстом, чтобы она заговорила первой)
export const OPENER = 'Dzień dobry. Proszę zacząć rozmowę.'

// английский: умолчания на случай, если в JSON только lang: "en-US" — без своей роли
export const EN_PROMPT = 'You are a friendly native speaker having a casual everyday conversation in English. Speak only in English, naturally and warmly. ' +
  'Ask one short question at a time about everyday life: plans, food, hobbies, work or studies, travel. Wait for the answer. If something is unclear — ask a quick follow-up. ' +
  'If the user makes a noticeable mistake — gently correct it in one short sentence and keep the conversation going. After 8–10 exchanges, thank them and give brief feedback: what was good, what to practise.'
export const EN_LOCK = 'IMPORTANT: The user speaks exclusively in English, often with a Russian or Ukrainian accent and with mistakes — it is still English. Always understand their speech as English and reply only in English. Do not switch to another language.'
export const EN_OPENER = 'Hi! Please start the conversation.'
// испанский (23.11.2026): те же три текста, что у английского
export const ES_PROMPT = 'Eres un hablante nativo amable que mantiene una conversación cotidiana e informal en español. Habla solo en español, con naturalidad y calidez. ' +
  'Haz una sola pregunta corta cada vez sobre la vida diaria: planes, comida, aficiones, trabajo o estudios, viajes. Espera la respuesta. Si algo no queda claro, haz una pregunta breve. ' +
  'Si el usuario comete un error notable, corrígelo con amabilidad en una frase corta y sigue la conversación. Después de 8–10 intercambios, dale las gracias y una breve valoración: qué estuvo bien y qué practicar.'
export const ES_LOCK = 'IMPORTANTE: El usuario habla exclusivamente en español, a menudo con acento ruso o ucraniano y con errores: sigue siendo español. Entiende siempre lo que dice como español y responde solo en español. No cambies a otro idioma.'
export const ES_OPENER = '¡Hola! Empieza la conversación, por favor.'

/** Языки разговора: код на замке, как сказать по-русски, просьба к Gemini вернуться к языку, умолчания роли / замка / первой реплики,
 *  «чужой язык» в ответе Gemini (2+ таких слова — просим вернуться) */
export const LANGS = {
  'pl-PL': { code: 'PL', ru: 'польский', how: 'по-польски', guard: 'Odpowiadaj wyłącznie po polsku.', prompt: '', lock: '', opener: '', alien: /\b(the|and|you|your|what|is|are|this|that|with)\b/gi },
  'en-US': { code: 'EN', ru: 'английский', how: 'по-английски', guard: 'Please reply only in English.', prompt: EN_PROMPT, lock: EN_LOCK, opener: EN_OPENER, alien: /[ąćęłńśźż]|\b(jest|nie|się|tak|czy|dzień|proszę|dobrze)\b/gi },
  'en-GB': { code: 'EN', ru: 'английский (британский)', how: 'по-английски', guard: 'Please reply only in English.', prompt: EN_PROMPT, lock: EN_LOCK, opener: EN_OPENER, alien: /[ąćęłńśźż]|\b(jest|nie|się|tak|czy|dzień|proszę|dobrze)\b/gi },
  'es-ES': { code: 'ES', ru: 'испанский', how: 'по-испански', guard: 'Responde solo en español.', prompt: ES_PROMPT, lock: ES_LOCK, opener: ES_OPENER, alien: /[ąćęłńśźż]|\b(the|and|you|your|what|are|this|that|with|jest|nie|się|tak)\b/gi },
}
export type Lang = keyof typeof LANGS
export const langOf = (v: unknown): Lang => (typeof v === 'string' && v in LANGS ? v as Lang : LANG)
/** умолчания текста для языка (польские — ниже, у них свои константы) */
// «Собеседование · рация» (24.11.2026): консул спрашивает ОДИН вопрос из домашки и сверяет с эталоном — у экрана только вопрос (text),
// эталон (ideal) и звезда (star); роль — общий шаблон с метками {question}, {reference}, {star} (правится на плитке курса для всех экранов)
export const EXAM_PROMPT = 'Jesteś konsulem RP. Prowadzisz rozmowę kwalifikacyjną na Kartę Polaka. Mówisz tylko po polsku, spokojnie i życzliwie. ' +
  'W tej rozmowie omawiasz tylko jedno pytanie: «{question}». Na początku zadaj to pytanie (możesz je lekko przeformułować) i czekaj na odpowiedź. ' +
  'Porównuj odpowiedź z wzorcową odpowiedzią poniżej: jeśli brakuje czegoś ważnego — dopytaj (najwyżej 2–3 pytania pomocnicze) albo krótko podpowiedz. ' +
  'Jeśli rozmówca robi błąd językowy — delikatnie popraw jednym zdaniem. {star}' +
  'Na koniec krótko oceń odpowiedź: co było dobrze, czego zabrakło — i powiedz, że można przejść do następnego pytania.\n\nWzorcowa odpowiedź:\n{reference}'
export const EXAM_STAR = 'To pytanie jest bardzo ważne — uczeń musi znać odpowiedź. '
const defsOf = (l: Lang) => (l === 'pl-PL' ? { prompt: DEF_PROMPT, lock: LOCK, opener: OPENER } : { prompt: LANGS[l].prompt, lock: LANGS[l].lock, opener: LANGS[l].opener })

/** «Оценивать речь» (после разговора — запись ученика в Flash Lite): промпт, {lang} — язык словами */
export const EVAL_PROMPT = 'Ты строгий, но доброжелательный экзаменатор по устной речи ({lang} язык), оцениваешь по шкале CEFR. ' +
  'Тебе дана ЗАПИСЬ голоса ученика и её автоматическая расшифровка. Слушай запись: беглость, паузы, темп, произношение и ударение оценивай по звуку, ' +
  'словарь, грамматику и связность — по сказанному. Расшифровка может содержать ошибки распознавания — не наказывай за них, если по звуку сказано верно. ' +
  'Описания уровней: A1 — отдельные заученные фразы; A2 — простые предложения о себе и быте, частые ошибки; B1 — связный рассказ об опыте и планах, ошибки не мешают пониманию; ' +
  'B2 — развёрнутые аргументированные ответы, разнообразный словарь, редкие ошибки; C1 — свободно, точно, гибко. Не завышай: модели склонны льстить — оценивай как на экзамене. ' +
  'Акцент сам по себе не снижает оценку, если речь понятна носителю. ' +
  'ЧТЕНИЕ: определи по звуку, читает ли ученик готовый текст или говорит заученное (ровный темп, интонация чтения, нет пауз на подбор слов, нет самоисправлений, книжная лексика, слишком гладко) — тогда read_aloud = true, ' +
  'read_reason — коротко по-русски, по каким признакам; и помни: при чтении уровень показывает сложность ТЕКСТА, а не разговорную речь — оценивай словарь и грамматику осторожно и снизь confidence. ' +
  'УВЕРЕННОСТЬ (confidence) будь честным: запись меньше 60 с — не выше 70; чтение или заученное — не выше 50; 85 и выше — только для длинной (2+ минуты) спонтанной речи. ' +
    'intelligibility — 0–100: насколько легко носитель поймёт речь (100 — без усилий). scores — 0–100 по каждому критерию. confidence — 0–100: насколько уверен в уровне (мало речи — низкая). ' +
  'mistakes — до 8 реальных ошибок: quote — ДОСЛОВНО фрагмент из расшифровки, fix — как правильно, why — коротко по-русски почему. Не выдумывай ошибок, которых нет. ' +
  'pronunciation_notes — до 4 замечаний по звукам/ударению (по-русски, с примерами слов). strengths — 2–3 сильные стороны, tips — 2–4 конкретных совета, summary — 1–2 предложения итога. Всё по-русски, кроме цитат и исправлений.'
/** «Оценивать речь»: сообщение рядом с записью, {context} — реплики Gemini, {transcript} — расшифровка речи ученика */
export const EVAL_ASK = 'Это фрагменты ДИАЛОГА: в записи — только голос ученика. Оценивай только ученика; реплики собеседника — для контекста (понимает ли ученик вопросы, отвечает ли по делу), цитаты — только из реплик ученика.\nРеплики собеседника:\n{context}\n\nРасшифровка речи ученика:\n{transcript}'

export const DEF = { voice: 'Kore', model: 'auto', silenceMs: 1200, endSens: 'low' as EndSens, temperature: null as number | null, noiseSuppression: false }
export const SILENCE_MIN = 200, SILENCE_MAX = 5000

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '')
const same = (a: string, b: string) => a.trim() === b.trim()
const okSilence = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= SILENCE_MIN && v <= SILENCE_MAX
const okTemp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2

/** Действующие настройки экрана: свои поля поверх умолчаний */
/** шаблон экрана — по нему настройки курса (presets): рация, с персонажем, обычный */
export const talkTpl = (s: any) => (s?.exam ? 'talkexam' : s?.ptt ? (s.vn ? 'talkvn' : s.busuu ? 'talkptt2' : 'talkptt') : s?.avatar ? 'talkava' : 'talk')
/** Действующие настройки: умолчания кода ← настройки упражнения в курсе (src/exercises/presets.ts) ← свои поля экрана */
export function talkCfg(s: any): TalkCfg {
  const own: any = {}
  for (const [k, v] of Object.entries(s ?? {})) if (v !== undefined && v !== null) own[k] = v
  return talkCode({ ...presetFor(talkTpl(s)), ...own })
}
/** текстовые поля: свои — как есть, даже пустые (стёрли в JSON — пусто, умолчание не подставляем; 21.11.2026) */
export const TALK_TEXTS = ['prompt', 'lock', 'opener', 'guard', 'evalPrompt', 'evalAsk'] as const
const ownT = (s: any, k: string) => (typeof s?.[k] === 'string' ? (s[k] as string) : undefined)
function talkCode(s: any): TalkCfg {
  const lang = langOf(s?.lang), d = defsOf(lang)
  return {
    lang,
    prompt: ownT(s, 'prompt')?.trim() ?? (s?.exam || txt(s?.ideal) ? EXAM_PROMPT : d.prompt),          // 24.11.2026: есть эталон у экрана — роль консула с вопросом и эталоном (как у собеседования), во всех разговорах
    lock: ownT(s, 'lock') ?? d.lock,
    opener: ownT(s, 'opener') ?? d.opener,
    voice: txt(s?.voice).trim() || DEF.voice,
    model: txt(s?.model).trim() || DEF.model,
    silenceMs: okSilence(s?.silenceMs) ? s.silenceMs : DEF.silenceMs,
    endSens: s?.endSens === 'high' ? 'high' : DEF.endSens,
    temperature: okTemp(s?.temperature) ? s.temperature : DEF.temperature,
    noiseSuppression: s?.noiseSuppression === true,
    guard: ownT(s, 'guard')?.trim() ?? LANGS[lang].guard,
    evalPrompt: ownT(s, 'evalPrompt') ?? EVAL_PROMPT,
    evalAsk: ownT(s, 'evalAsk') ?? EVAL_ASK,
    request: s?.request && typeof s.request === 'object' && !Array.isArray(s.request) ? s.request : {},
  }
}

/** Поля экрана из JSON: только отличия от умолчаний (и только верного вида) */
/** Поля экрана из JSON: только отличия от действующих умолчаний (код ← курс), только верного вида */
export function talkFields(raw: any): Partial<TalkCfg> {
  const o: any = {}
  if (!raw || typeof raw !== 'object') return o
  const form = { ptt: raw.ptt, avatar: raw.avatar, busuu: raw.busuu, vn: raw.vn, exam: raw.exam }
  const x: any = talkCode(raw), d0: any = talkCfg(form)
  const d: any = talkCfg({ ...form, lang: x.lang })          // умолчания роли / замка / реплики — для языка из JSON
  for (const k of Object.keys(x)) {
    if (raw[k] === undefined) continue
    if (k === 'temperature' && raw.temperature === null && d.temperature === null) continue
    const base = k === 'lang' ? d0.lang : d[k]
    if (!sameV(x[k], base)) o[k] = x[k]
  }
  return o
}

/** Роль целиком для Live-модели: замок языка + роль */
export const talkSystem = (c: Pick<TalkCfg, 'lock' | 'prompt'>) => [c.lock.trim(), c.prompt.trim()].filter(Boolean).join(' ')
/** эталон без разметки оформления (**жирный**, ==термин==, _курсив_, «• ») — так его видит модель (как kpPlain в utils/ai.js) */
const plainRef = (t: unknown) => String(t ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1').replace(/(^|[^\p{L}\d])_(.+?)_(?![\p{L}\d])/gu, '$1$2').replace(/^• /gm, '- ').trim()
/** Роль, которая уходит в Live-модель: замок + роль, метки {question}, {reference}, {star} — из экрана (собеседование; у остальных их нет) */
export const talkRole = (c: Pick<TalkCfg, 'lock' | 'prompt'>, s?: { text?: string; ideal?: string; star?: boolean } | null) =>
  talkSystem(c).replace(/\{(question|reference|star)\}/g, (_m, k) => (k === 'question' ? String(s?.text ?? '').trim() || '‹вопрос›' : k === 'reference' ? plainRef(s?.ideal) || '‹эталон›' : s?.star ? EXAM_STAR : ''))

/** умолчания кода для формы (без настроек курса) — от них считаются отличия настроек упражнения курса (presetJson.ts) */
export const talkDefaults = (form: any): TalkCfg => talkCode(form)

// «Разговор с Gemini» (kind: 'talk'): всё, что уходит в Live-модель, и умолчания (20.11.2026).
// talkCfg(step) — действующие настройки (свои поля экрана поверх умолчаний): их показывает JSON экрана (кнопка «{ }»), по ним идёт разговор.
// talkFields(raw) — из JSON оставить только отличия от умолчаний (их и храним в экране и на сервере).
// lock / opener, совпадающие с умолчанием ЛЮБОГО языка, — тоже умолчание: смена lang в JSON сама меняет замок и первую реплику.

export type TalkLang = 'pl-PL' | 'en-US' | 'es-ES'
export type EndSens = 'low' | 'high'
export interface TalkCfg {
  lang: TalkLang; prompt: string; lock: string; opener: string; voice: string; model: string
  silenceMs: number; endSens: EndSens; temperature: number | null; noiseSuppression: boolean
}

export const LANGS: Record<TalkLang, string> = { 'pl-PL': 'Польский', 'en-US': 'Английский', 'es-ES': 'Испанский' }
export const DEF_LANG: TalkLang = 'pl-PL'

export const DEF_PROMPT = 'Jesteś konsulem RP. Prowadzisz rozmowę kwalifikacyjną na Kartę Polaka. Mówisz tylko po polsku, spokojnie i życzliwie. ' +
  'Zadajesz po jednym pytaniu: o historię Polski, tradycje i święta, kulturę, geografię, o polskie korzenie i rodzinę rozmówcy. ' +
  'Czekasz na odpowiedź. Jeśli odpowiedź jest niepełna — dopytaj. Jeśli rozmówca robi błąd językowy — delikatnie popraw jednym zdaniem i idź dalej. ' +
  'Po 8–10 pytaniach podziękuj i krótko oceń rozmowę: co było dobrze, co poćwiczyć.'

// «замок» языка — перед ролью: расшифровка и голос закреплены, а модель иначе сама угадывает язык и с акцентом «слышит» русский
export const LOCK: Record<TalkLang, string> = {
  'pl-PL': 'WAŻNE: Rozmówca mówi wyłącznie po polsku, często z rosyjskim lub ukraińskim akcentem i z błędami — to nadal jest polski. Zawsze rozumiej jego wypowiedzi jako polskie i odpowiadaj tylko po polsku. Nie przechodź na inny język.',
  'en-US': 'IMPORTANT: The user speaks only English, often with a Russian accent and mistakes — it is still English. Always interpret the speech as English and answer only in English.',
  'es-ES': 'IMPORTANTE: El interlocutor habla solo en español, a menudo con acento ruso o ucraniano y con errores — sigue siendo español. Interpreta siempre sus palabras como español y responde solo en español. No cambies a otro idioma.',
}
// первая реплика (уходит модели текстом, чтобы она заговорила первой)
export const OPENER: Record<TalkLang, string> = {
  'pl-PL': 'Dzień dobry. Proszę zacząć rozmowę.',
  'en-US': 'Hello. Please start the conversation.',
  'es-ES': 'Buenos días. Por favor, empiece la conversación.',
}

export const DEF = { voice: 'Kore', model: 'auto', silenceMs: 1200, endSens: 'low' as EndSens, temperature: null as number | null, noiseSuppression: false }
export const SILENCE_MIN = 200, SILENCE_MAX = 5000

export const talkLang = (v: unknown): TalkLang => (typeof v === 'string' && v in LANGS ? (v as TalkLang) : DEF_LANG)
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '')
const isDefLock = (v: string) => Object.values(LOCK).some((x) => x.trim() === v.trim())
const isDefOpener = (v: string) => Object.values(OPENER).some((x) => x.trim() === v.trim())
const okSilence = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= SILENCE_MIN && v <= SILENCE_MAX
const okTemp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2

/** Действующие настройки экрана: свои поля поверх умолчаний */
export function talkCfg(s: any): TalkCfg {
  const lang = talkLang(s?.lang)
  const lock = txt(s?.lock), opener = txt(s?.opener)
  return {
    lang,
    prompt: txt(s?.prompt).trim() || DEF_PROMPT,
    lock: lock && !isDefLock(lock) ? lock : LOCK[lang],
    opener: opener && !isDefOpener(opener) ? opener : OPENER[lang],
    voice: txt(s?.voice).trim() || DEF.voice,
    model: txt(s?.model).trim() || DEF.model,
    silenceMs: okSilence(s?.silenceMs) ? s.silenceMs : DEF.silenceMs,
    endSens: s?.endSens === 'high' ? 'high' : DEF.endSens,
    temperature: okTemp(s?.temperature) ? s.temperature : DEF.temperature,
    noiseSuppression: s?.noiseSuppression === true,
  }
}

/** Поля экрана из JSON: только отличия от умолчаний (и только верного вида) */
export function talkFields(raw: any): Partial<TalkCfg> {
  const o: Partial<TalkCfg> = {}
  if (!raw || typeof raw !== 'object') return o
  const lang = talkLang(raw.lang)
  if (lang !== DEF_LANG) o.lang = lang
  const prompt = txt(raw.prompt).trim(); if (prompt && prompt !== DEF_PROMPT.trim()) o.prompt = raw.prompt
  const lock = txt(raw.lock); if (lock && !isDefLock(lock)) o.lock = lock
  const opener = txt(raw.opener); if (opener && !isDefOpener(opener)) o.opener = opener
  const voice = txt(raw.voice).trim(); if (voice && voice !== DEF.voice) o.voice = voice
  const model = txt(raw.model).trim(); if (model && model !== DEF.model) o.model = model
  if (okSilence(raw.silenceMs) && raw.silenceMs !== DEF.silenceMs) o.silenceMs = raw.silenceMs
  if (raw.endSens === 'high') o.endSens = 'high'
  if (okTemp(raw.temperature)) o.temperature = raw.temperature
  if (raw.noiseSuppression === true) o.noiseSuppression = true
  return o
}

/** Роль целиком для Live-модели: замок языка + роль */
export const talkSystem = (c: Pick<TalkCfg, 'lock' | 'prompt'>) => c.lock.trim() + ' ' + c.prompt.trim()

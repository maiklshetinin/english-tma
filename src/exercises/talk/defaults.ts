// «Разговор с Gemini» (kind: 'talk'): всё, что уходит в Live-модель, и умолчания (20.11.2026).
// Язык — из JSON экрана (lang): pl-PL (умолчание), en-US или en-GB (21.11.2026). От языка зависят умолчания роли, «замка» и первой
// реплики, подпись-замок на экране (PL / EN) и то, на каком языке просим Gemini ответить, если она съехала на другой.
// talkCfg(step) — действующие настройки (свои поля экрана поверх умолчаний): их показывает JSON экрана (кнопка «{ }»), по ним идёт разговор.
// talkFields(raw) — из JSON оставить только отличия от умолчаний (их и храним в экране и на сервере).

export type EndSens = 'low' | 'high'
export interface TalkCfg {
  lang: Lang; prompt: string; lock: string; opener: string; voice: string; model: string
  silenceMs: number; endSens: EndSens; temperature: number | null; noiseSuppression: boolean
}

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

/** Языки разговора: код на замке, как сказать по-русски, просьба к Gemini вернуться к языку, умолчания роли / замка / первой реплики,
 *  «чужой язык» в ответе Gemini (2+ таких слова — просим вернуться) */
export const LANGS = {
  'pl-PL': { code: 'PL', ru: 'польский', how: 'по-польски', guard: 'Odpowiadaj wyłącznie po polsku.', prompt: '', lock: '', opener: '', alien: /\b(the|and|you|your|what|is|are|this|that|with)\b/gi },
  'en-US': { code: 'EN', ru: 'английский', how: 'по-английски', guard: 'Please reply only in English.', prompt: EN_PROMPT, lock: EN_LOCK, opener: EN_OPENER, alien: /[ąćęłńśźż]|\b(jest|nie|się|tak|czy|dzień|proszę|dobrze)\b/gi },
  'en-GB': { code: 'EN', ru: 'английский (британский)', how: 'по-английски', guard: 'Please reply only in English.', prompt: EN_PROMPT, lock: EN_LOCK, opener: EN_OPENER, alien: /[ąćęłńśźż]|\b(jest|nie|się|tak|czy|dzień|proszę|dobrze)\b/gi },
}
export type Lang = keyof typeof LANGS
export const langOf = (v: unknown): Lang => (typeof v === 'string' && v in LANGS ? v as Lang : LANG)
/** умолчания текста для языка (польские — ниже, у них свои константы) */
const defsOf = (l: Lang) => (l === 'pl-PL' ? { prompt: DEF_PROMPT, lock: LOCK, opener: OPENER } : { prompt: LANGS[l].prompt, lock: LANGS[l].lock, opener: LANGS[l].opener })

export const DEF = { voice: 'Kore', model: 'auto', silenceMs: 1200, endSens: 'low' as EndSens, temperature: null as number | null, noiseSuppression: false }
export const SILENCE_MIN = 200, SILENCE_MAX = 5000

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '')
const same = (a: string, b: string) => a.trim() === b.trim()
const okSilence = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= SILENCE_MIN && v <= SILENCE_MAX
const okTemp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2

/** Действующие настройки экрана: свои поля поверх умолчаний */
export function talkCfg(s: any): TalkCfg {
  const lang = langOf(s?.lang), d = defsOf(lang)
  return {
    lang,
    prompt: txt(s?.prompt).trim() || d.prompt,
    lock: txt(s?.lock) || d.lock,
    opener: txt(s?.opener) || d.opener,
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
  const lang = langOf(raw.lang), d = defsOf(lang)
  if (lang !== LANG) o.lang = lang
  const prompt = txt(raw.prompt); if (prompt && !same(prompt, d.prompt)) o.prompt = prompt
  const lock = txt(raw.lock); if (lock && !same(lock, d.lock)) o.lock = lock
  const opener = txt(raw.opener); if (opener && !same(opener, d.opener)) o.opener = opener
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

// «Разговор с Gemini» (kind: 'talk'): всё, что уходит в Live-модель, и умолчания (20.11.2026). Только польский
// (английский и другие языки — потом, отдельной группой упражнений).
// talkCfg(step) — действующие настройки (свои поля экрана поверх умолчаний): их показывает JSON экрана (кнопка «{ }»), по ним идёт разговор.
// talkFields(raw) — из JSON оставить только отличия от умолчаний (их и храним в экране и на сервере).

export type EndSens = 'low' | 'high'
export interface TalkCfg {
  lang: typeof LANG; prompt: string; lock: string; opener: string; voice: string; model: string
  silenceMs: number; endSens: EndSens; temperature: number | null; noiseSuppression: boolean
}

export const LANG = 'pl-PL' as const          // язык явно уходит в Live-модель: speechConfig.languageCode и inputAudioTranscription.languageCodes (пока только польский)

export const DEF_PROMPT = 'Jesteś konsulem RP. Prowadzisz rozmowę kwalifikacyjną na Kartę Polaka. Mówisz tylko po polsku, spokojnie i życzliwie. ' +
  'Zadajesz po jednym pytaniu: o historię Polski, tradycje i święta, kulturę, geografię, o polskie korzenie i rodzinę rozmówcy. ' +
  'Czekasz na odpowiedź. Jeśli odpowiedź jest niepełna — dopytaj. Jeśli rozmówca robi błąd językowy — delikatnie popraw jednym zdaniem i idź dalej. ' +
  'Po 8–10 pytaniach podziękuj i krótko oceń rozmowę: co było dobrze, co poćwiczyć.'
// «замок» языка — перед ролью: расшифровка и голос закреплены, а модель иначе сама угадывает язык и с акцентом «слышит» русский
export const LOCK = 'WAŻNE: Rozmówca mówi wyłącznie po polsku, często z rosyjskim lub ukraińskim akcentem i z błędami — to nadal jest polski. Zawsze rozumiej jego wypowiedzi jako polskie i odpowiadaj tylko po polsku. Nie przechodź na inny język.'
// первая реплика (уходит модели текстом, чтобы она заговорила первой)
export const OPENER = 'Dzień dobry. Proszę zacząć rozmowę.'

export const DEF = { voice: 'Kore', model: 'auto', silenceMs: 1200, endSens: 'low' as EndSens, temperature: null as number | null, noiseSuppression: false }
export const SILENCE_MIN = 200, SILENCE_MAX = 5000

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '')
const same = (a: string, b: string) => a.trim() === b.trim()
const okSilence = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= SILENCE_MIN && v <= SILENCE_MAX
const okTemp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2

/** Действующие настройки экрана: свои поля поверх умолчаний */
export function talkCfg(s: any): TalkCfg {
  return {
    lang: LANG,
    prompt: txt(s?.prompt).trim() || DEF_PROMPT,
    lock: txt(s?.lock) || LOCK,
    opener: txt(s?.opener) || OPENER,
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
  const prompt = txt(raw.prompt); if (prompt && !same(prompt, DEF_PROMPT)) o.prompt = prompt
  const lock = txt(raw.lock); if (lock && !same(lock, LOCK)) o.lock = lock
  const opener = txt(raw.opener); if (opener && !same(opener, OPENER)) o.opener = opener
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

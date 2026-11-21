// «Ответ по смыслу» (kind: 'kp'): ВСЁ, что уходит в модели и в чат, — из JSON экрана, с умолчаниями здесь (20.11.2026; 21.11.2026 — без
// скрытых текстов в коде: что видно на вкладке JSON «{ }», то и уходит, ни слова сверху).
// kpCfg(step) — действующие настройки (свои поля экрана поверх умолчаний); kpShown — что из них показать у этой формы;
// kpFields(raw) — из JSON оставить только отличия от умолчаний (их и храним в экране и на сервере).
// У моста (чат) и у «· Gemini API» свои умолчания message и format — правятся независимо:
//   мост: в чат уходит prompt + message + format (в format обязательно {id} — по нему мост находит ответ в чате), склеивает сервер;
//   Gemini API: systemInstruction = prompt + format, сообщение = message; голосом — prompt + livePrompt, message + liveAsk, функция liveTool.
// В шаблонах: {question} — вопрос, {reference} — эталон без разметки, {answer} — ответ ученика, {score} — процент, {missed} — чего не прозвучало,
// {id} — метка задания (только format моста), {lang} — язык словами (sttPrompt).

export const PASS = 60                                    // зачёт — от 60 % (рекомендация курса: 60–70 % «идеального» ответа — уже хорошо)
/** Промпт по умолчанию — тот же текст, что SYSTEM в server/ai.ts */
export const SYSTEM = 'Ты проверяешь устный ответ ученика на вопрос (подготовка к собеседованию на Карту поляка, польский язык). '
  + 'Оценивай ответ по смыслу относительно эталона, а не по буквальному совпадению слов. Засчитывай синонимы, перефразирование и иной порядок слов, если смысл сохранён. '
  + 'Ответ надиктован — не снижай оценку за мелкие ошибки распознавания речи. Эталон намеренно полный: 60–70 % его смысла — уже хороший ответ. '
  + 'score — целое 0–100 (полнота передачи смысла эталона); missed_points — короткие пункты на русском только о важных фактах эталона, которые не прозвучали (всё ключевое есть — пустой массив); '
  + 'feedback — одно короткое предложение на русском: по смыслу или по польскому языку ответа, доброжелательно.'

export type KpLang = 'pl-PL' | 'en-US' | 'en-GB'
export const LANGS: KpLang[] = ['pl-PL', 'en-US', 'en-GB']
const LANG_RU: Record<KpLang, string> = { 'pl-PL': 'польский', 'en-US': 'английский', 'en-GB': 'английский' }

export interface KpCfg {
  prompt: string; pass: number; lang: KpLang; message: string; format: string
  model: string; temperature: number | null; thinking: boolean
  livePrompt: string; liveAsk: string; liveMore: string; liveTool: string; liveModel: string; voice: string
  discussPrompt: string; discussOpener: string; discussNone: string
  sttPrompt: string; sttAsk: string
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
    '2) Потом скажи по-польски 1–2 коротких предложения: что хорошо и чего не хватило. 3) Замолчи и жди. ' +
    'Если ученик попросит подробнее — разбери ответ подробно по-польски (простым языком), задай один наводящий вопрос и попроси ответить ещё раз. ' +
    'Ученик говорит по-польски с акцентом — это польский; если он попросит по-русски — можно коротко пояснить по-русски.',
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
const API_TEXTS = ['livePrompt', 'liveAsk', 'liveMore', 'liveTool', 'discussPrompt', 'discussOpener', 'discussNone'] as const
const STT_TEXTS = ['sttPrompt', 'sttAsk'] as const

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '')
const same = (a: string, b: string) => a.trim() === b.trim()
const okPass = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 100
const okTemp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2
const okLang = (v: unknown): v is KpLang => LANGS.includes(v as KpLang)
const okModel = (v: unknown) => typeof v === 'string' && /^[a-z0-9.-]{3,80}$/.test(v.trim())

/** «Gemini API» у экрана (engine 'api'; старое 'live' идёт так же) — у него есть модель и все промпты, у моста — prompt, message, format */
export const kpApi = (s: any) => s?.engine === 'api' || s?.engine === 'live'
/** запись «целым аудио» — у экрана есть sttPrompt и sttAsk */
export const kpFile = (s: any) => s?.dic === 'file'
/** умолчания message и format у этой формы: мост — чат, иначе Gemini API */
const base = (s: any) => (kpApi(s) ? { message: DEF.message, format: DEF.format } : CHAT)
/** format моста без {id} мост не разберёт — такой не принимаем */
const okFormat = (s: any, v: string) => kpApi(s) || v.includes('{id}')

/** Действующие настройки экрана: свои поля поверх умолчаний этой формы */
export function kpCfg(s: any): KpCfg {
  const b = base(s), f = txt(s?.format)
  const o: any = {
    prompt: txt(s?.prompt).trim() || SYSTEM, pass: okPass(s?.pass) ? s.pass : PASS, lang: okLang(s?.lang) ? s.lang : 'pl-PL',
    message: txt(s?.message) || b.message, format: f && okFormat(s, f) ? f : b.format,
    model: okModel(s?.model) ? s.model.trim() : DEF.model, temperature: okTemp(s?.temperature) ? s.temperature : DEF.temperature, thinking: s?.thinking === true,
    liveModel: okModel(s?.liveModel) ? s.liveModel.trim() : DEF.liveModel, voice: typeof s?.voice === 'string' && /^[A-Za-z]{2,20}$/.test(s.voice) ? s.voice : DEF.voice,
  }
  for (const k of API_TEXTS) o[k] = txt(s?.[k]) || DEF[k]
  for (const k of STT_TEXTS) o[k] = txt(s?.[k]) || STT[k]
  return o
}
/** Что показывать в JSON экрана — ровно то, что уходит у этой формы: мост — prompt, message, format; Gemini API — всё; «целым аудио» — + sttPrompt, sttAsk */
export function kpShown(s: any): Partial<KpCfg> {
  const c = kpCfg(s)
  const o: any = kpApi(s) ? { ...c } : { prompt: c.prompt, message: c.message, format: c.format, pass: c.pass, lang: c.lang }
  for (const k of STT_TEXTS) { if (kpFile(s)) o[k] = c[k]; else delete o[k] }
  return o
}

/** Поля экрана из JSON: только отличия от умолчаний этой формы (и только верного вида). Форму (engine, dic) берём из того же JSON */
export function kpFields(raw: any): Partial<KpCfg> {
  const o: any = {}
  if (!raw || typeof raw !== 'object') return o
  const b = base(raw)
  const prompt = txt(raw.prompt); if (prompt && !same(prompt, SYSTEM)) o.prompt = prompt.trim()
  if (okPass(raw.pass) && raw.pass !== PASS) o.pass = raw.pass
  if (okLang(raw.lang) && raw.lang !== 'pl-PL') o.lang = raw.lang
  const message = txt(raw.message); if (message && !same(message, b.message)) o.message = message
  const format = txt(raw.format); if (format && okFormat(raw, format) && !same(format, b.format)) o.format = format
  if (okModel(raw.model) && raw.model.trim() !== DEF.model) o.model = raw.model.trim()          // модель держим и у моста — пригодится, если экран переведут на Gemini API
  if (kpApi(raw)) {
    if (okTemp(raw.temperature)) o.temperature = raw.temperature
    if (raw.thinking === true) o.thinking = true
    if (okModel(raw.liveModel) && raw.liveModel.trim() !== DEF.liveModel) o.liveModel = raw.liveModel.trim()
    if (typeof raw.voice === 'string' && /^[A-Za-z]{2,20}$/.test(raw.voice) && raw.voice !== DEF.voice) o.voice = raw.voice
    for (const k of API_TEXTS) { const v = txt(raw[k]); if (v && !same(v, DEF[k])) o[k] = v }
  }
  if (kpFile(raw)) for (const k of STT_TEXTS) { const v = txt(raw[k]); if (v && !same(v, STT[k])) o[k] = v }
  return o
}

/** {lang} в sttPrompt — язык словами */
export const langRu = (l: string) => LANG_RU[l as KpLang] ?? 'польский'

/** Подставить {question}, {reference}, {answer}, {score}, {missed} в шаблон */
export const fill = (t: string, v: Record<string, unknown>) => t.replace(/\{(question|reference|answer|score|missed|id|lang)\}/g, (m, k) => (k in v ? String(v[k] ?? '') : m))

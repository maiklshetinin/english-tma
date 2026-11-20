// «Ответ по смыслу» (kind: 'kp'): всё, что уходит в модели проверки, и умолчания (20.11.2026) — как у «Разговора с Gemini».
// kpCfg(step) — действующие настройки (свои поля экрана поверх умолчаний): их показывает JSON экрана (кнопка «{ }»).
// kpFields(raw) — из JSON оставить только отличия от умолчаний (их и храним в экране и на сервере).
// Через мост (обычный «Ответ по смыслу») в чат уходят только prompt (и вопрос, эталон, ответ — сервер, server/ai.ts); порог — у нас.
// «· Gemini API» — ещё модель, формат, шаблон сообщения, температура, размышления, проверка голосом (live*) и «Обсудить ответ голосом» (discuss*).
// В шаблонах: {question} — вопрос, {reference} — эталон без разметки, {answer} — ответ ученика, {score} — процент, {missed} — чего не прозвучало.

export const PASS = 60                                    // зачёт — от 60 % (рекомендация курса: 60–70 % «идеального» ответа — уже хорошо)
/** Промпт по умолчанию — тот же текст, что SYSTEM в server/ai.ts */
export const SYSTEM = 'Ты проверяешь устный ответ ученика на вопрос (подготовка к собеседованию на Карту поляка, польский язык). '
  + 'Оценивай ответ по смыслу относительно эталона, а не по буквальному совпадению слов. Засчитывай синонимы, перефразирование и иной порядок слов, если смысл сохранён. '
  + 'Ответ надиктован — не снижай оценку за мелкие ошибки распознавания речи. Эталон намеренно полный: 60–70 % его смысла — уже хороший ответ. '
  + 'score — целое 0–100 (полнота передачи смысла эталона); missed_points — короткие пункты на русском только о важных фактах эталона, которые не прозвучали (всё ключевое есть — пустой массив); '
  + 'feedback — одно короткое предложение на русском: по смыслу или по польскому языку ответа, доброжелательно.'

export interface KpCfg {
  prompt: string; pass: number
  model: string; format: string; message: string; temperature: number | null; thinking: boolean
  livePrompt: string; liveAsk: string; liveMore: string
  discussPrompt: string; discussOpener: string
}

export const DEF: Omit<KpCfg, 'prompt' | 'pass'> = {
  model: 'auto',          // 'auto' — самая свежая Flash Lite ключа; 'live' — проверка голосовой Live-моделью
  format: 'Ответь только JSON: {"score": число 0–100, "missed_points": ["…"], "feedback": "…"}.',
  message: 'Вопрос:\n{question}\n\nЭталон:\n{reference}\n\nОтвет ученика:\n{answer}',
  temperature: null,
  thinking: false,          // false — размышления выключены (3.x — thinkingLevel minimal, 2.x — thinkingBudget 0): проверка быстрее
  livePrompt: 'Ты проверяешь ответ голосом. Порядок строго такой: 1) СРАЗУ, ничего не говоря, вызови функцию submit_grade. ' +
    '2) Потом скажи по-польски 1–2 коротких предложения: что хорошо и чего не хватило. 3) Замолчи и жди. ' +
    'Если ученик попросит подробнее — разбери ответ подробно по-польски (простым языком), задай один наводящий вопрос и попроси ответить ещё раз полнее; новую попытку оцени коротко. ' +
    'Ученик говорит по-польски с акцентом — это польский; если он попросит по-русски — можно коротко пояснить по-русски.',
  liveAsk: 'Oceń moją odpowiedź.',
  liveMore: 'Proszę omówić moją odpowiedź szczegółowo.',
  discussPrompt: 'Jesteś życzliwym nauczycielem polskiego. Uczeń przygotowuje się do rozmowy na Kartę Polaka. Mów po polsku, prosto i niezbyt szybko; ' +
    'jeśli uczeń poprosi po rosyjsku — możesz krótko wyjaśnić po rosyjsku. Rozmówca mówi po polsku z akcentem — to nadal polski.\n' +
    'Pytanie: {question}\nWzorcowa odpowiedź: {reference}\nOdpowiedź ucznia: {answer}\n' +
    'Ocena: {score}%. Czego zabrakło: {missed}.\n' +
    'Najpierw w 2–3 zdaniach powiedz, co było dobrze i czego zabrakło. Potem zadaj jedno pytanie pomocnicze i poproś, żeby uczeń odpowiedział jeszcze raz, pełniej. ' +
    'Po jego odpowiedzi krótko ją oceń i, jeśli trzeba, popraw błędy językowe jednym zdaniem.',
  discussOpener: 'Proszę omówić moją odpowiedź.',
}
const TEXTS = ['format', 'message', 'livePrompt', 'liveAsk', 'liveMore', 'discussPrompt', 'discussOpener'] as const

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '')
const same = (a: string, b: string) => a.trim() === b.trim()
const okPass = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 100
const okTemp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2

/** «Gemini API» у экрана (engine 'api'; старое 'live' идёт так же) — у него есть модель и все промпты, у моста — только prompt и pass */
export const kpApi = (s: any) => s?.engine === 'api' || s?.engine === 'live'

/** Действующие настройки экрана: свои поля поверх умолчаний */
export function kpCfg(s: any): KpCfg {
  const o: any = { prompt: txt(s?.prompt).trim() || SYSTEM, pass: okPass(s?.pass) ? s.pass : PASS,
    model: txt(s?.model).trim() || DEF.model, temperature: okTemp(s?.temperature) ? s.temperature : DEF.temperature, thinking: s?.thinking === true }
  for (const k of TEXTS) o[k] = txt(s?.[k]) || DEF[k]
  return o
}
/** Что показывать в JSON экрана: у моста — prompt и pass, у «Gemini API» — всё */
export function kpShown(s: any): Partial<KpCfg> {
  const c = kpCfg(s)
  return kpApi(s) ? c : { prompt: c.prompt, pass: c.pass }
}

/** Поля экрана из JSON: только отличия от умолчаний (и только верного вида) */
export function kpFields(raw: any): Partial<KpCfg> {
  const o: any = {}
  if (!raw || typeof raw !== 'object') return o
  const prompt = txt(raw.prompt); if (prompt && !same(prompt, SYSTEM)) o.prompt = prompt.trim()
  if (okPass(raw.pass) && raw.pass !== PASS) o.pass = raw.pass
  const model = txt(raw.model).trim(); if (model && model !== DEF.model) o.model = model
  if (okTemp(raw.temperature)) o.temperature = raw.temperature
  if (raw.thinking === true) o.thinking = true
  for (const k of TEXTS) { const v = txt(raw[k]); if (v && !same(v, DEF[k])) o[k] = v }
  return o
}

/** Подставить {question}, {reference}, {answer}, {score}, {missed} в шаблон */
export const fill = (t: string, v: Record<string, unknown>) => t.replace(/\{(question|reference|answer|score|missed)\}/g, (_, k) => String(v[k] ?? ''))

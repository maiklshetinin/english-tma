// Проверка ответа по смыслу через Gemini (упражнение «Ответ по смыслу», src/exercises/kp) — 19.11.2026.
// Ключи Google хранятся ТОЛЬКО в этом браузере (localStorage), на сервер не уходят; запрос к Gemini идёт прямо отсюда.
// Ключи пробуются сверху вниз: кончилась квота — берётся следующий, а исчерпанный пропускается до времени,
// которое назвал Google («Please retry in 10h39m…»). Вкладка «ИИ» в панели разработчика (DevAi.vue) — список ключей и проверка.
import { reactive } from 'vue'

const KEYS = 'tma.ai.keys.v1', MODEL = 'tma.ai.model'
export const MODEL_DEFAULT = 'gemini-3.8-flash'          // свежая стабильная Flash из списка моделей ключа автора (19.11.2026); не ответит — подберётся сама
export const WAIT = 25_000                                // сколько ждём ответа одной модели, потом следующая
export const PASS = 60                                    // зачёт — от 60 % (рекомендация курса: 60–70 % «идеального» ответа — уже хорошо)
const API = 'https://generativelanguage.googleapis.com/v1beta/models/'          // тот же адрес и заголовок x-goog-api-key, что у рабочей озвучки (gemini-2.5-flash-preview-tts)

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* приватный режим */ } }
const today = () => new Date().toISOString().slice(0, 10)

/** Ключи: { key, ok: true|false|null (ещё не пробовали), err, until (мс — квота до), day, n (запросов за day) } */
const OLD = ['gemini-2.5-flash', 'gemini-flash-latest']                                    // было по умолчанию раньше — переводим на новую
export const ai = reactive({ keys: read(KEYS, []), model: ((m) => (OLD.includes(m) ? MODEL_DEFAULT : m))(read(MODEL, MODEL_DEFAULT)) })
const save = () => { write(KEYS, ai.keys); write(MODEL, ai.model) }

export const mask = (k) => (k.length > 12 ? `${k.slice(0, 8)}…${k.slice(-4)}` : k)
export const countToday = (x) => (x.day === today() ? x.n : 0)
export function addKey(raw) {
  const key = String(raw ?? '').trim()
  if (!key || ai.keys.some(x => x.key === key)) return false
  ai.keys.push({ key, ok: null, err: '', until: 0, day: today(), n: 0 }); save(); return true
}
export function removeKey(key) { ai.keys = ai.keys.filter(x => x.key !== key); save() }
export function moveKey(key, d) { const i = ai.keys.findIndex(x => x.key === key), j = i + d; if (i < 0 || j < 0 || j >= ai.keys.length) return; const a = ai.keys.slice(); [a[i], a[j]] = [a[j], a[i]]; ai.keys = a; save() }
export function setModel(m) { ai.model = String(m ?? '').trim() || MODEL_DEFAULT; save() }
export const hasKeys = () => ai.keys.length > 0

/** «Please retry in 10h39m29.6s» / RetryInfo «38s» → через сколько мс */
export function retryMs(text) {
  const m = String(text ?? '').match(/(?:retry in|retryDelay"?\s*:\s*"?)\s*((?:\d+(?:\.\d+)?[hms]\s*)+)/i)
  if (!m) return 0
  let ms = 0
  for (const [, n, u] of m[1].matchAll(/(\d+(?:\.\d+)?)([hms])/g)) ms += parseFloat(n) * (u === 'h' ? 3600e3 : u === 'm' ? 60e3 : 1e3)
  return Math.round(ms)
}
/** Ошибка Google → коротко по-русски */
export function errText(status, msg, model = ai.model) {
  const m = String(msg ?? '')
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(m)) return 'Квота закончилась'
  if (/API key not valid|API_KEY_INVALID/i.test(m)) return 'Ключ не принят Google — скопируйте целиком'
  if (status === 403) return 'Нет доступа к Gemini API у этого ключа'
  if (status === 404) return `Модель «${model}» недоступна этому ключу` + (m ? ': ' + m.slice(0, 140) : '')          // текст Google — чтобы было видно причину
  if (status >= 500) return `Модель «${model}» сейчас перегружена у Google (${status}) — попробуйте позже`          // ключ тут ни при чём
  return m ? m.slice(0, 160) : 'Ошибка ' + status
}

/** Промпт по умолчанию; у экрана может быть свой (step.prompt — правится в JSON экрана) */
export const SYSTEM = 'Ты проверяешь устный ответ ученика на вопрос (подготовка к собеседованию на Карту поляка, польский язык). '
  + 'Оценивай ответ по смыслу относительно эталона (reference), а не по буквальному совпадению слов. Засчитывай синонимы, перефразирование и иной порядок слов, если смысл сохранён. '
  + 'Ответ может быть надиктован — не снижай оценку за мелкие ошибки распознавания речи. Эталон намеренно полный: 60–70 % его смысла — уже хороший ответ. '
  + 'Верни строго JSON: score — целое 0–100 (полнота передачи смысла эталона); missed_points — короткие пункты на русском только о важных фактах эталона, которые не прозвучали (всё ключевое есть — пустой массив); '
  + 'feedback — одно короткое предложение на русском: по смыслу или по польскому языку ответа, доброжелательно.'
const SCHEMA = { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, missed_points: { type: 'ARRAY', items: { type: 'STRING' } }, feedback: { type: 'STRING' } }, required: ['score', 'missed_points', 'feedback'] }

async function call(key, prompt, json, fetcher = fetch, system = SYSTEM, model = ai.model) {
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: {} }          // без temperature: новые модели (3.x) её не принимают
  if (json) { body.systemInstruction = { parts: [{ text: system }] }; body.generationConfig.responseMimeType = 'application/json'; body.generationConfig.responseSchema = SCHEMA }
  let r
  // 25 с на ответ: модели 3.x у Google бывают перегружены и молчат минутами (форум Google, ноябрь 2026) — тогда следующая модель
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), WAIT)
  try { r = await fetcher(API + encodeURIComponent(model) + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), ...(ac ? { signal: ac.signal } : {}) }) }
  catch { clearTimeout(tm); if (ac?.signal.aborted) { const e = new Error(`Модель «${model}» не ответила за ${WAIT / 1000} с — Google перегружен`); e.status = 504; throw e } const e = new Error('Нет связи с Google'); e.net = true; throw e }
  clearTimeout(tm)
  const raw = await r.text()
  if (!r.ok) { let msg = raw; try { msg = JSON.parse(raw).error?.message ?? raw } catch { /* не JSON */ } const e = new Error(errText(r.status, msg, model)); e.status = r.status; e.wait = retryMs(raw); throw e }
  return JSON.parse(raw).candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
}
/** Какие текстовые модели видит ключ (Google: GET …/v1beta/models) → самая свежая Flash: сначала псевдоним gemini-flash-latest,
 *  потом стабильная (без preview), потом версия новее; Lite — в последнюю очередь. Озвучка, картинки, Live и т.п. не подходят. */
export function bestModel(names, skip = []) {
  const ok = names.filter(n => /^gemini-/.test(n) && /flash/i.test(n) && !skip.includes(n) && !/(tts|image|live|audio|embed|vision|native|computer|robotics|exp|omni|transcribe)/i.test(n))
  // 19.11.2026: у ключа автора в списке есть и gemini-2.5-flash, и gemini-flash-latest, но 2.5 Google новым проектам не отдаёт (404) —
  // поэтому сначала стабильная модель с самым новым номером (gemini-3.8-flash), псевдоним latest и preview — потом
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? [])[1] ?? '0')
  const rank = (n) => [/lite/i.test(n) ? 1 : 0, /latest/i.test(n) ? 1 : 0, /preview/i.test(n) ? 1 : 0, -ver(n), n.length]
  return ok.sort((a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0 })[0] ?? ''
}
export async function listModels(key, fetcher = fetch) {
  const r = await fetcher(API.replace(/\/$/, '') + '?pageSize=1000', { headers: { 'x-goog-api-key': key } })
  if (!r.ok) return []
  const list = JSON.parse(await r.text()).models ?? []
  return list.filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent')).map(m => String(m.name ?? '').replace(/^models\//, '')).filter(Boolean)
}
/** Модель не ответила — 404 (недоступна ключу) или 5xx (перегружена у Google, 19.11.2026: gemini-3.8-flash отвечал 503):
 *  спросить у Google, какие модели видит ключ, и попробовать следующие свежие Flash (до 3). Ответила — запомнить её */
const BUSY = (e) => e?.status === 404 || e?.status >= 500
async function withModels(key, fetcher, fn) {
  try { return await fn(ai.model) } catch (e) {
    if (!BUSY(e)) throw e
    const names = await listModels(key, fetcher).catch(() => []), tried = [ai.model]
    let last = e
    for (let i = 0; i < 5; i++) {                            // до 5 запасных: свежие Flash, потом Lite (они обычно свободнее)
      const m = bestModel(names, tried); if (!m) break
      tried.push(m)
      try { const r = await fn(m); setModel(m); return r } catch (e2) { last = e2; if (!BUSY(e2)) throw e2 }
    }
    throw last
  }
}
function mark(x, ok, e) {
  if (x.day !== today()) { x.day = today(); x.n = 0 }
  x.n++; x.err = ok ? '' : e.message
  if (ok || !(e?.status >= 500)) x.ok = ok                   // 5xx — перегружен Google, ключ рабочий: статус ключа не трогаем
  x.until = ok ? 0 : e.status === 429 ? Date.now() + (e.wait || 3600e3) : 0
  save()
}

/** Проверка ответа: { score 0–100, missed: [], feedback, ok: score ≥ порога }. prompt, pass — свои у экрана (нет — по умолчанию).
 *  Нет ключей — ошибка с nokey; все не сработали — с текстом последней ошибки */
/** @param {{ question: string, reference: string, answer: string, prompt?: string, pass?: number }} q */
export async function checkAnswer(q, fetcher = fetch) {
  const { question, reference, answer, prompt, pass } = q
  const system = prompt?.trim() || SYSTEM, need = Number.isFinite(pass) ? pass : PASS
  const text = `Вопрос: ${question}\n\nЭталон (reference): ${reference}\n\nОтвет ученика: ${answer}`
  const list = ai.keys.filter(x => !(x.until > Date.now()))
  if (!ai.keys.length) { const e = new Error('Нет ключа Gemini'); e.nokey = true; throw e }
  if (!list.length) throw new Error('У всех ключей закончилась квота')
  let last = null
  for (const x of list) {
    try {
      const raw = await withModels(x.key, fetcher, (m) => call(x.key, text, true, fetcher, system, m))          // не ответила модель — следующая из списка ключа
      const out = JSON.parse(raw)
      mark(x, true)
      const score = Math.max(0, Math.min(100, Math.round(Number(out.score) || 0)))
      return { score, missed: (Array.isArray(out.missed_points) ? out.missed_points : []).map(String).filter(Boolean).slice(0, 8), feedback: String(out.feedback ?? ''), ok: score >= need }
    } catch (e) {
      last = e
      if (e instanceof SyntaxError) { mark(x, false, new Error('Gemini ответил не JSON')); continue }
      mark(x, false, e)
      if (e.net || e.status >= 500) break                    // нет сети или Google перегружен — другие ключи не помогут
    }
  }
  throw last ?? new Error('Проверка не удалась')
}
/** «Проверить» у ключа: крошечный запрос к модели проверки */
export async function testKey(key, fetcher = fetch) {
  const x = ai.keys.find(k => k.key === key); if (!x) return
  try { await withModels(key, fetcher, (m) => call(key, 'Ответь одним словом: ok', false, fetcher, SYSTEM, m)); mark(x, true) } catch (e) { mark(x, false, e) }          // не ответила модель — следующая из списка ключа
}

// Проверка ответа по смыслу через Gemini (упражнение «Ответ по смыслу», src/exercises/kp) — 19.11.2026.
// Ключи Google хранятся ТОЛЬКО в этом браузере (localStorage), на сервер не уходят; запрос к Gemini идёт прямо отсюда.
// Ключи пробуются сверху вниз: кончилась квота — берётся следующий, а исчерпанный пропускается до времени,
// которое назвал Google («Please retry in 10h39m…»). Вкладка «ИИ» в панели разработчика (DevAi.vue) — список ключей и проверка.
import { reactive } from 'vue'

const KEYS = 'tma.ai.keys.v1', MODEL = 'tma.ai.model'
export const MODEL_DEFAULT = 'gemini-flash-latest'          // псевдоним Google: всегда свежая Flash-модель (gemini-2.5-flash новым проектам уже не выдают — 404)
export const PASS = 60                                    // зачёт — от 60 % (рекомендация курса: 60–70 % «идеального» ответа — уже хорошо)
const API = 'https://generativelanguage.googleapis.com/v1beta/models/'          // тот же адрес и заголовок x-goog-api-key, что у рабочей озвучки (gemini-2.5-flash-preview-tts)

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* приватный режим */ } }
const today = () => new Date().toISOString().slice(0, 10)

/** Ключи: { key, ok: true|false|null (ещё не пробовали), err, until (мс — квота до), day, n (запросов за day) } */
const OLD = ['gemini-2.5-flash']                                    // было по умолчанию до 19.11.2026 — переводим на псевдоним
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
export function errText(status, msg) {
  const m = String(msg ?? '')
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(m)) return 'Квота закончилась'
  if (/API key not valid|API_KEY_INVALID/i.test(m)) return 'Ключ не принят Google — скопируйте целиком'
  if (status === 403) return 'Нет доступа к Gemini API у этого ключа'
  if (status === 404) return 'Нет такой модели — проверьте название'
  if (status >= 500) return 'Google не ответил — попробуйте позже'
  return m ? m.slice(0, 160) : 'Ошибка ' + status
}

/** Промпт по умолчанию; у экрана может быть свой (step.prompt — правится в JSON экрана) */
export const SYSTEM = 'Ты проверяешь устный ответ ученика на вопрос (подготовка к собеседованию на Карту поляка, польский язык). '
  + 'Оценивай ответ по смыслу относительно эталона (reference), а не по буквальному совпадению слов. Засчитывай синонимы, перефразирование и иной порядок слов, если смысл сохранён. '
  + 'Ответ может быть надиктован — не снижай оценку за мелкие ошибки распознавания речи. Эталон намеренно полный: 60–70 % его смысла — уже хороший ответ. '
  + 'Верни строго JSON: score — целое 0–100 (полнота передачи смысла эталона); missed_points — короткие пункты на русском только о важных фактах эталона, которые не прозвучали (всё ключевое есть — пустой массив); '
  + 'feedback — одно короткое предложение на русском: по смыслу или по польскому языку ответа, доброжелательно.'
const SCHEMA = { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, missed_points: { type: 'ARRAY', items: { type: 'STRING' } }, feedback: { type: 'STRING' } }, required: ['score', 'missed_points', 'feedback'] }

async function call(key, prompt, json, fetcher = fetch, system = SYSTEM) {
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: {} }          // без temperature: новые модели (3.x) её не принимают
  if (json) { body.systemInstruction = { parts: [{ text: system }] }; body.generationConfig.responseMimeType = 'application/json'; body.generationConfig.responseSchema = SCHEMA }
  let r
  try { r = await fetcher(API + encodeURIComponent(ai.model) + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }) }
  catch { const e = new Error('Нет связи с Google'); e.net = true; throw e }
  const raw = await r.text()
  if (!r.ok) { let msg = raw; try { msg = JSON.parse(raw).error?.message ?? raw } catch { /* не JSON */ } const e = new Error(errText(r.status, msg)); e.status = r.status; e.wait = retryMs(raw); throw e }
  return JSON.parse(raw).candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
}
/** Какие текстовые модели видит ключ (Google: GET …/v1beta/models) → самая свежая Flash: сначала псевдоним gemini-flash-latest,
 *  потом стабильная (без preview), потом версия новее; Lite — в последнюю очередь. Озвучка, картинки, Live и т.п. не подходят. */
export function bestModel(names) {
  const ok = names.filter(n => /flash/i.test(n) && !/(tts|image|live|audio|embed|vision|native|computer|robotics|exp)/i.test(n))
  if (ok.includes('gemini-flash-latest')) return 'gemini-flash-latest'
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? [])[1] ?? '0')
  const rank = (n) => [/lite/i.test(n) ? 1 : 0, /preview|latest/i.test(n) ? 1 : 0, -ver(n), n.length]
  return ok.sort((a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0 })[0] ?? ''
}
export async function listModels(key, fetcher = fetch) {
  const r = await fetcher(API.replace(/\/$/, '') + '?pageSize=1000', { headers: { 'x-goog-api-key': key } })
  if (!r.ok) return []
  const list = JSON.parse(await r.text()).models ?? []
  return list.filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent')).map(m => String(m.name ?? '').replace(/^models\//, '')).filter(Boolean)
}
/** «Нет такой модели» (404) — спросить у Google, какие модели видит ключ, взять свежую текстовую Flash. true — модель сменилась */
async function fixModel(key, fetcher) {
  const m = bestModel(await listModels(key, fetcher).catch(() => []))
  if (!m || m === ai.model) return false
  setModel(m); return true
}
function mark(x, ok, e) {
  if (x.day !== today()) { x.day = today(); x.n = 0 }
  x.n++; x.ok = ok; x.err = ok ? '' : e.message
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
      let raw
      try { raw = await call(x.key, text, true, fetcher, system) }
      catch (e) { if (e.status === 404 && await fixModel(x.key, fetcher)) raw = await call(x.key, text, true, fetcher, system); else throw e }          // модель не нашлась — подобрали и ещё раз
      const out = JSON.parse(raw)
      mark(x, true)
      const score = Math.max(0, Math.min(100, Math.round(Number(out.score) || 0)))
      return { score, missed: (Array.isArray(out.missed_points) ? out.missed_points : []).map(String).filter(Boolean).slice(0, 8), feedback: String(out.feedback ?? ''), ok: score >= need }
    } catch (e) {
      last = e
      if (e instanceof SyntaxError) { mark(x, false, new Error('Gemini ответил не JSON')); continue }
      mark(x, false, e)
      if (e.net) break                                       // нет сети — другие ключи не помогут
    }
  }
  throw last ?? new Error('Проверка не удалась')
}
/** «Проверить» у ключа: крошечный запрос к модели проверки */
export async function testKey(key, fetcher = fetch) {
  const x = ai.keys.find(k => k.key === key); if (!x) return
  const ping = () => call(key, 'Ответь одним словом: ok', false, fetcher)
  try {
    try { await ping() } catch (e) { if (e.status === 404 && await fixModel(key, fetcher)) await ping(); else throw e }          // нет модели — подобрать по списку Google
    mark(x, true)
  } catch (e) { mark(x, false, e) }
}

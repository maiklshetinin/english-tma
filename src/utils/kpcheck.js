// «Ответ по смыслу · Gemini API» (20.11.2026, эксперимент): проверка напрямую в Gemini, без моста — текстовая модель
// (по умолчанию самая свежая Flash Lite: у бесплатного проекта 15 в минуту и 500 в сутки) отдаёт строгий JSON по схеме:
// { score, missed_points, feedback }. Ключи — из профиля (utils/gemini.js), по очереди; кончилась квота (429) — пара
// «ключ + модель» отдыхает, следующий ключ. Не вышло совсем (нет ключей, квота, сеть) — проверка уходит через мост, как раньше.
import { ai, mark, retryMs, errText, mask } from './gemini'
import { kpPlain, checkAnswer } from './ai'
import { overlay, reqOf } from './overlay'
import { kpCfg, kpReady, fill } from '../exercises/kp/defaults'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const MK = 'tma.kp.models', PK = 'tma.kp.model', QK = 'tma.kp.quota'
export const CHECK_DEFAULT = 'gemini-3.5-flash-lite'
const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* приватный режим */ } }
const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? [])[1] ?? '0')

/** Выбор модели проверки учеником — только на это открытие ('' — из JSON экрана). 21.11.2026: в браузере больше не запоминается —
 *  урок (model в JSON) главнее; старый запомненный выбор стёрт */
let pick = ''
try { localStorage.removeItem(PK) } catch { /* приватный режим */ }
export const getPick = () => pick
export const setPick = (m) => { pick = m || '' }
/** «gemini-3.5-flash-lite» → «Gemini 3.5 Flash Lite» */
export const checkName = (m) => String(m || '').replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ').replace(/\b(flash|lite|pro|preview|latest)\b/g, (x) => x[0].toUpperCase() + x.slice(1))
/** Лимит модели у бесплатного проекта — подпись в списке (из AI Studio → Rate limit, 20.11.2026) */
export const limitOf = (m) => (/lite/i.test(m) ? '500 в сутки' : /flash/i.test(m) ? '20 в сутки' : '')

/** Текстовые модели ключа для проверки: Flash Lite — сверху (их лимит больше), потом Flash; новее — выше. Кэш на сутки */
export async function checkModels(key, fetcher = fetch) {
  const c = rd(MK, { at: 0, list: [] })
  if (c.list.length && Date.now() - c.at < 864e5) return c.list
  try {
    const r = await fetcher(API + '?pageSize=1000', { headers: { 'x-goog-api-key': key } })
    if (!r.ok) return c.list
    const list = (JSON.parse(await r.text()).models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''))
      .filter((n) => /^gemini-/.test(n) && /flash/i.test(n) && !/(tts|image|live|audio|embed|vision|native|computer|robotics|exp|omni|transcribe|latest)/i.test(n))
      .sort((a, b) => (/lite/i.test(b) ? 1 : 0) - (/lite/i.test(a) ? 1 : 0) || (/preview/i.test(a) ? 1 : 0) - (/preview/i.test(b) ? 1 : 0) || ver(b) - ver(a) || a.length - b.length)
    if (list.length) wr(MK, { at: Date.now(), list })
    return list.length ? list : c.list
  } catch { return c.list }
}
const quota = (key, model) => rd(QK, {})[key + '|' + model] ?? 0
function block(key, model, ms) { const q = rd(QK, {}), now = Date.now(); for (const k of Object.keys(q)) if (q[k] < now) delete q[k]; q[key + '|' + model] = now + ms; wr(QK, q) }

const SCHEMA = { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, missed_points: { type: 'ARRAY', items: { type: 'STRING' } }, feedback: { type: 'STRING' } }, required: ['score', 'missed_points', 'feedback'] }
const WAIT = 30_000

// «Размышления» (20.11.2026): модели 3.x по умолчанию думают перед ответом — проверка шла ~30 с. Для сверки с эталоном не нужно:
// 3.x — thinkingLevel 'minimal', 2.x — thinkingBudget 0. Модель не знает такой настройки (400 про thinking) — повтор без неё
const think = (m) => (/gemini-2\./.test(m) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' })
/** Тело generateContent проверки (24.11.2026 — общее с вкладкой «Запрос в API»)
 *  @param {string} model @param {string} prompt @param {string} user @param {{ schema?: boolean, thinkOff?: boolean, temperature?: number | null, extra?: object | null }} [o] */
export function checkBody(model, prompt, user, { schema = true, thinkOff = true, temperature = null, extra = null } = {}) {
  return overlay({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', ...(typeof temperature === 'number' ? { temperature } : {}), ...(schema ? { responseSchema: SCHEMA } : {}), ...(thinkOff ? { thinkingConfig: think(model) } : {}) } }, extra)
}
/** Роль и сообщение проверки — ровно из JSON экрана: роль = prompt + format, сообщение = message с подстановками */
export function checkText(c, q) {
  return { prompt: [c.prompt.trim(), c.format.trim()].filter(Boolean).join(' '), user: fill(c.message, { question: q.question, reference: kpPlain(q.reference), answer: q.answer }) }
}
async function once(key, model, prompt, user, fetcher, schema = true, thinkOff = true, temperature = null, extra = null) {
  const body = checkBody(model, prompt, user, { schema, thinkOff, temperature, extra })
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), WAIT)
  let r
  try { r = await fetcher(`${API}/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), ...(ac ? { signal: ac.signal } : {}) }) }
  catch { const e = new Error(ac?.signal.aborted ? `${checkName(model)} не ответила за ${WAIT / 1000} с` : 'Нет связи с Google'); e.status = ac?.signal.aborted ? 504 : 0; throw e }
  finally { clearTimeout(tm) }
  const raw = await r.text()
  if (!r.ok) { let msg = raw; try { msg = JSON.parse(raw).error?.message ?? raw } catch { /* */ } const e = new Error(errText(r.status, msg, model)); e.status = r.status; e.wait = retryMs(raw); e.raw = msg; throw e }
  const txt = JSON.parse(raw).candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? ''
  const o = JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  return o
}

/** Проверка напрямую. q.cfg — настройки экрана (kpCfg: формат, шаблон, температура, размышления); нет — умолчания.
 *  → { score, missed, feedback, ok, site: 'Gemini', api: true, model, key, ms } */
export async function checkDirect(q, { model = '', fetcher = fetch } = {}) {
  const c = kpReady(q.cfg ?? kpCfg({ prompt: q.prompt, pass: q.pass }))          // {topic}, {lang}, {langHow} — подставлены
  const t0 = Date.now(), need = Number.isFinite(q.pass) ? q.pass : c.pass
  if (!ai.keys.length) { const e = new Error('нет ключей Gemini'); e.nokeys = true; throw e }
  const own = (v) => (v && v !== 'live' ? v : '')          // 'live' — проверка голосовой моделью (utils/kplive.js), тут — запасная текстовая
  const m = own(getPick()) || own(model) || (await checkModels(ai.keys[0].key, fetcher))[0] || CHECK_DEFAULT          // свой выбор в браузере (подвал экрана) — главнее экрана
  const { prompt, user } = checkText(c, q)          // ровно то, что в JSON экрана: prompt и format (пустое — пусто)
  const thinkOff = !c.thinking, temp = c.temperature, ext = reqOf(c, 'check')          // ext — свои поля запроса из JSON (request.check)
  const now = Date.now(), keys = ai.keys.filter((x) => !(quota(x.key, m) > now))
  if (!keys.length) { const e = new Error(`у ${checkName(m)} кончился лимит на всех ключах`); e.quota = true; throw e }
  let last = null
  for (const x of keys) {
    try {
      let o
      try { o = await once(x.key, m, prompt, user, fetcher, true, thinkOff, temp, ext) } catch (e) {
        if (e.status === 400 && /think/i.test(e.raw || '')) o = await once(x.key, m, prompt, user, fetcher, true, false, temp, ext)          // без настройки «размышлений»
        else if (e.status === 400 && /schema|responseSchema|response_schema/i.test(e.raw || '')) o = await once(x.key, m, prompt, user, fetcher, false, thinkOff, temp, ext)          // модель без схемы — просто JSON
        else throw e
      }
      mark(x, true)
      const score = Math.max(0, Math.min(100, Math.round(Number(o?.score) || 0)))
      const missed = Array.isArray(o?.missed_points) ? o.missed_points.map(String).filter(Boolean) : Array.isArray(o?.missed) ? o.missed.map(String) : []
      return { score, missed, feedback: String(o?.feedback ?? ''), ok: score >= need, site: 'Gemini', api: true, model: m, key: mask(x.key), ms: Date.now() - t0 }
    } catch (e) {
      if (e.status === 429) { block(x.key, m, e.wait > 0 && e.wait < 120e3 ? e.wait : 3600e3); last = e; continue }
      if (e.status) mark(x, false, e)
      last = e
      if (e instanceof SyntaxError) continue          // модель прислала не JSON — следующий ключ
      throw e
    }
  }
  throw last || new Error('не удалось проверить')
}

/** Сначала напрямую, не вышло — через мост (как в обычном «Ответе по смыслу»); note — почему ушло в мост */
export async function checkSmart(q, opts = {}) {
  try { return await checkDirect(q, opts) } catch (e) {
    const why = e?.nokeys ? 'нет ключей Gemini' : e?.message || 'ошибка'
    const r = await checkAnswer(q)
    return { ...r, note: `Gemini API: ${why} — проверил мост` }
  }
}

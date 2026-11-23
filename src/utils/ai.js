// Проверка ответа по смыслу (упражнение «Ответ по смыслу», src/exercises/kp) — 19.11.2026.
// Ключей нет: сервер отдаёт задание скрипту-мосту во вкладке с чатом (ChatGPT / Gemini / Claude) у преподавателя и ждёт ответ
// чата (server/ai.ts, public/ai-bridge.user.js). Состояние моста и его ключ — вкладка «ИИ» панели разработчика (DevAi.vue).
import { ref } from 'vue'
import { apiRequest } from '../firebase'

// порог и промпт по умолчанию — в exercises/kp/defaults.ts (там же все настройки моделей проверки, 20.11.2026)
import { PASS, SYSTEM, kpCfg } from '../exercises/kp/defaults'
export { PASS, SYSTEM }

/** Проверка: { score 0–100, missed: [], feedback, ok: score ≥ порога }. prompt, pass — свои у экрана (нет — по умолчанию).
 *  Мост не в сети, чат не ответил — ошибка с текстом сервера
 *  @param {{ question: string, reference: string, answer: string, prompt?: string, pass?: number }} q */
/** Эталон без разметки оформления (**жирный**, ==термин==, _курсив_, «• ») — так его видит чат */
export const kpPlain = (t) => String(t ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1').replace(/(^|[^\p{L}\d])_(.+?)_(?![\p{L}\d])/gu, '$1$2').replace(/^• /gm, '- ')

/** Мост в сети и с какими чатами: { online, sites: ['Gemini', …] }. Ответ живёт 15 с — экраны урока не дёргают сервер каждый раз */
let stCache = null
// 23.11.2026: последний статус — общий для всех экранов (bridgeLast): невыбранные экраны на холсте показывают его, сами не спрашивают;
// одновременные вопросы (много экранов сразу) — одним запросом (stWait)
export const bridgeLast = ref(null)
let stWait = null
export async function bridgeStatus(request = apiRequest) {
  if (stCache && Date.now() - stCache.at < 15_000) return stCache.v
  if (stWait) return stWait
  stWait = (async () => {
    const r = await request('/ai/status')
    const b = r.ok ? await r.json().catch(() => null) : null
    const v = { online: !!b?.online, sites: Array.isArray(b?.sites) ? b.sites.map(String) : [] }
    stCache = { at: Date.now(), v }; bridgeLast.value = v
    return v
  })().finally(() => { stWait = null })
  return stWait
}
/** Значок чата (файлы — public/ai/); нет — пусто, показываем только название */
const AI_ICON = { ChatGPT: 'gpt.svg', Gemini: 'gemini.svg', Claude: 'Claude Spark - Clay.svg' }
export const aiIcon = (site) => (AI_ICON[site] ? import.meta.env.BASE_URL + 'ai/' + encodeURIComponent(AI_ICON[site]) : '')

export async function checkAnswer(q, request = apiRequest) {
  const need = Number.isFinite(q.pass) ? q.pass : PASS, t0 = Date.now()          // ms — сколько ждал ученик (показывается у «проверил …»)
  // 21.11.2026: в чат уходит ровно prompt + message + format из JSON экрана (у «Gemini API» как запасного — его prompt и умолчания моста)
  const c = q.chat ?? kpCfg({ prompt: q.prompt })
  const r = await request('/ai/check', { method: 'POST', body: JSON.stringify({ question: q.question, reference: kpPlain(q.reference), answer: q.answer, prompt: c.prompt, message: c.message, format: c.format }) })
  let body = null
  try { body = await r.json() } catch { /* не JSON */ }
  if (!r.ok) throw new Error(body?.error || 'Ошибка сервера ' + r.status)
  const score = Math.max(0, Math.min(100, Math.round(Number(body?.score) || 0)))
  return { score, missed: Array.isArray(body?.missed) ? body.missed.map(String) : [], feedback: String(body?.feedback ?? ''), site: String(body?.site ?? ''), ms: Date.now() - t0, ok: score >= need }
}

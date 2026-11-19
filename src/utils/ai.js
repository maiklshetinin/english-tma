// Проверка ответа по смыслу (упражнение «Ответ по смыслу», src/exercises/kp) — 19.11.2026.
// Ключей нет: сервер отдаёт задание скрипту-мосту во вкладке с чатом (ChatGPT / Gemini / Claude) у преподавателя и ждёт ответ
// чата (server/ai.ts, public/ai-bridge.user.js). Состояние моста и его ключ — вкладка «ИИ» панели разработчика (DevAi.vue).
import { apiRequest } from '../firebase'

export const PASS = 60                                    // зачёт — от 60 % (рекомендация курса: 60–70 % «идеального» ответа — уже хорошо)
/** Промпт по умолчанию — тот же текст, что SYSTEM в server/ai.ts (у экрана может быть свой: step.prompt, правится в JSON экрана) */
export const SYSTEM = 'Ты проверяешь устный ответ ученика на вопрос (подготовка к собеседованию на Карту поляка, польский язык). '
  + 'Оценивай ответ по смыслу относительно эталона, а не по буквальному совпадению слов. Засчитывай синонимы, перефразирование и иной порядок слов, если смысл сохранён. '
  + 'Ответ надиктован — не снижай оценку за мелкие ошибки распознавания речи. Эталон намеренно полный: 60–70 % его смысла — уже хороший ответ. '
  + 'score — целое 0–100 (полнота передачи смысла эталона); missed_points — короткие пункты на русском только о важных фактах эталона, которые не прозвучали (всё ключевое есть — пустой массив); '
  + 'feedback — одно короткое предложение на русском: по смыслу или по польскому языку ответа, доброжелательно.'

/** Проверка: { score 0–100, missed: [], feedback, ok: score ≥ порога }. prompt, pass — свои у экрана (нет — по умолчанию).
 *  Мост не в сети, чат не ответил — ошибка с текстом сервера
 *  @param {{ question: string, reference: string, answer: string, prompt?: string, pass?: number }} q */
export async function checkAnswer(q, request = apiRequest) {
  const need = Number.isFinite(q.pass) ? q.pass : PASS
  const r = await request('/ai/check', { method: 'POST', body: JSON.stringify({ question: q.question, reference: q.reference, answer: q.answer, prompt: q.prompt?.trim() || undefined }) })
  let body = null
  try { body = await r.json() } catch { /* не JSON */ }
  if (!r.ok) throw new Error(body?.error || 'Ошибка сервера ' + r.status)
  const score = Math.max(0, Math.min(100, Math.round(Number(body?.score) || 0)))
  return { score, missed: Array.isArray(body?.missed) ? body.missed.map(String) : [], feedback: String(body?.feedback ?? ''), ok: score >= need }
}

// «Ответ по смыслу» (упражнение Karta Polaka) через мост — 19.11.2026. Ключей и платного API нет: в браузере преподавателя открыта
// вкладка с чатом (ChatGPT / Gemini / Claude), в ней скрипт Tampermonkey (public/ai-bridge.user.js). Он раз в 25 с спрашивает сервер
// «есть задание?» (долгий запрос), вставляет текст в чат, ждёт ответ и присылает его назад. Ученик ждёт ответа на своём запросе.
// Очередь живёт в памяти: перезапуск сервера — задания пропадают (ученик увидит «проверка недоступна» и сравнит с эталоном сам).
import { randomBytes } from 'node:crypto'
import { fail } from './login.js'

export const SYSTEM = 'Ты проверяешь устный ответ ученика на вопрос (подготовка к собеседованию на Карту поляка, польский язык). '
  + 'Оценивай ответ по смыслу относительно эталона, а не по буквальному совпадению слов. Засчитывай синонимы, перефразирование и иной порядок слов, если смысл сохранён. '
  + 'Ответ надиктован — не снижай оценку за мелкие ошибки распознавания речи. Эталон намеренно полный: 60–70 % его смысла — уже хороший ответ. '
  + 'score — целое 0–100 (полнота передачи смысла эталона); missed_points — короткие пункты на русском только о важных фактах эталона, которые не прозвучали (всё ключевое есть — пустой массив); '
  + 'feedback — одно короткое предложение на русском: по смыслу или по польскому языку ответа, доброжелательно.'

const cut = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

type Q = { question?: unknown; reference?: unknown; answer?: unknown; prompt?: unknown; message?: unknown; format?: unknown }
const fillT = (t: string, v: Record<string, string>) => t.replace(/\{(question|reference|answer|id)\}/g, (_, k) => v[k] ?? '')
/** Текст, который скрипт вставит в чат. id — метка задания: по ней скрипт находит именно этот ответ среди прошлых.
 *  21.11.2026: экран прислал message и format (JSON экрана, src/exercises/kp/defaults.ts → CHAT) — в чат уходит ровно prompt + message + format,
 *  без наших строк сверху; в format обязательно {id}. Не прислал (старое приложение) — как раньше */
export function chatText(id: string, q: Q) {
  const message = cut(q.message, 4000), format = cut(q.format, 2000)
  if (message && format.includes('{id}')) {
    const v = { question: cut(q.question, 300), reference: cut(q.reference, 3000), answer: cut(q.answer, 3000), id }
    return [cut(q.prompt, 4000) || SYSTEM, fillT(message, v), fillT(format, v)].join('\n\n')
  }
  return [
    cut(q.prompt, 4000) || SYSTEM,
    'Это отдельная проверка: прошлые сообщения этого чата не учитывай.',
    '',
    'Вопрос: ' + cut(q.question, 300),
    'Эталон: ' + cut(q.reference, 3000),
    'Ответ ученика: ' + cut(q.answer, 3000),
    '',
    `Ответь ТОЛЬКО одним JSON-объектом без пояснений. Первое поле — id со значением ${id}, затем score, missed_points, feedback. Пример формы: {"id": "…", "score": 70, "missed_points": ["…"], "feedback": "…"}`,
  ].join('\n')
}

/** Ответ чата → { score, missed, feedback }. Ищем JSON-объект с нашим id (чат мог обернуть его в ```json или добавить слова) */
export function parseReply(id: string, text: string) {
  const s = String(text ?? '')
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    let depth = 0, str = false, esc = false
    for (let j = i; j < s.length; j++) {
      const c = s[j]
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue }
      if (c === '"') str = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        let o: Record<string, unknown> | null = null
        try { o = JSON.parse(s.slice(i, j + 1)) } catch { /* не JSON — дальше */ }
        if (o && typeof o === 'object' && String(o.id ?? '') === id && 'score' in o) {
          const score = Math.max(0, Math.min(100, Math.round(Number(o.score) || 0)))
          const missed = (Array.isArray(o.missed_points) ? o.missed_points : []).map((x) => cut(x, 300)).filter(Boolean).slice(0, 8)
          return { score, missed, feedback: cut(o.feedback, 500) }
        }
        break
      }
    }
  }
  return null
}

type Job = { id: string; text: string; at: number; taken: number; site?: string; done: (r: { text?: string; error?: string }) => void }

export function makeAi(o: { loadToken: () => Promise<string>; saveToken: (t: string) => Promise<void>; now?: () => number; jobMs?: number; pollMs?: number; seenMs?: number }) {
  const now = o.now ?? Date.now, JOB = o.jobMs ?? 100_000, POLL = o.pollMs ?? 25_000, SEEN = o.seenMs ?? 60_000
  const queue: Job[] = [], waiting: Array<(j: Job | null) => void> = []
  const st = { seenAt: 0, site: '', served: 0, lastError: '', lastAt: 0, lastMs: 0 }
  const sites = new Map<string, number>()                                      // каждый чат отдельно: когда последний раз спрашивал задание
  const seen = (site: unknown) => { const s = cut(site, 20); st.seenAt = now(); if (s) { st.site = s; sites.set(s, now()) } }
  const live = () => [...sites].filter(([, t]) => now() - t <= SEEN).map(([s]) => s)
  let token = '', loaded: Promise<void> | null = null
  const ensure = () => (loaded ??= o.loadToken().then((t) => { token = t }).catch(() => { loaded = null }))

  const give = () => {
    while (waiting.length) {
      const j = queue.find((x) => !x.taken); if (!j) return
      j.taken = now(); waiting.shift()!(j)
    }
  }

  return {
    /** Проверка: задание в очередь, ждём ответ чата. Моста нет — сразу 503 */
    async check(q: Q) {
      if (!cut(q.answer, 1) || !cut(q.reference, 1)) throw fail(400, 'нет ответа или эталона')
      if (now() - st.seenAt > SEEN) throw fail(503, 'Мост с чатом не в сети — откройте вкладку с чатом и скриптом')
      if (queue.length >= 20) throw fail(503, 'Очередь проверок переполнена — попробуйте через минуту')
      const id = 'k' + randomBytes(3).toString('hex'), t0 = now()
      let job: Job | null = null
      const reply = await new Promise<{ text?: string; error?: string }>((done) => {
        const j: Job = job = { id, text: chatText(id, q), at: t0, taken: 0, done }
        const tm = setTimeout(() => j.done({ error: j.taken ? 'Чат не ответил вовремя' : 'Мост не забрал задание' }), JOB)
        j.done = (r) => { clearTimeout(tm); const i = queue.indexOf(j); if (i >= 0) queue.splice(i, 1); done(r) }
        queue.push(j); give()
      })
      st.lastAt = now(); st.lastMs = st.lastAt - t0
      if (reply.error) { st.lastError = reply.error; throw fail(502, reply.error) }
      const r = parseReply(id, reply.text ?? '')
      if (!r) { st.lastError = 'Чат ответил не JSON'; throw fail(502, 'Чат ответил не в том формате') }
      st.served++; st.lastError = ''
      return { ...r, site: (job as Job | null)?.site ?? '' }          // какой чат проверил (ChatGPT / Gemini / Claude) — значок у ученика
    },
    /** Скрипт спрашивает задание: есть — сразу, нет — ждём до POLL мс. onGone — скрипт отключился до ответа: задание вернуть в очередь */
    async next(site: unknown, onGone: (f: () => void) => void): Promise<{ id: string; text: string } | null> {
      seen(site)
      const j = await new Promise<Job | null>((res) => {
        let over = false
        const fin = (x: Job | null) => { if (over) { if (x) { x.taken = 0; give() } return } over = true; clearTimeout(tm); const i = waiting.indexOf(fin); if (i >= 0) waiting.splice(i, 1); res(x) }
        const tm = setTimeout(() => fin(null), POLL)
        waiting.push(fin); give()
        onGone(() => fin(null))
      })
      seen(site)
      if (j) j.site = cut(site, 20)
      return j && { id: j.id, text: j.text }
    },
    /** Скрипт прислал ответ чата (или ошибку) */
    done(id: unknown, body: { text?: unknown; error?: unknown }) {
      st.seenAt = now()
      const j = queue.find((x) => x.id === String(id ?? ''))
      if (!j) return false
      j.done(body.error ? { error: cut(body.error, 200) } : { text: cut(body.text, 20_000) })
      return true
    },
    /** Для экрана ученика: в сети ли проверка и какие чаты подключены */
    pub() { const l = live(); return { online: now() - st.seenAt <= SEEN, sites: l } },
    status() { return { online: now() - st.seenAt <= SEEN, seenAt: st.seenAt, site: st.site, sites: live(), queue: queue.length, served: st.served, lastError: st.lastError, lastAt: st.lastAt, lastMs: st.lastMs } },
    async token() { await ensure(); return token },
    async newToken() { const t = randomBytes(18).toString('base64url'); await o.saveToken(t); token = t; loaded = Promise.resolve(); return t },
    async isToken(t: unknown) { await ensure(); return !!token && typeof t === 'string' && t.length === token.length && t === token },
  }
}

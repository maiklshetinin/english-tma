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
/** Текст, который скрипт вставит в чат: ровно prompt + message + format, как прислал экран. Своих строк, промпта по умолчанию и обрезки нет.
 *  Подставляются только метки {question} {reference} {answer} {id} внутри message и format */
export function chatText(id: string, q: Q) {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const v = { question: str(q.question), reference: str(q.reference), answer: str(q.answer), id }
  return [str(q.prompt), fillT(str(q.message), v), fillT(str(q.format), v)].filter(Boolean).join('\n\n')
}

/** Ответ чата → { score, missed, feedback, text }. Ищем первый JSON-объект с score (если в тексте была метка id — то с этим id).
 *  Значения отдаём как есть, без округления и обрезки; text — полный ответ чата */
export function parseReply(id: string, text: string, sent = '') {
  const s = String(text ?? ''), needId = sent.includes(id)
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
        if (o && typeof o === 'object' && 'score' in o && (!needId || String(o.id ?? '') === id)) {
          return { score: Number(o.score) || 0, missed: Array.isArray(o.missed_points) ? o.missed_points : [], feedback: String(o.feedback ?? ''), text: s }
        }
        break
      }
    }
  }
  return null
}

type Job = { id: string; text: string; at: number; taken: number; site?: string; done: (r: { text?: string; error?: string }) => void }

export function makeAi(o: { loadToken: () => Promise<string>; saveToken: (t: string) => Promise<void>; now?: () => number; jobMs?: number; pollMs?: number; seenMs?: number; onChange?: (v: { online: boolean; sites: string[] }) => void }) {
  const now = o.now ?? Date.now, JOB = o.jobMs ?? 100_000, POLL = o.pollMs ?? 25_000, SEEN = o.seenMs ?? 60_000
  const queue: Job[] = [], waiting: Array<(j: Job | null) => void> = []
  const st = { seenAt: 0, site: '', served: 0, lastError: '', lastAt: 0, lastMs: 0 }
  const sites = new Map<string, number>()                                      // каждый чат отдельно: когда последний раз спрашивал задание
  const seen = (site: unknown) => { const s = cut(site, 20); st.seenAt = now(); if (s) { st.site = s; sites.set(s, now()) } tick() }
  const live = () => [...sites].filter(([, t]) => now() - t <= SEEN).map(([s]) => s)
  const pub = () => ({ online: now() - st.seenAt <= SEEN, sites: live() })
  // 23.11.2026: статус моста — сразу во вкладки приложения (onChange → WebSocket /live, index.ts), только когда он правда поменялся:
  // мост включили (первый запрос скрипта), выключили (bye) или пропал без bye (60 с тишины — проверка раз в 5 с)
  let lastPub = ''
  const tick = () => { if (!o.onChange) return; const v = pub(), k = JSON.stringify(v); if (k === lastPub) return; lastPub = k; try { o.onChange(v) } catch { /* вкладки — не главное */ } }
  if (o.onChange) setInterval(tick, 5_000).unref?.()
  let token = '', loaded: Promise<void> | null = null
  const ensure = () => (loaded ??= o.loadToken().then((t) => { token = t }).catch(() => { loaded = null }))

  const give = () => {
    while (waiting.length) {
      const j = queue.find((x) => !x.taken); if (!j) return
      j.taken = now(); waiting.shift()!(j)
    }
  }

  /** Общая часть: поставить текст в очередь, дождаться ответа скрипта. Моста нет — 503; чат не ответил — 502 */
  const run = async (id: string, text: string) => {
    if (now() - st.seenAt > SEEN) throw fail(503, 'Мост с чатом не в сети — откройте вкладку с чатом и скриптом')
    if (queue.length >= 20) throw fail(503, 'Очередь проверок переполнена — попробуйте через минуту')
    const t0 = now()
    let job: Job | null = null
    const reply = await new Promise<{ text?: string; error?: string }>((done) => {
      const j: Job = job = { id, text, at: t0, taken: 0, done }
      const tm = setTimeout(() => j.done({ error: j.taken ? 'Чат не ответил вовремя' : 'Мост не забрал задание' }), JOB)
      j.done = (r) => { clearTimeout(tm); const i = queue.indexOf(j); if (i >= 0) queue.splice(i, 1); done(r) }
      queue.push(j); give()
    })
    st.lastAt = now(); st.lastMs = st.lastAt - t0
    if (reply.error) { st.lastError = reply.error; throw fail(502, reply.error) }
    return { reply, job: job as Job | null }
  }

  return {
    /** Проверка: текст экрана — в очередь, ждём ответ чата. Моста нет — сразу 503 */
    async check(q: Q) {
      const id = 'k' + randomBytes(3).toString('hex'), sent = chatText(id, q)
      if (!sent.trim()) throw fail(400, 'нечего отправлять в чат')
      if (!sent.includes(id)) throw fail(400, 'В message или format нет метки {id}: по ней скрипт моста находит ответ чата')          // без метки скрипт ждёт ответ 85 с и отдаёт ошибку
      const { reply, job } = await run(id, sent)
      const r = parseReply(id, reply.text ?? '', sent)
      if (!r) { st.lastError = 'Чат ответил не JSON'; throw fail(502, 'Чат ответил не в том формате') }
      st.served++; st.lastError = ''
      return { ...r, site: job?.site ?? '' }          // какой чат проверил (ChatGPT / Gemini / Claude) — значок у ученика
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
      st.seenAt = now(); tick()
      const j = queue.find((x) => x.id === String(id ?? ''))
      if (!j) return false
      j.done(body.error ? { error: cut(body.error, 200) } : { text: String(body.text ?? '') })
      return true
    },
    /** Скрипт выключили во вкладке (мост 1.6, 23.11.2026): этого чата больше нет. Чатов не осталось — «не в сети» сразу (не ждём 60 с),
     *  проверки, которые ещё никто не взял, — сразу ошибкой (не ждут 100 с). Взятую — дописывает тот же скрипт */
    bye(site: unknown) {
      const s = cut(site, 20); if (s) sites.delete(s)
      if (live().length) { tick(); return { online: true, sites: live() } }
      st.seenAt = 0; tick()
      for (const j of [...queue]) if (!j.taken) j.done({ error: 'Мост выключили — проверка не ушла в чат' })
      return { online: false, sites: [] }
    },
    /** Для экрана ученика: в сети ли проверка и какие чаты подключены */
    pub,
    tick,
    status() { return { online: now() - st.seenAt <= SEEN, seenAt: st.seenAt, site: st.site, sites: live(), queue: queue.length, served: st.served, lastError: st.lastError, lastAt: st.lastAt, lastMs: st.lastMs } },
    async token() { await ensure(); return token },
    async newToken() { const t = randomBytes(18).toString('base64url'); await o.saveToken(t); token = t; loaded = Promise.resolve(); return t },
    async isToken(t: unknown) { await ensure(); return !!token && typeof t === 'string' && t.length === token.length && t === token },
  }
}

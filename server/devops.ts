// Слежка за сервером — для разработчика («Профиль → Для разработчика → Сервер» и «Консоль»).
//  • Консоль: всё, что сервер пишет в console.log / warn / error, копится в памяти (последние LOG_MAX строк) и сразу уходит
//    разработчику по живому соединению (live.ts, подписка { t: 'logs', on }). Перезапуск сервера их стирает — полная история в Render.
//  • Запросы: на каждый ответ — метка («GET /schedule»), код и время; по минутам за сутки: сколько, ошибки 4xx / 5xx, среднее и худшее время.
//  • Процесс: раз в 15 с — память (RSS и куча) и загрузка CPU; на бесплатном Render лимит памяти 512 МБ.
import { format } from 'node:util'

export type Level = 'log' | 'warn' | 'error'
export interface Line { id: number; t: number; lv: Level; msg: string }
export const LOG_MAX = 1500
const lines: Line[] = []
let lineSeq = 0
const listeners = new Set<(l: Line) => void>()
export const onLine = (fn: (l: Line) => void) => { listeners.add(fn); return () => listeners.delete(fn) }
/** Строки консоли после id (0 — все, что есть) */
export const logs = (after = 0) => lines.filter((l) => l.id > after)

export function pushLine(lv: Level, msg: string): Line {
  const l = { id: ++lineSeq, t: Date.now(), lv, msg: msg.length > 4000 ? msg.slice(0, 4000) + '…' : msg }
  lines.push(l); if (lines.length > LOG_MAX) lines.splice(0, lines.length - LOG_MAX)
  for (const fn of listeners) { try { fn(l) } catch { /* подписчик не должен ронять логирование */ } }
  return l
}
let captured = false
/** Перехватить console.*: в Render строки идут как раньше, плюс копия — в нашу консоль */
export function captureConsole(): void {
  if (captured) return
  captured = true
  for (const [name, lv] of [['log', 'log'], ['info', 'log'], ['warn', 'warn'], ['error', 'error']] as const) {
    const orig = console[name].bind(console)
    console[name] = (...a: unknown[]) => { orig(...a); pushLine(lv, format(...a)) }
  }
}

// ── запросы и процесс по минутам ────────────────────────────────────────────────────────────────
interface Min { req: number; e4: number; e5: number; ms: number; max: number; rss: number; heap: number; cpu: number; cpuN: number; conns: number }
interface Rt { n: number; ms: number; max: number; e: number }
const mins = new Map<number, Min>()
const rmins = new Map<number, Map<string, Rt>>()
const KEEP = 1440
const minOf = (t = Date.now()) => Math.floor(t / 60_000)
function cur(m = minOf()): Min {
  let b = mins.get(m)
  if (!b) { mins.set(m, (b = { req: 0, e4: 0, e5: 0, ms: 0, max: 0, rss: 0, heap: 0, cpu: 0, cpuN: 0, conns: 0 })); for (const k of mins.keys()) if (k <= m - KEEP) mins.delete(k) }
  return b
}
export const startedAt = Date.now()

/** Ответ на запрос: метка, код, время */
export function onRequest(label: string, status: number, ms: number): void {
  const m = minOf(), b = cur(m)
  b.req++; b.ms += ms; b.max = Math.max(b.max, ms)
  if (status >= 500) b.e5++; else if (status >= 400) b.e4++
  let r = rmins.get(m)
  if (!r) { rmins.set(m, (r = new Map())); for (const k of rmins.keys()) if (k <= m - KEEP) rmins.delete(k) }
  const x = r.get(label) ?? { n: 0, ms: 0, max: 0, e: 0 }
  x.n++; x.ms += ms; x.max = Math.max(x.max, ms); if (status >= 500) x.e++
  r.set(label, x)
}

let sampler: ReturnType<typeof setInterval> | null = null
/** Раз в 15 с — память и CPU процесса, conns() — сколько людей на живом соединении */
export function startSampler(conns: () => number = () => 0): void {
  if (sampler) return
  let prev = process.cpuUsage(), pt = performance.now()
  const tick = () => {
    const u = process.cpuUsage(prev), now = performance.now(), mem = process.memoryUsage()
    const cpu = ((u.user + u.system) / 1000 / Math.max(1, now - pt)) * 100
    prev = process.cpuUsage(); pt = now
    const b = cur()
    b.rss = Math.max(b.rss, mem.rss / 1048576); b.heap = Math.max(b.heap, mem.heapUsed / 1048576)
    b.cpu += cpu; b.cpuN++; b.conns = Math.max(b.conns, conns())
  }
  tick(); sampler = setInterval(tick, 15_000); sampler.unref()
}

export type SRange = 'hour' | 'day'
export const SRANGES: Record<SRange, { step: number; n: number }> = { hour: { step: 60, n: 60 }, day: { step: 3600, n: 24 } }
const r1 = (v: number) => Math.round(v * 10) / 10

/** Точки по шагам окна и самые тяжёлые запросы за окно */
export function serverStats(range: SRange) {
  const { step, n } = SRANGES[range], k = step / 60, endMin = minOf(), start = (Math.floor((endMin * 60) / step) - n + 1) * step / 60
  const acc = Array.from({ length: n }, (_, i) => ({ t: (start + i * k) * 60_000, req: 0, e4: 0, e5: 0, ms: 0, max: 0, rss: 0, heap: 0, cpu: 0, cpuN: 0, conns: 0 }))
  for (const [m, b] of mins) {
    const i = Math.floor((m - start) / k); if (i < 0 || i >= n) continue
    const a = acc[i]
    a.req += b.req; a.e4 += b.e4; a.e5 += b.e5; a.ms += b.ms; a.max = Math.max(a.max, b.max)
    a.rss = Math.max(a.rss, b.rss); a.heap = Math.max(a.heap, b.heap); a.cpu += b.cpu; a.cpuN += b.cpuN; a.conns = Math.max(a.conns, b.conns)
  }
  const points = acc.map((a) => ({ t: a.t, req: a.req, e4: a.e4, e5: a.e5, avg: a.req ? Math.round(a.ms / a.req) : 0, max: Math.round(a.max), rss: r1(a.rss), heap: r1(a.heap), cpu: a.cpuN ? r1(a.cpu / a.cpuN) : 0, conns: a.conns }))
  const top = new Map<string, Rt>()
  for (const [m, r] of rmins) {
    if (m < start || m >= start + n * k) continue
    for (const [label, x] of r) { const s = top.get(label) ?? { n: 0, ms: 0, max: 0, e: 0 }; s.n += x.n; s.ms += x.ms; s.max = Math.max(s.max, x.max); s.e += x.e; top.set(label, s) }
  }
  const routes = [...top].map(([label, x]) => ({ label, n: x.n, avg: Math.round(x.ms / x.n), max: Math.round(x.max), total: Math.round(x.ms), e: x.e }))
    .sort((a, b) => b.total - a.total).slice(0, 12)
  const mem = process.memoryUsage()
  return { range, step, points, routes, now: { rss: r1(mem.rss / 1048576), heap: r1(mem.heapUsed / 1048576) }, startedAt, node: process.version }
}

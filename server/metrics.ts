// Нагрузка на базу — для разработчика («Профиль → Для разработчика → Нагрузка на базу»).
// Два источника:
//  1) Google Cloud Monitoring — те же цифры, что график Usage в Firebase и счёт Google (Reads / Writes / Deletes),
//     сервисному аккаунту нужна роль Monitoring Viewer. Задержка у Google — 2–4 минуты.
//  2) свой счётчик «кто читает»: каждое чтение и запись сервера (firebase-admin) с меткой запроса, к которому оно относится
//     (AsyncLocalStorage: «GET /schedule», «POST /lessons/:id/done»…), по минутам за сутки и по часам за 31 день. Чтения из консоли
//     Firebase сюда не попадают — их видно только в (1).
import { AsyncLocalStorage } from 'node:async_hooks'
import { Query, Firestore, Transaction, WriteBatch } from 'firebase-admin/firestore'

export type Range = 'hour' | 'day' | 'month'
export const RANGES: Record<Range, { step: number; n: number }> = {
  hour: { step: 60, n: 60 },            // час по минутам
  day: { step: 3600, n: 24 },           // сутки по часам
  month: { step: 86400, n: 30 },        // месяц по дням
}

// ── свой счётчик ──────────────────────────────────────────────────────────────────────────────
const als = new AsyncLocalStorage<string>()
export const inRoute = <T>(label: string, fn: () => T): T => als.run(label, fn)
type Cnt = { r: number; w: number }
const minutes = new Map<number, Map<string, Cnt>>()       // минута (unix/60) → метка → счёт; хранится сутки
const hours = new Map<number, Map<string, Cnt>>()         // час (unix/3600) → метка → счёт; хранится 31 день
export const since = Date.now()
export function add(kind: 'r' | 'w', n: number): void {
  if (!(n > 0)) return
  const label = als.getStore() ?? 'фон', now = Math.floor(Date.now() / 1000)
  for (const [map, key, keep] of [[minutes, Math.floor(now / 60), 1440], [hours, Math.floor(now / 3600), 744]] as const) {
    let b = map.get(key)
    if (!b) { map.set(key, (b = new Map())); for (const k of map.keys()) if (k <= key - keep) map.delete(k) }
    const c = b.get(label) ?? { r: 0, w: 0 }; c[kind] += n; b.set(label, c)
  }
}
const sizeOf = (v: unknown) => (Array.isArray(v) ? v.length : typeof (v as { size?: unknown })?.size === 'number' ? Math.max(1, (v as { size: number }).size) : 1)      // пустой запрос Google тоже считает за 1 чтение

let installed = false
/** Подменить методы чтения и записи firebase-admin, чтобы считать их. Только на настоящей базе (в тестах — нет). */
export function countFirestore(): void {
  if (installed) return
  installed = true
  const wrapRead = (proto: object, name: string) => {
    const p = proto as Record<string, (...a: unknown[]) => Promise<unknown>>, f = p[name]
    if (typeof f !== 'function') return
    p[name] = function (this: unknown, ...a: unknown[]) { const r = f.apply(this, a); r.then((v) => add('r', sizeOf(v)), () => {}); return r }
  }
  wrapRead(Query.prototype, 'get')                  // запросы и коллекции целиком
  wrapRead(Firestore.prototype, 'getAll')           // doc.get() идёт сюда же
  wrapRead(Transaction.prototype, 'get')
  wrapRead(Transaction.prototype, 'getAll')
  const wb = WriteBatch.prototype as unknown as { _commit: (...a: unknown[]) => Promise<unknown>; _opCount: number }
  const commit = wb._commit
  if (typeof commit === 'function') wb._commit = function (this: { _opCount: number }, ...a: unknown[]) { const n = this._opCount; const r = commit.apply(this, a); r.then(() => add('w', n), () => {}); return r }      // и batch, и set/update/delete, и транзакции
}

const unixNow = () => Math.floor(Date.now() / 1000)
/** Начало окна: выровнено по шагу (час — по минутам, сутки — по часам, месяц — по суткам UTC) */
export const windowStart = (range: Range, now = unixNow()) => { const { step, n } = RANGES[range]; return (Math.floor(now / step) - n + 1) * step }

/** Свой счётчик по шагам окна (как у Google) и топ меток за окно */
export function ours(range: Range) {
  const { step, n } = RANGES[range], start = windowStart(range)
  const points = Array.from({ length: n }, (_, i) => ({ t: (start + i * step) * 1000, r: 0, w: 0 }))
  const top = new Map<string, Cnt>()
  const src = range === 'month' ? hours : minutes, unit = range === 'month' ? 3600 : 60
  for (const [k, b] of src) {
    const i = Math.floor((k * unit - start) / step)
    if (i < 0 || i >= n) continue
    for (const [label, c] of b) {
      points[i].r += c.r; points[i].w += c.w
      const s = top.get(label) ?? { r: 0, w: 0 }; s.r += c.r; s.w += c.w; top.set(label, s)
    }
  }
  return { points, top: [...top].map(([label, c]) => ({ label, ...c })).sort((a, b) => b.r - a.r || b.w - a.w).slice(0, 12) }
}

// ── Google Cloud Monitoring ─────────────────────────────────────────────────────────────────────
type Token = () => Promise<{ access_token: string }>
const METRICS = { r: 'document/read_count', w: 'document/write_count', d: 'document/delete_count' } as const
const memo = new Map<string, { at: number; v: Promise<GPoint[]> }>()
export type GPoint = { t: number; r: number; w: number; d: number }

/** Reads / Writes / Deletes из Cloud Monitoring по шагам окна; 60 секунд держим ответ в памяти */
export function google(token: Token, project: string, range: Range, fetchFn: typeof fetch = fetch): Promise<GPoint[]> {
  const m = memo.get(range)
  if (m && Date.now() - m.at < 60_000) return m.v
  const v = load(token, project, range, fetchFn)
  memo.set(range, { at: Date.now(), v })
  v.catch(() => memo.delete(range))
  return v
}
async function load(token: Token, project: string, range: Range, fetchFn: typeof fetch): Promise<GPoint[]> {
  const { step, n } = RANGES[range], start = windowStart(range), end = Math.max(unixNow(), start + 1)
  const pts: GPoint[] = Array.from({ length: n }, (_, i) => ({ t: (start + i * step) * 1000, r: 0, w: 0, d: 0 }))
  const { access_token } = await token()
  await Promise.all(Object.entries(METRICS).map(async ([k, metric]) => {
    const q = new URLSearchParams({
      filter: `metric.type="firestore.googleapis.com/${metric}"`,
      'interval.startTime': new Date(start * 1000).toISOString(),
      'interval.endTime': new Date(end * 1000).toISOString(),
      'aggregation.alignmentPeriod': step + 's',
      'aggregation.perSeriesAligner': 'ALIGN_SUM',
      'aggregation.crossSeriesReducer': 'REDUCE_SUM',
    })
    const res = await fetchFn(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${q}`, { headers: { authorization: `Bearer ${access_token}` } })
    const body = await res.json().catch(() => ({})) as { error?: { message?: string }; timeSeries?: { points?: { interval: { endTime: string }; value: { int64Value?: string; doubleValue?: number } }[] }[] }
    if (!res.ok) throw Object.assign(new Error(body.error?.message || `Cloud Monitoring: ${res.status}`), { status: res.status === 403 ? 403 : 502 })
    for (const s of body.timeSeries ?? []) for (const p of s.points ?? []) {
      const i = Math.min(n - 1, Math.ceil((Date.parse(p.interval.endTime) / 1000 - start) / step) - 1)          // Google выравнивает шаги от «сейчас» назад: точку кладём в шаг, где она кончается
      if (i >= 0 && i < n) pts[i][k as 'r' | 'w' | 'd'] += Number(p.value.int64Value ?? p.value.doubleValue ?? 0)
    }
  }))
  return pts
}

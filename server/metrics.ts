// Нагрузка на базу — для разработчика («Профиль → Для разработчика → Нагрузка на базу»).
// Свой счётчик сервера: каждое чтение и запись firebase-admin с меткой запроса, к которому оно относится (AsyncLocalStorage:
// «GET /schedule», «POST /lessons/:id/done»…), по минутам за сутки и по часам за 31 день. Это почти вся нагрузка — приложение ходит
// в базу только через сервер; чтения из консоли Firebase сюда не попадают (точные цифры для счёта — Firebase → Firestore → Usage).
// Живёт в памяти: перезапуск сервера обнуляет.
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

// Кэш чтений базы в памяти сервера (17.11.2026). Firestore считает каждый прочитанный документ, а открытие приложения
// у преподавателя читало ~400 документов (ученики, уроки нескольких недель, контент) — и так при каждом открытии и перечитывании.
// Все правки идут только через этот сервер, поэтому он может держать прочитанное у себя и сбрасывать при правке:
//  • уроки — по неделям ('w:<понедельник>'), сбрасывает schedule.ts ровно ту неделю, которую поменял;
//  • ученики ('students:'), контент ('c:'), группы ('g:') — сбрасывают их модули при своих правках и index.ts после удачных запросов.
// Срок — по умолчанию 10 минут, разработчик меняет в «Профиле → Для разработчика» (0 — кэш выключен); правку руками в консоли Firebase
// сервер увидит не позже срока. Кэш свой у каждого экземпляра базы (тесты не мешают друг другу).
import { noteCached } from './metrics.js'
const stores = new WeakMap<object, Map<string, { at: number; v: Promise<unknown>; n: number }>>()
export const CACHE_MS = 10 * 60_000
let ttlMs = CACHE_MS
export const cacheTtl = () => ttlMs
export function setCacheTtl(ms: number): void { ttlMs = Math.max(0, Math.min(24 * 60 * 60_000, Math.round(ms) || 0)) }
const of = (db: object) => { let m = stores.get(db); if (!m) stores.set(db, (m = new Map())); return m }
// Счётчик для разработчика: сколько документов сервер прочитал из базы и сколько отдал из памяти (с запуска сервера)
export const cacheStats = { since: Date.now(), reads: 0, saved: 0 }
const docsIn = (v: unknown) => (Array.isArray(v) ? v.length : typeof (v as { size?: unknown })?.size === 'number' ? (v as { size: number }).size : 1)

/** Прочитать через кэш: свежее (моложе срока) — из памяти, иначе load(). Пока чтение идёт, повторные запросы ждут его же. */
export function cached<T>(db: object, key: string, load: () => Promise<T>, ttl = ttlMs): Promise<T> {
  const m = of(db), c = m.get(key)
  if (c && Date.now() - c.at < ttl) { cacheStats.saved += c.n; noteCached(c.n); return c.v as Promise<T> }
  const v = load(), e = { at: Date.now(), v: v as Promise<unknown>, n: 0 }
  if (ttl > 0) m.set(key, e)
  v.then((x) => { e.n = docsIn(x); cacheStats.reads += e.n }, () => { if (m.get(key) === e) m.delete(key) })          // ошибка чтения — не запоминаем
  return v
}
/** Поправить уже закэшированное значение на месте (после записи) — чтобы не перечитывать всё из базы. Нет записи в кэше — ничего не делает */
export function patchCache<T>(db: object, key: string, fn: (v: T) => T): void {
  const m = stores.get(db), e = m?.get(key); if (!m || !e) return
  const nv = (e.v as Promise<T>).then(fn)
  nv.catch(() => { if (m.get(key) === e) m.delete(key) })          // не получилось (или чтение упало) — запись не держим
  e.v = nv
}
/** Сколько сейчас записей в кэше */
export const cacheSize = (db: object) => stores.get(db)?.size ?? 0

/** Сбросить ключи, начинающиеся с любого из префиксов (без префиксов — всё) */
export function dropCache(db: object, ...prefixes: string[]): void {
  const m = stores.get(db); if (!m) return
  for (const k of [...m.keys()]) if (!prefixes.length || prefixes.some((p) => k.startsWith(p))) m.delete(k)
}

/** Обернуть методы модуля: после любого метода, кроме чтений (reads), — сбросить кэш с этими префиксами */
export function dropAfterWrites<T extends Record<string, unknown>>(api: T, db: object, prefixes: string[], reads: string[]): T {
  for (const k of Object.keys(api)) {
    const f = api[k]
    if (typeof f !== 'function' || reads.includes(k)) continue
    ;(api as Record<string, unknown>)[k] = async function (this: unknown, ...a: unknown[]) { try { return await (f as (...x: unknown[]) => unknown).apply(this, a) } finally { dropCache(db, ...prefixes) } }
  }
  return api
}

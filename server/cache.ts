// Кэш чтений базы в памяти сервера (17.11.2026). Firestore считает каждый прочитанный документ, а открытие приложения
// у преподавателя читало ~400 документов (ученики, уроки нескольких недель, контент) — и так при каждом открытии и перечитывании.
// Все правки идут только через этот сервер, поэтому он может держать прочитанное у себя и сбрасывать при правке:
//  • уроки — по неделям ('w:<понедельник>'), сбрасывает schedule.ts ровно ту неделю, которую поменял;
//  • ученики ('students:'), контент ('c:'), группы ('g:') — сбрасывают их модули при своих правках и index.ts после удачных запросов.
// Срок — 10 минут: правку руками в консоли Firebase сервер увидит не позже. Кэш свой у каждого экземпляра базы (тесты не мешают друг другу).
const stores = new WeakMap<object, Map<string, { at: number; v: Promise<unknown> }>>()
export const CACHE_MS = 10 * 60_000
const of = (db: object) => { let m = stores.get(db); if (!m) stores.set(db, (m = new Map())); return m }

/** Прочитать через кэш: свежее (моложе ttl) — из памяти, иначе load(). Пока чтение идёт, повторные запросы ждут его же. */
export function cached<T>(db: object, key: string, load: () => Promise<T>, ttl = CACHE_MS): Promise<T> {
  const m = of(db), c = m.get(key)
  if (c && Date.now() - c.at < ttl) return c.v as Promise<T>
  const v = load()
  m.set(key, { at: Date.now(), v })
  v.catch(() => { if (m.get(key)?.v === v) m.delete(key) })          // ошибка чтения — не запоминаем
  return v
}

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

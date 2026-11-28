// Загрузка данных «по требованию»: экран (вкладка) просит то, что ему нужно, а здесь решается, читать ли это с сервера.
//  • Прочитанное в этой сессии считается свежим FRESH_MS — повторный вход на вкладку ничего не запрашивает.
//  • Два одновременных запроса одних данных — один поход на сервер (второй ждёт первый).
//  • Не удалось прочитать — данные не считаются прочитанными, следующий вход попробует снова.
//  • Данные, которые сейчас не нужны экрану, при «коллега изменил» / возвращении в приложение не перечитываются, а помечаются
//    устаревшими: прочитаются, когда понадобятся (markStale).
// Модуль без Pinia и без импортов сторов: сторы и вход могут его подключать, не создавая круг импортов.

export const FRESH_MS = 60_000      // столько прочитанное считается свежим (как «вернулся через минуту» в useActive.js)

interface Slot { at: number; stale: boolean; p: Promise<void> | null }
const slots = new Map<string, Slot>()
const slot = (key: string): Slot => { let s = slots.get(key); if (!s) slots.set(key, s = { at: 0, stale: false, p: null }); return s }

/** Данные уже читались в этой сессии (пусть и устарели). */
export const isLoaded = (key: string): boolean => (slots.get(key)?.at ?? 0) > 0
/** Данные прочитаны, свежи и ничего не нужно запрашивать. */
export function isFresh(key: string, ttl = FRESH_MS): boolean {
  const s = slots.get(key)
  return !!s && s.at > 0 && !s.stale && Date.now() - s.at < ttl
}
/** Какие данные уже читались — их и стоит обновлять при возвращении, остальные пока никому не нужны. */
export const loadedKeys = (): string[] => [...slots].filter(([, s]) => s.at > 0).map(([k]) => k)

/**
 * Прочитать данные, если они ещё не читались, устарели или помечены устаревшими; иначе — сразу готово.
 * force — читать в любом случае (если такое чтение уже идёт, дождаться его и прочитать ещё раз: оно могло начаться до правки).
 * Ошибку чтения получает вызывающий (экран решает: тост или тишина).
 */
export function load(key: string, fn: () => Promise<unknown> | unknown, o: { force?: boolean; ttl?: number } = {}): Promise<void> {
  const s = slot(key)
  if (s.p) return o.force ? s.p.catch(() => {}).then(() => load(key, fn, o)) : s.p
  if (!o.force && isFresh(key, o.ttl)) return Promise.resolve()
  const p: Promise<void> = (async () => { await fn(); s.at = Date.now(); s.stale = false })().finally(() => { if (s.p === p) s.p = null })
  s.p = p
  return p
}

/** Данные могли измениться: при следующем «нужно» — прочитать заново. */
export function markStale(key: string): void { const s = slots.get(key); if (s) s.stale = true }

/** Выход из аккаунта: в новой сессии ничего не прочитано. */
export function resetLazy(): void { slots.clear() }

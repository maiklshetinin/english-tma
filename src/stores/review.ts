// Review — «Твой словарь»: слова и фразы из пройденных уроков и их сила (расчёт — utils/review.ts).
// С сервером: словарь в базе у каждого своего (GET/POST /review, server/review.ts). Ответы считаются здесь же сразу,
// а на сервер уходят пачкой (только изменённые записи) через пару секунд; нет сети — ждут в этом браузере и уйдут потом.
// Без сервера (демо, локальная разработка) — только в этом браузере (localStorage), как раньше.
import { reactive } from 'vue'
import { applyHits, hitsOf, exName, keyOf, type RItem } from '../utils/review'
import type { Step } from '../utils/lesson'
import { apiRequest, isDemo, API, fb } from '../firebase'

const KEY = 'tma.review.v1', PEND = 'tma.review.pending.v1', OWNER = 'tma.review.owner.v1'
const BATCH = 200                                     // как REVIEW_LIMITS.batch на сервере
const online = () => !isDemo && !!API && !!fb
const read = <T>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* приватный режим */ } }

export const review = reactive<{ items: Record<string, RItem>; sync: 'local' | 'loading' | 'synced' | 'error' }>({
  items: read(KEY, {}), sync: online() ? 'loading' : 'local',
})
const pending = new Set<string>(read<string[]>(PEND, []))            // ключи, которые ещё не ушли на сервер
const save = () => { write(KEY, review.items); write(PEND, [...pending]) }

let timer: ReturnType<typeof setTimeout> | undefined, busy = false
const later = (ms: number) => { clearTimeout(timer); timer = setTimeout(push, ms) }
async function push() {
  if (!online() || busy || !pending.size) return
  busy = true
  const keys = [...pending].slice(0, BATCH)
  const items = Object.fromEntries(keys.filter((k) => review.items[k]).map((k) => [k, review.items[k]]))
  try {
    const r = await apiRequest('/review', { method: 'POST', body: JSON.stringify({ items }) })
    if (!r.ok) throw new Error(String(r.status))
    keys.forEach((k) => pending.delete(k)); save(); review.sync = 'synced'
    if (pending.size) later(300)
  } catch { review.sync = 'error'; later(20_000) }                 // нет сети / сервер спит — повторим
  finally { busy = false }
}

/** Загрузить свой словарь с сервера (при открытии Review и просмотра курса). owner — кто вошёл: сменился — чужое не отправляем */
export async function syncReview(owner?: string | number | null) {
  if (!online()) { review.sync = 'local'; return }
  const me = owner == null ? null : String(owner), was = read<string | null>(OWNER, null)
  if (me && was !== me) {
    if (was !== null) { review.items = {}; pending.clear() }            // в этом браузере был другой пользователь
    else Object.keys(review.items).forEach((k) => pending.add(k))      // первый раз с сервером — словарь из браузера переезжает в базу
    write(OWNER, me); save()
  }
  review.sync = 'loading'
  try {
    const r = await apiRequest('/review')
    if (!r.ok) throw new Error(String(r.status))
    const srv = ((await r.json()) as { items?: Record<string, RItem> }).items ?? {}
    for (const k of pending) if (review.items[k]) srv[k] = review.items[k]      // ещё не отправленное — новее серверного
    review.items = srv; save(); review.sync = 'synced'
    if (pending.size) later(0)
  } catch { review.sync = 'error' }
}

/** Ответ на экран урока → в словарь */
export function recordStep(step: Step, res: { ok?: boolean | null; wrong?: number[] }, ctx: { lesson?: string; course?: string } = {}) {
  const hits = hitsOf(step, res); if (!hits.length) return
  applyHits(review.items, hits, { ex: exName(step), ...ctx })
  for (const h of hits) { const k = keyOf(h.text); if (review.items[k]) pending.add(k) }
  save(); if (online()) later(2000)
}

/** «Очистить» — свой словарь (и на сервере) */
export async function resetReview() {
  review.items = {}; pending.clear(); save()
  if (online()) try { await apiRequest('/review/reset', { method: 'POST', body: '{}' }) } catch { /* потом */ }
}

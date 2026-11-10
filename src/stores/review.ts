// Review — «Твой словарь»: слова и фразы из пройденных уроков и их сила (расчёт — utils/review.ts).
// С сервером: словарь в базе у каждого своего (GET/POST /review, server/review.ts). Ответы считаются здесь же сразу,
// а на сервер уходят пачкой (только изменённые записи) через пару секунд; нет сети — ждут в этом браузере и уйдут потом.
// Без сервера (демо, локальная разработка) — только в этом браузере (localStorage), как раньше.
import { reactive } from 'vue'
import { tagHits, type Topic } from '../utils/skills'
import { applyHits, hitsOf, exName, keyOf, type RItem, type AlgoCfg } from '../utils/review'
import { algo, ALGO_KEY as ALGO } from './algo'
export { algo }
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
/** Настройки алгоритма (FSRS): с сервера; без сервера — в этом браузере */
let algoLoaded = false
export async function loadAlgo(force = false) {
  if (!online() || (algoLoaded && !force)) return
  try { const r = await apiRequest('/review/settings'); if (r.ok) { Object.assign(algo, await r.json()); write(ALGO, { ...algo }); algoLoaded = true } } catch { /* сеть — останутся прежние */ }
}
/** Сохранить настройки (преподаватель). true — сохранено */
export async function saveAlgo(cfg: AlgoCfg): Promise<boolean> {
  if (online()) {
    try { const r = await apiRequest('/review/settings', { method: 'PUT', body: JSON.stringify(cfg) }); if (!r.ok) return false; Object.assign(algo, await r.json()) } catch { return false }
  } else Object.assign(algo, cfg)
  write(ALGO, { ...algo }); return true
}
const pending = new Set<string>(read<string[]>(PEND, []))            // ключи, которые ещё не ушли на сервер
const save = () => { write(KEY, review.items); write(PEND, [...pending]) }

let timer: ReturnType<typeof setTimeout> | undefined, busy = false, inflight: Promise<void> = Promise.resolve()
const later = (ms: number) => { clearTimeout(timer); timer = setTimeout(push, ms) }
function push() { inflight = pushNow(); return inflight }
async function pushNow() {
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
  loadAlgo()
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
export function recordStep(step: Step, res: { ok?: boolean | null; wrong?: number[] }, ctx: { lesson?: string; course?: string; topic?: Topic } = {}) {
  // слова экрана + его навыки и тема урока (вкладка «Грамматика и навыки»)
  const hits = [...hitsOf(step, res), ...tagHits(step, res, ctx.topic)]; if (!hits.length) return
  applyHits(review.items, hits, { ex: exName(step), lesson: ctx.lesson, course: ctx.course }, Date.now(), { ...algo })
  for (const h of hits) { const k = h.key ?? keyOf(h.text); if (review.items[k]) pending.add(k) }
  save(); if (online()) later(2000)
}

/** «Очистить» — свой словарь целиком, и на сервере. Сначала ждём отправку, которая уже в пути, — иначе она вернула бы слова на сервер.
 *  true — очищено (без сервера — только в этом браузере), false — сервер не ответил. */
export async function resetReview(): Promise<boolean> {
  clearTimeout(timer); await inflight.catch(() => {})
  review.items = {}; pending.clear(); save()
  if (!online()) return true
  try { const r = await apiRequest('/review/reset', { method: 'POST', body: '{}' }); return r.ok } catch { return false }
}

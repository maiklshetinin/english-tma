// Review: слова и фразы из пройденных уроков и их сила (расчёт — utils/review.ts).
// Пока — в этом браузере (localStorage), чтобы посмотреть и подкрутить алгоритм; потом — на сервер, у каждого ученика свой.
import { reactive } from 'vue'
import { applyHits, hitsOf, exName, type RItem } from '../utils/review'
import type { Step } from '../utils/lesson'

const KEY = 'tma.review.v1'
const load = (): Record<string, RItem> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {} } catch { return {} } }
export const review = reactive<{ items: Record<string, RItem> }>({ items: load() })
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(review.items)) } catch { /* приватный режим */ } }

/** Ответ на экран урока → в словарь */
export function recordStep(step: Step, res: { ok?: boolean | null; wrong?: number[] }, ctx: { lesson?: string; course?: string } = {}) {
  const hits = hitsOf(step, res); if (!hits.length) return
  applyHits(review.items, hits, { ex: exName(step), ...ctx }); save()
}
export function resetReview() { review.items = {}; save() }

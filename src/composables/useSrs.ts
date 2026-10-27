// Интервальные повторения как в Anki: шаги изучения 1 мин → 10 мин, затем FSRS (src/utils/fsrs.ts). Оценки: 0 Снова, 1 Трудно, 2 Хорошо, 3 Легко.
// Прогресс хранится отдельно у каждого пользователя (stores/srs.ts): userKey — 'teacher' или id ученика, поэтому одну колоду
// можно назначить многим ученикам без смешения прогресса. Здесь — только алгоритм и подсчёты, без собственного состояния.
import type { Card, Deck, SrsState } from '../../server/types'
import { useSrsStore } from '../stores/srs'
import { ymd, relDay } from '../utils/dates'
import { answer, label, dueMs, phaseOf, LEARN_AHEAD } from '../utils/fsrs'

export const LEARNED_DAYS = 21         // слово «выучено» (как «зрелые» в Anki), когда интервал повторения ≥ 21 дня
export const today = (): string => ymd(new Date())
const inDays = (n: number): string => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }

type Key = string | null | undefined
const cardsOf = (userKey: Key): Record<string, SrsState> => useSrsStore().of(userKey)?.cards ?? {}

export const srsOf = (userKey: Key, card: Card): SrsState | null => cardsOf(userKey)[card.id] ?? null
// new — ещё не показывалась; learn — на шагах изучения / переучивания (минуты); review — обычное повторение (дни)
export const kindOf = (s: SrsState | null): 'new' | 'learn' | 'review' => { const p = phaseOf(s); return p === 'new' ? 'new' : p === 'review' ? 'review' : 'learn' }

/** Состояние после ответа q (0–3) — FSRS как в Anki. */
export const nextSrs = (srs: SrsState | null, q: number, now = Date.now()): SrsState => answer(srs, q, now)

/** Оценить карточку: считает новое состояние и записывает ответ (на сервер уходит только свой прогресс). */
export function rate(userKey: string, card: Card, q: number, now = Date.now()): void {
  useSrsStore().set(userKey, card.id, nextSrs(srsOf(userKey, card), q, now), today(), 1)
}
/** «Отменить»: вернуть прежнее состояние карточки (null — карточка снова новая). */
export function restore(userKey: string, card: Card, prev: SrsState | null): void {
  useSrsStore().set(userKey, card.id, prev, today(), -1)
}
export const snapshot = (userKey: Key, card: Card): SrsState | null => { const s = srsOf(userKey, card); return s ? { ...s } : null }

/** Подпись на кнопке оценки, как в Anki: «<1 мин.», «<10 мин.», «4 дн.», «3,6 мес.». */
export const intervalLabel = (userKey: Key, card: Card, q: number, now = Date.now()): string => label(srsOf(userKey, card), q, now)

// --- Очередь и счётчики колоды (как «Новые / Изучаю / К повторению» в Anki) ---
const endOfToday = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime() }
export function deckCounts(deck: Deck, userKey: Key) {
  const t = today(), map = cardsOf(userKey), eod = endOfToday()
  let fresh = 0, learn = 0, due = 0, introduced = 0
  for (const c of deck.cards) {
    if (c.suspended) continue
    const s = map[c.id]
    if (!s) { fresh++; continue }
    if (s.first === t) introduced++
    if (kindOf(s) === 'learn') { if (dueMs(s) < eod) learn++ } else if (s.due <= t) due++
  }
  const left = Math.max(0, (deck.newPerDay ?? 20) - introduced)        // дневной лимит новых карточек
  return { new: Math.min(fresh, left), learn, due, total: deck.cards.length, fresh }
}
/** Очередь «что показать сейчас», как в Anki: изучаемые, чьё время пришло → повторения на сегодня → новые (в пределах лимита).
 *  Если больше ничего нет — изучаемые, до которых осталось меньше 20 минут (Learn ahead). */
export function buildQueue(deck: Deck, userKey: Key, now = Date.now()): Card[] {
  const t = today(), map = cardsOf(userKey)
  const learn: Card[] = [], ahead: Card[] = [], due: Card[] = [], fresh: Card[] = []
  for (const c of deck.cards) {
    if (c.suspended) continue
    const s = map[c.id]
    if (!s) { fresh.push(c); continue }
    if (kindOf(s) === 'learn') { const m = dueMs(s); if (m <= now) learn.push(c); else if (m <= now + LEARN_AHEAD * 60_000) ahead.push(c) }
    else if (s.due <= t) due.push(c)
  }
  const byDue = (a: Card, b: Card) => dueMs(map[a.id]) - dueMs(map[b.id])
  learn.sort(byDue); ahead.sort(byDue); due.sort((a, b) => map[a.id].due.localeCompare(map[b.id].due))
  const main = [...learn, ...due, ...fresh.slice(0, deckCounts(deck, userKey).new)]
  return main.length ? main : ahead
}
/** Ближайшая карточка, которая появится позже (мс) — чтобы сессия сама продолжилась, когда подойдёт шаг изучения. */
export function nextLearnAt(deck: Deck, userKey: Key): number | null {
  const map = cardsOf(userKey), eod = endOfToday()
  const ms = deck.cards.filter((c) => !c.suspended && map[c.id] && kindOf(map[c.id]) === 'learn').map((c) => dueMs(map[c.id])).filter((m) => m < eod)
  return ms.length ? Math.min(...ms) : null
}
export function nextDueInfo(deck: Deck, userKey: Key): string {         // «Следующее повторение: завтра (3 карточки)»
  const t = today(), map = cardsOf(userKey), at = nextLearnAt(deck, userKey)
  if (at) { const m = Math.max(1, Math.ceil((at - Date.now()) / 60_000)); return `Следующая карточка через ${m} мин.` }
  const dates = deck.cards.filter((c) => !c.suspended && map[c.id]?.due > t).map((c) => map[c.id].due).sort()
  if (!dates.length) return ''
  return `Следующее повторение: ${relDay(dates[0]).toLowerCase()} (${dates.filter((d) => d === dates[0]).length} карт.)`
}

// --- Статистика ---
export function userStats(userKey: Key, decks: Deck[]) {
  const t = today(), map = cardsOf(userKey)
  let total = 0, learned = 0, mature = 0, newToday = 0
  for (const d of decks) for (const c of d.cards) {
    total++; const s = map[c.id]; if (!s) continue
    learned++; if (s.interval >= LEARNED_DAYS) mature++; if (s.first === t) newToday++
  }
  const log = useSrsStore().of(userKey)?.log ?? {}
  const week = Array.from({ length: 7 }, (_, i) => { const d = inDays(i - 6); return { date: d, n: log[d] ?? 0 } })
  return { total, learned, mature, newToday, today: log[t] ?? 0, week }
}

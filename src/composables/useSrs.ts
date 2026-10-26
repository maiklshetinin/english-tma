// Интервальные повторения в духе Anki (упрощённый SM-2). Оценки: 0 Снова, 1 Трудно, 2 Хорошо, 3 Легко.
// Прогресс хранится отдельно у каждого пользователя (stores/srs.ts): userKey — 'teacher' или id ученика, поэтому одну колоду
// можно назначить многим ученикам без смешения прогресса. Здесь — только алгоритм и подсчёты, без собственного состояния.
import type { Card, Deck, SrsState } from '../../server/types'
import { useSrsStore } from '../stores/srs'
import { ymd, relDay } from '../utils/dates'

export const LEARNED_DAYS = 7          // слово считается выученным, когда интервал повторения ≥ 7 дней
export const today = (): string => ymd(new Date())
const inDays = (n: number): string => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }

type Key = string | null | undefined
const cardsOf = (userKey: Key): Record<string, SrsState> => useSrsStore().of(userKey)?.cards ?? {}

export const srsOf = (userKey: Key, card: Card): SrsState | null => cardsOf(userKey)[card.id] ?? null
// new — ещё не показывалась; learn — «Снова» (интервал 0, нужно повторить сегодня); review — обычное повторение
export const kindOf = (s: SrsState | null): 'new' | 'learn' | 'review' => (!s ? 'new' : s.interval === 0 ? 'learn' : 'review')

export function nextSrs(srs: SrsState | null, q: number): SrsState {
  const t = today()
  const s: SrsState = { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: t, ...srs, first: srs?.first ?? t, last: t }
  if (q === 0) { if (s.reps > 0) s.lapses++; s.reps = 0; s.interval = 0; s.ease = Math.max(1.3, s.ease - 0.2) }
  else {
    s.reps++
    s.interval = s.reps === 1 ? (q === 3 ? 3 : 1)
      : s.reps === 2 ? (q === 3 ? 7 : q === 1 ? 3 : 5)
      : Math.max(s.interval + 1, Math.round(s.interval * s.ease * (q === 1 ? 0.8 : q === 3 ? 1.3 : 1)))
    s.ease = Math.max(1.3, s.ease + (q === 3 ? 0.15 : q === 1 ? -0.15 : 0))
  }
  s.due = inDays(s.interval)
  return s
}

/** Оценить карточку: считает новое состояние и записывает ответ (на сервер уходит только свой прогресс). */
export function rate(userKey: string, card: Card, q: number): void {
  useSrsStore().set(userKey, card.id, nextSrs(srsOf(userKey, card), q), today(), 1)
}
/** «Отменить»: вернуть прежнее состояние карточки (null — карточка снова новая). */
export function restore(userKey: string, card: Card, prev: SrsState | null): void {
  useSrsStore().set(userKey, card.id, prev, today(), -1)
}
export const snapshot = (userKey: Key, card: Card): SrsState | null => { const s = srsOf(userKey, card); return s ? { ...s } : null }

export function intervalLabel(userKey: Key, card: Card, q: number): string {
  const d = nextSrs(srsOf(userKey, card), q).interval
  return d === 0 ? 'сейчас' : d < 30 ? `${d} дн.` : d < 365 ? `${Math.round(d / 30)} мес.` : `${(d / 365).toFixed(1)} г.`
}

// --- Очередь и счётчики колоды (как «Новые / Изучаю / К повторению» в Anki) ---
export function deckCounts(deck: Deck, userKey: Key) {
  const t = today(), map = cardsOf(userKey)
  let fresh = 0, learn = 0, due = 0, introduced = 0
  for (const c of deck.cards) {
    if (c.suspended) continue
    const s = map[c.id]
    if (!s) { fresh++; continue }
    if (s.first === t) introduced++
    if (s.due <= t) s.interval === 0 ? learn++ : due++
  }
  const left = Math.max(0, (deck.newPerDay ?? 20) - introduced)        // дневной лимит новых карточек
  return { new: Math.min(fresh, left), learn, due, total: deck.cards.length, fresh }
}
export function buildQueue(deck: Deck, userKey: Key): Card[] {
  const t = today(), map = cardsOf(userKey)
  const learn: Card[] = [], due: Card[] = [], fresh: Card[] = []
  for (const c of deck.cards) {
    if (c.suspended) continue
    const s = map[c.id]
    if (!s) fresh.push(c); else if (s.due <= t) (s.interval === 0 ? learn : due).push(c)
  }
  due.sort((a, b) => map[a.id].due.localeCompare(map[b.id].due))
  return [...learn, ...due, ...fresh.slice(0, deckCounts(deck, userKey).new)]
}
export function nextDueInfo(deck: Deck, userKey: Key): string {         // «Следующее повторение: завтра (3 карточки)»
  const t = today(), map = cardsOf(userKey)
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

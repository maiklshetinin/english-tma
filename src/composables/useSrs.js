// Интервальные повторения в духе Anki (упрощённый SM-2). Оценки: 0 Снова, 1 Трудно, 2 Хорошо, 3 Легко.
// Прогресс хранится отдельно у каждого пользователя: state.srs[userKey][cardId] = { ease, interval, reps, lapses, first, last, due }.
// userKey — 'teacher' или id ученика, поэтому одну колоду можно назначить многим ученикам без смешения прогресса.
import { state, ymd, relDay } from '../store/mock'

export const LEARNED_DAYS = 7          // слово считается выученным, когда интервал повторения ≥ 7 дней
export const today = () => ymd(new Date())
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }

export const srsOf = (userKey, card) => state.srs[userKey]?.[card.id] ?? null
// new — ещё не показывалась; learn — «Снова» (интервал 0, нужно повторить сегодня); review — обычное повторение
export const kindOf = (s) => (!s ? 'new' : s.interval === 0 ? 'learn' : 'review')

export function nextSrs(srs, q) {
  const t = today()
  const s = { ease: 2.5, interval: 0, reps: 0, lapses: 0, ...srs, first: srs?.first ?? t, last: t }
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

const bump = (userKey, d) => { const l = (state.log[userKey] ??= {}); const t = today(); l[t] = Math.max(0, (l[t] ?? 0) + d) }
export function rate(userKey, card, q) {
  const m = (state.srs[userKey] ??= {})
  m[card.id] = nextSrs(m[card.id], q); bump(userKey, 1)
}
export function restore(userKey, card, prev) {         // «Отменить»: вернуть прежнее состояние карточки
  const m = (state.srs[userKey] ??= {})
  if (prev) m[card.id] = prev; else delete m[card.id]
  bump(userKey, -1)
}
export const snapshot = (userKey, card) => { const s = srsOf(userKey, card); return s ? { ...s } : null }

export function intervalLabel(userKey, card, q) {
  const d = nextSrs(srsOf(userKey, card), q).interval
  return d === 0 ? 'сейчас' : d < 30 ? `${d} дн.` : d < 365 ? `${Math.round(d / 30)} мес.` : `${(d / 365).toFixed(1)} г.`
}

// --- Очередь и счётчики колоды (как «Новые / Изучаю / К повторению» в Anki) ---
export function deckCounts(deck, userKey) {
  const t = today(), map = state.srs[userKey] ?? {}
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
export function buildQueue(deck, userKey) {
  const t = today(), map = state.srs[userKey] ?? {}
  const learn = [], due = [], fresh = []
  for (const c of deck.cards) {
    if (c.suspended) continue
    const s = map[c.id]
    if (!s) fresh.push(c); else if (s.due <= t) (s.interval === 0 ? learn : due).push(c)
  }
  due.sort((a, b) => map[a.id].due.localeCompare(map[b.id].due))
  return [...learn, ...due, ...fresh.slice(0, deckCounts(deck, userKey).new)]
}
export function nextDueInfo(deck, userKey) {         // «Следующее повторение: завтра (3 карточки)»
  const t = today(), map = state.srs[userKey] ?? {}
  const dates = deck.cards.filter(c => !c.suspended && map[c.id]?.due > t).map(c => map[c.id].due).sort()
  if (!dates.length) return ''
  return `Следующее повторение: ${relDay(dates[0]).toLowerCase()} (${dates.filter(d => d === dates[0]).length} карт.)`
}

// --- Статистика ---
export function userStats(userKey, decks) {
  const t = today(), map = state.srs[userKey] ?? {}
  let total = 0, learned = 0, mature = 0, newToday = 0
  for (const d of decks) for (const c of d.cards) {
    total++; const s = map[c.id]; if (!s) continue
    learned++; if (s.interval >= LEARNED_DAYS) mature++; if (s.first === t) newToday++
  }
  const log = state.log[userKey] ?? {}
  const week = Array.from({ length: 7 }, (_, i) => { const d = inDays(i - 6); return { date: d, n: log[d] ?? 0 } })
  return { total, learned, mature, newToday, today: log[t] ?? 0, week }
}

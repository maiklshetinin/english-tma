// Тесты алгоритма повторений как в Anki (шаги 1 мин / 10 мин + FSRS): интервалы, очередь, дневной лимит новых.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Deck } from '../../server/types'

vi.mock('../firebase', () => ({ isDemo: true, apiRequest: vi.fn(), apiFetch: vi.fn(), tg: undefined, fb: null }))

import { buildQueue, deckCounts, intervalLabel, kindOf, nextSrs, rate, restore, snapshot, srsOf, today, userStats } from './useSrs'
import { fmtSpan, ymdOf as ymd } from '../utils/fsrs'
import { useSrsStore } from '../stores/srs'

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, front: `w${i}`, back: `п${i}` }))
const deck = (n: number, o: Partial<Deck> = {}): Deck => ({ id: 'd', title: 'D', forAll: true, assigned: [], newPerDay: 20, source: { url: '', lastSync: null }, cards: cards(n), ...o })
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

describe('алгоритм повторений (как в Anki)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  const T = new Date('2026-10-27T12:00:00').getTime(), MIN = 60_000, DAY = 86_400_000

  it('новая карточка: шаги изучения 1 мин → 10 мин, «Легко» — сразу в повторения', () => {
    const again = nextSrs(null, 0, T)
    expect(again.phase).toBe('learning'); expect(again.dueAt).toBe(T + MIN); expect(again.interval).toBe(0); expect(kindOf(again)).toBe('learn')
    expect(nextSrs(null, 1, T).dueAt).toBe(T + 5.5 * MIN)                   // «Трудно» на первом шаге — среднее 1 и 10 мин
    const good = nextSrs(null, 2, T)
    expect(good.phase).toBe('learning'); expect(good.step).toBe(1); expect(good.dueAt).toBe(T + 10 * MIN)
    const easy = nextSrs(null, 3, T)
    expect(easy.phase).toBe('review'); expect(easy.interval).toBeGreaterThanOrEqual(15)      // FSRS: стабильность «Легко» ≈ 15,7 дня
  })

  it('последний шаг «Хорошо» — выпуск в повторения на несколько дней', () => {
    const s = nextSrs(nextSrs(null, 2, T), 2, T + 10 * MIN)
    expect(s.phase).toBe('review'); expect(s.interval).toBeGreaterThanOrEqual(1); expect(kindOf(s)).toBe('review')
    expect(s.due > ymd(T)).toBe(true)
  })

  it('повторения: Трудно < Хорошо < Легко, интервал растёт; «Снова» — ошибка и переучивание 10 мин', () => {
    let s = nextSrs(nextSrs(null, 2, T), 2, T + 10 * MIN)
    let t = T + s.interval * DAY
    const h = nextSrs(s, 1, t).interval, g = nextSrs(s, 2, t).interval, e = nextSrs(s, 3, t).interval
    expect(h).toBeLessThan(g); expect(g).toBeLessThan(e)
    s = nextSrs(s, 2, t); expect(s.interval).toBeGreaterThan(g - 1)
    t += s.interval * DAY; const before = s.interval
    s = nextSrs(s, 2, t); expect(s.interval).toBeGreaterThan(before)                           // каждое «Хорошо» отбрасывает дальше
    const bad = nextSrs(s, 0, t + s.interval * DAY)
    expect(bad.phase).toBe('relearning'); expect(bad.lapses).toBe(1); expect(bad.interval).toBe(0); expect(bad.stab!).toBeLessThan(s.stab!)
    expect(bad.dueAt).toBe(t + s.interval * DAY + 10 * MIN)
    const back = nextSrs(bad, 2, t + s.interval * DAY + 10 * MIN)
    expect(back.phase).toBe('review'); expect(back.interval).toBeLessThan(s.interval)        // после ошибки интервал короче
  })

  it('подписи на кнопках как в Anki', () => {
    const c = cards(1)[0]
    expect(intervalLabel('u', c, 0, T)).toBe('<1 мин.'); expect(intervalLabel('u', c, 1, T)).toBe('<6 мин.'); expect(intervalLabel('u', c, 2, T)).toBe('<10 мин.')
    expect(intervalLabel('u', c, 3, T)).toMatch(/^\d+ дн\.$/)
    expect(fmtSpan(0, 108)).toBe('3,6 мес.'); expect(fmtSpan(0, 400)).toBe('1,1 г.'); expect(fmtSpan(15, 0)).toBe('<15 мин.')
  })

  it('старая запись (до FSRS) продолжает работать', () => {
    const old = { ease: 2.5, interval: 10, reps: 3, lapses: 0, first: '2026-09-01', last: '2026-10-17', due: '2026-10-27' }
    const s = nextSrs(old, 2, T)
    expect(s.phase).toBe('review'); expect(s.interval).toBeGreaterThan(10); expect(s.stab).toBeGreaterThan(0)
  })

  it('история ответов для графика (не больше 12)', () => {
    let s = nextSrs(null, 2, T)
    for (let i = 0; i < 20; i++) s = nextSrs(s, 2, T + i * DAY)
    expect(s.hist).toHaveLength(12); expect(s.hist!.at(-1)!.q).toBe(2)
  })
})

describe('очередь и счётчики', () => {
  beforeEach(() => setActivePinia(createPinia()))
  const c = cards(30)

  it('новые ограничены дневным лимитом', () => {
    const d = deck(30, { newPerDay: 5 })
    expect(deckCounts(d, 'u1')).toMatchObject({ new: 5, learn: 0, due: 0, total: 30, fresh: 30 })
    expect(buildQueue(d, 'u1')).toHaveLength(5)
  })

  it('лимит учитывает карточки, показанные сегодня', () => {
    const d = deck(30, { newPerDay: 3 })
    rate('u1', c[0], 2); rate('u1', c[1], 2)
    expect(deckCounts(d, 'u1').new).toBe(1)
  })

  it('«Снова» возвращается через минуту, «Легко» — на будущее; пока ждём — сначала другие карточки', () => {
    const d = deck(3), now = Date.now()
    rate('u1', c[0], 0, now); rate('u1', c[1], 3, now)
    expect(buildQueue(d, 'u1', now).map((x) => x.id)).toEqual(['c2'])                  // c0 ещё не пора, c1 — через дни
    expect(buildQueue(d, 'u1', now + 61_000).map((x) => x.id)).toEqual(['c0', 'c2'])     // через минуту c0 снова первая
    expect(deckCounts(d, 'u1')).toMatchObject({ learn: 1, due: 0, new: 1 })
    rate('u1', c[2], 2, now)
    expect(buildQueue(d, 'u1', now).map((x) => x.id)).toEqual(['c0', 'c2'])              // больше нечего — карточки на шагах показываются раньше (до 20 мин)
  })

  it('просроченные повторения идут раньше новых, самые старые — первыми', () => {
    const d = deck(4), store = useSrsStore()
    store.set('u1', 'c0', { ease: 2.5, interval: 3, reps: 2, lapses: 0, first: addDays(-9), last: addDays(-3), due: addDays(-1) }, today(), 1)
    store.set('u1', 'c1', { ease: 2.5, interval: 3, reps: 2, lapses: 0, first: addDays(-9), last: addDays(-5), due: addDays(-4) }, today(), 1)
    expect(buildQueue(d, 'u1').map((x) => x.id).slice(0, 3)).toEqual(['c1', 'c0', 'c2'])
  })

  it('скрытые карточки не попадают ни в очередь, ни в счётчики', () => {
    const d = deck(3); d.cards[0].suspended = true
    expect(deckCounts(d, 'u1').new).toBe(2); expect(buildQueue(d, 'u1').map((x) => x.id)).not.toContain('c0')
  })

  it('у каждого пользователя свой прогресс по одной колоде', () => {
    const d = deck(2)
    rate('u1', c[0], 2)
    expect(srsOf('u1', c[0])).not.toBeNull(); expect(srsOf('u2', c[0])).toBeNull()
    expect(deckCounts(d, 'u2').new).toBe(2)
  })

  it('restore возвращает прежнее состояние и счётчик', () => {
    const before = snapshot('u1', c[0]); expect(before).toBeNull()
    rate('u1', c[0], 2)
    restore('u1', c[0], before)
    expect(srsOf('u1', c[0])).toBeNull(); expect(userStats('u1', [deck(2)]).today).toBe(0)
  })

  it('userStats: выучено = интервал ≥ 21 дня, график за 7 дней', () => {
    const store = useSrsStore(), d = deck(3)
    store.set('u1', 'c0', { ease: 2.5, interval: 30, reps: 3, lapses: 0, first: addDays(-20), last: addDays(-1), due: addDays(29) }, addDays(-1), 1)
    rate('u1', c[1], 2)
    const st = userStats('u1', [d])
    expect(st).toMatchObject({ total: 3, learned: 2, mature: 1, newToday: 1, today: 1 })
    expect(st.week).toHaveLength(7); expect(st.week[5].n).toBe(1); expect(st.week[6].n).toBe(1)
  })
})

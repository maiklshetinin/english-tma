// Тесты алгоритма повторений (упрощённый SM-2): интервалы, очередь, дневной лимит новых.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Deck } from '../../server/types'

vi.mock('../firebase', () => ({ isDemo: true, apiRequest: vi.fn(), apiFetch: vi.fn(), tg: undefined, fb: null }))

import { buildQueue, deckCounts, intervalLabel, kindOf, nextSrs, rate, restore, snapshot, srsOf, today, userStats } from './useSrs'
import { useSrsStore } from '../stores/srs'

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, front: `w${i}`, back: `п${i}` }))
const deck = (n: number, o: Partial<Deck> = {}): Deck => ({ id: 'd', title: 'D', forAll: true, assigned: [], newPerDay: 20, source: { url: '', lastSync: null }, cards: cards(n), ...o })
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

describe('алгоритм повторений', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('первый ответ: Хорошо → 1 день, Легко → 3 дня, Снова → сегодня', () => {
    expect(nextSrs(null, 2).interval).toBe(1); expect(nextSrs(null, 2).due).toBe(addDays(1))
    expect(nextSrs(null, 3).interval).toBe(3)
    const again = nextSrs(null, 0)
    expect(again.interval).toBe(0); expect(again.due).toBe(today()); expect(again.lapses).toBe(0)
  })

  it('растёт: 1 → 5 → дальше по лёгкости; «Снова» сбрасывает и добавляет ошибку', () => {
    let s = nextSrs(null, 2); s = nextSrs(s, 2)
    expect(s.interval).toBe(5)
    s = nextSrs(s, 2); expect(s.interval).toBeGreaterThan(5)
    const bad = nextSrs(s, 0)
    expect(bad.interval).toBe(0); expect(bad.reps).toBe(0); expect(bad.lapses).toBe(1); expect(bad.ease).toBeLessThan(s.ease)
  })

  it('лёгкость не падает ниже 1.3, «первый показ» не меняется', () => {
    let s = nextSrs(null, 2)
    for (let i = 0; i < 20; i++) s = nextSrs(s, 0)
    expect(s.ease).toBe(1.3)
    expect(nextSrs({ ...s, first: '2020-01-01' }, 2).first).toBe('2020-01-01')
  })

  it('kindOf: новая / учу (интервал 0) / повторение', () => {
    expect(kindOf(null)).toBe('new'); expect(kindOf(nextSrs(null, 0))).toBe('learn'); expect(kindOf(nextSrs(null, 2))).toBe('review')
  })

  it('intervalLabel: сейчас / дни / месяцы', () => {
    expect(intervalLabel('u', cards(1)[0], 0)).toBe('сейчас'); expect(intervalLabel('u', cards(1)[0], 2)).toBe('1 дн.')
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

  it('«Снова» остаётся в очереди сегодня; повторения на будущее — нет', () => {
    const d = deck(3)
    rate('u1', c[0], 0); rate('u1', c[1], 2)
    const q = buildQueue(d, 'u1').map((x) => x.id)
    expect(q[0]).toBe('c0'); expect(q).not.toContain('c1'); expect(q).toContain('c2')
    expect(deckCounts(d, 'u1')).toMatchObject({ learn: 1, due: 0, new: 1 })
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

  it('userStats: выучено = интервал ≥ 7 дней, график за 7 дней', () => {
    const store = useSrsStore(), d = deck(3)
    store.set('u1', 'c0', { ease: 2.5, interval: 10, reps: 3, lapses: 0, first: addDays(-20), last: addDays(-1), due: addDays(9) }, addDays(-1), 1)
    rate('u1', c[1], 2)
    const st = userStats('u1', [d])
    expect(st).toMatchObject({ total: 3, learned: 2, mature: 1, newToday: 1, today: 1 })
    expect(st.week).toHaveLength(7); expect(st.week[5].n).toBe(1); expect(st.week[6].n).toBe(1)
  })
})

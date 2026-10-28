// Тесты прогресса повторений: ответы уходят на сервер только за себя, отмена, устаревший ответ не затирает свежие.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SrsState } from '../../server/types'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn(), tg: undefined, fb: null }))

import { useSrsStore } from './srs'
import { session } from './session'

const ok = (body: unknown = { ok: true }) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const S = (o: Partial<SrsState> = {}): SrsState => ({ ease: 2.5, interval: 1, reps: 1, lapses: 0, first: '2026-10-26', last: '2026-10-26', due: '2026-10-27', ...o })

describe('srs store', () => {
  beforeEach(() => { setActivePinia(createPinia()); apiRequest.mockReset(); apiRequest.mockImplementation(() => ok()); session.ownKey = 's1' })
  afterEach(() => { session.ownKey = null })

  it('свой ответ: на экране сразу и POST /srs/rate', async () => {
    const s = useSrsStore()
    s.set('s1', 'c1', S(), '2026-10-26', 1)
    expect(s.of('s1')!.cards.c1.interval).toBe(1); expect(s.of('s1')!.log['2026-10-26']).toBe(1)
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1))
    expect(apiRequest.mock.calls[0][0]).toBe('/srs/rate')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ cardId: 'c1', state: S(), date: '2026-10-26', delta: 1 })
  })

  it('чужой прогресс (смотрим глазами ученика) на сервер не уходит', async () => {
    const s = useSrsStore()
    s.set('s2', 'c1', S(), '2026-10-26', 1)
    expect(s.of('s2')!.cards.c1).toBeDefined()
    await new Promise((r) => setTimeout(r, 20))
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('отмена первого ответа: карточка снова «новая», счётчик −1, на сервер state: null', async () => {
    const s = useSrsStore()
    s.set('s1', 'c1', S(), '2026-10-26', 1)
    s.set('s1', 'c1', null, '2026-10-26', -1)
    expect(s.of('s1')!.cards.c1).toBeUndefined(); expect(s.of('s1')!.log['2026-10-26']).toBe(0)
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))
    expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toMatchObject({ state: null, delta: -1 })
  })

  it('счётчик дня не бывает отрицательным', () => {
    const s = useSrsStore()
    s.set('s2', 'c1', null, '2026-10-26', -1)
    expect(s.of('s2')!.log['2026-10-26']).toBe(0)
  })

  it('отправляется копия состояния, а не живой объект', async () => {
    const s = useSrsStore(), st = S()
    s.set('s1', 'c1', st, '2026-10-26', 1); st.interval = 99
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalled())
    expect(JSON.parse(apiRequest.mock.calls[0][1].body).state.interval).toBe(1)
  })

  it('apply: ответ сервера, полученный до ответа на карточку, не затирает его', () => {
    const s = useSrsStore(), was = s.rev()
    s.set('s2', 'c1', S(), '2026-10-26', 1)
    s.apply({}, was)
    expect(s.of('s2')).toBeDefined()
  })

  it('apply: без помех заменяет данные', () => {
    const s = useSrsStore()
    s.apply({ s1: { cards: { c9: S() }, log: {} } }, s.rev())
    expect(Object.keys(s.of('s1')!.cards)).toEqual(['c9'])
  })

  it('ошибка сервера → прогресс перечитывается', async () => {
    apiRequest.mockImplementation((p: string) => p === '/srs/rate' ? Promise.resolve({ ok: false, status: 400, json: async () => ({}) } as Response) : ok({ users: { s1: { cards: {}, log: {} } } }))
    const s = useSrsStore()
    s.set('s1', 'c1', S(), '2026-10-26', 1)
    await vi.waitFor(() => expect(s.of('s1')!.cards.c1).toBeUndefined())
  })

  it('сброс колоды: карточки снова новые, на сервер POST /srs/reset только за себя', async () => {
    const s = useSrsStore()
    s.set('s1', 'c1', S(), '2026-10-26', 1); s.set('s1', 'c2', S(), '2026-10-26', 1)
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))
    s.reset('s1', ['c1', 'c2'])
    expect(s.of('s1')!.cards).toEqual({}); expect(s.of('s1')!.log['2026-10-26']).toBe(2)
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(3))
    expect(apiRequest.mock.calls[2][0]).toBe('/srs/reset'); expect(JSON.parse(apiRequest.mock.calls[2][1].body)).toEqual({ cardIds: ['c1', 'c2'] })
    s.reset('s2', ['c1']); await new Promise((r) => setTimeout(r, 20)); expect(apiRequest).toHaveBeenCalledTimes(3)
  })
})

// Тесты колод: кому видны, автосохранение правок преподавателя, удаление и отмена удаления.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Deck } from '../../server/types'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn(), tg: undefined, fb: null }))

import { useDecksStore } from './decks'
import { session } from './session'

const ok = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response)
const deck = (id: string, o: Partial<Deck> = {}): Deck => ({ id, title: id, forAll: false, assigned: [], newPerDay: 20, source: { url: '', lastSync: null }, cards: [{ id: 'c1', front: 'a', back: 'б' }], ...o })
const calls = () => apiRequest.mock.calls.map((c) => [c[1]?.method ?? 'GET', c[0]] as const)

describe('decks store', () => {
  beforeEach(() => { vi.useFakeTimers(); setActivePinia(createPinia()); apiRequest.mockReset(); apiRequest.mockImplementation(ok); session.canEdit = true })
  afterEach(() => { vi.useRealTimers(); session.canEdit = false })

  it('forUser: преподаватель видит все, ученик — «для всех» и назначенные ему', () => {
    const d = useDecksStore()
    d.apply([deck('all', { forAll: true }), deck('mine', { assigned: ['s1'] }), deck('other', { assigned: ['s2'] })])
    expect(d.forUser('teacher').map((x) => x.id)).toEqual(['all', 'mine', 'other'])
    expect(d.forUser('s1').map((x) => x.id)).toEqual(['all', 'mine'])
    expect(d.forUser('s3').map((x) => x.id)).toEqual(['all'])
    expect(d.forUser(null).map((x) => x.id)).toEqual(['all'])
  })

  it('add: новая колода сохраняется PUT /decks/<id>', async () => {
    const d = useDecksStore()
    const x = d.add('Travel', 'https://docs.google.com/x')
    expect(x.id).toMatch(/^d/); expect(x.newPerDay).toBe(20)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([['PUT', `/decks/${x.id}`]])
    const body = JSON.parse(apiRequest.mock.calls[0][1].body)
    expect(body).toEqual({ title: 'Travel', forAll: false, assigned: [], newPerDay: 20, source: { url: 'https://docs.google.com/x', lastSync: null }, cards: [] })
  })

  it('правка карточки и добавление карточки сохраняются одной отправкой', async () => {
    const d = useDecksStore(); d.apply([deck('d1')])
    d.byId('d1')!.cards[0].back = 'новый перевод'
    d.byId('d1')!.cards.push({ id: 'c2', front: 'x', back: 'y' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([['PUT', '/decks/d1']])
    expect(JSON.parse(apiRequest.mock.calls[0][1].body).cards).toHaveLength(2)
  })

  it('apply не вызывает лишнего сохранения', async () => {
    const d = useDecksStore(); d.apply([deck('d1')])
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls()).toEqual([])
  })

  it('удалить → DELETE; удалить и сразу вернуть → ничего', async () => {
    const d = useDecksStore(); d.apply([deck('d1'), deck('d2')])
    d.restore(d.remove(d.byId('d1')!)!)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([]); expect(d.list.map((x) => x.id)).toEqual(['d1', 'd2'])
    d.remove(d.byId('d2')!)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([['DELETE', '/decks/d2']])
  })

  it('удаление несуществующей колоды возвращает null', () => {
    const d = useDecksStore()
    expect(d.remove(deck('нет'))).toBeNull()
  })

  it('ученик не сохраняет колоды', async () => {
    session.canEdit = false
    const d = useDecksStore(); d.apply([deck('d1')]); d.byId('d1')!.title = 'Хак'
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls()).toEqual([])
  })
})

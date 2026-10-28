// Группы учеников: перенос старых групп из расписания, создание / состав / расформирование, уроки группы.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Lesson } from '../../server/types'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn() }))
import { useGroupsStore, groupsFromLessons } from './groups'
import { lessonsOfGroup } from '../composables/useGroups'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const L = (id: string, studentIds: string[], o: Partial<Lesson> = {}): Lesson => ({ id, date: '2099-01-05', hour: 10, studentIds, ...o })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('группы', () => {
  beforeEach(() => { setActivePinia(createPinia()); apiRequest.mockReset() })

  it('старые группы из расписания: по цепочке общих уроков, отменивший и неизвестный не считаются', () => {
    const alive = new Set(['a', 'b', 'c', 'd', 'e'])
    const g = groupsFromLessons([L('1', ['a', 'b']), L('2', ['b', 'c']), L('3', ['d']), L('4', ['d', 'e'], { canceled: { e: 't' } }), L('5', ['d', 'x'])], alive)
    expect(g.map((x) => x.sort())).toEqual([['a', 'b', 'c']])
  })

  it('первая загрузка: группы переносятся на сервер один раз', async () => {
    apiRequest.mockResolvedValueOnce(ok({ groups: [], seeded: false })).mockResolvedValueOnce(ok({ groups: [{ id: 'g1', studentIds: ['a', 'b'] }], seeded: true }))
    const s = useGroupsStore()
    await s.load(() => [['a', 'b']])
    expect(apiRequest.mock.calls[1][0]).toBe('/groups/seed'); expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({ groups: [['a', 'b']] })
    expect(s.list).toEqual([{ id: 'g1', studentIds: ['a', 'b'] }])
  })

  it('уже перенесено — просто список', async () => {
    apiRequest.mockResolvedValueOnce(ok({ groups: [{ id: 'g1', studentIds: ['a', 'b'] }], seeded: true }))
    const s = useGroupsStore(); await s.load(() => [['x', 'y']])
    expect(apiRequest).toHaveBeenCalledTimes(1); expect(s.list).toHaveLength(1)
  })

  it('создать (id с сервера), изменить состав, расформировать', async () => {
    apiRequest.mockResolvedValueOnce(ok({ id: 'g9', studentIds: ['a', 'b'] }))
    const s = useGroupsStore(), g = s.create(['a', 'b'])
    expect(s.list).toHaveLength(1); await flush()
    expect(apiRequest.mock.calls[0][0]).toBe('/groups'); expect(s.list[0].id).toBe('g9')
    apiRequest.mockResolvedValue(ok({ ok: true }))
    s.setMembers(g, ['a', 'b', 'c']); expect(s.list[0].studentIds).toEqual(['a', 'b', 'c'])
    expect(apiRequest.mock.calls[1][0]).toBe('/groups/g9'); expect(apiRequest.mock.calls[1][1].method).toBe('PUT')
    s.remove(g); expect(s.list).toHaveLength(0); expect(apiRequest.mock.calls[2][1].method).toBe('DELETE')
  })

  it('уроки группы: 2+ ученика из группы (гость не мешает); будущие — без проведённых и прошедших', () => {
    const alive = (id: string) => id !== 'gone'
    const ls = [L('1', ['a', 'b']), L('2', ['a', 'b', 'c']), L('3', ['a']), L('4', ['a', 'b'], { done: true }), L('5', ['a', 'b'], { date: '2000-01-01' }), L('6', ['a', 'b', 'gone'])]
    expect(lessonsOfGroup(['a', 'b'], ls, alive).map((l: Lesson) => l.id)).toEqual(['1', '2', '4', '5', '6'])      // 2 — с гостем c
    expect(lessonsOfGroup(['a', 'b'], ls, alive, true).map((l: Lesson) => l.id)).toEqual(['1', '2', '6'])
  })
})

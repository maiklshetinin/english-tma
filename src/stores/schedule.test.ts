// Тесты расписания: правка видна сразу, запросы уходят по очереди, при отказе сервера экран откатывается.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn() }))

import { useScheduleStore } from './schedule'

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const err = (status: number) => Promise.resolve({ ok: false, status, json: async () => ({}) } as Response)
const D = '2026-10-27'
const week = (lessons: unknown[]) => ({ current: { weekStart: '2026-10-19', lessons: [] }, next: { weekStart: '2026-10-26', lessons } })
const settle = () => vi.waitFor(() => { /* очередь опустела */ if (vi.mocked(apiRequest).mock.calls.length === 0) throw new Error('wait') })

describe('schedule store', () => {
  beforeEach(() => { setActivePinia(createPinia()); apiRequest.mockReset() })

  it('новый урок появляется сразу, потом получает настоящий id с сервера', async () => {
    apiRequest.mockImplementation(() => ok({ id: 'L1', date: D, hour: 18, studentIds: ['s1'] }))
    const s = useScheduleStore()
    const lesson = s.create(['s1'], D, 18)
    expect(s.lessons).toHaveLength(1)
    expect(lesson.id.startsWith('tmp-')).toBe(true)
    await settle(); await vi.waitFor(() => expect(lesson.id).toBe('L1'))
    expect(apiRequest.mock.calls[0][0]).toBe('/lessons')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ studentIds: ['s1'], date: D, hour: 18 })
  })

  it('setDone: статус меняется сразу, цену фиксирует сервер; снятие отметки убирает цены', async () => {
    apiRequest.mockImplementation(() => ok({ id: 'a', date: D, hour: 9, studentIds: ['s1'], done: true, prices: { s1: 100 } }))
    const s = useScheduleStore()
    s.set([{ id: 'a', date: D, hour: 9, studentIds: ['s1'] }])
    s.setDone(s.lessons[0], true)
    expect(s.lessons[0].done).toBe(true)
    await vi.waitFor(() => expect(s.lessons[0].prices).toEqual({ s1: 100 }))
    expect(apiRequest.mock.calls[0][0]).toBe('/lessons/a/done')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ done: true })
    apiRequest.mockImplementation(() => ok({ id: 'a', date: D, hour: 9, studentIds: ['s1'], done: false }))
    s.setDone(s.lessons[0], false)
    expect(s.lessons[0].done).toBe(false); expect(s.lessons[0].prices).toBeUndefined()
  })

  it('setStudents: состав группы меняется сразу и уходит на сервер целиком', async () => {
    apiRequest.mockImplementation(() => ok({ id: 'a', date: D, hour: 9, studentIds: ['s1', 's2'] }))
    const s = useScheduleStore()
    s.set([{ id: 'a', date: D, hour: 9, studentIds: ['s1'] }])
    s.setStudents(s.lessons[0], ['s1', 's2', 's2'])
    expect(s.lessons[0].studentIds).toEqual(['s1', 's2'])
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1))
    expect(apiRequest.mock.calls[0][0]).toBe('/lessons/a/students')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ studentIds: ['s1', 's2'] })
  })

  it('lessonMap раскладывает уроки по ячейкам «дата|час»', () => {
    const s = useScheduleStore()
    s.set([{ id: 'a', date: D, hour: 9, studentIds: ['s1'] }, { id: 'b', date: D, hour: 10, studentIds: ['s2'] }])
    expect(s.lessonMap.get(`${D}|9`)?.[0].id).toBe('a')
    expect(s.lessonMap.get(`${D}|11`)).toBeUndefined()
  })

  it('перенос и снятие: запросы идут по порядку действий', async () => {
    apiRequest.mockImplementation(() => ok({ ok: true }))
    const s = useScheduleStore()
    s.set([{ id: 'a', date: D, hour: 9, studentIds: ['s1'] }])
    s.move(s.lessons[0], D, 12)
    expect(s.lessons[0].hour).toBe(12)
    s.remove(s.lessons[0])
    expect(s.lessons).toHaveLength(0)
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))
    expect(apiRequest.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([['/lessons/a/move', 'POST'], ['/lessons/a', 'DELETE']])
  })

  it('обмен меняет слоты местами сразу', async () => {
    apiRequest.mockImplementation(() => ok({ ok: true }))
    const s = useScheduleStore()
    s.set([{ id: 'a', date: D, hour: 9, studentIds: ['s1'] }, { id: 'b', date: D, hour: 10, studentIds: ['s2'] }])
    s.swap(s.lessons[0], s.lessons[1])
    expect([s.lessons[0].hour, s.lessons[1].hour]).toEqual([10, 9])
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/lessons/swap', expect.anything()))
  })

  it('сервер отказал (слот занят) → расписание перечитывается с сервера', async () => {
    apiRequest.mockImplementation((path: string) => (path === '/lessons' ? err(409) : ok(week([{ id: 'X', date: D, hour: 18, studentIds: ['s9'] }]))))
    const s = useScheduleStore()
    s.create(['s1'], D, 18)
    await vi.waitFor(() => expect(s.lessons.map((l) => l.id)).toEqual(['X']))      // экран откатился к данным сервера
    expect(apiRequest.mock.calls.map((c) => c[0])).toEqual(['/lessons', '/schedule'])
  })

  it('load кладёт обе недели в один список', async () => {
    apiRequest.mockImplementation(() => ok({ current: { weekStart: 'w1', lessons: [{ id: 'a', date: D, hour: 9, studentIds: [] }] }, next: { weekStart: 'w2', lessons: [{ id: 'b', date: D, hour: 10, studentIds: [] }] } }))
    const s = useScheduleStore()
    await s.load()
    expect(s.lessons.map((l) => l.id)).toEqual(['a', 'b'])
  })
})

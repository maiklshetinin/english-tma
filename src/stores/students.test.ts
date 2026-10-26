// Тесты учеников: список с сервера сортируется по имени, добавление возвращает ссылку, архив перечитывает ученика и расписание.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Student } from '../../server/types'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn() }))

import { useStudentsStore } from './students'

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const err = (status: number) => Promise.resolve({ ok: false, status, json: async () => ({}) } as Response)
const st = (id: string, name: string): Student => ({ id, name, level: 'A2', color: '#fff', username: '', streak: 0, coins: 0, status: 'invited', tgId: null, photoUrl: '', payment: { status: 'due', until: '2026-11-01', lessonsLeft: 0, packageSize: 8 } })

describe('students store', () => {
  beforeEach(() => { setActivePinia(createPinia()); apiRequest.mockReset() })

  it('load: сортирует по имени и подставляет значения по умолчанию', async () => {
    apiRequest.mockImplementation(() => ok([st('2', 'Яна'), { ...st('1', 'Аня'), photoUrl: undefined, username: undefined }]))
    const s = useStudentsStore()
    await s.load()
    expect(s.list.map((x) => x.name)).toEqual(['Аня', 'Яна'])
    expect(s.byId('1')?.photoUrl).toBe('')
    expect(s.byId('1')?.username).toBe('')
    expect(s.byId('нет')).toBeUndefined()
  })

  it('add: отправляет данные, возвращает ссылку и перечитывает список', async () => {
    apiRequest.mockImplementation((path: string) => (path === '/students' && apiRequest.mock.calls.length === 1 ? ok({ student: st('1', 'Маша'), url: 'https://t.me/bot?startapp=invite_x' }) : ok([st('1', 'Маша')])))
    const s = useStudentsStore()
    const url = await s.add({ name: 'Маша', level: 'A2', packageSize: 8 })
    expect(url).toBe('https://t.me/bot?startapp=invite_x')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ name: 'Маша', level: 'A2', packageSize: 8 })
    expect(s.list).toHaveLength(1)
  })

  it('ошибки сервера превращаются в понятные сообщения', async () => {
    const s = useStudentsStore()
    apiRequest.mockImplementation(() => err(403)); await expect(s.load()).rejects.toThrow('Нет прав')
    apiRequest.mockImplementation(() => err(404)); await expect(s.invite('1')).rejects.toThrow('не найден')
    apiRequest.mockImplementation(() => err(500)); await expect(s.load()).rejects.toThrow('(500)')
  })

  it('archive: после архива перечитывает и учеников, и расписание', async () => {
    apiRequest.mockImplementation((path: string) => ok(path === '/schedule' ? { current: { weekStart: 'a', lessons: [] }, next: { weekStart: 'b', lessons: [] } } : path === '/students' ? [] : { ok: true }))
    const s = useStudentsStore()
    await s.archive('1')
    expect(apiRequest.mock.calls.map((c) => c[0]).sort()).toEqual(['/schedule', '/students', '/students/1/archive'])
  })

  it('clear очищает список', () => {
    const s = useStudentsStore(); s.set([st('1', 'Аня')]); s.clear()
    expect(s.list).toHaveLength(0)
  })
})

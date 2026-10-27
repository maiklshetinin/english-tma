// Тесты учеников: список с сервера сортируется по имени, добавление возвращает ссылку, архив перечитывает ученика и расписание.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ArchivedStudent, Student } from '../../server/types'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn() }))

import { useStudentsStore } from './students'

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const err = (status: number) => Promise.resolve({ ok: false, status, json: async () => ({}) } as Response)
const st = (id: string, name: string): Student => ({ id, name, level: 'A2', color: '#fff', username: '', streak: 0, coins: 0, status: 'invited', tgId: null, photoUrl: '', price: 0, priceHistory: [{ from: '', price: 0 }], payment: { status: 'due', until: '2026-11-01', lessonsLeft: 0, packageSize: 8 } })

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
    const url = await s.add({ name: 'Маша', level: 'A2', packageSize: 8, username: 'masha_en', price: 120 })
    expect(url).toBe('https://t.me/bot?startapp=invite_x')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ name: 'Маша', level: 'A2', packageSize: 8, username: 'masha_en', price: 120 })
    expect(s.list).toHaveLength(1)
  })

  it('ошибки сервера превращаются в понятные сообщения', async () => {
    const s = useStudentsStore()
    apiRequest.mockImplementation(() => err(403)); await expect(s.load()).rejects.toThrow('Нет прав')
    apiRequest.mockImplementation(() => err(404)); await expect(s.invite('1')).rejects.toThrow('не найден')
    apiRequest.mockImplementation(() => err(500)); await expect(s.load()).rejects.toThrow('(500)')
  })

  it('archive: после архива перечитывает учеников, архив и расписание', async () => {
    apiRequest.mockImplementation((path: string) => ok(path === '/schedule' ? { current: { weekStart: 'a', lessons: [] }, next: { weekStart: 'b', lessons: [] } } : path === '/students' || path === '/students/archived' ? [] : { ok: true }))
    const s = useStudentsStore()
    await s.archive('1')
    expect(apiRequest.mock.calls.map((c) => c[0]).sort()).toEqual(['/schedule', '/students', '/students/1/archive', '/students/archived'])
  })

  it('setUsername: отправляет ник и перечитывает список; ошибки понятные', async () => {
    apiRequest.mockImplementation((path: string) => (path.endsWith('/username') ? ok(st('1', 'Маша')) : ok([st('1', 'Маша')])))
    const s = useStudentsStore()
    await s.setUsername('1', '@masha_en')
    expect(apiRequest.mock.calls[0][0]).toBe('/students/1/username')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ username: '@masha_en' })
    expect(apiRequest.mock.calls.map((c) => c[0])).toContain('/students')
    apiRequest.mockImplementation(() => err(400)); await expect(s.setUsername('1', 'x')).rejects.toThrow('5–32')
    apiRequest.mockImplementation(() => err(409)); await expect(s.setUsername('1', 'masha_en')).rejects.toThrow('уже вошёл')
  })

  it('setPrice: отправляет цену и перечитывает список; ошибки понятные', async () => {
    apiRequest.mockImplementation((path: string) => (path.endsWith('/price') ? ok(st('1', 'Маша')) : ok([st('1', 'Маша')])))
    const s = useStudentsStore()
    await s.setPrice('1', 150)
    expect(apiRequest.mock.calls[0][0]).toBe('/students/1/price')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ price: 150 })
    expect(apiRequest.mock.calls.map((c) => c[0])).toContain('/students')
    apiRequest.mockImplementation(() => err(400)); await expect(s.setPrice('1', -1)).rejects.toThrow('от 0')
    apiRequest.mockImplementation(() => err(404)); await expect(s.setPrice('1', 5)).rejects.toThrow('не найден')
  })

  it('clear очищает список', () => {
    const s = useStudentsStore(); s.set([st('1', 'Аня')]); s.clear()
    expect(s.list).toHaveLength(0)
  })
  it('архив: загрузка, вернуть (новая ссылка, ученик снова в списке), удалить навсегда', async () => {
    const calls: string[] = []
    let alive = [st('1', 'Маша')], arch: ArchivedStudent[] = [{ ...st('2', 'Петя'), archivedAt: '2026-10-20T10:00:00.000Z' }]
    apiRequest.mockImplementation((path: string, o?: RequestInit) => {
      calls.push(`${o?.method ?? 'GET'} ${path}`)
      if (path === '/students') return ok(alive)
      if (path === '/students/archived') return ok(arch)
      if (path === '/students/2/restore') { alive = [...alive, st('2', 'Петя')]; arch = []; return ok({ student: st('2', 'Петя'), url: 'https://t.me/bot?startapp=invite_new' }) }
      if (path === '/students/3') { arch = []; return ok({ ok: true }) }
      if (path === '/schedule') return ok({ current: { weekStart: '', lessons: [] }, next: { weekStart: '', lessons: [] } })
      return err(500)
    })
    const s = useStudentsStore()
    await s.loadArchived()
    expect(s.archived.map((x) => x.name)).toEqual(['Петя'])
    expect(await s.restore('2')).toBe('https://t.me/bot?startapp=invite_new')
    expect(s.archived).toHaveLength(0)
    expect(s.byId('2')?.name).toBe('Петя')
    arch = [{ ...st('3', 'Оля'), archivedAt: null }]; await s.loadArchived()
    await s.purge('3')
    expect(s.archived).toHaveLength(0)
    expect(calls).toContain('POST /students/2/restore')
    expect(calls).toContain('DELETE /students/3')
    expect(calls).toContain('GET /schedule')                      // после удаления расписание перечитывается
  })
})

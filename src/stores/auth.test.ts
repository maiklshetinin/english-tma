// Тесты авторизации: смена роли и проверка «есть ли чьими глазами смотреть».
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Student } from '../../server/types'

vi.mock('../firebase', () => ({ isDemo: false, tg: undefined, API: 'http://x', fb: null, apiRequest: vi.fn(), apiFetch: vi.fn() }))

import { useAuthStore } from './auth'
import { useStudentsStore } from './students'

const st = (id: string): Student => ({ id, name: id, level: 'A1', color: '#fff', username: '', streak: 0, coins: 0, status: 'active', tgId: null, photoUrl: '', price: 0, priceHistory: [{ from: '', price: 0 }], payment: { status: 'paid', until: '2026-12-01', lessonsLeft: 3, packageSize: 8 } })

describe('auth store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('по умолчанию режим ученика, вход ещё не выполнен', () => {
    const a = useAuthStore()
    expect(a.role).toBe('student'); expect(a.status).toBe('loading'); expect(a.user).toBeNull(); expect(a.isTeacher).toBe(false)
  })

  it('преподаватель без учеников не может перейти в режим ученика', () => {
    const a = useAuthStore()
    expect(a.setRole('teacher')).toBe(true)
    expect(a.setRole('student')).toBe(false)
    expect(a.role).toBe('teacher')
  })

  it('режим ученика: если текущего ученика нет — берётся первый из списка', () => {
    const a = useAuthStore(); useStudentsStore().set([st('a'), st('b')])
    expect(a.setRole('student')).toBe(true)
    expect(a.currentStudentId).toBe('a'); expect(a.role).toBe('student')
  })

  it('режим ученика: уже выбранный ученик сохраняется', () => {
    const a = useAuthStore(); useStudentsStore().set([st('a'), st('b')]); a.currentStudentId = 'b'
    a.setRole('student')
    expect(a.currentStudentId).toBe('b')
  })

  it('архивированный (пропавший из списка) ученик заменяется первым из списка', () => {
    const a = useAuthStore(); useStudentsStore().set([st('a')]); a.currentStudentId = 'gone'
    a.setRole('student')
    expect(a.currentStudentId).toBe('a')
  })

  it('authenticate без настроек Firebase/сервера даёт понятную ошибку', async () => {
    const a = useAuthStore()
    await a.authenticate()
    expect(a.status).toBe('error'); expect(a.error).toContain('Не настроены')
  })
})

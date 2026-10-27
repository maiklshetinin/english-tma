// Вкладка «Уроки»: у ученика — статус и цена, у преподавателя (can-mark) — ещё кнопка «Проведён»; цена проведённого урока берётся из зафиксированной.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Student } from '../../server/types'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn() }))

import LessonsList from './LessonsList.vue'
import { useScheduleStore } from '../stores/schedule'
import { useStudentsStore } from '../stores/students'

const D = '2026-10-27'
const st = (id: string, price: number, priceHistory: Student['priceHistory']): Student => ({ id, name: 'Маша', level: 'A2', color: '#fff', username: '', streak: 0, coins: 0, status: 'active', tgId: null, photoUrl: '', price, priceHistory, payment: { status: 'paid', until: '2026-11-01', lessonsLeft: 3, packageSize: 8 } })

// Одна Pinia на весь файл: allLessons (store/app.ts) — computed уровня модуля и привязан к сторам первой Pinia; между тестами только сбрасываем данные
setActivePinia(createPinia())

describe('LessonsList', () => {
  beforeEach(() => { useScheduleStore().set([]); useStudentsStore().set([]); apiRequest.mockReset(); apiRequest.mockImplementation(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) })) })

  it('статус и цена: запланированный — по истории цен, проведённый — по зафиксированной', () => {
    useStudentsStore().set([st('s1', 150, [{ from: '', price: 100 }, { from: '2026-10-28T00', price: 150 }])])
    useScheduleStore().set([
      { id: 'a', date: D, hour: 9, studentIds: ['s1'] },
      { id: 'b', date: D, hour: 10, studentIds: ['s1'], done: true, prices: { s1: 77 } },
    ])
    const w = mount(LessonsList, { props: { studentId: 's1' } })
    const t = w.text()
    expect(t).toContain('Запланирован'); expect(t).toContain('Проведён')
    expect(t).toContain('Цена: 100'); expect(t).toContain('Цена: 77')
    expect(w.find('button').exists()).toBe(false)                        // у ученика кнопок нет
  })

  it('преподаватель: кнопка «Проведён» отмечает урок и шлёт запрос; «Отменить» снимает', async () => {
    useStudentsStore().set([st('s1', 100, [{ from: '', price: 100 }])])
    const sch = useScheduleStore(); sch.set([{ id: 'a', date: D, hour: 9, studentIds: ['s1'] }])
    const w = mount(LessonsList, { props: { studentId: 's1', canMark: true } })
    await w.find('button').trigger('click')
    expect(sch.lessons[0].done).toBe(true)
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/lessons/a/done', expect.anything()))
    expect(w.text()).toContain('Отменить')
    await w.find('button').trigger('click')
    expect(sch.lessons[0].done).toBe(false)
  })

  it('показывает только уроки выбранного ученика; пусто — подсказка', () => {
    useStudentsStore().set([st('s1', 0, []), { ...st('s2', 0, []), name: 'Петя' }])
    useScheduleStore().set([{ id: 'a', date: D, hour: 9, studentIds: ['s2'] }])
    expect(mount(LessonsList, { props: { studentId: 's1' } }).text()).toContain('Пока нет уроков')
    expect(mount(LessonsList, { props: { studentId: 's2' } }).text()).toContain('Запланирован')
  })

  it('отменил ученик: у ученика «Отменён вами», у преподавателя «Отменил ученик», без оплаты и без кнопки', () => {
    useStudentsStore().set([st('s1', 100, [{ from: '', price: 100 }])])
    useScheduleStore().set([{ id: 'c', date: D, hour: 11, studentIds: ['s1'], canceled: { s1: 't' } }])
    const w = mount(LessonsList, { props: { studentId: 's1' } })
    expect(w.text()).toContain('Отменён вами'); expect(w.text()).toContain('Без оплаты'); expect(w.text()).not.toContain('Цена')
    const t = mount(LessonsList, { props: { studentId: 's1', canMark: true } })
    expect(t.text()).toContain('Отменил ученик'); expect(t.find('button').exists()).toBe(false)
  })

  it('урок с началом в 18:30 показывается как 18:30', () => {
    useStudentsStore().set([st('s1', 100, [{ from: '', price: 100 }])])
    useScheduleStore().set([{ id: 'm', date: D, hour: 18, minute: 30, studentIds: ['s1'] }])
    expect(mount(LessonsList, { props: { studentId: 's1' } }).text()).toContain('18:30')
  })
})

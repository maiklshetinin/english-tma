// Календарь уроков ученика: цвет по статусу, история по месяцам (листание), уроки выбранного дня, итог месяца.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Student } from '../../server/types'

vi.mock('../firebase', () => ({ isDemo: false, apiRequest: vi.fn(), apiFetch: vi.fn() }))

import LessonCalendar from './LessonCalendar.vue'
import { useScheduleStore } from '../stores/schedule'
import { useStudentsStore } from '../stores/students'
import { ymd } from '../store/app'

const st = (id: string, price: number): Student => ({ id, name: 'Маша', level: 'A2', color: '#fff', username: '', streak: 0, coins: 0, status: 'active', tgId: null, photoUrl: '', price, priceHistory: [{ from: '', price }], payment: { status: 'paid', until: '2026-11-01', lessonsLeft: 3, packageSize: 8 } })
const now = new Date(), thisMonth = ymd(now).slice(0, 7)
const prev = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return ymd(d).slice(0, 7) })()

describe('LessonCalendar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useStudentsStore().set([st('s1', 100)])
    const s = useScheduleStore()
    s.history = [
      { id: 'h1', date: `${prev}-10`, hour: 9, studentIds: ['s1'], done: true, prices: { s1: 90 } },
      { id: 'h2', date: `${prev}-17`, hour: 9, studentIds: ['s1'], canceled: { s1: 't' } },
    ]
    s.set([{ id: 'c1', date: `${thisMonth}-20`, hour: 18, minute: 30, studentIds: ['s1'] }, { id: 'c2', date: `${thisMonth}-05`, hour: 10, studentIds: ['s1'], done: true, prices: { s1: 100 } }])
  })

  it('текущий месяц: точки по статусу, итог; день — список уроков', async () => {
    const w = mount(LessonCalendar, { props: { studentId: 's1' } })
    expect(w.find('button.day.done').exists()).toBe(true); expect(w.find('button.day.plan').exists()).toBe(true)
    expect(w.find('.sum').text()).toContain('1проведено'); expect(w.find('.sum').text()).toContain('1запланировано')
    await w.findAll('button.day').find(d => d.find('.n').text() === '20')!.trigger('click')
    expect(w.find('.ls').text()).toContain('18:30'); expect(w.find('.ls').text()).toContain('Запланирован')
  })

  it('история: предыдущий месяц — проведённый зелёный с ценой, отменённый красный', async () => {
    const w = mount(LessonCalendar, { props: { studentId: 's1' } })
    await w.find('.nav').trigger('click')                                // ‹
    expect(w.find('button.day.done').exists()).toBe(true); expect(w.find('button.day.off').exists()).toBe(true)
    expect(w.find('.sum').text()).toContain('90')
    await w.findAll('button.day').find(d => d.find('.n').text() === '17')!.trigger('click')
    expect(w.find('.ls').classes()).toContain('off'); expect(w.find('.ls').text()).toContain('Отменён вами')
  })

  it('преподаватель: «Ожидается» и «Факт» за месяц, «Потеряно»; «Проведён» отмечает урок', async () => {
    const s = useScheduleStore()
    s.set([...s.lessons, { id: 'c3', date: `${thisMonth}-21`, hour: 9, studentIds: ['s1'], canceled: { s1: 't' } }])
    const w = mount(LessonCalendar, { props: { studentId: 's1', teacher: true } })
    const money = w.find('.money').text()
    expect(money).toContain('Ожидается за месяц200')               // проведённый 100 + запланированный 100 (отменённый не входит)
    expect(money).toContain('Факт — проведённые100')
    expect(money).toContain('−100')                                 // отменил ученик
    await w.findAll('button.day').find(d => d.find('.n').text() === '20')!.trigger('click')
    await w.find('.ls .btn').trigger('click')
    expect(s.lessons.find(l => l.id === 'c1')!.done).toBe(true)
    await w.findAll('button.day').find(d => d.find('.n').text() === '21')!.trigger('click')
    expect(w.find('.ls').text()).toContain('Отменил ученик'); expect(w.find('.ls .btn').exists()).toBe(false)
  })
})

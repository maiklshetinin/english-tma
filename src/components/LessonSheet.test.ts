// Шторка урока: состав группы, цена = сумма цен учеников, добавить / убрать ученика, проведённый урок не правится.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Lesson, Student } from '../../server/types'

vi.mock('../firebase', () => ({ isDemo: false, apiRequest: vi.fn(), apiFetch: vi.fn() }))

import LessonSheet from './LessonSheet.vue'
import { useStudentsStore } from '../stores/students'

const D = '2026-10-27'
const st = (id: string, name: string, price: number): Student => ({ id, name, level: 'A2', color: '#fff', username: '', streak: 0, coins: 0, status: 'active', tgId: null, photoUrl: '', price, priceHistory: [{ from: '', price }], payment: { status: 'paid', until: '2026-11-01', lessonsLeft: 3, packageSize: 8 } })

describe('LessonSheet', () => {
  beforeEach(() => { setActivePinia(createPinia()); useStudentsStore().set([st('a', 'Маша', 100), st('b', 'Петя', 80), st('c', 'Оля', 50)]) })

  it('групповой урок: все ученики и итог — сумма их цен', () => {
    const w = mount(LessonSheet, { props: { lesson: { id: 'L', date: D, hour: 9, studentIds: ['a', 'b'] } as Lesson } })
    expect(w.text()).toContain('Группа · 2'); expect(w.text()).toContain('Маша'); expect(w.text()).toContain('Петя')
    expect(w.find('.total').text()).toContain('180')
    expect(w.find('.box').classes()).toContain('group')
    expect(w.find('.head .stack').exists()).toBe(true)                   // в шапке — аватарки внахлёст
  })

  it('проведённый урок: итог по зафиксированным ценам, состав не правится', () => {
    const w = mount(LessonSheet, { props: { lesson: { id: 'L', date: D, hour: 9, studentIds: ['a', 'b'], done: true, prices: { a: 90, b: 70 } } as Lesson } })
    expect(w.find('.total').text()).toContain('160')
    expect(w.find('.x').exists()).toBe(false)
    expect(w.find('.plus').exists()).toBe(false)
  })

  it('добавить и убрать: шторка отдаёт новый состав целиком; последнего ученика не убрать', async () => {
    const lesson = { id: 'L', date: D, hour: 9, studentIds: ['a'] } as Lesson
    const w = mount(LessonSheet, { props: { lesson } })
    expect(w.find('.x').exists()).toBe(false)                              // один ученик — крестика нет
    expect(w.find('.total').text()).toContain('100')
    await w.find('.plus').trigger('click')
    expect(w.findAll('.add .prow')).toHaveLength(2)                       // Петя и Оля, без Маши
    await w.find('.search input').setValue('пет')
    expect(w.findAll('.add .prow')).toHaveLength(1)                       // поиск по имени
    await w.findAll('.add .prow')[0].trigger('click')
    expect(w.emitted('students')![0]).toEqual([lesson, ['a', 'b']])

    await w.setProps({ lesson: { ...lesson, studentIds: ['a', 'b'] } })
    await w.findAll('.x')[0].trigger('click')
    expect(w.emitted('students')![1][1]).toEqual(['b'])
  })
})

describe('урок с учеником, которого больше нет (удалён из базы / в архиве)', () => {
  beforeEach(() => { setActivePinia(createPinia()); useStudentsStore().set([st('a', 'Маша', 100), st('b', 'Петя', 80)]) })

  it('шторка поясняет, а добавление отправляет только известных учеников', async () => {
    const lesson = { id: 'L', date: D, hour: 9, studentIds: ['gone'] } as Lesson
    const w = mount(LessonSheet, { props: { lesson } })
    expect(w.find('.orphan').exists()).toBe(true)
    await w.find('.plus').trigger('click')
    await w.findAll('.add .prow').find(b => b.text().includes('Петя'))!.trigger('click')
    expect(w.emitted('students')![0][1]).toEqual(['b'])                     // 'gone' не уходит на сервер (иначе 404)
  })

  it('сетка: «пустой» урок виден серым «?», группа без первого ученика не пропадает', async () => {
    const { default: WeekGrid } = await import('./WeekGrid.vue')
    const { useScheduleStore } = await import('../stores/schedule')
    useScheduleStore().set([
      { id: 'o', date: D, hour: 11, studentIds: ['gone'] },
      { id: 'g', date: D, hour: 12, studentIds: ['gone', 'a', 'b'] },
    ])
    const w = mount(WeekGrid, { props: { dates: [D] } })
    const chips = w.findAll('.chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].classes()).toContain('orphan')
    expect(chips[1].classes()).toContain('group')
    await chips[0].trigger('click')
    expect(w.emitted('lesson')![0][0]).toMatchObject({ id: 'o' })           // по нему можно нажать и убрать
  })
  it('проведённый урок с удалённым навсегда учеником: имя и цена из истории, итог сходится', () => {
    const lesson = { id: 'L', date: D, hour: 9, studentIds: ['a', 'gone'], done: true, prices: { a: 100, gone: 70 }, names: { gone: 'Рома' } } as Lesson
    const w = mount(LessonSheet, { props: { lesson } })
    expect(w.find('.tile.gone').text()).toContain('Рома (удалён)')
    expect(w.find('.tile.gone').text()).toContain('70')
    expect(w.find('.total').text()).toContain('170')
    expect(w.find('.orphan').exists()).toBe(false)
  })

  it('отменил ученик: цена без него, «потеряно», кнопки отмены; отменили все — «проведён» нельзя', async () => {
    const lesson = { id: 'L', date: D, hour: 9, studentIds: ['a', 'b'], canceled: { a: '2026-10-26T10:00:00Z' } } as Lesson
    const w = mount(LessonSheet, { props: { lesson } })
    expect(w.find('.tile.off').text()).toContain('отменил')
    expect(w.find('.total').text()).toContain('80')
    expect(w.find('.lostrow').text()).toContain('100')
    await w.findAll('.tile').find(t => t.text().includes('Петя'))!.find('.chipbtn').trigger('click')
    expect(w.emitted('cancel')![0]).toEqual([lesson, 'b', true])
    await w.setProps({ lesson: { ...lesson, canceled: { a: 't', b: 't' } } })
    expect(w.find('.head .badge').text()).toBe('Отменён')
    expect(w.findAll('button').find(b => b.text() === 'Урок проведён')!.attributes('disabled')).toBeDefined()
  })

  it('архивный ученик в проведённом уроке: серый, «в архиве», цена в итоге остаётся, карточку не открыть', async () => {
    useStudentsStore().archived = [{ ...st('z', 'Зоя', 50), archivedAt: null, archived: true }]
    const lesson = { id: 'L', date: D, hour: 9, studentIds: ['a', 'z'], done: true, prices: { a: 100, z: 50 } } as Lesson
    const w = mount(LessonSheet, { props: { lesson } })
    const tile = w.findAll('.tile').find(t => t.text().includes('Зоя'))!
    expect(tile.text()).toContain('в архиве'); expect(tile.text()).toContain('50')
    expect(tile.find('.av').classes()).toContain('arch')
    expect(tile.find('button.ava').attributes('disabled')).toBeDefined()
    expect(w.find('.total').text()).toContain('150')
    expect(w.find('.orphan').exists()).toBe(false)
  })

  it('начало внутри часа и заметка: время 18:30 в шапке, выбор минуты и сохранение заметки', async () => {
    const lesson = { id: 'L', date: D, hour: 18, minute: 30, note: 'старое', studentIds: ['a'] } as Lesson
    const w = mount(LessonSheet, { props: { lesson } })
    expect(w.find('.head .hint').text()).toContain('18:30')
    expect(w.find('.mins .on').text()).toBe('18:30')
    await w.findAll('.mins button').find(b => b.text() === '18:45')!.trigger('click')
    expect(w.emitted('details')![0]).toEqual([lesson, { minute: 45 }])
    const ta = w.find('.notes textarea')
    expect((ta.element as HTMLTextAreaElement).value).toBe('старое')
    await ta.setValue('новое'); await ta.trigger('blur')
    expect(w.emitted('details')![1]).toEqual([lesson, { note: 'новое' }])
  })
})

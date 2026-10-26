// Дымовой тест: всё приложение в демо-режиме (как `npm run dev` вне Telegram) собирается, читает учеников и уроки из сторов и рисует их.
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import { linkStores, state } from './store/app'
import { useAuthStore } from './stores/auth'
import { useStudentsStore } from './stores/students'
import { useScheduleStore } from './stores/schedule'
import { usePathStore } from './stores/path'
import { useDecksStore } from './stores/decks'

describe('приложение в демо-режиме', () => {
  it('преподаватель видит учеников и уроки в сетке, ученик — свой экран', async () => {
    history.pushState({}, '', '/?demo&role=teacher')
    const pinia = createPinia()
    setActivePinia(pinia)
    linkStores()                                                   // как в main.js: после Pinia, до монтирования
    const w = mount(App, { global: { plugins: [pinia] }, attachTo: document.body })
    await vi.waitFor(() => expect(useAuthStore().status).toBe('ready'))      // демо-данные подгружаются лениво
    await flushPromises()

    const students = useStudentsStore(), schedule = useScheduleStore(), auth = useAuthStore(), path = usePathStore(), decks = useDecksStore()
    expect(students.list).toHaveLength(7)
    expect(students.list.every((s) => typeof s.id === 'string')).toBe(true)
    expect(schedule.lessons.length).toBeGreaterThan(0)
    expect(auth.role).toBe('teacher')
    expect(auth.status).toBe('ready')
    expect(state.tab).toBe('home')                                 // смена роли открыла первую вкладку преподавателя
    expect(w.text()).toContain('Мария Д.')                         // панель учеников
    expect(w.findAll('.wk .chip').length).toBeGreaterThan(0)       // уроки в сетке расписания
    for (const id of students.list.map((s) => s.id)) expect(path.paths[id]).toBeDefined()      // у каждого ученика есть путь
    expect(path.of('1').length).toBeGreaterThan(0)
    expect(path.presets).toHaveLength(2)
    expect(decks.list.map((d) => d.id)).toEqual(['deck-basic', 'deck-travel', 'deck-phrasal'])
    expect(decks.forUser('2').map((d) => d.id)).toEqual(['deck-basic', 'deck-phrasal'])      // «для всех» + назначенные

    expect(auth.setRole('student')).toBe(true)
    await flushPromises()
    expect(auth.role).toBe('student')
    expect(state.tab).toBe('path')                                 // …и первую вкладку ученика
    expect(auth.currentStudentId).toBe('1')
    expect(w.text()).not.toContain('undefined')
    w.unmount()
  })
})

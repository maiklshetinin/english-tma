// Обход всех экранов в демо-режиме: каждая вкладка преподавателя и ученика, карточка ученика с путём и пресетами, колоды.
// Ловит предупреждения Vue («свойство не найдено», «неверный пропс») и ошибки отрисовки — именно их не видит сборка.
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import App from './App.vue'
import { TABS, linkStores, state } from './store/app'
import { useAuthStore } from './stores/auth'
import { useDecksStore } from './stores/decks'
import { usePathStore } from './stores/path'

describe('все экраны в демо-режиме', () => {
  it('ни одна вкладка и ни одна карточка не выдаёт предупреждений или ошибок', async () => {
    history.pushState({}, '', '/?demo&role=teacher')
    const problems: string[] = []
    const pinia = createPinia(); setActivePinia(pinia); linkStores()
    const w = mount(App, { attachTo: document.body, global: { plugins: [pinia], config: {
      warnHandler: (m: string) => { problems.push('WARN ' + m) }, errorHandler: (e: unknown) => { problems.push('ERROR ' + String(e)) } } } })
    const auth = useAuthStore()
    await vi.waitFor(() => expect(auth.status).toBe('ready'))
    await flushPromises()

    const visit = async (label: string) => { await flushPromises(); expect(w.text(), label).not.toContain('undefined'); expect(w.text(), label).not.toContain('NaN') }

    // Преподаватель: все вкладки
    expect(auth.setRole('teacher')).toBe(true)
    for (const tab of TABS.teacher) { state.tab = tab.id; await visit('teacher/' + tab.id) }

    // Карточка ученика: путь, пресеты, оплата
    state.tab = 'students'; state.selectedStudentId = '2'; await visit('student detail')
    expect(w.text()).toContain('Леня С.')
    expect(w.text()).toContain('Unit 1')                       // путь ученика отрисован
    state.selectedStudentId = null

    // Вкладка «Путь» преподавателя с пресетами и «Слова» с колодами
    state.tab = 'path'; await visit('presets'); expect(w.text()).toContain('Базовый курс')
    state.tab = 'words'; await visit('words'); expect(w.text()).toContain('Business Basics')

    // Ученик: все вкладки
    expect(auth.setRole('student')).toBe(true)
    for (const tab of TABS.student) { state.tab = tab.id; await visit('student/' + tab.id) }
    state.tab = 'path'; await visit('student path'); expect(w.text()).toContain('Unit 1')
    state.tab = 'cards'; await visit('student cards')

    // Правка в сторе отражается на экране
    auth.setRole('teacher'); state.tab = 'words'
    useDecksStore().list[0].title = 'Переименовано'; await visit('rename'); expect(w.text()).toContain('Переименовано')
    state.tab = 'path'; usePathStore().presets[0].name = 'Другой пресет'; await visit('rename preset'); expect(w.text()).toContain('Другой пресет')

    expect(problems).toEqual([])
    w.unmount()
  })
})

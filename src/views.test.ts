// Обход всех экранов в демо-режиме: каждая вкладка преподавателя и ученика, карточка ученика с путём и пресетами, колоды.
// Ловит предупреждения Vue («свойство не найдено», «неверный пропс») и ошибки отрисовки — именно их не видит сборка.
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import App from './App.vue'
import { createMemoryHistory } from 'vue-router'
import { TABS } from './store/app'
import { createAppRouter } from './router'
import { useAuthStore } from './stores/auth'
import { useDecksStore } from './stores/decks'

describe('все экраны в демо-режиме', () => {
  it('ни одна вкладка и ни одна карточка не выдаёт предупреждений или ошибок', async () => {
    history.pushState({}, '', '/?demo&role=teacher')
    const problems: string[] = []
    const pinia = createPinia(); setActivePinia(pinia)
    const router = createAppRouter(createMemoryHistory())
    const go = (name: string, id?: string) => router.push({ name, params: id ? { id } : {} })      // как нажатие на вкладку / на ученика
    const w = mount(App, { attachTo: document.body, global: { plugins: [pinia, router], config: {
      warnHandler: (m: string) => { problems.push('WARN ' + m) }, errorHandler: (e: unknown) => { problems.push('ERROR ' + String(e)) } } } })
    const auth = useAuthStore()
    await vi.waitFor(() => expect(auth.status).toBe('ready'))
    await flushPromises()

    const visit = async (label: string) => { await flushPromises(); expect(w.text(), label).not.toContain('undefined'); expect(w.text(), label).not.toContain('NaN') }

    // Преподаватель: все вкладки
    expect(auth.setRole('teacher')).toBe(true)
    for (const tab of TABS.teacher) { await go(tab.id); await visit('teacher/' + tab.id) }

    // Карточка ученика: путь, пресеты, оплата
    await go('students', '2'); await visit('student detail')
    expect(w.text()).toContain('Леня С.')
    expect(w.text()).toContain('Итого за')                     // по умолчанию открыта вкладка «Уроки»: календарь и уроки месяца списком с итогом
    await w.find('.day.has').trigger('click'); expect(w.find('.mli.hl').exists()).toBe(true); expect(w.find('.ml .btn').exists()).toBe(false)   // нажатие на день подсвечивает его уроки в списке; статус отсюда не меняют (только на «Главной»)
    await w.findAll('.seg button').find((b) => b.text() === 'Путь и слова')!.trigger('click'); await visit('student detail path')
    expect(w.text()).toContain('Unit 1')                       // путь ученика отрисован
    await go('students')

    // Вкладка «Курсы» преподавателя (список и просмотр курса) и «Слова» с колодами
    await go('path'); await visit('courses'); expect(w.text()).toContain('Как видит ученик')
    await go('words'); await visit('words'); expect(w.text()).toContain('Business Basics')

    // Ученик: все вкладки
    expect(auth.setRole('student')).toBe(true)
    for (const tab of TABS.student) { await go(tab.id); await visit('student/' + tab.id) }
    await go('path'); await visit('student path'); expect(w.text()).toContain('Unit 1')
    await go('cards'); await visit('student cards')

    // Правка в сторе отражается на экране
    auth.setRole('teacher'); await flushPromises(); await go('words')      // дать App.vue увести со вкладки ученика, потом открыть «Слова»
    useDecksStore().list[0].title = 'Переименовано'; await visit('rename'); expect(w.text()).toContain('Переименовано')

    expect(problems).toEqual([])
    w.unmount()
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CourseHow from './CourseHow.vue'

const mk = () => mount(CourseHow, { global: { mocks: { $router: { push: () => {} } }, stubs: { BackButton: true } } })

describe('«Как работает курс»', () => {
  it('сразу после урока повторять нечего; через 2 дня верные слова приходят в «Повторение»', async () => {
    const w = mk()
    expect(w.find('.blk.rv').text()).toContain('Повторять пока нечего')
    await w.find('#how-days').setValue('2')
    const rv = w.find('.blk.rv').text()
    expect(rv).toContain('Hello'); expect(rv).toContain('Nice to meet you')
  })
  it('ошибка (даже исправленная) — слово на повтор через день, экран — в чекпоинт; без ошибок — экраны уроков поровну', async () => {
    const w = mk()
    expect(w.find('.blk.ck').text()).toContain('Пары')
    await w.find('#how-days').setValue('1')
    const rv = w.find('.blk.rv').text()
    expect(rv).toContain('Bye'); expect(rv).not.toContain('Hello')
    await w.findAll('.seg2')[1].findAll('button')[0].trigger('click')          // «Пары» — верно
    expect(w.find('.blk.ck').text()).toContain('Ошибок нет')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'

beforeEach(() => localStorage.setItem('tma.courseHow.tour', '1'))      // обучалка — отдельным тестом
import { mount, flushPromises } from '@vue/test-utils'
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

describe('«Как работает курс»: слово с ошибкой ждёт следующего дня', () => {
  it('через 12 ч память ниже порога, но слово не в «Повторении» — объяснение и «ждёт завтра»; через сутки — прилетает', async () => {
    const w = mount(CourseHow, { global: { mocks: { $router: { push: () => {} } }, stubs: { BackButton: true } } })
    await w.find('#how-days').setValue('0.5')
    expect(w.find('.why').text()).toContain('Bye'); expect(w.findAll('.wt').length).toBe(2)
    expect(w.find('.blk.rv').text()).toContain('Повторять пока нечего')
    await w.find('#how-days').setValue('1')
    expect(w.find('.why').exists()).toBe(false)
    expect(w.find('.arr').text()).toContain('Bye'); expect(w.find('.blk.rv').text()).toContain('See you')
  })
})

describe('«Как работает курс»: обучалка', () => {
  it('при первом входе: пустые ответы → пройти урок → Review → ползунок → «Повторение» → чекпоинт; потом сама не показывается', async () => {
    localStorage.removeItem('tma.courseHow.tour')
    const w = mount(CourseHow, { attachTo: document.body, global: { mocks: { $router: { push: () => {} } }, stubs: { BackButton: true } } })
    await flushPromises()
    const card = () => document.querySelector('.tcard')?.textContent ?? ''
    expect(card()).toContain('Пройдите урок'); expect(document.querySelector('.tcard .primary')).toBeNull()
    const segs = w.findAll('.seg2')
    await segs[0].findAll('button')[0].trigger('click'); await segs[1].findAll('button')[1].trigger('click'); await segs[2].findAll('button')[0].trigger('click')
    ;(document.querySelector('.tcard .primary') as HTMLButtonElement).click(); await flushPromises()
    expect(card()).toContain('Слова уже в Review')
    ;(document.querySelector('.tcard .primary') as HTMLButtonElement).click(); await flushPromises()
    expect(card()).toContain('Промотайте время'); expect(document.querySelector('.tcard .primary')).toBeNull()
    await w.find('#how-days').setValue('1')
    ;(document.querySelector('.tcard .primary') as HTMLButtonElement).click(); await flushPromises()
    expect(card()).toContain('Bye')
    ;(document.querySelector('.tcard .primary') as HTMLButtonElement).click(); await flushPromises()
    expect(card()).toContain('«Пары»')
    ;(document.querySelector('.tcard .primary') as HTMLButtonElement).click(); await flushPromises()
    expect(document.querySelector('.tcard')).toBeNull(); expect(localStorage.getItem('tma.courseHow.tour')).toBe('1')
    w.unmount()
  })
})

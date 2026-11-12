import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CourseSandbox from './CourseSandbox.vue'

const mk = () => mount(CourseSandbox, { attachTo: document.body, global: { mocks: { $router: { push: () => {} } }, stubs: { BackButton: true, Teleport: true } } })
const sw = (w: any, name: string) => w.findAll('.swb').find((b: any) => b.text().includes(name))

describe('«Песочница курса»', () => {
  it('строгий порог: пока чекпоинт главы 1 не сдан — глава 2 закрыта; сдал — открылась', async () => {
    const w = mk()
    expect(w.find('.lock').exists()).toBe(false)
    await sw(w, 'Порог чекпоинта').trigger('click'); await sw(w, 'Строгий').trigger('click')
    expect(w.find('.lock').exists()).toBe(true)
    const ck = w.findAll('.blk.ckb')[0]
    await ck.findAll('.ci .seg2 button')[0].trigger('click')          // «Пары» в чекпоинте — верно (100 %)
    expect(w.find('.lock').exists()).toBe(false)
    expect(w.findAll('.res')[0].text()).toContain('Засчитан')
    w.unmount()
  })
  it('мягкий режим — «долг» у главы 1; «Повторить сейчас» собирает слова обеих глав', async () => {
    const w = mk()
    await sw(w, 'Порог чекпоинта').trigger('click')
    expect(w.find('.debt').text()).toContain('чекпоинт ещё не пройден')
    await sw(w, 'по всему курсу').trigger('click')
    await w.find('#sbx-days').setValue('1')
    const gl = w.find('.gl').text()
    expect(gl).toContain('гл. 1'); expect(gl).toContain('гл. 2')
    expect(w.findAll('.blk.rv').length).toBe(0)
    w.unmount()
  })
  it('напоминание в Telegram: промотали время — бот «написал» (ничего не отправляется)', async () => {
    const w = mk()
    await sw(w, 'Telegram').trigger('click')
    expect(w.find('.chat').text()).toContain('Сообщений пока нет')
    await w.find('#sbx-days').setValue('2'); await flushPromises()
    expect(w.findAll('.msg').length).toBeGreaterThan(0)
    expect(w.find('.tgt').text()).toContain('Пора повторить')
    w.unmount()
  })
})

describe('«Песочница курса»: график и «прилетело» — как на «Как работает курс»', () => {
  it('промотали до суток — слова въезжают в «Повторение», плашка под ползунком; до этого — «ждёт завтра»', async () => {
    const w = mk()
    expect(w.findAll('.cv').length).toBeGreaterThan(0)
    await w.find('#sbx-days').setValue('0.5')
    expect(w.findAll('.wt').length).toBeGreaterThan(0)
    await w.find('#sbx-days').setValue('1')
    expect(w.find('.arr').text()).toContain('fine')
    expect(w.findAll('.rl li.new').length).toBeGreaterThan(0)
    w.unmount()
  })
})

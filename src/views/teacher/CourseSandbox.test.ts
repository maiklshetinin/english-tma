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
    await w.find('#sbx-days').setValue('2')
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
    await w.find('#sbx-days').setValue('1.5')
    expect(w.findAll('.wt').length).toBeGreaterThan(0)
    await w.find('#sbx-days').setValue('2')
    expect(w.find('.arr').text()).toContain('fine')
    expect(w.findAll('.rl li.new').length).toBeGreaterThan(0)
    w.unmount()
  })
})

describe('«Песочница курса»: свой курс целиком + машина времени', () => {
  const COURSE = { title: 'Мой A1', items: [
    { id: 'u1', type: 'unit', title: 'Глава Еда' },
    { id: 'l1', type: 'lesson', title: 'Фрукты', steps: [{ id: 'a', kind: 'choice', opts: [{ w: 'apple', t: 'яблоко' }, { w: 'pear', t: 'груша' }], ans: 0 }, { id: 'b', kind: 'pairs', pairs: [{ a: 'milk', b: 'молоко' }, { a: 'bread', b: 'хлеб' }] }] },
    { id: 'l2', type: 'lesson', title: 'Напитки', steps: [{ id: 'c', kind: 'choice', opts: [{ w: 'tea', t: 'чай' }, { w: 'juice', t: 'сок' }], ans: 0 }] },
    { id: 'u2', type: 'unit', title: 'Глава Дом' },
    { id: 'l3', type: 'lesson', title: 'Комнаты', steps: [{ id: 'd', kind: 'choice', opts: [{ w: 'kitchen', t: 'кухня' }, { w: 'room', t: 'комната' }], ans: 0 }, { id: 'e', kind: 'choice', opts: [{ w: 'apple', t: 'яблоко' }, { w: 'tea', t: 'чай' }], ans: 0 }] },
  ] }
  it('выбрали курс — все главы и уроки; уроки проходятся по дням; одно слово в двух уроках — одна строка', async () => {
    localStorage.setItem('tma.courseRail.v1', JSON.stringify(COURSE))
    const w = mk(); await flushPromises()
    await w.findAll('.pks .cc')[1].trigger('click'); await flushPromises()
    expect(w.findAll('.chp').length).toBe(2)
    expect(w.findAll('.ls').length).toBe(3)
    expect(w.findAll('.pks .cc')[1].classes()).toContain('on')          // карточка своего курса подсвечена, пример — нет
    expect(w.find('.pks .cc.demo').classes()).not.toContain('on')
    expect(w.find('.ct .tag').text()).toBe('Мой A1')
    expect(w.find('.tl label').text()).toContain('1 из 3')               // день 0 — пройден первый урок
    expect(w.findAll('.ls.later').length).toBe(2)
    await w.findAll('.tm button')[1].trigger('click'); await w.findAll('.tm button')[1].trigger('click')
    expect(w.find('.tl label').text()).toContain('3 из 3')
    const rows = w.findAll('.tr .w').map(x => x.text())
    expect(rows.filter(t => t.startsWith('apple')).length).toBe(1)
    expect(rows.find(t => t.startsWith('apple'))).toContain('встреч 2')
    expect(w.find('.chp .cht small').text()).toBe('пройдена')
    w.unmount(); localStorage.removeItem('tma.courseRail.v1')
  })
  it('быстрые ответы: «все верно» / «очистить»; темп «всё в 1 день» — все уроки сразу', async () => {
    localStorage.setItem('tma.courseRail.v1', JSON.stringify(COURSE))
    const w = mk(); await flushPromises()
    await w.findAll('.pks .cc')[1].trigger('click'); await flushPromises()
    await w.findAll('.qa .qb').find(b => b.text().includes('очистить'))!.trigger('click')
    expect(w.findAll('.sc .seg2 button.ok').length).toBe(0)
    await w.findAll('.qa .qb').find(b => b.text().includes('все верно'))!.trigger('click')
    expect(w.findAll('.sc .seg2 button.ok').length).toBe(5)
    await w.findAll('.qa .seg2 button').find(b => b.text().includes('всё в 1 день'))!.trigger('click')
    expect(w.findAll('.ls.later').length).toBe(0)
    w.unmount(); localStorage.removeItem('tma.courseRail.v1')
  })
})

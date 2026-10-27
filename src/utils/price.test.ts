import { describe, expect, it } from 'vitest'
import { fmtMoney, fmtMoneyK, fmtMoneyShort, lessonKey, lessonMoney, priceAt, sumMoney } from './price'

const s = { price: 150, priceHistory: [{ from: '', price: 100 }, { from: '2026-10-26T11', price: 150 }] }

describe('priceAt', () => {
  it('урок до смены цены остаётся по старой, с часа смены и позже — по новой', () => {
    expect(priceAt(s, '2026-10-20', 9)).toBe(100)
    expect(priceAt(s, '2026-10-26', 10)).toBe(100)
    expect(priceAt(s, '2026-10-26', 11)).toBe(150)
    expect(priceAt(s, '2026-10-27', 8)).toBe(150)
  })
  it('несколько смен: каждый урок по цене своего времени', () => {
    const h = { price: 200, priceHistory: [...s.priceHistory, { from: '2026-11-02T00', price: 200 }] }
    expect(priceAt(h, '2026-10-30', 12)).toBe(150)
    expect(priceAt(h, '2026-11-02', 8)).toBe(200)
    expect(priceAt(h, '2026-10-26', 10)).toBe(100)
  })
  it('нет истории — текущая цена; нет ученика — 0', () => {
    expect(priceAt({ price: 90, priceHistory: [] }, '2026-10-26', 10)).toBe(90)
    expect(priceAt(undefined, '2026-10-26', 10)).toBe(0)
  })
  it('ключ урока: час с нулём', () => { expect(lessonKey('2026-10-26', 8)).toBe('2026-10-26T08') })
})

describe('деньги в расписании', () => {
  const st: Record<string, { price: number; priceHistory: { from: string; price: number }[] }> = { a: { price: 100, priceHistory: [{ from: '', price: 100 }] }, b: { price: 80, priceHistory: [{ from: '', price: 80 }] } }
  const find = (id: string) => st[id]
  it('запланированный урок: факт 0, план — сумма цен учеников (группа складывается)', () => {
    expect(lessonMoney({ date: '2026-10-27', hour: 9, studentIds: ['a', 'b'] }, find)).toEqual({ real: 0, plan: 180 })
  })
  it('проведённый: факт = план = зафиксированные цены (и удалённого ученика тоже)', () => {
    expect(lessonMoney({ date: '2026-10-27', hour: 9, studentIds: ['a', 'gone'], done: true, prices: { a: 90, gone: 70 } }, find)).toEqual({ real: 160, plan: 160 })
  })
  it('сумма за день/неделю и форматирование', () => {
    const m = sumMoney([{ date: 'x', hour: 9, studentIds: ['a'] }, { date: 'x', hour: 10, studentIds: ['b'], done: true, prices: { b: 80 } }], find)
    expect(m).toEqual({ real: 80, plan: 180 })
    expect(fmtMoney(12500).replace(/\s/g, ' ')).toBe('12 500')
    expect(fmtMoneyShort(9500).replace(/\s/g, ' ')).toBe('9 500')
    expect(fmtMoneyShort(12500)).toBe('12,5к')
    expect(fmtMoneyShort(12000)).toBe('12к')
    expect(fmtMoneyK(2500)).toBe('2,5к'); expect(fmtMoneyK(800)).toBe('800')
  })
})

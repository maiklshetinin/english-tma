import { describe, expect, it } from 'vitest'
import { lessonKey, priceAt } from './price'

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

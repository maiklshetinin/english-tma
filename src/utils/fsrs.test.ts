import { describe, it, expect } from 'vitest'
import { answer, dueMs, recallNow } from './fsrs'

const T = new Date(2026, 0, 5, 10).getTime()
const grad = (c?: { retention: number; maxDays: number }) => { let s = answer(null, 2, T, c); s = answer(s, 2, dueMs(s), c); return answer(s, 2, dueMs(s) + 3_600_000, c) }

describe('колоды: FSRS-6 из ts-fsrs и настройки', () => {
  it('желаемое запоминание: ниже — интервалы длиннее, выше — короче', () => {
    const a = grad({ retention: 0.8, maxDays: 36500 }).interval, b = grad().interval, c = grad({ retention: 0.95, maxDays: 36500 }).interval
    expect(a).toBeGreaterThan(b); expect(c).toBeLessThan(b)
  })
  it('максимальный интервал ограничивает срок', () => {
    let s = grad({ retention: 0.9, maxDays: 7 })
    for (let k = 0; k < 5; k++) s = answer(s, 3, dueMs(s) + 3_600_000, { retention: 0.9, maxDays: 7 })
    expect(s.interval).toBeLessThanOrEqual(7)
  })
  it('вероятность вспомнить сразу после ответа — 100 %, потом падает', () => {
    const s = grad()
    expect(recallNow(s, s.lastAt!)).toBe(1); expect(recallNow(s, s.lastAt! + 30 * 864e5)).toBeLessThan(0.9)
  })
})

// Часовой пояс расписания: «сейчас», «сегодня» и даты недели — по выбранному поясу, а не по часам компьютера.
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TZ, hh, nowIn, setTz, tz, tzShort, weekDates } from './dates'

describe('часовой пояс', () => {
  afterEach(() => setTz(DEFAULT_TZ))

  it('по умолчанию Москва', () => { expect(DEFAULT_TZ).toBe('Europe/Moscow'); expect(tzShort('Europe/Moscow')).toBe('МСК') })

  it('nowIn: одна и та же минута — разное время в разных поясах', () => {
    const at = Date.UTC(2026, 9, 27, 21, 30)                         // 27.10.2026 21:30 UTC
    expect(nowIn('Europe/Moscow', at)).toEqual({ date: '2026-10-28', hour: 0, minute: 30 })     // в Москве уже среда 00:30
    expect(nowIn('Europe/Warsaw', at)).toEqual({ date: '2026-10-27', hour: 22, minute: 30 })    // в Варшаве ещё вторник
  })

  it('weekDates: неделя с понедельника по выбранному поясу', () => {
    setTz('Asia/Vladivostok'); expect(tz.value).toBe('Asia/Vladivostok')
    const w = weekDates(0)
    expect(w).toHaveLength(7)
    expect(new Date(w[0] + 'T12:00:00Z').getUTCDay()).toBe(1)        // понедельник
    expect(w).toContain(nowIn('Asia/Vladivostok').date)
    expect(weekDates(1)[0] > w[6]).toBe(true)
  })

  it('hh с минутами', () => { expect(hh(18)).toBe('18:00'); expect(hh(9, 5)).toBe('09:05') })
})

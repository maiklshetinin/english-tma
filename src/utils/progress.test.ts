import { describe, it, expect } from 'vitest'
import { monthOf, monthEnd, prevMonth, tagCount, lessonsIn, monthsOf, stateAt, topicTags, memText, type LessonDone } from './progress'

const L = (o: Partial<LessonDone>): LessonDone => ({ course: 'k', courseTitle: 'A1', id: 'a', title: 'Урок', unit: '', at: 0, ok: 0, all: 0, sec: 0, miss: [], steps: [], ...o })
const NOV = Date.parse('2026-11-10T10:00:00Z'), OCT = Date.parse('2026-10-05T10:00:00Z')
const cfg = { retention: 0.9, maxDays: 36500 }

describe('аналитика прогресса', () => {
  it('месяцы — по Москве', () => {
    expect(monthOf(Date.parse('2026-10-31T21:30:00Z'))).toBe('2026-11')
    expect(monthOf(monthEnd('2026-10'))).toBe('2026-10'); expect(monthOf(monthEnd('2026-10') + 1)).toBe('2026-11')
    expect(prevMonth('2027-01')).toBe('2026-12')
  })
  it('теги уроков: по экранам, у «Ответь на вопрос» — два; знакомство и подсказка не считаются', () => {
    const ls = [L({ at: NOV, steps: [{ id: '1', kind: 'choice' }, { id: '2', kind: 'answer' }, { id: '3', kind: 'tip' }, { id: '4', kind: 'gap', phrase: 'I [am]', o: 2 }] }),
      L({ id: 'b', at: OCT, steps: [{ id: '1', kind: 'pairs' }] })]
    expect(tagCount(lessonsIn(ls, '2026-11'))).toEqual({ R: 0, L: 2, W: 1, S: 1 })
    expect(lessonsIn(ls, '2026-11', 'R').length).toBe(0)
    expect(lessonsIn(ls, '2026-10', 'R').length).toBe(1)
    expect(monthsOf(ls, { '2026-09': {} }, NOV)).toEqual(['2026-09', '2026-10', '2026-11'])
  })
  it('память на конец прошлого месяца — по последнему снимку не позже него; текущий — по словарю', () => {
    const f = { s: 10, d: 5, last: OCT, n: 2, l: 0, st: 2 }
    const mon = { '2026-10': { 'skill:W': { f, t: OCT, ok: true } } }
    const oct = stateAt('skill:W', '2026-10', {}, mon, cfg, NOV)!, sep = stateAt('skill:W', '2026-09', {}, mon, cfg, NOV)
    expect(oct.stab).toBe(10); expect(oct.recall).toBeLessThan(90); expect(sep).toBeNull()
    const dec = stateAt('skill:W', '2026-12', {}, mon, cfg, Date.parse('2027-02-01T00:00:00Z'))!          // в ноябре–декабре ответов не было — октябрьская память, забытая к концу декабря
    expect(dec.stab).toBe(10); expect(dec.recall).toBeLessThan(oct.recall!)
    const live = { 'skill:W': { key: 'skill:W', kind: 'skill', text: 'Письмо', tr: '', s: 90, due: NOV, seen: NOV, ok: 1, bad: 0, hist: [{ t: NOV, ok: true, ex: '' }], f: { ...f, s: 20, last: NOV } } } as any
    expect(stateAt('skill:W', '2026-11', live, mon, cfg, NOV)!.recall).toBe(100)
  })
  it('теги темы — из уроков с этой темой (по полю или по названию)', () => {
    const ls = [L({ title: 'Present Simple', steps: [{ id: '1', kind: 'choice' }, { id: '2', kind: 'order' }] }), L({ title: 'x', topic: 'can', steps: [{ id: '1', kind: 'speak' }] }), L({ title: 'Can / can’t', topic: 'none', steps: [{ id: '1', kind: 'pairs' }] })]
    expect(topicTags(ls)).toEqual({ 'topic:present-simple': ['L', 'W'], 'topic:can': ['S'] })
  })
  it('сколько помнит — словами', () => { expect(memText(16.4)).toBe('помнит ~16 дн'); expect(memText(61)).toBe('помнит ~2 мес'); expect(memText(120)).toBe('помнит 3+ мес') })
})

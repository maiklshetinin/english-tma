import { describe, it, expect } from 'vitest'
import { hitsOf, applyHits, levelOf, stateOf, kindOf, replay, recallAt, intervalOf, type RItem } from './review'
import type { Step } from './lesson'

const DAY = 86_400_000
const ctx = { ex: 'x', lesson: 'Урок 1' }

describe('review', () => {
  it('слово или фраза', () => {
    expect(kindOf('merci')).toBe('word'); expect(kindOf('Hello!')).toBe('word'); expect(kindOf('…a ty?')).toBe('word'); expect(kindOf('a może…')).toBe('word'); expect(kindOf('to read')).toBe('word')
    expect(kindOf('See you later!')).toBe('phrase'); expect(kindOf('Czym się zajmujesz?')).toBe('phrase')
  })
  it('что проверяет экран', () => {
    expect(hitsOf({ id: '1', kind: 'intro', word: 'merci', tr: 'спасибо' } as Step)[0]).toMatchObject({ text: 'merci', ok: null })
    expect(hitsOf({ id: '2', kind: 'order', by: 'letters', phrase: 'bye' } as Step, { ok: false })[0]).toMatchObject({ text: 'bye', kind: 'word', ok: false })
    expect(hitsOf({ id: '3', kind: 'gap', phrase: 'And [you]?', tr: 'А ты?' } as Step, { ok: true })[0].text).toBe('And you?')
    const p = hitsOf({ id: '4', kind: 'pairs', pairs: [{ a: 'a', b: 'а' }, { a: 'b', b: 'б' }] } as Step, { ok: true, wrong: [1] })
    expect(p.map(h => h.ok)).toEqual([true, false])
  })
  it('знакомство без оценки — новое, памяти нет', () => {
    const items: Record<string, RItem> = {}
    applyHits(items, [{ text: 'merci', ok: null }], ctx, 1e12)
    expect(items.merci.f).toBeUndefined(); expect(stateOf(items.merci, 1e12)).toMatchObject({ isNew: true, level: 'weak', recall: null })
  })
  it('FSRS: верно растит стабильность через дни, в тот же день — нет; ошибка роняет', () => {
    const items: Record<string, RItem> = {}, t = 1e12
    applyHits(items, [{ text: 'merci', ok: true }], ctx, t)
    const s1 = items.merci.f!.s
    expect(s1).toBeGreaterThan(1); expect(s1).toBeLessThan(4); expect(stateOf(items.merci, t).level).toBe('weak')
    applyHits(items, [{ text: 'Merci', ok: true }], ctx, t + 60_000)
    expect(items.merci.f!.s).toBeCloseTo(s1, 2)                                   // повтор в тот же урок память не растит
    applyHits(items, [{ text: 'merci', ok: true }], ctx, t + 3 * DAY)
    const s2 = items.merci.f!.s; expect(s2).toBeGreaterThan(s1 * 2); expect(levelOf(s2)).toBe('medium')
    applyHits(items, [{ text: 'merci', ok: false }], ctx, t + 4 * DAY)
    expect(items.merci.f!.s).toBeLessThan(s2); expect(items.merci.f!.l).toBe(1)
    expect(items.merci.ok).toBe(3); expect(items.merci.bad).toBe(1); expect(items.merci.hist.length).toBe(4)
  })
  it('кривая забывания и интервал от желаемого запоминания', () => {
    expect(recallAt(10, 0)).toBe(1); expect(recallAt(10, 10)).toBeCloseTo(0.9, 2)
    expect(recallAt(10, 30)).toBeLessThan(recallAt(10, 10))
    expect(intervalOf(10, { retention: 0.9, maxDays: 36500 })).toBe(10)
    expect(intervalOf(10, { retention: 0.8, maxDays: 36500 })).toBeGreaterThan(10)
    expect(intervalOf(10, { retention: 0.95, maxDays: 36500 })).toBeLessThan(10)
    expect(intervalOf(1000, { retention: 0.9, maxDays: 30 })).toBe(30)
  })
  it('старые записи: память из истории', () => {
    const t = 1e12, old = { hist: [{ t: t + 3 * DAY, ok: true, ex: 'x' }, { t: t + 1000, ok: null, ex: 'x' }, { t, ok: true, ex: 'x' }] }
    const m = replay(old)!; expect(m.n).toBe(2); expect(levelOf(m.s)).toBe('medium')
    expect(stateOf(old as any, t + 3 * DAY).recall).toBe(100)
  })
})

import { describe, it, expect } from 'vitest'
import { hitsOf, applyHits, levelOf, strengthNow, kindOf, R, type RItem } from './review'
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
  it('новое — слабое, верно растёт, ошибка падает', () => {
    const items: Record<string, RItem> = {}, t = 1e12
    applyHits(items, [{ text: 'merci', ok: null }], ctx, t)
    expect(items.merci.s).toBe(R.NEW); expect(levelOf(items.merci.s)).toBe('weak')
    applyHits(items, [{ text: 'Merci', ok: true }], ctx, t + 1)
    applyHits(items, [{ text: 'merci', ok: true }], ctx, t + 2)
    expect(items.merci.s).toBe(50); expect(levelOf(50)).toBe('medium')
    applyHits(items, [{ text: 'merci', ok: false }], ctx, t + 3)
    expect(items.merci.s).toBe(30); expect(items.merci.due).toBe(t + 3 + DAY)
    expect(items.merci.hist.length).toBe(4)
  })
  it('забывание после срока', () => {
    const x = { s: 80, due: 0 }
    expect(strengthNow(x, 0)).toBe(80); expect(strengthNow(x, 3 * DAY)).toBe(65)
  })
})

import { describe, it, expect } from 'vitest'
import { practiceSteps, PRACTICE_MAX } from './practice'
import { hitsOf } from './review'

const w = (text: string, o: object = {}) => ({ key: text.toLowerCase(), kind: text.includes(' ') ? 'phrase' : 'word', text, tr: 'перевод ' + text, s: 0, due: 0, seen: 0, ok: 0, bad: 0, hist: [], ...o }) as any
describe('«Повторить эти слова»', () => {
  const pool = ['apply', 'always', 'hello', 'bye', 'go ahead', 'see you later'].map(t => w(t))
  it('перевод → английское слово; верный — загаданный, варианты из словаря, без повторов', () => {
    const [s] = practiceSteps([pool[0]], pool, () => 0.3)
    expect(s.kind).toBe('choice'); expect(s.ask).toBe('tr'); expect(s.opts!.length).toBe(4)
    expect(s.opts![s.ans!].w).toBe('apply'); expect(s.opts![s.ans!].t).toBe('перевод apply')
    expect(new Set(s.opts!.map(o => o.w)).size).toBe(4)
  })
  it('ответ меняет память только загаданного слова', () => {
    const [s] = practiceSteps([pool[0]], pool)
    expect(hitsOf(s, { ok: true }).map(h => h.text)).toEqual(['apply'])
  })
  it('без перевода — на слух; без перевода и звука — пропуск; не больше PRACTICE_MAX; одно слово в словаре — не из чего спросить', () => {
    expect(practiceSteps([w('x', { tr: '', audio: 'a.mp3' })], pool)[0].ask).toBe('audio')
    expect(practiceSteps([w('y', { tr: '' })], pool)).toEqual([])
    expect(practiceSteps(Array.from({ length: 15 }, (_, i) => w('w' + i)), pool).length).toBe(PRACTICE_MAX)
    expect(practiceSteps([pool[0]], [pool[0]])).toEqual([])
  })
})

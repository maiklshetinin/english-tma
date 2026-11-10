import { describe, it, expect } from 'vitest'
import { skillsOf, detectTopic, tagHits, wordsOnly, topicById } from './skills'
import { applyHits } from './review'
import type { Step } from './lesson'

describe('навыки и темы', () => {
  it('навыки по типу экрана', () => {
    expect(skillsOf({ id: 'a', kind: 'choice', ask: 'audio' } as Step)).toEqual(['listening'])
    expect(skillsOf({ id: 'a', kind: 'choice', ask: 'tr' } as Step)).toEqual(['vocab'])
    expect(skillsOf({ id: 'a', kind: 'order', by: 'letters' } as Step)).toEqual(['writing'])
    expect(skillsOf({ id: 'a', kind: 'order' } as Step)).toEqual(['grammar'])
    expect(skillsOf({ id: 'a', kind: 'intro' } as Step)).toEqual([])
  })
  it('тема по названию — самое длинное совпадение, без ложных', () => {
    expect(detectTopic('Урок 3: Present Perfect')?.id).toBe('present-perfect')
    expect(detectTopic('Present Perfect Continuous')?.id).toBe('pp-continuous')
    expect(detectTopic('Can I help you?')).toBeUndefined()
    expect(detectTopic('Знакомство', 'Chapter 2 Past Simple')?.id).toBe('past-simple')
  })
  it('ответ → память навыка и темы в том же словаре, слова отдельно', () => {
    const items: Record<string, any> = {}, t = 1e12
    const step = { id: 's', kind: 'gap', phrase: 'I have [been] there' } as Step
    applyHits(items, tagHits(step, { ok: true }, topicById('present-perfect')), { ex: 'x' }, t)
    expect(items['skill:grammar'].kind).toBe('skill'); expect(items['skill:grammar'].f.n).toBe(1)
    expect(items['topic:present-perfect'].text).toBe('Present Perfect')
    applyHits(items, [{ text: 'hello', ok: true }], { ex: 'x' }, t)
    expect(Object.keys(wordsOnly(items))).toEqual(['hello'])
  })
})

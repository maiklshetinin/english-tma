import { describe, it, expect } from 'vitest'
import { skillsOf, detectTopic, tagHits, wordsOnly, topicById } from './skills'
import { applyHits } from './review'
import type { Step } from './lesson'

describe('навыки и темы', () => {
  it('навыки = теги экрана (как в меню упражнений)', () => {
    expect(skillsOf({ id: 'a', kind: 'choice' } as Step)).toEqual(['L'])
    expect(skillsOf({ id: 'a', kind: 'order' } as Step)).toEqual(['W'])
    expect(skillsOf({ id: 'a', kind: 'pairs' } as Step)).toEqual(['R'])
    expect(skillsOf({ id: 'a', kind: 'speak' } as Step)).toEqual(['S'])
    expect(skillsOf({ id: 'a', kind: 'answer' } as Step)).toEqual(['S', 'W'])
    expect(skillsOf({ id: 'a', kind: 'intro' } as Step)).toEqual([])
    expect(skillsOf({ id: 'a', kind: 'tip' } as Step)).toEqual([])
  })
  it('«Повтори за диктором»: совпала фраза — оценка речи и темы; без распознавания — только «встречалось»', () => {
    const sp = { id: 's', kind: 'speak', phrase: 'Go ahead' } as Step
    expect(tagHits(sp, { ok: true }, topicById('can')).map(h => `${h.key}:${h.ok}`)).toEqual(['skill:S:true', 'topic:can:true'])
    expect(tagHits(sp, { ok: null }, topicById('can')).map(h => `${h.key}:${h.ok}`)).toEqual(['skill:S:null'])
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
    expect(items['skill:W'].kind).toBe('skill'); expect(items['skill:W'].f.n).toBe(1); expect(items['skill:W'].text).toBe('Письмо')
    expect(items['topic:present-perfect'].text).toBe('Present Perfect')
    applyHits(items, [{ text: 'hello', ok: true }], { ex: 'x' }, t)
    expect(Object.keys(wordsOnly(items))).toEqual(['hello'])
  })
})

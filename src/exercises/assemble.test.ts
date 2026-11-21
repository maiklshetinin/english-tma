import { describe, it, expect } from 'vitest'
import { assemble } from './assemble'
import { SYSTEM, CHAT } from './kp/defaults'

describe('«Как собирается»: что уйдёт в чат и в модели', () => {
  it('мост: одно сообщение — prompt + message + format, вопрос и эталон подставлены', () => {
    const { parts, warn } = assemble({ kind: 'kp', text: 'Kiedy?', ideal: '==6 grudnia==' })
    expect(parts).toHaveLength(1)
    expect(parts[0].text.startsWith(SYSTEM)).toBe(true)
    expect(parts[0].text).toContain('Вопрос: Kiedy?'); expect(parts[0].text).toContain('Эталон: 6 grudnia'); expect(parts[0].text).toContain('k1a2b3')
    expect(warn).toEqual([])
    expect(CHAT.format).toContain('{id}')
  })
  it('Gemini API голосом: роль, сообщение, проверка голосом, разбор; стёртый {answer} — предупреждение', () => {
    const { parts, warn } = assemble({ kind: 'kp', engine: 'api', model: 'live', text: 'Q', ideal: 'A', message: 'Pytanie: {question}' })
    expect(parts.map((p) => p.to.split(' ·')[0])).toEqual(expect.arrayContaining(['Gemini API', 'Проверка голосом', '«Обсудить ответ голосом»']))
    expect(warn.join(' ')).toMatch(/\{answer\}/)
  })
  it('целым аудио и рация: свои части', () => {
    expect(assemble({ kind: 'kp', dic: 'file', text: 'Q', ideal: 'A' }).parts.some((p) => p.to.startsWith('Расшифровка записи'))).toBe(true)
    const t = assemble({ kind: 'talk', ptt: true, lock: '', guard: '' })
    expect(t.parts.find((p) => p.to.startsWith('Рация'))!.text).toMatch(/не просим/)
  })
})

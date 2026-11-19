import { describe, it, expect } from 'vitest'
import { checkAnswer, PASS } from './ai'
import { stepsFromJson, stepIssue, fishStep } from './lesson'

// поддельный сервер: запоминает запрос, отвечает заданным
const fake = (status: number, body: unknown) => {
  const calls: any[] = []
  const f = (async (path: string, init: any) => { calls.push({ path, body: JSON.parse(init.body) }); return { ok: status < 300, status, json: async () => body } }) as any
  return { f, calls }
}
const q = { question: 'Kiedy i jak obchodzimy Mikołajki?', reference: 'Mikołajki obchodzimy 6 grudnia…', answer: 'Szóstego grudnia, dzieci dostają prezenty' }

describe('Проверка ответа через мост', () => {
  it('запрос на /ai/check, оценка и зачёт от 60 %', async () => {
    const { f, calls } = fake(200, { score: 64.4, missed: ['подарки в ботинках'], feedback: 'Dobrze!' })
    const r = await checkAnswer(q, f)
    expect(calls[0]).toEqual({ path: '/ai/check', body: { question: q.question, reference: q.reference, answer: q.answer } })
    expect(r).toEqual({ score: 64, missed: ['подарки в ботинках'], feedback: 'Dobrze!', ok: true })
    expect(PASS).toBe(60)
  })
  it('свой промпт уходит на сервер, свой порог — считается здесь', async () => {
    const { f, calls } = fake(200, { score: 64, missed: [], feedback: '' })
    const r = await checkAnswer({ ...q, prompt: '  Sprawdzasz…  ', pass: 70 }, f)
    expect(calls[0].body.prompt).toBe('Sprawdzasz…'); expect(r.ok).toBe(false)
  })
  it('мост не в сети — ошибка с текстом сервера', async () => {
    const { f } = fake(503, { error: 'Мост с чатом не в сети — откройте вкладку с чатом и скриптом' })
    await expect(checkAnswer(q, f)).rejects.toThrow(/не в сети/)
  })
})

describe('«Ответ по смыслу» в уроке', () => {
  it('рыба готова, без эталона — не готов', () => {
    expect(stepIssue(fishStep('kp'))).toBe('')
    expect(stepIssue({ id: 'a', kind: 'kp', text: 'Pytanie?' })).toBe('Нет эталона')
    expect(stepIssue({ id: 'a', kind: 'kp', ideal: 'x' })).toBe('Нет вопроса')
  })
  it('JSON вопросов ({ questions: [{ question, reference }] }) → экраны', () => {
    const r = stepsFromJson(JSON.stringify({ lesson_id: 'm2l6', pass_threshold: 70, api_config: { system_prompt: 'Sprawdzasz…' }, questions: [
      { id: 1, question: 'Kiedy i jak obchodzimy Mikołajki?', reference: 'Mikołajki obchodzimy…' }, { id: 2, question: 'Co to jest Wielki Post?', reference: 'Wielki Post to…' }, { id: 3, reference: 'без вопроса' }] }))!
    expect(r.steps.map(s => [s.kind, s.text, s.ideal])).toEqual([['kp', 'Kiedy i jak obchodzimy Mikołajki?', 'Mikołajki obchodzimy…'], ['kp', 'Co to jest Wielki Post?', 'Wielki Post to…']])
    expect(r.steps.every(s => s.prompt === 'Sprawdzasz…' && s.pass === 70)).toBe(true)          // промпт и порог урока — каждому экрану
    expect(r.steps.every(s => !stepIssue(s))).toBe(true)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { ai, addKey, removeKey, moveKey, checkAnswer, testKey, retryMs, errText, mask, PASS } from './gemini'
import { stepsFromJson, stepIssue, fishStep } from './lesson'

// поддельный Google: по ключу — свой ответ
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
const good = (o: object) => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] })
const QUOTA = { error: { code: 429, message: 'You exceeded your current quota. Please retry in 10h39m29.66s.', status: 'RESOURCE_EXHAUSTED' } }
const q = { question: 'Kiedy i jak obchodzimy Mikołajki?', reference: 'Mikołajki obchodzimy 6 grudnia…', answer: 'Szóstego grudnia, dzieci dostają prezenty' }

describe('Gemini: ключи и проверка ответа', () => {
  beforeEach(() => { ai.keys = []; ai.model = 'gemini-2.5-flash' })

  it('ключи: добавить без повторов, маска, порядок, удалить', () => {
    expect(addKey('  AIzaSyAAAA1111bbbb ')).toBe(true); expect(addKey('AIzaSyAAAA1111bbbb')).toBe(false); addKey('AIzaSyBBBB2222cccc')
    expect(mask('AIzaSyAAAA1111bbbb')).toBe('AIzaSyAA…bbbb')
    moveKey('AIzaSyBBBB2222cccc', -1); expect(ai.keys.map((k: any) => k.key)).toEqual(['AIzaSyBBBB2222cccc', 'AIzaSyAAAA1111bbbb'])
    removeKey('AIzaSyBBBB2222cccc'); expect(ai.keys.length).toBe(1)
  })
  it('сколько ждать квоту и ошибки по-русски', () => {
    expect(retryMs('Please retry in 10h39m29.66s.')).toBe(Math.round((10 * 3600 + 39 * 60 + 29.66) * 1000))
    expect(retryMs('"retryDelay": "38s"')).toBe(38000)
    expect(errText(429, 'quota')).toBe('Квота закончилась')
    expect(errText(400, 'API key not valid. Please pass a valid API key.')).toMatch(/Ключ не принят/)
    expect(errText(404, 'models/xxx is not found')).toMatch(/модели/)
  })
  it('нет ключей — ошибка nokey', async () => {
    await expect(checkAnswer(q, async () => good({}) as any)).rejects.toMatchObject({ nokey: true })
  })
  it('ответ Gemini → процент, «Не прозвучало», отзыв; от 60 % — верно', async () => {
    addKey('k1'); let sent: any
    const r = await checkAnswer(q, (async (_u: string, o: any) => { sent = { url: _u, ...o, body: JSON.parse(o.body) }; return good({ score: 64.4, missed_points: ['подарки в ботинках'], feedback: 'Хорошо!' }) }) as any)
    expect(r).toEqual({ score: 64, missed: ['подарки в ботинках'], feedback: 'Хорошо!', ok: true })
    expect(sent.url).toContain('gemini-2.5-flash:generateContent'); expect(sent.headers['x-goog-api-key']).toBe('k1')
    expect(sent.body.generationConfig.responseMimeType).toBe('application/json'); expect(sent.body.contents[0].parts[0].text).toContain(q.answer)
    expect(ai.keys[0]).toMatchObject({ ok: true, err: '', n: 1 })
    expect((await checkAnswer(q, (async () => good({ score: PASS - 1, missed_points: [], feedback: '' })) as any)).ok).toBe(false)
  })
  it('свой промпт и порог экрана', async () => {
    addKey('k1'); let body: any
    const r = await checkAnswer({ ...q, prompt: 'Mój prompt', pass: 80 }, (async (_u: string, o: any) => { body = JSON.parse(o.body); return good({ score: 75, missed_points: [], feedback: '' }) }) as any)
    expect(body.systemInstruction.parts[0].text).toBe('Mój prompt'); expect(r.ok).toBe(false)
    await checkAnswer(q, (async (_u: string, o: any) => { body = JSON.parse(o.body); return good({ score: 75, missed_points: [], feedback: '' }) }) as any)
    expect(body.systemInstruction.parts[0].text).toMatch(/Карту поляка/)
  })
  it('квота кончилась — берётся следующий ключ, исчерпанный пропускается до сброса', async () => {
    addKey('k1'); addKey('k2'); const used: string[] = []
    const f = (async (_u: string, o: any) => { used.push(o.headers['x-goog-api-key']); return o.headers['x-goog-api-key'] === 'k1' ? reply(429, QUOTA) : good({ score: 90, missed_points: [], feedback: 'Отлично' }) }) as any
    expect((await checkAnswer(q, f)).score).toBe(90)
    expect(used).toEqual(['k1', 'k2'])
    expect(ai.keys[0].ok).toBe(false); expect(ai.keys[0].err).toBe('Квота закончилась'); expect(ai.keys[0].until).toBeGreaterThan(Date.now() + 10 * 3600e3)
    used.length = 0; await checkAnswer(q, f); expect(used).toEqual(['k2'])          // k1 до сброса не пробуем
  })
  it('у всех кончилась квота / сломанный ответ', async () => {
    addKey('k1')
    await expect(checkAnswer(q, (async () => reply(429, QUOTA)) as any)).rejects.toThrow('Квота закончилась')
    await expect(checkAnswer(q, (async () => good({})) as any)).rejects.toThrow('У всех ключей закончилась квота')
    ai.keys = []; addKey('k2')
    await expect(checkAnswer(q, (async () => reply(200, { candidates: [{ content: { parts: [{ text: 'не json' }] } }] })) as any)).rejects.toBeTruthy()
    expect(ai.keys[0].err).toBe('Gemini ответил не JSON')
  })
  it('«Проверить» у ключа', async () => {
    addKey('bad'); await testKey('bad', (async () => reply(400, { error: { message: 'API key not valid' } })) as any)
    expect(ai.keys[0]).toMatchObject({ ok: false }); expect(ai.keys[0].err).toMatch(/Ключ не принят/)
    await testKey('bad', (async () => good({})) as any); expect(ai.keys[0]).toMatchObject({ ok: true, err: '' })
  })
})

describe('«Ответ по смыслу» в уроке', () => {
  it('рыба готова, без эталона — не готов', () => {
    expect(stepIssue(fishStep('kp'))).toBe('')
    expect(stepIssue({ id: 'a', kind: 'kp', text: 'Pytanie?' })).toBe('Нет эталона')
    expect(stepIssue({ id: 'a', kind: 'kp', ideal: 'x' })).toBe('Нет вопроса')
  })
  it('JSON вопросов от Gemini ({ questions: [{ question, reference }] }) → экраны', () => {
    const r = stepsFromJson(JSON.stringify({ lesson_id: 'm2l6', pass_threshold: 70, api_config: { system_prompt: 'Sprawdzasz…' }, questions: [
      { id: 1, question: 'Kiedy i jak obchodzimy Mikołajki?', reference: 'Mikołajki obchodzimy…' }, { id: 2, question: 'Co to jest Wielki Post?', reference: 'Wielki Post to…' }, { id: 3, reference: 'без вопроса' }] }))!
    expect(r.steps.map(s => [s.kind, s.text, s.ideal])).toEqual([['kp', 'Kiedy i jak obchodzimy Mikołajki?', 'Mikołajki obchodzimy…'], ['kp', 'Co to jest Wielki Post?', 'Wielki Post to…']])
    expect(r.steps.every(s => s.prompt === 'Sprawdzasz…' && s.pass === 70)).toBe(true)          // промпт и порог урока — каждому экрану
    expect(r.steps.every(s => !stepIssue(s))).toBe(true)
  })
})

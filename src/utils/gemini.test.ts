import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ai, addKey, removeKey, moveKey, checkAnswer, testKey, retryMs, errText, mask, PASS, WAIT } from './gemini'
import { stepsFromJson, stepIssue, fishStep } from './lesson'

// поддельный Google: по ключу — свой ответ
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
const good = (o: object) => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] })
const QUOTA = { error: { code: 429, message: 'You exceeded your current quota. Please retry in 10h39m29.66s.', status: 'RESOURCE_EXHAUSTED' } }
const q = { question: 'Kiedy i jak obchodzimy Mikołajki?', reference: 'Mikołajki obchodzimy 6 grudnia…', answer: 'Szóstego grudnia, dzieci dostają prezenty' }

describe('Gemini: ключи и проверка ответа', () => {
  beforeEach(() => { ai.keys = []; ai.model = 'gemini-flash-latest' })

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
    expect(errText(404, 'models/xxx is not found')).toContain('недоступна этому ключу: models/xxx is not found')
  })
  it('нет ключей — ошибка nokey', async () => {
    await expect(checkAnswer(q, async () => good({}) as any)).rejects.toMatchObject({ nokey: true })
  })
  it('ответ Gemini → процент, «Не прозвучало», отзыв; от 60 % — верно', async () => {
    addKey('k1'); let sent: any
    const r = await checkAnswer(q, (async (_u: string, o: any) => { sent = { url: _u, ...o, body: JSON.parse(o.body) }; return good({ score: 64.4, missed_points: ['подарки в ботинках'], feedback: 'Хорошо!' }) }) as any)
    expect(r).toEqual({ score: 64, missed: ['подарки в ботинках'], feedback: 'Хорошо!', ok: true })
    expect(sent.url).toContain('gemini-flash-latest:generateContent'); expect(sent.body.generationConfig.temperature).toBeUndefined(); expect(sent.headers['x-goog-api-key']).toBe('k1')
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

describe('Gemini: модель подбирается сама', () => {
  beforeEach(() => { ai.keys = []; ai.model = 'gemini-flash-latest' })
  it('из списка моделей ключа — свежая текстовая Flash', async () => {
    const { bestModel } = await import('./gemini')
    expect(bestModel(['gemini-2.5-flash-preview-tts', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash-preview', 'gemini-3.1-flash-image'])).toBe('gemini-3.6-flash')
    // список моделей ключа автора (19.11.2026): стабильная с самым новым номером
    const author = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-tts', 'gemini-omni-1.2-flash', 'gemini-3.1-flash-image']
    expect(bestModel(author)).toBe('gemini-3.8-flash')
    expect(bestModel(author, ['gemini-3.8-flash'])).toBe('gemini-3.7-flash')
    expect(bestModel(['gemini-2.5-flash-preview-tts'])).toBe('')
  })
  it('404 «нет такой модели» → список моделей ключа → другая модель, повтор', async () => {
    addKey('k1'); const urls: string[] = []
    const f = (async (u: string) => {
      urls.push(u)
      if (u.endsWith('?pageSize=1000')) return reply(200, { models: [{ name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] }] })
      if (u.includes('gemini-flash-latest')) return reply(404, { error: { code: 404, message: 'models/gemini-flash-latest is not found' } })
      return good({ score: 80, missed_points: [], feedback: 'ok' })
    }) as any
    expect((await checkAnswer(q, f)).score).toBe(80)
    expect(ai.model).toBe('gemini-3.6-flash'); expect(urls.at(-1)).toContain('gemini-3.6-flash:generateContent')
  })
  it('модель молчит дольше WAIT → обрыв по таймеру и следующая модель', async () => {
    addKey('AIza-test-key-0001'); ai.model = 'gemini-3.8-flash'
    vi.useFakeTimers()
    try {
      const fetcher = (async (u: string, o: any) => {
        if (u.endsWith('?pageSize=1000')) return reply(200, { models: ['gemini-3.8-flash', 'gemini-3.7-flash'].map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) })
        if (u.includes('3.7')) return good({ score: 80, missed_points: [], feedback: '' })
        return new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted'))))
      }) as any
      const p = checkAnswer(q, fetcher)
      await vi.advanceTimersByTimeAsync(WAIT + 10)
      expect((await p).score).toBe(80)
      expect(ai.model).toBe('gemini-3.7-flash')
    } finally { vi.useRealTimers() }
  })

  it('503 «перегружена» → следующая модель из списка ключа; ключ не помечается сломанным', async () => {
    ai.model = 'gemini-3.8-flash'; addKey('k1'); const used: string[] = []
    const f = (async (u: string) => {
      if (u.endsWith('?pageSize=1000')) return reply(200, { models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) })
      const m = u.match(/models\/([^:]+):/)![1]; used.push(m)
      return m === 'gemini-3.6-flash' ? good({ score: 70, missed_points: [], feedback: '' }) : reply(503, { error: { code: 503, message: 'The model is overloaded.' } })
    }) as any
    expect((await checkAnswer(q, f)).score).toBe(70)
    expect(used).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']); expect(ai.model).toBe('gemini-3.6-flash')
    ai.keys = []; addKey('k2'); ai.model = 'gemini-3.8-flash'
    await expect(checkAnswer(q, (async (u: string) => u.endsWith('?pageSize=1000') ? reply(200, { models: [] }) : reply(503, { error: { message: 'overloaded' } })) as any)).rejects.toThrow(/перегружена/)
    expect(ai.keys[0].ok).toBe(null)                                                        // ключ рабочий — не «ошибка»
  })

  it('все свежие Flash перегружены → через раз пробуется Lite (у неё своя очередь)', async () => {
    ai.model = 'gemini-3.7-flash'; addKey('k1'); const used: string[] = []
    const names = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.6-flash-lite', 'gemini-3.1-flash-lite']
    const f = (async (u: string) => {
      if (u.endsWith('?pageSize=1000')) return reply(200, { models: names.map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) })
      const m = u.match(/models\/([^:]+):/)![1]; used.push(m)
      return m === 'gemini-3.1-flash-lite' ? good({ score: 65, missed_points: [], feedback: '' }) : reply(503, { error: { code: 503, message: 'overloaded' } })
    }) as any
    expect((await checkAnswer(q, f)).score).toBe(65)
    expect(used).toEqual(['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'])
  })
})


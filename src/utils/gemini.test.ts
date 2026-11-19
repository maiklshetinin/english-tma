import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ai, addKey, removeKey, moveKey, testKey, retryMs, errText, mask, bestModel, WAIT } from './gemini'

// поддельный Google
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
const good = (text = 'ok') => reply(200, { candidates: [{ content: { parts: [{ text }] } }] })
const list = (names: string[]) => reply(200, { models: names.map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) })
const model = (u: string) => u.match(/models\/([^:]+):/)![1]

describe('Ключи Gemini (профиль)', () => {
  beforeEach(() => { ai.keys = []; ai.model = 'gemini-3.8-flash' })

  it('добавить без повторов, маска, порядок, удалить', () => {
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
  it('«Проверить»: плохой ключ — ошибка, хороший — работает; запрос без temperature', async () => {
    addKey('bad'); await testKey('bad', (async () => reply(400, { error: { message: 'API key not valid' } })) as any)
    expect(ai.keys[0]).toMatchObject({ ok: false }); expect(ai.keys[0].err).toMatch(/Ключ не принят/)
    let sent: any
    await testKey('bad', (async (u: string, o: any) => { sent = { u, ...o, body: JSON.parse(o.body) }; return good() }) as any)
    expect(ai.keys[0]).toMatchObject({ ok: true, err: '' })
    expect(sent.u).toContain('gemini-3.8-flash:generateContent'); expect(sent.headers['x-goog-api-key']).toBe('bad'); expect(sent.body.generationConfig.temperature).toBeUndefined()
  })
  it('квота — ключ ждёт до времени, которое назвал Google', async () => {
    addKey('k1')
    await testKey('k1', (async () => reply(429, { error: { code: 429, message: 'You exceeded your current quota. Please retry in 10h39m29.66s.' } })) as any)
    expect(ai.keys[0].err).toBe('Квота закончилась'); expect(ai.keys[0].until).toBeGreaterThan(Date.now() + 10 * 3600e3)
  })
})

describe('Ключи Gemini: модель подбирается сама', () => {
  beforeEach(() => { ai.keys = []; ai.model = 'gemini-3.8-flash' })

  it('из списка моделей ключа — свежая текстовая Flash', () => {
    expect(bestModel(['gemini-2.5-flash-preview-tts', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash-preview', 'gemini-3.1-flash-image'])).toBe('gemini-3.6-flash')
    const author = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-tts', 'gemini-omni-1.2-flash', 'gemini-3.1-flash-image']
    expect(bestModel(author)).toBe('gemini-3.8-flash'); expect(bestModel(author, ['gemini-3.8-flash'])).toBe('gemini-3.7-flash')
  })
  it('503 — следующая модель, через раз Lite; ключ не считается сломанным', async () => {
    addKey('k1'); const used: string[] = []
    const names = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.6-flash-lite', 'gemini-3.1-flash-lite']
    await testKey('k1', (async (u: string) => { if (u.endsWith('?pageSize=1000')) return list(names); const m = model(u); used.push(m); return m === 'gemini-3.1-flash-lite' ? good() : reply(503, { error: { code: 503, message: 'overloaded' } }) }) as any)
    expect(used).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'])
    expect(ai.model).toBe('gemini-3.1-flash-lite'); expect(ai.keys[0].ok).toBe(true)
    ai.keys = []; addKey('k2'); ai.model = 'gemini-3.8-flash'
    await testKey('k2', (async (u: string) => (u.endsWith('?pageSize=1000') ? list([]) : reply(503, { error: { message: 'overloaded' } }))) as any)
    expect(ai.keys[0].ok).toBe(null)                                                         // перегрузка Google — не вина ключа
  })
  it('модель молчит дольше WAIT — обрыв и следующая', async () => {
    addKey('k1'); vi.useFakeTimers()
    try {
      const p = testKey('k1', (async (u: string, o: any) => {
        if (u.endsWith('?pageSize=1000')) return list(['gemini-3.8-flash', 'gemini-3.7-flash'])
        if (u.includes('3.7')) return good()
        return new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted'))))
      }) as any)
      await vi.advanceTimersByTimeAsync(WAIT + 10); await p
      expect(ai.model).toBe('gemini-3.7-flash'); expect(ai.keys[0].ok).toBe(true)
    } finally { vi.useRealTimers() }
  })
})

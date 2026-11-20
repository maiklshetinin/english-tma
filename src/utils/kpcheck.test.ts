// @ts-nocheck — тест с поддельным fetch
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('../firebase', () => ({ apiRequest: async () => ({ ok: true, json: async () => ({ score: 50, missed: ['x'], feedback: 'мост', site: 'ChatGPT' }) }) }))
import { checkDirect, checkSmart, setPick } from './kpcheck'
import { ai } from './gemini'

const resp = (status, body) => ({ ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
const gen = (o) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] })
const q = { question: 'Kiedy?', reference: '==6 grudnia==', answer: 'szóstego grudnia', pass: 60 }

describe('«Ответ по смыслу · Gemini API»', () => {
  beforeEach(() => { localStorage.clear(); ai.keys = [{ key: 'AAAAAAAAAAAAAAAA1111', ok: null, until: 0, n: 0 }, { key: 'BBBBBBBBBBBBBBBB2222', ok: null, until: 0, n: 0 }] })
  it('JSON по схеме → оценка; эталон без разметки; квота на первом ключе — второй', async () => {
    setPick('gemini-3.5-flash-lite')
    const calls = []
    const fetcher = async (url, o) => { calls.push({ url, o }); return calls.length === 1 ? resp(429, { error: { message: 'Quota exceeded. Please retry in 30s.' } }) : resp(200, gen({ score: 82, missed_points: ['кто такой Mikołaj'], feedback: 'Хорошо' })) }
    const r = await checkDirect(q, { fetcher })
    expect(r).toMatchObject({ score: 82, ok: true, missed: ['кто такой Mikołaj'], api: true, model: 'gemini-3.5-flash-lite' })
    expect(calls[0].url).toContain('gemini-3.5-flash-lite:generateContent')
    const b = JSON.parse(calls[1].o.body)
    expect(b.generationConfig.responseMimeType).toBe('application/json')
    expect(b.contents[0].parts[0].text).toContain('6 grudnia'); expect(b.contents[0].parts[0].text).not.toContain('==')
    expect(calls[1].o.headers['x-goog-api-key']).toBe('BBBBBBBBBBBBBBBB2222')
  })
  it('нет ключей — проверка уходит в мост с пометкой', async () => {
    ai.keys = []
    const r = await checkSmart(q)
    expect(r.site).toBe('ChatGPT'); expect(r.note).toMatch(/нет ключей.*мост/)
  })
})

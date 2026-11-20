// @ts-nocheck — тест с поддельным fetch
import { describe, it, expect, beforeEach } from 'vitest'
import { assessSpeech, wavOf } from './speech'
import { ai } from './gemini'

const gen = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }) })
describe('«Тест речи»', () => {
  beforeEach(() => { localStorage.clear(); ai.keys = [{ key: 'AAAAAAAAAAAAAAAA1111', ok: null, until: 0, n: 0 }] })
  it('мало речи — честно говорит, без запроса', async () => {
    const { blob, sec } = wavOf([new Int16Array(16000 * 5)])
    let called = false
    await expect(assessSpeech({ blob, sec, transcript: 'Dzień dobry', fetcher: async () => { called = true } })).rejects.toThrow(/Мало речи/)
    expect(called).toBe(false)
  })
  it('звук и расшифровка — в запросе; выдуманные цитаты отбрасываются', async () => {
    const { blob, sec } = wavOf([new Int16Array(16000 * 25)])
    let body
    const r = await assessSpeech({ blob, sec, transcript: 'Mój babcia była Polką, mieszkam w Warszawie.', model: 'gemini-3.5-flash-lite', fetcher: async (_u, o) => { body = JSON.parse(o.body); return gen({ level: 'A2', level_plus: true, confidence: 70, intelligibility: 81, scores: { vocabulary: 60, grammar: 55, coherence: 70, fluency: 65, pronunciation: 72 },
      mistakes: [{ quote: 'Mój babcia', fix: 'Moja babcia', why: 'babcia — женский род' }, { quote: 'byłem w Krakowie', fix: '…', why: 'выдумано' }], strengths: ['a'], tips: ['b'], summary: 'ok' }) } })
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('audio/wav')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(r).toMatchObject({ level: 'A2', plus: true, intelligibility: 81, dropped: 1 })
    expect(r.mistakes.map((m) => m.fix)).toEqual(['Moja babcia'])
  })
})

// @ts-nocheck — тест с поддельным fetch
import { describe, it, expect, beforeEach } from 'vitest'
import { speak, pcmToWav, wavFromResponse, TTS_MODEL, quotaUntil, untilReset } from './tts'
import { ai } from './gemini'

const pcmB64 = () => { const a = new Int16Array([0, 1000, -1000, 0]); return Buffer.from(a.buffer).toString('base64') }
const okBody = () => JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64() } }] } }] })
const resp = (status, body) => ({ ok: status < 300, status, text: async () => body })

describe('tts', () => {
  beforeEach(() => { ai.keys = [] })
  it('WAV: заголовок и длина', async () => {
    const b = pcmToWav(new Int16Array(10), 24000)
    expect(b.size).toBe(44 + 20)
    const { sec } = wavFromResponse(JSON.parse(okBody()))
    expect(sec).toBeCloseTo(4 / 24000)
  })
  it('без ключей — понятная ошибка', async () => {
    await expect(speak('Cześć')).rejects.toThrow(/Нет ключей/)
  })
  it('квота на первом ключе — берёт второй, модель и голос в запросе', async () => {
    ai.keys = [{ key: 'AAAAAAAAAAAAAAAA1111', ok: null, until: 0, n: 0 }, { key: 'BBBBBBBBBBBBBBBB2222', ok: null, until: 0, n: 0 }]
    const calls = []
    const fetcher = async (url, o) => { calls.push({ url, o }); return calls.length === 1 ? resp(429, '{"error":{"message":"Quota exceeded. Please retry in 1h2m3s."}}') : resp(200, okBody()) }
    const r = await speak('Kiedy obchodzimy Mikołajki?', 'Puck', { fetcher })
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toContain(TTS_MODEL)
    expect(JSON.parse(calls[1].o.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck')
    expect(calls[1].o.headers['x-goog-api-key']).toBe('BBBBBBBBBBBBBBBB2222')
    expect(r.blob.type).toBe('audio/wav')
    expect(quotaUntil('AAAAAAAAAAAAAAAA1111', TTS_MODEL)).toBeGreaterThan(Date.now())
    expect(ai.keys[0].ok).not.toBe(false)
    expect(ai.keys[1].ok).toBe(true)
  })
  it('до сброса лимита (9:00 по Варшаве) — не больше суток', () => { const ms = untilReset(); expect(ms).toBeGreaterThan(0); expect(ms).toBeLessThanOrEqual(864e5 + 60e3) })
  it('другая ошибка — сразу наверх, второй ключ не трогаем', async () => {
    ai.keys = [{ key: 'AAAAAAAAAAAAAAAA1111', ok: null, until: 0, n: 0 }, { key: 'BBBBBBBBBBBBBBBB2222', ok: null, until: 0, n: 0 }]
    let n = 0
    await expect(speak('x', 'Kore', { fetcher: async () => { n++; return resp(400, '{"error":{"message":"API key not valid"}}') } })).rejects.toThrow(/Ключ не принят/)
    expect(n).toBe(1)
  })
})

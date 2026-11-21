// @ts-nocheck — поддельный fetch
import { describe, it, expect, vi } from 'vitest'
vi.mock('../firebase', () => ({ apiRequest: async () => ({ ok: false, json: async () => ({}) }) }))
import { bars, transcribeFile } from './sttfile'
import { ai } from './gemini'
import { stepJson, applyStepJson, tplOf, TEMPLATES } from './lesson'

// «Ответ по смыслу · целым аудио» (21.11.2026): запись целиком → один запрос в Gemini → текст
describe('диктовка целым аудио', () => {
  it('волна голосового: 36 столбиков, нормированы, тихое — не ниже 0.08', () => {
    const b = bars([0, 0.1, 0.5, 1, 0.2, 0.05, 0.3, 0.9])
    expect(b.length).toBe(36); expect(Math.max(...b)).toBe(1); expect(Math.min(...b)).toBeGreaterThanOrEqual(0.08)
    expect(bars([]).every((v) => v === 0.08)).toBe(true)
  })
  it('вся запись уходит одним запросом (аудио WAV + стенографист), ответ — текст без кавычек', async () => {
    localStorage.clear(); ai.keys = [{ key: 'AAAAAAAAAAAAAAAA1111', ok: null, until: 0, n: 0 }]
    const calls = []
    const fetcher = async (u, o) => {
      if (!o) return { ok: true, status: 200, text: async () => JSON.stringify({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] }) }
      calls.push({ u, b: JSON.parse(o.body) })
      return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '«Adwent to czas oczekiwania.»' }] } }] }) }
    }
    const blob = { arrayBuffer: async () => new Uint8Array([82, 73, 70, 70, 1, 2, 3]).buffer }          // в jsdom у Blob нет arrayBuffer
    const r = await transcribeFile({ blob, fetcher })
    expect(r.text).toBe('Adwent to czas oczekiwania.'); expect(r.model).toBe('gemini-3.5-flash-lite')
    expect(calls.length).toBe(1)
    const part = calls[0].b.contents[0].parts[0].inlineData
    expect(part.mimeType).toBe('audio/wav'); expect(atob(part.data).charCodeAt(0)).toBe(82)
    expect(calls[0].b.systemInstruction.parts[0].text).toMatch(/стенографист/)
    expect(calls[0].b.generationConfig.temperature).toBe(0)
  })
  it('шаблон «· целым аудио»: kp с dic: file — свой шаблон, флаг не теряется при «Применить»', () => {
    const s = TEMPLATES.find((t) => t.id === 'kpfile').make()
    expect(s.kind).toBe('kp'); expect(s.dic).toBe('file'); expect(tplOf(s)).toBe('kpfile'); expect(tplOf({ id: 'x', kind: 'kp' })).toBe('kp')
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), pass: 70 }))).toBe('')
    expect(s.dic).toBe('file'); expect(s.pass).toBe(70)
  })
})

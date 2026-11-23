import { describe, it, expect } from 'vitest'
import { requests } from './requests'
import { overlay } from '../utils/overlay'
import { kpFields, kpCfg } from './kp/defaults'
import { talkFields } from './talk/defaults'
import { presetFromJson } from './presetJson'

const body = (r: any) => r.body as any

describe('Свои поля запроса (request) поверх собранного', () => {
  it('overlay: вложенное сливается, null убирает, списки и строки заменяются', () => {
    const b = { a: 1, g: { t: 0, think: { x: 1 } }, l: [1, 2] }
    expect(overlay(b, { g: { topP: 0.9, think: null }, l: [3] })).toEqual({ a: 1, g: { t: 0, topP: 0.9 }, l: [3] })
    expect(overlay(b, null)).toBe(b)
    expect(b.g.think).toEqual({ x: 1 })          // исходный объект не трогаем
  })
})

describe('«Запрос в API»: объекты, как уходят по сети', () => {
  it('мост: тело для сервера и текст в чат; request на мост не действует', () => {
    const r = requests({ kind: 'kp', text: 'Kiedy?', ideal: '**6** grudnia' })
    expect(body(r[0])).toMatchObject({ question: 'Kiedy?', reference: '6 grudnia', answer: '‹ответ ученика›' })
    expect(body(r[1]).text).toContain('Kiedy?'); expect(body(r[1]).id).toBe('k1a2b3')
    expect(r.some((x) => x.own === 'dictation')).toBe(true)          // «Надиктовать» — своя модель расшифровки
  })
  it('Gemini API: тело generateContent с промптом экрана; request.check — поверх', () => {
    const r = requests({ kind: 'kp', engine: 'api', text: 'Q', ideal: 'A', model: 'gemini-3.5-flash', request: { check: { generationConfig: { topP: 0.9, thinkingConfig: null }, safetySettings: [] } } })
    const c = r.find((x) => x.own === 'check')!
    expect(c.via).toContain('gemini-3.5-flash:generateContent')
    const b = body(c)
    expect(b.systemInstruction.parts[0].text).toContain(kpCfg({ engine: 'api' }).prompt.slice(0, 30))
    expect(b.contents[0].parts[0].text).toContain('Q')
    expect(b.generationConfig).toMatchObject({ responseMimeType: 'application/json', topP: 0.9 })
    expect(b.generationConfig.thinkingConfig).toBeUndefined(); expect(b.generationConfig.responseSchema).toBeDefined()
    expect(b.safetySettings).toEqual([])
    expect(r.some((x) => x.own === 'discuss')).toBe(true)
  })
  it('разговор в рации: setup Live без пауз модели, свои поля, оценка речи со звуком', () => {
    const r = requests({ kind: 'talk', ptt: true, lang: 'es-ES', voice: 'Puck', request: { live: { generationConfig: { maxOutputTokens: 200 } }, eval: { model: null } } })
    const s = body(r.find((x) => x.own === 'live')!).setup
    expect(s.realtimeInputConfig).toEqual({ automaticActivityDetection: { disabled: true } })
    expect(s.generationConfig).toMatchObject({ responseModalities: ['AUDIO'], maxOutputTokens: 200, speechConfig: { languageCode: 'es-ES', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } })
    expect(r.some((x) => x.own === 'transcribe')).toBe(true)
    const e = body(r.find((x) => x.own === 'eval')!)
    expect(e.contents[0].parts[0].inlineData.data).toMatch(/base64/)
  })
})

describe('request сохраняется из JSON', () => {
  it('у экрана и в курсе — объект; пустой — не своё', () => {
    expect(kpFields({ request: { check: { generationConfig: { topP: 1 } } } }).request).toEqual({ check: { generationConfig: { topP: 1 } } })
    expect(kpFields({ request: {} }).request).toBeUndefined()
    expect(talkFields({ request: { live: { x: 1 } } }).request).toEqual({ live: { x: 1 } })
    expect(presetFromJson('talk', JSON.stringify({ request: { eval: { y: 2 } } })).fields).toEqual({ request: { eval: { y: 2 } } })
  })
})

// @ts-nocheck — поддельные WebSocket и AudioContext
import { describe, it, expect, vi } from 'vitest'
vi.mock('../firebase', () => ({ apiRequest: async () => ({}) }))
import { startTalk, startTranscribe } from './live'
import { stepJson, applyStepJson, tplOf, TEMPLATES } from './lesson'

// «Разговор · рация» (21.11.2026): «договорил» решает кнопка — activityStart / activityEnd, автоопределение конца речи выключено
class FakeWS { static last = null; sent = []; readyState = 1; constructor() { FakeWS.last = this; setTimeout(() => this.onopen?.(), 0) } send(m) { this.sent.push(JSON.parse(m)) } close() {} }
class FakeCtx { currentTime = 0; state = 'running'; destination = {}; createAnalyser() { return { connect() {}, fftSize: 512, getFloatTimeDomainData() {} } } close() { return Promise.resolve() } }
globalThis.WebSocket = FakeWS; globalThis.AudioContext = FakeCtx

describe('рация в live.js', () => {
  it('manual: в setup выключено автоопределение «договорил»; talkStart / talkEnd шлют activityStart / activityEnd', async () => {
    const s = startTalk({ key: 'k', model: 'gemini-3.8-live', system: 'x', manual: true, micLater: true })
    await new Promise((r) => setTimeout(r, 5))
    const ws = FakeWS.last
    expect(ws.sent[0].setup.realtimeInputConfig).toEqual({ automaticActivityDetection: { disabled: true } })
    s.talkStart(); s.talkEnd()
    expect(ws.sent.slice(1)).toEqual([{ realtimeInput: { activityStart: {} } }, { realtimeInput: { activityEnd: {} } }])
    s.stop()
  })
  it('без manual — как раньше: пауза до «договорил» и чувствительность; talkStart ничего не шлёт', async () => {
    const s = startTalk({ key: 'k', model: 'gemini-3.8-live', system: 'x', micLater: true })
    await new Promise((r) => setTimeout(r, 5))
    const ws = FakeWS.last
    expect(ws.sent[0].setup.realtimeInputConfig.automaticActivityDetection).toEqual({ endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', silenceDurationMs: 1200 })
    s.talkStart(); expect(ws.sent.length).toBe(1); s.stop()
  })
  it('Transcribe: flush — audioStreamEnd (хвост распознаётся сразу)', async () => {
    const t = startTranscribe({ key: 'k' }); await new Promise((r) => setTimeout(r, 5))
    t.flush(); expect(FakeWS.last.sent.at(-1)).toEqual({ realtimeInput: { audioStreamEnd: true } }); t.stop()
  })
  it('шаблон «Разговор · рация»: talk с ptt и персонажем, флаг не теряется при «Применить»', () => {
    const s = TEMPLATES.find((t) => t.id === 'talkptt').make()
    expect(s.kind).toBe('talk'); expect(s.ptt).toBe(true); expect(s.avatar).toBe(true); expect(tplOf(s)).toBe('talkptt')
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), silenceMs: 1500 }))).toBe('')
    expect(s.ptt).toBe(true); expect(tplOf({ id: 'x', kind: 'talk', avatar: true })).toBe('talkava')
  })
})

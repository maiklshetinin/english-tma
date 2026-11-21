import { describe, it, expect, afterEach } from 'vitest'
import { setPresets } from './presets'
import { presetJson, presetFromJson, presetKeys } from './presetJson'
import { kpCfg, SYSTEM, CHAT } from './kp/defaults'
import { talkCfg } from './talk/defaults'
import { stepJson, applyStepJson } from '../utils/lesson'

afterEach(() => setPresets({}))
describe('настройки упражнения курса («{ }» на плитке меню)', () => {
  it('общий промпт курса — у всех экранов этого упражнения без своего; свой у экрана главнее; другая форма не задета', () => {
    setPresets({ kpapi: { prompt: 'Общий', livePrompt: '' } })
    expect(kpCfg({ engine: 'api' }).prompt).toBe('Общий'); expect(kpCfg({ engine: 'api' }).livePrompt).toBe('')
    expect(kpCfg({ engine: 'api', prompt: 'Свой' }).prompt).toBe('Свой')
    expect(kpCfg({}).prompt).toBe(SYSTEM)          // мост — свои настройки
  })
  it('JSON экрана без изменений — экран не отрывается от общих; совпало с общим — не хранится', () => {
    setPresets({ kp: { prompt: 'Общий' } })
    const s: any = { id: 'a', kind: 'kp', text: 'Q', ideal: 'A' }
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), prompt: 'Общий' }))).toBe('')
    expect(s).toEqual({ id: 'a', kind: 'kp', text: 'Q', ideal: 'A' })
  })
  it('плитка: показывает действующее (код ← курс), сохраняет только отличия от кода; пустое — тоже значение', () => {
    setPresets({ talkptt: { guard: '' } })
    expect(presetJson('talkptt')).toMatchObject({ guard: '' })
    const j = { ...presetJson('kp'), prompt: 'Мой мост', message: CHAT.message }
    expect(presetFromJson('kp', JSON.stringify(j)).fields).toEqual({ prompt: 'Мой мост' })
    expect(presetFromJson('kp', JSON.stringify({ format: 'без метки' })).error).toMatch(/\{id\}/)
    expect(presetFromJson('talk', JSON.stringify({ lock: '', voice: 'Puck' })).fields).toEqual({ lock: '', voice: 'Puck' })
    expect(presetKeys('kpfile')).toEqual(expect.arrayContaining(['sttPrompt', 'sttAsk']))
    expect(talkCfg({ ptt: true, avatar: true }).guard).toBe('')
  })
})

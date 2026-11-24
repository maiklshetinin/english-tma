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
  it('плитка: показывает действующее (код ← курс), сохраняет только отличия от кода; язык, замок и просьба — только из типа', () => {
    setPresets({ talkptt: { voice: 'Puck', guard: '', lock: 'EN', lang: 'en-US' } })
    expect(presetJson('talkptt')).toMatchObject({ voice: 'Puck' })
    for (const k of ['lang', 'lock', 'guard']) expect(presetJson('talkptt')).not.toHaveProperty(k)          // 24.11.2026: язык зашит в тип
    expect(talkCfg({ ptt: true, avatar: true })).toMatchObject({ lang: 'pl-PL', guard: 'Odpowiadaj wyłącznie po polsku.' })
    const j = { ...presetJson('kp'), prompt: 'Мой мост', message: CHAT.message }
    expect(presetFromJson('kp', JSON.stringify(j)).fields).toEqual({ prompt: 'Мой мост' })
    expect(presetFromJson('kp', JSON.stringify({ format: 'без метки' })).error).toMatch(/\{id\}/)
    expect(presetFromJson('talk', JSON.stringify({ lock: '', lang: 'en-US', voice: 'Puck' })).fields).toEqual({ voice: 'Puck' })
    expect(presetKeys('kpfile')).toEqual(expect.arrayContaining(['sttPrompt', 'sttAsk']))
  })
  it('«рация» в Karta Polaka (pl) и её копия в «Как в Busuu» (en) — общие настройки курса у каждой свои', () => {
    setPresets({ talkptt: { voice: 'KP' }, talkptt2: { voice: 'BUSUU' } })
    expect(talkCfg({ ptt: true, avatar: true }).voice).toBe('KP')
    expect(talkCfg({ ptt: true, avatar: true, busuu: true }).voice).toBe('BUSUU')
    setPresets({ talkptt: { voice: 'KP' } })
    expect(talkCfg({ ptt: true, avatar: true, busuu: true })).toMatchObject({ voice: 'Kore', lang: 'en-US', guard: 'Please reply only in English.' })          // у копии своих настроек нет — умолчания кода; язык — английский (тип en-talkptt2)
    expect(presetJson('talkptt2')).not.toMatchObject({ voice: 'KP' })
  })
  it('роль и первая реплика курса на чужом языке у польской рации не берутся — умолчания польские', () => {
    setPresets({ talkptt: { opener: "Hello! Let's talk about traveling in Spain. Have you ever been to Spain, or is it on your travel bucket list?" }, 'talkptt-1': { prompt: 'Jesteś życzliwą nauczycielką.' } })
    expect(talkCfg({ ptt: true, avatar: true, pv: 1 })).toMatchObject({ opener: 'Dzień dobry. Proszę zacząć rozmowę.', prompt: 'Jesteś życzliwą nauczycielką.' })
    setPresets({ talkptt: { opener: 'Dzień dobry! Proszę zacząć.' } })
    expect(talkCfg({ ptt: true, avatar: true }).opener).toBe('Dzień dobry! Proszę zacząć.')
  })
  it('испанский — свой тип: es_talk, es_talkptt; язык из пресета не меняется', () => {
    setPresets({ es_talkptt: { voice: 'Puck' }, talkptt: { lang: 'es-ES' } })
    expect(talkCfg({ ptt: true, avatar: true, lang: 'es-ES' })).toMatchObject({ lang: 'es-ES', voice: 'Puck', guard: 'Responde solo en español.' })
    expect(talkCfg({ ptt: true, avatar: true }).lang).toBe('pl-PL')
  })
})

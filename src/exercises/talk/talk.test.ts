import { describe, it, expect } from 'vitest'
import { stepJson, applyStepJson, stepsFromJson, type Step } from '../../utils/lesson'
import { DEF_PROMPT, LOCK, OPENER, talkCfg, talkFields, talkSystem } from './defaults'

// «Разговор с Gemini» (только польский): JSON экрана показывает всё, что уходит в Live-модель, а в экране хранятся только отличия (20.11.2026)
describe('«Разговор с Gemini»: JSON экрана', () => {
  it('пустой экран → stepJson со всеми умолчаниями', () => {
    const j: any = stepJson({ id: 'a', kind: 'talk', text: '' })
    expect(j).toEqual({ kind: 'talk', text: '', lang: 'pl-PL', prompt: DEF_PROMPT, lock: LOCK, opener: OPENER,
      voice: 'Kore', model: 'auto', silenceMs: 1200, endSens: 'low', temperature: null, noiseSuppression: false })
    expect(talkSystem(talkCfg({}))).toBe(LOCK + ' ' + DEF_PROMPT)
  })

  it('применили JSON со своими voice / silenceMs → в экране только отличия', () => {
    const s: Step = { id: 'a', kind: 'talk', text: 'Rozmowa' }
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), voice: 'Puck', silenceMs: 2000 }))).toBe('')
    expect(s).toEqual({ id: 'a', kind: 'talk', text: 'Rozmowa', voice: 'Puck', silenceMs: 2000 })
    expect(stepJson(s)).toMatchObject({ voice: 'Puck', silenceMs: 2000, lock: LOCK, opener: OPENER, prompt: DEF_PROMPT })
  })

  it('свои lock / opener / model / prompt сохраняются; temperature, endSens, noiseSuppression — тоже', () => {
    const s: Step = { id: 'b', kind: 'talk' }
    const j = { ...stepJson(s), lock: 'Mów tylko po polsku.', opener: 'Dzień dobry, proszę usiąść.', model: 'gemini-live-2.5-flash', prompt: 'Jesteś kelnerem w Krakowie.', temperature: 0.4, endSens: 'high', noiseSuppression: true }
    expect(applyStepJson(s, JSON.stringify(j))).toBe('')
    expect(s).toEqual({ id: 'b', kind: 'talk', lock: 'Mów tylko po polsku.', opener: 'Dzień dobry, proszę usiąść.', model: 'gemini-live-2.5-flash', prompt: 'Jesteś kelnerem w Krakowie.', temperature: 0.4, endSens: 'high', noiseSuppression: true })
    expect(talkSystem(talkCfg(s))).toBe('Mów tylko po polsku. Jesteś kelnerem w Krakowie.')
  })

  it('неверные значения и язык отбрасываются; умолчания не хранятся', () => {
    expect(talkFields({ lang: 'en-US', silenceMs: 50, temperature: 5, endSens: 'mid', voice: 'Kore', model: 'auto', prompt: DEF_PROMPT, lock: LOCK, opener: OPENER, noiseSuppression: 'yes' })).toEqual({})
  })

  it('«Править → Применить» больше не теряет lang у «Транскрипции» и model у «Ответа по смыслу»', () => {
    const r = stepsFromJson(JSON.stringify([{ kind: 'stt', text: 'Hola', lang: 'es-ES' }, { kind: 'kp', text: 'Q', ideal: 'A', model: 'gemini-2.5-flash' }]))!
    expect(r.steps[0].lang).toBe('es-ES'); expect(r.steps[1].model).toBe('gemini-2.5-flash')
  })
})

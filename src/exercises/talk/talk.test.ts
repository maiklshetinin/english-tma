import { describe, it, expect } from 'vitest'
import { stepJson, applyStepJson, stepsFromJson, type Step } from '../../utils/lesson'
import { DEF_PROMPT, LOCK, OPENER, talkCfg, talkFields } from './defaults'

// «Разговор с Gemini»: JSON экрана показывает всё, что уходит в Live-модель, а в экране хранятся только отличия (20.11.2026)
describe('«Разговор с Gemini»: JSON экрана', () => {
  it('пустой экран → stepJson со всеми умолчаниями', () => {
    const j: any = stepJson({ id: 'a', kind: 'talk', text: '' })
    expect(j).toMatchObject({ kind: 'talk', lang: 'pl-PL', prompt: DEF_PROMPT, lock: LOCK['pl-PL'], opener: OPENER['pl-PL'],
      voice: 'Kore', model: 'auto', silenceMs: 1200, endSens: 'low', temperature: null, noiseSuppression: false })
    expect(j.id).toBeUndefined()
  })

  it('применили JSON с es-ES и своими voice / silenceMs → в экране только отличия, замок и реплика стали испанскими', () => {
    const s: Step = { id: 'a', kind: 'talk', text: 'Hablemos' }
    const j: any = { ...stepJson(s), lang: 'es-ES', voice: 'Puck', silenceMs: 2000 }          // lock / opener остались польскими умолчаниями
    expect(applyStepJson(s, JSON.stringify(j))).toBe('')
    expect(s).toEqual({ id: 'a', kind: 'talk', text: 'Hablemos', lang: 'es-ES', voice: 'Puck', silenceMs: 2000 })
    const c = talkCfg(s)
    expect(c.lock).toBe(LOCK['es-ES']); expect(c.opener).toBe('Buenos días. Por favor, empiece la conversación.')
    expect((stepJson(s) as any).lock).toBe(LOCK['es-ES'])
  })

  it('свои lock / model / prompt сохраняются; temperature, endSens, noiseSuppression — тоже', () => {
    const s: Step = { id: 'b', kind: 'talk', text: '' }
    const j = { ...stepJson(s), lock: 'Habla solo español.', model: 'gemini-live-2.5-flash', prompt: 'Eres camarero en Madrid.', temperature: 0.4, endSens: 'high', noiseSuppression: true }
    expect(applyStepJson(s, JSON.stringify(j))).toBe('')
    expect(s).toEqual({ id: 'b', kind: 'talk', lock: 'Habla solo español.', model: 'gemini-live-2.5-flash', prompt: 'Eres camarero en Madrid.', temperature: 0.4, endSens: 'high', noiseSuppression: true })
    expect(stepJson(s)).toMatchObject({ lock: 'Habla solo español.', model: 'gemini-live-2.5-flash', prompt: 'Eres camarero en Madrid.', opener: OPENER['pl-PL'] })
  })

  it('неверные значения отбрасываются; умолчания не хранятся', () => {
    expect(talkFields({ lang: 'de-DE', silenceMs: 50, temperature: 5, endSens: 'mid', voice: 'Kore', model: 'auto', prompt: DEF_PROMPT, noiseSuppression: 'yes' })).toEqual({})
  })

  it('«Править → Применить» больше не теряет lang у «Транскрипции» и model у «Ответа по смыслу»', () => {
    const r = stepsFromJson(JSON.stringify([{ kind: 'stt', text: 'Hola', lang: 'es-ES' }, { kind: 'kp', text: 'Q', ideal: 'A', model: 'gemini-2.5-flash' }]))!
    expect(r.steps[0].lang).toBe('es-ES'); expect(r.steps[1].model).toBe('gemini-2.5-flash')
  })
})

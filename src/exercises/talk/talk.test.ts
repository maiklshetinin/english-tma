import { describe, it, expect } from 'vitest'
import { stepJson, applyStepJson, stepsFromJson, tplOf, TEMPLATES, type Step } from '../../utils/lesson'
import { DEF_PROMPT, LOCK, OPENER, EN_PROMPT, EN_LOCK, EN_OPENER, LANGS, EVAL_PROMPT, EVAL_ASK, talkCfg, talkFields, talkSystem } from './defaults'

// «Разговор с Gemini» (только польский): JSON экрана показывает всё, что уходит в Live-модель, а в экране хранятся только отличия (20.11.2026)
describe('«Разговор с Gemini»: JSON экрана', () => {
  it('пустой экран → stepJson со всеми умолчаниями', () => {
    const j: any = stepJson({ id: 'a', kind: 'talk', text: '' })
    expect(j).toEqual({ kind: 'talk', text: '', lang: 'pl-PL', prompt: DEF_PROMPT, lock: LOCK, opener: OPENER,
      voice: 'Kore', model: 'auto', silenceMs: 1200, endSens: 'low', temperature: null, noiseSuppression: false,
      guard: 'Odpowiadaj wyłącznie po polsku.', evalPrompt: EVAL_PROMPT, evalAsk: EVAL_ASK })
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

  it('английский из JSON: lang хранится, умолчания роли / замка / первой реплики — английские', () => {
    const s: any = stepsFromJson(JSON.stringify([{ kind: 'talk', lang: 'en-US', prompt: 'You are a barista.', lock: EN_LOCK, opener: EN_OPENER, voice: 'Kore' }]))!.steps[0]
    expect(s).toMatchObject({ kind: 'talk', lang: 'en-US', prompt: 'You are a barista.' })
    expect(s.lock).toBeUndefined(); expect(s.opener).toBeUndefined()
    const c = talkCfg(s)
    expect(c.lang).toBe('en-US'); expect(c.lock).toBe(EN_LOCK); expect(c.opener).toBe(EN_OPENER)
    expect(talkCfg({ lang: 'en-GB' }).prompt).toBe(EN_PROMPT)
    expect(talkCfg({ lang: 'xx' }).lang).toBe('pl-PL')
    expect(LANGS['en-US'].code).toBe('EN'); expect('Dzień dobry, jak się masz?'.match(LANGS['en-US'].alien)!.length).toBeGreaterThanOrEqual(2)
  })

  it('стёрли текст в JSON (роль, замок, первая реплика, просьба вернуться к языку, оценка речи) — пусто, умолчание не возвращается', () => {
    const s: any = { id: 'z', kind: 'talk', text: 'T' }
    const j: any = stepJson(s)
    expect(j).toMatchObject({ guard: 'Odpowiadaj wyłącznie po polsku.' })
    expect(typeof j.evalPrompt).toBe('string'); expect(j.evalAsk).toContain('{transcript}')
    j.lock = ''; delete j.opener; j.guard = ''
    expect(applyStepJson(s, JSON.stringify(j))).toBe('')
    const c = talkCfg(s)
    expect([c.lock, c.opener, c.guard]).toEqual(['', '', ''])
    expect(talkSystem(c)).toBe(c.prompt)
  })

  it('неверные значения отбрасываются; умолчания не хранятся', () => {
    expect(talkFields({ lang: 'xx-XX', silenceMs: 50, temperature: 5, endSens: 'mid', voice: 'Kore', model: 'auto', prompt: DEF_PROMPT, lock: LOCK, opener: OPENER, noiseSuppression: 'yes' })).toEqual({})
  })

  it('«Править → Применить» больше не теряет lang у «Транскрипции» и model у «Ответа по смыслу»', () => {
    const r = stepsFromJson(JSON.stringify([{ kind: 'stt', text: 'Hola', lang: 'es-ES' }, { kind: 'kp', text: 'Q', ideal: 'A', model: 'gemini-2.5-flash' }]))!
    expect(r.steps[0].lang).toBe('es-ES'); expect(r.steps[1].model).toBe('gemini-2.5-flash')
  })

  it('«Разговор с персонажем» (тест): тот же talk с avatar: true — свой шаблон, флаг не теряется при «Применить»', () => {
    const s = TEMPLATES.find((t) => t.id === 'talkava')!.make() as Step
    expect(s.kind).toBe('talk'); expect(s.avatar).toBe(true); expect(tplOf(s)).toBe('talkava'); expect(tplOf({ id: 'x', kind: 'talk' })).toBe('talk')
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), silenceMs: 1500 }))).toBe('')
    expect(s.avatar).toBe(true); expect(s.silenceMs).toBe(1500)
  })
})

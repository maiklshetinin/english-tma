import { describe, it, expect } from 'vitest'
import { stepJson, applyStepJson, stepsFromJson, tplOf, TEMPLATES, typeId, tplFromType, type Step } from '../../utils/lesson'
import { DEF_PROMPT, LOCK, OPENER, EN_PROMPT, EN_LOCK, EN_OPENER, LANGS, EVAL_PROMPT, EVAL_ASK, talkCfg, talkFields, talkSystem, talkRole, EXAM_PROMPT, EXAM_STAR } from './defaults'
import { requests } from '../requests'

// «Разговор с Gemini» (только польский): JSON экрана показывает всё, что уходит в Live-модель, а в экране хранятся только отличия (20.11.2026)
describe('«Разговор с Gemini»: JSON экрана', () => {
  it('пустой экран → stepJson со всеми умолчаниями', () => {
    expect(stepJson({ id: 'a', kind: 'talk', text: '' })).toEqual({ kind: 'talk', text: '', ...talkCfg({}) })          // 23.11.2026: как на плитке — все настройки
    const j: any = { kind: 'talk', text: '', ...talkCfg({}) }
    expect(j).toEqual({ kind: 'talk', text: '', lang: 'pl-PL', prompt: DEF_PROMPT, lock: LOCK, opener: OPENER,
      voice: 'Kore', model: 'auto', silenceMs: 1200, endSens: 'low', temperature: null, noiseSuppression: false,
      guard: 'Odpowiadaj wyłącznie po polsku.', evalPrompt: EVAL_PROMPT, evalAsk: EVAL_ASK, request: {} })
    expect(talkSystem(talkCfg({}))).toBe(LOCK + ' ' + DEF_PROMPT)
  })

  it('применили JSON со своими voice / silenceMs → в экране только отличия', () => {
    const s: Step = { id: 'a', kind: 'talk', text: 'Rozmowa' }
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), voice: 'Puck', silenceMs: 2000 }))).toBe('')
    expect(s).toEqual({ id: 'a', kind: 'talk', text: 'Rozmowa', voice: 'Puck', silenceMs: 2000 })
    expect(stepJson(s)).toEqual({ kind: 'talk', text: 'Rozmowa', ...talkCfg(s) }); expect(talkCfg(s)).toMatchObject({ lock: LOCK, opener: OPENER, prompt: DEF_PROMPT })
  })

  it('свои opener / model / prompt сохраняются; temperature, endSens, noiseSuppression — тоже; замок — только из типа', () => {
    const s: Step = { id: 'b', kind: 'talk' }
    const j = { ...stepJson(s), lock: 'Speak English.', opener: 'Dzień dobry, proszę usiąść.', model: 'gemini-live-2.5-flash', prompt: 'Jesteś kelnerem w Krakowie.', temperature: 0.4, endSens: 'high', noiseSuppression: true }
    expect(applyStepJson(s, JSON.stringify(j))).toBe('')
    expect(s).toEqual({ id: 'b', kind: 'talk', opener: 'Dzień dobry, proszę usiąść.', model: 'gemini-live-2.5-flash', prompt: 'Jesteś kelnerem w Krakowie.', temperature: 0.4, endSens: 'high', noiseSuppression: true })
    expect(talkSystem(talkCfg(s))).toBe(LOCK + ' Jesteś kelnerem w Krakowie.')
  })

  it('язык — из типа (24.11.2026): pl по умолчанию, en — рация Busuu, es — es_talk; lang из JSON у польского типа не хранится', () => {
    const s: any = stepsFromJson(JSON.stringify([{ kind: 'talk', lang: 'en-US', prompt: 'You are a barista.', voice: 'Kore' }]))!.steps[0]
    expect(s.lang).toBeUndefined(); expect(talkCfg(s)).toMatchObject({ lang: 'pl-PL', lock: LOCK })
    const es: any = stepsFromJson(JSON.stringify([{ type: 'es-talkptt', text: 'Hola' }]))!.steps[0]
    expect(es).toMatchObject({ kind: 'talk', ptt: true, lang: 'es-ES' }); expect(tplOf(es)).toBe('es_talkptt'); expect(talkCfg(es).lang).toBe('es-ES')
    const en: any = stepsFromJson(JSON.stringify([{ type: 'en-talkptt2' }]))!.steps[0]
    expect(talkCfg(en)).toMatchObject({ lang: 'en-US', lock: EN_LOCK, opener: EN_OPENER, prompt: EN_PROMPT })
    expect(talkCfg({ lang: 'xx' }).lang).toBe('pl-PL')
    expect(LANGS['en-US'].code).toBe('EN'); expect('Dzień dobry, jak się masz?'.match(LANGS['en-US'].alien)!.length).toBeGreaterThanOrEqual(2)
  })

  it('"" в JSON у первой реплики — пусто; замок и просьба вернуться к языку — всегда из типа; оценка речи — в общих настройках', () => {
    const s: any = { id: 'z', kind: 'talk', text: 'T' }
    const all: any = talkCfg(s)
    expect(all).toMatchObject({ guard: 'Odpowiadaj wyłącznie po polsku.' }); expect(all.evalAsk).toContain('{transcript}')
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), lock: '', opener: '', guard: '' }))).toBe('')
    const c = talkCfg(s)
    expect([c.lock, c.opener, c.guard]).toEqual([LOCK, '', 'Odpowiadaj wyłącznie po polsku.'])
  })

  it('неверные значения отбрасываются; умолчания не хранятся', () => {
    expect(talkFields({ lang: 'xx-XX', silenceMs: 50, temperature: 5, endSens: 'mid', voice: 'Kore', model: 'auto', prompt: DEF_PROMPT, lock: LOCK, opener: OPENER, noiseSuppression: 'yes' })).toEqual({})
  })

  it('«Править → Применить» не теряет model у «Ответа по смыслу»; «Транскрипция» — только польский (pl-stt)', () => {
    const r = stepsFromJson(JSON.stringify([{ kind: 'stt', text: 'Hola', lang: 'es-ES' }, { kind: 'kp', text: 'Q', ideal: 'A', model: 'gemini-2.5-flash' }]))!
    expect(r.steps[0].lang).toBeUndefined(); expect(r.steps[1].model).toBe('gemini-2.5-flash')
  })

  it('ID с языком: pl-kp, pl-talkexam-2, en-choice; не тот язык — не тип', () => {
    expect(typeId('kp')).toBe('pl-kp'); expect(typeId('choice')).toBe('en-choice'); expect(typeId('es_talk')).toBe('es-talk'); expect(typeId('talkptt2')).toBe('en-talkptt2')
    expect(tplFromType('pl-kp')).toBe('kp'); expect(tplFromType('kp')).toBe('kp'); expect(tplFromType('en-kp')).toBeNull(); expect(tplFromType('es-talkptt')).toBe('es_talkptt')
    const r: any = stepsFromJson(JSON.stringify([{ type: 'pl-talkexam-2', text: 'Q', ideal: 'A' }, { type: 'talkexam-3', text: 'Q' }]))!.steps
    expect(r[0]).toMatchObject({ kind: 'talk', exam: true, pv: 2 }); expect(r[1]).toMatchObject({ exam: true, pv: 3 })
  })

  it('«Разговор с персонажем» (тест): тот же talk с avatar: true — свой шаблон, флаг не теряется при «Применить»', () => {
    const s = TEMPLATES.find((t) => t.id === 'talkava')!.make() as Step
    expect(s.kind).toBe('talk'); expect(s.avatar).toBe(true); expect(tplOf(s)).toBe('talkava'); expect(tplOf({ id: 'x', kind: 'talk' })).toBe('talk')
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), silenceMs: 1500 }))).toBe('')
    expect(s.avatar).toBe(true); expect(s.silenceMs).toBe(1500)
  })
})

describe('«Собеседование · рация» (24.11.2026)', () => {
  it('из JSON: вопрос, эталон, звезда, номер — у экрана; шаблон talkexam; роль — шаблон курса', () => {
    const s: any = stepsFromJson(JSON.stringify([{ kind: 'talk', exam: true, text: 'Kiedy obchodzimy Mikołajki?', ideal: '==Mikołajki== są **6 grudnia**.\n• prezenty', star: true, n: 2 }]))!.steps[0]
    expect(s).toMatchObject({ exam: true, ptt: true, star: true, n: 2, text: 'Kiedy obchodzimy Mikołajki?' })
    expect(tplOf(s)).toBe('talkexam'); expect(TEMPLATES.some((x) => x.id === 'talkexam')).toBe(true)
    const c = talkCfg(s)
    expect(c.prompt).toBe(EXAM_PROMPT)
    const role = talkRole(c, s)
    expect(role).toContain('«Kiedy obchodzimy Mikołajki?»'); expect(role).toContain('Mikołajki są 6 grudnia.\n- prezenty'); expect(role).toContain(EXAM_STAR)
    expect(role).not.toMatch(/\{(question|reference|star)\}/)
    expect(talkRole(c, { ...s, star: false })).not.toContain(EXAM_STAR)
  })
  it('обычная рация — роль без меток, как раньше; в «Запросе в API» — роль с вопросом', () => {
    expect(talkRole(talkCfg({ ptt: true }), { text: 'x' })).toBe(talkSystem(talkCfg({ ptt: true })))
    const r = requests({ kind: 'talk', exam: true, ptt: true, text: 'Q?', ideal: 'A' })
    expect((r[0].body as any).setup.systemInstruction.parts[0].text).toContain('«Q?»')
  })
  it('JSON экрана: эталон и звезда остаются при «Применить»', () => {
    const s: any = stepsFromJson(JSON.stringify([{ kind: 'talk', exam: true, text: 'Q', ideal: 'A', star: true }]))!.steps[0]
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), ideal: 'B' }))).toBe('')
    expect(s).toMatchObject({ exam: true, ideal: 'B', star: true, ptt: true })
  })
})

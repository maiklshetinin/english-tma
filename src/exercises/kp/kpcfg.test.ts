// @ts-nocheck — поддельный fetch
import { describe, it, expect, vi } from 'vitest'
vi.mock('../../firebase', () => ({ apiRequest: async () => ({ ok: false, json: async () => ({}) }) }))
import { stepJson, applyStepJson, type Step } from '../../utils/lesson'
import { SYSTEM, PASS, DEF, kpCfg, kpFields, fill } from './defaults'
import { checkDirect, setPick } from '../../utils/kpcheck'
import { ai } from '../../utils/gemini'

// «Ответ по смыслу»: JSON экрана показывает всё, что уходит в модели проверки, в экране — только отличия (20.11.2026)
describe('«Ответ по смыслу»: настройки проверки в JSON экрана', () => {
  it('через мост: в JSON — промпт и порог по умолчанию', () => {
    const j: any = stepJson({ id: 'a', kind: 'kp', text: 'Q', ideal: 'A' })
    expect(j).toEqual({ kind: 'kp', text: 'Q', ideal: 'A', prompt: SYSTEM, pass: PASS })
  })

  it('· Gemini API: в JSON — все промпты, модель, температура, размышления', () => {
    const j: any = stepJson({ id: 'a', kind: 'kp', engine: 'api', text: 'Q', ideal: 'A' })
    expect(j).toMatchObject({ prompt: SYSTEM, pass: 60, model: 'auto', format: DEF.format, message: DEF.message, temperature: null, thinking: false,
      livePrompt: DEF.livePrompt, liveAsk: 'Oceń moją odpowiedź.', liveMore: DEF.liveMore, discussPrompt: DEF.discussPrompt, discussOpener: 'Proszę omówić moją odpowiedź.' })
  })

  it('применили JSON целиком без правок — в экране ничего лишнего', () => {
    const s: Step = { id: 'a', kind: 'kp', engine: 'api', text: 'Q', ideal: 'A' }
    expect(applyStepJson(s, JSON.stringify(stepJson(s)))).toBe('')
    expect(s).toEqual({ id: 'a', kind: 'kp', engine: 'api', text: 'Q', ideal: 'A' })
  })

  it('свои промпты, порог, модель, температура сохраняются — только они', () => {
    const s: Step = { id: 'b', kind: 'kp', engine: 'api', text: 'Q', ideal: 'A' }
    const j = { ...stepJson(s), prompt: 'Оценивай строго.', pass: 70, model: 'live', temperature: 0.2, thinking: true, message: 'Pytanie: {question}\nOdpowiedź: {answer}', discussOpener: 'Cześć!' }
    expect(applyStepJson(s, JSON.stringify(j))).toBe('')
    expect(s).toEqual({ id: 'b', kind: 'kp', engine: 'api', text: 'Q', ideal: 'A', prompt: 'Оценивай строго.', pass: 70, model: 'live', temperature: 0.2, thinking: true, message: 'Pytanie: {question}\nOdpowiedź: {answer}', discussOpener: 'Cześć!' })
    const c = kpCfg(s)
    expect(c.format).toBe(DEF.format)
    expect(fill(c.message, { question: 'Kiedy?', answer: '6 grudnia' })).toBe('Pytanie: Kiedy?\nOdpowiedź: 6 grudnia')
  })

  it('неверные значения отбрасываются', () => {
    expect(kpFields({ pass: 0, temperature: 9, thinking: 'yes', model: 'auto', prompt: SYSTEM, format: DEF.format })).toEqual({})
  })

  it('· Gemini API: в модель уходят свой шаблон сообщения, формат и температура экрана', async () => {
    localStorage.clear(); setPick('gemini-3.5-flash-lite'); ai.keys = [{ key: 'AAAAAAAAAAAAAAAA1111', ok: null, until: 0, n: 0 }]
    const s = { id: 'c', kind: 'kp', engine: 'api', text: 'Kiedy?', ideal: '==6 grudnia==', message: 'P: {question} | W: {reference} | O: {answer}', format: 'Tylko JSON.', temperature: 0.3 }
    let body: any = null
    const fetcher = async (_u, o) => { body = JSON.parse(o.body); return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"score":80,"missed_points":[],"feedback":"ok"}' }] } }] }) } }
    const r = await checkDirect({ question: s.text, reference: s.ideal, answer: 'szóstego', cfg: kpCfg(s) }, { fetcher })
    expect(r.score).toBe(80)
    expect(body.contents[0].parts[0].text).toBe('P: Kiedy? | W: 6 grudnia | O: szóstego')
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM + ' Tylko JSON.')
    expect(body.generationConfig.temperature).toBe(0.3)
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' })
  })
})

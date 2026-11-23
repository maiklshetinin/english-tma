// @ts-nocheck — поддельный fetch
import { describe, it, expect, vi } from 'vitest'
vi.mock('../../firebase', () => ({ apiRequest: async () => ({ ok: false, json: async () => ({}) }) }))
import { stepJson, applyStepJson, stepsFromJson, type Step } from '../../utils/lesson'
import { SYSTEM, PASS, DEF, CHAT, STT, TOPIC, kpCfg, kpFields, kpShown, kpReady, fill } from './defaults'
import { checkDirect, setPick } from '../../utils/kpcheck'
import { ai } from '../../utils/gemini'

// «Ответ по смыслу»: JSON экрана показывает всё, что уходит в модели проверки, в экране — только отличия (20.11.2026)
describe('«Ответ по смыслу»: настройки проверки в JSON экрана', () => {
  it('через мост: в JSON экрана — только своё; общее (промпт, message, format, порог) — kpShown, на плитке меню', () => {
    const j: any = stepJson({ id: 'a', kind: 'kp', text: 'Q', ideal: 'A' })
    expect(j).toEqual({ kind: 'kp', text: 'Q', ideal: 'A', ...kpShown({}) })          // 23.11.2026: как на плитке — все настройки с действующими значениями
    expect(kpShown({})).toEqual({ prompt: SYSTEM, message: CHAT.message, format: CHAT.format, pass: PASS, lang: 'pl-PL', topic: TOPIC, dicModel: 'auto' })
    const s: Step = { id: 'a', kind: 'kp', text: 'Q', ideal: 'A' }
    expect(applyStepJson(s, JSON.stringify(j))).toBe(''); expect(s).toEqual({ id: 'a', kind: 'kp', text: 'Q', ideal: 'A' })          // не трогали — у экрана своего нет
    expect(kpReady(kpCfg({ lang: 'es-ES', topic: 'examen DELE' })).prompt).toContain('(examen DELE, испанский язык)')          // {topic}, {lang} — подставлены
  })

  it('мост: в JSON ровно то, что уходит в чат — prompt, message, format (с {id}); свой format без {id} не принимается', () => {
    const s: Step = { id: 'm', kind: 'kp', text: 'Q', ideal: 'A' }
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), message: 'Pytanie: {question}\nOdpowiedź: {answer}', format: 'Ответь JSON с id {id}' }))).toBe('')
    expect(s).toMatchObject({ message: 'Pytanie: {question}\nOdpowiedź: {answer}', format: 'Ответь JSON с id {id}' })
    expect(kpFields({ kind: 'kp', format: 'без метки' })).toEqual({})
    expect(kpCfg({ format: 'без метки' }).format).toBe(CHAT.format)
    expect(kpCfg({ engine: 'api' }).format).toBe(DEF.format)          // у Gemini API своё умолчание
  })

  it('все 3 формы: "" в JSON — пусто, без подстановки, и так и остаётся; удалили поле — снова общее', () => {
    for (const form of [{}, { engine: 'api' }, { dic: 'file' }]) {
      const s: any = { id: 'x', kind: 'kp', text: 'Q', ideal: 'A', ...form }
      const j: any = { ...stepJson(s), prompt: '', message: '' }
      if (form.engine) Object.assign(j, { livePrompt: '', format: '' })
      if (form.dic) j.sttAsk = ''
      expect(applyStepJson(s, JSON.stringify(j))).toBe('')
      const c = kpCfg(s), again: any = stepJson(s)
      expect([c.prompt, c.message, again.prompt, again.message]).toEqual(['', '', '', ''])
      if (form.engine) expect([c.livePrompt, c.format]).toEqual(['', ''])
      if (form.dic) expect(c.sttAsk).toBe('')
      expect(applyStepJson(s, JSON.stringify(again))).toBe('')
      expect(kpCfg(s).prompt).toBe('')
      const { prompt: _p, ...back } = again
      expect(applyStepJson(s, JSON.stringify(back))).toBe('')
      expect(kpCfg(s).prompt).toBe(SYSTEM)
    }
  })

  it('мост: format без {id} — «Применить» не проходит и объясняет; без поля format — общий', () => {
    const s: any = { id: 'y', kind: 'kp', text: 'Q', ideal: 'A' }
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), format: 'просто JSON' }))).toMatch(/\{id\}/)
    expect(applyStepJson(s, JSON.stringify({ ...stepJson(s), format: '' }))).toMatch(/\{id\}/)
    expect(applyStepJson(s, JSON.stringify(stepJson(s)))).toBe('')
    expect(kpCfg(s).format).toBe(CHAT.format)
  })

  it('«целым аудио»: в JSON — промпт и просьба расшифровки; у других форм их нет', () => {
    expect(kpShown({ dic: 'file' })).toMatchObject({ sttPrompt: STT.sttPrompt, sttAsk: STT.sttAsk })
    expect('sttPrompt' in kpShown({})).toBe(false)
    expect(kpFields({ dic: 'file', sttAsk: 'Przepisz nagranie.', lang: 'en-US' })).toEqual({ sttAsk: 'Przepisz nagranie.', lang: 'en-US' })
  })

  it('· Gemini API: в JSON — все промпты, модель, температура, размышления', () => {
    const j: any = kpShown({ engine: 'api' })
    expect(j).toMatchObject({ prompt: SYSTEM, pass: 60, model: 'auto', format: DEF.format, message: DEF.message, temperature: null, thinking: false,
      livePrompt: DEF.livePrompt, liveAsk: 'Oceń moją odpowiedź.', liveMore: DEF.liveMore, discussPrompt: DEF.discussPrompt, discussOpener: 'Proszę omówić moją odpowiedź.',
      lang: 'pl-PL', liveTool: DEF.liveTool, liveModel: 'auto', voice: 'Kore', discussNone: 'nic ważnego' })
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
    expect(body.systemInstruction.parts[0].text).toBe(fill(SYSTEM, { topic: TOPIC, lang: 'польский' }) + ' Tylko JSON.')          // метки темы и языка подставлены
    expect(body.generationConfig.temperature).toBe(0.3)
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' })
  })

  it('JSON домашки (tools/kp-json.py): "engine": "api", "model": "live" в корне — все экраны сразу Gemini API · Live; без них — мост', () => {
    const qs = [{ id: 1, star: true, question: 'Q1', reference: 'A1' }, { id: 2, question: 'Q2', reference: 'A2', model: 'auto' }]
    const live = stepsFromJson(JSON.stringify({ pass_threshold: 60, engine: 'api', model: 'live', questions: qs }))!.steps
    expect(live.map((x) => [x.engine, x.model, x.pass])).toEqual([['api', 'live', undefined], ['api', undefined, undefined]])          // у вопроса своя модель: auto — умолчание
    const bridge = stepsFromJson(JSON.stringify({ pass_threshold: 60, questions: qs }))!.steps
    expect(bridge.map((x) => [x.engine, x.model])).toEqual([[undefined, undefined], [undefined, undefined]])
  })
})

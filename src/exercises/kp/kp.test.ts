import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LessonPlayer from '../../components/LessonPlayer.vue'

// Gemini подменяем: score задаёт тест
const g = vi.hoisted(() => ({ next: [] as any[] }))
vi.mock('../../utils/gemini', async (orig) => ({ ...(await orig<any>()), checkAnswer: vi.fn(async () => { const r = g.next.shift(); if (r instanceof Error) throw r; return r }) }))

const resolve = (v: string) => v
const step = { id: 'q1', kind: 'kp', text: 'Kiedy i jak obchodzimy Mikołajki?', ideal: 'Mikołajki obchodzimy szóstego grudnia…' }
const res = (score: number) => ({ score, missed: score < 100 ? ['подарки в ботинках'] : [], feedback: 'Dobrze!', ok: score >= 60 })

describe('«Ответ по смыслу»: экран у ученика', () => {
  beforeEach(() => { g.next = [] })

  it('до проверки: «Проверить» неактивна без ответа, «Не прозвучало» и эталон закрыты', async () => {
    const w = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
    expect(w.find('.kqt').text()).toBe(step.text)
    expect(w.find('.foot .go').text()).toBe('Проверить'); expect(w.find('.foot .go').attributes('disabled')).toBeDefined()
    expect(w.find('.kb.ref').text()).toContain('не подглядывайте'); expect(w.text()).not.toContain(step.ideal)
    await w.find('textarea.ka').setValue('Szóstego grudnia'); expect(w.find('.foot .go').attributes('disabled')).toBeUndefined()
  })
  it('проверка: процент, «Зачтено», пункты, эталон, отзыв в зелёном подвале; поле — тем же местом', async () => {
    g.next.push(res(64))
    const w = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
    await w.find('textarea.ka').setValue('Szóstego grudnia, dzieci dostają prezenty'); await w.find('.foot .go').trigger('click'); await flushPromises()
    expect(w.find('.kgv b').text()).toBe('64%'); expect(w.find('.kgv').text()).toContain('Зачтено')
    expect(w.find('.kb.miss li').text()).toBe('подарки в ботинках'); expect(w.find('.kb.ref').text()).toContain(step.ideal)
    expect(w.find('.ka.done').text()).toBe('Szóstego grudnia, dzieci dostają prezenty')
    expect(w.find('.foot').classes()).toContain('good'); expect(w.find('.foot .fb').text()).toContain('Dobrze!')
  })
  it('Gemini не ответил — без оценки: эталон открыт, подвал не красный, в Review — ok: null', async () => {
    g.next.push(Object.assign(new Error('Нет ключа Gemini'), { nokey: true }))
    const w = mount(LessonPlayer, { props: { steps: [step], resolve, track: true } })
    await w.find('textarea.ka').setValue('coś'); await w.find('.foot .go').trigger('click'); await flushPromises()
    expect(w.find('.kb.miss').text()).toContain('нет ключа Gemini'); expect(w.find('.kb.ref').text()).toContain(step.ideal)
    expect(w.find('.foot').classes()).not.toContain('bad')
    expect(w.emitted('answer')!.at(-1)![0]).toMatchObject({ ok: null })
  })
  it('меньше 60 % — вопрос один раз возвращается в конце урока; снова мимо — урок идёт дальше', async () => {
    g.next.push(res(30), res(45))
    const w = mount(LessonPlayer, { props: { steps: [step], resolve, track: true } })
    const answer = async () => { await w.find('textarea.ka').setValue('nie wiem'); await w.find('.foot .go').trigger('click'); await flushPromises() }
    await answer(); expect(w.find('.foot').classes()).toContain('bad'); expect(w.emitted('answer')!.at(-1)![0]).toMatchObject({ ok: false })
    await w.find('.foot .go').trigger('click')                                // «Продолжить» → тот же вопрос ещё раз, поле пустое
    expect(w.find('textarea.ka').exists()).toBe(true); expect((w.find('textarea.ka').element as HTMLTextAreaElement).value).toBe('')
    await answer(); await w.find('.foot .go').trigger('click')
    expect(w.find('.fin').exists()).toBe(true)                                // больше не крутим — итог урока
  })
})

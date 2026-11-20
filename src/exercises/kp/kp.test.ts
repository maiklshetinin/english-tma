import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { provideEdit } from '../ctx'
import { EX } from '../index'
import { SYSTEM, checkAnswer } from '../../utils/ai'
import LessonPlayer from '../../components/LessonPlayer.vue'

// проверку через мост подменяем: score задаёт тест
const g = vi.hoisted(() => ({ next: [] as any[], bridge: { online: true, sites: ['Gemini'] } as any }))
vi.mock('../../utils/ai', async (orig) => ({ ...(await orig<any>()), checkAnswer: vi.fn(async () => { const r = g.next.shift(); if (r instanceof Error) throw r; return r }), bridgeStatus: vi.fn(async () => g.bridge) }))

const resolve = (v: string) => v
const step = { id: 'q1', kind: 'kp', text: 'Kiedy i jak obchodzimy Mikołajki?', ideal: 'Mikołajki obchodzimy szóstego grudnia…' }
const res = (score: number, site = '') => ({ score, missed: score < 100 ? ['подарки в ботинках'] : [], feedback: 'Dobrze!', site, ok: score >= 60 })

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
  it('мост не ответил — без оценки: эталон открыт, подвал не красный, в Review — ok: null', async () => {
    g.next.push(new Error('Мост с чатом не в сети — откройте вкладку с чатом и скриптом'))
    const w = mount(LessonPlayer, { props: { steps: [step], resolve, track: true } })
    await w.find('textarea.ka').setValue('coś'); await w.find('.foot .go').trigger('click'); await flushPromises()
    expect(w.find('.kb.miss').text()).toContain('Мост с чатом не в сети'); expect(w.find('.kb.ref').text()).toContain(step.ideal)
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
  it('свой промпт и порог экрана уходят в проверку', async () => {
    g.next.push(res(70))
    const w = mount(LessonPlayer, { props: { steps: [{ ...step, prompt: 'Mój prompt', pass: 75 }], resolve, embedded: true } })
    await w.find('textarea.ka').setValue('coś'); await w.find('.foot .go').trigger('click'); await flushPromises()
    expect((checkAnswer as any).mock.calls.at(-1)[0]).toMatchObject({ prompt: 'Mój prompt', pass: 75 })
  })
})

describe('«Ответ по смыслу»: JSON экрана в правке', () => {
  const host = (st: any, log: string[]) => defineComponent({ setup() {
    provideEdit({ pick() {}, drop() {}, clear() {}, pct: () => null, changed: () => log.push('changed'), cards() {}, canUndo: () => false, undoCard() {}, dropFiles() {} })
    return () => h(LessonPlayer, { steps: [st], resolve, embedded: true, edit: true }, { foot: () => h('div', { class: 'cf' }, [h(EX.kp.view, { step: st, part: 'tools' })]) })
  } })
  it('кнопка JSON: вопрос, эталон, порог и общий промпт; «Применить» — свой промпт и порог у экрана', async () => {
    const st: any = reactive({ ...step }), log: string[] = []
    const w = mount(host(st, log))
    await w.findAll('.cf .ext').at(-1)!.trigger('click')
    const o = JSON.parse((w.find('.kjt').element as HTMLTextAreaElement).value)
    expect(o).toEqual({ id: null, star: false, autoplay: false, look: 'pdf', marks: true, question: step.text, reference: step.ideal, pass_threshold: 60, system_prompt: SYSTEM })
    await w.find('.kjt').setValue(JSON.stringify({ ...o, pass_threshold: 70, system_prompt: 'Bądź surowy.' })); await w.find('.kjo').trigger('click')
    expect(st.prompt).toBe('Bądź surowy.'); expect(st.pass).toBe(70); expect(log).toContain('changed'); expect(w.find('.kj').exists()).toBe(false)
    await w.findAll('.cf .ext').at(-1)!.trigger('click'); await w.find('.kjt').setValue('{ сломано'); await w.find('.kjo').trigger('click')
    expect(w.find('.kjb em').text()).toMatch(/Не JSON/); expect(st.prompt).toBe('Bądź surowy.')
    await w.find('.kjt').setValue(JSON.stringify({ ...o })); await w.find('.kjo').trigger('click')          // вернули общий — у экрана своего нет
    expect('prompt' in st).toBe(false); expect('pass' in st).toBe(false)
  })
  it('как в домашке: номер и вопрос на подложке, звезда, в эталоне — оранжевые термины, жирный, курсив, пункты', async () => {
    g.next.push(res(70))
    const rich = { ...step, n: 5, star: true, ideal: '==Adwent== trwa **cztery tygodnie** _(na przykład)_.\nTradycje:\n• ==Choinka==: symbol życia\n• **Opłatek**' }
    const w = mount(LessonPlayer, { props: { steps: [rich], resolve, embedded: true } })
    expect(w.find('.kqt').text()).toBe('5.' + step.text); expect(w.find('.kst svg').exists()).toBe(true)
    await w.find('textarea.ka').setValue('coś'); await w.find('.foot .go').trigger('click'); await flushPromises()
    const ref = w.find('.kb.ref .kr')
    expect(ref.find('b.acc').text()).toBe('Adwent'); expect(ref.find('p b:not(.acc)').text()).toBe('cztery tygodnie'); expect(ref.find('i').text()).toBe('(na przykład)')
    expect(ref.findAll('li').map((x) => x.text())).toEqual(['Choinka: symbol życia', 'Opłatek']); expect(ref.text()).not.toContain('==')
    expect(vi.mocked(checkAnswer).mock.calls.at(-1)![0].reference).toContain('==Adwent==')          // разметку снимает checkAnswer (kpPlain)
    const plain = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
    expect(plain.find('.kst').exists()).toBe(false)                                                                     // без звезды — без звезды
  })
  it('после проверки видно, какой чат проверил: значок и название', async () => {
    g.next.push(res(70, 'Claude'))
    const w = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
    await flushPromises(); expect(w.find('.kbr').text()).toBe('Мост подключёнGemini'); expect(w.find('.kbr img').attributes('src')).toBe('/ai/gemini.svg')          // до проверки — с кем мост, в подвале
    expect(w.find('.kby').exists()).toBe(false)
    await w.find('textarea.ka').setValue('coś'); await w.find('.foot .go').trigger('click'); await flushPromises()
    expect(w.find('.kby').text()).toBe('проверилClaude');
    const w2 = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } }); g.next.push({ ...res(70, 'Gemini'), ms: 4830 })
    await w2.find('textarea.ka').setValue('coś'); await w2.find('.foot .go').trigger('click'); await flushPromises()
    expect(w2.find('.kby').text()).toBe('проверилGemini · 4,8 с'); expect(w.find('.kby img').attributes('src')).toBe('/ai/Claude%20Spark%20-%20Clay.svg')
  })
  it('моста нет — в подвале «Мост не в сети»', async () => {
    g.bridge = { online: false, sites: [] }
    const w = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } }); await flushPromises()
    expect(w.find('.kbr.off').text()).toBe('Мост не в сети — проверки не будет'); g.bridge = { online: true, sites: ['Gemini'] }
  })
  it('текст от программы диктовки (без события input) — подхватывается, «Проверить» становится активной', async () => {
    vi.useFakeTimers()
    try {
      const w = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
      const el0 = w.find('textarea.ka').element as HTMLTextAreaElement
      el0.value = 'Adwent to czas oczekiwania'          // вставили напрямую, события нет
      expect(w.find('.foot .go').attributes('disabled')).toBeDefined()
      await vi.advanceTimersByTimeAsync(600); await w.vm.$nextTick()
      expect(w.find('.foot .go').attributes('disabled')).toBeUndefined(); expect(w.find('.kl span').text()).toBe('4 слова · зачёт от 60%')
    } finally { vi.useRealTimers() }
  })
  it('вид и выделения: по умолчанию PDF с выделениями; «линии», «подложки», без выделений — простой текст', async () => {
    g.next.push(res(70), res(70))
    const rich = { ...step, ideal: '==Adwent== trwa **cztery tygodnie**' }
    const w = mount(LessonPlayer, { props: { steps: [rich], resolve, embedded: true } })
    expect(w.find('.kb.ref').classes()).toContain('pdf')
    const v = mount(LessonPlayer, { props: { steps: [{ ...rich, look: 'cards', plain: true }], resolve, embedded: true } })
    expect(v.find('.kb.miss').classes()).toContain('cards')
    await v.find('textarea.ka').setValue('coś'); await v.find('.foot .go').trigger('click'); await flushPromises()
    expect(v.find('.kb.ref .kr').text()).toBe('Adwent trwa cztery tygodnie'); expect(v.find('.kb.ref b').exists()).toBe(false)
  })
})

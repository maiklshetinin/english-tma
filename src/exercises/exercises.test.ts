import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive } from 'vue'
import LessonPlayer from '../components/LessonPlayer.vue'
import { EX, exOf } from './index'
import { provideEdit } from './ctx'
import { KINDS, KIND_MIN, SKILLS, TEMPLATES } from '../utils/lesson'

const resolve = (v: string) => 'blob:' + v
// LessonPlayer в режиме правки — внутри «ветки», которая даёт действия правки (как LessonRail)
function editHost(step: any, log: string[]) {
  return defineComponent({
    setup() {
      provideEdit({ pick: (_s: any, k: string[], o: any, a: any) => log.push('pick:' + k.join('+') + ':' + (o ?? '') + ':' + (a ?? '')), drop() {}, clear: (_o: any, f: string) => log.push('clear:' + f), pct: () => null,
        changed: () => log.push('changed'), cards: (_s: any, w: string) => log.push('cards:' + w), canUndo: () => false, undoCard() {}, dropFiles: (f: string[]) => log.push('drop:' + f.length) })
      return () => h(LessonPlayer, { steps: [step], resolve, embedded: true, edit: true }, { foot: () => h('div', { class: 'cf' }, [h(EX[step.kind].view, { step, part: 'tools' })]) })
    },
  })
}

describe('упражнения-шаблоны: описание (.json) совпадает с тем, что знает урок (lesson.ts)', () => {
  for (const [kind, x] of Object.entries(EX) as [string, any][]) {
    it(kind, () => {
      expect(x.kind).toBe(kind)
      expect(x.head).toBe((KINDS as any)[kind].head)
      expect(x.title).toBe((KINDS as any)[kind].t)
      expect(x.min).toBe((KIND_MIN as any)[kind])
      expect(x.templates.sort()).toEqual(TEMPLATES.filter(t => t.kind === kind).map(t => t.id).sort())
      for (const t of x.templates) expect(x.skills[t] ?? []).toEqual(SKILLS[t] ?? [])
      expect(['none', 'tap', 'button', 'voice', 'free']).toContain(x.check)
    })
  }
  it('книжные экраны пока рисуются по-старому', () => { expect(exOf({ kind: 'choice', bk: 'bkpick' })).toBeNull(); expect(exOf({ kind: 'pairs' })).toBeNull(); expect(exOf({ kind: 'tip' })).not.toBeNull() })
})

describe('ученик видит экран из шаблона', () => {
  it('Новое слово: фото, слово, перевод, пример; «Продолжить» сразу', async () => {
    const w = mount(LessonPlayer, { props: { steps: [{ id: 'a', kind: 'intro', word: 'hello', tr: 'привет', image: 'i.jpg', ex: 'Hello, Anna!', exTr: 'Привет, Анна!', exAudio: 'e.mp3' }], resolve, embedded: true } })
    expect(w.find('.hd').text()).toBe('Смотрите, новое слово!')
    expect(w.find('.media img').attributes('src')).toBe('blob:i.jpg')
    expect(w.find('.word b').text()).toBe('hello'); expect(w.find('.word > span').text()).toBe('привет')
    expect(w.find('.ex p').text()).toContain('Hello, Anna!'); expect(w.find('.ex .exs').exists()).toBe(true)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.find('.go').attributes('disabled')).toBeUndefined()
  })
  it('Выбери ответ: тап по варианту — «Верно!» / «Правильный ответ: …»', async () => {
    const step = { id: 'c', kind: 'choice', ask: 'audio', show: 'pics', audio: 'q.mp3', ans: 1, opts: [{ w: 'cat' }, { w: 'dog' }, { w: 'cow' }] }
    const w = mount(LessonPlayer, { props: { steps: [step], resolve, single: true } })          // single — без перемешивания
    expect(w.findAll('.op').map(b => b.text())).toEqual(['нет фотоcat', 'нет фотоdog', 'нет фотоcow'])
    expect(w.find('.xa-row').exists()).toBe(true)
    await w.findAll('.op')[0].trigger('click')
    expect(w.find('.foot .fb').text()).toContain('Правильный ответ:'); expect(w.find('.foot .fb').text()).toContain('dog')
    expect(w.find('.foot').classes()).toContain('bad')
    expect(w.findAll('.op')[1].classes()).toContain('ok')
  })
  it('Подсказка: правило с жирным и таблица', () => {
    const w = mount(LessonPlayer, { props: { steps: [{ id: 't', kind: 'tip', text: 'Say **hello** to friends', opts: [{ w: 'Hi!', t: 'Привет!', audio: 'h.mp3' }] }], resolve, embedded: true } })
    expect(w.find('.tip b').text()).toBe('hello')
    expect(w.findAll('.tr')).toHaveLength(1); expect(w.find('.tr').text()).toContain('Привет!')
  })
})

describe('правка — тот же шаблон: поля на месте текста', () => {
  it('Новое слово: слово и перевод правятся, «Взять из карточек» — в подвале', async () => {
    const step: any = reactive({ id: 'a', kind: 'intro', word: 'hello', tr: 'привет' }), log: string[] = []
    const w = mount(editHost(step, log))
    expect(w.find('.media.empty').text()).toContain('Видео или фото')
    const ta = w.find('.word b textarea'); expect((ta.element as HTMLTextAreaElement).value).toBe('hello')
    await ta.setValue('hi'); expect(step.word).toBe('hi'); expect(log).toContain('changed')
    await w.find('.media.empty').trigger('click'); expect(log).toContain('pick:video+image::')
    await w.find('.cf button').trigger('click'); expect(log).toContain('cards:intro')
    expect(w.find('.foot').exists()).toBe(false)
  })
  it('Выбери ответ: кружок — верный, ✕ — убрать вариант, «＋» — добавить', async () => {
    const step: any = reactive({ id: 'c', kind: 'choice', ask: 'audio', show: 'pics', ans: 0, opts: [{ w: 'cat' }, { w: 'dog' }] }), log: string[] = []
    const w = mount(editHost(step, log))
    expect(w.findAll('.op')).toHaveLength(2); expect(w.findAll('.op')[0].classes()).toContain('right')
    await w.findAll('.op .rad')[1].trigger('click'); expect(step.ans).toBe(1)
    await w.findAll('.op .cx')[0].trigger('click'); expect(step.opts.map((o: any) => o.w)).toEqual(['dog']); expect(step.ans).toBe(0)
    await w.find('.cf button').trigger('click'); expect(step.opts).toHaveLength(2)
    expect(w.find('.xa-row .xe').text()).toContain('Звук вопроса')
  })
  it('Подсказка: строка таблицы правится, «＋ Строка» добавляет, ✕ убирает', async () => {
    const step: any = reactive({ id: 't', kind: 'tip', text: 'Rule', opts: [{ w: 'Hi!', t: 'Привет!' }] }), log: string[] = []
    const w = mount(editHost(step, log))
    expect(w.find('[contenteditable]').exists()).toBe(true)
    await w.find('.tr textarea').setValue('Hello!'); expect(step.opts[0].w).toBe('Hello!')
    await w.find('.cf button').trigger('click'); expect(step.opts).toHaveLength(2)
    await nextTick(); await w.findAll('.tr .rx')[1].trigger('click'); expect(step.opts).toHaveLength(1)
  })
})

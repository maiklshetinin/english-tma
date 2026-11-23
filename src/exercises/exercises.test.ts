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
  it('все 10 типов — шаблоны, и книжные тоже', () => { for (const k of Object.keys(KINDS)) expect(exOf({ kind: k })).not.toBeNull(); expect(exOf({ kind: 'gap', bk: 'bkpick', bs: 'page' })).not.toBeNull() })
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

describe('часть 3: Пары, Собери фразу, Повтори', () => {
  it('Пары у ученика: слово, потом перевод — пара зеленеет', async () => {
    const w = mount(LessonPlayer, { props: { steps: [{ id: 'p', kind: 'pairs', pairs: [{ a: 'cat', b: 'кошка' }, { a: 'dog', b: 'собака' }] }], resolve, single: true } })
    const L = w.findAll('.col')[0].findAll('.pr'), R = w.findAll('.col')[1].findAll('.pr')
    expect(L.map(b => b.text())).toEqual(['cat', 'dog'])
    await L[0].trigger('click'); await R.find(b => b.text() === 'кошка')!.trigger('click')
    expect(w.findAll('.col')[0].findAll('.pr')[0].classes()).toContain('ok')
  })
  it('Пары в правке: плашки правятся, ✕ убирает пару, «＋» добавляет', async () => {
    const step: any = reactive({ id: 'p', kind: 'pairs', pairs: [{ a: 'cat', b: 'кошка' }, { a: 'dog', b: 'собака' }] }), log: string[] = []
    const w = mount(editHost(step, log))
    await w.findAll('.col')[1].find('textarea').setValue('кот'); expect(step.pairs[0].b).toBe('кот')
    await w.find('.pr .px').trigger('click'); expect(step.pairs).toHaveLength(1)
    await w.find('.cf button').trigger('click'); expect(step.pairs).toHaveLength(2)
  })
  it('Собери фразу: все слова на линии — «Верно!», фраза и перевод в подвале', async () => {
    const w = mount(LessonPlayer, { props: { steps: [{ id: 'o', kind: 'order', phrase: 'see you', tr: 'увидимся' }], resolve, embedded: true } })
    for (const want of ['see', 'you']) await w.findAll('.pool .chip').find(b => b.text() === want)!.trigger('click')
    expect(w.find('.foot .fb').text()).toContain('Верно!'); expect(w.find('.foot .fb').text()).toContain('увидимся')
  })
  it('Собери фразу в правке: фраза на линии, плашки под ней; перевод — окошком из подвала', async () => {
    const step: any = reactive({ id: 'o', kind: 'order', phrase: 'see you later' }), log: string[] = []
    const w = mount(editHost(step, log))
    expect(w.findAll('.pool .chip').map(c => c.text())).toEqual(['see', 'you', 'later'])
    await w.find('.built textarea').setValue('see you'); expect(w.findAll('.pool .chip')).toHaveLength(2)
    await w.find('.cf button').trigger('click'); await w.find('.cf input').setValue('увидимся'); expect(step.tr).toBe('увидимся')
  })
  it('Повтори: фраза подписью, кнопки ученика; в правке подпись правится, кнопки бледные', async () => {
    const v = mount(LessonPlayer, { props: { steps: [{ id: 's', kind: 'speak', phrase: 'Hello!', image: 'i.jpg', tr: 'Привет' }], resolve, embedded: true } })
    expect(v.find('.media .cap').text()).toBe('Hello!'); expect(v.findAll('.act')).toHaveLength(3); expect(v.find('.said').text()).toContain('Нажмите микрофон')
    const step: any = reactive({ id: 's', kind: 'speak', phrase: 'Hello!', image: 'i.jpg' }), log: string[] = []
    const w = mount(editHost(step, log))
    await w.find('.media .cap textarea').setValue('Hi!'); expect(step.phrase).toBe('Hi!')
    expect(w.find('.acts').classes()).toContain('ro')
  })
})

describe('часть 4: пропуск, ответ, лишнее, распредели и таблица', () => {
  it('Заполни пропуск с вариантами: тап — ответ сразу, фраза целиком в подвале', async () => {
    const w = mount(LessonPlayer, { props: { steps: [{ id: 'g', kind: 'gap', phrase: 'And [you]?', opts: [{ w: 'you' }, { w: 'me' }] }], resolve, single: true } })
    await w.findAll('.pool .chip')[0].trigger('click')
    expect(w.find('.sent .slot').text()).toBe('you'); expect(w.find('.foot .fb').text()).toContain('And you?')
  })
  it('Закончи предложение: вписать, «Проверить»', async () => {
    const w = mount(LessonPlayer, { props: { steps: [{ id: 'g', kind: 'gap', phrase: 'I [am] fine' }], resolve, embedded: true } })
    await w.find('input.slot').setValue('am'); await w.find('.foot .go').trigger('click')
    expect(w.find('.foot').classes()).toContain('good')
  })
  it('Underline «Как в учебнике»: варианты в предложении; в правке — куски и варианты полями', async () => {
    const step: any = reactive({ id: 'u', kind: 'gap', bk: 'bkpick', bs: 'page', phrase: 'Pat [cooks] dinner', opts: [{ w: 'cooks' }, { w: 'cook' }] })
    const v = mount(LessonPlayer, { props: { steps: [step], resolve, single: true } })
    expect(v.findAll('.bko .uo').map(b => b.text())).toEqual(['cooks', 'cook']); expect(v.find('.bkh').text()).toContain('Underline')
    const log: string[] = [], w = mount(editHost(step, log))
    expect(w.find('.bkh input.bn').exists()).toBe(true)
    await w.findAll('.vbkp .vpa')[0].setValue('Tom '); expect(step.phrase).toBe('Tom [cooks] dinner')
    await w.findAll('.vpo .vcr')[1].trigger('click'); expect(step.phrase).toBe('Tom [cook] dinner')
  })
  it('Ответь на вопрос: вопрос и подсказка правятся; пример ответа — в подвале', async () => {
    const step: any = reactive({ id: 'a', kind: 'answer', text: 'What’s your name?', note: 'My name is…' }), log: string[] = []
    const v = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
    expect(v.find('.qq').text()).toBe('What’s your name?'); expect(v.findAll('.two .out')).toHaveLength(2)
    const w = mount(editHost(step, log))
    await w.find('.vqq').setValue('How old are you?'); expect(step.text).toBe('How old are you?')
    expect(w.find('.two').classes()).toContain('ro')
  })
  it('Найди лишнее: плитки; в правке кружок — лишнее, ✕ — убрать', async () => {
    const step: any = reactive({ id: 'o', kind: 'odd', bk: 'odd', opts: [{ w: 'tea' }, { w: 'coffee' }, { w: 'bread' }], ans: 2, mix: false })
    const v = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
    await v.findAll('.ot')[2].trigger('click'); await v.find('.foot .go').trigger('click'); expect(v.find('.foot').classes()).toContain('good')
    const log: string[] = [], w = mount(editHost(step, log))
    await w.findAll('.ot .rad')[0].trigger('click'); expect(step.ans).toBe(0)
    await w.findAll('.ot .cx')[1].trigger('click'); expect(step.opts.map((o: any) => o.w)).toEqual(['tea', 'bread'])
  })
  it('Распредели: фраза в колонку; в правке фразы в своих колонках, «＋ Фраза»', async () => {
    const step: any = reactive({ id: 's', kind: 'sort', bk: 'sort', cols: [{ t: 'A' }, { t: 'B' }], items: [{ w: 'x', c: 0 }, { w: 'y', c: 1 }], mix: false })
    const v = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
    expect(v.find('.foot .fb').text()).toContain('Осталось фраз: 2')
    await v.findAll('.spool .sw')[0].trigger('click'); await v.findAll('.sbox')[0].trigger('click'); expect(v.find('.foot .fb').text()).toContain('Осталось фраз: 1')
    const log: string[] = [], w = mount(editHost(step, log))
    expect(w.findAll('.scols.ed .scol')[1].find('textarea').element.value).toBe('y')
    await w.findAll('.sadd')[0].trigger('click'); expect(step.items).toHaveLength(3)
  })
  it('Заполни таблицу: банк, образцы; в правке клетки и «＋ Строка»', async () => {
    const step: any = reactive({ id: 't', kind: 'sort', bk: 'sort', bs: 'page', tw: true, cols: [{ t: '-s' }, { t: '-es' }], items: [{ w: 'bag', a: 'bags', c: 0, ex: true }, { w: 'box', a: 'boxes', c: 1 }] })
    const v = mount(LessonPlayer, { props: { steps: [step], resolve, embedded: true } })
    expect(v.find('.twb .twe').text()).toBe('bag'); expect(v.findAll('.twi')).toHaveLength(1)
    const log: string[] = [], w = mount(editHost(step, log))
    expect(w.findAll('.etwc .etwa').map(i => (i.element as HTMLInputElement).value)).toEqual(['bags', 'boxes'])
    await w.findAll('.etwk button')[0].trigger('click'); expect(step.rows).toBe(2)
  })
})

describe('часть 5: миниатюра — уменьшенный шаблон экрана', () => {
  it('у каждого шаблона меню — свой экран с «рыбой», нажатия выключены; «Готовый урок» — стопка', async () => {
    const { default: ExerciseMini } = await import('../components/ExerciseMini.vue')
    for (const t of TEMPLATES) {
      const w = mount(ExerciseMini, { props: { id: t.id, size: 'tray', live: true } })          // live — живой экран (так снимают картинки, tools/minis)
      expect(w.find('.mini.xmt .body').classes()).toContain('x-' + t.kind)
      expect(w.find('.mini').attributes('inert')).toBeDefined()
      // обычная плитка — картинка шаблона (public/minis/<id>.webp), живого экрана нет (23.11.2026)
      const im = mount(ExerciseMini, { props: { id: t.id, size: 'tray' } })
      expect(im.find('img.mim').attributes('src')).toContain('minis/' + t.id + '.webp'); expect(im.find('.lp').exists()).toBe(false)
    }
    const pg = mount(ExerciseMini, { props: { id: 'pg_odd', size: 'rail', live: true } })
    expect(pg.find('.lp').classes()).toEqual(expect.arrayContaining(['book', 'bkpg'])); expect(pg.find('.bkh').text()).toContain('Circle')
    expect(mount(ExerciseMini, { props: { id: 'lesson' } }).find('.ms').exists()).toBe(true)
  })
})

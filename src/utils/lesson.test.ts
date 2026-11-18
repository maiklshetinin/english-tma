import { describe, it, expect } from 'vitest'
import { TEMPLATES, BOOK_TPL, tplOf, stepsFromJson, gapParts, sameAnswer, gapAlts, gapOk, gapList, gapFull, newStep, fishStep, fishLesson, stepTitle, stepIssue, stepsOut, keepLocalFiles, cardToIntro, shuffle, stepRefs, stepMin, lessonMin, fmtMin } from './lesson'

describe('интерактивный урок', () => {
  it('новые экраны — с пустыми полями своего типа', () => {
    expect(newStep('intro')).toMatchObject({ kind: 'intro', word: '' })
    expect(newStep('choice')).toMatchObject({ kind: 'choice', ask: 'audio', show: 'pics', opts: [], ans: 0 })
    expect(newStep('pairs')).toMatchObject({ kind: 'pairs', pairs: [] })
  })
  it('подпись на рельсе — слово, иначе название типа', () => {
    expect(stepTitle({ ...newStep('intro'), word: 'go ahead' })).toBe('go ahead')
    expect(stepTitle(newStep('choice'))).toBe('Выбери ответ')
    expect(stepTitle({ ...newStep('pairs'), pairs: [{ a: 'a', b: 'b' }, { a: 'c', b: 'd' }, { a: '', b: 'x' }] })).toBe('2 пары')
  })
  it('что не заполнено', () => {
    expect(stepIssue(newStep('intro'))).not.toBe('')
    expect(stepIssue({ ...newStep('intro'), ...cardToIntro({ front: 'it’s fine', back: 'в порядке' }) })).toBe('')
    const ch = { ...newStep('choice'), opts: [{ w: 'a', image: 'https://x/a.jpg', audio: 'https://x/a.mp3' }, { w: 'b', image: 'https://x/b.jpg' }] }
    expect(stepIssue(ch)).toBe('')
    expect(stepIssue({ ...ch, ans: 1 })).toMatch(/звук/)
    expect(stepIssue({ ...ch, show: 'text', ask: 'tr' })).toMatch(/перевод/)
    expect(stepIssue({ ...newStep('pairs'), pairs: [{ a: 'a', b: 'b' }] })).toMatch(/2 пары/)
  })
  it('файлы «только в браузере» не уходят на сервер, но и не теряются при обновлении от коллеги', () => {
    const s = { ...newStep('intro'), word: 'x', video: 'idb:m1', image: 'https://x/p.jpg' }
    const [o] = stepsOut([s])
    expect(o.video).toBeUndefined(); expect(o.image).toBe('https://x/p.jpg')
    expect(keepLocalFiles([o], [s])![0].video).toBe('idb:m1')
    expect(stepRefs(s)).toEqual(['https://x/p.jpg', 'idb:m1'])
  })
  it('«рыба» — сразу готова к прохождению', () => {
    for (const k of ['intro', 'choice', 'pairs', 'order', 'tip', 'speak', 'gap', 'answer'] as const) expect(stepIssue(fishStep(k))).toBe('')
    for (const t of TEMPLATES) expect(stepIssue(t.make())).toBe('')
    const L = fishLesson(); expect(L).toHaveLength(7); expect(new Set(L.map(s => s.id)).size).toBe(7); expect(L.every(s => !stepIssue(s))).toBe(true)
  })
  it('пропуск в фразе и проверка ответа', () => {
    expect(gapParts('And [you]?')).toEqual({ a: 'And ', gap: 'you', b: '?' })
    expect(gapParts('нет скобок').gap).toBe('')
    expect(sameAnswer(' You ', 'you')).toBe(true); expect(sameAnswer('it\'s', 'it’s')).toBe(true); expect(sameAnswer('yo', 'you')).toBe(false); expect(sameAnswer('', '')).toBe(false)
    expect(stepIssue({ ...newStep('gap'), phrase: '[Hello]!', opts: [{ w: 'Halo' }] })).toMatch(/нет верного/)
  })
  it('перемешивание не теряет элементы', () => {
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4])
  })
})

describe('пропуски по учебнику', () => {
  it('несколько верных через «/» и до двух пропусков', () => {
    expect(gapAlts("isn't/is not")).toEqual(["isn't", 'is not'])
    expect(gapOk('is not', "isn't/is not")).toBe(true); expect(gapOk('isnt', "isn't/is not")).toBe(false)
    expect(gapList('[Does] he [like] it?')).toEqual([{ g: 'Does', i: 0 }, { t: ' he ' }, { g: 'like', i: 1 }, { t: ' it?' }])
    expect(gapFull("It [isn't/is not] cold.")).toBe("It isn't cold.")
    expect(stepIssue({ id: 'x', kind: 'gap', phrase: '[a] [b] [c]' } as any)).toBe('Не больше 2 пропусков')
    expect(stepIssue({ id: 'x', kind: 'gap', phrase: '[Does] he [like] it?' } as any)).toBe('')
  })
})

describe('книжные экраны', () => {
  it('образцы готовы, проверка и JSON', () => {
    expect(tplOf(TEMPLATES.find(t => t.id === 'translate')!.make())).toBe('translate'); expect(tplOf({ id: 'x', kind: 'gap', phrase: 'And [you]?' } as any)).toBe('type')
    expect(tplOf(TEMPLATES.find(t => t.id === 'brackets')!.make())).toBe('brackets'); expect(stepIssue(TEMPLATES.find(t => t.id === 'brackets')!.make())).toBe('')
    for (const id of BOOK_TPL) expect(stepIssue(TEMPLATES.find(t => t.id === id)!.make())).toBe('')
    expect(stepIssue({ id: 'x', kind: 'sort', cols: [{ t: 'A' }, { t: '' }], items: [] } as any)).toBe('Подпишите колонки')
    expect(stepIssue({ id: 'x', kind: 'odd', opts: [{ w: 'a' }, { w: 'b' }], ans: 0 } as any)).toBe('Нужно хотя бы 3 слова')
    const r = stepsFromJson('{"kind":"sort","cols":["A","B"],"items":[{"w":"x","c":5,"k":"g"},{"w":"y"}],"mix":false}')!
    expect(r.steps[0].cols).toEqual([{ t: 'A' }, { t: 'B' }]); expect(r.steps[0].items).toEqual([{ w: 'x', c: 1, k: 'g' }, { w: 'y', c: 0 }]); expect(r.steps[0].mix).toBe(false)
  })
})

describe('время урока', () => {
  it('экран — по типу или своё, урок — сумма вверх до минуты', () => {
    expect(stepMin({ id: 'a', kind: 'intro' })).toBe(0.5)
    expect(stepMin({ id: 'a', kind: 'pairs', min: 3 })).toBe(3)
    expect(lessonMin([])).toBe(0)
    expect(lessonMin([{ id: 'a', kind: 'intro' }])).toBe(1)
    expect(lessonMin([{ id: 'a', kind: 'answer' }, { id: 'b', kind: 'pairs' }, { id: 'c', kind: 'gap' }])).toBe(3)
    expect([fmtMin(0.5), fmtMin(1.5), fmtMin(2)]).toEqual(['½', '1½', '2'])
  })
})

import { twLayout, twCheck } from './lesson'
describe('«Заполни таблицу»', () => {
  const s = TEMPLATES.find(t => t.id === 'sort')!.make()
  it('образцы вписаны, строк хватает на все ответы', () => {
    const L = twLayout(s)
    expect(L.cols[0].ex.map(x => x.a)).toEqual(['bags'])
    expect(L.cols.map(c => c.need)).toEqual([2, 3, 3, 3, 2])
    expect(L.rows).toBe(4); expect(L.bank.length).toBe(15)
  })
  it('порядок в колонке не важен, регистр — по настройке', () => {
    const typed = [['Owls', 'boys'], ['boxes', 'watches', 'tomatos'], ['babies', 'cherries', 'strawberries'], ['knives', 'leaves', 'wolves'], ['men', 'feet']]
    const r = twCheck(s, typed)
    expect(r.ok[0]).toEqual([true, true]); expect(r.ok[1][2]).toBe(false); expect(r.miss).toEqual(['tomatoes']); expect(r.all).toBe(false)
    typed[1][2] = 'tomatoes'; expect(twCheck(s, typed).all).toBe(true)
    expect(twCheck({ ...s, cs: true }, typed).ok[0][0]).toBe(false)
  })
})

import { speechMatch } from './lesson'
describe('«Повтори за диктором» — распознанные слова', () => {
  it('слова фразы подсвечиваются, знаки и регистр не мешают', () => {
    const r = speechMatch('Go ahead!', 'go ahead')
    expect(r.words.map(x => x.ok)).toEqual([true, true]); expect(r.score).toBe(1)
  })
  it('сокращения = полные формы, недосказанное — не засчитано', () => {
    expect(speechMatch("I'm fine, thanks.", 'I am fine').words.map(x => x.ok)).toEqual([true, true, false])
    expect(speechMatch('See you later', '').score).toBe(0)
  })
})

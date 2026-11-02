import { describe, it, expect } from 'vitest'
import { newStep, fishStep, fishLesson, stepTitle, stepIssue, stepsOut, keepLocalFiles, cardToIntro, shuffle, stepRefs } from './lesson'

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
    for (const k of ['intro', 'choice', 'pairs'] as const) expect(stepIssue(fishStep(k))).toBe('')
    const L = fishLesson(); expect(L).toHaveLength(5); expect(new Set(L.map(s => s.id)).size).toBe(5); expect(L.every(s => !stepIssue(s))).toBe(true)
  })
  it('перемешивание не теряет элементы', () => {
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4])
  })
})

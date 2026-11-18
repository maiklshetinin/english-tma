// «Повторить эти слова» (Review, 18.11.2026 — как «Review these words» в Busuu): короткая тренировка из выбранных в словаре слов
// (фильтр: избранное, слабые, все…). Экраны — «Выбери ответ»: перевод → выбрать английское слово (нет перевода — на слух).
// Ответы пишутся в словарь как в уроке (stores/review.ts recordStep): память меняется только у загаданного слова, не у вариантов.
import type { RItem } from './review'
import type { Step } from './lesson'

export const PRACTICE_MAX = 10
const isWordItem = (x: RItem) => x.kind === 'word' || x.kind === 'phrase'
/** Можно ли спросить слово: есть перевод или звук */
export const askable = (x: RItem) => isWordItem(x) && !!(x.tr?.trim() || x.audio)

export function practiceSteps(list: RItem[], pool: RItem[], rnd: () => number = Math.random): Step[] {
  const words = pool.filter(isWordItem), out: Step[] = []
  const shuffle = <T>(a: T[]) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
  for (const x of list.filter(askable)) {
    if (out.length >= PRACTICE_MAX) break
    const lc = x.text.toLowerCase(), seen = new Set([lc])
    const same = shuffle(words.filter(w => w.kind === x.kind)), other = shuffle(words.filter(w => w.kind !== x.kind))
    const dist = [...same, ...other].filter(w => { const k = w.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 3)
    if (!dist.length) continue                                            // в словаре одно слово — спросить не из чего
    const opts = shuffle([{ w: x.text, t: x.tr || undefined, audio: x.audio, image: x.image }, ...dist.map(d => ({ w: d.text }))])
    const ask = x.tr?.trim() ? 'tr' : 'audio'
    out.push({ id: 'pr-' + out.length, kind: 'choice', head: ask === 'tr' ? 'Как это по-английски?' : 'Что прозвучало?', ask, show: 'text',
      opts: opts.map(o => Object.fromEntries(Object.entries(o).filter(([, v]) => v))), ans: opts.findIndex(o => o.w === x.text) } as Step)
  }
  return out
}

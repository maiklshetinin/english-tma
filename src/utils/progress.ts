// «Аналитика прогресса» (вкладка Review «Грамматика и навыки», 18.11.2026): всё — из того, что уже есть, ничего не вводится.
//  • Навыки — наши теги экранов (Чтение R, Слух L, Письмо W, Речь S) и темы грамматики: память FSRS из словаря Review
//    (шанс вспомнить, сколько дней помнит). Прошлые месяцы — по снимкам сервера (review.mon: память после последнего ответа
//    в том месяце; память меняется только от ответов, поэтому на конец месяца считается точно).
//  • Темп — пройденные уроки (сервер: GET /progress/stats → lessons: когда, сколько верно, сколько времени, экраны коротко);
//    теги — по экранам урока (utils/lesson.ts), темы — по уроку (его тема или по названию, utils/skills.ts).
import type { Step } from './lesson'
import { skillsOf, SKILLS, topicById, detectTopic, type SkillId } from './skills'
import { stateOf, type RItem, type RState } from './review'

export interface StepBrief { id: string; kind: string; show?: string; bk?: string; bs?: string; phrase?: string; o?: number; tn?: 1; m?: 1 }
export interface LessonDone { course: string; courseTitle: string; id: string; title: string; unit: string; topic?: string; at: number; ok: number; all: number; sec: number; miss: string[]; steps: StepBrief[] }
export interface Snap { f: NonNullable<RItem['f']>; t: number; ok: boolean | null }
export type Months = Record<string, Record<string, Snap>>
export const TAGS = Object.keys(SKILLS) as SkillId[]

const H3 = 3 * 3_600_000                                         // месяцы — по Москве, как на сервере (server/review.ts monthOf)
export const monthOf = (t: number) => new Date(t + H3).toISOString().slice(0, 7)
/** Последняя миллисекунда месяца (по Москве) */
export const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return Date.UTC(y, m, 1) - H3 - 1 }
export const prevMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
const MN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']
const MD = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю']
const mi = (ym: string) => Number(ym.slice(5, 7)) - 1
export const monthName = (ym: string) => MN[mi(ym)]
export const monthIn = (ym: string) => MP[mi(ym)]          // «в ноябре»
export const monthTo = (ym: string) => MD[mi(ym)]          // «к октябрю»

/** Экран урока (коротко, с сервера) → такой экран, по которому узнаётся шаблон и его теги */
export const briefStep = (b: StepBrief): Step => ({ id: b.id, kind: b.kind, ...(b.show ? { show: b.show } : {}), ...(b.bk ? { bk: b.bk } : {}), ...(b.bs ? { bs: b.bs } : {}),
  ...(b.phrase ? { phrase: b.phrase } : {}), ...(b.o ? { opts: Array.from({ length: b.o }, () => ({ w: '' })) } : {}), ...(b.tn ? { tn: '·' } : {}), ...(b.m ? { audio: '·' } : {}) } as Step)
/** Теги экранов урока: сколько упражнений каждого тега (у экрана с двумя тегами — оба) */
export function tagCount(ls: LessonDone[]): Record<SkillId, number> {
  const n = { R: 0, L: 0, W: 0, S: 0 } as Record<SkillId, number>
  for (const l of ls) for (const b of l.steps) for (const k of skillsOf(briefStep(b))) n[k]++
  return n
}
export const hasTag = (l: LessonDone, k: SkillId) => l.steps.some(b => skillsOf(briefStep(b)).includes(k))
export const lessonsIn = (ls: LessonDone[], ym: string, tag?: SkillId | null) => ls.filter(l => monthOf(l.at) === ym && (!tag || hasTag(l, tag)))

/** Все месяцы, где что-то было (уроки или снимки), и текущий — по порядку */
export function monthsOf(ls: LessonDone[], mon: Months, now = Date.now()): string[] {
  const s = new Set<string>([monthOf(now), ...ls.map(l => monthOf(l.at)), ...Object.keys(mon)])
  return [...s].sort()
}

/** Память навыка / темы на конец месяца ym (текущий месяц — сейчас, по словарю). null — ещё не было ответов */
export function stateAt(key: string, ym: string, items: Record<string, RItem>, mon: Months, cfg: { retention: number; maxDays: number }, now = Date.now()): RState | null {
  if (ym >= monthOf(now)) { const x = items[key]; if (!x) return null; const st = stateOf(x, now, cfg); return st.isNew ? null : st }
  const m = Object.keys(mon).filter(k => k <= ym && mon[k][key]).sort().pop(); if (!m) return null
  const sn = mon[m][key], st = stateOf({ f: sn.f, hist: [{ t: sn.t, ok: sn.ok, ex: '' }] }, monthEnd(ym), cfg)
  return st.isNew ? null : st
}

/** Теги темы: теги экранов уроков с этой темой (тема урока — его поле или по названию урока / Chapter) */
export function topicTags(ls: LessonDone[]): Record<string, SkillId[]> {
  const o: Record<string, Set<SkillId>> = {}
  for (const l of ls) {
    const t = l.topic === 'none' ? undefined : topicById(l.topic) ?? detectTopic(l.title, l.unit); if (!t) continue
    const s = (o['topic:' + t.id] ??= new Set())
    for (const b of l.steps) for (const k of skillsOf(briefStep(b))) s.add(k)
  }
  return Object.fromEntries(Object.entries(o).map(([k, s]) => [k, TAGS.filter(t => s.has(t))]))
}

/** «помнит ~16 дн» / «~2 мес» / «3+ мес» — сколько дней держится память (стабильность FSRS) */
export const memText = (days: number) => days >= 90 ? 'помнит 3+ мес' : days >= 30 ? `помнит ~${Math.round(days / 30)} мес` : `помнит ~${Math.max(1, Math.round(days))} дн`
export const lessonsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'урок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'урока' : 'уроков')
export const hm = (sec: number) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}` : `${m} мин` }

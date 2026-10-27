// Цена урока на его время. Цена у ученика меняется (server/students.ts → setPrice), а прошедшие уроки пересчитываться не должны,
// поэтому цену урока берём из истории: последняя запись, начавшаяся не позже урока.
import type { Student } from '../../server/types'

const pad = (n: number) => String(n).padStart(2, '0')
export const lessonKey = (date: string, hour: number) => `${date}T${pad(hour)}`     // тот же формат, что у PriceChange.from

export function priceAt(s: Pick<Student, 'price' | 'priceHistory'> | undefined, date: string, hour: number): number {
  if (!s) return 0
  const key = lessonKey(date, hour)
  let price: number | undefined
  for (const c of s.priceHistory ?? []) if (c.from <= key) price = c.price      // история идёт по возрастанию from; '' меньше любого ключа
  return price ?? s.price ?? 0
}

// ───────────── Деньги в расписании ─────────────
// «Факт» — только проведённые уроки, по цене, зафиксированной при отметке (включая учеников, удалённых навсегда).
// «План» — все уроки: проведённые — как в факте, запланированные — по цене каждого ученика на время урока.
type LessonLike = { date: string; hour: number; studentIds: string[]; done?: boolean; prices?: Record<string, number> }
type Find = (id: string) => Pick<Student, 'price' | 'priceHistory'> | undefined

export function lessonMoney(l: LessonLike, find: Find): { real: number; plan: number } {
  if (l.done) { const real = Object.values(l.prices ?? {}).reduce((a, b) => a + (Number(b) || 0), 0); return { real, plan: real } }
  return { real: 0, plan: l.studentIds.reduce((sum, id) => sum + priceAt(find(id), l.date, l.hour), 0) }
}
/** Сумма по урокам (день, неделя): { real, plan }. */
export function sumMoney(lessons: LessonLike[], find: Find): { real: number; plan: number } {
  return lessons.reduce((acc, l) => { const m = lessonMoney(l, find); return { real: acc.real + m.real, plan: acc.plan + m.plan } }, { real: 0, plan: 0 })
}
const round2 = (n: number) => Math.round(n * 100) / 100
/** 12 500 → «12 500»; дробные — до копеек. */
export const fmtMoney = (n: number) => round2(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
/** Коротко для узких ячеек: до 10 000 — как есть, дальше «12,5к». */
export const fmtMoneyShort = (n: number) => (n < 10000 ? fmtMoney(n) : `${(Math.round(n / 100) / 10).toLocaleString('ru-RU')}к`)
/** Совсем коротко для телефона: от 1 000 — «2,5к». */
export const fmtMoneyK = (n: number) => (n < 1000 ? fmtMoney(n) : `${(Math.round(n / 100) / 10).toLocaleString('ru-RU')}к`)

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
// «Потеряно» — ученики, отменившие урок (canceled): они не платят и не входят ни в факт, ни в план; считаем по их цене на время урока.
type LessonLike = { date: string; hour: number; studentIds: string[]; done?: boolean; prices?: Record<string, number>; canceled?: Record<string, string> }
type Find = (id: string) => Pick<Student, 'price' | 'priceHistory'> | undefined

export type Money = { real: number; plan: number; lost: number }
export function lessonMoney(l: LessonLike, find: Find): Money {
  const off = (id: string) => !!l.canceled?.[id]
  const lost = l.studentIds.filter(off).reduce((sum, id) => sum + priceAt(find(id), l.date, l.hour), 0)
  if (l.done) { const real = Object.entries(l.prices ?? {}).filter(([id]) => !off(id)).reduce((a, [, b]) => a + (Number(b) || 0), 0); return { real, plan: real, lost } }
  return { real: 0, plan: l.studentIds.filter((id) => !off(id)).reduce((sum, id) => sum + priceAt(find(id), l.date, l.hour), 0), lost }
}
/** Сумма по урокам (день, неделя): { real, plan, lost }. */
export function sumMoney(lessons: LessonLike[], find: Find): Money {
  return lessons.reduce((acc, l) => { const m = lessonMoney(l, find); return { real: acc.real + m.real, plan: acc.plan + m.plan, lost: acc.lost + m.lost } }, { real: 0, plan: 0, lost: 0 })
}
const round2 = (n: number) => Math.round(n * 100) / 100
/** 12 500 → «12 500»; дробные — до копеек. */
export const fmtMoney = (n: number) => round2(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
/** Коротко для узких ячеек: до 10 000 — как есть, дальше «12,5к». */
export const fmtMoneyShort = (n: number) => (n < 10000 ? fmtMoney(n) : `${(Math.round(n / 100) / 10).toLocaleString('ru-RU')}к`)
/** Совсем коротко для телефона: от 1 000 — «2,5к». */
export const fmtMoneyK = (n: number) => (n < 1000 ? fmtMoney(n) : `${(Math.round(n / 100) / 10).toLocaleString('ru-RU')}к`)

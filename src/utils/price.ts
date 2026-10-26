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

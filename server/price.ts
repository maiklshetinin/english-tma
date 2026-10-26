// Цена урока на его время (серверная копия src/utils/price.ts: из server/ во фронт ничего, кроме типов, не попадает).
// История цен — PriceChange[] в записи ученика; ключ урока 'YYYY-MM-DDTHH' сравнивается со строкой from.
import type { PriceChange } from './types.js'

export const lessonKey = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}`

export function priceAt(s: { price?: number; priceHistory?: PriceChange[] } | undefined, date: string, hour: number): number {
  if (!s) return 0
  const key = lessonKey(date, hour)
  let price: number | undefined
  for (const c of s.priceHistory ?? []) if (c.from <= key) price = c.price
  return price ?? s.price ?? 0
}

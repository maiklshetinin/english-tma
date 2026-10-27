// Даты и подписи. Все даты — локальные строки 'YYYY-MM-DD' (без сдвига UTC).
import { ref } from 'vue'

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Дата со сдвигом в днях от сегодняшней. */
export const iso = (off = 0): string => { const d = new Date(); d.setDate(d.getDate() + off); return ymd(d) }
export const hh = (h: number, m = 0): string => `${pad(h)}:${pad(m || 0)}`        // 18 → «18:00», (18, 30) → «18:30»

export const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
export const HOURS = Array.from({ length: 15 }, (_, i) => i + 8)       // 08:00 … 22:00
export const nowTick = ref(Date.now()); setInterval(() => { nowTick.value = Date.now() }, 60000)

/** Семь дат недели с понедельника; offsetWeeks — сдвиг в неделях. */
export function weekDates(offsetWeeks = 0): string[] {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return ymd(x) })
}
const dm = (d: string) => `${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}`
export const weekRange = (dates: string[]): string => `${dm(dates[0])} — ${dm(dates[6])}`
export const weekTitle = (off: number): string => ({ '-1': 'Прошлая неделя', 0: 'Эта неделя', 1: 'Следующая неделя' } as Record<string, string>)[off] ?? 'Неделя'
export const fmtSlot = (date: string, hour: number, minute = 0): string => `${DAYS[(new Date(date + 'T00:00').getDay() + 6) % 7]} ${dm(date)}, ${hh(hour, minute)}`
export const fmtDate = (d: string): string => new Date(d + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
export const relDay = (d: string): string => {
  const n = Math.round((new Date(d + 'T00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5)
  return n < 0 ? 'Прошло' : n === 0 ? 'Сегодня' : n === 1 ? 'Завтра' : `Через ${n} дн.`
}

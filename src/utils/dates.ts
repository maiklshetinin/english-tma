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
export const nowTick = ref(Date.now()); setInterval(() => { nowTick.value = Date.now() }, 15000)      // «сейчас» обновляется каждые 15 с (минуты в текущем часе)

// ───────── Часовой пояс расписания ─────────
// «Сегодня», текущий час и даты недель считаются по выбранному поясу, а не по настройкам компьютера. По умолчанию — Москва.
// Выбор хранится на этом устройстве (localStorage). Уроки хранятся как дата + час «по часам преподавателя» и не пересчитываются.
export const TIMEZONES: { id: string; label: string; short: string }[] = [
  { id: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)', short: 'КЛД' },
  { id: 'Europe/Moscow', label: 'Москва (UTC+3)', short: 'МСК' },
  { id: 'Europe/Samara', label: 'Самара (UTC+4)', short: 'САМ' },
  { id: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)', short: 'ЕКБ' },
  { id: 'Asia/Omsk', label: 'Омск (UTC+6)', short: 'ОМС' },
  { id: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)', short: 'НСК' },
  { id: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)', short: 'ИРК' },
  { id: 'Asia/Yakutsk', label: 'Якутск (UTC+9)', short: 'ЯКТ' },
  { id: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)', short: 'ВЛД' },
  { id: 'Europe/Minsk', label: 'Минск (UTC+3)', short: 'МИН' },
  { id: 'Europe/Kyiv', label: 'Киев', short: 'КИЕ' },
  { id: 'Europe/Warsaw', label: 'Варшава', short: 'ВАР' },
  { id: 'Europe/Berlin', label: 'Берлин', short: 'БЕР' },
  { id: 'Europe/London', label: 'Лондон', short: 'ЛОН' },
  { id: 'Asia/Almaty', label: 'Алматы (UTC+5)', short: 'АЛМ' },
  { id: 'Asia/Tbilisi', label: 'Тбилиси (UTC+4)', short: 'ТБС' },
  { id: 'Asia/Dubai', label: 'Дубай (UTC+4)', short: 'ДУБ' },
]
export const DEFAULT_TZ = 'Europe/Moscow'
const TZ_KEY = 'tutor.tz'
const readTz = (): string => { try { const v = localStorage.getItem(TZ_KEY); return v && TIMEZONES.some((z) => z.id === v) ? v : DEFAULT_TZ } catch { return DEFAULT_TZ } }
export const tz = ref(readTz())
export function setTz(id: string) { tz.value = id; try { localStorage.setItem(TZ_KEY, id) } catch { /* приватный режим — просто не запомним */ } }
export const tzShort = (id = tz.value) => TIMEZONES.find((z) => z.id === id)?.short ?? id

/** Дата, час и минута «сейчас» в поясе расписания. */
export function nowIn(zone = tz.value, at = Date.now()): { date: string; hour: number; minute: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(at)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) }
}
/** Сегодня ('YYYY-MM-DD') в поясе расписания. */
export const todayYmd = (): string => nowIn().date
const addDaysYmd = (s: string, n: number): string => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/** Семь дат недели с понедельника; offsetWeeks — сдвиг в неделях. */
export function weekDates(offsetWeeks = 0): string[] {
  const t = todayYmd(), dow = (new Date(t + 'T12:00:00Z').getUTCDay() + 6) % 7      // 0 = понедельник
  const mon = addDaysYmd(t, -dow + offsetWeeks * 7)
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(mon, i))
}
const dm = (d: string) => `${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}`
export const weekRange = (dates: string[]): string => `${dm(dates[0])} — ${dm(dates[6])}`
export const weekTitle = (off: number): string => ({ '-1': 'Прошлая неделя', 0: 'Эта неделя', 1: 'Следующая неделя' } as Record<string, string>)[off] ?? 'Неделя'
export const fmtSlot = (date: string, hour: number, minute = 0): string => `${DAYS[(new Date(date + 'T00:00').getDay() + 6) % 7]} ${dm(date)}, ${hh(hour, minute)}`
export const fmtDate = (d: string): string => new Date(d + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
export const relDay = (d: string): string => {
  const n = Math.round((new Date(d + 'T12:00:00Z').getTime() - new Date(todayYmd() + 'T12:00:00Z').getTime()) / 864e5)
  return n < 0 ? 'Прошло' : n === 0 ? 'Сегодня' : n === 1 ? 'Завтра' : `Через ${n} дн.`
}

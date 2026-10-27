// «В сети», как в Telegram: ученик открыт в приложении (оно раз в минуту сообщает серверу, POST /me/seen).
// Зелёная точка — если последняя отметка была меньше 2,5 минут назад. nowTick обновляется каждые 15 с, поэтому точка гаснет сама.
import { nowTick } from './dates'

export const ONLINE_MS = 150_000
export const isOnline = (s: { lastSeenAt?: number | null } | null | undefined): boolean => !!s?.lastSeenAt && nowTick.value - s.lastSeenAt < ONLINE_MS

const pad = (n: number) => String(n).padStart(2, '0')
/** Подпись как в Telegram: «в сети» / «был(а) 5 мин назад» / «был(а) сегодня в 14:20» / «был(а) вчера в 21:17» / «был(а) 12.10». */
export function seenLabel(s: { lastSeenAt?: number | null } | null | undefined): string {
  if (!s?.lastSeenAt) return ''
  const now = nowTick.value, t = s.lastSeenAt, min = Math.floor((now - t) / 60_000)
  if (now - t < ONLINE_MS) return 'в сети'
  if (min < 60) return `был(а) ${min} мин назад`
  const d = new Date(t), today = new Date(now), y = new Date(now - 86_400_000), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === today.toDateString()) return `был(а) сегодня в ${hm}`
  if (d.toDateString() === y.toDateString()) return `был(а) вчера в ${hm}`
  return `был(а) ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}

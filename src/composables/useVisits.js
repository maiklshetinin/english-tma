// Лог заходов (19.11.2026) — всегда, без выключателя: отметка «открыл приложение» при запуске и при возвращении после 30+ минут
// в фоне. С чего: телефон или компьютер, Telegram или сайт в браузере (+ платформа Telegram). Одна короткая запись — server/visits.ts.
import { apiFetch, tg } from '../firebase'

const AWAY = 30 * 60_000
const pad = (n) => String(n).padStart(2, '0')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
/** Устройство: в Telegram — по платформе, в браузере — сенсорный узкий экран = телефон */
export function device() {
  const pf = tg?.initData ? String(tg.platform || '') : ''
  const phone = pf ? /^(ios|android|android_x)$/.test(pf) : !!matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820
  return { dev: phone ? 'phone' : 'desktop', app: tg?.initData ? 'tg' : 'web', pf }
}
const send = () => apiFetch('/me/visit', { method: 'POST', body: JSON.stringify({ day: today(), ...device() }), keepalive: true }).catch(() => { /* нет сети — не страшно */ })

let started = false, hiddenAt = 0
/** После входа: отметить заход и следить за возвращениями */
export function startVisits() {
  if (started) return
  started = true
  send()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    if (hiddenAt && Date.now() - hiddenAt >= AWAY) send()
    hiddenAt = 0
  })
}

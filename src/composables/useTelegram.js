// Обёртка над Telegram WebApp SDK. Вне Telegram (браузер) безопасно работает "вхолостую".
import { tryWideWindow } from './useWindowSize'
const tg = window.Telegram?.WebApp

// Тема: светлая/тёмная по Telegram или по системе. Цвета бренда фиксированные (Duolingo), меняются только поверхности.
const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
function applyTheme() {
  const dark = tg?.colorScheme ? tg.colorScheme === 'dark' : !!mq?.matches
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  try { tg?.setHeaderColor?.(dark ? '#131f24' : '#ffffff'); tg?.setBackgroundColor?.(dark ? '#131f24' : '#ffffff') } catch { /* старые версии клиента */ }
}
export function initTelegram() {
  applyTheme(); mq?.addEventListener?.('change', applyTheme)
  if (!tg) return
  tg.ready()
  tg.expand()
  tg.onEvent?.('themeChanged', applyTheme)
  tryWideWindow()
}
export const useTelegram = () => ({
  tg,
  user: tg?.initDataUnsafe?.user ?? { first_name: 'Гость' },
  haptic: (type = 'light') => tg?.HapticFeedback?.impactOccurred(type),
  notify: (msg) => (tg?.showAlert ? tg.showAlert(msg) : alert(msg)),
  openChat: (username) => {
    const url = `https://t.me/${username}`
    tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, '_blank')
  },
})

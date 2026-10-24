// Обёртка над Telegram WebApp SDK. Вне Telegram (браузер) безопасно работает "вхолостую".
const tg = window.Telegram?.WebApp

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()
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

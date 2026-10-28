// Обёртка над Telegram WebApp SDK. Вне Telegram (браузер) безопасно работает "вхолостую".
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
  // «Поделиться» текстом: Telegram открывает выбор чата, текст подставляется в поле сообщения
  shareText: (text) => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(text)}`
    tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, '_blank')
  },
  // Скачать файл: в Telegram на телефоне — системное «Поделиться / Сохранить» (обычная загрузка там не работает), иначе — загрузка браузера
  saveFile: async (blob, name) => {
    const file = new File([blob], name, { type: blob.type })
    if (/^(ios|android)$/.test(tg?.platform || '') && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return } catch (e) { if (e?.name === 'AbortError') return }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  },
})

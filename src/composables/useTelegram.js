// Обёртка над Telegram WebApp SDK. Вне Telegram (браузер) безопасно работает "вхолостую".
import { ref } from 'vue'
import { say } from './useDialog'
const tg = window.Telegram?.WebApp

// Тема: светлая/тёмная. По умолчанию — как в Telegram или в системе; кнопка темы вверху (ThemeToggle) выбирает сама
// и запоминает выбор в браузере. Цвета бренда фиксированные (Duolingo), меняются только поверхности.
const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
const TK = 'tma.theme'
let pref = (() => { try { return localStorage.getItem(TK) || 'auto' } catch { return 'auto' } })()      // auto | light | dark
export const theme = ref('light')
function applyTheme() {
  const sys = tg?.colorScheme ? tg.colorScheme === 'dark' : !!mq?.matches
  const dark = pref === 'dark' || (pref === 'auto' && sys)
  theme.value = dark ? 'dark' : 'light'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  try { tg?.setHeaderColor?.(dark ? '#131f24' : '#ffffff'); tg?.setBackgroundColor?.(dark ? '#131f24' : '#ffffff') } catch { /* старые версии клиента */ }
}
/** Переключить светлую / тёмную (выбор запоминается; «как в системе» — снова, если стереть выбор) */
export function toggleTheme() { pref = theme.value === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(TK, pref) } catch { /* приватный режим */ } applyTheme() }
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
  notify: (msg) => say(msg),                                // своё окно в стиле приложения (и в Telegram, и в браузере)
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

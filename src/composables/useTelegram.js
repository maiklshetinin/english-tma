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
// Вибрация (виброотклик Telegram, 16.11.2026): включена по умолчанию, выключается в Профиле; выбор запоминается на устройстве.
// Работает только в Telegram на телефоне — в браузере и на компьютере тихо ничего не делает.
const HK = 'tma.haptic'
export const hapticOn = ref((() => { try { return localStorage.getItem(HK) !== '0' } catch { return true } })())
export function setHaptic(on) {
  hapticOn.value = !!on; try { localStorage.setItem(HK, on ? '1' : '0') } catch { /* приватный режим */ }
  if (on) try { tg?.HapticFeedback?.notificationOccurred('success') } catch { /* старый клиент */ }      // включили — сразу чувствуется, как это
}
// Свайп вниз (19.11.2026): по умолчанию заблокирован — не сворачивает приложение (Bot API 7.7+: мешал листать таблицу и тянуть уроки;
// закрыть — кнопкой «Закрыть» / свайпом по шапке Telegram). В Профиле можно выключить блокировку, чтобы сравнить; выбор — на устройстве.
const SK = 'tma.swipeLock'
export const swipeLock = ref((() => { try { return localStorage.getItem(SK) !== '0' } catch { return true } })())
function applySwipe() { try { swipeLock.value ? tg?.disableVerticalSwipes?.() : tg?.enableVerticalSwipes?.() } catch { /* старый клиент Telegram — свайп как есть */ } }
export function setSwipeLock(on) { swipeLock.value = !!on; try { localStorage.setItem(SK, on ? '1' : '0') } catch { /* приватный режим */ } applySwipe() }
const hf = () => (hapticOn.value ? tg?.HapticFeedback : null)
const safe = (f) => { try { f() } catch { /* старый клиент Telegram */ } }
export function initTelegram() {
  applyTheme(); mq?.addEventListener?.('change', applyTheme)
  if (!tg) return
  tg.ready()
  tg.expand()
  applySwipe()          // блокировка свайпа вниз — как выбрано в Профиле (по умолчанию включена)
  tg.onEvent?.('themeChanged', applyTheme)
}
export const useTelegram = () => ({
  tg,
  user: tg?.initDataUnsafe?.user ?? { first_name: 'Гость' },
  haptic: (type = 'light') => safe(() => hf()?.impactOccurred(type)),                    // «тук»: light / medium / heavy / rigid / soft
  hapticResult: (ok) => safe(() => hf()?.notificationOccurred(ok ? 'success' : 'error')),  // ответ: верно — мягкий отклик, ошибка — двойная «дрожь»
  hapticTick: () => safe(() => hf()?.selectionChanged()),                                // самый лёгкий «щелчок»
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

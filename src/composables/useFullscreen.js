// Окно Telegram Desktop для мини-приложений узкое, и размер им управляет клиент (expand() там ничего не делает).
// Обойти можно полноэкранным режимом (Bot API 8.0+): на компьютере запрашиваем его сами при запуске,
// и тогда включается широкая раскладка (панель учеников справа). Выключатель — в «Профиле»; выбор запоминается.
// Телефоны не трогаем: там приложение и так открывается шторкой на весь экран.
import { reactive } from 'vue'

const tg = window.Telegram?.WebApp
const KEY = 'tma:fullscreen'
const DESKTOP = ['tdesktop', 'macos']                     // Telegram Desktop (Windows/Linux) и нативный macOS
export const fs = reactive({
  available: !!tg && DESKTOP.includes(tg.platform) && typeof tg.requestFullscreen === 'function' && !!tg.isVersionAtLeast?.('8.0'),
  on: !!tg?.isFullscreen,
})
const wanted = () => { try { return localStorage.getItem(KEY) !== '0' } catch { return true } }   // по умолчанию включено
const remember = (v) => { try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* нет хранилища — не страшно */ } }

export function initFullscreen() {
  if (!fs.available) return
  tg.onEvent('fullscreenChanged', () => { fs.on = !!tg.isFullscreen })
  tg.onEvent('fullscreenFailed', () => { fs.on = false })   // клиент отказал (напр. UNSUPPORTED) — остаёмся в обычном окне
  if (wanted()) { try { tg.requestFullscreen() } catch { /* старый клиент */ } }
}
export function toggleFullscreen() {
  if (!fs.available) return
  try {
    if (tg.isFullscreen) { tg.exitFullscreen(); remember(false) } else { tg.requestFullscreen(); remember(true) }
  } catch { /* клиент не смог переключить */ }
}

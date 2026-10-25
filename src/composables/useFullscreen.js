// Окно Telegram Desktop для мини-приложений узкое, и размер/положение окна задаёт сам клиент (expand() там ничего не делает;
// «широкого окна с кнопками свернуть/развернуть» API не даёт). Единственное, что есть, — полноэкранный режим (Bot API 8.0+):
// он включает широкую раскладку, но на Windows перекрывает панель задач. Поэтому сам он НЕ включается — только кнопкой в «Профиле».
// Выбор запоминается: если полный экран был включён, при следующем запуске он включится снова. Телефоны не трогаем.
import { reactive } from 'vue'

const tg = window.Telegram?.WebApp
const KEY = 'tma:fullscreen'
const DESKTOP = ['tdesktop', 'macos']                     // Telegram Desktop (Windows/Linux) и нативный macOS
export const fs = reactive({
  available: !!tg && DESKTOP.includes(tg.platform) && typeof tg.requestFullscreen === 'function' && !!tg.isVersionAtLeast?.('8.0'),
  on: !!tg?.isFullscreen,
})
const wanted = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }   // по умолчанию выключено
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

// ЭКСПЕРИМЕНТ: на компьютере пробуем задать окну мини-приложения «широкий» размер (до 1600×800, не больше 85%×80% рабочей области —
// панель задач не перекрывается). Окно принадлежит Telegram, и resizeTo в нём может не сработать — тогда ничего не происходит.
// Если у вас размер не меняется, удалите этот файл и вызов в useTelegram.js.
const tg = window.Telegram?.WebApp
export function tryWideWindow() {
  if (!tg || !['tdesktop', 'macos'].includes(tg.platform) || window.innerWidth >= 1000) return
  try {
    const w = Math.min(1600, Math.round(screen.availWidth * 0.85)), h = Math.min(800, Math.round(screen.availHeight * 0.8))
    window.resizeTo(w, h)
    window.moveTo(Math.round((screen.availWidth - w) / 2), Math.round((screen.availHeight - h) / 2))
  } catch { /* клиент не разрешил — остаёмся в обычном окне */ }
}

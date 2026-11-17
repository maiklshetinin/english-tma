// Новые сообщения чата — на вкладке браузера (17.11.2026): «(3) Tutor TMA» и красный кружок с числом на значке вкладки.
// Блокирующее сообщение разработчика — «🔒 Нужно ответить · Tutor TMA». Нет новых — как было.
import { watch } from 'vue'
import { unreadCount, pendingBlocks } from './useNotes'

let base = '', icons = [], orig = [], img = null
const icoLinks = () => [...document.querySelectorAll('link[rel~="icon"]')]

function badgeIcon(n) {
  if (!icons.length) { icons = icoLinks(); orig = icons.map((l) => l.href) }
  if (!n) { icons.forEach((l, i) => { l.href = orig[i] }); return }
  const draw = () => {
    const c = document.createElement('canvas'); c.width = c.height = 64
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64)
    x.beginPath(); x.arc(44, 20, 19, 0, Math.PI * 2); x.fillStyle = '#ff4b4b'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke()
    x.fillStyle = '#fff'; x.font = '900 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n > 9 ? '9+' : String(n), 44, 21)
    const url = c.toDataURL('image/png'); icons.forEach((l) => { l.href = url })
  }
  if (img?.complete && img.naturalWidth) return draw()
  img = new Image(); img.onload = draw; img.src = orig[0]
}

export function useTabBadge() {
  base = document.title || 'Tutor TMA'
  watch([unreadCount, () => pendingBlocks.value.length], ([n, b]) => {
    try {
      document.title = b ? `🔒 Нужно ответить · ${base}` : n ? `(${n}) ${base}` : base
      badgeIcon(b ? Math.max(1, n) : n)
    } catch { /* нет документа (тесты) */ }
  }, { immediate: true })
}

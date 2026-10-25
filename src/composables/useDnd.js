// Перетаскивание на Pointer Events: работает и мышью, и пальцем (HTML5 drag&drop на телефонах не работает).
// Мышь: drag начинается после сдвига на 5px. Касание: долгое нажатие ~220мс (короткий свайп — обычная прокрутка).
// Цели помечаются атрибутом data-drop="cell" (+ data-date, data-hour) или data-drop="panel".
import { reactive } from 'vue'

const tg = window.Telegram?.WebApp
// grab — где за карточку взялись: смещение курсора внутри неё и её размер; призрак урока рисуется ровно поверх исходной карточки
export const dnd = reactive({ active: false, touch: false, payload: null, x: 0, y: 0, over: null, grab: null })

let onDrop = null
export const setDropHandler = (fn) => { onDrop = fn }

let s = null, raf = 0, swallow = false
const LONG_PRESS = 220, MOVE_MOUSE = 5, MOVE_TOUCH = 8, EDGE = 48

const targetAt = (x, y) => {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop]')
  if (!el) return null
  return el.dataset.drop === 'cell' ? { kind: 'cell', date: el.dataset.date, hour: +el.dataset.hour } : { kind: el.dataset.drop }
}
const same = (a, b) => a === b || (a && b && a.kind === b.kind && a.date === b.date && a.hour === b.hour)
const refresh = () => { const t = targetAt(dnd.x, dnd.y); if (!same(t, dnd.over)) dnd.over = t }

function loop() {                      // автопрокрутка у верхнего/нижнего края экрана
  if (!dnd.active) return
  const h = innerHeight
  const dy = dnd.y < EDGE ? -Math.ceil((EDGE - dnd.y) / 3) : dnd.y > h - EDGE ? Math.ceil((dnd.y - (h - EDGE)) / 3) : 0
  if (dy) { scrollBy(0, dy); refresh() }
  raf = requestAnimationFrame(loop)
}

function begin() {
  if (!s || s.started) return
  s.started = true
  Object.assign(dnd, { active: true, touch: s.touch, payload: s.payload, x: s.x, y: s.y, grab: s.grab })
  document.documentElement.classList.add('dragging')
  tg?.HapticFeedback?.impactOccurred?.('medium'); tg?.disableVerticalSwipes?.()   // чтобы Telegram не закрыл приложение свайпом
  refresh(); raf = requestAnimationFrame(loop)
}

function cleanup() {
  clearTimeout(s?.timer); cancelAnimationFrame(raf)
  removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp)
  removeEventListener('pointercancel', onCancel); removeEventListener('keydown', onKey)
  document.documentElement.classList.remove('dragging')
  if (dnd.active) { tg?.enableVerticalSwipes?.(); Object.assign(dnd, { active: false, payload: null, over: null, grab: null }) }
  s = null
}
function onMove(e) {
  if (!s || e.pointerId !== s.id) return
  s.x = e.clientX; s.y = e.clientY
  if (!s.started) {
    const far = Math.hypot(s.x - s.x0, s.y - s.y0)
    if (s.touch) { if (far > MOVE_TOUCH) cleanup() }      // палец поехал раньше долгого нажатия — это прокрутка
    else if (far > MOVE_MOUSE) begin()
    return
  }
  dnd.x = s.x; dnd.y = s.y; refresh()
}
function onUp(e) {
  if (!s || e.pointerId !== s.id) return
  const was = s.started
  if (was) { dnd.x = e.clientX; dnd.y = e.clientY; refresh() }
  const payload = dnd.payload, over = dnd.over
  if (was) { swallow = true; setTimeout(() => { swallow = false }, 60) }   // гасим «клик» после перетаскивания
  cleanup()
  if (was && over && onDrop) onDrop(payload, over)
}
function onCancel(e) { if (s && e.pointerId === s.id) cleanup() }
function onKey(e) { if (e.key === 'Escape') cleanup() }

export function pressStart(e, payload) {
  if (s || (e.pointerType === 'mouse' && e.button !== 0)) return
  const r = e.currentTarget?.getBoundingClientRect?.()
  const grab = r ? { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height } : null
  s = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, payload, touch: e.pointerType !== 'mouse', started: false, timer: 0, grab }
  if (s.touch) s.timer = setTimeout(begin, LONG_PRESS)
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp)
  addEventListener('pointercancel', onCancel); addEventListener('keydown', onKey)
}

// Во время перетаскивания блокируем прокрутку страницы (нужен non-passive слушатель — иначе iOS его игнорирует)
addEventListener('touchmove', (e) => { if (dnd.active && e.cancelable) e.preventDefault() }, { passive: false })
addEventListener('contextmenu', (e) => { if (s) e.preventDefault() })
addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault() } }, true)

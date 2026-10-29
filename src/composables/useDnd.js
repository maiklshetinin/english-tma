// Перетаскивание на Pointer Events: работает и мышью, и пальцем (HTML5 drag&drop на телефонах не работает).
// Мышь: drag начинается после сдвига на 5px. Касание: долгое нажатие ~220мс (короткий свайп — обычная прокрутка).
// Цели помечаются атрибутом data-drop="cell" (+ data-date, data-hour) или data-drop="panel".
// Целимся призраком, а не курсором: цель — то, что под центром призрака (DragGhost). Призрак ученика / группы из панели
// появляется на месте взятого и сжимается до размера ячейки; урок из таблицы — копия карточки поверх оригинала.
import { reactive } from 'vue'

const tg = window.Telegram?.WebApp
// grab — где за карточку взялись: смещение курсора внутри неё и её размер; призрак урока рисуется ровно поверх исходной карточки
// box — призрак: ширина W, высота H и где в нём курсор (доли fx, fy); от него считается прицел (центр призрака)
export const dnd = reactive({ active: false, touch: false, payload: null, x: 0, y: 0, over: null, grab: null, box: null })

let onDrop = null
export const setDropHandler = (fn) => { onDrop = fn }

let s = null, raf = 0, swallow = false
const LONG_PRESS = 220, MOVE_MOUSE = 5, MOVE_TOUCH = 8, EDGE = 48

// Урок вытащили за таблицу (с запасом OUT_PAD вокруг, чтобы не снять случайно, промахнувшись мимо крайней ячейки) — «снять урок»
const OUT_PAD = 28
const outOfTable = (x, y) => {
  const r = document.querySelector('.wk')?.getBoundingClientRect(); if (!r) return false
  return x < r.left - OUT_PAD || x > r.right + OUT_PAD || y < r.top - OUT_PAD || y > r.bottom + OUT_PAD
}
const targetAt = (x, y) => {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop]')
  if (!el) return dnd.payload?.kind === 'lesson' && outOfTable(x, y) ? { kind: 'out' } : null
  return el.dataset.drop === 'cell' ? { kind: 'cell', date: el.dataset.date, hour: +el.dataset.hour } : { kind: el.dataset.drop }
}
const same = (a, b) => a === b || (a && b && a.kind === b.kind && a.date === b.date && a.hour === b.hour)
/** Центр призрака — им и целимся. */
export const aimOf = (x, y, b = dnd.box) => (b ? { x: x + (0.5 - b.fx) * b.W, y: y + (0.5 - b.fy) * b.H } : { x, y })
const refresh = () => { const a = aimOf(dnd.x, dnd.y), t = targetAt(a.x, a.y); if (!same(t, dnd.over)) dnd.over = t }
// Призрак: урок — размером с карточку, курсор там же, где за неё взялись; ученик / группа — размером с ячейку таблицы,
// курсор на той же доле, что и в панели; на тачскрине призрак над пальцем, чтобы палец его не закрывал
function boxOf(st) {
  const g = st.grab
  if (st.payload.kind === 'lesson' && g) return { W: g.w, H: g.h, fx: g.dx / g.w, fy: g.dy / g.h }
  const c = document.querySelector('[data-drop="cell"]')?.getBoundingClientRect()
  const W = Math.round((c?.width || 110) - 10), H = Math.round((c?.height || 44) - 8)      // чуть меньше ячейки — видно её подсветку (можно / нельзя)
  if (st.touch) return { W, H, fx: 0.5, fy: 1.5 }
  return { W, H, fx: g ? Math.min(1, Math.max(0, g.dx / g.w)) : 0.5, fy: g ? Math.min(1, Math.max(0, g.dy / g.h)) : 0.5 }
}

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
  Object.assign(dnd, { active: true, touch: s.touch, payload: s.payload, x: s.x, y: s.y, grab: s.grab, box: boxOf(s) })
  document.documentElement.classList.add('dragging')
  tg?.HapticFeedback?.impactOccurred?.('medium'); tg?.disableVerticalSwipes?.()   // чтобы Telegram не закрыл приложение свайпом
  refresh(); raf = requestAnimationFrame(loop)
}

function cleanup() {
  clearTimeout(s?.timer); cancelAnimationFrame(raf)
  removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp)
  removeEventListener('pointercancel', onCancel); removeEventListener('keydown', onKey)
  document.documentElement.classList.remove('dragging')
  if (dnd.active) { tg?.enableVerticalSwipes?.(); Object.assign(dnd, { active: false, payload: null, over: null, grab: null, box: null }) }
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
  const av = e.currentTarget?.querySelector?.('.av')?.getBoundingClientRect?.().width || 0      // размер кружка в панели — призрак начинается с него
  const grab = r ? { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, av } : null
  s = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, payload, touch: e.pointerType !== 'mouse', started: false, timer: 0, grab }
  if (s.touch) s.timer = setTimeout(begin, LONG_PRESS)
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp)
  addEventListener('pointercancel', onCancel); addEventListener('keydown', onKey)
}

// Во время перетаскивания блокируем прокрутку страницы (нужен non-passive слушатель — иначе iOS его игнорирует)
addEventListener('touchmove', (e) => { if (dnd.active && e.cancelable) e.preventDefault() }, { passive: false })
addEventListener('contextmenu', (e) => { if (s) e.preventDefault() })
addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault() } }, true)

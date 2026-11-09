// Привязка точки к месту на странице — как у общих курсоров (GlobalCursors.vue) и заметок на экране (ScreenNotes.vue):
// путь к элементу от области страницы (main) и место внутри него (rx, ry от 0 до 1). Так точка встаёт туда же при любом
// масштабе и ширине окна; элемента у человека нет — по координатам страницы (x, y).
export const pageRoot = () => document.querySelector('.shell > main')
export function pathOf(el) {
  const top = pageRoot(), parts = []
  while (el && el !== top && el.nodeType === 1 && parts.length < 30) {
    const p = el.parentElement; if (!p) return ''
    parts.unshift(`${el.tagName.toLowerCase()}:nth-child(${[...p.children].indexOf(el) + 1})`)
    el = p
  }
  return top && el === top ? parts.join('>') : ''
}
export const findAnchor = (sel) => { try { return sel ? pageRoot()?.querySelector(':scope>' + sel) : null } catch { return null } }
/** Точка окна (clientX/Y) → привязка { sel, rx, ry, x, y } */
export function anchorAt(cx, cy) {
  const el = document.elementFromPoint(cx, cy)
  const sel = el ? pathOf(el) : '', r = sel ? el.getBoundingClientRect() : null
  return { sel, rx: r?.width ? (cx - r.left) / r.width : 0, ry: r?.height ? (cy - r.top) / r.height : 0, x: cx + scrollX, y: cy + scrollY }
}
/** Привязка → координаты окна сейчас */
export function placeOf(a) {
  const el = findAnchor(a.sel)
  if (el) { const r = el.getBoundingClientRect(); return { x: r.left + a.rx * r.width, y: r.top + a.ry * r.height } }
  return { x: a.x - scrollX, y: a.y - scrollY }
}

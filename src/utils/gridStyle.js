// Вид сетки расписания (таблица недели): «клетки» — белые ячейки с тонкой рамкой, «линии» — только линии между часами
// (как в Google Календаре), «серые» — серые ячейки без рамки, «без линий» — чистый белый фон, только уроки. Выбор — кнопкой с решёткой над таблицей, запоминается на устройстве.
import { ref, watchEffect } from 'vue'

export const GRID_STYLES = [
  { id: 'cells', title: 'Клетки', sub: 'белые с рамкой' },
  { id: 'lines', title: 'Линии', sub: 'только линии часов' },
  { id: 'gray', title: 'Серые', sub: 'серые ячейки' },
  { id: 'none', title: 'Без линий', sub: 'только уроки' },
]
const KEY = 'tma.gridStyle'
const read = () => { try { const v = localStorage.getItem(KEY); return GRID_STYLES.some((s) => s.id === v) ? v : 'cells' } catch { return 'cells' } }
export const gridStyle = ref(read())
export function setGridStyle(id) { gridStyle.value = id; try { localStorage.setItem(KEY, id) } catch { /* приватный режим — просто не запомним */ } }

// Фон экрана в точку (как холст в Figma)
const DOTS = 'tma.bgDots'
export const bgDots = ref((() => { try { return localStorage.getItem(DOTS) === '1' } catch { return false } })())
export function setBgDots(on) { bgDots.value = !!on; try { localStorage.setItem(DOTS, on ? '1' : '0') } catch { /* приватный режим */ } }
watchEffect(() => { document.documentElement.classList.toggle('bg-dots', bgDots.value) })

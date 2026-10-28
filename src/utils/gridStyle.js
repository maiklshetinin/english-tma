// Вид сетки расписания (таблица недели): «клетки» — белые ячейки с тонкой рамкой, «линии» — только линии между часами
// (как в Google Календаре), «серые» — серые ячейки без рамки, «без линий» — чистый белый фон, только уроки. Выбор — кнопкой с решёткой над таблицей, запоминается на устройстве.
import { ref } from 'vue'

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

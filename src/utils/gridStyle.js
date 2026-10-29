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

// Внешняя рамка таблицы недели (обводка карточки): можно убрать — останется только сетка
const FRAME = 'tma.gridFrame'
export const gridFrame = ref((() => { try { return localStorage.getItem(FRAME) !== '0' } catch { return true } })())
export function setGridFrame(on) { gridFrame.value = !!on; try { localStorage.setItem(FRAME, on ? '1' : '0') } catch { /* приватный режим */ } }

// Как выглядит будущий урок: плашка / хвостик (кружок слева, подложка от его середины) / жёлтый стикер / голубая капсула
export const LESSON_STYLES = [
  { id: 'plain', title: 'Плашка', sub: 'серая с рамкой' },
  { id: 'tail', title: 'Хвостик', sub: 'кружок и подпись' },
  { id: 'sticker', title: 'Стикер', sub: 'жёлтый, с уголком' },
  { id: 'blue', title: 'Голубой', sub: 'капсула' },
]
const LS = 'tma.lessonStyle'
export const lessonStyle = ref((() => { try { const v = localStorage.getItem(LS); return LESSON_STYLES.some((s) => s.id === v) ? v : 'plain' } catch { return 'plain' } })())
export function setLessonStyle(id) { lessonStyle.value = id; try { localStorage.setItem(LS, id) } catch { /* приватный режим */ } }

// Закрашивать прошедшее время: прошлые часы серые, текущий час заполняется по минутам (в реальном времени)
const PAST = 'tma.pastShade'
export const pastShade = ref((() => { try { return localStorage.getItem(PAST) === '1' } catch { return false } })())
export function setPastShade(on) { pastShade.value = !!on; try { localStorage.setItem(PAST, on ? '1' : '0') } catch { /* приватный режим */ } }

// Фон экрана в точку (как холст в Figma)
const DOTS = 'tma.bgDots'
export const bgDots = ref((() => { try { return localStorage.getItem(DOTS) === '1' } catch { return false } })())
export function setBgDots(on) { bgDots.value = !!on; try { localStorage.setItem(DOTS, on ? '1' : '0') } catch { /* приватный режим */ } }
watchEffect(() => { document.documentElement.classList.toggle('bg-dots', bgDots.value) })

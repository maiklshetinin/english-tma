// Вид таблицы недели (кнопка с решёткой над таблицей, выбор запоминается на устройстве). С 03.11.2026 — без лишнего:
// сетка всегда «клетки» (белые ячейки с тонкой рамкой); можно убрать внешнюю рамку и закрашивать прошедшее время;
// урок — серая или голубая капсула; группа — всегда жёлтая. Линии / серые / без линий, плашка / хвостик / стикер и фон в точку убраны.
import { ref } from 'vue'

export const gridStyle = ref('cells')

// Внешняя рамка таблицы недели (обводка карточки): можно убрать — останется только сетка
const FRAME = 'tma.gridFrame'
export const gridFrame = ref((() => { try { return localStorage.getItem(FRAME) !== '0' } catch { return true } })())
export function setGridFrame(on) { gridFrame.value = !!on; try { localStorage.setItem(FRAME, on ? '1' : '0') } catch { /* приватный режим */ } }

// Как выглядит будущий урок: капсула — серая, голубая или цветная (цветная — статус красит капсулу: зелёный проведён,
// розовый отменён, голубой запланирован + часики). Группа — всегда жёлтая. Старый выбор (плашка / хвостик / стикер) → серая.
export const LESSON_STYLES = [
  { id: 'gray', title: 'Серый', sub: 'капсула' },
  { id: 'blue', title: 'Голубой', sub: 'капсула' },
  { id: 'color', title: 'Цветной', sub: 'по статусу' },
]
const LS = 'tma.lessonStyle'
export const lessonStyle = ref((() => { try { const v = localStorage.getItem(LS); return v === 'color' ? 'color' : v === 'gray' || ['plain', 'tail', 'sticker'].includes(v) ? 'gray' : 'blue' } catch { return 'blue' } })())
export function setLessonStyle(id) { lessonStyle.value = id; try { localStorage.setItem(LS, id) } catch { /* приватный режим */ } }

// Закрашивать прошедшее время: прошлые часы серые, текущий час заполняется по минутам (в реальном времени)
const PAST = 'tma.pastShade'
export const pastShade = ref((() => { try { return localStorage.getItem(PAST) === '1' } catch { return false } })())
export function setPastShade(on) { pastShade.value = !!on; try { localStorage.setItem(PAST, on ? '1' : '0') } catch { /* приватный режим */ } }

// Фон в точку убран: выключаем у тех, у кого он был включён
try { localStorage.removeItem('tma.bgDots'); localStorage.removeItem('tma.gridStyle') } catch { /* приватный режим */ }


// Вид заметки-стикера больше не выбирается (всегда жёлтый листок)
try { localStorage.removeItem('tma.trialStyle') } catch { /* приватный режим */ }

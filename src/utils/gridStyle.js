// Вид таблицы недели (кнопка с решёткой над таблицей, выбор запоминается на устройстве). С 03.11.2026 — без лишнего:
// сетка всегда «клетки» (белые ячейки с тонкой рамкой); можно убрать внешнюю рамку и закрашивать прошедшее время;
// урок — серая или голубая капсула; группа — всегда жёлтая. Линии / серые / без линий, плашка / хвостик / стикер и фон в точку убраны.
import { ref } from 'vue'

export const gridStyle = ref('cells')

// Внешняя рамка таблицы недели (обводка карточки): можно убрать — останется только сетка
const FRAME = 'tma.gridFrame'
export const gridFrame = ref((() => { try { return localStorage.getItem(FRAME) !== '0' } catch { return true } })())
export function setGridFrame(on) { gridFrame.value = !!on; try { localStorage.setItem(FRAME, on ? '1' : '0') } catch { /* приватный режим */ } }

// Как выглядит будущий урок: капсула — серая или голубая (группа — всегда жёлтая). Старый выбор (плашка / хвостик / стикер) → серая.
export const LESSON_STYLES = [
  { id: 'gray', title: 'Серый', sub: 'капсула' },
  { id: 'blue', title: 'Голубой', sub: 'капсула' },
]
const LS = 'tma.lessonStyle'
export const lessonStyle = ref((() => { try { return localStorage.getItem(LS) === 'gray' || ['plain', 'tail', 'sticker'].includes(localStorage.getItem(LS)) ? 'gray' : 'blue' } catch { return 'blue' } })())
export function setLessonStyle(id) { lessonStyle.value = id; try { localStorage.setItem(LS, id) } catch { /* приватный режим */ } }

// Как показывать статус урока (16.11.2026): «капсула» — вся карточка цветная (зелёная — проведён, красная — отмена, оранжевая — нужен статус),
// значок в конце строки; «словом» — без подложки, под именем мелко: «проведён» / «отмена» / «нужен статус» / «запланирован».
// На телефоне (в ячейке только кружок) в обоих вариантах значок — в углу кружка.
export const STATUS_STYLES = [
  { id: 'pill', title: 'Цветная капсула', sub: 'зелёная — проведён, красная — отмена' },
  { id: 'word', title: 'Словом под именем', sub: '«проведён», «отмена»' },
]
const ST = 'tma.statusStyle'
export const statusStyle = ref((() => { try { return localStorage.getItem(ST) === 'word' ? 'word' : 'pill' } catch { return 'pill' } })())
export function setStatusStyle(id) { statusStyle.value = id; try { localStorage.setItem(ST, id) } catch { /* приватный режим */ } }

// Закрашивать прошедшее время: прошлые часы серые, текущий час заполняется по минутам (в реальном времени)
const PAST = 'tma.pastShade'
export const pastShade = ref((() => { try { return localStorage.getItem(PAST) === '1' } catch { return false } })())
export function setPastShade(on) { pastShade.value = !!on; try { localStorage.setItem(PAST, on ? '1' : '0') } catch { /* приватный режим */ } }

// Фон в точку убран: выключаем у тех, у кого он был включён
try { localStorage.removeItem('tma.bgDots'); localStorage.removeItem('tma.gridStyle') } catch { /* приватный режим */ }


// Вид заметки-стикера больше не выбирается (всегда жёлтый листок)
try { localStorage.removeItem('tma.trialStyle') } catch { /* приватный режим */ }

// Связь шаблона упражнения с тем, кто его показывает (18.11.2026).
//  • play — от LessonPlayer: состояние экрана (st), адреса файлов (src), звук (say), режим (edit / embedded / single / track),
//    действия ученика (pick …) и итог ответа (right, later, answer). Есть всегда.
//  • edit — от LessonRail (правка на ветке): выбрать или бросить файл, убрать файл, % загрузки, «изменено», карточки из колод.
//    Есть только в редакторе курса; включает правку не он, а play.edit (тот же LessonPlayer в режиме edit).
import { inject, provide } from 'vue'

const PLAY = Symbol('exPlay'), EDIT = Symbol('exEdit')
export const providePlay = (v) => provide(PLAY, v)
export const usePlay = () => inject(PLAY)
export const provideEdit = (v) => provide(EDIT, v)
// заглушка — чтобы шаблон в режиме правки не падал вне редактора (например, в тесте)
const NOOP = { pick() {}, drop() {}, clear() {}, pct: () => null, changed() {}, cards() {}, canUndo: () => false, undoCard() {}, dropFiles() {} }
export const useEdit = () => inject(EDIT, NOOP)

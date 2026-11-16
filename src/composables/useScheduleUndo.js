// Ctrl+Z / Ctrl+Shift+Z в расписании (16.11.2026) — история удалений из таблицы недели (выделение рамкой → Delete / меню «Удалить»).
// Запись истории — { undo(), redo() }: «Отменить» в тосте, Ctrl+Z и пункт меню идут через один и тот же стек.
import { ref } from 'vue'

const done = [], undone = []
export const undoN = ref(0), redoN = ref(0)
const sync = () => { undoN.value = done.length; redoN.value = undone.length }
export function pushUndo(entry) { done.push(entry); if (done.length > 50) done.shift(); undone.length = 0; sync() }
export function undo() { const e = done.pop(); if (!e) return false; e.undo(); undone.push(e); sync(); return true }
export function redo() { const e = undone.pop(); if (!e) return false; e.redo(); done.push(e); sync(); return true }
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const ctrlKey = isMac ? '⌘' : 'Ctrl'

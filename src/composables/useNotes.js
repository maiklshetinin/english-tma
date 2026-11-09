// Заметки на общем экране — мини-чат преподавателей (сервер: server/notes.ts + WebSocket /live).
// Заметка приклеена к месту на странице; под ней ответы, реакции, «печатает…» и «Прочитано».
// «Уведомлением» — у адресата всплывает плашка, которая висит, пока он не закроет её крестиком; закрыл — у автора «Прочитано».
// Рисует всё ScreenNotes.vue; значок со списком — в PresenceBar.vue.
import { reactive, computed } from 'vue'
import { live, liveSend, onLive } from './useLive'

export const REACTIONS = ['👍', '❤️', '😂', '🔥', '✅', '👀']
export const notesState = reactive({
  me: '',                 // мой uid (из hello)
  list: [],               // все заметки, новые сверху
  open: null,             // id открытой заметки
  draft: null,            // новая заметка: { path, where, sel, rx, ry, x, y }
  placing: false,         // «Новая заметка» из списка: следующее нажатие на экран ставит булавку
  typing: {},             // id заметки → { uid, name, color, until }
  popups: [],             // всплывающие уведомления: { id, mid, from, at }
  showDone: false,
})
const byId = (id) => notesState.list.find((n) => n.id === id)
export const noteById = byId
const upsert = (n) => { const i = notesState.list.findIndex((x) => x.id === n.id); if (i >= 0) notesState.list[i] = n; else notesState.list.unshift(n) }

/** Непрочитано мной: есть сообщения от других новее моего «прочитал» */
export const unread = (n) => n.msgs.some((m) => m.uid !== notesState.me && m.at > (n.seen?.[notesState.me] ?? 0))
export const unreadCount = computed(() => notesState.list.filter((n) => !n.done && unread(n)).length)

let wired = false
export function wireNotes() {
  if (wired) return; wired = true
  onLive('hello', (m) => { notesState.me = m.uid || ''; notesState.list = (m.notes || []).slice() })
  onLive('note', (m) => {
    upsert(m.note)
    if (m.cid === live.cid && m.ref === 'new') { notesState.draft = null; notesState.open = m.note.id }      // моя новая заметка сохранилась — открыть её
    const t = notesState.typing[m.note.id]; if (t && t.uid === m.by) delete notesState.typing[m.note.id]
    if (notesState.open === m.note.id && m.by !== notesState.me && unread(m.note)) seen(m.note.id)          // заметка открыта у меня — сразу «прочитано»
  })
  onLive('note-', (m) => { notesState.list = notesState.list.filter((n) => n.id !== m.id); if (notesState.open === m.id) notesState.open = null; notesState.popups = notesState.popups.filter((p) => p.id !== m.id) })
  onLive('typing', (m) => { notesState.typing[m.id || 'new'] = { uid: m.uid, name: m.name, color: m.color, until: Date.now() + 4000 } })
  onLive('nudge', (m) => {
    if (!byId(m.id)) return
    notesState.popups = [...notesState.popups.filter((p) => p.id !== m.id), { id: m.id, mid: m.mid, from: m.from, at: Date.now() }]
    try { navigator.vibrate?.(180); window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning') } catch { /* нет вибрации */ }
  })
}

export function createNote(text, nudge = false) {
  const d = notesState.draft; if (!d || !text.trim()) return
  liveSend({ t: 'note+', ...d, text, ref: 'new' })
  if (nudge) pendingNudge = true
}
let pendingNudge = false
// Новая заметка «уведомлением»: как только сервер вернул её id — позвать всех остальных
onLive('note', (m) => { if (pendingNudge && m.cid === live.cid && m.ref === 'new') { pendingNudge = false; nudge(m.note.id, m.note.msgs.at(-1)?.id) } })

export function reply(id, text, withNudge = false) {
  if (!text.trim()) return
  liveSend({ t: 'note:reply', id, text })
  if (withNudge) { const off = onLive('note', (m) => { if (m.note.id === id && m.cid === live.cid) { off(); nudge(id, m.note.msgs.at(-1)?.id) } }) }
}
export const react = (id, mid, e) => liveSend({ t: 'note:react', id, mid, e })
export const setDone = (id, done) => liveSend({ t: 'note:done', id, done })
export const removeNote = (id) => liveSend({ t: 'note:del', id })
export const nudge = (id, mid = '', to = '') => liveSend({ t: 'nudge', id, mid, to })
export function seen(id) { liveSend({ t: 'note:seen', id }) }
let lastTyping = 0
export function typing(id) { const t = Date.now(); if (t - lastTyping > 2000) { lastTyping = t; liveSend({ t: 'typing', id: id || 'new' }) } }

export function openNote(id) {
  notesState.open = id; notesState.draft = null
  const n = byId(id); if (n && unread(n)) seen(id)
}
export function closePopup(id, open = false) {
  notesState.popups = notesState.popups.filter((p) => p.id !== id)
  seen(id)                                  // закрыл уведомление — у автора «Прочитано»
  if (open) openNote(id)
}

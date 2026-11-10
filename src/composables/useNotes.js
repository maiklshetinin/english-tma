// Заметки на общем экране — мини-чат преподавателей (сервер: server/notes.ts + WebSocket /live).
// Заметка приклеена к месту на странице; под ней ответы, реакции, «печатает…» и «Прочитано».
// «Уведомлением» — у адресата всплывает плашка, которая висит, пока он не закроет её крестиком; закрыл — у автора «Прочитано».
// Рисует всё ScreenNotes.vue; значок со списком — в PresenceBar.vue.
import { reactive, computed } from 'vue'
import { live, liveSend, onLive } from './useLive'

export const REACTIONS = ['👍', '❤️', '😂', '🔥', '✅', '👀']
/** Что несут в посылке: сундук, конверт и записка (её текст виден сразу) рисуются отдельно, остальное — крупным эмодзи */
export const CARGO = [
  { id: 'chest', title: 'Сундук', em: '' }, { id: 'gift', title: 'Подарок', em: '🎁' }, { id: 'mail', title: 'Письмо', em: '' }, { id: 'note', title: 'Записка', em: '' }, { id: 'poo', title: 'Какашка', em: '💩' },
  { id: 'heart', title: 'Сердечко', em: '❤️' }, { id: 'cake', title: 'Торт', em: '🎂' }, { id: 'flowers', title: 'Цветы', em: '💐' },
]
/** Чем доставить посылку (анимации — в ParachuteDrop.vue) */
export const VIAS = [{ id: 'chute', title: 'Парашют' }, { id: 'crane', title: 'Кран' }, { id: 'bird', title: 'Аист' }]
/** Эмодзи, которые можно положить в посылку (ещё любые — с клавиатуры); при открытии вылетают фонтаном */
export const PARCEL_EMOJI = ['🎉', '🎂', '❤️', '🎈', '🥳', '⭐', '🔥', '👍', '😂', '🌸', '🍀', '☕', '🍕', '🚀', '💎', '👏', '🙏', '😱', '💩', '👻', '🐱', '🦄', '🌈', '❄️', '💰', '🏆', '💤']
export const PARCEL_EMOJI_MAX = 8
export const notesState = reactive({
  me: '',                 // мой uid (из hello)
  list: [],               // все заметки, новые сверху
  open: null,             // id открытой заметки
  draft: null,            // новая заметка: { path, where, sel, rx, ry, x, y }
  placing: false,         // «Новая заметка» из списка: следующее нажатие на экран ставит булавку
  typing: {},             // id заметки → { uid, name, color, until }
  popups: [],             // всплывающие уведомления: { id, mid, from, at }
  drops: [],              // посылки внизу экрана: { id, note, mid, cargo, via, emoji, x, by, to, at } (рисует ParachuteDrop.vue)
  aim: null,              // посылка ждёт, куда её сбросить: { text, mode, note, pack: { via, emoji } } — нажатие на экран выбирает место
})
const byId = (id) => notesState.list.find((n) => n.id === id)
export const noteById = byId
const upsert = (n) => { const i = notesState.list.findIndex((x) => x.id === n.id); if (i >= 0) notesState.list[i] = n; else notesState.list.unshift(n) }

/** Непрочитано мной: есть сообщения от других новее моего «прочитал» */
export const unread = (n) => n.msgs.some((m) => m.uid !== notesState.me && m.at > (n.seen?.[notesState.me] ?? 0))
// Один общий чат справа (09.11.2026 — вместо заметок-булавок): это одна заметка с особым путём CHAT_PATH.
// Старые заметки-булавки остаются в базе, но не показываются.
export const CHAT_PATH = '/__chat'
export const chatNote = computed(() => notesState.list.filter((n) => n.path === CHAT_PATH).sort((a, b) => a.at - b.at)[0] ?? null)
export const unreadCount = computed(() => { const c = chatNote.value; return c ? c.msgs.filter((m) => m.uid !== notesState.me && m.at > (c.seen?.[notesState.me] ?? 0)).length : 0 })

let wired = false
export function wireNotes() {
  if (wired) return; wired = true
  onLive('hello', (m) => { notesState.me = m.uid || ''; notesState.list = (m.notes || []).slice(); notesState.drops = (m.drops || []).slice() })
  onLive('drop', (m) => { notesState.drops = [...notesState.drops.filter((d) => d.id !== m.drop.id), m.drop] })
  onLive('drop-', (m) => { notesState.drops = notesState.drops.filter((d) => d.id !== m.id) })
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

// mode: '' — обычное сообщение; 'bell' — всплывающим уведомлением; id посылки (CARGO) — спустить на парашюте
const dropOf = (mode) => (mode === 'bell' ? '' : mode)
// pack: { via, emoji } — чем доставить и какие эмодзи внутри (только для посылки)
export function createNote(text, mode = '', x = 0.5, pack = null) {
  const d = notesState.draft; if (!d || !text.trim()) return
  liveSend({ t: 'note+', ...d, text, ref: 'new' })
  pendingNudge = mode; pendingX = x; pendingPack = pack
}
let pendingNudge = '', pendingX = 0.5, pendingPack = null
// Новая заметка уведомлением / посылкой: как только сервер вернул её id — позвать всех остальных
onLive('note', (m) => { if (pendingNudge && m.cid === live.cid && m.ref === 'new') { const mode = pendingNudge; pendingNudge = ''; nudge(m.note.id, m.note.msgs.at(-1)?.id, '', dropOf(mode), pendingX, pendingPack) } })

export function reply(id, text, mode = '', x = 0.5, pack = null) {
  if (!text.trim()) return
  liveSend({ t: 'note:reply', id, text })
  if (mode) { const off = onLive('note', (m) => { if (m.note.id === id && m.cid === live.cid) { off(); nudge(id, m.note.msgs.at(-1)?.id, '', dropOf(mode), x, pack) } }) }
}
export const react = (id, mid, e) => liveSend({ t: 'note:react', id, mid, e })
/** Перенести булавку: новое место ({ sel, rx, ry, x, y }) — у всех сразу */
export function moveNote(id, at) { const n = byId(id); if (n) Object.assign(n, at); liveSend({ t: 'note:move', id, ...at }) }
/** Исправить своё сообщение */
export function editMsg(id, mid, text) { const t = text.trim(); if (!t) return; const m = byId(id)?.msgs.find((x) => x.id === mid); if (m) { m.text = t; m.edited = Date.now() } liveSend({ t: 'note:edit', id, mid, text: t }) }
/** Удалить своё сообщение — у всех */
export const removeMsg = (id, mid) => liveSend({ t: 'note:msgdel', id, mid })
export const removeNote = (id) => liveSend({ t: 'note:del', id })
export const nudge = (id, mid = '', to = '', drop = '', x = 0.5, pack = null) => liveSend({ t: 'nudge', id, mid, to, drop, x, via: pack?.via || 'chute', emoji: pack?.emoji || [] })
/** Открыть чужую посылку: пропадает у всех, у отправителя — «Прочитано» */
export const openDrop = (id) => liveSend({ t: 'drop:open', id })
export function seen(id) { liveSend({ t: 'note:seen', id }) }
let lastTyping = 0
export function typing(id) { const t = Date.now(); if (t - lastTyping > 2000) { lastTyping = t; liveSend({ t: 'typing', id: id || 'new' }) } }

/** Открыть / закрыть общий чат; пока в нём нет ни одного сообщения — черновик, первое сообщение его создаёт */
export function toggleChat(on = !(notesState.open || notesState.draft)) {
  if (!on) { notesState.open = null; notesState.draft = null; return }
  const c = chatNote.value
  if (c) openNote(c.id)
  else { notesState.open = null; notesState.draft = { path: CHAT_PATH, where: 'Чат', sel: '', rx: 0, ry: 0, x: 0, y: 0 } }
}
export function openNote(id) {
  notesState.open = id; notesState.draft = null
  const n = byId(id); if (n && unread(n)) seen(id)
}
export function closePopup(id, open = false) {
  notesState.popups = notesState.popups.filter((p) => p.id !== id)
  seen(id)                                  // закрыл уведомление — у автора «Прочитано»
  if (open) openNote(id)
}

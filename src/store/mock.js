import { reactive, computed, ref } from 'vue'

const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`   // локальная дата, без сдвига UTC
const iso = (off = 0) => { const d = new Date(); d.setDate(d.getDate() + off); return ymd(d) }
export const hh = (h) => `${pad(h)}:00`
let uid = 100
export const nextId = () => ++uid
// Узел («кружок») пути: type = tutor (урок из расписания) | hw (домашнее задание) | cards (повторение слов) | combo (слова + ДЗ). date привязывает его к календарю.
const N = (type, title, off, xp, o = {}) => ({ id: nextId(), type, title, date: iso(off), xp, done: false, ...o })

// Фабрика пути: done — сколько первых узлов уже пройдено, shift — сдвиг дат, t — время уроков
const buildPath = (done = 0, shift = 0, t = '18:00') => {
  const units = [
    { id: nextId(), title: 'Unit 1 · Present Perfect', sub: 'Опыт и результаты', nodes: [
      N('tutor', 'Урок: Present Perfect', -6 + shift, 30, { time: t }),
      N('cards', 'Слова: Business Basics', -4 + shift, 15, { deckId: 1 }),
      N('hw', 'ДЗ: упр. 4', -1 + shift, 20, { desc: 'Exercise 4, p.52: 8 предложений в Present Perfect.' }),
      N('tutor', 'Урок: практика', 2 + shift, 30, { time: t }),
      N('combo', 'Слова + ДЗ: Business', 4 + shift, 25, { deckId: 1, desc: 'Повторите слова, затем напишите 5 предложений с ними.' }),
      N('hw', 'ДЗ: мини-текст', 5 + shift, 30, { desc: 'Короткий текст (8–10 предложений) по юниту.' }),
    ] },
    { id: nextId(), title: 'Unit 2 · Conditionals', sub: 'Zero, first, second', nodes: [
      N('tutor', 'Урок: Conditionals', 7 + shift, 30, { time: t }),
      N('hw', 'ДЗ: if-фразы', 9 + shift, 20, { desc: '6 предложений с first conditional.' }),
      N('cards', 'Слова: Conditionals', 12 + shift, 20, { deckId: 1 }),
    ] },
  ]
  units.flatMap(u => u.nodes).slice(0, done).forEach(n => (n.done = true))
  return units
}
// Пресет пути — заготовка без дат: юниты и кружки только трёх типов (hw / cards / combo)
const P = (type, title, xp, o = {}) => ({ id: nextId(), type, title, xp, done: false, desc: '', ...o })
const presetBasic = () => [
  { id: nextId(), title: 'Unit 1 · Present Perfect', sub: 'Опыт и результаты', nodes: [
    P('cards', 'Слова: Business Basics', 15, { deckId: 1 }),
    P('hw', 'ДЗ: упр. 4', 20, { desc: 'Exercise 4, p.52: 8 предложений в Present Perfect.' }),
    P('combo', 'Слова + ДЗ', 30, { deckId: 1, desc: 'Повторите слова и напишите 5 предложений с ними.' }),
  ] },
  { id: nextId(), title: 'Unit 2 · Conditionals', sub: 'Zero, first, second', nodes: [
    P('hw', 'ДЗ: if-фразы', 20, { desc: '6 предложений с first conditional.' }),
    P('cards', 'Слова: Conditionals', 15),
  ] },
]
const presetSpeaking = () => [
  { id: nextId(), title: 'Unit 1 · Small talk', sub: 'Первые фразы', nodes: [
    P('cards', 'Слова: Small talk', 15), P('hw', 'ДЗ: диалог', 20, { desc: 'Запишите голосовое: 6 реплик диалога.' }),
  ] },
]
// Карточка колоды. Прогресс повторений хранится отдельно для каждого пользователя: state.srs[userKey][cardId]
const card = (front, back, example = '') => ({ id: nextId(), front, back, example })
const BASIC = [card('deadline', 'крайний срок', 'The deadline is Friday.'), card('to postpone', 'откладывать', 'We postponed the meeting.'), card('reliable', 'надёжный'), card('to achieve', 'достигать', 'She achieved her goal.'),
  card('to negotiate', 'вести переговоры'), card('budget', 'бюджет', 'We are over budget.'), card('colleague', 'коллега'), card('to schedule', 'планировать, назначать')]
const TRAVEL = [card('luggage', 'багаж'), card('boarding pass', 'посадочный талон'), card('delay', 'задержка рейса'), card('customs', 'таможня'), card('to book', 'бронировать', 'I booked a room.')]
const PHRASAL = [card('to give up', 'сдаваться', 'Never give up!'), card('to look forward to', 'ждать с нетерпением'), card('to run out of', 'исчерпать запас'), card('to carry on', 'продолжать')]

export const state = reactive({
  role: 'student', tab: 'path',
  selectedStudentId: null,
  teacher: { name: 'Анна', username: 'your_teacher_username', color: '#58cc02' },   // photo_url подтягивается из Telegram (useTelegramAuth)
  students: [
    { id: 1, name: 'Мария Д.', username: 'maria_d', color: '#ff4b4b', level: 'A2', streak: 3, coins: 80, payment: { status: 'due', until: iso(4), lessonsLeft: 0, packageSize: 8 } },
    { id: 2, name: 'Леня С.', username: 'lenya_eng', color: '#1cb0f6', level: 'B1', streak: 12, coins: 340, payment: { status: 'paid', until: iso(36), lessonsLeft: 2, packageSize: 8 } },
    { id: 3, name: 'Вика К.', username: 'vika_k', color: '#ce82ff', level: 'B2', streak: 27, coins: 910, payment: { status: 'paid', until: iso(60), lessonsLeft: 5, packageSize: 8 } },
    { id: 4, name: 'Вера П.', username: 'vera_p', color: '#58cc02', level: 'A2', streak: 8, coins: 210, payment: { status: 'paid', until: iso(25), lessonsLeft: 3, packageSize: 8 } },
    { id: 5, name: 'Ярослав Н.', username: 'yaro_slav', color: '#ff9600', level: 'B1', streak: 15, coins: 520, payment: { status: 'paid', until: iso(40), lessonsLeft: 6, packageSize: 8 } },
    { id: 6, name: 'Егор Т.', username: 'egor_t', color: '#2b70c9', level: 'A1', streak: 1, coins: 20, payment: { status: 'overdue', until: iso(-3), lessonsLeft: 0, packageSize: 8 } },
    { id: 7, name: 'Анна М.', username: 'anya_m', color: '#ff86d0', level: 'B2', streak: 41, coins: 1280, payment: { status: 'paid', until: iso(50), lessonsLeft: 4, packageSize: 8 } },
  ],
  currentStudentId: 1,
  presets: [                                    // пресеты пути — вкладка «Путь» преподавателя
    { id: nextId(), name: 'Базовый курс', units: presetBasic() },
    { id: nextId(), name: 'Разговорный', units: presetSpeaking() },
  ],
  paths: { 1: buildPath(1, 0, hh(9)), 2: buildPath(3, 1, hh(15)), 3: buildPath(2, 2, hh(11)), 4: buildPath(1, 3, hh(10)),
    5: buildPath(4, 4, hh(13)), 6: buildPath(0, 5, hh(16)), 7: buildPath(2, 6, hh(17)) },   // персональные пути по studentId; у каждого свой час урока
  // Колода: forAll — для всех учеников, иначе только для assigned (id учеников). source — ссылка на Google Таблицу.
  decks: [
    { id: 1, title: 'Business Basics', forAll: true, assigned: [], newPerDay: 20, source: { url: '', lastSync: null }, cards: BASIC },
    { id: 2, title: 'Travel', forAll: false, assigned: [1], newPerDay: 10, source: { url: '', lastSync: null }, cards: TRAVEL },
    { id: 3, title: 'Phrasal Verbs', forAll: false, assigned: [2, 3], newPerDay: 10, source: { url: '', lastSync: null }, cards: PHRASAL },
  ],
  // SRS-прогресс: userKey ('teacher' или id ученика) → cardId → { ease, interval, reps, lapses, first, last, due }
  srs: {
    teacher: {},
    1: { [BASIC[0].id]: { ease: 2.5, interval: 3, reps: 2, lapses: 0, first: iso(-5), last: iso(-3), due: iso(0) },
         [BASIC[2].id]: { ease: 2.3, interval: 0, reps: 0, lapses: 1, first: iso(-1), last: iso(-1), due: iso(0) },
         [BASIC[1].id]: { ease: 2.6, interval: 9, reps: 3, lapses: 0, first: iso(-9), last: iso(-1), due: iso(8) } },
  },
  log: { 1: { [iso(-2)]: 6, [iso(-1)]: 9 } },      // userKey → { 'YYYY-MM-DD': сколько ответов дано }
})

const flat = (units) => units.flatMap(u => u.nodes)
export const pathOf = (id) => state.paths[id] ?? []
export const currentIdOf = (units) => flat(units).find(n => !n.done)?.id
export const pctOf = (units) => { const a = flat(units); return a.length ? Math.round(a.filter(n => n.done).length / a.length * 100) : 0 }
export const unitOf = (units) => units.find(u => u.nodes.some(n => !n.done))?.title ?? 'Курс завершён'

export const student = computed(() => state.students.find(s => s.id === state.currentStudentId))
export const myPath = computed(() => pathOf(state.currentStudentId))
export const currentNodeId = computed(() => currentIdOf(myPath.value))
export const progressPct = computed(() => pctOf(myPath.value))
export const needsPayment = computed(() => student.value.payment.status !== 'paid' || student.value.payment.lessonsLeft <= 2)
export const userKeyNow = computed(() => (state.role === 'teacher' ? 'teacher' : state.currentStudentId))
export const decksFor = (userKey) => userKey === 'teacher' ? state.decks : state.decks.filter(d => d.forAll || d.assigned.includes(userKey))
export const myDecks = computed(() => decksFor(state.currentStudentId))
export const deckOf = (n) => state.decks.find(d => d.id === n.deckId) || myDecks.value[0]
export const allLessons = computed(() => state.students.flatMap(s => flat(pathOf(s.id)).filter(n => n.type === 'tutor')
  .map(n => ({ ...n, studentId: s.id, studentName: s.name }))).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)))

// --- Расписание: уроки — это узлы пути с type 'tutor', date и time (целый час) ---
export const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
export const HOURS = Array.from({ length: 15 }, (_, i) => i + 8)       // 08:00 … 22:00
export const nowTick = ref(Date.now()); setInterval(() => { nowTick.value = Date.now() }, 60000)
export const slotKey = (date, hour) => `${date}|${hour}`
export const hourOf = (n) => parseInt(n.time, 10)

export function weekDates(offsetWeeks = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)   // понедельник нужной недели
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return ymd(x) })
}
const dm = (d) => `${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}`
export const weekRange = (dates) => `${dm(dates[0])} — ${dm(dates[6])}`
export const weekTitle = (off) => ({ '-1': 'Прошлая неделя', 0: 'Эта неделя', 1: 'Следующая неделя' }[off] ?? 'Неделя')
export const fmtSlot = (date, hour) => `${DAYS[(new Date(date + 'T00:00').getDay() + 6) % 7]} ${dm(date)}, ${hh(hour)}`

export const scheduleLessons = computed(() => state.students.flatMap(s => flat(pathOf(s.id))
  .filter(n => n.type === 'tutor' && n.time).map(node => ({ node, studentId: s.id }))))
export const lessonMap = computed(() => {            // слот → уроки (обычно один; если больше — в ячейке показывается значок)
  const m = new Map()
  for (const l of scheduleLessons.value) { const k = slotKey(l.node.date, hourOf(l.node)); m.set(k, [...(m.get(k) ?? []), l]) }
  return m
})

const keyOf = (n) => n.date + (n.time || '')
const nodeById = (sid, id) => flat(pathOf(sid)).find(n => n.id === id)
function detach(sid, id) { for (const u of pathOf(sid)) { const i = u.nodes.findIndex(n => n.id === id); if (i >= 0) return u.nodes.splice(i, 1)[0] } }
function attach(sid, node) {      // кладёт урок в путь ученика по дате, чтобы хронология пути не ломалась
  if (!state.paths[sid]) state.paths[sid] = []
  const us = state.paths[sid]
  if (!us.length) us.push({ id: nextId(), title: 'Занятия', sub: '', nodes: [] })
  const k = keyOf(node)
  for (let ui = 0; ui < us.length; ui++) {
    const i = us[ui].nodes.findIndex(n => keyOf(n) > k)
    if (i < 0) continue
    if (i === 0 && ui > 0) us[ui - 1].nodes.push(node); else us[ui].nodes.splice(i, 0, node)
    return
  }
  us[us.length - 1].nodes.push(node)
}
export function scheduleLesson(sid, date, hour) {
  const node = { id: nextId(), type: 'tutor', title: 'Урок', date, time: hh(hour), xp: 30, done: false }
  attach(sid, node); return node
}
export function relocateLesson(sid, id, date, hour) {
  const n = detach(sid, id); if (!n) return
  n.date = date; n.time = hh(hour); attach(sid, n)
}
export function swapLessons(a, b) {
  const [ad, ah, bd, bh] = [a.node.date, hourOf(a.node), b.node.date, hourOf(b.node)]
  relocateLesson(a.studentId, a.node.id, bd, bh); relocateLesson(b.studentId, b.node.id, ad, ah)
}
export const removeLesson = (sid, id) => detach(sid, id)
export const restoreLesson = (sid, node) => attach(sid, node)
export const findLesson = (sid, id) => nodeById(sid, id)

export const completeNode = (n, sid = state.currentStudentId) => { n.done = true; const s = state.students.find(x => x.id === sid); if (s) s.coins += n.xp }

// --- Редактирование пути (конструктор) ---
export const NODE_TYPES = { hw: 'Домашнее задание', cards: 'Повторение слов', combo: 'Слова + ДЗ' }
const NODE_DEFAULTS = { hw: ['Новое ДЗ', 20], cards: ['Повторение слов', 15], combo: ['Слова + ДЗ', 30] }
export function addNode(units, ui, type = 'hw', dated = true) {          // dated=false — для пресетов (без дат)
  const [title, xp] = NODE_DEFAULTS[type] ?? NODE_DEFAULTS.hw
  const n = { id: nextId(), type, title, xp, done: false, desc: '' }
  if (dated) n.date = iso(1)
  units[ui].nodes.push(n)
}
export const moveNode = (units, ui, i, dir) => { const a = units[ui].nodes, j = i + dir; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]] }
export const removeNode = (units, ui, i) => units[ui].nodes.splice(i, 1)
export const addUnit = (units) => units.push({ id: nextId(), title: 'Новый юнит', sub: '', nodes: [] })
export const moveUnit = (units, ui, dir) => { const j = ui + dir; if (j >= 0 && j < units.length) [units[ui], units[j]] = [units[j], units[ui]] }
export const removeUnit = (units, ui) => units.splice(ui, 1)[0]
export const sortAll = (units) => units.forEach(u => u.nodes.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))))

// Пресеты
const clonePath = (units) => JSON.parse(JSON.stringify(units)).map(u => ({ ...u, id: nextId(), nodes: u.nodes.map(n => ({ ...n, id: nextId(), done: false })) }))
export function addPreset(name, units = []) {
  const p = { id: nextId(), name: name || 'Новый пресет', units }
  state.presets.push(p); return state.presets.find(x => x.id === p.id)    // возвращаем реактивный прокси, а не «сырой» объект
}
export const duplicatePreset = (p) => addPreset(p.name + ' (копия)', clonePath(p.units))
export function removePreset(id) { const i = state.presets.findIndex(p => p.id === id); return i < 0 ? null : { preset: state.presets.splice(i, 1)[0], index: i } }
export const restorePreset = ({ preset, index }) => state.presets.splice(Math.min(index, state.presets.length), 0, preset)
export const presetFromPath = (name, units) => addPreset(name, clonePath(units).map(u => ({     // уроки (tutor) привязаны к расписанию — в пресет не попадают
  ...u, nodes: u.nodes.filter(n => n.type !== 'tutor').map(({ date, time, ...n }) => n) })))
export function applyPreset(sid, preset) {      // добавляет копию пресета в конец пути ученика; датирует кружки через день, начиная после последнего
  const us = clonePath(preset.units)
  if (!state.paths[sid]) state.paths[sid] = []
  const last = flat(state.paths[sid]).map(n => n.date).filter(Boolean).sort().pop()
  let off = last ? Math.round((new Date(last + 'T00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5) + 1 : 1
  off = Math.max(1, off)
  us.forEach(u => u.nodes.forEach(n => { n.date = iso(off); off += 2 }))
  const from = state.paths[sid].length
  state.paths[sid].push(...us)
  return { from, count: us.length }
}

// Колоды
export function addDeck(title, url = '') {
  const d = { id: nextId(), title, forAll: false, assigned: [], newPerDay: 20, source: { url, lastSync: null }, cards: [] }
  state.decks.push(d); return state.decks.find(x => x.id === d.id)
}
export function removeDeck(deck) { const i = state.decks.findIndex(d => d.id === deck.id); return i < 0 ? null : { deck: state.decks.splice(i, 1)[0], index: i } }
export const restoreDeck = ({ deck, index }) => state.decks.splice(Math.min(index, state.decks.length), 0, deck)

export const fmtDate = (d) => new Date(d + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
export const relDay = (d) => {
  const n = Math.round((new Date(d + 'T00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5)
  return n < 0 ? 'Прошло' : n === 0 ? 'Сегодня' : n === 1 ? 'Завтра' : `Через ${n} дн.`
}

export const TABS = {
  student: [
    { id: 'path', label: 'Путь', icon: 'route' }, { id: 'cards', label: 'Слова', icon: 'cards' },
    { id: 'lessons', label: 'Уроки', icon: 'calendar' }, { id: 'profile', label: 'Профиль', icon: 'user' },
  ],
  teacher: [
    { id: 'home', label: 'Главная', icon: 'home' }, { id: 'path', label: 'Путь', icon: 'route' },
    { id: 'students', label: 'Ученики', icon: 'users' }, { id: 'words', label: 'Слова', icon: 'cards' },
    { id: 'profile', label: 'Профиль', icon: 'user' },
  ],
}
export function setRole(role) { state.role = role; state.tab = TABS[role][0].id; state.selectedStudentId = null }

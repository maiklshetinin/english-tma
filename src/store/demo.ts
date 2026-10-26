// Демо-данные — только для `npm run dev` вне Telegram (сервера нет, всё живёт в памяти и пропадает при перезагрузке).
// В боевой версии ученики, расписание, путь, колоды и повторения приходят с сервера (stores/*). Подгружается лениво из stores/auth.ts.
import type { Card, Deck, PathNode, PathUnit, Preset, SrsUser, Student } from '../../server/types'
import { hh, iso, weekDates } from '../utils/dates'
import { newId } from '../utils/id'
import { flat } from '../utils/path'
import { useDecksStore } from '../stores/decks'
import { usePathStore } from '../stores/path'
import { useScheduleStore, slotKey } from '../stores/schedule'
import { useSrsStore } from '../stores/srs'
import { useStudentsStore } from '../stores/students'

// Узел («кружок») пути. date привязывает его к календарю.
const N = (type: PathNode['type'], title: string, off: number, xp: number, o: Partial<PathNode> = {}): PathNode => ({ id: newId('n'), type, title, date: iso(off), xp, done: false, ...o })

// Фабрика пути: done — сколько первых узлов уже пройдено, shift — сдвиг дат, t — время уроков
const buildPath = (done = 0, shift = 0, t = '18:00'): PathUnit[] => {
  const units: PathUnit[] = [
    { id: newId('u'), title: 'Unit 1 · Present Perfect', sub: 'Опыт и результаты', nodes: [
      N('tutor', 'Урок: Present Perfect', -6 + shift, 30, { time: t }),
      N('cards', 'Слова: Business Basics', -4 + shift, 15, { deckId: 'deck-basic' }),
      N('hw', 'ДЗ: упр. 4', -1 + shift, 20, { desc: 'Exercise 4, p.52: 8 предложений в Present Perfect.' }),
      N('tutor', 'Урок: практика', 2 + shift, 30, { time: t }),
      N('combo', 'Слова + ДЗ: Business', 4 + shift, 25, { deckId: 'deck-basic', desc: 'Повторите слова, затем напишите 5 предложений с ними.' }),
      N('hw', 'ДЗ: мини-текст', 5 + shift, 30, { desc: 'Короткий текст (8–10 предложений) по юниту.' }),
    ] },
    { id: newId('u'), title: 'Unit 2 · Conditionals', sub: 'Zero, first, second', nodes: [
      N('tutor', 'Урок: Conditionals', 7 + shift, 30, { time: t }),
      N('hw', 'ДЗ: if-фразы', 9 + shift, 20, { desc: '6 предложений с first conditional.' }),
      N('cards', 'Слова: Conditionals', 12 + shift, 20, { deckId: 'deck-basic' }),
    ] },
  ]
  flat(units).slice(0, done).forEach((n) => (n.done = true))
  return units
}

// Пресет пути — заготовка без дат: юниты и кружки только трёх типов (hw / cards / combo)
const P = (type: PathNode['type'], title: string, xp: number, o: Partial<PathNode> = {}): PathNode => ({ id: newId('n'), type, title, xp, done: false, desc: '', ...o })
const presetBasic = (): PathUnit[] => [
  { id: newId('u'), title: 'Unit 1 · Present Perfect', sub: 'Опыт и результаты', nodes: [
    P('cards', 'Слова: Business Basics', 15, { deckId: 'deck-basic' }),
    P('hw', 'ДЗ: упр. 4', 20, { desc: 'Exercise 4, p.52: 8 предложений в Present Perfect.' }),
    P('combo', 'Слова + ДЗ', 30, { deckId: 'deck-basic', desc: 'Повторите слова и напишите 5 предложений с ними.' }),
  ] },
  { id: newId('u'), title: 'Unit 2 · Conditionals', sub: 'Zero, first, second', nodes: [
    P('hw', 'ДЗ: if-фразы', 20, { desc: '6 предложений с first conditional.' }),
    P('cards', 'Слова: Conditionals', 15),
  ] },
]
const presetSpeaking = (): PathUnit[] => [
  { id: newId('u'), title: 'Unit 1 · Small talk', sub: 'Первые фразы', nodes: [
    P('cards', 'Слова: Small talk', 15), P('hw', 'ДЗ: диалог', 20, { desc: 'Запишите голосовое: 6 реплик диалога.' }),
  ] },
]

const card = (front: string, back: string, example = ''): Card => ({ id: newId('c'), front, back, ...(example && { example }) })
const BASIC = [card('deadline', 'крайний срок', 'The deadline is Friday.'), card('to postpone', 'откладывать', 'We postponed the meeting.'), card('reliable', 'надёжный'), card('to achieve', 'достигать', 'She achieved her goal.'),
  card('to negotiate', 'вести переговоры'), card('budget', 'бюджет', 'We are over budget.'), card('colleague', 'коллега'), card('to schedule', 'планировать, назначать')]
const TRAVEL = [card('luggage', 'багаж'), card('boarding pass', 'посадочный талон'), card('delay', 'задержка рейса'), card('customs', 'таможня'), card('to book', 'бронировать', 'I booked a room.')]
const PHRASAL = [card('to give up', 'сдаваться', 'Never give up!'), card('to look forward to', 'ждать с нетерпением'), card('to run out of', 'исчерпать запас'), card('to carry on', 'продолжать')]

const student = (id: string, name: string, username: string, color: string, level: Student['level'], streak: number, coins: number, payment: Student['payment']): Student =>
  ({ id, name, username, color, level, streak, coins, status: 'active', tgId: null, photoUrl: '', price: 0, payment })
export const DEMO_STUDENTS: Student[] = [
  student('1', 'Мария Д.', 'maria_d', '#ff4b4b', 'A2', 3, 80, { status: 'due', until: iso(4), lessonsLeft: 0, packageSize: 8 }),
  student('2', 'Леня С.', 'lenya_eng', '#1cb0f6', 'B1', 12, 340, { status: 'paid', until: iso(36), lessonsLeft: 2, packageSize: 8 }),
  student('3', 'Вика К.', 'vika_k', '#ce82ff', 'B2', 27, 910, { status: 'paid', until: iso(60), lessonsLeft: 5, packageSize: 8 }),
  student('4', 'Вера П.', 'vera_p', '#58cc02', 'A2', 8, 210, { status: 'paid', until: iso(25), lessonsLeft: 3, packageSize: 8 }),
  student('5', 'Ярослав Н.', 'yaro_slav', '#ff9600', 'B1', 15, 520, { status: 'paid', until: iso(40), lessonsLeft: 6, packageSize: 8 }),
  student('6', 'Егор Т.', 'egor_t', '#2b70c9', 'A1', 1, 20, { status: 'overdue', until: iso(-3), lessonsLeft: 0, packageSize: 8 }),
  student('7', 'Анна М.', 'anya_m', '#ff86d0', 'B2', 41, 1280, { status: 'paid', until: iso(50), lessonsLeft: 4, packageSize: 8 }),
]

/** Заполняет сторы демо-данными. Вызывается из stores/auth.ts в режиме разработки без Telegram. */
export function loadDemo(): void {
  const students = useStudentsStore()
  students.set(DEMO_STUDENTS)

  const paths: Record<string, PathUnit[]> = { 1: buildPath(1, 0, hh(9)), 2: buildPath(3, 1, hh(15)), 3: buildPath(2, 2, hh(11)), 4: buildPath(1, 3, hh(10)),
    5: buildPath(4, 4, hh(13)), 6: buildPath(0, 5, hh(16)), 7: buildPath(2, 6, hh(17)) }          // персональные пути; у каждого свой час урока
  const presets: Preset[] = [{ id: newId('p'), name: 'Базовый курс', units: presetBasic() }, { id: newId('p'), name: 'Разговорный', units: presetSpeaking() }]
  const path = usePathStore(); path.applyPaths(paths); path.applyPresets(presets)

  const decks: Deck[] = [
    { id: 'deck-basic', title: 'Business Basics', forAll: true, assigned: [], newPerDay: 20, source: { url: '', lastSync: null }, cards: BASIC },
    { id: 'deck-travel', title: 'Travel', forAll: false, assigned: ['1'], newPerDay: 10, source: { url: '', lastSync: null }, cards: TRAVEL },
    { id: 'deck-phrasal', title: 'Phrasal Verbs', forAll: false, assigned: ['2', '3'], newPerDay: 10, source: { url: '', lastSync: null }, cards: PHRASAL },
  ]
  useDecksStore().apply(decks)

  const srs: Record<string, SrsUser> = {
    teacher: { cards: {}, log: {} },
    1: { cards: { [BASIC[0].id]: { ease: 2.5, interval: 3, reps: 2, lapses: 0, first: iso(-5), last: iso(-3), due: iso(0) },
                  [BASIC[2].id]: { ease: 2.3, interval: 0, reps: 0, lapses: 1, first: iso(-1), last: iso(-1), due: iso(0) },
                  [BASIC[1].id]: { ease: 2.6, interval: 9, reps: 3, lapses: 0, first: iso(-9), last: iso(-1), due: iso(8) } },
         log: { [iso(-2)]: 6, [iso(-1)]: 9 } },
  }
  useSrsStore().apply(srs)

  // Демо-расписание: уроки из демо-путей, попавшие в текущую или следующую неделю (без этого таблица в `npm run dev` была бы пустой)
  const wk = [...weekDates(0), ...weekDates(1)], used = new Set<string>(), lessons = []
  for (const st of DEMO_STUDENTS) for (const n of flat(paths[st.id])) {
    const hour = parseInt(n.time ?? '', 10), k = slotKey(n.date ?? '', hour)
    if (n.type !== 'tutor' || !n.date || !wk.includes(n.date) || used.has(k)) continue
    used.add(k); lessons.push({ id: `demo-${newId('l')}`, date: n.date, hour, studentIds: [st.id] })
  }
  useScheduleStore().set(lessons)
}

import { reactive, computed } from 'vue'

export const state = reactive({
  role: 'student',            // 'student' | 'teacher' — в проде приходит с бэкенда после Telegram-авторизации
  tab: 'path',
  teacher: { name: 'Анна', username: 'your_teacher_username' },
  students: [
    { id: 1, name: 'Иван', level: 'B1', streak: 12, coins: 340,
      payment: { status: 'paid', until: '2026-11-30', lessonsLeft: 2, packageSize: 8 } },
    { id: 2, name: 'Мария', level: 'A2', streak: 3, coins: 80,
      payment: { status: 'due', until: '2026-10-28', lessonsLeft: 0, packageSize: 8 } },
  ],
  currentStudentId: 1,
  lessons: [
    { id: 1, studentId: 1, date: '2026-10-26', time: '18:00', topic: 'Present Perfect', link: 'https://meet.google.com' },
    { id: 2, studentId: 2, date: '2026-10-27', time: '19:30', topic: 'Travel vocabulary', link: 'https://meet.google.com' },
    { id: 3, studentId: 1, date: '2026-10-29', time: '18:00', topic: 'Conditionals', link: 'https://meet.google.com' },
  ],
  homework: [{ id: 1, studentId: 1, title: 'Exercise 4, p.52', description: 'Write 8 sentences.', due: '2026-10-26', done: false }],
  decks: [{ id: 1, studentId: 1, title: 'Business Basics', cards: [
    { front: 'deadline', back: 'крайний срок' }, { front: 'to postpone', back: 'откладывать' }, { front: 'reliable', back: 'надёжный' } ] }],
  sentReminders: [],
  // Лента ученика: type = tutor | lesson | cards | hw | audio | test; date привязывает узел к календарю
  path: [
    { title: 'Unit 1 · Present Perfect', sub: 'Опыт и результаты', nodes: [
      { id: 1, type: 'tutor', title: 'Урок с учителем', date: '2026-10-20', time: '18:00', xp: 30, done: true },
      { id: 2, type: 'cards', title: 'Слова', date: '2026-10-22', xp: 15, done: true },
      { id: 3, type: 'hw', title: 'ДЗ: упр. 4', date: '2026-10-26', xp: 20, done: false, desc: 'Exercise 4, p.52: 8 предложений в Present Perfect.' },
      { id: 4, type: 'tutor', title: 'Урок: Present Perfect', date: '2026-10-26', time: '18:00', xp: 30, done: false, link: 'https://meet.google.com' },
      { id: 5, type: 'audio', title: 'Listening', date: '2026-10-28', xp: 15, done: false, desc: 'BBC 6 Minute English, 5 вопросов.' },
      { id: 6, type: 'test', title: 'Мини-тест', date: '2026-10-29', xp: 30, done: false, desc: '10 вопросов по юниту.' },
    ] },
    { title: 'Unit 2 · Conditionals', sub: 'Zero, first, second', nodes: [
      { id: 7, type: 'tutor', title: 'Урок: Conditionals', date: '2026-10-29', time: '18:00', xp: 30, done: false },
      { id: 8, type: 'hw', title: 'ДЗ: if-фразы', date: '2026-11-01', xp: 20, done: false, desc: '6 предложений с first conditional.' },
      { id: 9, type: 'test', title: 'Финальный тест', date: '2026-11-03', xp: 40, done: false, desc: 'Итог двух юнитов.' },
    ] },
  ],
})

export const student = computed(() => state.students.find(s => s.id === state.currentStudentId))
export const myLessons = computed(() => state.lessons.filter(l => l.studentId === state.currentStudentId))
export const myDecks = computed(() => state.decks.filter(d => d.studentId === state.currentStudentId))
const allNodes = computed(() => state.path.flatMap(u => u.nodes))
export const currentNodeId = computed(() => allNodes.value.find(n => !n.done)?.id)
export const progressPct = computed(() => Math.round(allNodes.value.filter(n => n.done).length / allNodes.value.length * 100))
export const needsPayment = computed(() => student.value.payment.status !== 'paid' || student.value.payment.lessonsLeft <= 2)
export const completeNode = (n) => { n.done = true; student.value.coins += n.xp }

export const fmtDate = (d) => new Date(d + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
export const relDay = (d) => {
  const n = Math.round((new Date(d + 'T00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5)
  return n < 0 ? 'Прошло' : n === 0 ? 'Сегодня' : n === 1 ? 'Завтра' : `Через ${n} дн.`
}

export const TABS = {
  student: [
    { id: 'path', label: 'Путь', icon: 'route' },
    { id: 'cards', label: 'Слова', icon: 'cards' },
    { id: 'lessons', label: 'Уроки', icon: 'calendar' },
    { id: 'profile', label: 'Профиль', icon: 'user' },
  ],
  teacher: [
    { id: 'schedule', label: 'Расписание', icon: 'calendar' },
    { id: 'homework', label: 'ДЗ', icon: 'pencil' },
    { id: 'decks', label: 'Наборы', icon: 'cards' },
    { id: 'remind', label: 'Напомнить', icon: 'bell' },
  ],
}
export function setRole(role) { state.role = role; state.tab = TABS[role][0].id }

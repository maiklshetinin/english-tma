import { reactive, computed } from 'vue'

// Единый реактивный стор (замените на Pinia / API при желании)
export const state = reactive({
  role: 'student',            // 'student' | 'teacher'
  tab: 'home',
  teacher: { name: 'Анна', username: 'your_teacher_username' },
  students: [
    { id: 1, name: 'Иван', level: 'B1', streak: 12, progress: 68,
      payment: { status: 'paid', until: '2026-11-30', lessonsLeft: 6 } },
    { id: 2, name: 'Мария', level: 'A2', streak: 3, progress: 35,
      payment: { status: 'due', until: '2026-10-28', lessonsLeft: 0 } },
  ],
  currentStudentId: 1,
  lessons: [
    { id: 1, studentId: 1, date: '2026-10-26', time: '18:00', topic: 'Present Perfect', link: 'https://meet.google.com' },
    { id: 2, studentId: 2, date: '2026-10-27', time: '19:30', topic: 'Travel vocabulary', link: 'https://meet.google.com' },
    { id: 3, studentId: 1, date: '2026-10-29', time: '18:00', topic: 'Conditionals', link: 'https://meet.google.com' },
  ],
  homework: [
    { id: 1, studentId: 1, title: 'Exercise 4, p.52', description: 'Write 8 sentences in Present Perfect.', due: '2026-10-26', done: false },
    { id: 2, studentId: 1, title: 'Listening: BBC 6 Minute', description: 'Answer 5 questions.', due: '2026-10-20', done: true },
  ],
  decks: [
    { id: 1, studentId: 1, title: 'Business Basics', cards: [
      { front: 'deadline', back: 'крайний срок' },
      { front: 'to postpone', back: 'откладывать' },
      { front: 'reliable', back: 'надёжный' },
    ] },
  ],
  sentReminders: [],
})

export const student = computed(() => state.students.find(s => s.id === state.currentStudentId))
export const myLessons = computed(() => state.lessons.filter(l => l.studentId === state.currentStudentId))
export const myHomework = computed(() => state.homework.filter(h => h.studentId === state.currentStudentId))
export const myDecks = computed(() => state.decks.filter(d => d.studentId === state.currentStudentId))
export const nextLesson = computed(() => [...myLessons.value].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0])

export const TABS = {
  student: [
    { id: 'home', label: 'Главная', icon: '🏠' },
    { id: 'homework', label: 'ДЗ', icon: '📝' },
    { id: 'cards', label: 'Карточки', icon: '🃏' },
    { id: 'schedule', label: 'Уроки', icon: '📅' },
  ],
  teacher: [
    { id: 'schedule', label: 'Расписание', icon: '📅' },
    { id: 'homework', label: 'ДЗ', icon: '📝' },
    { id: 'decks', label: 'Наборы', icon: '🃏' },
    { id: 'remind', label: 'Напомнить', icon: '🔔' },
  ],
}

export function setRole(role) { state.role = role; state.tab = TABS[role][0].id }

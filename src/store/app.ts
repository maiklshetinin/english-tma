// «Вычисляемое про меня»: текущий ученик / его путь / колоды, вкладки, подписи. Где сейчас пользователь (вкладка, открытый ученик) — в адресе, см. router.ts.
// Данные (ученики, расписание, путь, колоды, повторения) и вход живут в Pinia — stores/*.ts. Здесь они только собираются вместе.
import { computed } from 'vue'
import type { Role } from '../../server/types'
import { useAuthStore } from '../stores/auth'
import { useDecksStore } from '../stores/decks'
import { usePathStore } from '../stores/path'
import { useScheduleStore } from '../stores/schedule'
import { useStudentsStore } from '../stores/students'
import { hh } from '../utils/dates'
import { priceAt } from '../utils/price'
import { currentIdOf, pctOf } from '../utils/path'

// Даты, подписи и расписание-утилиты — в utils/dates.ts, конструктор пути — в utils/path.ts; реэкспорт, чтобы компонентам хватало одного импорта
export * from '../utils/dates'
export * from '../utils/path'
export { slotKey } from '../stores/schedule'

export const student = computed(() => useStudentsStore().byId(useAuthStore().currentStudentId))
export const myPath = computed(() => usePathStore().of(useAuthStore().currentStudentId))
export const currentNodeId = computed(() => currentIdOf(myPath.value))
export const progressPct = computed(() => pctOf(myPath.value))
export const needsPayment = computed(() => !!student.value && (student.value.payment.status !== 'paid' || student.value.payment.lessonsLeft <= 2))
export const userKeyNow = computed(() => { const a = useAuthStore(); return a.role === 'teacher' ? 'teacher' : a.currentStudentId })
export const myDecks = computed(() => useDecksStore().forUser(useAuthStore().currentStudentId))
/** Колода кружка; если не указана (или её нет) — первая доступная текущему ученику. */
export const deckOf = (n: { deckId?: string }) => useDecksStore().byId(n.deckId) || myDecks.value[0]

// Строки «ученик — урок» для вкладки «Уроки» (у группового урока по строке на каждого ученика).
// Цена: у проведённого урока — зафиксированная при отметке, у запланированного — по истории цен на время урока; отменённый учеником — без оплаты.
export const allLessons = computed(() => useScheduleStore().lessons.flatMap((l) => l.studentIds.map((sid) => {
  const st = useStudentsStore().findAny(sid)                                                 // и архивный: проведённые уроки с ним остаются в истории
  return {
    id: `${l.id}:${sid}`, lesson: l, title: 'Урок', date: l.date, hour: l.hour, time: hh(l.hour, l.minute), done: !!l.done, studentId: sid, studentName: st ? (st.archived ? `${st.name} (в архиве)` : st.name) : (l.names?.[sid] ? `${l.names[sid]} (удалён)` : ''),
    canceled: !!l.canceled?.[sid],                                                                // отменил ученик — без оплаты
    price: l.canceled?.[sid] ? 0 : l.done && l.prices?.[sid] != null ? l.prices[sid] : priceAt(st, l.date, l.hour),
  }
})).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)))

export const TABS: Record<Role, { id: string; label: string; icon: string }[]> = {
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
export const handle = (s: { username?: string; status?: string }) => (s.username ? '@' + s.username : s.status === 'invited' ? 'ждёт приглашения' : '')   // подпись под именем ученика

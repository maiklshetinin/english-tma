// Какие данные нужны какому экрану — и как они читаются. Раньше при входе читалось всё подряд (ученики, архив, расписание, группы,
// путь, колоды, прогресс слов), и обновление страницы внутри урока запускало десяток запросов «про другие вкладки».
// Теперь при входе читается только роль и (у ученика) его запись, а остальное — когда открывается экран, которому оно нужно:
//  • screenNeeds(route, role) — список нужного для адреса; внутри открытого урока (#/path?l=…) — ничего, урок грузит своё сам;
//  • loadNeeds(needs) — прочитать то, что ещё не читалось или устарело (кэш и «один запрос на двоих» — stores/lazy.ts);
//  • refresh(keys) — когда коллега изменил данные или человек вернулся: нужное экрану читается заново, остальное помечается устаревшим.
// Вызывает всё это App.vue: при входе, при смене вкладки и при закрытии урока.
import type { Role } from '../../server/types'
import { refreshOnReturn } from '../composables/useActive'
import { showToast } from '../composables/useToast'
import { isDemo } from '../firebase'
import { useContentStore } from './content'
import { groupsFromLessons, useGroupsStore } from './groups'
import { isLoaded, load, loadedKeys, markStale } from './lazy'
import { useScheduleStore } from './schedule'
import { useStudentsStore } from './students'

/** Что можно прочитать. content — путь, пресеты и колоды (GET /content), srs — прогресс слов (GET /srs). */
export type Need = 'students' | 'archived' | 'schedule' | 'groups' | 'content' | 'srs'

async function readGroups(): Promise<void> {
  // Старые группы из расписания один раз переносятся на сервер — для этого нужны и ученики, и уроки; не прочитались — не переносим
  const [st, sc] = await Promise.all([need('students').then(() => true, () => false), need('schedule').then(() => true, () => false)])
  const students = useStudentsStore(), schedule = useScheduleStore()
  await useGroupsStore().load(st && sc ? () => groupsFromLessons(schedule.lessons, new Set(students.list.map((s) => s.id))) : undefined)
}

const READ: Record<Need, () => Promise<unknown>> = {
  students: () => useStudentsStore().load(),
  archived: () => useStudentsStore().loadArchived(),      // проведённые уроки с архивными учениками показываются серым, «в архиве»
  schedule: () => useScheduleStore().load(),
  groups: readGroups,
  content: () => useContentStore().loadContent(),
  srs: () => useContentStore().loadSrs(),
}

/** Прочитать (если ещё не читалось, устарело или force). */
export const need = (key: Need, o: { force?: boolean } = {}): Promise<void> => load(key, READ[key], o)

const WHAT: Record<Need, string> = {
  students: 'учеников', archived: 'архив учеников', schedule: 'расписание', groups: 'группы', content: 'путь и колоды', srs: 'прогресс слов',
}

/** Прочитать всё перечисленное. Ошибки — тостом (экран открывается с тем, что есть), сами не пробрасываются. */
export async function loadNeeds(keys: Need[]): Promise<void> {
  const res = await Promise.allSettled(keys.map((k) => need(k)))
  res.forEach((r, i) => { if (r.status === 'rejected') showToast((r.reason as Error)?.message || `Не удалось загрузить ${WHAT[keys[i]]}`, null, 'bad') })
}

// Что нужно каждому экрану (имя маршрута из router.ts). Чего здесь нет — экран ничего не ждёт от общих данных.
//  • У ученика запись (students) читается при входе — без неё его в приложение не пускают; здесь она держится свежей
//    (оплата и «осталось уроков» видны в нижней панели).
//  • Расписание на «Главной» экран перечитывает сам при открытии и смене недели; здесь оно нужно, чтобы группы могли перенестись.
const TEACHER: Record<string, Need[]> = {
  home: ['students', 'archived', 'schedule', 'groups'],
  students: ['students', 'archived', 'schedule', 'groups', 'content'],
  words: ['content', 'srs'],
  'cards-studio': ['content'],
  courses: ['content'],             // редактор курса: колоды для выбора карточек
  info: ['students', 'archived'],
  profile: ['students'],            // «Режим ученика» и подсказка «Сначала добавьте ученика»
}
const STUDENT: Record<string, Need[]> = {
  path: ['students', 'content', 'srs'],
  review: ['students'],
  'review-algo': ['students'],
  cards: ['students', 'content', 'srs'],
  lessons: ['students', 'schedule'],
  profile: ['students', 'content', 'srs'],
}

type Where = { name?: unknown; params?: Record<string, unknown>; query?: Record<string, unknown> }

/** Открыт урок курса: адрес #/path?c=…&l=… (CourseViewer пишет его сам). Обновление страницы здесь — только то, что нужно уроку. */
export const inLesson = (r: Where): boolean => r.name === 'path' && !!r.query?.l

export function screenNeeds(r: Where, role: Role): Need[] {
  if (isDemo || inLesson(r)) return []      // в демо всё уже в памяти
  const name = String(r.name ?? '')
  const base = (role === 'teacher' ? TEACHER : STUDENT)[name] ?? []
  // Карточка ученика у преподавателя (на «Главной» и в «Учениках»): путь, колоды и прогресс слов этого ученика
  const card = role === 'teacher' && !!r.params?.id && (name === 'home' || name === 'students') ? (['content', 'srs'] as Need[]) : []
  return [...new Set([...base, ...card])]
}

/** Что из нужного ещё ни разу не читалось: экран подождёт, чтобы не показать «Пока никого нет» вместо учеников. Устаревшее показывается сразу и обновляется. */
export const unread = (keys: Need[]): Need[] => keys.filter((k) => !isLoaded(k))

// ── Обновление ───────────────────────────────────────────────────────────────────────────────────────────────────────────
let current: Need[] = []
/** App.vue сообщает, что нужно открытому экрану. */
export const setCurrent = (keys: Need[]): void => { current = keys }

/** Коллега изменил (live) / человек вернулся: уже читавшееся и нужное экрану — читаем заново, не нужное сейчас — помечаем, прочитается при входе. */
export function refresh(keys: Need[]): void {
  for (const k of new Set(keys)) {
    if (!isLoaded(k)) continue                    // этого экрана в сессии ещё не открывали — читать нечего
    if (current.includes(k)) need(k, { force: true }).catch(() => {})
    else markStale(k)
  }
}
export const refreshAll = (): void => refresh(loadedKeys() as Need[])

/** Что перечитать, когда сервер сообщил «изменено: what» (useLive 'changed'). */
export const CHANGED: Record<string, Need[]> = {
  students: ['students'], schedule: ['schedule'], groups: ['groups'],
  paths: ['content'], presets: ['content'], decks: ['content'], content: ['content', 'srs'],
}

let off: (() => void) | null = null
/** При возвращении в приложение (не по таймеру — useActive) читаем заново то, что нужно экрану. */
export function startRefresh(): void { stopRefresh(); off = refreshOnReturn(refreshAll) }
export function stopRefresh(): void { off?.(); off = null; current = [] }

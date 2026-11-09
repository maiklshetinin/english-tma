// Курсы у ученика: преподаватель назначает курс (courses/<id>.assigned — id учеников), ученик проходит его в своём «Пути»,
// прогресс — courseProgress/<id ученика>: { c: { <курс>: { done, lessons: { <задание>: { ok, all, sec, at } } } } }.
//  • done — сколько заданий курса подряд пройдено (как progress у курса в редакторе): следующее — «Сейчас». Перескочить вперёд нельзя,
//    пройти заново уже пройденное — можно (результат обновится).
//  • Ученик видит только назначенные ему курсы и только их файлы; пишет только свой прогресс. Преподаватель видит прогресс любого ученика.
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import { fail } from './errors.js'
import { makeAccess } from './access.js'
import { id as cleanId } from './clean.js'
import type { TokenUser } from './types.js'
import type { Course, CourseItem } from './courses.js'

export interface LessonRun { ok: number; all: number; sec: number; at: number }
export interface CourseRun { done: number; lessons: Record<string, LessonRun> }
export interface LearnDeps { db: Firestore; FieldValue: Pick<typeof FV, 'serverTimestamp'>; get: (id: unknown) => Promise<Course & { assigned?: string[] }>; filesOf: (c: Course) => string[]; now?: () => number }

const tasksOf = (c: Pick<Course, 'items'>) => c.items.filter((x) => x.type !== 'unit')
const int = (v: unknown, max: number) => { const n = Number(v ?? 0); if (!Number.isInteger(n) || n < 0 || n > max) throw fail(400, 'bad number'); return n }
const run = (r: Partial<CourseRun> | undefined): CourseRun => ({ done: r?.done ?? 0, lessons: r?.lessons ?? {} })

export function makeLearn({ db, FieldValue, get, filesOf, now = Date.now }: LearnDeps) {
  const courses = () => db.collection('courses'), progress = () => db.collection('courseProgress')
  const access = makeAccess(db)
  const me = async (user: TokenUser) => { const sid = await access.ownStudentId(user); if (!sid) throw fail(403, 'forbidden'); return sid }
  const assignedTo = async (sid: string) => (await courses().where('assigned', 'array-contains', sid).get()).docs
  /** курс, назначенный этому ученику (иначе 404 — чужие курсы ученику «не существуют») */
  const mineCourse = async (sid: string, rawId: unknown) => {
    const c = await get(rawId).catch(() => null)
    if (!c || !(c.assigned ?? []).includes(sid)) throw fail(404, 'course not found')
    return c
  }
  const runsOf = async (sid: string): Promise<Record<string, CourseRun>> => (await progress().doc(sid).get()).data()?.c ?? {}

  return {
    /** Преподаватель: назначить курс ученику / снять */
    async assign(rawCourse: unknown, input: unknown) {
      const b = (input ?? {}) as { studentId?: unknown; on?: unknown }
      const sid = cleanId(b.studentId, 'student id'), on = b.on === true
      const c = await get(rawCourse)
      if (!(await db.collection('students').doc(sid).get()).exists) throw fail(404, 'student not found')
      await db.runTransaction(async (tx) => {
        const ref = courses().doc(c.id), cur: string[] = (await tx.get(ref)).data()?.assigned ?? []
        const next = on ? [...new Set([...cur, sid])] : cur.filter((x) => x !== sid)
        if (next.length > 500) throw fail(413, 'too many students')
        tx.update(ref, { assigned: next })
      })
      return { ok: true }
    },

    /** Ученик: свои курсы (без заданий) и свой прогресс */
    async myList(user: TokenUser) {
      const sid = await me(user), runs = await runsOf(sid)
      const list = (await assignedTo(sid)).map((d) => {
        const items = (d.data().items ?? []) as CourseItem[], total = items.filter((x) => x.type !== 'unit').length
        return { id: d.id, title: d.data().title ?? '', total, done: Math.min(run(runs[d.id]).done, total), updatedAt: d.data().updatedAt?.toMillis?.() }
      })
      return { courses: list.sort((a, b) => a.title.localeCompare(b.title)) }
    },

    /** Ученик: курс целиком (без черновиков с доски) + свой прогресс по нему */
    async myCourse(user: TokenUser, rawId: unknown) {
      const sid = await me(user), c = await mineCourse(sid, rawId)
      return { id: c.id, title: c.title, items: c.items, run: run((await runsOf(sid))[c.id]) }
    },

    /** Ученик прошёл задание: { itemId, ok, all, sec } → прогресс */
    async done(user: TokenUser, rawId: unknown, input: unknown) {
      const sid = await me(user), c = await mineCourse(sid, rawId)
      const b = (input ?? {}) as Record<string, unknown>
      const itemId = String(b.itemId ?? ''), n = tasksOf(c).findIndex((x) => x.id === itemId)
      if (n < 0) throw fail(400, 'bad item')
      const res: LessonRun = { ok: int(b.ok, 1000), all: int(b.all, 1000), sec: int(b.sec, 24 * 3600), at: now() }
      if (res.ok > res.all) throw fail(400, 'bad score')
      let out: CourseRun = { done: 0, lessons: {} }
      await db.runTransaction(async (tx) => {
        const ref = progress().doc(sid), all: Record<string, CourseRun> = (await tx.get(ref)).data()?.c ?? {}
        const r = run(all[c.id])
        if (n > r.done) throw fail(409, 'not yet')                     // перескочить вперёд нельзя
        out = { done: Math.max(r.done, n + 1), lessons: { ...r.lessons, [itemId]: res } }
        tx.set(ref, { c: { ...all, [c.id]: out }, updatedAt: FieldValue.serverTimestamp() })
      })
      return out
    },

    /** Ученик: может ли он смотреть эти файлы (только файлы своих курсов) */
    async allowedKeys(user: TokenUser): Promise<Set<string>> {
      const sid = await me(user)
      return new Set((await assignedTo(sid)).flatMap((d) => filesOf({ ...(d.data() as Course), items: d.data().items ?? [], loose: [] })))
    },

    /** Преподаватель: курсы и прохождение ученика (назначенные — с прогрессом, остальные — чтобы назначить) */
    async ofStudent(rawSid: unknown) {
      const sid = cleanId(rawSid, 'student id'), runs = await runsOf(sid)
      const list = (await courses().get()).docs.map((d) => {
        const x = d.data(), items = (x.items ?? []) as CourseItem[], tasks = items.filter((t) => t.type !== 'unit')
        return { id: d.id, title: x.title ?? '', total: tasks.length, assigned: ((x.assigned ?? []) as string[]).includes(sid),
          run: run(runs[d.id]), tasks: tasks.map((t) => ({ id: t.id, type: t.type, title: t.title ?? '' })) }
      })
      return { courses: list.sort((a, b) => Number(b.assigned) - Number(a.assigned) || a.title.localeCompare(b.title)) }
    },
  }
}

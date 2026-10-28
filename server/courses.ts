// Курсы (редактор «рельс»): courses/<id> — { teacherId, title, mode, progress, items, loose, updatedAt }.
//  • items — задания по порядку на рельсе; loose — черновики на холсте (с x, y); у кружка и фото — file: ключ файла в S3.
//  • Общее рабочее пространство: все преподаватели (TEACHER_IDS) видят и правят все курсы — как учеников и расписание.
//    teacherId — кто создал, updatedBy — кто правил последним (пригодится, когда преподаватели разделятся: claude/multi-tutor-plan.md).
// Ученикам курсы пока не выдаются — это следующий шаг (назначить курс ученику → его «Путь»).
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import { fail } from './login.js'
import { isOurKey } from './storage.js'

export interface CoursesDeps { db: Firestore; FieldValue: Pick<typeof FV, 'serverTimestamp'> }
export const COURSE_TYPES = ['unit', 'video', 'photo', 'lesson', 'words', 'hw', 'test', 'tutor', 'reward']
export const COURSE_ITEMS_MAX = 500, COURSES_MAX = 100
const ID = /^[\w-]{1,64}$/
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(-1e6, Math.min(1e6, v))) : 0)

export interface CourseItem { id: string; type: string; title: string; sub?: string; file?: string; x?: number; y?: number }
export interface Course { id: string; title: string; mode: 'wave' | 'line'; progress: number; items: CourseItem[]; loose: CourseItem[]; updatedAt?: number }

export function makeCourses({ db, FieldValue }: CoursesDeps) {
  const col = () => db.collection('courses')
  const checkId = (v: unknown) => { const id = String(v ?? ''); if (!ID.test(id)) throw fail(400, 'bad id'); return id }
  // Чистим всё, что пришло с сайта: лишние поля выкидываем, длину режем, видео — только свои ключи
  const item = (uid: string, raw: unknown, loose: boolean): CourseItem => {
    const r = (raw ?? {}) as Record<string, unknown>, type = String(r.type)
    if (!ID.test(String(r.id)) || !COURSE_TYPES.includes(type)) throw fail(400, 'bad item')
    const out: CourseItem = { id: String(r.id), type, title: str(r.title, 120) }
    if (type === 'unit') out.sub = str(r.sub, 120)
    if ((type === 'video' || type === 'photo') && r.file != null) {
      const v = String(r.file)
      if (!isOurKey(v)) throw fail(403, 'foreign file')
      out.file = v
    }
    if (loose) { out.x = num(r.x); out.y = num(r.y) }
    return out
  }
  const pub = (id: string, d: Record<string, any>): Course => ({ id, title: d.title ?? '', mode: d.mode === 'line' ? 'line' : 'wave', progress: d.progress ?? 0,
    items: d.items ?? [], loose: d.loose ?? [], updatedAt: d.updatedAt?.toMillis?.() ?? undefined })
  const found = async (id: string) => {
    const s = await col().doc(id).get()
    if (!s.exists) throw fail(404, 'course not found')
    return s
  }

  return {
    /** Список своих курсов (без заданий): [{ id, title, count, updatedAt }] */
    async list() {
      const docs = (await col().get()).docs
      return docs.map((d) => { const c = pub(d.id, d.data()); return { id: c.id, title: c.title, count: c.items.length, updatedAt: c.updatedAt } })
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    },
    async get(rawId: unknown) { const id = checkId(rawId), s = await found(id); return pub(id, s.data()!) },
    /** Сохранить курс целиком (создать, если ещё нет). */
    async put(uid: string, rawId: unknown, input: unknown) {
      const id = checkId(rawId), b = (input ?? {}) as Record<string, unknown>
      if (!Array.isArray(b.items) || !Array.isArray(b.loose ?? [])) throw fail(400, 'items required')
      const items = (b.items as unknown[]).map((x) => item(uid, x, false)), loose = ((b.loose ?? []) as unknown[]).map((x) => item(uid, x, true))
      if (items.length + loose.length > COURSE_ITEMS_MAX) throw fail(413, 'too many items')
      if (new Set([...items, ...loose].map((x) => x.id)).size !== items.length + loose.length) throw fail(400, 'duplicate item id')
      const ref = col().doc(id), s = await ref.get()
      if (!s.exists && (await col().get()).size >= COURSES_MAX) throw fail(413, 'too many courses')
      const tasks = items.filter((x) => x.type !== 'unit').length
      const doc = { updatedBy: uid, title: str(b.title, 120) || 'Без названия', mode: b.mode === 'line' ? 'line' : 'wave',
        progress: Math.max(0, Math.min(tasks, num(b.progress))), items, loose, updatedAt: FieldValue.serverTimestamp() }
      await ref.set(s.exists ? doc : { ...doc, teacherId: uid, createdAt: FieldValue.serverTimestamp() }, { merge: true })
      return { id, ok: true }
    },
    async remove(rawId: unknown) { const id = checkId(rawId); await found(id); await col().doc(id).delete() },
    /** Ключи файлов курса (кружки, фото) — чтобы после удаления курса почистить хранилище */
    filesOf: (c: Pick<Course, 'items' | 'loose'>) => [...c.items, ...c.loose].map((x) => x.file).filter(Boolean) as string[],
  }
}

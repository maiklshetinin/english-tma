// Курсы (редактор «рельс»): courses/<id> — { teacherId, title, mode, progress, items, loose, notes, updatedAt }.
//  • notes — стикеры-заметки на холсте: { id, x, y, text, color }.
//  • items — задания по порядку на рельсе; loose — черновики на холсте (с x, y); у кружка и фото — file: ключ файла в S3.
//  • У урока (и «Слова», «Домашка», «Тест») — steps: экраны интерактивного урока (src/utils/lesson.ts). Файлы экранов — ключи
//    файлов курса в S3 или https-ссылки (фото и озвучка карточек); остальное (файлы, которые пока только в браузере) выкидываем.
//  • Общее рабочее пространство: все преподаватели (TEACHER_IDS) видят и правят все курсы — как учеников и расписание.
//    teacherId — кто создал, updatedBy — кто правил последним (пригодится, когда преподаватели разделятся: claude/multi-tutor-plan.md).
// Ученикам курсы пока не выдаются — это следующий шаг (назначить курс ученику → его «Путь»).
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import { fail } from './login.js'
import { isOurKey } from './storage.js'
import { isMediaUrl } from './media.js'

export interface CoursesDeps { db: Firestore; FieldValue: Pick<typeof FV, 'serverTimestamp'> }
export const COURSE_TYPES = ['unit', 'video', 'photo', 'lesson', 'words', 'hw', 'test', 'tutor', 'reward']
export const COURSE_ITEMS_MAX = 500, COURSES_MAX = 100
export const INTERACTIVE = ['lesson', 'words', 'hw', 'test'], STEP_KINDS = ['intro', 'choice', 'pairs'], STEPS_MAX = 40
const ID = /^[\w-]{1,64}$/
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(-1e6, Math.min(1e6, v))) : 0)

export interface Step { id: string; kind: string; [k: string]: unknown }
export interface CourseItem { id: string; type: string; title: string; sub?: string; file?: string; x?: number; y?: number; steps?: Step[] }
export interface Note { id: string; x: number; y: number; text: string; color: string }
export interface Course { id: string; title: string; mode: 'wave' | 'line'; progress: number; items: CourseItem[]; loose: CourseItem[]; notes: Note[]; updatedAt?: number }
export const NOTE_COLORS = ['#fff1a8', '#c9f2c7', '#cfe8ff', '#ffd6e7', '#e6d9ff'], NOTES_MAX = 200

export function makeCourses({ db, FieldValue }: CoursesDeps) {
  const col = () => db.collection('courses')
  const checkId = (v: unknown) => { const id = String(v ?? ''); if (!ID.test(id)) throw fail(400, 'bad id'); return id }
  // Файл экрана: свой ключ курса или https-ссылка (фото и озвучка карточек); иначе — нет файла
  const ref = (v: unknown) => (typeof v === 'string' && v.length <= 600 && (isOurKey(v) || isMediaUrl(v)) ? v : undefined)
  const put = (o: Record<string, unknown>, k: string, v: unknown) => { if (v !== undefined && v !== '') o[k] = v }
  const step = (raw: unknown): Step => {
    const r = (raw ?? {}) as Record<string, unknown>, kind = String(r.kind)
    if (!ID.test(String(r.id)) || !STEP_KINDS.includes(kind)) throw fail(400, 'bad step')
    const o: Step = { id: String(r.id), kind }
    if (kind === 'intro') { for (const k of ['word', 'tr']) put(o, k, str(r[k], 120)); for (const k of ['ex', 'exTr']) put(o, k, str(r[k], 300)) }
    for (const k of ['image', 'audio', 'video']) put(o, k, ref(r[k]))
    if (kind === 'choice') {
      o.ask = r.ask === 'tr' ? 'tr' : 'audio'; o.show = r.show === 'text' ? 'text' : 'pics'
      o.opts = (Array.isArray(r.opts) ? r.opts : []).slice(0, 4).map((x) => {
        const q = (x ?? {}) as Record<string, unknown>, out: Record<string, unknown> = { w: str(q.w, 120) }
        put(out, 't', str(q.t, 120)); put(out, 'image', ref(q.image)); put(out, 'audio', ref(q.audio))
        return out
      })
      o.ans = Math.max(0, Math.min((o.opts as unknown[]).length - 1, num(r.ans)))
    }
    if (kind === 'pairs') o.pairs = (Array.isArray(r.pairs) ? r.pairs : []).slice(0, 6).map((x) => { const q = (x ?? {}) as Record<string, unknown>; return { a: str(q.a, 120), b: str(q.b, 120) } })
    return o
  }
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
    if (INTERACTIVE.includes(type) && Array.isArray(r.steps)) {
      out.steps = r.steps.slice(0, STEPS_MAX).map(step)
      if (new Set(out.steps.map((x) => x.id)).size !== out.steps.length) throw fail(400, 'duplicate step id')
    }
    if (loose) { out.x = num(r.x); out.y = num(r.y) }
    return out
  }
  const pub = (id: string, d: Record<string, any>): Course => ({ id, title: d.title ?? '', mode: d.mode === 'line' ? 'line' : 'wave', progress: d.progress ?? 0,
    items: d.items ?? [], loose: d.loose ?? [], notes: d.notes ?? [], updatedAt: d.updatedAt?.toMillis?.() ?? undefined })
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
      // Стикеры-заметки на холсте (как в FigJam)
      const notes = (Array.isArray(b.notes) ? b.notes : []).slice(0, NOTES_MAX).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>
        if (!ID.test(String(r.id))) throw fail(400, 'bad note')
        return { id: String(r.id), x: num(r.x), y: num(r.y), text: str(r.text, 1000), color: NOTE_COLORS.includes(String(r.color)) ? String(r.color) : NOTE_COLORS[0] }
      })
      const ref = col().doc(id), s = await ref.get()
      if (!s.exists && (await col().get()).size >= COURSES_MAX) throw fail(413, 'too many courses')
      const tasks = items.filter((x) => x.type !== 'unit').length
      const doc = { updatedBy: uid, title: str(b.title, 120) || 'Без названия', mode: b.mode === 'line' ? 'line' : 'wave',
        progress: Math.max(0, Math.min(tasks, num(b.progress))), items, loose, notes, updatedAt: FieldValue.serverTimestamp() }
      await ref.set(s.exists ? doc : { ...doc, teacherId: uid, createdAt: FieldValue.serverTimestamp() }, { merge: true })
      return { id, ok: true }
    },
    async remove(rawId: unknown) { const id = checkId(rawId); await found(id); await col().doc(id).delete() },
    /** Ключи файлов курса (кружки, фото, файлы экранов уроков) — чтобы после удаления курса почистить хранилище */
    filesOf: (c: Pick<Course, 'items' | 'loose'>) => [...c.items, ...c.loose].flatMap((x) => [x.file, ...(x.steps ?? []).flatMap((s) =>
      [s.image, s.audio, s.video, ...((s.opts as Record<string, unknown>[] | undefined) ?? []).flatMap((o) => [o.image, o.audio])])])
      .filter((k): k is string => typeof k === 'string' && isOurKey(k)),
  }
}

// Review — «Твой словарь»: слова и фразы из пройденных уроков курса и их сила 0–100 (расчёт — на сайте, src/utils/review.ts).
// Документ review/<пользователь> (как srs: id ученика, у преподавателя — 'teacher_<uid>'), поле items — { ключ: запись }.
// Сайт присылает только изменённые записи (пачкой, в конце урока или раз в пару секунд); сервер проверяет форму и пишет
// ТОЛЬКО в документ самого пользователя. Преподаватель может прочитать словарь своего ученика (для карточки ученика).
// Размер: документ Firestore — до 1 МБ, поэтому записей не больше LIMIT_ITEMS, история у слова — последние HIST.
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import { fail } from './errors.js'
import { makeAccess } from './access.js'
import { str, id } from './clean.js'
import type { TokenUser } from './types.js'

export interface ReviewHist { t: number; ok: boolean | null; ex: string; lesson?: string }
export interface ReviewItem {
  key: string; kind: 'word' | 'phrase'; text: string; tr: string; image?: string; audio?: string
  s: number; due: number; seen: number; ok: number; bad: number; hist: ReviewHist[]; course?: string; lesson?: string
}
export interface ReviewResponse { items: Record<string, ReviewItem> }
export interface ReviewDeps { db: Firestore; FieldValue: Pick<typeof FV, 'serverTimestamp'> }

export const REVIEW_LIMITS = { items: 1200, batch: 200, hist: 8 }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const TMAX = 4_102_444_800_000                       // 2100 год — время в мс не дальше
const ms = (v: unknown, what: string) => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > TMAX) throw fail(400, `bad ${what}`); return n }
const cnt = (v: unknown, what: string) => { const n = Number(v ?? 0); if (!Number.isInteger(n) || n < 0 || n > 1e6) throw fail(400, `bad ${what}`); return n }

/** Одна запись словаря: только известные поля нужных типов и длины */
export function cleanReviewItem(v: unknown): ReviewItem {
  if (!isObj(v)) throw fail(400, 'bad review item')
  const key = str(v.key, 'key', 200, true)
  if (key.startsWith('__')) throw fail(400, 'bad key')
  if (v.kind !== 'word' && v.kind !== 'phrase') throw fail(400, 'bad kind')
  const s = Number(v.s); if (!Number.isFinite(s) || s < 0 || s > 100) throw fail(400, 'bad strength')
  if (!Array.isArray(v.hist)) throw fail(400, 'bad hist')
  const hist = v.hist.slice(0, REVIEW_LIMITS.hist).map((h): ReviewHist => {
    if (!isObj(h) || (h.ok !== null && typeof h.ok !== 'boolean')) throw fail(400, 'bad hist')
    const lesson = str(h.lesson, 'lesson', 120)
    return { t: ms(h.t, 'time'), ok: h.ok as boolean | null, ex: str(h.ex, 'exercise', 60), ...(lesson ? { lesson } : {}) }
  })
  const out: ReviewItem = { key, kind: v.kind, text: str(v.text, 'text', 200, true), tr: str(v.tr, 'translation', 200),
    s: Math.round(s * 10) / 10, due: ms(v.due, 'due'), seen: ms(v.seen, 'seen'), ok: cnt(v.ok, 'ok'), bad: cnt(v.bad, 'bad'), hist }
  for (const k of ['image', 'audio'] as const) { const x = str(v[k], k, 500); if (x) out[k] = x }
  for (const k of ['course', 'lesson'] as const) { const x = str(v[k], k, 120); if (x) out[k] = x }
  return out
}

export function makeReview({ db, FieldValue }: ReviewDeps) {
  const col = () => db.collection('review')
  const access = makeAccess(db)
  const mine = async (user: TokenUser): Promise<string> => {
    if (user.role === 'teacher') return `teacher_${user.uid}`
    const sid = await access.ownStudentId(user)
    if (!sid) throw fail(403, 'forbidden')
    return sid
  }
  const items = (d: { items?: Record<string, ReviewItem> } | undefined) => d?.items ?? {}

  return {
    /** Свой словарь; преподаватель с studentId — словарь ученика */
    async get(user: TokenUser, studentId?: unknown): Promise<ReviewResponse> {
      if (studentId != null && studentId !== '') {
        if (user.role !== 'teacher') throw fail(403, 'forbidden')
        return { items: items((await col().doc(id(studentId, 'student id')).get()).data()) }
      }
      return { items: items((await col().doc(await mine(user)).get()).data()) }
    },

    /** Изменённые записи → в свой словарь (остальные не трогаем) */
    async save(user: TokenUser, input: unknown): Promise<{ count: number }> {
      const raw = isObj(input) ? input.items : null
      if (!isObj(raw)) throw fail(400, 'bad body')
      const list = Object.values(raw)
      if (list.length > REVIEW_LIMITS.batch) throw fail(413, 'too many items')
      const clean = list.map(cleanReviewItem), docId = await mine(user)
      let count = 0
      await db.runTransaction(async (tx) => {
        const ref = col().doc(docId), cur = { ...items((await tx.get(ref)).data()) }
        for (const x of clean) cur[x.key] = x
        count = Object.keys(cur).length
        if (count > REVIEW_LIMITS.items) throw fail(413, 'too many words')
        tx.set(ref, { items: cur, updatedAt: FieldValue.serverTimestamp() })
      })
      return { count }
    },

    /** «Очистить»: свой словарь целиком */
    async reset(user: TokenUser): Promise<void> {
      await col().doc(await mine(user)).delete()
    },
  }
}

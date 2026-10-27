// Расписание: уроки и две живые недели (текущая и следующая). Сайт НЕ ходит в Firestore напрямую — только через эти функции.
// Тест: node schedule.test.mjs
//
// Что лежит в базе:
//  • lessons/<id>   — сущность УРОКА: { date, hour, weekStart, studentIds: [...], createdBy, createdAt }.
//                     Учеников в уроке может быть несколько (групповое занятие) — это просто массив studentIds.
//  • schedule/<понедельник недели, YYYY-MM-DD> — НЕДЕЛЯ: { weekStart, slots: { "2026-10-26_09": "<lessonId>", … } }.
//                     Ключ слота — дата и час, значение — id урока. Один слот = один урок (преподаватель один).
// «Текущая» и «следующая» неделя вычисляются по дате (часовой пояс SCHEDULE_TZ), поэтому ничего не нужно «переносить»:
// в понедельник следующая неделя сама становится текущей, а старые недели остаются в базе как история.
import type { Firestore, FieldValue as FV, Transaction, DocumentReference } from 'firebase-admin/firestore'
import { fail } from './login.js'
import { priceAt } from './price.js'
import type { DoneInput, Lesson, LessonDoc, LessonInput, ScheduleResponse, ScheduleWeek, SlotInput, StudentsInput, TokenUser, WeekDoc, CancelInput } from './types.js'

export const HOUR_MIN = 8, HOUR_MAX = 22                 // как в таблице на сайте: 08:00 … 22:00
const ID = /^[\w-]{1,64}$/
const MAX_GROUP = 12

const pad = (n: number) => String(n).padStart(2, '0')
const toYmd = (d: Date) => d.toISOString().slice(0, 10)
const parseYmd = (s: unknown): Date | null => {                                  // 'YYYY-MM-DD' → Date (UTC, полночь) или null, если даты не существует
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) || toYmd(d) !== s ? null : d
}
export const addDays = (s: string, n: number) => { const d = parseYmd(s)!; d.setUTCDate(d.getUTCDate() + n); return toYmd(d) }
export const weekStartOf = (s: string) => addDays(s, -((parseYmd(s)!.getUTCDay() + 6) % 7))      // понедельник той недели, где лежит дата
export const todayIn = (tz: string, now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
export const slotKey = (date: string, hour: number) => `${date}_${pad(hour)}`

const canceledOf = (x: Pick<LessonDoc, 'studentIds' | 'canceled'>) => Object.fromEntries(Object.entries(x.canceled ?? {}).filter(([k]) => x.studentIds.includes(k)))   // только ученики этого урока
const pub = (id: string, x: Pick<LessonDoc, 'date' | 'hour' | 'studentIds' | 'done' | 'prices' | 'names' | 'canceled'>): Lesson => {
  const canceled = canceledOf(x)
  return { id, date: x.date, hour: x.hour, studentIds: [...x.studentIds], done: !!x.done, ...(x.done ? { prices: { ...(x.prices ?? {}) } } : {}),
    ...(x.names && Object.keys(x.names).length ? { names: { ...x.names } } : {}), ...(Object.keys(canceled).length ? { canceled } : {}) }
}
const byTime = (a: Lesson, b: Lesson) => a.date.localeCompare(b.date) || a.hour - b.hour

export interface ScheduleDeps { db: Firestore; FieldValue: Pick<typeof FV, 'serverTimestamp'>; tz?: string; now?: () => Date }

export function makeSchedule({ db, FieldValue, tz = 'Europe/Warsaw', now = () => new Date() }: ScheduleDeps) {
  const lessons = () => db.collection('lessons'), weeks = () => db.collection('schedule'), students = () => db.collection('students')
  const liveWeeks = () => { const w = weekStartOf(todayIn(tz, now())); return [w, addDays(w, 7)] }   // [текущая, следующая]

  // Недели читаем и пишем целиком внутри транзакции: сначала все чтения, потом save() — одним махом
  type LoadedWeek = { ref: DocumentReference; ws: string; slots: WeekDoc['slots'] }
  const weekLoader = (tx: Transaction) => {
    const cache = new Map<string, LoadedWeek>()
    return {
      async get(ws: string): Promise<LoadedWeek> {
        if (!cache.has(ws)) { const ref = weeks().doc(ws); cache.set(ws, { ref, ws, slots: { ...((await tx.get(ref)).get('slots') || {}) } }) }
        return cache.get(ws)!
      },
      save() { for (const w of cache.values()) tx.set(w.ref, { weekStart: w.ws, slots: w.slots }) },
    }
  }
  const slotOf = (input: Partial<SlotInput> | undefined) => {                                // проверка «куда»: дата, час и что неделя — текущая или следующая
    const date = input?.date, hour = input?.hour
    if (typeof date !== 'string' || !parseYmd(date)) throw fail(400, 'bad date')
    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < HOUR_MIN || hour > HOUR_MAX) throw fail(400, 'bad hour')
    const ws = weekStartOf(date)
    if (!liveWeeks().includes(ws)) throw fail(400, 'date outside current and next week')
    return { date, hour, ws, key: slotKey(date, hour) }
  }
  const checkId = (id: unknown) => { if (!ID.test(String(id))) throw fail(400, 'bad id'); return String(id) }

  // Список учеников урока: 1–12 без дублей, каждый существует и не в архиве
  const studentIdsOf = async (raw: unknown): Promise<string[]> => {
    const ids = [...new Set((Array.isArray(raw) ? raw : []).map(checkId))]
    if (!ids.length || ids.length > MAX_GROUP) throw fail(400, `studentIds: 1–${MAX_GROUP}`)
    for (const id of ids) { const st = await students().doc(id).get(); if (!st.exists || st.get('archived')) throw fail(404, 'student not found') }
    return ids
  }

  return {
    liveWeeks,

    // Создаёт документы обеих недель, если их ещё нет (пустые слоты) — «записи в базе на 2 недели»
    async ensureWeeks() {
      await Promise.all(liveWeeks().map(ws => db.runTransaction(async (tx) => {
        const ref = weeks().doc(ws)
        if (!(await tx.get(ref)).exists) tx.set(ref, { weekStart: ws, slots: {} })
      })))
    },

    // Самоочистка: из НЕпроведённых уроков двух живых недель убираем учеников, которых нет среди активных (удалены из базы вручную
    // или в архиве); урок, где никого не осталось, удаляется и освобождает слот. Проведённые уроки — история денег, их не трогаем.
    // Так в расписании не бывает «невидимых» уроков, занимающих ячейку. Возвращает, сколько уроков поправлено.
    async heal(): Promise<number> {
      const alive = new Set((await students().where('archived', '==', false).get()).docs.map((d) => d.id))
      let fixed = 0
      for (const ws of liveWeeks()) {
        for (const d of (await lessons().where('weekStart', '==', ws).get()).docs) {
          if (d.get('done') || (d.get('studentIds') as string[]).every((x) => alive.has(x))) continue
          await db.runTransaction(async (tx) => {
            const l = await tx.get(d.ref); if (!l.exists || l.get('done')) return
            const rest = (l.get('studentIds') as string[]).filter((x) => alive.has(x))
            if (rest.length === l.get('studentIds').length) return
            fixed++
            if (rest.length) return void tx.update(d.ref, { studentIds: rest })
            const W = weekLoader(tx), w = await W.get(l.get('weekStart')), k = slotKey(l.get('date'), l.get('hour'))
            if (w.slots[k] === d.id) delete w.slots[k]
            tx.delete(d.ref); W.save()
          })
        }
      }
      if (fixed) console.log(`  → расписание: убраны ученики-«сироты» из ${fixed} урок(ов)`)
      return fixed
    },

    // Ученик удалён навсегда: убираем его из ВСЕХ уроков (и прошлых недель). Проведённый урок остаётся как история: id и цена
    // ученика в нём сохраняются, а имя записывается в names, чтобы урок читался. Непроведённый — без него; пустой — удаляется.
    async purgeStudent(studentId: string, name: string): Promise<void> {
      checkId(studentId)
      for (const d of (await lessons().where('studentIds', 'array-contains', studentId).get()).docs) {
        await db.runTransaction(async (tx) => {
          const l = await tx.get(d.ref); if (!l.exists) return
          const x = l.data() as LessonDoc
          if (!x.studentIds.includes(studentId)) return
          if (x.done) return void tx.update(d.ref, { names: { ...(x.names ?? {}), [studentId]: name || 'Удалённый ученик' } })
          const rest = x.studentIds.filter((s) => s !== studentId)
          if (rest.length) return void tx.update(d.ref, { studentIds: rest })
          const W = weekLoader(tx), w = await W.get(x.weekStart), k = slotKey(x.date, x.hour)
          if (w.slots[k] === d.id) delete w.slots[k]
          tx.delete(d.ref); W.save()
        })
      }
    },

    // Преподаватель — все уроки двух недель; ученик — только свои (и без чужих учеников в списке); остальным — пусто
    async list(user: TokenUser): Promise<ScheduleResponse> {
      const [cur, next] = liveWeeks()
      let me = null
      if (user.role === 'teacher') { await this.ensureWeeks(); await this.heal() }
      else if (user.role === 'student' && user.studentId) {
        const st = await students().doc(String(user.studentId)).get()
        if (st.exists && !st.get('archived') && `tg:${st.get('tgId')}` === user.uid) me = String(user.studentId)
      }
      const read = async (ws: string): Promise<ScheduleWeek> => {
        if (user.role !== 'teacher' && !me) return { weekStart: ws, lessons: [] }
        let docs = (await lessons().where('weekStart', '==', ws).get()).docs.map((d) => pub(d.id, d.data() as LessonDoc))
        if (me) docs = docs.filter(l => l.studentIds.includes(me)).map(l => ({ ...l, studentIds: [me], ...(l.prices ? { prices: me in l.prices ? { [me]: l.prices[me] } : {} } : {}), names: undefined,
          canceled: l.canceled?.[me] ? { [me]: l.canceled[me] } : undefined }))      // ученик: только он сам и только его цена
        return { weekStart: ws, lessons: docs.sort(byTime) }
      }
      return { current: await read(cur), next: await read(next) }
    },

    // Новый урок в слот. studentIds — один ученик (обычный урок) или несколько (группа).
    async create(input: Partial<LessonInput> | undefined, by: string): Promise<Lesson> {
      const raw = Array.isArray(input?.studentIds) ? input.studentIds : input?.studentId != null ? [input.studentId] : []
      const slot = slotOf(input)
      const ids = await studentIdsOf(raw)
      const ref = lessons().doc(), data = { date: slot.date, hour: slot.hour, studentIds: ids }
      await db.runTransaction(async (tx) => {
        const W = weekLoader(tx), w = await W.get(slot.ws)
        if (w.slots[slot.key]) throw fail(409, 'slot busy')
        w.slots[slot.key] = ref.id
        tx.set(ref, { ...data, weekStart: slot.ws, createdBy: by, createdAt: FieldValue.serverTimestamp() })
        W.save()
      })
      return pub(ref.id, data)
    },

    // Перенос урока в пустой слот (другая неделя тоже можно)
    async move(id: string, input: Partial<SlotInput> | undefined): Promise<Lesson> {
      checkId(id); const slot = slotOf(input); let out: Lesson | undefined
      await db.runTransaction(async (tx) => {
        const ref = lessons().doc(id), l = await tx.get(ref)
        if (!l.exists) throw fail(404, 'lesson not found')
        if (l.get('done')) throw fail(409, 'lesson already conducted')
        const W = weekLoader(tx), from = await W.get(l.get('weekStart')), to = await W.get(slot.ws)
        out = pub(id, { ...(l.data() as LessonDoc), date: slot.date, hour: slot.hour })
        const fromKey = slotKey(l.get('date'), l.get('hour'))
        if (fromKey === slot.key) return                       // уже в этом слоте
        if (to.slots[slot.key]) throw fail(409, 'slot busy')
        delete from.slots[fromKey]
        to.slots[slot.key] = id
        tx.update(ref, { date: slot.date, hour: slot.hour, weekStart: slot.ws })
        W.save()
      })
      return out!
    },

    // Состав урока (группа): новый список учеников целиком — так можно добавить и убрать сразу нескольких.
    // Проведённый урок не меняем (цены уже зафиксированы) — сначала снимите отметку. Пустой урок нельзя: для этого есть «Убрать урок».
    async setStudents(id: string, input: Partial<StudentsInput> | undefined): Promise<Lesson> {
      checkId(id)
      const ids = await studentIdsOf(input?.studentIds); let out: Lesson | undefined
      await db.runTransaction(async (tx) => {
        const ref = lessons().doc(id), l = await tx.get(ref)
        if (!l.exists) throw fail(404, 'lesson not found')
        if (l.get('done')) throw fail(409, 'lesson already conducted')
        const canceled = canceledOf({ studentIds: ids, canceled: l.get('canceled') })      // убранный из урока — и его отметка «отменил» уходит
        tx.update(ref, { studentIds: ids, canceled })
        out = pub(id, { ...(l.data() as LessonDoc), studentIds: ids, canceled })
      })
      return out!
    },

    // «Отменил ученик» (по его причине, без оплаты) или вернуть. Урок остаётся в слоте; в группе отмечается каждый ученик отдельно.
    // Проведённый урок не трогаем (цены зафиксированы) — сначала снимите отметку «проведён».
    async setCanceled(id: string, input: Partial<CancelInput> | undefined): Promise<Lesson> {
      checkId(id)
      const sid = checkId(input?.studentId)
      if (typeof input?.canceled !== 'boolean') throw fail(400, 'canceled must be boolean')
      const on = input.canceled; let out: Lesson | undefined
      await db.runTransaction(async (tx) => {
        const ref = lessons().doc(id), l = await tx.get(ref)
        if (!l.exists) throw fail(404, 'lesson not found')
        const d = l.data() as LessonDoc
        if (!d.studentIds.includes(sid)) throw fail(404, 'student not in lesson')
        if (d.done) throw fail(409, 'lesson already conducted')
        const canceled = { ...canceledOf(d) }
        if (on) canceled[sid] = canceled[sid] || now().toISOString(); else delete canceled[sid]
        tx.update(ref, { canceled })
        out = pub(id, { ...d, canceled })
      })
      return out!
    },

    // Два урока меняются слотами
    async swap(aId: string, bId: string): Promise<void> {
      checkId(aId); checkId(bId)
      if (aId === bId) throw fail(400, 'same lesson')
      await db.runTransaction(async (tx) => {
        const [a, b] = [await tx.get(lessons().doc(aId)), await tx.get(lessons().doc(bId))]
        if (!a.exists || !b.exists) throw fail(404, 'lesson not found')
        if (a.get('done') || b.get('done')) throw fail(409, 'lesson already conducted')
        const W = weekLoader(tx), wa = await W.get(a.get('weekStart')), wb = await W.get(b.get('weekStart'))
        const ka = slotKey(a.get('date'), a.get('hour')), kb = slotKey(b.get('date'), b.get('hour'))
        wa.slots[ka] = bId; wb.slots[kb] = aId
        tx.update(a.ref, { date: b.get('date'), hour: b.get('hour'), weekStart: b.get('weekStart') })
        tx.update(b.ref, { date: a.get('date'), hour: a.get('hour'), weekStart: a.get('weekStart') })
        W.save()
      })
    },

    // «Урок проведён» / снять отметку. При отметке цена каждого ученика фиксируется (по истории цен на время урока) и дальше не меняется.
    // Проведённый урок нельзя переносить, менять местами и удалять — сначала снимите отметку.
    async setDone(id: string, input: Partial<DoneInput> | undefined): Promise<Lesson> {
      checkId(id)
      if (typeof input?.done !== 'boolean') throw fail(400, 'done must be boolean')
      const done = input.done; let out: Lesson | undefined
      await db.runTransaction(async (tx) => {
        const ref = lessons().doc(id), l = await tx.get(ref)
        if (!l.exists) throw fail(404, 'lesson not found')
        const d = l.data() as LessonDoc
        if (!!d.done === done) { out = pub(id, d); return }                      // уже в нужном состоянии — ничего не меняем (цены не пересчитываются)
        if (!done && Object.keys(d.names ?? {}).length) throw fail(409, 'lesson has deleted students')   // в уроке ученик, удалённый навсегда: снять отметку — потерять его цену в истории
        if (!done) for (const sid of d.studentIds) {                             // в уроке архивный ученик: без отметки его убрала бы самоочистка — и деньги с ним
          const st = await tx.get(students().doc(sid)); if (!st.exists || st.get('archived')) throw fail(409, 'lesson has archived students')
        }
        const off = canceledOf(d)
        if (done && d.studentIds.every((sid) => off[sid])) throw fail(409, 'all students canceled')     // отменили все — проводить нечего
        const prices: Record<string, number> = {}
        // отменившие ученики не платят: их цены в урок не попадают
        if (done) for (const sid of d.studentIds.filter((x) => !off[x])) { const st = await tx.get(students().doc(sid)); prices[sid] = st.exists ? priceAt(st.data() as any, d.date, d.hour) : 0 }
        tx.update(ref, done ? { done: true, prices, doneAt: FieldValue.serverTimestamp() } : { done: false, prices: {}, doneAt: null })
        out = pub(id, { ...d, done, prices })
      })
      return out!
    },

    // Урок удаляется, слот освобождается
    async remove(id: string): Promise<void> {
      checkId(id)
      await db.runTransaction(async (tx) => {
        const ref = lessons().doc(id), l = await tx.get(ref)
        if (!l.exists) throw fail(404, 'lesson not found')
        if (l.get('done')) throw fail(409, 'lesson already conducted')
        const W = weekLoader(tx), w = await W.get(l.get('weekStart')), k = slotKey(l.get('date'), l.get('hour'))
        if (w.slots[k] === id) delete w.slots[k]
        tx.delete(ref); W.save()
      })
    },

    // Ученика архивировали: убираем его из НЕпроведённых уроков двух живых недель; если урок остался без учеников — удаляем его.
    // Проведённые уроки не трогаем: ученик и его зафиксированная цена остаются (сайт показывает его серым, «в архиве»).
    async dropStudent(studentId: string): Promise<void> {
      for (const ws of liveWeeks()) {
        for (const d of (await lessons().where('weekStart', '==', ws).get()).docs) {
          if (!d.get('studentIds').includes(studentId) || d.get('done')) continue      // проведённый урок — история денег: ученик в нём остаётся
          await db.runTransaction(async (tx) => {
            const l = await tx.get(d.ref); if (!l.exists || l.get('done')) return
            const rest = l.get('studentIds').filter((x: string) => x !== studentId)
            if (rest.length) return void tx.update(d.ref, { studentIds: rest })
            const W = weekLoader(tx), w = await W.get(ws), k = slotKey(l.get('date'), l.get('hour'))
            if (w.slots[k] === d.id) delete w.slots[k]
            tx.delete(d.ref); W.save()
          })
        }
      }
    },
  }
}

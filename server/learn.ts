// Курсы у ученика: преподаватель назначает курс (courses/<id>.assigned — id учеников), ученик проходит его в своём «Пути»,
// прогресс — courseProgress/<id ученика>: { c: { <курс>: { done, lessons: { <задание>: { ok, all, sec, at } } } } }.
//  • done — сколько заданий курса подряд пройдено (как progress у курса в редакторе): следующее — «Сейчас». Перескочить вперёд нельзя,
//    пройти заново уже пройденное — можно (результат обновится).
//  • Ученик видит только назначенные ему курсы и только их файлы; пишет только свой прогресс. Преподаватель видит прогресс любого ученика.
//  • Преподаватель проходит любой курс («Как видит ученик») по тем же правилам, что ученик: по порядку, ошибки уходят
//    в чекпоинт, прогресс хранится (courseProgress/teacher_<uid>, как словарь Review) и сбрасывается кнопкой.
//  • Журнал (21.11.2026): каждый заход в урок — отдельная запись lessonLogs/<кто>_<run>: какие экраны пройдены, верно / ошибка / без оценки,
//    сколько секунд, с какой попытки и что ответил. Пишется по ходу урока (пачкой раз в несколько секунд и при закрытии), поэтому видно и
//    незаконченный урок. Читается во вкладке Review «Журнал» — по дням: сколько уроков, сколько минут, результат каждого.
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import { fail } from './errors.js'
import { makeAccess } from './access.js'
import { id as cleanId } from './clean.js'
import { cached, dropCache, patchCache } from './cache.js'
import type { TokenUser } from './types.js'
import type { Course, CourseItem } from './courses.js'

export interface LessonRun { ok: number; all: number; sec: number; at: number; miss?: string[] }          // miss — экраны урока, где ученик ошибся (из них собирается чекпоинт Chapter)
export interface CourseRun { done: number; lessons: Record<string, LessonRun> }
/** Пройденный урок для «Аналитики прогресса» — экраны коротко: только то, по чему сайт узнаёт шаблон и его теги */
export interface StepBrief { id: string; kind: string; show?: string; bk?: string; bs?: string; phrase?: string; o?: number; tn?: 1; m?: 1 }
export interface LessonDone { course: string; courseTitle: string; id: string; title: string; unit: string; topic?: string; at: number; ok: number; all: number; sec: number; miss: string[]; steps: StepBrief[] }
const stepBrief = (s: Record<string, unknown>): StepBrief => {
  const o: StepBrief = { id: String(s.id ?? ''), kind: String(s.kind ?? '') }
  for (const k of ['show', 'bk', 'bs', 'phrase'] as const) if (typeof s[k] === 'string' && s[k]) o[k] = (s[k] as string).slice(0, 300)
  if (Array.isArray(s.opts) && s.opts.length) o.o = s.opts.length
  if (s.tn) o.tn = 1
  if (s.audio || s.video) o.m = 1
  return o
}
/** Журнал: экран в одном заходе — ok: верно / ошибка / null без оценки (разговор, «Повтори», интро), sec — сколько пробыл,
 *  t — сколько раз отвечал (ошибся — экран вернётся в конце урока), x — что ответил (текст), sc — балл ИИ «Ответа по смыслу» */
export interface StepLog { ok: boolean | null; sec: number; t: number; x?: string; sc?: number; at?: number }          // at — когда ответил (24.11.2026: журнал по упражнениям)
export interface RunLog { who: string; course: string; item: string; run: string; at: number; upd: number; sec: number; ok: number; all: number; n: number; fin: boolean; steps: Record<string, StepLog> }
/** Заход в журнале для экрана «Журнал»: + названия, номер попытки и экраны по порядку урока (не дошёл — без ok) */
export interface RunView extends Omit<RunLog, 'who' | 'steps'> { courseTitle: string; title: string; type: string; unit: string; try: number; steps: (Partial<StepLog> & { id: string; kind: string; w: string })[] }
const RUN_RE = /^[A-Za-z0-9]{6,32}$/, LOG_MAX = 400
/** экран пройден — на него ответили (оценка, текст ответа или балл ИИ); просто открыл — нет */
export const answered = (e: StepLog) => e.ok !== null || e.t > 0 || !!e.x || e.sc != null
const plain = (v: unknown) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/[*_{}[\]]/g, '').replace(/\s+/g, ' ').trim()
/** короткая подпись экрана в журнале: слово, фраза, вопрос — что есть */
const stepLabel = (s: Record<string, unknown>) => {
  for (const k of ['word', 'phrase', 'text']) { const t = plain(s[k]); if (t) return t.slice(0, 90) }
  if (Array.isArray(s.opts)) { const o = s.opts[s.kind === 'choice' ? Number(s.ans ?? 0) : 0] as { w?: unknown } | undefined; if (plain(o?.w)) return plain(o?.w).slice(0, 90) }
  if (Array.isArray(s.pairs)) return (s.pairs as { a?: unknown }[]).map((p) => plain(p.a)).filter(Boolean).join(', ').slice(0, 90)
  return ''
}
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
  const logs = () => db.collection('lessonLogs')
  // Журнал who целиком — из памяти сервера (cache.ts): раньше каждое «С места», «Журнал» (раз в 10 с) и «Аналитика» читали из базы все его заходы (~300 документов).
  // Правки журнала идут только отсюда: writeLog дописывает заход в кэш, остальное — сбрасывает его (logsDrop)
  const logKey = (who: string) => 'logs:' + who
  const logsOf = async (who: string): Promise<RunLog[]> => (await cached(db, logKey(who), async () => (await logs().where('who', '==', who).get()).docs.map((d) => d.data() as RunLog))).map((r) => ({ ...r }))
  const logsDrop = (who: string) => dropCache(db, logKey(who))
  /** чей прогресс смотрим: свой; преподаватель с studentId — ученика, без — своё прохождение (teacher_<uid>) */
  const whoOf = async (user: TokenUser, studentId?: unknown) => studentId != null && studentId !== ''
    ? (user.role === 'teacher' ? cleanId(studentId, 'student id') : (() => { throw fail(403, 'forbidden') })())
    : user.role === 'teacher' ? `teacher_${user.uid}` : await me(user)
  /** стереть журнал who (весь или одного курса) — вместе со сбросом прогресса */
  async function dropLogs(who: string, course?: string) {
    const docs = (await logs().where('who', '==', who).get()).docs.filter((d) => !course || d.data().course === course)
    try { for (let i = 0; i < docs.length; i += 400) { const b = db.batch(); docs.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit() } } finally { logsDrop(who) }
  }

  /** Записать заход в урок в журнал (весь заход целиком — повтор той же пачки ничего не портит) */
  async function writeLog(who: string, c: Course, input: unknown): Promise<{ ok: true }> {
    const b = (input ?? {}) as Record<string, unknown>
    const runId = String(b.run ?? ''); if (!RUN_RE.test(runId)) throw fail(400, 'bad run')
    const itemId = String(b.itemId ?? ''), item = tasksOf(c).find((x) => x.id === itemId)
    if (!item) throw fail(400, 'bad item')
    const t = now(), at = Number(b.at)
    if (!Number.isInteger(at) || at <= 0 || at > t + 60_000) throw fail(400, 'bad at')
    const raw = b.steps ?? {}
    if (typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > LOG_MAX) throw fail(400, 'bad steps')
    const known = new Set(c.items.flatMap((x) => ((x as { steps?: { id?: string }[] }).steps ?? []).map((s) => String(s.id))))      // чекпоинт собран из экранов других уроков
    const steps: Record<string, StepLog> = {}
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!known.has(id) || !v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const e: StepLog = { ok: o.ok === true ? true : o.ok === false ? false : null, sec: int(o.sec, 24 * 3600), t: int(o.t, 100) }
      if (typeof o.x === 'string' && o.x.trim()) e.x = o.x.trim().slice(0, 400)
      if (o.sc != null) e.sc = int(o.sc, 100)
      { const a = Number(o.at); if (o.at != null && Number.isInteger(a) && a >= at && a <= t + 60_000) e.at = a }          // время ответа; неверное — без него (старые клиенты не шлют)
      steps[id] = e
    }
    const vals = Object.values(steps)
    const doc: RunLog = { who, course: c.id, item: itemId, run: runId, at, upd: t, sec: int(b.sec, 24 * 3600), n: int(b.n, 1000),
      ok: vals.filter((x) => x.ok === true).length, all: vals.filter((x) => x.ok !== null).length, fin: b.fin === true, steps }
    const ref = logs().doc(`${who}_${runId}`)
    await db.runTransaction(async (tx) => {
      const old = (await tx.get(ref)).data() as RunLog | undefined
      if (old && (old.who !== who || old.course !== c.id || old.item !== itemId)) throw fail(409, 'run taken')
      if (old?.fin) doc.fin = true                                       // законченный заход назад «в процессе» не становится
      tx.set(ref, doc)
    })
    patchCache<RunLog[]>(db, logKey(who), (rows) => [...rows.filter((r) => r.run !== runId), doc])          // заход в кэше — на месте, без перечитывания журнала
    return { ok: true }
  }

  /** Записать результат задания в прохождение who (id ученика или teacher_<uid>) */
  async function save(who: string, c: Course, input: unknown): Promise<CourseRun> {
      const b = (input ?? {}) as Record<string, unknown>
      const itemId = String(b.itemId ?? ''), n = tasksOf(c).findIndex((x) => x.id === itemId)
      if (n < 0) throw fail(400, 'bad item')
      const res: LessonRun = { ok: int(b.ok, 1000), all: int(b.all, 1000), sec: int(b.sec, 24 * 3600), at: now() }
      if (res.ok > res.all) throw fail(400, 'bad score')
      if (b.miss != null) {                      // экраны с ошибкой — только этого задания
        if (!Array.isArray(b.miss) || b.miss.length > 200) throw fail(400, 'bad miss')
        const own = new Set((tasksOf(c)[n].steps ?? []).map((s) => (s as { id?: string }).id))
        const miss = [...new Set(b.miss.map(String))].filter((x) => own.has(x))
        if (miss.length) res.miss = miss
      }
      let out: CourseRun = { done: 0, lessons: {} }
      await db.runTransaction(async (tx) => {
        const ref = progress().doc(who), all: Record<string, CourseRun> = (await tx.get(ref)).data()?.c ?? {}
        const r = run(all[c.id])
        if (n > r.done) throw fail(409, 'not yet')                     // перескочить вперёд нельзя — ни ученику, ни преподавателю
        out = { done: Math.max(r.done, n + 1), lessons: { ...r.lessons, [itemId]: res } }
        tx.set(ref, { c: { ...all, [c.id]: out }, updatedAt: FieldValue.serverTimestamp() })
      })
      return out
  }

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
      return { id: c.id, title: c.title, items: c.items, presets: c.presets ?? {}, run: run((await runsOf(sid))[c.id]) }          // presets — общие настройки упражнений курса (промпты)
    },

    /** Преподаватель: своё прохождение курса (для проверки чекпоинтов) */
    async teacherRun(user: TokenUser, rawId: unknown) {
      const c = await get(rawId)
      return run((await runsOf(`teacher_${user.uid}`))[c.id])
    },
    /** Преподаватель прошёл задание сам — так же, как ученик (по порядку), но любой курс */
    async teacherDone(user: TokenUser, rawId: unknown, input: unknown) {
      return save(`teacher_${user.uid}`, await get(rawId), input)
    },
    /** Преподаватель: стереть своё прохождение курса */
    async teacherReset(user: TokenUser, rawId: unknown) {
      const cid = cleanId(rawId, 'course id'), ref = progress().doc(`teacher_${user.uid}`)
      await db.runTransaction(async (tx) => {
        const all: Record<string, CourseRun> = { ...((await tx.get(ref)).data()?.c ?? {}) }
        if (!(cid in all)) return
        delete all[cid]; tx.set(ref, { c: all, updatedAt: FieldValue.serverTimestamp() })
      })
      await dropLogs(`teacher_${user.uid}`, cid)
      return run(undefined)
    },

    /** Ученик прошёл задание: { itemId, ok, all, sec } → прогресс */
    async done(user: TokenUser, rawId: unknown, input: unknown) {
      const sid = await me(user)
      return save(sid, await mineCourse(sid, rawId), input)
    },

    /** Ученик: заход в урок — в журнал (по ходу урока) */
    /** «С места» (26.11.2026): по каждому уроку курса — последний заход: закончен ли и какие экраны в нём сделаны (свой журнал; преподаватель — свой) */
    async resume(user: TokenUser, rawId: unknown) {
      const who = await whoOf(user), cid = String(rawId ?? '')
      const items: Record<string, { at: number; fin: boolean; done: string[] }> = {}
      // 26.11.2026: «Продолжить с N-го» — новый заход, в нём только экраны с N-го. Поэтому сделанное берём из всех заходов после последнего
      // законченного (fin), а не из одного последнего: открыл и сразу вышел — место не теряется
      const runs = (await logsOf(who)).filter((r) => r.course === cid).sort((a, b) => b.at - a.at)
      const stop = new Set<string>()
      for (const r of runs) {
        if (stop.has(r.item)) continue
        const p = items[r.item] ??= { at: r.at, fin: !!r.fin, done: [] }
        if (r.fin) { stop.add(r.item); continue }
        for (const [id, s] of Object.entries(r.steps ?? {})) if ((s.ok === true || s.ok === false || !!s.x || s.sc != null || (s.t ?? 0) > 0) && !p.done.includes(id)) p.done.push(id)
      }
      return { items }
    },
    async log(user: TokenUser, rawId: unknown, input: unknown) {
      const sid = await me(user)
      return writeLog(sid, await mineCourse(sid, rawId), input)
    },
    /** Преподаватель проходит курс сам — его заходы тоже в журнал */
    async teacherLog(user: TokenUser, rawId: unknown, input: unknown) {
      return writeLog(`teacher_${user.uid}`, await get(rawId), input)
    },
    /** Преподаватель: стереть журнал — { runs: [id захода] } выбранные заходы, без runs — весь; studentId — ученика, без — свой.
     *  Прогресс курса, словарь и чекпоинты не меняются. */
    async removeLogs(user: TokenUser, input: unknown) {
      const b = (input ?? {}) as { studentId?: unknown; runs?: unknown; run?: unknown; step?: unknown }
      const who = await whoOf(user, b.studentId)
      if (b.step != null) {          // одна запись журнала — одно упражнение из захода (25.11.2026): { run, step }
        const rid = String(b.run ?? ''), sid = String(b.step)
        if (!RUN_RE.test(rid) || !sid || sid.length > 64) throw fail(400, 'bad step')
        const ref = logs().doc(`${who}_${rid}`)          // id начинается с who — чужой заход так не тронуть
        try { await db.runTransaction(async (tx) => {
          const old = (await tx.get(ref)).data() as RunLog | undefined
          if (!old || !(sid in old.steps)) return
          const steps = { ...old.steps }; delete steps[sid]
          const vals = Object.values(steps), answered = vals.some((x) => x.ok !== null || !!x.x || x.sc != null || x.t > 0)
          if (!answered) { tx.delete(ref); return }          // отвеченных экранов не осталось — заход пустой
          tx.set(ref, { ...old, steps, sec: vals.reduce((a, x) => a + (x.sec || 0), 0), ok: vals.filter((x) => x.ok === true).length, all: vals.filter((x) => x.ok !== null).length })
        }) } finally { logsDrop(who) }
        return { ok: true }
      }
      if (b.runs == null) { await dropLogs(who); return { ok: true } }
      if (!Array.isArray(b.runs) || !b.runs.length || b.runs.length > 300) throw fail(400, 'bad runs')
      const ids = [...new Set(b.runs.map(String))]
      if (ids.some((r) => !RUN_RE.test(r))) throw fail(400, 'bad run')
      const batch = db.batch()
      for (const r of ids) batch.delete(logs().doc(`${who}_${r}`))      // id начинается с who — чужой заход так не удалить
      try { await batch.commit() } finally { logsDrop(who) }
      return { ok: true }
    },
    /** «Журнал» (Review): заходы в уроки — новые сверху, до 300; свой, преподаватель с studentId — ученика */
    async runLogs(user: TokenUser, studentId?: unknown) {
      const who = await whoOf(user, studentId)
      const all = await logsOf(who)
      const tries: Record<string, number> = {}
      for (const r of [...all].sort((a, b) => a.at - b.at)) (r as RunLog & { try?: number }).try = tries[`${r.course}/${r.item}`] = (tries[`${r.course}/${r.item}`] ?? 0) + 1
      const recent = all.sort((a, b) => b.at - a.at).slice(0, 300), cs = new Map<string, Course | null>()
      const out: RunView[] = []
      for (const r of recent) {
        if (!cs.has(r.course)) cs.set(r.course, await get(r.course).catch(() => null))
        const c = cs.get(r.course); if (!c) continue                                      // курс удалили — его заходов нет
        let unit = '', item: (CourseItem & { steps?: Record<string, unknown>[]; sub?: string }) | undefined
        for (const it of c.items as (CourseItem & { steps?: Record<string, unknown>[]; sub?: string })[]) {
          if (it.type === 'unit') unit = `${it.title ?? ''} ${it.sub ?? ''}`.trim()
          else if (it.id === r.item) { item = it; break }
        }
        if (!item) continue
        const byId = new Map(c.items.flatMap((x) => ((x as { steps?: Record<string, unknown>[] }).steps ?? []).map((s) => [String(s.id), s] as const)))
        const ids = item.type === 'checkpoint' ? Object.keys(r.steps) : [...new Set([...(item.steps ?? []).map((s) => String(s.id)), ...Object.keys(r.steps)])]
        const steps = ids.map((id) => { const s = byId.get(id) ?? {}; return { id, kind: String(s.kind ?? ''), w: stepLabel(s), ...(r.steps[id] ?? {}) } })
        const { who: _w, steps: _s, ...rest } = r
        out.push({ ...rest, try: (r as RunLog & { try: number }).try, courseTitle: c.title ?? '', title: item.title ?? '', type: item.type, unit, steps })
      }
      return { runs: out }
    },

    /** Ученик: может ли он смотреть эти файлы (только файлы своих курсов) */
    async allowedKeys(user: TokenUser): Promise<Set<string>> {
      const sid = await me(user)
      return new Set((await assignedTo(sid)).flatMap((d) => filesOf({ ...(d.data() as Course), items: d.data().items ?? [], loose: [] })))
    },

    /** Преподаватель: сбросить прогресс ученика — { what: 'all' } словарь Review и прохождение всех курсов, { what: 'course', courseId } — один курс */
    async reset(rawSid: unknown, input: unknown) {
      const sid = cleanId(rawSid, 'student id'), b = (input ?? {}) as { what?: unknown; courseId?: unknown }
      if (!(await db.collection('students').doc(sid).get()).exists) throw fail(404, 'student not found')
      if (b.what === 'all') {
        const batch = db.batch()
        batch.delete(progress().doc(sid)); batch.delete(db.collection('review').doc(sid))
        await batch.commit(); await dropLogs(sid); return { ok: true }
      }
      if (b.what !== 'course') throw fail(400, 'bad what')
      const cid = cleanId(b.courseId, 'course id')
      await db.runTransaction(async (tx) => {
        const ref = progress().doc(sid), all: Record<string, CourseRun> = { ...((await tx.get(ref)).data()?.c ?? {}) }
        if (!(cid in all)) return
        delete all[cid]; tx.set(ref, { c: all, updatedAt: FieldValue.serverTimestamp() })
      })
      await dropLogs(sid, cid)
      return { ok: true }
    },

    /** «Аналитика прогресса»: пройденные уроки всех курсов — когда, сколько верно, сколько времени и из каких экранов (по ним сайт
     *  считает теги: Чтение / Слух / Письмо / Речь, utils/lesson.ts). Свои; преподаватель с studentId — ученика, без — своё прохождение */
    async lessonsDone(user: TokenUser, studentId?: unknown) {
      const who = await whoOf(user, studentId)
      const runs = await runsOf(who), out: LessonDone[] = []
      for (const [cid, r] of Object.entries(runs)) {
        const c = await get(cid).catch(() => null); if (!c) continue          // курс удалили — его уроков в аналитике нет
        let unit = ''
        for (const it of (c.items ?? []) as (CourseItem & { steps?: Record<string, unknown>[]; topic?: string; sub?: string })[]) {
          if (it.type === 'unit') { unit = `${it.title ?? ''} ${it.sub ?? ''}`.trim(); continue }
          const lr = run(r).lessons[it.id]; if (!lr) continue
          out.push({ course: c.id, courseTitle: c.title ?? '', id: it.id, title: it.title ?? '', unit, ...(it.topic ? { topic: it.topic } : {}),
            at: lr.at, ok: lr.ok, all: lr.all, sec: lr.sec, miss: lr.miss ?? [], steps: (it.steps ?? []).map(stepBrief) })
        }
      }
      return { lessons: out.sort((a, b) => a.at - b.at) }
    },

    /** «Аналитика прогресса» (24.11.2026): пройденные упражнения — каждый экран, на который ответил в любом заходе (даже если урок не закончен).
     *  Вид — как у пройденного урока с одним экраном: так считают те же функции (utils/progress.ts) */
    async exercisesDone(user: TokenUser, studentId?: unknown) {
      const who = await whoOf(user, studentId)
      const all = await logsOf(who), cs = new Map<string, Course | null>()
      const out: LessonDone[] = []
      for (const r of all) {
        if (!cs.has(r.course)) cs.set(r.course, await get(r.course).catch(() => null))
        const c = cs.get(r.course); if (!c) continue
        let unit = '', item: (CourseItem & { steps?: Record<string, unknown>[]; topic?: string; sub?: string }) | undefined
        for (const it of c.items as (CourseItem & { steps?: Record<string, unknown>[]; topic?: string; sub?: string })[]) {
          if (it.type === 'unit') unit = `${it.title ?? ''} ${it.sub ?? ''}`.trim()
          else if (it.id === r.item) { item = it; break }
        }
        if (!item) continue
        const byId = new Map(c.items.flatMap((x) => ((x as { steps?: Record<string, unknown>[] }).steps ?? []).map((s) => [String(s.id), s] as const)))
        for (const [id, e] of Object.entries(r.steps)) {
          if (!answered(e)) continue
          const s = byId.get(id); if (!s) continue
          out.push({ course: c.id, courseTitle: c.title ?? '', id: item.id, title: item.title ?? '', unit, ...(item.topic ? { topic: item.topic } : {}),
            at: e.at ?? r.at, ok: e.ok === true ? 1 : 0, all: e.ok === null ? 0 : 1, sec: e.sec, miss: [], steps: [stepBrief(s)] })
        }
      }
      return { ex: out.sort((a, b) => a.at - b.at) }
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

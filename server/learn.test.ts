// Запуск: npx tsx learn.test.ts — курс у ученика: назначение, прохождение, файлы (без Firebase — база в памяти)
import { store, db, FieldValue } from './fake-db.js'
import { makeCourses } from './courses.js'
import { makeLearn } from './learn.js'
import type { TokenUser } from './types.js'

const C = makeCourses({ db, FieldValue })
const L = makeLearn({ db, FieldValue, get: (id) => C.get(id), filesOf: (c) => C.filesOf(c), now: () => 1000 })
let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const code = async (p: Promise<unknown>) => { try { await p; return 200 } catch (e: any) { return e.status ?? 500 } }

store.set('students/s1', { name: 'Маша', archived: false, tgId: 10 })
store.set('students/s2', { name: 'Петя', archived: false, tgId: 11 })
const masha: TokenUser = { uid: 'tg:10', role: 'student', studentId: 's1' }
const petya: TokenUser = { uid: 'tg:11', role: 'student', studentId: 's2' }
const course = { title: 'A1', items: [{ id: 'u1', type: 'unit', title: 'Chapter 1' }, { id: 'a', type: 'lesson', title: 'Урок 1', steps: [{ id: 's1', kind: 'choice', q: 'Hi', opts: [{ w: 'a' }, { w: 'b' }], ans: 0 }, { id: 's2', kind: 'choice', q: 'Yo', opts: [{ w: 'a' }, { w: 'b' }], ans: 1 }] },
  { id: 'v', type: 'video', title: 'Кружок', file: 't/tg_1/c/k1/x.mp4' }, { id: 'b', type: 'lesson', title: 'Урок 2' }], loose: [{ id: 'l', type: 'photo', title: '', file: 't/tg_1/c/k1/secret.jpg', x: 0, y: 0 }] }
await C.put('tg:1', 'k1', course)
await C.put('tg:1', 'k2', { ...course, title: 'B1', items: [{ id: 'z', type: 'video', title: '', file: 't/tg_1/c/k2/y.mp4' }] })

// --- назначение ---
ok('без назначения ученик курсов не видит', (await L.myList(masha)).courses.length === 0)
ok('чужой курс — 404', (await code(L.myCourse(masha, 'k1'))) === 404)
await L.assign('k1', { studentId: 's1', on: true })
await L.assign('k1', { studentId: 's1', on: true })
ok('назначен (без дублей)', store.get('courses/k1').assigned.join() === 's1')
ok('список ученика: свой курс, 0 из 3', (await L.myList(masha)).courses.map((c) => `${c.id}:${c.done}/${c.total}`).join() === 'k1:0/3')
ok('Петя курс не видит', (await code(L.myCourse(petya, 'k1'))) === 404)
const mc = await L.myCourse(masha, 'k1')
ok('курс ученику — без черновиков доски', mc.items.length === 4 && !('loose' in mc))
await C.put('tg:1', 'k1', { ...course, title: 'A1 правка' })
ok('правка курса в редакторе назначение не сбрасывает', store.get('courses/k1').assigned.join() === 's1')
ok('несуществующий ученик — 404', (await code(L.assign('k1', { studentId: 'nope', on: true }))) === 404)

// --- прохождение ---
ok('перескочить вперёд нельзя — 409', (await code(L.done(masha, 'k1', { itemId: 'b', ok: 1, all: 1, sec: 5 }))) === 409)
let r = await L.done(masha, 'k1', { itemId: 'a', ok: 3, all: 4, sec: 60 })
ok('урок 1 пройден: done 1, результат', r.done === 1 && r.lessons.a.ok === 3 && r.lessons.a.at === 1000)
ok('ошибки урока сохраняются (только его экраны)', (await L.done(masha, 'k1', { itemId: 'a', ok: 1, all: 2, miss: ['s2', 'чужой', 's2'] })).lessons.a.miss?.join() === 's2')
ok('miss не массив — 400', (await code(L.done(masha, 'k1', { itemId: 'a', miss: 'x' }))) === 400)
r = await L.done(masha, 'k1', { itemId: 'v' })
ok('кружок отмечен', r.done === 2)
r = await L.done(masha, 'k1', { itemId: 'a', ok: 4, all: 4, sec: 50 })
ok('пройти заново: результат обновлён, done не уменьшился', r.done === 2 && r.lessons.a.ok === 4)
ok('ok больше all — 400', (await code(L.done(masha, 'k1', { itemId: 'b', ok: 5, all: 4 }))) === 400)
ok('чужое задание — 400', (await code(L.done(masha, 'k1', { itemId: 'u1' }))) === 400)
ok('прогресс в списке', (await L.myList(masha)).courses[0].done === 2)

// --- преподаватель смотрит ---
const of = await L.ofStudent('s1')
ok('у преподавателя: назначенный сверху, с прогрессом и списком заданий', of.courses[0].id === 'k1' && of.courses[0].assigned && of.courses[0].run.done === 2 && of.courses[0].tasks.length === 3 && !of.courses[1].assigned)

// --- файлы ---
const keys = await L.allowedKeys(masha)
ok('файлы: только своих курсов и без черновиков доски', keys.has('t/tg_1/c/k1/x.mp4') && !keys.has('t/tg_1/c/k1/secret.jpg') && !keys.has('t/tg_1/c/k2/y.mp4'))

// --- сброс преподавателем ---
await L.assign('k2', { studentId: 's1', on: true }); await L.done(masha, 'k2', { itemId: 'z' })
store.set('review/s1', { items: { a: {} } })
await L.reset('s1', { what: 'course', courseId: 'k2' })
ok('сброс одного курса: k2 с нуля, k1 на месте', !store.get('courseProgress/s1').c.k2 && store.get('courseProgress/s1').c.k1.done === 2)
ok('плохой what — 400', (await code(L.reset('s1', { what: 'x' }))) === 400)
await L.assign('k2', { studentId: 's1', on: false })

// --- снять ---
await L.assign('k1', { studentId: 's1', on: false })
ok('снят: курс пропал у ученика', (await L.myList(masha)).courses.length === 0 && (await code(L.myCourse(masha, 'k1'))) === 404)
ok('прогресс сохранился (назначат снова — продолжит)', store.get('courseProgress/s1').c.k1.done === 2)

const teacher: TokenUser = { uid: 'tg:1', role: 'teacher' }
ok('преподаватель: своё прохождение пустое', (await L.teacherRun(teacher, 'k1')).done === 0)
ok('преподаватель: вперёд нельзя — как ученику (409)', (await code(L.teacherDone(teacher, 'k1', { itemId: 'b' }))) === 409)
await L.teacherDone(teacher, 'k1', { itemId: 'a', ok: 1, all: 2, miss: ['s1'] })
ok('преподаватель: ошибки сохраняются, курс не назначен — не важно', (await L.teacherRun(teacher, 'k1')).lessons.a.miss?.join() === 's1' && store.has('courseProgress/teacher_tg:1'))
ok('прохождение преподавателя не трогает ученика', store.get('courseProgress/s1')?.c?.k1?.lessons?.a?.miss?.join() !== 's1')
await L.teacherReset(teacher, 'k1')
ok('преподаватель: сброс своего прохождения', (await L.teacherRun(teacher, 'k1')).done === 0)
// --- «Аналитика прогресса»: пройденные уроки с экранами коротко ---
{ const st = await L.lessonsDone(masha)
  const a = st.lessons.find((x) => x.id === 'a')
  ok('пройденные уроки: курс, Chapter, когда, верно / всего, экраны коротко', !!a && a.course === 'k1' && a.unit === 'Chapter 1' && a.at === 1000 && a.steps[0].kind === 'choice' && a.steps[0].o === 2 && !('q' in a.steps[0]))
  ok('непройденных уроков нет', !st.lessons.some((x) => x.id === 'b'))
  ok('преподаватель — уроки ученика; ученик чужие — 403', (await L.lessonsDone({ uid: 'tg:1', role: 'teacher' }, 's1')).lessons.length === st.lessons.length && (await code(L.lessonsDone(petya, 's1'))) === 403)
  ok('преподаватель без ученика — своё прохождение (пусто)', (await L.lessonsDone({ uid: 'tg:1', role: 'teacher' })).lessons.length === 0) }
// --- журнал заходов в уроки (по ходу урока, и незаконченный) ---
await L.assign('k1', { studentId: 's1', on: true })
{ const base = { run: 'run0001', itemId: 'a', at: 900, sec: 30, n: 2 }
  await L.log(masha, 'k1', { ...base, steps: { s1: { ok: false, sec: 12, t: 2, x: '  b  ' }, чужой: { ok: true, sec: 1, t: 1 } } })
  let d = store.get('lessonLogs/s1_run0001')
  ok('журнал: заход записан до конца урока, чужие экраны отброшены', d && !d.fin && d.ok === 0 && d.all === 1 && d.steps.s1.x === 'b' && !('чужой' in d.steps))
  await L.log(masha, 'k1', { ...base, fin: true, steps: { s1: { ok: true, sec: 15, t: 3 } } })
  await L.log(masha, 'k1', { ...base, steps: { s1: { ok: true, sec: 15, t: 3 } } })
  d = store.get('lessonLogs/s1_run0001')
  ok('журнал: та же пачка ещё раз — перезапись, законченный назад не «в процессе»', d.fin === true && d.ok === 1 && d.steps.s1.t === 3)
  await L.log(masha, 'k1', { run: 'run0002', itemId: 'a', at: 950, sec: 5, n: 2, steps: {} })
  ok('журнал: плохой run / задание / время / экраны — 400', (await code(L.log(masha, 'k1', { ...base, run: 'x' }))) === 400 && (await code(L.log(masha, 'k1', { ...base, itemId: 'u1' }))) === 400
    && (await code(L.log(masha, 'k1', { ...base, at: 999999 }))) === 400 && (await code(L.log(masha, 'k1', { ...base, steps: [] }))) === 400 && (await code(L.log(masha, 'k1', { ...base, steps: { s1: { sec: -1 } } }))) === 400)
  ok('журнал: чужой курс — 404', (await code(L.log(petya, 'k1', base))) === 404)
  const { runs } = await L.runLogs(masha)
  ok('журнал: новые сверху, номер попытки, названия, экраны урока по порядку (не дошёл — без ok)', runs.length === 2 && runs[0].run === 'run0002' && runs[0].try === 2 && runs[1].try === 1
    && runs[0].title === 'Урок 1' && runs[0].courseTitle.startsWith('A1') && runs[0].unit === 'Chapter 1' && runs[1].steps[0].id === 's1' && runs[1].steps[0].ok === true && runs[1].steps[0].w === 'a' && runs[0].steps[0].ok === undefined && !('who' in runs[0]))
  ok('журнал: преподаватель видит ученика, ученик чужой — 403', (await L.runLogs(teacher, 's1')).runs.length === 2 && (await code(L.runLogs(petya, 's1'))) === 403)
  await L.log(masha, 'k1', { ...base, run: 'run0003' })
  await L.removeLogs(teacher, { studentId: 's1', runs: ['run0003'] })
  ok('журнал: преподаватель удаляет один заход ученика, остальные на месте', !store.has('lessonLogs/s1_run0003') && store.has('lessonLogs/s1_run0001') && store.has('courseProgress/s1'))
  ok('журнал: плохие runs — 400', (await code(L.removeLogs(teacher, { runs: [] }))) === 400 && (await code(L.removeLogs(teacher, { runs: ['../x'] }))) === 400)
  await L.teacherLog(teacher, 'k1', { ...base, run: 'trun0001' })
  ok('журнал: преподаватель пишет своё, у ученика не видно', (await L.runLogs(teacher)).runs.length === 1 && (await L.runLogs(masha)).runs.length === 2)
  await L.teacherLog(teacher, 'k1', { ...base, run: 'trun0002' }); await L.removeLogs(teacher, {})
  ok('журнал: «Очистить журнал» (свой) — пусто, у ученика на месте', (await L.runLogs(teacher)).runs.length === 0 && (await L.runLogs(masha)).runs.length === 2)
  await L.teacherLog(teacher, 'k1', { ...base, run: 'trun0001' })
  await L.teacherReset(teacher, 'k1')
  ok('журнал: сброс своего прохождения стирает и журнал', (await L.runLogs(teacher)).runs.length === 0)
  await L.reset('s1', { what: 'course', courseId: 'k1' })
  ok('журнал: сброс курса ученика — журнал курса удалён', (await L.runLogs(masha)).runs.length === 0)
  await L.log(masha, 'k1', base) }
await L.reset('s1', { what: 'all' })
ok('сброс всего: журнал тоже', !store.has('lessonLogs/s1_run0001'))
ok('сброс всего: прохождение и словарь ученика удалены', !store.has('courseProgress/s1') && !store.has('review/s1'))

if (bad) { console.log(`\n${bad} FAIL`); process.exit(1) } else console.log('\nall passed')

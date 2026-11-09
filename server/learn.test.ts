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
const course = { title: 'A1', items: [{ id: 'u1', type: 'unit', title: 'Chapter 1' }, { id: 'a', type: 'lesson', title: 'Урок 1' },
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

// --- снять ---
await L.assign('k1', { studentId: 's1', on: false })
ok('снят: курс пропал у ученика', (await L.myList(masha)).courses.length === 0 && (await code(L.myCourse(masha, 'k1'))) === 404)
ok('прогресс сохранился (назначат снова — продолжит)', store.get('courseProgress/s1').c.k1.done === 2)

if (bad) { console.log(`\n${bad} FAIL`); process.exit(1) } else console.log('\nall passed')

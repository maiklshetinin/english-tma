// Запуск: npx tsx courses.test.ts — курсы преподавателя (без Firebase — база в памяти)
import { store, db, FieldValue } from './fake-db.js'
import { makeCourses } from './courses.js'

const C = makeCourses({ db, FieldValue })
let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const code = async (p: Promise<unknown>) => { try { await p; return 200 } catch (e: any) { return e.status ?? 500 } }
const me = 'tg:1', other = 'tg:2'
const course = {
  title: 'Курс A1', mode: 'line', progress: 99,
  items: [{ id: 'u1', type: 'unit', title: 'Юнит 1', sub: 'Present', junk: 'x' }, { id: 'a', type: 'lesson', title: 'Урок' }, { id: 'v', type: 'video', title: 'Кружок', file: 't/tg_1/c/k1/x.mp4' }, { id: 'p', type: 'photo', title: 'Фото', file: 't/tg_1/c/k1/p.jpg' }],
  loose: [{ id: 'l', type: 'words', title: 'Слова', x: 12.6, y: -3 }],
}

ok('сначала пусто', (await C.list(me)).length === 0)
await C.put(me, 'k1', course)
const d = store.get('courses/k1')
ok('сохранён: свой teacherId, лишние поля выкинуты, прогресс не больше числа заданий', d.teacherId === me && !('junk' in d.items[0]) && d.progress === 3 && d.mode === 'line')
ok('черновики с координатами (округлены)', d.loose[0].x === 13 && d.loose[0].y === -3 && !('x' in d.items[1]))
ok('кружок и фото — свои ключи сохранены', d.items[2].file === 't/tg_1/c/k1/x.mp4' && d.items[3].file === 't/tg_1/c/k1/p.jpg')
ok('чужой файл — 403', await code(C.put(me, 'k2', { ...course, items: [{ id: 'v', type: 'photo', title: '', file: 't/tg_2/c/k/x.jpg' }] })) === 403)
const g = await C.get(me, 'k1')
ok('прочитать свой', g.title === 'Курс A1' && g.items.length === 4 && g.loose.length === 1)
ok('чужой не видит и не меняет (403), в списке пусто', await code(C.get(other, 'k1')) === 403 && await code(C.put(other, 'k1', course)) === 403 && (await C.list(other)).length === 0)
ok('список своих', (await C.list(me)).length === 1 && (await C.list(me))[0].count === 4)
ok('неизвестный тип / кривой id / повтор id — 400', await code(C.put(me, 'k1', { items: [{ id: 'a', type: 'boom', title: '' }] })) === 400
  && await code(C.put(me, 'a/b', course)) === 400 && await code(C.put(me, 'k1', { items: [{ id: 'a', type: 'lesson' }, { id: 'a', type: 'test' }] })) === 400)
ok('без items — 400', await code(C.put(me, 'k1', { title: 'x' })) === 400)
ok('длинное название обрезано', (await C.put(me, 'k1', { ...course, title: 'я'.repeat(500) }), store.get('courses/k1').title.length === 120))
ok('файлы курса для чистки', C.filesOf(g).length === 2)
ok('чужой не удалит (403), свой — удалён', await code(C.remove(other, 'k1')) === 403 && (await C.remove(me, 'k1'), !store.has('courses/k1')))
ok('несуществующий — 404', await code(C.get(me, 'nope')) === 404)

if (bad) { console.log(`\n${bad} FAIL`); process.exit(1) } else console.log('\nвсё ок')

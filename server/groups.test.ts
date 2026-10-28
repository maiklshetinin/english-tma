// Запуск: npx tsx groups.test.ts — группы учеников (без Firebase — база в памяти)
import { store, db, FieldValue } from './fake-db.js'
import { makeGroups } from './groups.js'

const G = makeGroups({ db, FieldValue })
let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const code = async (p: Promise<unknown>) => { try { await p; return 200 } catch (e: any) { return e.status ?? 500 } }

store.set('students/a', { name: 'Маша', archived: false })
store.set('students/b', { name: 'Петя', archived: false })
store.set('students/c', { name: 'Оля', archived: false })
store.set('students/z', { name: 'Архив', archived: true })

ok('сначала пусто, перенос ещё не был', JSON.stringify(await G.list()) === JSON.stringify({ groups: [], seeded: false }))
const g = await G.create({ studentIds: ['a', 'b', 'a'] })
ok('создать: повторы убраны, состав сохранён', g.id && JSON.stringify(g.studentIds) === '["a","b"]' && JSON.stringify(store.get(`groups/${g.id}`).studentIds) === '["a","b"]')
ok('один ученик — не группа (400)', await code(G.create({ studentIds: ['a'] })) === 400)
ok('больше 12 — 400', await code(G.create({ studentIds: Array.from({ length: 13 }, (_, i) => 'x' + i) })) === 400)
ok('архивный или несуществующий — 404', await code(G.create({ studentIds: ['a', 'z'] })) === 404 && await code(G.create({ studentIds: ['a', 'nope'] })) === 404)
ok('кривые данные — 400', await code(G.create(null)) === 400 && await code(G.create({ studentIds: 'a,b' })) === 400)

const u = await G.update(g.id, { studentIds: ['a', 'b', 'c'] })
ok('изменить состав', u.studentIds.length === 3 && store.get(`groups/${g.id}`).studentIds.includes('c'))
ok('изменить несуществующую — 404, кривой id — 400', await code(G.update('nope', { studentIds: ['a', 'b'] })) === 404 && await code(G.update('a/b', { studentIds: ['a', 'b'] })) === 400)
ok('изменить до одного ученика — 400', await code(G.update(g.id, { studentIds: ['a'] })) === 400)

// Разовый перенос старых групп из расписания
const s1 = await G.seed({ groups: [['b', 'c'], ['a', 'z'], ['a']] })
ok('перенос: валидные созданы, кривые пропущены, флаг стоит', s1.seeded && s1.groups.length === 2 && store.get('meta/groups').seeded === true)
const s2 = await G.seed({ groups: [['a', 'c']] })
ok('повторный перенос ничего не делает', s2.groups.length === 2)
ok('перенос без groups — 400', await code(G.seed({})) === 400)

await G.remove(g.id)
ok('расформировать', !store.has(`groups/${g.id}`) && (await G.list()).groups.length === 1)
process.exit(bad ? 1 : 0)

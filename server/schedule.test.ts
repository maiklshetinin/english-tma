// Запуск: npx tsx schedule.test.ts  (без Firebase — база в памяти)
import { store, db, FieldValue } from './fake-db.js'
import { makeStudents } from './students.js'
import type { TokenUser } from './types.js'
import { makeSchedule, weekStartOf, addDays, todayIn } from './schedule.js'

let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const code = async (p: Promise<unknown>) => { try { await p; return 200 } catch (e: any) { return e.status ?? 500 } }

// Сегодня — воскресенье 25.10.2026 (Варшава), поэтому текущая неделя = 19–25 окт, следующая = 26 окт – 1 ноя
let clock = new Date('2026-10-25T12:00:00Z')
const S = makeSchedule({ db, FieldValue, tz: 'Europe/Warsaw', now: () => clock })
const ST = makeStudents({ db, FieldValue })
const teacher: TokenUser = { uid: 'tg:1', role: 'teacher' }
const A = '2026-10-21', B = '2026-10-27', FAR = '2026-11-03'      // ср текущей, вт следующей, вторник через неделю

// --- даты ---
ok('понедельник недели: вс 25.10 → 19.10', weekStartOf('2026-10-25') === '2026-10-19' && weekStartOf('2026-10-19') === '2026-10-19')
ok('addDays через границу месяца', addDays('2026-10-30', 3) === '2026-11-02')
ok('часовой пояс: 23:30 UTC в вс уже понедельник в Варшаве', todayIn('Europe/Warsaw', new Date('2026-10-25T23:30:00Z')) === '2026-10-26')

const masha = await ST.create({ name: 'Маша', level: 'A2' }, 'tg:1')
const petya = await ST.create({ name: 'Петя', level: 'B1' }, 'tg:1')
const olya = await ST.create({ name: 'Оля', level: 'B1' }, 'tg:1')

// --- обе недели создаются в базе сразу ---
let v = await S.list(teacher)
ok('обе недели есть в базе, слоты пусты', v.current.weekStart === '2026-10-19' && v.next.weekStart === '2026-10-26'
  && store.has('schedule/2026-10-19') && store.has('schedule/2026-10-26') && !Object.keys(store.get('schedule/2026-10-19').slots).length)
ok('уроков пока нет', !v.current.lessons.length && !v.next.lessons.length)

// --- создание: ученик попал в слот → появилась сущность урока ---
ok('мусорные данные → 400', (await code(S.create({ studentId: masha.id, date: '2026-13-40', hour: 9 }, 'tg:1'))) === 400
  && (await code(S.create({ studentId: masha.id, date: A, hour: 7 }, 'tg:1'))) === 400
  && (await code(S.create({ studentId: masha.id, date: A, hour: 9.5 }, 'tg:1'))) === 400
  && (await code(S.create({ date: A, hour: 9 }, 'tg:1'))) === 400
  && (await code(S.create({ studentId: '../x', date: A, hour: 9 }, 'tg:1'))) === 400)
ok('неделя за пределами «эта + следующая» → 400', (await code(S.create({ studentId: masha.id, date: FAR, hour: 9 }, 'tg:1'))) === 400
  && (await code(S.create({ studentId: masha.id, date: '2026-10-12', hour: 9 }, 'tg:1'))) === 400)
ok('несуществующий ученик → 404', (await code(S.create({ studentId: 'nope', date: A, hour: 9 }, 'tg:1'))) === 404)
const l1 = await S.create({ studentId: masha.id, date: A, hour: 9 }, 'tg:1')
ok('урок создан: сущность в lessons, id слота записан в неделю', store.get(`lessons/${l1.id}`).studentIds[0] === masha.id
  && store.get(`lessons/${l1.id}`).weekStart === '2026-10-19' && store.get('schedule/2026-10-19').slots['2026-10-21_09'] === l1.id)
ok('служебных полей в ответе нет', !('createdBy' in l1) && !('weekStart' in l1))
ok('занятый слот → 409, второй урок не создан', (await code(S.create({ studentId: petya.id, date: A, hour: 9 }, 'tg:1'))) === 409
  && [...store.keys()].filter(k => k.startsWith('lessons/')).length === 1)
const l2 = await S.create({ studentId: petya.id, date: B, hour: 18 }, 'tg:1')
ok('следующая неделя пишется в свой документ', store.get('schedule/2026-10-26').slots['2026-10-27_18'] === l2.id)

// --- группа: несколько учеников в одном уроке ---
const g = await S.create({ studentIds: [masha.id, petya.id, masha.id], date: A, hour: 12 }, 'tg:1')
ok('групповой урок: ученики без дублей', g.studentIds.length === 2)
ok('группа с архивным/чужим учеником → 404', (await code(S.create({ studentIds: [masha.id, 'nope'], date: A, hour: 13 }, 'tg:1'))) === 404)

v = await S.list(teacher)
ok('список: уроки по неделям, по времени', v.current.lessons.map(l => l.id).join() === [l1.id, g.id].join() && v.next.lessons.length === 1)

// --- перенос ---
ok('перенос в занятый слот → 409', (await code(S.move(l1.id, { date: A, hour: 12 }))) === 409)
ok('перенос несуществующего → 404', (await code(S.move('nope', { date: A, hour: 10 }))) === 404)
ok('перенос на неделю вне окна → 400', (await code(S.move(l1.id, { date: FAR, hour: 10 }))) === 400)
await S.move(l1.id, { date: A, hour: 9 })
ok('перенос в тот же слот ничего не ломает', store.get('schedule/2026-10-19').slots['2026-10-21_09'] === l1.id)
const m = await S.move(l1.id, { date: B, hour: 10 })
ok('перенос на другую неделю: старый слот свободен, новый занят, урок обновлён', m.date === B && !('2026-10-21_09' in store.get('schedule/2026-10-19').slots)
  && store.get('schedule/2026-10-26').slots['2026-10-27_10'] === l1.id && store.get(`lessons/${l1.id}`).weekStart === '2026-10-26')

// --- обмен ---
await S.swap(l1.id, l2.id)
ok('обмен: уроки поменялись слотами, в неделях всё сходится', store.get(`lessons/${l1.id}`).hour === 18 && store.get(`lessons/${l2.id}`).hour === 10
  && store.get('schedule/2026-10-26').slots['2026-10-27_18'] === l1.id && store.get('schedule/2026-10-26').slots['2026-10-27_10'] === l2.id)
await S.swap(l1.id, g.id)
ok('обмен между неделями', store.get(`lessons/${l1.id}`).weekStart === '2026-10-19' && store.get(`lessons/${g.id}`).weekStart === '2026-10-26'
  && store.get('schedule/2026-10-19').slots['2026-10-21_12'] === l1.id && store.get('schedule/2026-10-26').slots['2026-10-27_18'] === g.id)
ok('обмен урока с самим собой → 400, с чужим id → 404', (await code(S.swap(l1.id, l1.id))) === 400 && (await code(S.swap(l1.id, 'nope'))) === 404)

// --- удаление ---
await S.remove(l2.id)
ok('удаление: урока нет, слот свободен', !store.has(`lessons/${l2.id}`) && !('2026-10-27_10' in store.get('schedule/2026-10-26').slots))
ok('повторное удаление → 404', (await code(S.remove(l2.id))) === 404)
const again = await S.create({ studentId: petya.id, date: B, hour: 10 }, 'tg:1')
ok('освободившийся слот можно занять снова', !!again.id)

// --- ученик видит только своё ---
store.set(`students/${masha.id}`, { ...store.get(`students/${masha.id}`), tgId: 10, status: 'active' })
const mUser: TokenUser = { uid: 'tg:10', role: 'student', studentId: masha.id }
v = await S.list(mUser)
const mine = [...v.current.lessons, ...v.next.lessons]
ok('ученик видит только уроки со своим участием', mine.length === 2 && mine.every(l => l.studentIds.length === 1 && l.studentIds[0] === masha.id))
ok('ученик с чужим studentId / без роли ничего не видит', ![...(await S.list({ uid: 'tg:10', role: 'student', studentId: petya.id })).current.lessons].length
  && ![...(await S.list({ uid: 'tg:99' })).next.lessons].length)

// --- архив: ученик уходит из уроков, пустой урок удаляется ---
await ST.archive(petya.id); await S.dropStudent(petya.id)
ok('архив: одиночный урок ученика удалён вместе со слотом', !store.has(`lessons/${again.id}`) && !('2026-10-27_10' in store.get('schedule/2026-10-26').slots))
ok('архив: из группы ученик убран, урок остался', JSON.stringify(store.get(`lessons/${g.id}`).studentIds) === JSON.stringify([masha.id]))
ok('архивного ученика нельзя поставить в расписание', (await code(S.create({ studentId: petya.id, date: A, hour: 15 }, 'tg:1'))) === 404)
store.set(`students/${masha.id}`, { ...store.get(`students/${masha.id}`), archived: true })
ok('архивный ученик расписание не читает', ![...(await S.list(mUser)).current.lessons, ...(await S.list(mUser)).next.lessons].length)
store.set(`students/${masha.id}`, { ...store.get(`students/${masha.id}`), archived: false })      // вернули флаг (дальше Маша нужна активной; самоочистка убрала бы её из уроков)

// --- «урок проведён»: статус и зафиксированная цена ---
const kat = await ST.create({ name: 'Катя', price: 100 }, 'tg:1'), lev = await ST.create({ name: 'Лев', price: 80 }, 'tg:1')
const D1 = '2026-10-30'
const dl = await S.create({ studentId: kat.id, date: D1, hour: 8 }, 'tg:1')
const dg = await S.create({ studentIds: [kat.id, lev.id], date: D1, hour: 22 }, 'tg:1')
const find = async (u: TokenUser, id: string) => [...(await S.list(u)).current.lessons, ...(await S.list(u)).next.lessons].find(l => l.id === id)
ok('новый урок: не проведён, цен нет', dl.done === false && !('prices' in dl))
const dd = await S.setDone(dl.id, { done: true })
ok('отметка: done и цена ученика зафиксирована', dd.done === true && dd.prices?.[kat.id] === 100 && store.get(`lessons/${dl.id}`).done === true && store.get(`lessons/${dl.id}`).prices[kat.id] === 100)
// цена ученика потом меняется задним числом — у проведённого урока она остаётся прежней
store.set(`students/${kat.id}`, { ...store.get(`students/${kat.id}`), price: 999, priceHistory: [{ from: '', price: 999 }] })
ok('после смены цены проведённый урок остался по зафиксированной цене', (await find(teacher, dl.id))?.prices?.[kat.id] === 100)
ok('повторная отметка ничего не пересчитывает', (await S.setDone(dl.id, { done: true })).prices?.[kat.id] === 100)
ok('проведённый урок нельзя перенести, поменять, удалить → 409', (await code(S.move(dl.id, { date: D1, hour: 9 }))) === 409 && (await code(S.swap(dl.id, dg.id))) === 409 && (await code(S.swap(dg.id, dl.id))) === 409 && (await code(S.remove(dl.id))) === 409 && store.has(`lessons/${dl.id}`))
const dg2 = await S.setDone(dg.id, { done: true })
ok('групповой урок: цена у каждого ученика своя (по истории на время урока)', dg2.prices?.[lev.id] === 80 && dg2.prices?.[kat.id] === 999)
store.set(`students/${kat.id}`, { ...store.get(`students/${kat.id}`), tgId: 21, status: 'active' })
const kUser: TokenUser = { uid: 'tg:21', role: 'student', studentId: kat.id }
const kDone = await find(kUser, dg.id)
ok('ученик видит статус «проведён» и только свою цену', kDone?.done === true && JSON.stringify(kDone.prices) === JSON.stringify({ [kat.id]: 999 }) && kDone.studentIds.length === 1)
ok('ученик видит и свой первый урок проведённым', (await find(kUser, dl.id))?.done === true)
const un = await S.setDone(dl.id, { done: false })
ok('снять отметку: done=false, цен нет, у ученика статус вернулся', un.done === false && !('prices' in un) && (await find(kUser, dl.id))?.done === false)
ok('после снятия отметки урок снова можно перенести', (await S.move(dl.id, { date: D1, hour: 9 })).hour === 9)
ok('setDone: не boolean → 400, мусорный id → 400, нет урока → 404', (await code(S.setDone(dl.id, { done: 'yes' as any }))) === 400 && (await code(S.setDone(dl.id, undefined))) === 400 && (await code(S.setDone('../x', { done: true }))) === 400 && (await code(S.setDone('nope', { done: true }))) === 404)

// --- состав урока: добавить / убрать учеников (группа) ---
const zoe = await ST.create({ name: 'Зоя', price: 50 }, 'tg:1')
const sl = await S.create({ studentId: lev.id, date: D1, hour: 14 }, 'tg:1')
const sg = await S.setStudents(sl.id, { studentIds: [lev.id, zoe.id, zoe.id] })
ok('состав: ученик добавлен, дубли убраны, урок в том же слоте', JSON.stringify(sg.studentIds) === JSON.stringify([lev.id, zoe.id])
  && JSON.stringify(store.get(`lessons/${sl.id}`).studentIds) === JSON.stringify([lev.id, zoe.id]) && sg.hour === 14 && store.get('schedule/2026-10-26').slots['2026-10-30_14'] === sl.id)
const sr = await S.setStudents(sl.id, { studentIds: [zoe.id] })
ok('состав: ученик убран, урок остался', JSON.stringify(sr.studentIds) === JSON.stringify([zoe.id]) && store.has(`lessons/${sl.id}`))
ok('состав: пусто / больше 12 / мусор → 400', (await code(S.setStudents(sl.id, { studentIds: [] }))) === 400 && (await code(S.setStudents(sl.id, undefined))) === 400
  && (await code(S.setStudents(sl.id, { studentIds: Array.from({ length: 13 }, (_, i) => `x${i}`) }))) === 400 && (await code(S.setStudents(sl.id, { studentIds: ['../x'] }))) === 400)
ok('состав: архивный / несуществующий ученик → 404, нет урока → 404', (await code(S.setStudents(sl.id, { studentIds: [zoe.id, petya.id] }))) === 404
  && (await code(S.setStudents(sl.id, { studentIds: ['nope'] }))) === 404 && (await code(S.setStudents('nope', { studentIds: [zoe.id] }))) === 404)
await S.setStudents(sl.id, { studentIds: [lev.id, zoe.id] })
const sd = await S.setDone(sl.id, { done: true })
ok('группа после правки: при отметке цена фиксируется у каждого', sd.prices?.[lev.id] === 80 && sd.prices?.[zoe.id] === 50)
ok('проведённый урок: состав не меняется → 409', (await code(S.setStudents(sl.id, { studentIds: [zoe.id] }))) === 409 && store.get(`lessons/${sl.id}`).studentIds.length === 2)

// --- самоочистка: ученика удалили из базы вручную / архивировали флагом — его непроведённые уроки чистятся при чтении расписания ---
const h1 = await ST.create({ name: 'Гоша' }, 'tg:1'), h2 = await ST.create({ name: 'Даня' }, 'tg:1')
const solo = await S.create({ studentId: h1.id, date: D1, hour: 16 }, 'tg:1')
const pair = await S.create({ studentIds: [h1.id, h2.id], date: D1, hour: 17 }, 'tg:1')
const kept = await S.create({ studentId: h1.id, date: D1, hour: 18 }, 'tg:1'); await S.setDone(kept.id, { done: true })
store.delete(`students/${h1.id}`)                                                    // как удаление в консоли Firebase
v = await S.list(teacher)
const all = [...v.current.lessons, ...v.next.lessons]
ok('самоочистка: одиночный урок «сироты» удалён, слот свободен', !store.has(`lessons/${solo.id}`) && !('2026-10-30_16' in store.get('schedule/2026-10-26').slots) && !all.some(l => l.id === solo.id))
ok('самоочистка: из группы «сирота» убран, урок остался', JSON.stringify(store.get(`lessons/${pair.id}`).studentIds) === JSON.stringify([h2.id]))
ok('самоочистка: проведённый урок не тронут (история)', JSON.stringify(store.get(`lessons/${kept.id}`).studentIds) === JSON.stringify([h1.id]))
ok('самоочистка: повторно ничего не меняет', (await S.heal()) === 0)

// --- удалить навсегда: уроки (прошлые недели тоже) ---
const p1 = await ST.create({ name: 'Рома', price: 70 }, 'tg:1'), p2 = await ST.create({ name: 'Тая', price: 60 }, 'tg:1')
const pDone = await S.create({ studentIds: [p1.id, p2.id], date: D1, hour: 19 }, 'tg:1'); await S.setDone(pDone.id, { done: true })
const pSolo = await S.create({ studentId: p1.id, date: D1, hour: 20 }, 'tg:1')
const pGroup = await S.create({ studentIds: [p1.id, p2.id], date: D1, hour: 21 }, 'tg:1')
store.set('lessons/old', { date: '2026-10-14', hour: 9, weekStart: '2026-10-12', studentIds: [p1.id], done: true, prices: { [p1.id]: 70 }, createdBy: 'tg:1', createdAt: {} })   // давняя неделя
await S.purgeStudent(p1.id, 'Рома')
ok('удаление: проведённый урок остался с ценой и именем удалённого', store.get(`lessons/${pDone.id}`).studentIds.includes(p1.id) && store.get(`lessons/${pDone.id}`).prices[p1.id] === 70 && store.get(`lessons/${pDone.id}`).names[p1.id] === 'Рома')
ok('удаление: давний проведённый урок тоже получил имя', store.get('lessons/old').names[p1.id] === 'Рома')
ok('удаление: одиночный будущий урок удалён со слотом, из группы — убран', !store.has(`lessons/${pSolo.id}`) && !('2026-10-30_20' in store.get('schedule/2026-10-26').slots)
  && JSON.stringify(store.get(`lessons/${pGroup.id}`).studentIds) === JSON.stringify([p2.id]))
const named = (await find(teacher, pDone.id))!
ok('урок с удалённым навсегда: отметку «проведён» не снять → 409', (await code(S.setDone(pDone.id, { done: false }))) === 409 && store.get(`lessons/${pDone.id}`).done === true)
ok('преподаватель видит имя удалённого в уроке', named.names?.[p1.id] === 'Рома')

// --- «отменил ученик»: без оплаты, урок остаётся в слоте ---
const c1 = await ST.create({ name: 'Ира', price: 100 }, 'tg:1'), c2 = await ST.create({ name: 'Юра', price: 60 }, 'tg:1')
const cl = await S.create({ studentIds: [c1.id, c2.id], date: D1, hour: 10 }, 'tg:1')
const cx = await S.setCanceled(cl.id, { studentId: c1.id, canceled: true })
ok('отмена: отмечен один ученик группы, урок в слоте', !!cx.canceled?.[c1.id] && !cx.canceled?.[c2.id] && store.get('schedule/2026-10-26').slots['2026-10-30_10'] === cl.id)
ok('отмена: мусор → 400, ученик не из урока → 404, нет урока → 404', (await code(S.setCanceled(cl.id, { studentId: c1.id, canceled: 'y' as any }))) === 400
  && (await code(S.setCanceled(cl.id, { studentId: '../x', canceled: true }))) === 400 && (await code(S.setCanceled(cl.id, { studentId: zoe.id, canceled: true }))) === 404
  && (await code(S.setCanceled('nope', { studentId: c1.id, canceled: true }))) === 404)
const cd = await S.setDone(cl.id, { done: true })
ok('проведён: отменивший не платит — его цены в уроке нет', cd.prices?.[c2.id] === 60 && !(c1.id in (cd.prices ?? {})))
ok('проведённый урок: отмену не поменять → 409', (await code(S.setCanceled(cl.id, { studentId: c2.id, canceled: true }))) === 409)
await S.setDone(cl.id, { done: false })
await S.setCanceled(cl.id, { studentId: c2.id, canceled: true })
ok('отменили все: «проведён» нельзя → 409', (await code(S.setDone(cl.id, { done: true }))) === 409)
const back = await S.setCanceled(cl.id, { studentId: c1.id, canceled: false })
ok('вернуть: отметка снята', !back.canceled?.[c1.id] && !!back.canceled?.[c2.id])
await S.setStudents(cl.id, { studentIds: [c1.id] })
ok('убрали ученика из урока — его отметка «отменил» тоже ушла', !store.get(`lessons/${cl.id}`).canceled[c2.id])
await S.setCanceled(cl.id, { studentId: c1.id, canceled: true })
store.set(`students/${c1.id}`, { ...store.get(`students/${c1.id}`), tgId: 31, status: 'active' })
const cMine = await find({ uid: 'tg:31', role: 'student', studentId: c1.id }, cl.id)
ok('ученик видит свою отмену', !!cMine?.canceled?.[c1.id])

// --- архивация не трогает проведённые уроки (деньги остаются) ---
const a1 = await ST.create({ name: 'Ася', price: 90 }, 'tg:1'), a2 = await ST.create({ name: 'Боря', price: 40 }, 'tg:1')
const aSoloDone = await S.create({ studentId: a1.id, date: D1, hour: 11 }, 'tg:1'); await S.setDone(aSoloDone.id, { done: true })
const aGroupDone = await S.create({ studentIds: [a1.id, a2.id], date: D1, hour: 12 }, 'tg:1'); await S.setDone(aGroupDone.id, { done: true })
const aPlanned = await S.create({ studentId: a1.id, date: D1, hour: 13 }, 'tg:1')
await ST.archive(a1.id); await S.dropStudent(a1.id)
ok('архив: проведённый одиночный урок остался с ценой', store.has(`lessons/${aSoloDone.id}`) && store.get(`lessons/${aSoloDone.id}`).prices[a1.id] === 90 && store.get('schedule/2026-10-26').slots['2026-10-30_11'] === aSoloDone.id)
ok('архив: в проведённой группе ученик остался', JSON.stringify(store.get(`lessons/${aGroupDone.id}`).studentIds) === JSON.stringify([a1.id, a2.id]))
ok('архив: запланированный урок удалён', !store.has(`lessons/${aPlanned.id}`))
ok('архив: у проведённого урока с архивным отметку не снять → 409', (await code(S.setDone(aSoloDone.id, { done: false }))) === 409 && store.get(`lessons/${aSoloDone.id}`).done === true)
await S.list(teacher)
ok('самоочистка тоже не трогает проведённые уроки архивного', store.has(`lessons/${aSoloDone.id}`) && store.get(`lessons/${aGroupDone.id}`).studentIds.includes(a1.id))

// --- начало внутри часа и заметка ---
const n1 = await ST.create({ name: 'Нина' }, 'tg:1')
const N1 = '2026-10-31'
const nl = await S.create({ studentId: n1.id, date: N1, hour: 14, minute: 30 }, 'tg:1')
ok('создание с минутой: 14:30', nl.minute === 30 && store.get(`lessons/${nl.id}`).minute === 30)
const nd = await S.setDetails(nl.id, { minute: 15, note: '  принести учебник  ' })
ok('детали: минута и заметка (обрезана по краям)', nd.minute === 15 && nd.note === 'принести учебник')
ok('детали: минута не из 0/15/30/45 → 400, пусто → 400, нет урока → 404', (await code(S.setDetails(nl.id, { minute: 20 }))) === 400 && (await code(S.setDetails(nl.id, {}))) === 400 && (await code(S.setDetails('nope', { minute: 0 }))) === 404)
ok('детали: заметка ограничена 300 символами', (await S.setDetails(nl.id, { note: 'x'.repeat(500) })).note!.length === 300)
ok('минута ноль и пустая заметка не отдаются', !('minute' in (await S.setDetails(nl.id, { minute: 0, note: '' }))))
await S.setDetails(nl.id, { minute: 30, note: 'секрет' })
const moved = await S.move(nl.id, { date: N1, hour: 15 })
ok('перенос сохраняет минуту и заметку', moved.minute === 30 && moved.note === 'секрет')
store.set(`students/${n1.id}`, { ...store.get(`students/${n1.id}`), tgId: 41, status: 'active' })
const nMine = await find({ uid: 'tg:41', role: 'student', studentId: n1.id }, nl.id)
ok('ученик видит время 15:30, но не заметку', nMine?.minute === 30 && !nMine?.note)

// --- история уроков (календарь по месяцам) ---
const h3 = await ST.create({ name: 'Глеб', price: 70 }, 'tg:1'), h4 = await ST.create({ name: 'Дина' }, 'tg:1')
store.set('lessons/past1', { date: '2026-09-15', hour: 10, weekStart: '2026-09-14', studentIds: [h3.id, h4.id], done: true, prices: { [h3.id]: 70, [h4.id]: 50 }, note: 'секрет', createdBy: 'tg:1', createdAt: {} })
const hl = await S.create({ studentId: h3.id, date: '2026-10-31', hour: 18 }, 'tg:1')
store.set(`students/${h3.id}`, { ...store.get(`students/${h3.id}`), tgId: 51, status: 'active' })
const gUser: TokenUser = { uid: 'tg:51', role: 'student', studentId: h3.id }
const hist = await S.history(gUser)
ok('история: прошлые месяцы и текущие уроки, по времени', hist.map(l => l.id).join() === ['past1', hl.id].join())
ok('история ученика: только он сам, своя цена, без заметки', JSON.stringify(hist[0].studentIds) === JSON.stringify([h3.id]) && JSON.stringify(hist[0].prices) === JSON.stringify({ [h3.id]: 70 }) && !hist[0].note)
ok('история: чужой studentId / без роли — пусто', !(await S.history({ uid: 'tg:99', role: 'student', studentId: h3.id })).length && !(await S.history({ uid: 'tg:99' })).length)
const tHist = await S.history(teacher, h4.id)
ok('история у преподавателя: по ?studentId, со всеми учениками и заметкой', tHist.length === 1 && tHist[0].studentIds.length === 2 && tHist[0].note === 'секрет')
ok('история у преподавателя без studentId → 400', (await code(S.history(teacher, undefined))) === 400)

// --- смена недели: в понедельник «следующая» становится «текущей», старая неделя остаётся в базе ---
clock = new Date('2026-10-25T23:30:00Z')                   // уже понедельник 26.10 по Варшаве
v = await S.list(teacher)
ok('в понедельник окно сдвинулось: текущая 26.10, следующая 02.11, прошлая неделя осталась в базе', v.current.weekStart === '2026-10-26' && v.next.weekStart === '2026-11-02'
  && store.has('schedule/2026-10-19') && store.has('schedule/2026-11-02') && v.current.lessons.some(l => l.id === g.id))
process.exit(bad ? 1 : 0)

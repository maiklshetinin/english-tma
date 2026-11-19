// npx tsx activity.test.ts — учёт активности: проверка кусков, склейка ленты, выключатели, запись и чтение дня
import { db, store } from './fake-db.js'
import { clean, merge, makeActivity } from './activity.js'
let fails = 0
const ok = (c: unknown, m: string) => { if (c) console.log('PASS', m); else { fails++; console.log('FAIL', m) } }
const T = Date.parse('2026-11-19T10:00:00Z')

ok(clean(null) === null && clean({ day: 'вчера' }) === null, 'мусор — не кусок')
ok(clean({ day: '2026-11-19' }, T) === null, 'пустой кусок — не кусок')
const c = clean({ day: '2026-11-19', visits: 1, tabs: { home: { open: 60, act: 90 }, 'BAD tab': { open: 5 } }, spans: [{ tab: 'home', a: T, b: T + 60_000, act: 999 }, { tab: 'home', a: T, b: T - 1 }] }, T)!
ok(c.tabs.home.act === 60 && !('BAD tab' in c.tabs), 'активно не больше открытого, кривые вкладки выброшены')
ok(c.spans.length === 1 && c.spans[0].act === 60, 'кривой кусок ленты выброшен, активность куска ≤ его длины')

const who = { uid: 'tg:1', name: 'Аня', role: 'teacher' }
let d = merge(undefined, c, who)
d = merge(d, { day: '2026-11-19', visits: 0, tabs: { home: { open: 30, act: 10 } }, spans: [{ tab: 'home', a: T + 70_000, b: T + 100_000, act: 10 }] }, who)
ok(d.spans.length === 1 && d.spans[0].b === T + 100_000 && d.spans[0].act === 70, 'соседние куски одной вкладки склеились')
d = merge(d, { day: '2026-11-19', visits: 1, tabs: { students: { open: 15, act: 15 } }, spans: [{ tab: 'students', a: T + 100_000, b: T + 115_000, act: 15 }] }, who)
ok(d.spans.length === 2 && d.visits === 2 && d.open === 105 && d.act === 85, 'другая вкладка — новый кусок; счётчики сложились')
ok(d.first === T && d.last === T + 115_000, 'первое и последнее появление')

const act = makeActivity({ db })
await act.load()
ok((await act.record({ uid: 'tg:1', role: 'teacher', tgName: 'Аня' }, c)).on === false && store.size === 0, 'выключено — ничего не пишем')
await act.set({ teachers: true })
ok(store.get('settings/activity')?.teachers === true, 'выключатель сохранён в базе')
ok((await act.record({ uid: 'tg:2', role: 'student' }, c)).on === false, 'ученики выключены отдельно')
ok((await act.record({ uid: 'tg:1', role: 'teacher', tgName: 'Аня' }, c)).on === true, 'преподаватель — записано')
await act.record({ uid: 'tg:1', role: 'teacher', tgName: 'Аня' }, c)
const doc = store.get('activity/tg:1_2026-11-19')
ok(doc?.visits === 2 && doc.tabs.home.open === 120 && doc.name === 'Аня', 'второй кусок добавился к тому же дню')
let bad = false; try { await act.record({ uid: 'tg:1', role: 'teacher' }, { day: 'x' }) } catch (e) { bad = (e as { status?: number }).status === 400 }
ok(bad, 'кривой кусок — 400')
ok((await act.range('2026-11-13', '2026-11-19')).length === 1 && (await act.range('2026-11-20', '2026-11-21')).length === 0, 'чтение по дням')

await act.record({ uid: 'tg:9', role: 'teacher', dev: true, tgName: 'Михаил' }, c)
ok(store.get('activity/tg:9_2026-11-19')?.role === 'dev', 'разработчик подписан как разработчик')

console.log(fails ? `${fails} FAIL` : 'all ok'); process.exit(fails ? 1 : 0)

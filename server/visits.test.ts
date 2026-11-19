// npx tsx visits.test.ts — лог заходов: отметка, устройство, день, очистка
import { db, store, FieldValue } from './fake-db.js'
import { cleanVisit, makeVisits } from './visits.js'
let fails = 0
const ok = (c: unknown, m: string) => { if (c) console.log('PASS', m); else { fails++; console.log('FAIL', m) } }

ok(cleanVisit({ day: 'x' }) === null && cleanVisit(null) === null, 'мусор — не заход')
const c = cleanVisit({ day: '2026-11-19', dev: 'phone', app: 'tg', pf: 'ios<script>' }, 5)!
ok(c.v.dev === 'phone' && c.v.app === 'tg' && c.v.pf === 'iosscript' && c.v.t === 5, 'устройство и платформа, лишние символы выброшены')
ok(cleanVisit({ day: '2026-11-19', dev: 'tv', app: 'x' })!.v.dev === 'desktop', 'непонятное устройство — компьютер, сайт')
ok(cleanVisit({ day: '2026-11-19', ver: '31d4e3a' })!.v.ver === '31d4e3a' && !('ver' in cleanVisit({ day: '2026-11-19', ver: '<x>' })!.v), 'версия сайта — только похожая на коммит')

const v = makeVisits({ db, FieldValue })
const me = { uid: 'tg:1', role: 'teacher', tgName: 'Аня', tgPhoto: 'p.jpg' }
await v.record(me, { day: '2026-11-19', dev: 'phone', app: 'tg', pf: 'android' })
await v.record(me, { day: '2026-11-19', dev: 'desktop', app: 'web' })
await v.record({ uid: 'tg:9', role: 'teacher', dev: true, tgName: 'Михаил' }, { day: '2026-11-18', dev: 'desktop', app: 'tg', pf: 'tdesktop' })
const d = store.get('visits/tg:1_2026-11-19')
ok(d?.n === 2 && d.list[0].dev === 'phone' && d.list[1].app === 'web' && d.photo === 'p.jpg', 'два захода за день: телефон и компьютер')
ok(store.get('visits/tg:9_2026-11-18')?.role === 'dev', 'разработчик подписан отдельно')
ok((await v.range('2026-11-18', '2026-11-19')).length === 2 && (await v.range('2026-11-19', '2026-11-19')).length === 1, 'чтение по дням')
let bad = false; try { await v.record(me, {}) } catch (e) { bad = (e as { status?: number }).status === 400 }
ok(bad, 'кривая отметка — 400')

store.set('activity/tg:1_2026-11-10', { day: '2026-11-10' }); store.set('activity/tg:1_2026-11-19', { day: '2026-11-19' })
ok(await v.clean('activity', '2026-11-19') === 1 && store.has('activity/tg:1_2026-11-19') && !store.has('activity/tg:1_2026-11-10'), 'очистка «старше дня» не трогает сам день')
ok(await v.clean('visits') === 2 && ![...store.keys()].some((k) => k.startsWith('visits/')), 'очистка всего')
bad = false; try { await v.clean('users') } catch (e) { bad = (e as { status?: number }).status === 400 }
ok(bad, 'чужую коллекцию не чистим')

// версия сайта — в записи человека (users): «Версии в приложении» видят её и без сети
await v.record({ uid: 'tg:5', role: 'teacher', tgName: 'Настя' }, { day: '2026-11-19', dev: 'desktop', app: 'web', ver: 'ac39209' })
ok(store.get('users/tg:5')?.ver === 'ac39209' && store.get('users/tg:5')?.verAt > 0, 'версия — в записи человека (users)')
ok(!store.get('users/tg:1')?.ver, 'без версии в записи человека ничего не меняется')
console.log(fails ? `${fails} FAIL` : 'all ok'); process.exit(fails ? 1 : 0)

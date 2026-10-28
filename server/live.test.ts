// Запуск: npx tsx live.test.ts — «кто здесь» и правки в реальном времени (настоящий WebSocket на случайном порту, вход подменён)
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { makeLive } from './live.js'

let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const users: Record<string, { uid: string; role: string; name: string; photo: string }> = {
  a: { uid: 'tg:1', role: 'teacher', name: 'Миша', photo: 'p1' }, d: { uid: 'tg:9', role: 'teacher', name: 'Разработчик', photo: '', dev: true } as any, b: { uid: 'tg:2', role: 'teacher', name: 'Аня', photo: '' }, s: { uid: 'tg:3', role: 'student', name: 'Ученик', photo: '' },
}
const live = makeLive({ origins: ['https://site'], verify: async (t) => users[t] ?? null })
const srv = createServer(); live.attach(srv)
await new Promise<void>((r) => srv.listen(0, r))
const port = (srv.address() as any).port
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
function client(t: string, origin = 'https://site') {
  const ws = new WebSocket(`ws://localhost:${port}/live?t=${t}`, { headers: { origin } }), got: any[] = []
  ws.on('message', (d) => got.push(JSON.parse(String(d))))
  const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)))
  return { ws, got, closed, last: (type: string) => [...got].reverse().find((m) => m.t === type), send: (m: unknown) => ws.send(JSON.stringify(m)) }
}

const A = client('a'); await wait(150)
const B = client('b'); await wait(150)
ok('оба видят двоих: имя, фото, цвет', A.last('presence').users.length === 2 && B.last('presence').users.some((u: any) => u.name === 'Миша' && u.photo === 'p1' && u.color))
const S = client('s'), X = client('nope'), O = client('a', 'https://evil')
ok('ученика, чужой токен и чужой сайт не пускают', await S.closed === 4401 && await X.closed === 4401 && await O.closed === 4403)
A.send({ t: 'where', where: 'courses', course: 'k1' }); B.send({ t: 'where', where: 'home', course: '' }); await wait(100)
ok('где кто — в списке', B.last('presence').users.find((u: any) => u.name === 'Миша').where === 'courses')
A.send({ t: 'cursor', x: 10.123, y: 5 }); await wait(100)
ok('курсор не уходит тем, кто не в этом курсе', !B.last('cursor'))
B.send({ t: 'where', where: 'courses', course: 'k1' }); await wait(80)
A.send({ t: 'cursor', x: 10.123, y: 5 }); A.send({ t: 'sel', id: 'n3' }); A.send({ t: 'doc', doc: { title: 'Новое' } }); await wait(100)
ok('в одном курсе: курсор, выделение и курс приходят коллеге', B.last('cursor')?.x === 10.1 && B.last('sel')?.id === 'n3' && B.last('doc')?.doc.title === 'Новое')
ok('себе своё не приходит', !A.last('cursor') && !A.last('doc'))
A.send({ t: 'pcursor', path: '/students', x: 300, y: 120, click: true }); await wait(80)
ok('курсор на любой странице (режим разработчика) — коллеге, с адресом и кликом', B.last('pcursor')?.path === '/students' && B.last('pcursor')?.click === true && !A.last('pcursor'))
A.send({ t: 'cursors', on: true }); await wait(80)
ok('общие курсоры может включить только разработчик', !B.last('cursors'))
const bCid = B.got.find((m) => m.t === 'hello').cid
live.changed('schedule', bCid); await wait(80)
ok('правка расписания: коллеге «changed», тому, кто правил, — нет', A.last('changed')?.what === 'schedule' && !B.last('changed'))
const D = client('d'); await wait(120)
D.send({ t: 'cursors', on: true }); await wait(80)
ok('разработчик включил — у всех «cursors: on» с его именем', A.last('cursors')?.on === true && A.last('cursors')?.by === 'Разработчик' && B.last('cursors')?.on === true)
const E = client('a'); await wait(120)
ok('новичок сразу знает, что общие курсоры включены', E.got.find((m) => m.t === 'hello')?.cursors === true)
D.send({ t: 'cursors', on: false }); await wait(80)
ok('выключил — у всех выключено', A.last('cursors')?.on === false)
D.ws.close(); E.ws.close()
B.ws.close(); await wait(150)
ok('ушёл — пропал из списка', A.last('presence').users.length === 1)
A.ws.close(); srv.close()
if (bad) { console.log(`\n${bad} FAIL`); process.exit(1) } else { console.log('\nвсё ок'); process.exit(0) }

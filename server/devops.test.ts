// npx tsx devops.test.ts — консоль сервера, запросы и процесс по минутам
import { captureConsole, onLine, logs, onRequest, startSampler, serverStats, LOG_MAX } from './devops.js'
let fails = 0
const ok = (c: unknown, m: string) => { if (c) process.stdout.write('PASS ' + m + '\n'); else { fails++; process.stdout.write('FAIL ' + m + '\n') } }
const got: string[] = []
onLine((l) => got.push(l.lv + ':' + l.msg))
captureConsole()
console.log('GET /schedule 200 %dms', 34); console.error(new Error('бум'))
ok(got[0] === 'log:GET /schedule 200 34ms', 'строка ушла подписчику')
ok(got[1].startsWith('error:Error: бум'), 'ошибка — уровень error со стеком')
const all = logs(); ok(all.length === 2 && logs(all[0].id).length === 1, 'logs(after) — только новые')
for (let i = 0; i < LOG_MAX + 50; i++) console.log('x' + i)
ok(logs().length === LOG_MAX && logs().at(-1)!.msg === 'x' + (LOG_MAX + 49), `хранится не больше ${LOG_MAX}`)

onRequest('GET /schedule', 200, 40); onRequest('GET /schedule', 200, 120); onRequest('POST /lessons/:id/done', 500, 900); onRequest('GET /students', 404, 5)
startSampler(() => 3)
for (const range of ['hour', 'day'] as const) {
  const s = serverStats(range), p = s.points.at(-1)!
  ok(s.points.length === (range === 'hour' ? 60 : 24), `${range}: шагов`)
  ok(p.req === 4 && p.e5 === 1 && p.e4 === 1 && p.max === 900 && p.avg === Math.round(1065 / 4), `${range}: запросы, ошибки, время`)
  ok(p.rss > 0 && p.heap > 0 && p.conns === 3, `${range}: память и люди на связи`)
  ok(s.routes[0].label === 'POST /lessons/:id/done' && s.routes[0].e === 1 && s.routes[1].n === 2 && s.routes[1].avg === 80, `${range}: тяжёлые запросы`)
}
process.stdout.write(fails ? `${fails} FAIL\n` : 'all ok\n'); process.exit(fails ? 1 : 0)

// npx tsx metrics.test.ts — нагрузка на базу: свой счётчик по меткам
import { add, inRoute, ours, RANGES } from './metrics.js'
let fails = 0
const ok = (c: unknown, m: string) => { if (c) console.log('PASS', m); else { fails++; console.log('FAIL', m) } }

inRoute('GET /schedule', () => { add('r', 80); add('r', 5) })
inRoute('POST /lessons/:id/done', () => { add('w', 2); add('r', 1) })
add('r', 3)
for (const range of ['hour', 'day', 'month'] as const) {
  const o = ours(range)
  ok(o.points.length === RANGES[range].n, `${range}: шагов ${RANGES[range].n}`)
  ok(o.points.at(-1)!.r === 89 && o.points.at(-1)!.w === 2, `${range}: всё в последнем шаге`)
  ok(o.top[0].label === 'GET /schedule' && o.top[0].r === 85, `${range}: топ — расписание`)
  ok(o.top.some((t) => t.label === 'фон' && t.r === 3), `${range}: без запроса — «фон»`)
}

console.log(fails ? `${fails} FAIL` : 'all ok'); process.exit(fails ? 1 : 0)

// npx tsx metrics.test.ts — нагрузка на базу: свой счётчик по меткам и разбор ответа Cloud Monitoring
import { add, inRoute, ours, google, windowStart, RANGES } from './metrics.js'
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

// Google: точки по концу шага, три метрики, ошибка 403 — понятная
const start = windowStart('hour'), now = Math.floor(Date.now() / 1000)
const fake = (async (url: string) => {
  const metric = /document%2F(\w+)_count/.exec(String(url))![1]
  const v = { read: '100', write: '7', delete: '1' }[metric]
  return new Response(JSON.stringify({ timeSeries: [{ points: [{ interval: { endTime: new Date(now * 1000).toISOString() }, value: { int64Value: v } }, { interval: { endTime: new Date((start + 60) * 1000).toISOString() }, value: { int64Value: '5' } }] }] }))
}) as unknown as typeof fetch
const pts = await google(async () => ({ access_token: 'x' }), 'p', 'hour', fake)
ok(pts.length === 60 && pts.at(-1)!.r === 100 && pts.at(-1)!.w === 7 && pts.at(-1)!.d === 1, 'Google: последняя минута')
ok(pts[0].r === 5, 'Google: первая минута окна')
const deny = (async () => new Response(JSON.stringify({ error: { message: 'Permission monitoring.timeSeries.list denied' } }), { status: 403 })) as unknown as typeof fetch
const e = await google(async () => ({ access_token: 'x' }), 'p', 'day', deny).catch((x) => x)
ok(e instanceof Error && /denied/.test(e.message) && (e as { status?: number }).status === 403, 'Google: нет роли — 403 с текстом')
console.log(fails ? `${fails} FAIL` : 'all ok'); process.exit(fails ? 1 : 0)

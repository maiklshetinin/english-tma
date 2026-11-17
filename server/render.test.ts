// npx tsx render.test.ts — Render API: сборки, логи сборки, пересборка и перезапуск; без ключа — Deploy Hook
import { makeRender } from './render.js'
let fails = 0
const ok = (c: unknown, m: string) => { if (c) console.log('PASS', m); else { fails++; console.log('FAIL', m) } }
const calls: { url: string; method: string; auth: string; body: string }[] = []
const fake = (async (url: string, init: RequestInit = {}) => {
  const u = String(url), method = init.method || 'GET'
  calls.push({ url: u, method, auth: String((init.headers as Record<string, string>)?.authorization || ''), body: String(init.body || '') })
  const J = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s })
  if (u.endsWith('/services/srv-1')) return J({ id: 'srv-1', ownerId: 'tea-9' })
  if (u.includes('/services/srv-1/deploys?limit=')) return J([{ deploy: { id: 'dep-2', status: 'build_in_progress', trigger: 'api', createdAt: '2026-11-17T15:00:00Z', commit: { id: 'abcdef1234', message: 'Кэш\n\nподробности' } }, cursor: 'x' }, { deploy: { id: 'dep-1', status: 'live', createdAt: '2026-11-17T12:00:00Z', finishedAt: '2026-11-17T12:03:00Z', commit: { id: '64499ad999' } } }])
  if (u.endsWith('/services/srv-1/deploys') && method === 'POST') return J({ id: 'dep-3', status: 'created' }, 201)
  if (u.endsWith('/services/srv-1/restart')) return new Response('', { status: 200 })
  if (u.endsWith('/services/srv-1/deploys/dep-2')) return J({ id: 'dep-2', createdAt: '2026-11-17T15:00:00Z' })
  if (u.includes('/logs?')) return J({ hasMore: false, logs: [{ timestamp: '2026-11-17T15:00:05Z', message: '\x1b[32m==> Running build command\x1b[0m' }, { timestamp: '2026-11-17T15:00:09Z', message: 'added 120 packages' }] })
  if (u === 'https://hook') return J({ deploy: { id: 'dep-h' } })
  return J({ message: 'not found' }, 404)
}) as unknown as typeof fetch

const r = makeRender({ key: 'rnd_x', serviceId: 'srv-1', fetchFn: fake })
const ds = await r.deploys()
ok(r.api && ds.length === 2 && ds[0].status === 'build_in_progress' && ds[0].commit === 'abcdef1' && ds[0].message === 'Кэш', 'список сборок: статус, коммит, первая строка сообщения')
ok(calls[0].auth === 'Bearer rnd_x', 'ключ — в заголовке')
const d = await r.deploy()
ok(d.id === 'dep-3' && d.via === 'api' && /do_not_clear/.test(calls.at(-1)!.body), 'пересборка через API')
ok(await r.restart() === true && calls.at(-1)!.url.endsWith('/restart'), 'перезапуск через API')
const logs = await r.buildLogs('dep-2')
const q = new URL(calls.at(-1)!.url).searchParams
ok(logs.length === 2 && logs[0].msg === '==> Running build command', 'логи сборки без ANSI-цветов')
ok(q.get('ownerId') === 'tea-9' && q.get('resource') === 'srv-1' && q.get('type') === 'build' && q.get('startTime') === '2026-11-17T15:00:00Z', 'логи: владелец, сервис, тип build, с начала сборки')
await r.buildLogs('dep-2', '2026-11-17T15:00:09.000Z')
ok(new URL(calls.at(-1)!.url).searchParams.get('startTime') === '2026-11-17T15:00:09.001Z', 'логи: только новее последней строки')

const h = makeRender({ hook: 'https://hook', fetchFn: fake })
ok(!h.api && h.hook && (await h.deploys()).length === 0, 'без ключа: списка сборок нет')
ok((await h.deploy()).via === 'hook', 'без ключа: пересборка через Deploy Hook')
ok(await h.restart() === false, 'без ключа: перезапуск — завершением процесса (false)')
const none = makeRender({ fetchFn: fake })
ok(await none.deploy().catch((e) => /RENDER_API_KEY/.test(e.message)), 'ни ключа, ни хука — понятная ошибка')
const bad = makeRender({ key: 'k', serviceId: 'srv-404', fetchFn: fake })
ok(await bad.deploys().catch((e) => /Render API 404/.test(e.message)), 'ошибка Render — с кодом')
console.log(fails ? `${fails} FAIL` : 'all ok'); process.exit(fails ? 1 : 0)

// Сервер для Render: проверяет вход через Telegram, выдаёт Firebase-токен, создаёт приглашения для учеников.
// Переменные окружения — в server/README.md.
import express from 'express'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import cors from 'cors'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { verifyInitData, verifyWidget } from './telegram.js'
import { makeLogin, fail } from './login.js'
import { makeStudents } from './students.js'
import { photoByUsername, nickPhoto } from './tgphoto.js'
import { makeGroups } from './groups.js'
import { makeSchedule } from './schedule.js'
import { makeContent } from './content.js'
import { makeSrs } from './srs.js'
import { makeReview } from './review.js'
import { makeCourses } from './courses.js'
import { makeLearn } from './learn.js'
import { isDeckKey, makeStorage } from './storage.js'
import { makeLive } from './live.js'
import { makeNotes } from './notes.js'
import { dropCache, cacheTtl, setCacheTtl, cacheStats, cacheSize } from './cache.js'
import { makeRender } from './render.js'
import { captureConsole, onLine, logs, onRequest, startSampler, serverStats, SRANGES, type SRange } from './devops.js'
import { countFirestore, inRoute, ours, since as usageSince, RANGES, type Range } from './metrics.js'
import { makeActivity } from './activity.js'
import { makeVisits } from './visits.js'
import { makeAi } from './ai.js'
import type { CreateStudentResponse, InviteResponse, PingResponse, TokenUser } from './types.js'

// Пользователь из проверенного Firebase-токена кладётся в req.user (см. requireUser)
declare module 'express-serve-static-core' { interface Request { user: TokenUser } }

const env = process.env
const { BOT_TOKEN, BOT_USERNAME, APP_SHORT_NAME } = env
if (!BOT_TOKEN || !BOT_USERNAME || !env.FIREBASE_SERVICE_ACCOUNT) throw new Error('Задайте BOT_TOKEN, BOT_USERNAME и FIREBASE_SERVICE_ACCOUNT')
const list = (v: string | undefined) => (v || '').split(',').map(s => s.trim()).filter(Boolean)
const TEACHER_IDS = list(env.TEACHER_IDS)                // Telegram id преподавателей (число, не @username — ник можно сменить)
const DEV_IDS = list(env.DEV_IDS)                        // разработчики: всё, что у преподавателя, + инструменты для разработки
// Преподаватель — только тот, чей id сейчас в TEACHER_IDS / DEV_IDS. Проверяем на каждом запросе, а не только при входе:
// убрали id на Render и перезапустили сервер — доступ закрыт сразу, даже с уже выданным токеном.
const isStaff = (uid: string) => { const id = String(uid).replace(/^tg:/, ''); return TEACHER_IDS.includes(id) || DEV_IDS.includes(id) }
const roleOf = (u: { uid: string; role?: unknown }) => (u.role === 'teacher' && !isStaff(u.uid) ? undefined : u.role as 'teacher' | 'student' | undefined)

captureConsole()          // копия логов — в консоль разработчика (devops.ts)
initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) })
const auth = getAuth(), db = getFirestore()
countFirestore()          // свой счётчик чтений и записей по запросам (metrics.ts)

const app = express()
const small = express.json({ limit: '10kb' }), big = express.json({ limit: '1mb' })            // путь, пресеты и колоды с карточками — крупнее обычных запросов
app.use(cors({ origin: list(env.ALLOWED_ORIGIN), exposedHeaders: ['X-DB-Reads', 'X-DB-Writes', 'X-DB-Cached', 'X-Server-Ms'] }), (req, res, next) => (/^\/(paths|presets|decks|courses|ai)\//.test(req.path) ? big : small)(req, res, next))
// метка запроса для счётчика «кто читает» (metrics.ts): «GET /lessons/range», длинные id → :id
const routeLabel = (req: Request) => req.method + ' /' + req.path.split('/').filter(Boolean).slice(0, 3).map((p) => (p.length >= 12 || /^\d+$/.test(p) || /^tg:/.test(p) ? ':id' : p)).join('/')
// Счёт каждого запроса — в заголовки ответа (перед отправкой): чтений и записей базы, отдано из кэша, время на сервере. Их показывает
// вкладка «Сеть» панели разработчика (DevTools.vue) у каждого запроса
app.use((req, res, next) => {
  const ctx = { label: routeLabel(req), r: 0, w: 0, c: 0 }, t0 = performance.now(), wh = res.writeHead
  res.writeHead = function (this: Response, ...a: unknown[]) {
    if (!this.headersSent) { this.setHeader('X-DB-Reads', ctx.r); this.setHeader('X-DB-Writes', ctx.w); this.setHeader('X-DB-Cached', ctx.c); this.setHeader('X-Server-Ms', Math.round(performance.now() - t0)) }
    return (wh as (...x: unknown[]) => Response).apply(this, a)
  } as typeof res.writeHead
  inRoute(ctx.label, next, ctx)
})
app.use((req, res, next) => {                              // строка в логах на каждый запрос: метод, путь, код ответа, время
  const t = Date.now()
  res.on('finish', () => { if (req.path === '/') return; const ms = Date.now() - t; console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`); onRequest(routeLabel(req), res.statusCode, ms) })
  next()
})
// Правки в реальном времени: после удачной правки (не GET) остальным преподавателям — «перезагрузите это» (live.ts)
const LIVE_SKIP = new Set(['courses', 'media', 'me', 'ping', 'auth', 'dev', 'ai'])        // курсы синхронизируются сами, остальное — не данные
const CACHE_KEEP = new Set(['lessons', 'schedule', 'courses', 'media', 'me', 'ping', 'notes', 'ai'])      // уроки сбрасывают кэш сами и точечно (schedule.ts), остальное кэш не трогает
app.use((req, res, next) => {
  res.on('finish', () => {
    const what = req.path.split('/')[1] || ''
    if (req.method !== 'GET' && res.statusCode < 400 && (what === 'lessons' || what === 'schedule' || what === 'students')) schedule.dropEarnings()      // уроки или цены поменялись — доход пересчитать
    if (req.method !== 'GET' && res.statusCode < 400 && !CACHE_KEEP.has(what)) dropCache(db)      // правка мимо уроков — кэш чтений (cache.ts) целиком сбросить, дёшево: правок мало
    if (req.method !== 'GET' && res.statusCode < 400 && req.user?.role === 'teacher' && !LIVE_SKIP.has(what)) live.changed(what, String(req.headers['x-live-cid'] || ''))
  })
  next()
})
app.get('/', (_, res) => res.send('ok'))                  // для проверки Render и «будилки»

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res) => {
  fn(req, res).catch((e) => { e.status < 500 ? console.log(`  → ${e.status} ${e.message}`) : console.error(e); res.status(e.status || 500).json({ error: e.message || 'error' }) })
}
const notes = makeNotes({ db })      // заметки на общем экране (мини-чат) — грузим из базы при старте
notes.load().catch((e) => console.error('notes: не загрузились', e))
const live = makeLive({
  notes,
  origins: list(env.ALLOWED_ORIGIN),
  hello: () => ({ seen: students.recentSeen(), ai: ai.pub() }),          // ai — статус моста «Ответа по смыслу» на момент входа
  verify: async (t) => { const u = await auth.verifyIdToken(t); return { uid: u.uid, role: String(roleOf(u) ?? 'none'), name: String(u.tgName || ''), photo: String(u.tgPhoto || ''), dev: u.dev === true } },
})
const login = makeLogin({ db, auth, FieldValue, teacherIds: TEACHER_IDS, devIds: DEV_IDS })
const students = makeStudents({ db, FieldValue, photoByUsername, tz: env.SCHEDULE_TZ || 'Europe/Moscow' })
const groups = makeGroups({ db, FieldValue })
const content = makeContent({ db, FieldValue })
const srs = makeSrs({ db, FieldValue })
const review = makeReview({ db, FieldValue })
const courses = makeCourses({ db, FieldValue })
const learn = makeLearn({ db, FieldValue, get: (id) => courses.get(id), filesOf: (c) => courses.filesOf(c) })
const storage = makeStorage(env)                // кружки курсов — в S3 (см. storage.ts); без переменных S3_* — выключено
const schedule = makeSchedule({ db, FieldValue, tz: env.SCHEDULE_TZ || 'Europe/Moscow' })      // часовой пояс, по которому считаются «эта» и «следующая» неделя

app.post('/auth/telegram', wrap(async (req, res) => {
  const v = verifyInitData((req.headers.authorization || '').replace(/^tma /, ''), BOT_TOKEN)
  if (!v) throw fail(401, 'bad signature')
  res.json(await login(v))
}))
app.post('/auth/telegram-widget', wrap(async (req, res) => {
  const v = verifyWidget(req.body, BOT_TOKEN)
  if (!v) throw fail(401, 'bad signature')
  res.json(await login(v))
}))

// Проверка связи (кнопка в «Профиле»): пишет строку в логи Render и отвечает, кого узнал по токену
app.post('/ping', wrap(async (req, res) => {
  let who = 'аноним (токена нет или он недействителен)'
  try { const u = await auth.verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, '')); who = `${u.uid} (${u.role})` } catch { /* остаётся аноним */ }
  console.log(`  → PING от ${who}: ${String(req.body?.msg || '').slice(0, 100)}`)
  res.json({ ok: true, who } satisfies PingResponse)
}))

// Дальше — запросы с Firebase ID-токеном (Authorization: Bearer …)
// Права доступа («только просмотр», «уроки — только просмотр») убраны 19.11.2026 — у всех преподавателей полный доступ
const requireUser = async (req: Request, res: Response, next: NextFunction) => {
  let u
  try { u = await auth.verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, '')) } catch { return void res.status(401).json({ error: 'unauthorized' }) }
  req.user = { ...u, role: roleOf(u) }
  next()
}
const requireTeacher = (req: Request, res: Response, next: NextFunction) => (req.user.role === 'teacher' ? next() : res.status(403).json({ error: 'teacher only' }))
const requireDev = (req: Request, res: Response, next: NextFunction) => ((req.user as { dev?: boolean }).dev === true ? next() : res.status(403).json({ error: 'dev only' }))

// Кэш чтений базы (cache.ts) — для разработчика: срок, счётчики, сброс. Срок хранится в базе (settings/cache), читается один раз при запуске
const cacheDoc = () => db.collection('settings').doc('cache')
cacheDoc().get().then((d) => { const m = d.get('min'); if (typeof m === 'number') setCacheTtl(m * 60_000) }).catch((e) => console.error('settings/cache:', e))
const cacheInfo = () => ({ min: cacheTtl() / 60_000, since: cacheStats.since, reads: cacheStats.reads, saved: cacheStats.saved, entries: cacheSize(db) })
app.get('/dev/cache', requireUser, requireDev, (_req, res) => { res.json(cacheInfo()) })
// Нагрузка на базу: свой счётчик сервера по запросам (metrics.ts). ?range=hour|day|month
app.get('/dev/usage', requireUser, requireDev, (req, res) => {
  const range = (String(req.query.range) in RANGES ? String(req.query.range) : 'day') as Range
  const own = ours(range)
  res.json({ range, step: RANGES[range].step, ours: own.points, top: own.top, since: usageSince })
})
// Сервер (devops.ts): запросы, время ответа, память, CPU по минутам; консоль; перезапуск и пересборка. ?range=hour|day
app.get('/dev/server', requireUser, requireDev, (req, res) => {
  const range = (String(req.query.range) in SRANGES ? String(req.query.range) : 'hour') as SRange
  res.json({ ...serverStats(range), commit: (env.RENDER_GIT_COMMIT || '').slice(0, 7), deployVia: render.api ? 'api' : render.hook ? 'hook' : '', conns: live.people().length })
})
app.get('/dev/logs', requireUser, requireDev, (req, res) => { res.json({ lines: logs(Number(req.query.after) || 0) }) })
// Сборки и перезапуск (render.ts): с RENDER_API_KEY — через Render API (статусы, логи сборки), без него — Deploy Hook и завершение процесса
const render = makeRender({ key: env.RENDER_API_KEY, serviceId: env.RENDER_SERVICE_ID, hook: env.RENDER_DEPLOY_HOOK })
const devName = (req: Request) => (req.user as { name?: string }).name || req.user.uid
app.get('/dev/deploys', requireUser, requireDev, wrap(async (_req, res) => {
  res.json({ via: render.api ? 'api' : render.hook ? 'hook' : '', deploys: await render.deploys(), commit: (env.RENDER_GIT_COMMIT || '').slice(0, 7), startedAt: serverStats('hour').startedAt })
}))
app.get('/dev/deploys/:id/logs', requireUser, requireDev, wrap(async (req, res) => {
  res.json({ lines: await render.buildLogs(String(req.params.id), String(req.query.since || '')) })
}))
app.post('/dev/deploy', requireUser, requireDev, wrap(async (req, res) => {
  const d = await render.deploy()
  console.warn(`⟳ пересборка сервера по кнопке (${devName(req)}) через ${d.via === 'api' ? 'Render API' : 'Deploy Hook'} ${d.id}`)
  res.json({ ok: true, ...d })
}))
// Перезапуск: тот же код, ~30–60 с. Через Render API — штатно; без ключа — процесс завершается, Render поднимает его заново
app.post('/dev/restart', requireUser, requireDev, wrap(async (req, res) => {
  console.warn(`⟳ перезапуск сервера по кнопке (${devName(req)})`)
  const viaApi = await render.restart()
  res.json({ ok: true, via: viaApi ? 'api' : 'exit' })
  if (!viaApi) setTimeout(() => process.exit(1), 400)
}))
// Команда для разработчика: преподаватели (TEACHER_IDS) с последней открытой версией сайта — «Версии в приложении» в Профиле
app.get('/dev/access', requireUser, requireDev, wrap(async (_req, res) => {
  const ids = [...new Set(TEACHER_IDS)].filter((id) => !DEV_IDS.includes(id))
  const docs = ids.length ? await db.getAll(...ids.map((id) => db.collection('users').doc(`tg:${id}`))) : []
  res.json({ teachers: ids.map((id, i) => ({ uid: `tg:${id}`, name: String(docs[i]?.get('name') || 'id ' + id), photo: String(docs[i]?.get('photoUrl') || ''),
    ver: String(docs[i]?.get('ver') || ''), verAt: Number(docs[i]?.get('verAt')) || 0 })) })          // ver — последняя открытая версия сайта (пишет /me/visit)
}))
app.post('/dev/cache', requireUser, requireDev, wrap(async (req, res) => {          // { min } — срок в минутах (0 — выключить), или { clear: true }
  if (req.body?.clear === true) dropCache(db)
  else {
    const min = Number(req.body?.min)
    if (!Number.isFinite(min) || min < 0 || min > 1440) return void res.status(400).json({ error: 'min 0…1440' })
    setCacheTtl(min * 60_000); dropCache(db)                // новый срок — с чистого листа
    await cacheDoc().set({ min: cacheTtl() / 60_000 }, { merge: true })
  }
  res.json(cacheInfo())
}))

// Учёт активности (activity.ts): заходы, время на экране и с действиями — по вкладкам и лентой. Выключатели — отдельно для
// преподавателей и учеников (settings/activity, по умолчанию выключено); приложение спрашивает /me/activity при входе
const activity = makeActivity({ db })
activity.load().catch((e) => console.error('settings/activity:', e))
app.get('/me/activity', requireUser, (req, res) => { res.json({ on: activity.on(req.user.role) }) })
app.post('/me/activity', requireUser, wrap(async (req, res) => res.json(await activity.record(req.user, req.body))))      // кусок раз в 5 мин → { on }
// Лог заходов (visits.ts) — всегда, без выключателя: время, телефон / компьютер, Telegram / сайт. Отметку шлёт приложение
const visits = makeVisits({ db, FieldValue })
app.post('/me/visit', requireUser, wrap(async (req, res) => {          // { day, dev, app, pf } → { ok }
  if (req.user.role !== 'teacher' && req.user.role !== 'student') return void res.json({ ok: false })
  res.json(await visits.record(req.user, req.body))
}))
app.get('/dev/activity', requireUser, requireDev, wrap(async (req, res) => {          // ?from&to (YYYY-MM-DD) → { settings, days, visits }
  const from = String(req.query.from || ''), to = String(req.query.to || '')
  const [days, vs] = await Promise.all([activity.range(from, to), visits.range(from, to)])
  res.json({ settings: activity.settings, days, visits: vs })
}))
app.get('/dev/visits', requireUser, requireDev, wrap(async (req, res) => {          // ?from&to → { visits } — вкладка «Заходы» (журнал)
  res.json({ visits: await visits.range(String(req.query.from || ''), String(req.query.to || '')) })
}))
// Очистка логов разработчиком: { what: 'visits' | 'activity', days? } — дни старше `days` дней (без него — всё) → { deleted }
app.post('/dev/logs/clean', requireUser, requireDev, wrap(async (req, res) => {
  const days = Number(req.body?.days), what = String(req.body?.what || '')
  const before = Number.isFinite(days) && days > 0 ? new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10) : undefined
  const deleted = await visits.clean(what, before)
  console.warn(`логи: ${what} — удалено ${deleted} (${before ? 'до ' + before : 'всё'}) — ${devName(req)}`)
  res.json({ deleted })
}))
app.post('/dev/activity', requireUser, requireDev, wrap(async (req, res) => {          // { teachers?, students? } → выключатели
  const s = await activity.set({ teachers: req.body?.teachers, students: req.body?.students })
  console.warn(`учёт активности: преподаватели ${s.teachers ? 'вкл' : 'выкл'}, ученики ${s.students ? 'вкл' : 'выкл'}`)
  live.broadcast({ t: 'actlog', ...s })          // у преподавателей на связи — сразу; ученики узнают при следующем входе
  res.json(s)
}))

// Ученики. Сайт не ходит в Firestore напрямую — только через эти маршруты; доступ определяется ролью в токене.
const inviteUrl = (code: string) => `${APP_SHORT_NAME ? `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}` : `https://t.me/${BOT_USERNAME}`}?startapp=invite_${code}`
app.post('/me/seen', requireUser, wrap(async (req, res) => {      // ученик в приложении — «в сети» (раз в минуту); преподавателям — сразу по живому соединению
  const s = await students.seen(req.user); if (s) live.broadcast({ t: 'seen', ...s }); res.json({ ok: true })
}))
app.get('/students', requireUser, wrap(async (req, res) => res.json(await students.list(req.user))))      // преподаватель — все, ученик — только он сам
app.post('/students', requireUser, requireTeacher, wrap(async (req, res) => {                              // добавить ученика + сразу ссылка-приглашение
  const student = await students.create(req.body, req.user.uid)
  res.json({ student, url: inviteUrl(await students.invite(student.id, req.user.uid)) } satisfies CreateStudentResponse)
}))
app.post('/invites', requireUser, requireTeacher, wrap(async (req, res) => {                               // новая ссылка для существующего ученика (одноразовая)
  res.json({ url: inviteUrl(await students.invite(String(req.body?.studentId || ''), req.user.uid)) } satisfies InviteResponse)
}))
app.post('/students/:id', requireUser, requireTeacher, wrap(async (req, res) => res.json(await students.update(req.params.id, req.body))))   // { name?, level? } → обновлённый ученик
app.post('/students/:id/username', requireUser, requireTeacher, wrap(async (req, res) => res.json(await students.setUsername(req.params.id, req.body?.username))))   // { username } → обновлённый ученик (с фото по нику)
app.post('/students/:id/price', requireUser, requireTeacher, wrap(async (req, res) => res.json(await students.setPrice(req.params.id, req.body?.price))))   // { price } → обновлённый ученик; прошедшие уроки по старой цене
app.get('/students/archived', requireUser, requireTeacher, wrap(async (_req, res) => res.json(await students.listArchived())))   // раздел «Архив»
app.post('/students/:id/restore', requireUser, requireTeacher, wrap(async (req, res) => {                  // вернуть из архива + новая ссылка-приглашение
  const student = await students.restore(req.params.id)
  console.log(`  → из архива: ученик ${req.params.id}`)
  res.json({ student, url: inviteUrl(await students.invite(student.id, req.user.uid)) } satisfies CreateStudentResponse)
}))
app.delete('/students/:id', requireUser, requireTeacher, wrap(async (req, res) => {                        // удалить навсегда (только из архива)
  const name = await students.archivedName(req.params.id)                                                   // 404 / 409, если не в архиве
  await schedule.purgeStudent(req.params.id, name)                                                          // уроки: будущие — без него, проведённые — с его именем
  await students.purge(req.params.id)                                                                       // запись, путь, прогресс слов, приглашения, колоды
  console.log(`  → удалён навсегда: ученик ${req.params.id} (${name})`)
  res.json({ ok: true })
}))
app.post('/students/:id/archive', requireUser, requireTeacher, wrap(async (req, res) => {                  // архив: скрыть, закрыть доступ, погасить приглашения
  await students.archive(req.params.id)
  await schedule.dropStudent(req.params.id)                                                                 // и убрать из уроков текущей/следующей недели
  console.log(`  → архив: ученик ${req.params.id}`)
  res.json({ ok: true })
}))

// Расписание: две живые недели (текущая и следующая) и уроки в слотах. Урок = сущность с массивом учеников (группа — несколько).
app.get('/schedule', requireUser, wrap(async (req, res) => res.json(await schedule.list(req.user))))      // преподаватель — всё, ученик — только свои уроки
app.get('/schedule/weeks', requireUser, requireTeacher, wrap(async (_req, res) => res.json(await schedule.weeksList())))   // недели, которые есть в базе (с уроками)
app.get('/schedule/week', requireUser, requireTeacher, wrap(async (req, res) => res.json(await schedule.week(req.query.start))))   // ?start=понедельник → { weekStart, lessons }
app.get('/lessons/earnings', requireUser, requireTeacher, wrap(async (_req, res) => res.json(await schedule.earnings())))   // доход по ученикам по месяцам
app.get('/lessons/range', requireUser, requireTeacher, wrap(async (req, res) => res.json(await schedule.range(req.query.from, req.query.to))))   // ?from&to — все уроки за период («Информация»)
app.get('/lessons/history', requireUser, wrap(async (req, res) => res.json(await schedule.history(req.user, req.query.studentId))))   // все уроки ученика (календарь): ученик — свои, преподаватель — ?studentId
app.post('/lessons', requireUser, requireTeacher, wrap(async (req, res) => res.json(await schedule.create(req.body, req.user.uid))))   // { studentId | studentIds, date, hour }
app.post('/lessons/swap', requireUser, requireTeacher, wrap(async (req, res) => { await schedule.swap(String(req.body?.a || ''), String(req.body?.b || '')); res.json({ ok: true }) }))
app.post('/lessons/:id/move', requireUser, requireTeacher, wrap(async (req, res) => res.json(await schedule.move(req.params.id, req.body))))   // { date, hour }
app.post('/lessons/:id/students', requireUser, requireTeacher, wrap(async (req, res) => res.json(await schedule.setStudents(req.params.id, req.body))))   // { studentIds } → урок с новым составом (группа)
app.post('/lessons/:id/details', requireUser, requireTeacher, wrap(async (req, res) => res.json(await schedule.setDetails(req.params.id, req.body))))   // { minute?, note? } → урок
app.post('/lessons/:id/cancel', requireUser, requireTeacher, wrap(async (req, res) => res.json(await schedule.setCanceled(req.params.id, req.body))))   // { studentId, canceled } → урок; «отменил ученик», без оплаты
app.post('/lessons/:id/done', requireUser, requireTeacher, wrap(async (req, res) => res.json(await schedule.setDone(req.params.id, req.body))))   // { done: true|false } → урок; цена фиксируется
app.delete('/lessons/:id', requireUser, requireTeacher, wrap(async (req, res) => { await schedule.remove(req.params.id); res.json({ ok: true }) }))

// Путь, пресеты, колоды (content.ts) и прогресс повторений (srs.ts). Сайт правит их целиком, сервер проверяет форму и роль.
app.get('/content', requireUser, wrap(async (req, res) => res.json(await content.list(req.user))))      // преподаватель — всё, ученик — свой путь и доступные колоды
app.put('/paths/:studentId', requireUser, requireTeacher, wrap(async (req, res) => { await content.putPath(req.params.studentId, req.body); res.json({ ok: true }) }))
app.post('/paths/:studentId/complete', requireUser, wrap(async (req, res) => res.json(await content.completeNode(req.user, req.params.studentId, String(req.body?.nodeId || '')))))   // { nodeId } → { coins }
app.put('/presets/:id', requireUser, requireTeacher, wrap(async (req, res) => { await content.putPreset(req.params.id, req.body, req.user.uid); res.json({ ok: true }) }))
app.delete('/presets/:id', requireUser, requireTeacher, wrap(async (req, res) => { await content.removePreset(req.params.id); res.json({ ok: true }) }))
app.put('/decks/:id', requireUser, requireTeacher, wrap(async (req, res) => { await content.putDeck(req.params.id, req.body, req.user.uid); res.json({ ok: true }) }))
app.delete('/decks/:id', requireUser, requireTeacher, wrap(async (req, res) => {
  const urls = await content.removeDeck(req.params.id)
  // фото и озвучка колоды из нашего хранилища (ссылка …/media/f/<ключ>) — тоже удаляем; чужие ссылки (Диск и т.п.) не трогаем
  for (const u of urls) { const k = decodeURIComponent(u.split('/media/f/')[1] ?? ''); if (k && isDeckKey(k)) storage.remove(req.user.uid, k).catch(() => {}) }
  res.json({ ok: true })
}))
// Группы учеников — отдельная сущность (создаются и меняются только преподавателем, из панели учеников)
// Курсы (редактор «рельс») — только преподаватели; пространство общее (все видят все курсы)
// Курс у ученика (learn.ts): преподаватель назначает и смотрит прохождение, ученик — только свои курсы и свой прогресс
app.post('/courses/:id/assign', requireUser, requireTeacher, wrap(async (req, res) => res.json(await learn.assign(req.params.id, req.body))))      // { studentId, on }
app.post('/students/:id/progress/reset', requireUser, requireTeacher, wrap(async (req, res) => res.json(await learn.reset(req.params.id, req.body))))      // { what: 'all' } | { what: 'course', courseId }
app.get('/students/:id/courses', requireUser, requireTeacher, wrap(async (req, res) => res.json(await learn.ofStudent(req.params.id))))
app.get('/courses/:id/run', requireUser, requireTeacher, wrap(async (req, res) => res.json(await learn.teacherRun(req.user, req.params.id))))      // своё прохождение курса (преподаватель)
app.post('/courses/:id/run/done', requireUser, requireTeacher, wrap(async (req, res) => res.json(await learn.teacherDone(req.user, req.params.id, req.body))))   // { itemId, ok, all, sec, miss? }
app.post('/courses/:id/run/reset', requireUser, requireTeacher, wrap(async (req, res) => res.json(await learn.teacherReset(req.user, req.params.id))))
app.get('/my/courses', requireUser, wrap(async (req, res) => res.json(await learn.myList(req.user))))
app.get('/my/courses/:id', requireUser, wrap(async (req, res) => res.json(await learn.myCourse(req.user, req.params.id))))
app.post('/my/courses/:id/done', requireUser, wrap(async (req, res) => res.json(await learn.done(req.user, req.params.id, req.body))))      // { itemId, ok, all, sec }
// Журнал заходов в уроки (learn.ts): пишется по ходу урока — { run, itemId, at, sec, n, fin, steps: { <экран>: { ok, sec, t, x?, sc? } } }
app.get('/my/courses/:id/resume', requireUser, wrap(async (req, res) => res.json(await learn.resume(req.user, req.params.id))))          // «С места» — где оборвались уроки курса
app.post('/my/courses/:id/log', requireUser, wrap(async (req, res) => res.json(await learn.log(req.user, req.params.id, req.body))))
app.post('/courses/:id/run/log', requireUser, requireTeacher, wrap(async (req, res) => res.json(await learn.teacherLog(req.user, req.params.id, req.body))))
app.get('/progress/log', requireUser, wrap(async (req, res) => res.json(await learn.runLogs(req.user, req.query.studentId))))      // ?studentId= — преподаватель смотрит ученика
app.post('/progress/log/remove', requireUser, requireTeacher, wrap(async (req, res) => res.json(await learn.removeLogs(req.user, req.body))))      // { studentId?, runs? } — весь журнал или выбранные заходы
app.get('/courses', requireUser, requireTeacher, wrap(async (req, res) => res.json({ courses: await courses.list(), storage: storage.ready })))
app.get('/courses/:id', requireUser, requireTeacher, wrap(async (req, res) => res.json(await courses.get(req.params.id))))
app.put('/courses/:id', requireUser, requireTeacher, wrap(async (req, res) => res.json(await courses.put(req.user.uid, req.params.id, req.body))))
app.post('/courses/:id/cover', requireUser, requireTeacher, wrap(async (req, res) => res.json(await courses.setCover(req.params.id, req.body))))      // { cover: ключ | null } — картинка на иконке курса (25.11.2026)
app.delete('/courses/:id', requireUser, requireTeacher, wrap(async (req, res) => {
  const c = await courses.get(req.params.id)
  await courses.remove(req.params.id)
  const keep = await courses.filesElsewhere(c.id)                                                   // скопированные в другие курсы — оставляем
  for (const k of courses.filesOf(c)) if (!keep.has(k)) await storage.remove(req.user.uid, k).catch(() => {})      // кружки и фото курса — тоже долой
  res.json({ ok: true })
}))
// Кружки и фото: загрузка потоком через сервер (тело — сам файл, Content-Type: video/… или image/…), ссылки на просмотр, удаление
app.post('/media/upload', requireUser, requireTeacher, wrap(async (req, res) => res.json(await storage.upload(req.user.uid, { courseId: req.query.courseId, deckId: req.query.deckId, type: req.headers['content-type'] }, req, req.headers['content-length']))))
// Фото и озвучка карточек: ссылка в колоде — сюда, без входа (как ссылка на Диск); пересылаем на временную ссылку хранилища.
// Браузер запоминает пересылку на час — повторно сервер не дёргает.
app.get(/^\/media\/f\/(.+)$/, wrap(async (req, res) => { res.set('Cache-Control', 'public, max-age=3600'); res.redirect(302, await storage.open(req.params[0])) }))
app.post('/media/view', requireUser, wrap(async (req, res) => {            // ученик — только файлы назначенных ему курсов
  if (req.user.role !== 'teacher') {
    const allowed = await learn.allowedKeys(req.user), keys = (req.body as { keys?: unknown } | null)?.keys
    if (!Array.isArray(keys) || keys.some((k) => !allowed.has(String(k)))) throw fail(403, 'forbidden')
  }
  res.json(await storage.viewUrls(req.user.uid, req.body))
}))
app.post('/media/delete', requireUser, requireTeacher, wrap(async (req, res) => { await storage.remove(req.user.uid, req.body?.key); res.json({ ok: true }) }))

app.get('/groups', requireUser, requireTeacher, wrap(async (_req, res) => res.json(await groups.list())))
app.post('/groups', requireUser, requireTeacher, wrap(async (req, res) => res.json(await groups.create(req.body))))                 // { studentIds } → группа
app.post('/groups/seed', requireUser, requireTeacher, wrap(async (req, res) => res.json(await groups.seed(req.body))))          // разовый перенос старых групп из расписания
app.put('/groups/:id', requireUser, requireTeacher, wrap(async (req, res) => res.json(await groups.update(req.params.id, req.body))))
app.delete('/groups/:id', requireUser, requireTeacher, wrap(async (req, res) => { await groups.remove(req.params.id); res.json({ ok: true }) }))
app.get('/srs', requireUser, wrap(async (req, res) => res.json(await srs.list(req.user))))              // свой прогресс (преподаватель — ещё и всех учеников)
app.post('/srs/reset', requireUser, wrap(async (req, res) => res.json(await srs.reset(req.user, req.body))))      // { cardIds } → свои карточки снова «новые» (сбросить колоду)
app.post('/srs/rate', requireUser, wrap(async (req, res) => { await srs.rate(req.user, req.body); res.json({ ok: true }) }))
// Review — «Твой словарь» (review.ts): свой; преподаватель — ещё и ученика (?studentId=…)
app.get('/review/settings', requireUser, wrap(async (_req, res) => res.json(await review.algo())))           // настройки алгоритма повторений (FSRS)
app.put('/review/settings', requireUser, requireTeacher, wrap(async (req, res) => res.json(await review.setAlgo(req.body))))      // { retention, maxDays }
app.get('/review', requireUser, wrap(async (req, res) => res.json(await review.get(req.user, req.query.studentId))))
app.post('/review', requireUser, wrap(async (req, res) => res.json(await review.save(req.user, req.body))))          // { items: { ключ: запись } } — только изменённые
// «Аналитика прогресса» (вкладка Review «Грамматика и навыки»): пройденные уроки (темп по месяцам, теги экранов) и снимки навыков и тем по месяцам
app.get('/progress/stats', requireUser, wrap(async (req, res) => { const sid = req.query.studentId; const [l, ex, mon] = await Promise.all([learn.lessonsDone(req.user, sid), learn.exercisesDone(req.user, sid), review.months(req.user, sid)]); res.json({ ...l, ...ex, mon }) }))          // ex — пройденные упражнения (24.11.2026)
app.post('/review/reset', requireUser, wrap(async (req, res) => { await review.reset(req.user); res.json({ ok: true }) }))
app.post('/review/remove', requireUser, requireTeacher, wrap(async (req, res) => res.json(await review.remove(req.user, req.body))))      // { keys, studentId? } — удалить отдельные слова (преподаватель)

// Аватарка пользователя через Bot API (Mini App отдаёт фото только самого пользователя). Токен бота наружу не уходит.
const tgApi = (m: string, q: Record<string, string>) => fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${m}?${new URLSearchParams(q)}`).then((r) => r.json() as Promise<any>)
// Фото ученика по нику (ещё не вошёл в приложение): свежее со страницы t.me — сохранённая ссылка на фото со временем перестаёт открываться
const byNick = nickPhoto({ isKnown: async (u) => !(await db.collection('students').where('username', '==', u).limit(1).get()).empty })
app.get('/avatar/nick/:username', requireUser, requireTeacher, wrap(async (req, res) => {
  const img = await byNick(String(req.params.username))
  if (!img) throw fail(404, 'no photo')
  res.set('Content-Type', img.type).set('Cache-Control', 'private, max-age=21600').send(Buffer.from(img.body))
}))
app.get('/avatar/:tgId', requireUser, wrap(async (req, res) => {
  const id = Number(req.params.tgId)
  if (req.user.role !== 'teacher' && req.user.uid !== `tg:${id}`) throw fail(403, 'forbidden')
  if (!(await db.collection('users').doc(`tg:${id}`).get()).exists) throw fail(404, 'unknown user')
  const sizes = (await tgApi('getUserProfilePhotos', { user_id: String(id), limit: '1' })).result?.photos?.[0]
  if (!sizes) throw fail(404, 'no photo')
  const file = await tgApi('getFile', { file_id: sizes[0].file_id })
  const img = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.result.file_path}`)
  res.set('Content-Type', img.headers.get('content-type') || 'image/jpeg').set('Cache-Control', 'private, max-age=86400')
  res.send(Buffer.from(await img.arrayBuffer()))
}))

// «Ответ по смыслу»: проверка через чат в браузере преподавателя (ai.ts, скрипт public/ai-bridge.user.js). Ключ моста — в settings/ai
const aiDoc = () => db.collection('settings').doc('ai')
const ai = makeAi({ loadToken: async () => String((await aiDoc().get()).get('token') || ''), saveToken: async (token) => { await aiDoc().set({ token }, { merge: true }) },
  onChange: (v) => live.broadcast({ t: 'ai', ...v }) })          // мост включили / выключили — сразу во все вкладки (23.11.2026)
app.get('/ai/status', requireUser, (_req, res) => { res.json(ai.pub()) })      // { online, sites: ['Gemini', …] } — значок «проверит» на экране ученика, без базы
app.post('/ai/check', requireUser, wrap(async (req, res) => res.json(await ai.check(req.body ?? {}))))      // { question, reference, answer, prompt? } → { score, missed, feedback }
app.get('/dev/ai', requireUser, requireDev, wrap(async (_req, res) => res.json({ ...ai.status(), token: await ai.token() })))
app.post('/dev/ai/token', requireUser, requireDev, wrap(async (_req, res) => res.json({ token: await ai.newToken() })))
// Сам мост: без входа в приложение, по ключу моста (заголовок X-Bridge-Token). Скрипт ходит через GM_xmlhttpRequest — CORS не нужен
const requireBridge = (req: Request, res: Response, next: NextFunction) => { ai.isToken(req.headers['x-bridge-token']).then((ok) => (ok ? next() : res.status(401).json({ error: 'bad bridge token' })), next) }
app.get('/ai/bridge/next', requireBridge, wrap(async (req, res) => {
  const j = await ai.next(req.query.site, (f) => res.on('close', f))
  if (j) res.json(j); else res.status(204).end()
}))
app.post('/ai/bridge/done', requireBridge, wrap(async (req, res) => res.json({ ok: ai.done(req.body?.id, req.body ?? {}) })))
app.post('/ai/bridge/bye', requireBridge, wrap(async (req, res) => res.json(ai.bye(req.body?.site))))          // скрипт выключили во вкладке (мост 1.6)

// Google Таблица → CSV (таблица должна быть открыта «по ссылке»). Адрес собираем сами из id, чужие URL не ходят.
app.get('/sheets/csv', requireUser, requireTeacher, wrap(async (req, res) => {
  const m = String(req.query.url || '').match(/\/spreadsheets\/d\/([\w-]+)/)
  if (!m) throw fail(400, 'not a sheet url')
  const gid = (String(req.query.url).match(/[#&?]gid=(\d+)/) || [])[1]
  // Сначала «Файл → Скачать → CSV» (export): отдаёт ячейки как есть. gviz — запасной: он угадывает типы столбцов и может потерять текст в «числовом»
  let r = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`)
  if (!r.ok || !/text\/csv/.test(r.headers.get('content-type') || '')) r = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`)
  if (!r.ok) throw fail(r.status === 404 ? 404 : 403, 'sheet unavailable')
  res.type('text/csv').send(await r.text())
}))

onLine((l) => live.logLine(l))          // строки консоли — разработчику сразу
startSampler(() => live.people().length)
live.attach(app.listen(env.PORT || 3000, () => console.log(`server up${env.RENDER_GIT_COMMIT ? ' · ' + env.RENDER_GIT_COMMIT.slice(0, 7) : ''}`)))      // WebSocket /live — на том же порту

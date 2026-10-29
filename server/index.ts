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
import { makeCourses } from './courses.js'
import { isDeckKey, makeStorage } from './storage.js'
import { makeLive } from './live.js'
import type { CreateStudentResponse, InviteResponse, PingResponse, TokenUser } from './types.js'

// Пользователь из проверенного Firebase-токена кладётся в req.user (см. requireUser)
declare module 'express-serve-static-core' { interface Request { user: TokenUser } }

const env = process.env
const { BOT_TOKEN, BOT_USERNAME, APP_SHORT_NAME } = env
if (!BOT_TOKEN || !BOT_USERNAME || !env.FIREBASE_SERVICE_ACCOUNT) throw new Error('Задайте BOT_TOKEN, BOT_USERNAME и FIREBASE_SERVICE_ACCOUNT')
const list = (v: string | undefined) => (v || '').split(',').map(s => s.trim()).filter(Boolean)
const TEACHER_IDS = list(env.TEACHER_IDS)
const DEV_IDS = list(env.DEV_IDS)                       // разработчики: всё, что у преподавателя, + инструменты для разработки               // Telegram id преподавателей (число, не @username — ник можно сменить)

initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) })
const auth = getAuth(), db = getFirestore()

const app = express()
const small = express.json({ limit: '10kb' }), big = express.json({ limit: '1mb' })            // путь, пресеты и колоды с карточками — крупнее обычных запросов
app.use(cors({ origin: list(env.ALLOWED_ORIGIN) }), (req, res, next) => (/^\/(paths|presets|decks|courses)\//.test(req.path) ? big : small)(req, res, next))
app.use((req, res, next) => {                              // строка в логах на каждый запрос: метод, путь, код ответа, время
  const t = Date.now()
  res.on('finish', () => req.path !== '/' && console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`))
  next()
})
// Правки в реальном времени: после удачной правки (не GET) остальным преподавателям — «перезагрузите это» (live.ts)
const LIVE_SKIP = new Set(['courses', 'media', 'me', 'ping', 'auth'])        // курсы синхронизируются сами, остальное — не данные
app.use((req, res, next) => {
  res.on('finish', () => {
    const what = req.path.split('/')[1] || ''
    if (req.method !== 'GET' && res.statusCode < 400 && (what === 'lessons' || what === 'schedule' || what === 'students')) schedule.dropEarnings()      // уроки или цены поменялись — доход пересчитать
    if (req.method !== 'GET' && res.statusCode < 400 && req.user?.role === 'teacher' && !LIVE_SKIP.has(what)) live.changed(what, String(req.headers['x-live-cid'] || ''))
  })
  next()
})
app.get('/', (_, res) => res.send('ok'))                  // для проверки Render и «будилки»

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res) => {
  fn(req, res).catch((e) => { e.status < 500 ? console.log(`  → ${e.status} ${e.message}`) : console.error(e); res.status(e.status || 500).json({ error: e.message || 'error' }) })
}
const live = makeLive({
  origins: list(env.ALLOWED_ORIGIN),
  hello: () => ({ seen: students.recentSeen() }),
  verify: async (t) => { const u = await auth.verifyIdToken(t); return { uid: u.uid, role: String(u.role), name: String(u.tgName || ''), photo: String(u.tgPhoto || ''), dev: u.dev === true } },
})
const login = makeLogin({ db, auth, FieldValue, teacherIds: TEACHER_IDS, devIds: DEV_IDS })
const students = makeStudents({ db, FieldValue, photoByUsername, tz: env.SCHEDULE_TZ || 'Europe/Moscow' })
const groups = makeGroups({ db, FieldValue })
const content = makeContent({ db, FieldValue })
const srs = makeSrs({ db, FieldValue })
const courses = makeCourses({ db, FieldValue })
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
const requireUser = async (req: Request, res: Response, next: NextFunction) => {
  try { req.user = await auth.verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, '')); next() }
  catch { res.status(401).json({ error: 'unauthorized' }) }
}
const requireTeacher = (req: Request, res: Response, next: NextFunction) => (req.user.role === 'teacher' ? next() : res.status(403).json({ error: 'teacher only' }))

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
app.get('/courses', requireUser, requireTeacher, wrap(async (req, res) => res.json({ courses: await courses.list(), storage: storage.ready })))
app.get('/courses/:id', requireUser, requireTeacher, wrap(async (req, res) => res.json(await courses.get(req.params.id))))
app.put('/courses/:id', requireUser, requireTeacher, wrap(async (req, res) => res.json(await courses.put(req.user.uid, req.params.id, req.body))))
app.delete('/courses/:id', requireUser, requireTeacher, wrap(async (req, res) => {
  const c = await courses.get(req.params.id)
  await courses.remove(req.params.id)
  for (const k of courses.filesOf(c)) await storage.remove(req.user.uid, k).catch(() => {})      // кружки и фото курса — тоже долой
  res.json({ ok: true })
}))
// Кружки и фото: загрузка потоком через сервер (тело — сам файл, Content-Type: video/… или image/…), ссылки на просмотр, удаление
app.post('/media/upload', requireUser, requireTeacher, wrap(async (req, res) => res.json(await storage.upload(req.user.uid, { courseId: req.query.courseId, deckId: req.query.deckId, type: req.headers['content-type'] }, req, req.headers['content-length']))))
// Фото и озвучка карточек: ссылка в колоде — сюда, без входа (как ссылка на Диск); пересылаем на временную ссылку хранилища.
// Браузер запоминает пересылку на час — повторно сервер не дёргает.
app.get(/^\/media\/f\/(.+)$/, wrap(async (req, res) => { res.set('Cache-Control', 'public, max-age=3600'); res.redirect(302, await storage.open(req.params[0])) }))
app.post('/media/view', requireUser, requireTeacher, wrap(async (req, res) => res.json(await storage.viewUrls(req.user.uid, req.body))))
app.post('/media/delete', requireUser, requireTeacher, wrap(async (req, res) => { await storage.remove(req.user.uid, req.body?.key); res.json({ ok: true }) }))

app.get('/groups', requireUser, requireTeacher, wrap(async (_req, res) => res.json(await groups.list())))
app.post('/groups', requireUser, requireTeacher, wrap(async (req, res) => res.json(await groups.create(req.body))))                 // { studentIds } → группа
app.post('/groups/seed', requireUser, requireTeacher, wrap(async (req, res) => res.json(await groups.seed(req.body))))          // разовый перенос старых групп из расписания
app.put('/groups/:id', requireUser, requireTeacher, wrap(async (req, res) => res.json(await groups.update(req.params.id, req.body))))
app.delete('/groups/:id', requireUser, requireTeacher, wrap(async (req, res) => { await groups.remove(req.params.id); res.json({ ok: true }) }))
app.get('/srs', requireUser, wrap(async (req, res) => res.json(await srs.list(req.user))))              // свой прогресс (преподаватель — ещё и всех учеников)
app.post('/srs/reset', requireUser, wrap(async (req, res) => res.json(await srs.reset(req.user, req.body))))      // { cardIds } → свои карточки снова «новые» (сбросить колоду)
app.post('/srs/rate', requireUser, wrap(async (req, res) => { await srs.rate(req.user, req.body); res.json({ ok: true }) }))

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

live.attach(app.listen(env.PORT || 3000, () => console.log('server up')))      // WebSocket /live — на том же порту

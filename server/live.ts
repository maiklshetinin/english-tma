// «Кто сейчас в приложении» и правки в реальном времени — WebSocket /live (только преподаватели).
//  • Вход: /live?t=<Firebase ID-токен>; имя и фото — из токена (как в Telegram). Сайт с чужого адреса не пускаем (ALLOWED_ORIGIN).
//  • Присутствие: у каждого подключения — где он (вкладка) и какой курс открыт; всем рассылается список «кто здесь».
//  • Редактор курсов: курсоры, выделение и сам курс после правки пересылаются тем, кто открыл тот же курс.
//  • Общие курсоры (включает разработчик в «Профиле» — сразу для всех): курсор на любой странице — pcursor { path, sel, rx, ry, x, y, click }:
//    sel — элемент под мышкой (путь в странице), rx/ry — где внутри него (0…1): так стрелка попадает туда же при любом масштабе и ширине окна.
//    Включено ли — общее состояние сервера (cursors), новичок получает его в hello; выключается тем же переключателем.
//    Сохраняет курс в Firestore тот, кто правил (PUT /courses) — здесь только пересылка, ничего не пишем в базу.
//  • «В сети» учеников: сервер помнит, кто отмечался (students.seen), и сразу рассылает { t: 'seen', id, at }; новичку — в hello.seen.
//    Так преподавателю не нужно раз в минуту перечитывать список учеников из базы.
//  • После любой правки через обычные маршруты (ученики, расписание, группы…) остальным уходит «changed» — они перезагружают
//    эти данные. Всё в памяти одного процесса: на Render один экземпляр сервера, этого достаточно.
//  • Заметки на экране (мини-чат, notes.ts): note+ / note:reply / note:react / note:edit / note:msgdel (своё сообщение) / note:move / note:del — сервер сохраняет и рассылает всем
//    заметку целиком ({ t: 'note', note }); typing — «печатает…» (не храним); nudge — всплывающее уведомление у адресата (висит, пока
//    не закроет крестиком); note:seen — прочитал (закрыл уведомление / открыл заметку) → у автора «Прочитано».
//    Посылка (nudge с drop; via — парашют / кран / птица, emoji — что внутри): { t: 'drop' } всем — опускается вниз экрана в точку x (0…1 ширины), копится стопкой;
//    drop:open — адресат открыл: { t: 'drop-' } всем + «прочитано». Новичок получает заметки и посылки в hello.
import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { Notes, NoteAuthor } from './notes.js'

export interface LiveUser { uid: string; role: string; name: string; photo: string; dev?: boolean }
type Verify = (token: string) => Promise<LiveUser | null>
interface Conn { ws: WebSocket; cid: string; uid: string; dev: boolean; name: string; photo: string; color: string; where: string; course: string; alive: boolean; ver: string; logs?: boolean; hidden?: boolean }      // hidden — разработчик-невидимка: остальные его не видят      // logs — разработчик смотрит консоль сервера (devops.ts); ver — сборка сайта (commit), присылает сам

const COLORS = ['#f24822', '#0d99ff', '#14ae5c', '#9747ff', '#ffa629', '#ff24bd', '#00b5ce', '#e5a000']
const colorOf = (uid: string) => COLORS[[...uid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length]
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
// Что можно «спустить на парашюте» вместо обычного уведомления (рисует ParachuteDrop.vue)
const DROPS = ['chest', 'gift', 'mail', 'note', 'poo', 'heart', 'cake', 'flowers'], DROPS_MAX = 60
const frac01 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000 : 0.5)
// Чем доставить (парашют, кран, птица) и какие эмодзи лежат внутри — при открытии они вылетают фонтаном
const VIAS = ['chute', 'crane', 'bird'], EMOJI_MAX = 8
const emojiList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((e): e is string => typeof e === 'string' && e.length > 0 && e.length <= 16 && !/[\s<>&\w]/.test(e)))].slice(0, EMOJI_MAX) : [])
interface Drop { id: string; note: string; mid: string; cargo: string; via: string; emoji: string[]; x: number; by: NoteAuthor; to: string; at: number }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : 0)

export function makeLive({ verify, origins, hello = () => ({}), notes, canEdit = () => true }: { verify: Verify; origins: string[]; hello?: () => Record<string, unknown>; notes?: Notes; canEdit?: (uid: string) => boolean }) {
  const conns = new Set<Conn>()
  let seq = 0, cursors = false, cursorsBy = ''
  const drops: Drop[] = []          // посылки на парашюте, ещё не открытые (в памяти: перезапуск сервера их очищает)
  const send = (c: Conn, m: unknown) => { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m)) }
  // Невидимка (разработчик, 17.11.2026): его нет в «кто здесь», не видно его курсора, выделения и «печатает…» — у всех, кроме него самого
  // и других разработчиков. Свои сообщения в чате видны как обычно (это уже осознанное действие).
  const sees = (viewer: Conn | undefined, c: Conn) => !c.hidden || !viewer || viewer.uid === c.uid || viewer.dev
  const people = (viewer?: Conn) => [...conns].filter((c) => sees(viewer, c)).map(({ cid, uid, dev, name, photo, color, where, course, ver, hidden }) => ({ cid, uid, dev, name, photo, color, where, course, ver, ...(hidden ? { hidden } : {}) }))
  const presence = () => { for (const c of conns) send(c, { t: 'presence', users: people(c) }) }
  // Активность преподавателей (для разработчика, 17.11.2026): приложение раз в минуту шлёт «act», только пока человек правда за ним
  // (вкладка на экране и за минуту было движение мышью / нажатие / касание — useActive.js); плюс действия в чате. Просто открытая вкладка
  // и переподключения не считаются. Отметка — не чаще раза в минуту (в памяти; перезапуск сервера обнуляет). Заходы — отметки, разделённые паузой больше 5 минут. Видно под сообщением в чате: «заходил 3 раза и не ответил»
  const act = new Map<string, number[]>()
  function touch(c: Conn) { const a = act.get(c.uid) ?? [], t = Date.now(); if (!a.length || t - a[a.length - 1] >= 60_000) { a.push(t); if (a.length > 3000) a.splice(0, a.length - 3000); act.set(c.uid, a) } }
  function visits(uid: string, since: number) { const a = (act.get(uid) ?? []).filter((t) => t > since); let n = 0, prev = 0; for (const t of a) { if (!n || t - prev > 5 * 60_000) n++; prev = t } return { n, last: a[a.length - 1] ?? 0 } }
  const room = (from: Conn, m: unknown) => { for (const c of conns) if (c !== from && from.course && c.course === from.course && sees(c, from)) send(c, m) }

  function onMessage(c: Conn, raw: string) {
    let m: Record<string, unknown>
    try { m = JSON.parse(raw) } catch { return }
    if (m.t === 'act' || m.t === 'typing' || (typeof m.t === 'string' && m.t.startsWith('note'))) touch(c)
    if (m.t === 'act') return
    // версия сайта у этой вкладки — разработчику видно в «Профиле», у кого старая; «Обновить у всех» — всем (и себе): обновятся, когда сборка будет на сайте
    if (m.t === 'ver') { c.ver = str(m.ver, 20); presence() }
    else if (m.t === 'hide' && c.dev) { c.hidden = m.on === true; presence() }          // невидимка: присылает сам при подключении и при переключении
    else if (m.t === 'logs' && c.dev) c.logs = m.on === true          // консоль сервера в «Профиле»: открыта — строки идут сразу
    else if (m.t === 'reload' && c.dev) { for (const o of conns) send(o, { t: 'reload', by: c.name }) }
    else if (m.t === 'where') { c.where = str(m.where, 40); c.course = str(m.course, 64); presence() }
    else if (m.t === 'cursor') room(c, { t: 'cursor', cid: c.cid, x: num(m.x), y: num(m.y) })
    else if (m.t === 'sel') room(c, { t: 'sel', cid: c.cid, id: str(m.id, 64) || null })
    // «Курсоры на всех экранах» (режим разработчика): курсор с адресом страницы — всем, показывают те, кто на той же странице
    else if (m.t === 'pcursor') {
      const frac = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(-1, Math.min(2, v)) * 1000) / 1000 : 0)
      const out = { t: 'pcursor', cid: c.cid, path: str(m.path, 200), sel: str(m.sel, 600), rx: frac(m.rx), ry: frac(m.ry), x: num(m.x), y: num(m.y), click: m.click === true }
      for (const o of conns) if (o !== c && sees(o, c)) send(o, out)
    }
    else if (m.t === 'cursors' && c.dev) { cursors = m.on === true; cursorsBy = c.name; for (const o of conns) send(o, { t: 'cursors', on: cursors, by: cursorsBy, mine: o.uid === c.uid }) }
    else if (m.t === 'doc' && m.doc && typeof m.doc === 'object' && canEdit(c.uid)) room(c, { t: 'doc', cid: c.cid, uid: c.uid, doc: m.doc })          // «только просмотр» — курс коллегам не правит
    else if (notes && typeof m.t === 'string' && m.t.startsWith('note')) onNote(c, m)
    // разработчик: кто сколько раз заходил после времени since (его сообщения в чате)
    else if (m.t === 'activity' && c.dev) { const since = num(m.since), users: Record<string, { n: number; last: number }> = {}; for (const uid of act.keys()) if (uid !== c.uid) users[uid] = visits(uid, since); send(c, { t: 'activity', since, users }) }
    // «печатает…» под заметкой — остальным, не храним
    else if (m.t === 'typing') { const out = { t: 'typing', id: str(m.id, 64), uid: c.uid, name: c.name, color: c.color }; for (const o of conns) if (o.uid !== c.uid && sees(o, c)) send(o, out) }
    // «Позвать»: у адресата (или у всех, если не указан) заметка открывается сама и всплывает уведомление
    else if (m.t === 'nudge' && notes?.get(str(m.id, 64))) {
      const to = str(m.to, 64), from = { uid: c.uid, name: c.name, photo: c.photo, color: c.color }
      const cargo = DROPS.includes(str(m.drop, 16)) ? str(m.drop, 16) : ''
      if (cargo) {
        // Посылка на парашюте: падает вниз экрана у всех и копится там стопкой (как в тетрисе), пока адресат не откроет
        const d = { id: 'd' + (++seq) + Date.now().toString(36), note: str(m.id, 64), mid: str(m.mid, 64), cargo, via: VIAS.includes(str(m.via, 8)) ? str(m.via, 8) : 'chute', emoji: emojiList(m.emoji), x: frac01(m.x), by: from, to, at: Date.now() }
        drops.push(d); if (drops.length > DROPS_MAX) drops.shift()
        for (const o of conns) send(o, { t: 'drop', drop: d })
      } else {
        const out = { t: 'nudge', id: str(m.id, 64), mid: str(m.mid, 64), from }
        for (const o of conns) if (o.uid !== c.uid && (!to || o.uid === to)) send(o, out)
      }
    }
    // Открыли посылку (не свою): убрать у всех, у отправителя — «Прочитано»
    else if (m.t === 'drop:open') {
      const i = drops.findIndex((d) => d.id === str(m.id, 64))
      if (i < 0 || drops[i].by.uid === c.uid) return
      const [d] = drops.splice(i, 1)
      for (const o of conns) send(o, { t: 'drop-', id: d.id })
      const n = notes?.seen(author(c), d.note); if (n) for (const o of conns) send(o, { t: 'note', note: n, by: c.uid, cid: c.cid, ref: '' })
    }
  }
  const author = (c: Conn): NoteAuthor => ({ uid: c.uid, name: c.name, photo: c.photo, color: c.color })
  function onNote(c: Conn, m: Record<string, unknown>) {
    const n = m.t === 'note+' ? notes!.create(author(c), m) : m.t === 'note:reply' ? notes!.reply(author(c), m.id, m)
      : m.t === 'note:react' ? notes!.react(author(c), m.id, m.mid, m.e)
      : m.t === 'note:seen' ? notes!.seen(author(c), m.id) : m.t === 'note:move' ? notes!.move(m.id, m)
      : m.t === 'note:block' && c.dev ? notes!.block(author(c), m.id, m.mid, m.on === true)
      : m.t === 'note:edit' ? notes!.edit(author(c), m.id, m.mid, m) : m.t === 'note:msgdel' ? notes!.delMsg(author(c), m.id, m.mid) : null
    if (n) { const out = { t: 'note', note: n, by: c.uid, cid: c.cid, ref: str(m.ref, 40) }; for (const o of conns) send(o, out); return }
    if (m.t === 'note:del') { const gone = notes!.remove(m.id); if (gone) for (const o of conns) send(o, { t: 'note-', id: gone }) }
  }

  return {
    people,
    /** Подключить к http-серверу Express */
    attach(server: Server) {
      const wss = new WebSocketServer({ server, path: '/live', maxPayload: 512 * 1024 })
      wss.on('connection', async (ws, req) => {
        const origin = req.headers.origin || ''
        if (origins.length && origin && !origins.includes(origin)) return ws.close(4403, 'origin')
        const token = new URL(req.url || '', 'http://x').searchParams.get('t') || ''
        const u = await verify(token).catch(() => null)
        if (!u || u.role !== 'teacher') return ws.close(4401, 'unauthorized')
        const c: Conn = { ws, cid: 'c' + (++seq), uid: u.uid, dev: u.dev === true, name: u.name || 'Преподаватель', photo: u.photo || '', color: colorOf(u.uid), where: '', course: '', alive: true, ver: '' }
        conns.add(c)
        send(c, { ...hello(), t: 'hello', cid: c.cid, uid: c.uid, cursors, cursorsBy, notes: notes?.all() ?? [], drops })
        presence()
        ws.on('message', (d) => onMessage(c, String(d)))
        ws.on('pong', () => { c.alive = true })
        ws.on('close', () => { conns.delete(c); presence() })
      })
      // Пинг раз в 25 с: обрываем зависшие соединения (закрытая вкладка, пропала сеть) и не даём прокси закрыть живые
      const ping = setInterval(() => { for (const c of conns) { if (!c.alive) { c.ws.terminate(); continue } c.alive = false; c.ws.ping() } }, 25000)
      wss.on('close', () => clearInterval(ping))
      return wss
    },
    /** Кто-то поменял данные через обычный маршрут — остальным: перезагрузить это. byCid — подключение того, кто правил
     *  (сайт присылает его в заголовке X-Live-Cid), ему самому не шлём: у него данные уже свежие */
    /** Всем преподавателям в приложении (например, «ученик в сети» — без чтения базы) */
    broadcast(m: Record<string, unknown>) { for (const c of conns) send(c, m) },
    /** Строка консоли сервера — разработчикам, у которых открыта консоль */
    logLine(line: unknown) { for (const c of conns) if (c.dev && c.logs) send(c, { t: 'log', line }) },
    changed(what: string, byCid: string) { for (const c of conns) if (c.cid !== byCid) send(c, { t: 'changed', what }) },
  }
}

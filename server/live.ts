// «Кто сейчас в приложении» и правки в реальном времени — WebSocket /live (только преподаватели).
//  • Вход: /live?t=<Firebase ID-токен>; имя и фото — из токена (как в Telegram). Сайт с чужого адреса не пускаем (ALLOWED_ORIGIN).
//  • Присутствие: у каждого подключения — где он (вкладка) и какой курс открыт; всем рассылается список «кто здесь».
//  • Редактор курсов: курсоры, выделение и сам курс после правки пересылаются тем, кто открыл тот же курс.
//  • Общие курсоры (включает разработчик в «Профиле» — сразу для всех): курсор на любой странице — pcursor { path, x, y, click }.
//    Включено ли — общее состояние сервера (cursors), новичок получает его в hello; выключается тем же переключателем.
//    Сохраняет курс в Firestore тот, кто правил (PUT /courses) — здесь только пересылка, ничего не пишем в базу.
//  • После любой правки через обычные маршруты (ученики, расписание, группы…) остальным уходит «changed» — они перезагружают
//    эти данные. Всё в памяти одного процесса: на Render один экземпляр сервера, этого достаточно.
import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'

export interface LiveUser { uid: string; role: string; name: string; photo: string; dev?: boolean }
type Verify = (token: string) => Promise<LiveUser | null>
interface Conn { ws: WebSocket; cid: string; uid: string; dev: boolean; name: string; photo: string; color: string; where: string; course: string; alive: boolean }

const COLORS = ['#f24822', '#0d99ff', '#14ae5c', '#9747ff', '#ffa629', '#ff24bd', '#00b5ce', '#e5a000']
const colorOf = (uid: string) => COLORS[[...uid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length]
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : 0)

export function makeLive({ verify, origins }: { verify: Verify; origins: string[] }) {
  const conns = new Set<Conn>()
  let seq = 0, cursors = false, cursorsBy = ''
  const send = (c: Conn, m: unknown) => { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m)) }
  const people = () => [...conns].map(({ cid, uid, dev, name, photo, color, where, course }) => ({ cid, uid, dev, name, photo, color, where, course }))
  const presence = () => { const m = { t: 'presence', users: people() }; for (const c of conns) send(c, m) }
  const room = (from: Conn, m: unknown) => { for (const c of conns) if (c !== from && from.course && c.course === from.course) send(c, m) }

  function onMessage(c: Conn, raw: string) {
    let m: Record<string, unknown>
    try { m = JSON.parse(raw) } catch { return }
    if (m.t === 'where') { c.where = str(m.where, 40); c.course = str(m.course, 64); presence() }
    else if (m.t === 'cursor') room(c, { t: 'cursor', cid: c.cid, x: num(m.x), y: num(m.y) })
    else if (m.t === 'sel') room(c, { t: 'sel', cid: c.cid, id: str(m.id, 64) || null })
    // «Курсоры на всех экранах» (режим разработчика): курсор с адресом страницы — всем, показывают те, кто на той же странице
    else if (m.t === 'pcursor') { const out = { t: 'pcursor', cid: c.cid, path: str(m.path, 200), x: num(m.x), y: num(m.y), click: m.click === true }; for (const o of conns) if (o !== c) send(o, out) }
    else if (m.t === 'cursors' && c.dev) { cursors = m.on === true; cursorsBy = c.name; for (const o of conns) send(o, { t: 'cursors', on: cursors, by: cursorsBy, mine: o.uid === c.uid }) }
    else if (m.t === 'doc' && m.doc && typeof m.doc === 'object') room(c, { t: 'doc', cid: c.cid, uid: c.uid, doc: m.doc })
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
        const c: Conn = { ws, cid: 'c' + (++seq), uid: u.uid, dev: u.dev === true, name: u.name || 'Преподаватель', photo: u.photo || '', color: colorOf(u.uid), where: '', course: '', alive: true }
        conns.add(c)
        send(c, { t: 'hello', cid: c.cid, cursors, cursorsBy })
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
    changed(what: string, byCid: string) { for (const c of conns) if (c.cid !== byCid) send(c, { t: 'changed', what }) },
  }
}

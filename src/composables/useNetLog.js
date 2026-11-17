// Вкладка «Сеть» панели разработчика: все запросы приложения к нашему серверу (firebase.ts → apiFetch), как Network в Chrome.
// У каждого — метод, путь, код, время, размер и счёт сервера из заголовков ответа: чтений и записей базы (X-DB-Reads / X-DB-Writes),
// сколько документов отдано из кэша сервера (X-DB-Cached), время на сервере (X-Server-Ms). Экран — адрес страницы, где был запрос.
// Пишем всегда (последние MAX, без тел ответов — дёшево); тела ответов сохраняем, только пока панель открыта (net.capture).
import { reactive, watch } from 'vue'
import { net as tapHost } from '../firebase'

const MAX = 400, BODY_MAX = 20000
export const netlog = reactive({ list: [], capture: false, recording: true })
let seq = 0
export const page = () => location.hash.replace(/^#/, '') || location.pathname
const shortBody = (b) => (typeof b === 'string' ? (b.length > BODY_MAX ? b.slice(0, BODY_MAX) + '…' : b) : '')

tapHost.tap = {
  start({ method, path, body }) {
    if (!netlog.recording) return 0
    const e = { id: ++seq, method, path, page: page(), t: Date.now(), p0: performance.now(), status: 0, ms: 0, size: 0, reads: null, writes: null, cached: null, serverMs: null, req: netlog.capture ? shortBody(body) : '', res: '', err: '', done: false }
    netlog.list.push(e)
    if (netlog.list.length > MAX) netlog.list.splice(0, netlog.list.length - MAX)
    return e.id
  },
  end(id, r, err) {
    const e = netlog.list.find((x) => x.id === id)
    if (!e) return
    e.ms = Math.round(performance.now() - e.p0); e.done = true
    if (!r) { e.err = String(err?.message || err || 'сеть'); return }
    const h = (k) => { const v = r.headers.get(k); return v == null ? null : Number(v) }
    Object.assign(e, { status: r.status, size: h('content-length') ?? 0, reads: h('x-db-reads'), writes: h('x-db-writes'), cached: h('x-db-cached'), serverMs: h('x-server-ms') })
    if (netlog.capture) r.clone().text().then((t) => { e.res = shortBody(t); if (!e.size) e.size = t.length }).catch(() => {})
  },
}
export const clearNet = () => { netlog.list = [] }

// Состояние самой панели (DevTools.vue): открыта ли, ширина справа / высота снизу, вкладка — запоминается в браузере.
// Открыть можно и из «Профиля» (кнопка «Панель разработчика»).
const KEY = 'tutor-devtools'
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })()
export const devtools = reactive({ open: !!saved.open, w: saved.w || 460, h: saved.h || 360, tab: saved.tab || 'net' })
watch(devtools, () => { try { localStorage.setItem(KEY, JSON.stringify(devtools)) } catch { /* приватный режим */ } }, { deep: true })

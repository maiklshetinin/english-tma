// «Кто сейчас в приложении» и правки в реальном времени — соединение с нашим сервером (WebSocket /live, server/live.ts).
// Только преподаватели. live.users — все подключения (у человека может быть несколько вкладок), people — по одному на человека.
// onLive('changed' | 'cursor' | 'sel' | 'doc', fn) — подписка на сообщения. В демо (без сервера) ничего не делает.
import { reactive, computed, ref, watch } from 'vue'
import { API, fb, isDemo, liveHeaders } from '../firebase'

export const live = reactive({ on: false, cid: '', users: [] })
export const WHERE = { home: 'Главная', path: 'Курсы', students: 'Ученики', courses: 'Редактор курсов', words: 'Слова', profile: 'Профиль' }
/** По одному на человека: свой — последним (как во Figma), у каждого — где он сейчас */
export const people = computed(() => {
  const by = new Map()
  for (const u of live.users) {
    const p = by.get(u.uid) ?? { ...u, me: false, cids: [] }
    p.cids.push(u.cid); if (u.cid === live.cid) Object.assign(p, { where: u.where, course: u.course, me: true })
    by.set(u.uid, p)
  }
  return [...by.values()].sort((a, b) => a.me - b.me)
})

// Режим разработчика (переключатель в «Профиле»): курсоры коллег на всех экранах, а не только в редакторе курсов.
// Запоминается на этом устройстве; работает между теми, у кого он включён (GlobalCursors.vue).
const DEV_KEY = 'tma.dev.cursors'
export const devCursors = ref((() => { try { return localStorage.getItem(DEV_KEY) === '1' } catch { return false } })())
watch(devCursors, (on) => { try { localStorage.setItem(DEV_KEY, on ? '1' : '0') } catch { /* приватный режим */ } })

const subs = new Map()
export function onLive(type, fn) { if (!subs.has(type)) subs.set(type, new Set()); subs.get(type).add(fn); return () => subs.get(type).delete(fn) }
const emit = (m) => subs.get(m.t)?.forEach(fn => fn(m))

let ws = null, retry = 0, timer = 0, where = null, stopped = true
export function liveSend(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)) }
/** Где я: вкладка и (в редакторе) открытый курс — видно остальным */
export function setWhere(w, course = '') { where = { t: 'where', where: w, course }; liveSend(where) }

async function connect() {
  clearTimeout(timer)
  if (stopped || ws) return
  const token = await fb?.currentUser?.getIdToken().catch(() => null)
  if (!token) { timer = setTimeout(connect, 3000); return }
  const s = new WebSocket(`${API.replace(/^http/, 'ws')}/live?t=${encodeURIComponent(token)}`)
  ws = s
  s.onopen = () => { retry = 0; live.on = true; if (where) liveSend(where) }
  s.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data) } catch { return }
    if (m.t === 'hello') { live.cid = m.cid; liveHeaders['X-Live-Cid'] = m.cid }
    else if (m.t === 'presence') live.users = m.users
    emit(m)
  }
  s.onclose = (e) => {
    ws = null; live.on = false; live.users = []; delete liveHeaders['X-Live-Cid']
    if (stopped || e.code === 4403) return
    timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++))       // переподключаемся: 1, 2, 4… 30 с (Render мог уснуть)
  }
}
export function startLive() {
  if (isDemo || !API || !fb || !stopped) return
  stopped = false; connect()
  document.addEventListener('visibilitychange', onVisible)
}
const onVisible = () => { if (document.visibilityState === 'visible' && !ws && !stopped) { retry = 0; connect() } }
export function stopLive() { stopped = true; clearTimeout(timer); ws?.close(); document.removeEventListener('visibilitychange', onVisible) }
// Для проверки вида без сервера (только локальная разработка): window.__live.emit({ t: 'cursor', … })
if (import.meta.env.DEV) window.__live = { live, emit }

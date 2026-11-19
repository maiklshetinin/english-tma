// Учёт активности (19.11.2026) — для разработчика: заходы, время на экране и время с действиями по вкладкам + лента.
// Включается в «Профиле → Для разработчика» отдельно для преподавателей и учеников; пока выключено — ни обработчиков, ни запросов.
// Каждые 15 с (и при смене вкладки / сворачивании): прошедшее время — вкладке, что была на экране («открыто»);
// если за это время было действие (мышь, нажатие, касание, клавиатура, прокрутка) — ещё и в «активен».
// «Заход» — первое действие после запуска или после 30 мин без действий. Копится в памяти, уходит на сервер раз в 5 минут
// и при сворачивании (fetch keepalive — доходит, даже если окно закрывают). Сервер: server/activity.ts.
import { request } from '../stores/api'
import { apiFetch } from '../firebase'
import { onLive } from './useLive'

const TICK = 15_000, FLUSH = 5 * 60_000, NEW_VISIT = 30 * 60_000
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
const pad = (n) => String(n).padStart(2, '0')
const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

let on = false, role = '', getTab = () => ''
let tab = '', hit = false, prevT = 0, wasVis = false, lastAct = 0, timers = []
let acc = null          // { day, visits, tabs, spans } — ещё не отправлено
let cur = null          // текущий кусок ленты { tab, a, b, act }
const queue = []        // не дошедшие куски — повторим со следующей отправкой
let sending = false

const mark = () => { hit = true }
const fresh = (day) => ({ day, visits: 0, tabs: {}, spans: [] })
function closeSpan() { if (cur) { acc?.spans.push(cur); cur = null } }

/** Записать время с прошлого шага на вкладку, что была на экране */
function tick() {
  const now = Date.now(), dt = Math.min(now - prevT, TICK * 2)          // спал ноутбук — не больше двух шагов
  prevT = now
  if (acc && acc.day !== dayOf(now)) flush()                              // новый день — отдельный документ
  if (wasVis && dt > 0) {
    acc ??= fresh(dayOf(now))
    if (hit && now - lastAct > NEW_VISIT) acc.visits++
    if (hit) lastAct = now
    const sec = dt / 1000, t = acc.tabs[tab] ??= { open: 0, act: 0 }
    t.open += sec; if (hit) t.act += sec
    if (cur && cur.tab === tab && now - dt - cur.b < 1000) { cur.b = now; if (hit) cur.act += sec }
    else { closeSpan(); cur = { tab, a: now - dt, b: now, act: hit ? sec : 0 } }
  } else closeSpan()
  hit = false
  wasVis = document.visibilityState === 'visible'
}

async function flush() {
  closeSpan()
  if (acc && (acc.visits || Object.keys(acc.tabs).length)) {
    const r = (v) => Math.round(v)
    queue.push({ day: acc.day, visits: acc.visits, spans: acc.spans.map((s) => ({ ...s, a: r(s.a), b: r(s.b), act: r(s.act) })),
      tabs: Object.fromEntries(Object.entries(acc.tabs).map(([k, v]) => [k, { open: r(v.open), act: r(v.act) }])) })
    if (queue.length > 12) queue.shift()
  }
  acc = null
  if (sending) return          // уже отправляем — этот кусок уйдёт следом в том же цикле
  sending = true
  try { await send() } finally { sending = false }
}
async function send() {
  while (queue.length) {
    try {
      const res = await apiFetch('/me/activity', { method: 'POST', body: JSON.stringify(queue[0]), keepalive: true })
      if (res.status === 400) { queue.shift(); continue }          // кривой кусок — выбросить, не застревать
      if (!res.ok) return
      queue.shift()
      if ((await res.json()).on === false) return stop(false)
    } catch { return }          // нет сети — отправим со следующим
  }
}

const onTab = () => { const t = getTab() || 'other'; if (t !== tab) { tick(); tab = t } }
const onVis = () => { tick(); if (document.visibilityState !== 'visible') flush() }

function start() {
  if (on) return
  on = true; tab = getTab() || 'other'; prevT = Date.now(); wasVis = document.visibilityState === 'visible'; hit = false; lastAct = 0
  for (const e of EVENTS) addEventListener(e, mark, { passive: true, capture: true })
  document.addEventListener('visibilitychange', onVis); addEventListener('pagehide', onVis)
  timers = [setInterval(tick, TICK), setInterval(() => { tick(); flush() }, FLUSH)]
}
function stop(send = true) {
  if (!on) return
  if (send) { tick(); flush() }
  on = false; acc = null; cur = null
  for (const e of EVENTS) removeEventListener(e, mark, { capture: true })
  document.removeEventListener('visibilitychange', onVis); removeEventListener('pagehide', onVis)
  timers.forEach(clearInterval); timers = []
}

/** После входа: спросить сервер, включён ли учёт для этой роли. tab() — текущая вкладка (route.meta.tab) */
export function initActivity(r, tabFn) {
  role = r; getTab = tabFn
  request('/me/activity', undefined, 'Учёт').then((v) => (v.on ? start() : stop(false))).catch(() => { /* старый сервер — без учёта */ })
}
/** Сменилась вкладка — время до этого момента записать на прежнюю */
export const activityTab = () => { if (on) onTab() }
onLive('actlog', (s) => { const want = role === 'teacher' ? s.teachers : role === 'student' ? s.students : false; if (want) start(); else stop() })

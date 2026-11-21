// Журнал заходов в уроки (21.11.2026): каждый заход — отдельная запись на сервере (server/learn.ts → lessonLogs), пишется по ходу
// урока, поэтому видно и незаконченный урок. По каждому экрану: ok (верно / ошибка / null — без оценки), sec — сколько пробыл,
// t — сколько раз отвечал, x — что ответил, sc — балл ИИ. Отправка пачкой: через DELAY после изменения, при «Готово» и при закрытии.
// Читает вкладка Review «Журнал» (components/LessonLog.vue).
export const DELAY = 3000
export const LOCAL_LOG = 'tma.lessonLog.v1'          // без сервера (демо) — журнал в этом браузере
const MAX = 400

/** id захода: латиница и цифры, 6–32 знака (как проверяет сервер) */
export const newRun = (now = Date.now()) => now.toString(36) + Math.random().toString(36).slice(2, 8).padEnd(6, '0')

/**
 * @param {{ itemId: string, n: number, send: (body: object) => void, now?: () => number, timer?: { set: Function, clear: Function } }} o
 */
export function makeRunLog({ itemId, n, send, now = Date.now, timer = { set: setTimeout, clear: clearTimeout } }) {
  const run = newRun(now()), at = now(), steps = {}
  let cur = null, since = at, fin = false, dirty = false, t = null
  const entry = (id) => (steps[id] ??= { ok: null, ms: 0, t: 0 })
  function tick() { const x = now(); if (cur) entry(cur).ms += Math.max(0, x - since); since = x }
  function later() { dirty = true; timer.clear(t); t = timer.set(flush, DELAY) }
  function body() {
    const out = {}
    for (const [id, e] of Object.entries(steps).slice(0, MAX)) {
      const o = { ok: e.ok, sec: Math.min(86400, Math.round(e.ms / 1000)), t: Math.min(100, e.t) }
      if (e.x) o.x = e.x
      if (e.sc != null) o.sc = e.sc
      out[id] = o
    }
    return { run, itemId, at, sec: Math.min(86400, Math.round((now() - at) / 1000)), n: Math.min(1000, n), fin, steps: out }
  }
  function flush() { timer.clear(t); t = null; if (!dirty) return; dirty = false; tick(); send(body()) }
  return {
    run, at,
    /** открыт экран (null — итог урока) */
    step(id) { tick(); cur = id ?? null; if (cur) entry(cur); later() },
    /** ответ на экране: ok true / false / null; text — что ответил; score — балл ИИ (0–100) */
    answer(id, { ok = null, text, score } = {}) {
      tick(); const e = entry(id)
      if (ok !== null) { e.t++; e.ok = ok }
      if (typeof text === 'string' && text.trim()) e.x = text.trim().slice(0, 400)
      if (Number.isFinite(score)) e.sc = Math.max(0, Math.min(100, Math.round(score)))
      later()
    },
    /** «Готово» — урок закончен */
    finish() { tick(); cur = null; fin = true; dirty = true; flush() },
    /** закрыли урок — отправить, что накопилось */
    close() { tick(); cur = null; flush() },
    /** вкладку свернули / уходят со страницы — отправить сейчас (экран остаётся открытым) */
    save() { dirty = true; flush() },
    flush,
    body,
  }
}

/** Без сервера: заход в журнал этого браузера (сразу в виде, как отдаёт сервер GET /progress/log) */
export function saveLocal(view) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_LOG) || '[]').filter((r) => r.run !== view.run)
    all.push(view); localStorage.setItem(LOCAL_LOG, JSON.stringify(all.slice(-300)))
  } catch { /* приватный режим */ }
}
export function readLocal() {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_LOG) || '[]'), tries = {}
    for (const r of [...all].sort((a, b) => a.at - b.at)) r.try = tries[`${r.course}/${r.item}`] = (tries[`${r.course}/${r.item}`] ?? 0) + 1
    return all.sort((a, b) => b.at - a.at)
  } catch { return [] }
}

/** Журнал по дням (новые сверху): { day: 'YYYY-MM-DD', runs, lessons — разных уроков, sec — время всех заходов, ok, all } */
export function byDay(runs) {
  const m = new Map()
  for (const r of runs) {
    const d = new Date(r.at), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const g = m.get(day) ?? { day, runs: [], items: new Set(), sec: 0, ok: 0, all: 0, fin: 0 }
    g.runs.push(r); g.items.add(`${r.course}/${r.item}`); g.sec += r.sec || 0; g.ok += r.ok || 0; g.all += r.all || 0; if (r.fin) g.fin++
    m.set(day, g)
  }
  return [...m.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).map(({ items, ...g }) => ({ ...g, lessons: items.size }))
}
/** «1 ч 05 мин», «12 мин», «40 с» */
export const dur = (sec) => { const s = Math.round(sec || 0); if (s < 60) return `${s} с`; const m = Math.round(s / 60); return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин` }
/** сколько экранов пройдено в заходе (были на экране) */
export const seen = (r) => (r.steps ?? []).filter((s) => s.ok !== undefined || s.sec != null).length

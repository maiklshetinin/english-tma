// Снимки экранов на холсте редактора (23.11.2026): живой — только выбранный экран (и тот, что правят или проходят),
// остальные — снимок: та же разметка, снятая с живого экрана (innerHTML), без компонентов, звука и обработчиков.
// Стили приходят те же (scoped-атрибуты data-v-… остаются в разметке), поэтому снимок выглядит точь-в-точь и той же высоты.
// Снимают по очереди, по одному экрану за раз, в свободное время браузера: экран на миг становится живым, его разметку
// запоминают, и он снова снимок. Высоты экранов помнятся между заходами (localStorage) — пока снимка нет, место под экран
// той же высоты и раскладка не прыгает.
import { ref, shallowReactive, reactive } from 'vue'

/** снимки: ключ экрана → разметка; null — снять не вышло, такой экран остаётся живым */
export const shots = shallowReactive(new Map())
/** ключ экрана, который сейчас снимают (он на миг живой) */
export const turn = ref(null)
const want = new Map()                 // очередь: ключ → true (по порядку просьб)
const SHOTS_MAX = 800

const idle = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 400 }) : setTimeout(f, 30))
let pumping = false
function pump() {
  if (pumping || turn.value || !want.size) return
  pumping = true
  idle(() => {
    pumping = false
    if (turn.value) return
    for (const k of want.keys()) { want.delete(k); if (!shots.has(k)) { turn.value = k; return } }
  })
}
/** экрану нужен снимок — встать в очередь */
export function need(key) { if (!shots.has(key) && !want.has(key) && turn.value !== key) { want.set(key, true); pump() } }
/** экран ушёл с холста (урок закрыли, экран за краем) — из очереди долой */
export function drop(key) { want.delete(key); if (turn.value === key) { turn.value = null; pump() } }
/** снимок готов (html: null — не вышло) */
export function done(key, html) {
  put(key, html)
  if (turn.value === key) { turn.value = null; pump() }
}
/** запомнить разметку экрана (и когда снимали по очереди, и когда живой экран снова стал снимком) */
export function put(key, html) {
  if (shots.size >= SHOTS_MAX) shots.delete(shots.keys().next().value)
  shots.set(key, html)
}

/** разметка живого экрана → снимок: звук не грузим, видео — только первый кадр, без автозапуска */
export function clean(html) {
  return html
    .replace(/<audio\b([^>]*)>/gi, (m, a) => '<audio' + a.replace(/\s(src|autoplay|preload)(="[^"]*")?/gi, '') + ' preload="none">')
    .replace(/<video\b([^>]*)>/gi, (m, a) => '<video' + a.replace(/\s(autoplay|preload)(="[^"]*")?/gi, '') + ' preload="metadata">')
}

/** короткий отпечаток строки — для ключа снимка (поменяли экран — новый снимок) */
export function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// ---------- высоты экранов: помнятся между заходами ----------
const HK = 'lr:heights'
const H_MAX = 4000
function loadH() { try { const v = JSON.parse(localStorage.getItem(HK) || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} } }
/** высота живого экрана по id экрана (px) */
export const heights = reactive(loadH())
let hT = 0
export function setHeight(id, h) {
  if (!h || heights[id] === h) return
  heights[id] = h
  clearTimeout(hT)
  hT = setTimeout(() => {
    try {
      const ks = Object.keys(heights)
      if (ks.length > H_MAX) for (const k of ks.slice(0, ks.length - H_MAX)) delete heights[k]
      localStorage.setItem(HK, JSON.stringify(heights))
    } catch { /* места нет или запрещено — ничего страшного */ }
  }, 800)
}

// ---------- далеко: холст сильно отдалён — экраны блоками ----------
/** true — масштаб холста меньше FAR_Z: вместо экранов цветные блоки с названием (ставит редактор курса) */
export const far = ref(false)
export const FAR_Z = 0.4

// ---------- плитки шаблонов (ExerciseMini): разметка одна на шаблон ----------
/** id шаблона → разметка миниатюры (null — не вышло, плитка рисует сама); taken — шаблоны, которые уже рисуются */
export const MINI = Object.assign(shallowReactive(new Map()), { taken: new Set() })

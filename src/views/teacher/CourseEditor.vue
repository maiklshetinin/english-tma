<script setup>
// ЧЕРНОВИК. Редактор курсов — холст как во FigJam + «рельс».
//  • Холст: тянуть по пустому месту / колёсико — двигать; Ctrl + колёсико, щипок, кнопки — масштаб; «Весь курс» — показать всё.
//  • Рельс — одна линия сверху вниз («Волна» или «Прямая»), на ней по порядку задания. Рельс и есть шкала прогресса:
//    пройденное закрашено, текущее — «Сейчас». Сверху — сводка, как увидит ученик.
//  • Задание можно просто положить на холст рядом (черновики), потом перетащить на рельс — встанет в ближайший промежуток,
//    соседи расступятся. С рельса — оттащить на холст. С панели — тянуть куда угодно или нажать (в конец рельса).
//  • Кружки из Telegram: перетащить видео на холст / рельс (или «Кружок» на панели — выбрать файл).
// Только для преподавателя. Хранится только в этом браузере (localStorage, видео — IndexedDB), с сервером не связан.
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const goBack = () => (history.length > 1 ? router.back() : router.push({ name: 'profile' }))
const KEY = 'tma.courseRail.v1'

// ---------- Типы заданий ----------
const T = {
  unit:   { t: 'Юнит', c: 'var(--green)', d: 'var(--green-d)' },
  lesson: { t: 'Урок', c: 'var(--green)', d: 'var(--green-d)', ic: '<circle cx="12" cy="12" r="8"/><path d="M9 12.3l2 2 4-4"/>' },
  words:  { t: 'Слова', c: 'var(--blue)', d: 'var(--blue-d)', ic: '<rect x="4" y="7" width="12" height="13" rx="2.5"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16"/>' },
  hw:     { t: 'Домашка', c: '#2ec4b6', d: '#1f9e93', ic: '<path d="M14.6 6.1l3.3 3.3"/><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z"/>' },
  test:   { t: 'Тест', c: 'var(--orange)', d: 'var(--orange-d)', ic: '<path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.1l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"/>' },
  tutor:  { t: 'С репетитором', c: 'var(--purple)', d: 'var(--purple-d)', ic: '<rect x="3.5" y="6.5" width="12" height="11" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3z"/>' },
  video:  { t: 'Кружок', c: '#2aabee', d: '#1a8bc9', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M10.3 9.2v5.6l4.6-2.8z" fill="currentColor"/>' },
  reward: { t: 'Награда', c: 'var(--yellow)', d: 'var(--yellow-d)', ic: '<path d="M8 4.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5v.8A3.7 3.7 0 0 0 8 11M16 6.5h3.5v.8A3.7 3.7 0 0 1 16 11"/><path d="M12 14v4M8.5 20h7"/>' },
}
const CHECK = '<path d="M6 12.5l4 4 8-9"/>'
const PALETTE = ['unit', 'video', 'lesson', 'words', 'hw', 'test', 'tutor', 'reward']
const UNIT_COLORS = [['var(--green)', 'var(--green-d)'], ['var(--purple)', 'var(--purple-d)'], ['var(--blue)', 'var(--blue-d)'], ['var(--orange)', 'var(--orange-d)']]

let seq = Date.now() % 100000
const uid = () => 'i' + (++seq)
const it = (type, title, extra = {}) => ({ id: uid(), type, title, ...extra })
const seed = () => ({
  title: 'Базовый курс A1', progress: 5, mode: 'wave',
  items: [
    it('unit', 'Юнит 1', { sub: 'Present Simple' }),
    it('lesson', 'Глагол to be'), it('words', 'Слова: семья'), it('hw', 'Упражнения 1–5'), it('lesson', 'Отрицания'), it('tutor', 'Разговор с репетитором'), it('test', 'Тест юнита'), it('reward', 'Сундук'),
    it('unit', 'Юнит 2', { sub: 'Past Simple' }),
    it('lesson', 'Правильные глаголы'), it('words', 'Слова: путешествия'), it('lesson', 'Неправильные глаголы'), it('hw', 'Рассказ о выходных'), it('test', 'Тест юнита'),
  ],
  loose: [it('words', 'Слова: еда', { x: 300, y: 90 }), it('lesson', 'Артикли a / the', { x: 300, y: 220 })],
})
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v?.items) return { loose: [], ...v } } catch { /* нет */ } return seed() }
const doc = reactive(load())
let st = 0
const save = () => { clearTimeout(st); st = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(doc)) } catch { /* приватный режим */ } }, 250) }
onUnmounted(() => clearTimeout(st))

// ---------- Холст: сдвиг и масштаб ----------
const board = ref(null), W = ref(innerWidth), H = ref(innerHeight)
const view = reactive({ x: innerWidth / 2, y: 330, z: 1 })
const phone = computed(() => W.value < 720)
const toWorld = (cx, cy) => { const r = board.value.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z } }
const toScreen = (p) => ({ x: p.x * view.z + view.x, y: p.y * view.z + view.y })
function zoomAt(f, cx, cy) {
  const r = board.value.getBoundingClientRect(), z = Math.min(2.5, Math.max(0.15, view.z * f)), k = z / view.z
  view.x = cx - r.left - (cx - r.left - view.x) * k; view.y = cy - r.top - (cy - r.top - view.y) * k; view.z = z
}
const zoomBtn = (f) => { const r = board.value.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2) }
function onWheel(e) {
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
  else { view.x -= e.deltaX; view.y -= e.deltaY }
}
// «Весь курс»: рельс, черновики и сводка — на экране целиком
function fit(anim = true) {
  const ps = [...layout.value, ...doc.loose.map(l => ({ x: l.x, y: l.y }))]
  const xs = [...ps.map(p => p.x - 200), ...ps.map(p => p.x + 200), -230, 230], ys = [...ps.map(p => p.y + 70), -250]
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const top = phone.value ? 110 : 76, bottom = 110
  const z = Math.min(1.1, (W.value - 24) / (x1 - x0), (H.value - top - bottom) / (y1 - y0))
  animView({ z, x: W.value / 2 - (x0 + x1) / 2 * z, y: top - y0 * z }, anim)
}
function animView(to, anim) {
  if (!anim) return Object.assign(view, to)
  const from = { ...view }, t0 = performance.now()
  const step = (t) => { const k = Math.min(1, (t - t0) / 220), e = 1 - (1 - k) ** 3; view.x = from.x + (to.x - from.x) * e; view.y = from.y + (to.y - from.y) * e; view.z = from.z + (to.z - from.z) * e; if (k < 1) requestAnimationFrame(step) }
  requestAnimationFrame(step)
}
const onResize = () => { W.value = innerWidth; H.value = innerHeight }
onMounted(() => {
  addEventListener('resize', onResize)
  // при открытии — начало курса крупно (на телефоне чуть мельче, чтобы влезли подписи)
  view.z = Math.min(1, W.value / 560); view.x = W.value / 2; view.y = (phone.value ? 120 : 80) + 260 * view.z
})
onUnmounted(() => removeEventListener('resize', onResize))
// Точки фона двигаются вместе с холстом; при отдалении — реже
const dots = computed(() => { let s = 20 * view.z; while (s < 10) s *= 4; return { backgroundSize: `${s}px ${s}px`, backgroundPosition: `${view.x}px ${view.y}px` } })

// ---------- Раскладка рельса (в координатах холста; центр линии — x = 0) ----------
const mode = computed({ get: () => doc.mode ?? 'wave', set: (v) => { doc.mode = v; save() } })
const G = { step: 116, unitGap: 160, amp: 84 }
const K = [0, .7, 1, .7, 0, -.7, -1, -.7]
const drag = reactive({ on: false, item: null, from: null, over: false, to: 0, x: 0, y: 0 })
const layoutOf = (list) => {
  let y = 0
  return list.map((x, i) => {
    if (i) y += x.type === 'unit' ? G.unitGap : G.step
    const off = mode.value === 'wave' ? K[i % 8] * G.amp : 0
    return { x: off, y, side: off > 0 ? 'l' : 'r' }
  })
}
// Порядок на рельсе: взятое (если целимся в рельс) уже стоит на месте прицела
const order = computed(() => {
  const list = doc.items.filter(x => !(drag.on && x.id === drag.item?.id))
  if (drag.on && drag.over) list.splice(Math.min(drag.to, list.length), 0, drag.item)
  return list
})
const layout = computed(() => layoutOf(order.value))
const pos = (i) => layout.value[i] ?? { x: 0, y: 0, side: 'r' }
function railPath(n) {
  if (!n) return ''
  const P = layout.value.slice(0, n); let d = `M${P[0].x},${P[0].y}`
  for (let i = 1; i < P.length; i++) {
    const p0 = P[i - 2] ?? P[i - 1], p1 = P[i - 1], p2 = P[i], p3 = P[i + 1] ?? p2
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`
  }
  return d
}
const rail = computed(() => railPath(order.value.length))
const railBox = computed(() => { const ys = layout.value.map(p => p.y); return { y1: Math.max(0, ...ys) + 200 } })
// Прогресс: progress — сколько заданий (станции не в счёт) пройдено
const taskIdx = computed(() => { let k = 0; return order.value.map(x => (x.type === 'unit' ? null : k++)) })
const tasksCount = computed(() => doc.items.filter(x => x.type !== 'unit').length)
const curIndex = computed(() => { const i = taskIdx.value.findIndex(k => k === doc.progress); return i < 0 ? order.value.length - 1 : i })
const doneRail = computed(() => railPath(curIndex.value + 1))
const stateOf = (x, i) => (x.type === 'unit' ? (i <= curIndex.value ? 'done' : 'todo') : taskIdx.value[i] < doc.progress ? 'done' : taskIdx.value[i] === doc.progress ? 'current' : 'todo')
const unitNo = (i) => order.value.slice(0, i + 1).filter(x => x.type === 'unit').length
const unitColor = (i) => UNIT_COLORS[(Math.max(1, unitNo(i)) - 1) % UNIT_COLORS.length]
const setProgress = (v) => { doc.progress = Math.max(0, Math.min(tasksCount.value, v)); save() }
const pct = computed(() => (tasksCount.value ? Math.round(doc.progress / tasksCount.value * 100) : 0))
const curUnit = computed(() => { let u = null; order.value.slice(0, curIndex.value + 1).forEach(x => { if (x.type === 'unit') u = x }); return u ?? order.value.find(x => x.type === 'unit') })
const curUnitNo = computed(() => order.value.filter(x => x.type === 'unit').indexOf(curUnit.value) + 1)
const unitsCount = computed(() => doc.items.filter(x => x.type === 'unit').length)
const looseShown = computed(() => doc.loose.filter(l => !(drag.on && l.id === drag.item?.id)))
const beadStyle = (x, p, c) => ({ left: p.x + 'px', top: p.y + 'px', '--c': c[0], '--d': c[1] })
const colorOf = (x, i) => (x.type === 'unit' ? (i == null ? UNIT_COLORS[0] : unitColor(i)) : [T[x.type].c, T[x.type].d])

// ---------- Перетаскивание: с панели, с рельса, с холста ----------
let pending = null
// Ближайший промежуток рельса к точке холста; «на рельсе» — если близко к линии
function nearest(w) {
  const keep = doc.items.filter(v => v.id !== drag.item?.id), P = layoutOf(keep), n = keep.length
  let best = n, bd = Infinity
  for (let i = 0; i <= n; i++) {
    const a = P[i - 1], b = P[i]
    const g = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : b ? { x: b.x, y: b.y - 58 } : { x: a ? a.x : 0, y: a ? a.y + 58 : 0 }
    const d = ((g.x - w.x) * .7) ** 2 + (g.y - w.y) ** 2
    if (d < bd) { bd = d; best = i }
  }
  return { i: best, near: bd < 95 ** 2 }
}
const overToolbar = (cy) => cy > H.value - (phone.value ? 92 : 104)
function startDrag(e, src) {
  if (editing.value || touches.size > 1) return
  pending = { ...src, sx: e.clientX, sy: e.clientY }
  addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true }); addEventListener('pointercancel', up, { once: true })
}
function move(e) {
  if (pending && !drag.on) {
    if (Math.hypot(e.clientX - pending.sx, e.clientY - pending.sy) < 5) return
    sel.value = null
    Object.assign(drag, { on: true, item: pending.type ? newItem(pending.type) : pending.item, from: pending.type ? 'new' : pending.from })
  }
  if (!drag.on) return
  drag.x = e.clientX; drag.y = e.clientY
  const n = nearest(toWorld(e.clientX, e.clientY)); drag.over = n.near && !overToolbar(e.clientY); drag.to = n.i
}
function up(e) {
  removeEventListener('pointermove', move)
  const p = pending; pending = null
  if (!drag.on) {                    // нажатие
    if (p?.type === 'video') return pickFile(null)
    if (p?.type) { const x = newItem(p.type); doc.items.push(x); sel.value = x.id; save(); nextTick(() => showRailEnd()) }
    else if (p?.item) sel.value = sel.value === p.item.id ? null : p.item.id
    return
  }
  drop(drag.over ? 'rail' : overToolbar(e.clientY) ? 'cancel' : 'canvas', toWorld(e.clientX, e.clientY))
}
// Куда легло взятое: на рельс (в промежуток), на холст (где отпустили) или отмена (над панелью)
function drop(where, w) {
  const x = drag.item, from = drag.from
  if (where === 'rail') {
    if (from === 'loose') doc.loose.splice(doc.loose.findIndex(l => l.id === x.id), 1)
    delete x.x; delete x.y
    doc.items.splice(0, doc.items.length, ...order.value)
  } else if (where === 'canvas') {
    if (from === 'rail') doc.items.splice(doc.items.findIndex(v => v.id === x.id), 1)
    x.x = Math.round(w.x); x.y = Math.round(w.y)
    if (from !== 'loose') doc.loose.push(x)
  }
  Object.assign(drag, { on: false, item: null, over: false })
  if (where !== 'cancel' && from === 'new') { sel.value = x.id; if (x.type === 'video' && !x.media) pickFile(findAny(x.id)) }
  setProgress(doc.progress)
}
function newItem(type) {
  const nUnits = doc.items.filter(x => x.type === 'unit').length
  return it(type, type === 'unit' ? `Юнит ${nUnits + 1}` : T[type].t, type === 'unit' ? { sub: 'Тема юнита' } : {})
}
const findAny = (id) => doc.items.find(v => v.id === id) ?? doc.loose.find(v => v.id === id)
function showRailEnd() { const p = toScreen(pos(order.value.length - 1)); if (p.y > H.value - 160 || p.y < 100) animView({ ...view, y: view.y - (p.y - H.value / 2) }, true) }

// ---------- Пустое место: двигать холст; два пальца — масштаб ----------
const touches = new Map(); let pan = null, pinch = null
function boardDown(e) {
  if (e.pointerType === 'touch') { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; pan = null; return } }
  pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
  board.value.setPointerCapture?.(e.pointerId)
}
function boardMove(e) {
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      view.x += cx - pinch.cx; view.y += cy - pinch.cy; zoomAt(d / pinch.d, cx, cy); pinch = { d, cx, cy }; return
    }
  }
  if (!pan) return
  if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 3) pan.moved = true
  view.x = pan.vx + e.clientX - pan.sx; view.y = pan.vy + e.clientY - pan.sy
}
function boardUp(e) {
  touches.delete(e.pointerId); if (touches.size < 2) pinch = null
  if (pan && !pan.moved) sel.value = null
  pan = null
}

// ---------- Кружки из Telegram ----------
// Видео — в IndexedDB этого браузера (в localStorage не влезет); на сервер пока не уходит.
const IDB = 'tma-course-media'
const idb = () => new Promise((ok, no) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore('v'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
async function mediaOp(mode, fn) { const db = await idb(); return new Promise((ok, no) => { const tx = db.transaction('v', mode), r = fn(tx.objectStore('v')); tx.oncomplete = () => ok(r?.result ?? null); tx.onerror = () => no(tx.error) }) }
const urls = reactive({})
function mediaUrl(x) {
  if (!x?.media) return ''
  if (!(x.media in urls)) { urls[x.media] = ''; mediaOp('readonly', s => s.get(x.media)).then(b => { if (b) urls[x.media] = URL.createObjectURL(b) }).catch(() => {}) }
  return urls[x.media]
}
const isVideo = (f) => f && (f.type?.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(f.name))
const MAX_MB = 200
async function attach(item, file) {
  if (!item) return
  if (!isVideo(file)) return alert('Это не видео. Перетащите кружок из Telegram (видеофайл).')
  if (file.size > MAX_MB * 1024 * 1024) return alert(`Видео больше ${MAX_MB} МБ — слишком большое для черновика.`)
  const id = 'm' + item.id
  try { await mediaOp('readwrite', s => s.put(file, id)) } catch { return alert('Не удалось сохранить видео в браузере (мало места?).') }
  urls[id] = URL.createObjectURL(file); item.media = id; save()
}
const fileInput = ref(null); let pickFor = null
const pickFile = (item) => { pickFor = item; fileInput.value.value = ''; fileInput.value.click() }
async function onPicked(e) {
  const files = [...e.target.files].filter(isVideo); if (!files.length) return
  let item = pickFor
  for (const f of files) {
    if (!item) { item = newItem('video'); doc.items.push(item) }
    await attach(findAny(item.id), f); sel.value = item.id; item = null
  }
  if (!pickFor) nextTick(() => showRailEnd())
}
// Файл тащат из Telegram / проводника: на рельс — с местом вставки, мимо — на холст
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
function fileOver(e) {
  if (!hasFiles(e)) return
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
  if (!drag.on) { sel.value = null; Object.assign(drag, { on: true, item: newItem('video'), from: 'file' }) }
  drag.x = e.clientX; drag.y = e.clientY
  const n = nearest(toWorld(e.clientX, e.clientY)); drag.over = n.near && !overToolbar(e.clientY); drag.to = n.i
}
function fileLeave(e) { if (!e.relatedTarget && drag.on && drag.from === 'file') Object.assign(drag, { on: false, item: null }) }
async function fileDrop(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  const files = [...e.dataTransfer.files].filter(isVideo), first = drag.item, w = toWorld(e.clientX, e.clientY), onRail = drag.over
  if (!files.length || !first) { Object.assign(drag, { on: false, item: null }); return alert('Перетащите видео — кружок из Telegram или файл .mp4') }
  const extra = files.slice(1).map(() => newItem('video'))
  if (onRail) {
    const list = order.value.slice(), at = list.findIndex(v => v.id === first.id)
    list.splice(at + 1, 0, ...extra); doc.items.splice(0, doc.items.length, ...list)
  } else [first, ...extra].forEach((x, k) => { x.x = Math.round(w.x + k * 90); x.y = Math.round(w.y); doc.loose.push(x) })
  Object.assign(drag, { on: false, item: null, over: false })
  const targets = [first, ...extra]
  for (let k = 0; k < files.length; k++) await attach(findAny(targets[k].id), files[k])
  sel.value = first.id; setProgress(doc.progress)
}
const play = (e, on) => { const v = e.currentTarget.querySelector('video'); if (v) on ? v.play().catch(() => {}) : v.pause() }

// ---------- Карточка выбранного ----------
const sel = ref(null), editing = ref(false)
const selItem = computed(() => findAny(sel.value))
const selLoose = computed(() => !!doc.loose.find(v => v.id === sel.value))
function remove() {
  const x = selItem.value; if (!x) return
  const a = doc.items.findIndex(v => v.id === x.id); if (a >= 0) doc.items.splice(a, 1)
  const b = doc.loose.findIndex(v => v.id === x.id); if (b >= 0) doc.loose.splice(b, 1)
  if (x.media) mediaOp('readwrite', s => s.delete(x.media)).catch(() => {})
  sel.value = null; setProgress(doc.progress)
}
function toRailEnd() { const x = selItem.value; doc.loose.splice(doc.loose.findIndex(v => v.id === x.id), 1); delete x.x; delete x.y; doc.items.push(x); setProgress(doc.progress); nextTick(showRailEnd) }
const popStyle = computed(() => {
  const x = selItem.value; if (!x) return null
  const i = order.value.findIndex(v => v.id === x.id), p = i >= 0 ? pos(i) : { x: x.x, y: x.y, side: 'r' }
  const s = toScreen(p), w = 260, r = 36 * view.z
  const want = p.side === 'r' ? s.x - w - r - 16 : s.x + r + 16
  return { left: Math.min(Math.max(8, want), W.value - w - 8) + 'px', top: Math.min(Math.max(70, s.y - 60), H.value - 380) + 'px', width: w + 'px' }
})
const onKey = (e) => {
  if (/INPUT|TEXTAREA/.test(e.target?.tagName)) return
  if (e.key === 'Escape') sel.value = null
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel.value) remove()
}
onMounted(() => addEventListener('keydown', onKey)); onUnmounted(() => removeEventListener('keydown', onKey))

function exportJson() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })); a.download = 'course.json'; a.click()
}
function reset() { if (!confirm('Вернуть пример курса? Текущий черновик удалится.')) return; Object.assign(doc, seed()); sel.value = null; save(); nextTick(() => fit()) }
</script>

<template>
  <div class="ce" :class="{ dragging: drag.on }" @dragover="fileOver" @dragleave="fileLeave" @drop="fileDrop">
    <input ref="fileInput" type="file" accept="video/*" multiple hidden @change="onPicked" />
    <div ref="board" class="board" :style="dots" @pointerdown="boardDown" @pointermove="boardMove" @pointerup="boardUp" @pointercancel="boardUp" @wheel="onWheel">
      <div class="world" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }">
        <!-- Сводка, как увидит ученик -->
        <div class="sum" @pointerdown.stop>
          <div class="sh"><span><i class="dt" />Юнит {{ curUnitNo }} из {{ unitsCount }}</span><b class="pp">{{ pct }}%</b></div>
          <div class="st">{{ curUnit?.sub || curUnit?.title }}</div>
          <div class="bar"><i :style="{ width: pct + '%' }" /></div>
          <div class="sf"><span>Пройдено: <b>{{ doc.progress }} из {{ tasksCount }}</b></span><span>Осталось {{ tasksCount - doc.progress }}</span></div>
        </div>
        <svg class="rail" :height="railBox.y1"><path :d="rail" class="r0" /><path :d="doneRail" class="r1" /></svg>
        <!-- Рельс -->
        <div v-for="(x, i) in order" :key="x.id" class="bead" :class="[x.type, stateOf(x, i), 's-' + pos(i).side, { lift: drag.on && drag.item?.id === x.id, on: sel === x.id }]"
          :style="beadStyle(x, pos(i), colorOf(x, i))" @pointerdown.stop="startDrag($event, { item: x, from: 'rail' })" @pointerenter="play($event, true)" @pointerleave="play($event, false)">
          <template v-if="x.type === 'unit'"><b class="no">{{ unitNo(i) }}</b><div class="sign"><b>{{ x.title }}</b><span>{{ x.sub }}</span></div></template>
          <template v-else>
            <video v-if="x.type === 'video' && mediaUrl(x)" :src="mediaUrl(x)" class="vid" muted loop playsinline preload="metadata" />
            <svg v-if="x.type !== 'video' || !mediaUrl(x) || stateOf(x, i) === 'done'" viewBox="0 0 24 24" class="ic" :class="{ badge: x.type === 'video' && mediaUrl(x) }" v-html="stateOf(x, i) === 'done' ? CHECK : T[x.type].ic" />
            <em class="cap"><span v-if="stateOf(x, i) === 'current'" class="start">Сейчас</span>{{ x.title }}<small v-if="x.title !== T[x.type].t">{{ T[x.type].t }}</small></em>
          </template>
        </div>
        <!-- Черновики на холсте: ещё не на рельсе -->
        <div v-for="x in looseShown" :key="x.id" class="bead loose" :class="[x.type, { on: sel === x.id }]" :style="beadStyle(x, x, colorOf(x))"
          @pointerdown.stop="startDrag($event, { item: x, from: 'loose' })" @pointerenter="play($event, true)" @pointerleave="play($event, false)">
          <template v-if="x.type === 'unit'"><b class="no">+</b><em class="cap">{{ x.title }}<small>не на рельсе</small></em></template>
          <template v-else>
            <video v-if="x.type === 'video' && mediaUrl(x)" :src="mediaUrl(x)" class="vid" muted loop playsinline preload="metadata" />
            <svg v-else viewBox="0 0 24 24" class="ic" v-html="T[x.type].ic" />
            <em class="cap">{{ x.title }}<small>не на рельсе</small></em>
          </template>
        </div>
      </div>
    </div>

    <!-- Взятое — за пальцем в масштабе холста; мимо рельса — полупрозрачное -->
    <div v-if="drag.on" class="fly" :class="[drag.item.type, { out: !drag.over }]" :style="{ left: drag.x + 'px', top: drag.y + 'px', '--c': T[drag.item.type].c, '--d': T[drag.item.type].d, transform: `scale(${view.z * 1.06})` }">
      <video v-if="drag.item.type === 'video' && mediaUrl(drag.item)" :src="mediaUrl(drag.item)" class="vid" muted />
      <b v-else-if="drag.item.type === 'unit'" class="no">+</b><svg v-else viewBox="0 0 24 24" class="ic" v-html="T[drag.item.type].ic" />
    </div>

    <!-- Карточка выбранного -->
    <div v-if="selItem && !drag.on" class="pop" :style="popStyle" @pointerdown.stop>
      <div class="ph">{{ T[selItem.type].t }}<span v-if="selLoose" class="lz">на холсте</span></div>
      <input v-model="selItem.title" class="in" :placeholder="T[selItem.type].t" @focus="editing = true" @blur="editing = false" @input="save" />
      <input v-if="selItem.type === 'unit'" v-model="selItem.sub" class="in sub" placeholder="Тема юнита" @focus="editing = true" @blur="editing = false" @input="save" />
      <template v-if="selItem.type === 'video'">
        <video v-if="mediaUrl(selItem)" :src="mediaUrl(selItem)" class="vbig" controls playsinline />
        <button class="btn-v" @click="pickFile(selItem)">{{ mediaUrl(selItem) ? 'Заменить видео' : 'Выбрать видео' }}</button>
      </template>
      <div v-else-if="selItem.type !== 'unit'" class="types">
        <button v-for="k in PALETTE.slice(1)" :key="k" class="tt" :class="{ on: selItem.type === k }" :style="{ '--c': T[k].c }" :title="T[k].t" @click="selItem.type = k; save()"><svg viewBox="0 0 24 24" v-html="T[k].ic" /></button>
      </div>
      <button v-if="selLoose" class="btn-r" @click="toRailEnd">На рельс — в конец</button>
      <button class="del" @click="remove">{{ selLoose ? 'Удалить' : 'Убрать с рельса' }}</button>
    </div>

    <!-- Сверху -->
    <div class="fl tl-panel">
      <button class="ib" title="Назад" @click="goBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <input v-model="doc.title" class="ttl" aria-label="Название курса" @input="save" />
      <span class="badge-local" title="Хранится только в этом браузере">черновик</span>
    </div>
    <div class="fl tr-panel">
      <div class="seg"><button :class="{ on: mode === 'wave' }" @click="mode = 'wave'">Волна</button><button :class="{ on: mode === 'line' }" @click="mode = 'line'">Прямая</button></div><i class="vs" />
      <span class="pl">Прогресс<small>пример</small></span>
      <button class="sb" @click="setProgress(doc.progress - 1)">−</button><b class="pv">{{ doc.progress }} / {{ tasksCount }}</b><button class="sb" @click="setProgress(doc.progress + 1)">+</button>
      <i class="vs dk" /><button class="pill" @click="exportJson">Экспорт</button><button class="pill grey" @click="reset">Сброс</button>
    </div>
    <!-- Масштаб -->
    <div class="fl zoom"><button title="Отдалить" @click="zoomBtn(1 / 1.25)">−</button><b title="100%" @click="zoomAt(1 / view.z, W / 2, H / 2)">{{ Math.round(view.z * 100) }}%</b><button title="Приблизить" @click="zoomBtn(1.25)">+</button><i class="vs" /><button class="all" title="Показать весь курс" @click="fit()">Весь курс</button></div>

    <!-- Снизу: что положить -->
    <div class="fl tools" role="toolbar">
      <span class="tl">Тяните на рельс или на холст<small>или нажмите — в конец рельса</small></span><i class="sep" />
      <button v-for="k in PALETTE" :key="k" class="pb" :class="k" :style="{ '--c': T[k].c, '--d': T[k].d }" :title="T[k].t" @pointerdown.prevent="startDrag($event, { type: k })">
        <span class="pc"><b v-if="k === 'unit'">1</b><svg v-else viewBox="0 0 24 24" v-html="T[k].ic" /></span><small>{{ T[k].t }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ce { position: fixed; inset: 0; z-index: 30; background: #f5f5f5; user-select: none; -webkit-user-select: none; font-family: var(--font) }
.ce.dragging, .ce.dragging * { cursor: grabbing !important }
/* Холст: бесконечное поле в точку; содержимое — в координатах холста (центр рельса — x = 0) */
.board { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; background-image: radial-gradient(circle, #cfcfcf 1px, transparent 1.3px) }
.board:active { cursor: grabbing }
.world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0 }
/* Рельс: серая дорога, пройденное — зелёным поверх */
.rail { position: absolute; left: 0; top: 0; width: 1px; overflow: visible; pointer-events: none }
.rail path { fill: none; stroke-linecap: round; stroke-linejoin: round }
.r0 { stroke: #e0e0e0; stroke-width: 12 } .r1 { stroke: var(--green); stroke-width: 12 }
/* Бусина-задание */
.bead { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 6px 0 var(--d);
  cursor: grab; transition: left .22s ease, top .22s ease, transform .12s, opacity .15s; touch-action: none; z-index: 2 }
.bead:hover { transform: translateY(-2px) }
.bead.todo { background: #e5e5e5; box-shadow: 0 6px 0 #cdcdcd; color: #afafaf } .bead.todo .cap { color: var(--hint) }
.bead.tutor { border-radius: 20px }
/* Кружок: само видео в круге, с голубым кольцом как в Telegram; при наведении играет без звука */
.bead.video { width: 76px; height: 76px; margin: -38px 0 0 -38px; overflow: visible }
.vid { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--c); pointer-events: none; background: #000 }
.bead.video.todo .vid { filter: grayscale(1); opacity: .6; box-shadow: 0 0 0 3px #fff, 0 0 0 5px #d6d6d6 }
.ic.badge { position: absolute; right: -4px; bottom: -4px; width: 22px; height: 22px; padding: 3px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 2px #fff; box-sizing: border-box; stroke-width: 3 }
.bead.video:has(.vid) { background: transparent; box-shadow: none }
.vbig { justify-self: center; width: min(100%, 200px); aspect-ratio: 1; border-radius: 50%; object-fit: cover; background: #000 }
.btn-v { border: 0; border-radius: 9px; padding: 8px; background: #e3f4fd; color: #1a8bc9; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.bead.current { box-shadow: 0 6px 0 var(--d), 0 0 0 7px #fff, 0 0 0 11px color-mix(in srgb, var(--c) 35%, transparent); animation: pulse 1.6s ease-in-out infinite }
@keyframes pulse { 50% { box-shadow: 0 6px 0 var(--d), 0 0 0 7px #fff, 0 0 0 16px color-mix(in srgb, var(--c) 12%, transparent) } }
.bead.on { outline: 3px solid #0d99ff; outline-offset: 6px }
/* Место, куда встанет взятое: пустое кольцо на рельсе */
.bead.lift { background: #fff !important; color: transparent; box-shadow: none !important; outline: 3px dashed var(--c); outline-offset: -3px; animation: none; transform: none }
.bead.lift > * { visibility: hidden }
.ic { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
/* Подпись — сбоку от бусины, с той стороны, где больше места; линия остаётся чистой */
.cap { position: absolute; top: 50%; left: calc(100% + 16px); transform: translateY(-50%); width: 150px; display: grid; justify-items: start; gap: 1px; font-style: normal; font-size: 14px; font-weight: 800; line-height: 1.2; color: var(--text); pointer-events: none }
.cap small { font-size: 11px; font-weight: 700; color: var(--hint) }
.bead.s-l .cap { left: auto; right: calc(100% + 16px); justify-items: end; text-align: right }
.start { margin-bottom: 3px; padding: 3px 8px; border-radius: 9px; background: #fff; color: var(--c); font-size: 11px; font-weight: 900; text-transform: uppercase; box-shadow: 0 0 0 2px #e5e5e5, 0 3px 0 #e5e5e5; white-space: nowrap; pointer-events: none }
/* Станция юнита: круг с номером и табличка над рельсом */
.bead.unit { width: 50px; height: 50px; margin: -25px 0 0 -25px; box-shadow: 0 0 0 6px #fff, 0 0 0 9px var(--c) }
.bead.unit.todo { background: #e5e5e5; box-shadow: 0 0 0 6px #fff, 0 0 0 9px #e0e0e0 } .bead.unit.todo .sign { background: #e5e5e5; color: #9a9a9a; box-shadow: 0 4px 0 #cdcdcd }
.no { font-size: 21px; font-weight: 900 }
.sign { position: absolute; top: 50%; left: calc(100% + 20px); transform: translateY(-50%); display: grid; padding: 7px 14px; border-radius: 12px; background: var(--c); box-shadow: 0 4px 0 var(--d); color: #fff; white-space: nowrap; pointer-events: none }
.bead.s-l .sign { left: auto; right: calc(100% + 20px) }
.sign b { font-size: 15px }
/* Сводка сверху */
.sum { position: absolute; left: -220px; top: -250px; width: 440px; cursor: default; box-sizing: border-box; display: grid; gap: 6px; padding: 16px 18px; border-radius: 18px; background: #fff; box-shadow: 0 2px 12px rgba(0, 0, 0, .08), 0 0 0 1px rgba(0, 0, 0, .04); z-index: 3 }
.sh { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.dt { display: inline-block; width: 8px; height: 8px; margin-right: 7px; border-radius: 50%; background: var(--green); vertical-align: 1px }
.pp { padding: 4px 9px; border-radius: 9px; background: var(--green-l); color: var(--green-d); font-size: 14px; letter-spacing: 0 }
.st { font-size: 18px; font-weight: 900; color: var(--text) }
.bar { height: 10px; margin: 4px 0 2px; border-radius: 6px; background: #ececec; overflow: hidden } .bar i { display: block; height: 100%; border-radius: 6px; background: var(--green); transition: width .25s }
.sf { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--hint) } .sf b { color: var(--text) }
.seg { display: flex; padding: 2px; border-radius: 9px; background: var(--surface) } .seg button { border: 0; border-radius: 7px; padding: 5px 10px; background: none; font: inherit; font-size: 12px; font-weight: 800; color: var(--hint); cursor: pointer } .seg button.on { background: #fff; color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) } .sign span { font-size: 12px; font-weight: 700; opacity: .85 }
/* Карточка выбранного */
.pop { position: fixed; z-index: 20; display: grid; gap: 8px; padding: 12px; border-radius: 14px; background: #fff; box-shadow: 0 10px 30px rgba(0, 0, 0, .16), 0 0 0 1px rgba(0, 0, 0, .04); cursor: default; animation: pop .14s ease-out }
@keyframes pop { from { opacity: 0; transform: translateY(-4px) } }
.lz { margin-left: 8px; padding: 1px 6px; border-radius: 5px; background: #fff4d6; color: #b07800; text-transform: none; letter-spacing: 0 }
.btn-r { border: 0; border-radius: 9px; padding: 8px; background: var(--green-l); color: var(--green-d); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
/* Черновик на холсте: цветной, с пунктирным кольцом — «ещё не на рельсе» */
.bead.loose { box-shadow: 0 6px 0 var(--d), 0 0 0 5px #f5f5f5, 0 0 0 7px color-mix(in srgb, var(--c) 45%, transparent); transition: transform .12s }
.bead.loose .cap small { color: #b07800 }
.ph { font-size: 11px; font-weight: 900; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.in { margin: 0; padding: 8px 10px; font-size: 15px; font-weight: 700; border-width: 1px; border-radius: 9px } .in.sub { font-size: 13px; font-weight: 600 }
.types { display: flex; gap: 6px } .tt { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: #f0f0f0; color: var(--c); cursor: pointer; padding: 0 }
.tt svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round } .tt.on { background: var(--c); color: #fff }
.del { border: 0; border-radius: 9px; padding: 8px; background: var(--red-l); color: var(--red-d); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
/* Летящее */
.fly { position: fixed; z-index: 50; width: 64px; height: 64px; margin: -32px 0 0 -32px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 6px 0 var(--d), 0 14px 26px rgba(0, 0, 0, .22); pointer-events: none; transform-origin: 50% 50%; transition: opacity .12s }
.fly .vid { box-shadow: none }
.fly.unit { width: 50px; height: 50px; margin: -25px 0 0 -25px } .fly.tutor { border-radius: 20px } .fly.out { opacity: .45 }
/* Панели */
.fl { position: absolute; z-index: 5; background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04) }
.tl-panel { left: 14px; top: 14px; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px }
.ttl { width: 220px; margin: 0; padding: 6px 8px; border: 0; background: none; font-size: 15px; font-weight: 800 } .ttl:focus { background: var(--surface) }
.badge-local { font-size: 11px; font-weight: 700; color: var(--purple-d); background: #f1e6ff; border-radius: 6px; padding: 2px 7px; white-space: nowrap }
.ib { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 10px; background: none; cursor: pointer } .ib:hover { background: var(--surface) }
.ib svg { width: 20px; height: 20px; fill: none; stroke: var(--text); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
.tr-panel { right: 14px; top: 14px; display: flex; align-items: center; gap: 4px; padding: 6px 6px 6px 12px }
.pl { display: grid; font-size: 12px; font-weight: 800; line-height: 1.15; margin-right: 6px } .pl small { font-size: 10px; color: var(--hint); font-weight: 700 }
.sb { width: 30px; height: 30px; border: 0; border-radius: 8px; background: var(--surface); font: inherit; font-size: 17px; font-weight: 800; cursor: pointer }
.pv { min-width: 52px; text-align: center; font-size: 14px; color: var(--green-d) }
.vs { width: 1px; height: 24px; margin: 0 6px; background: var(--border) }
.pill { border: 0; border-radius: 9px; padding: 7px 12px; background: var(--blue); color: #fff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer } .pill.grey { background: var(--surface); color: var(--hint) }
.zoom { right: 14px; bottom: 112px; display: flex; align-items: center; padding: 4px } .zoom button { min-width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 18px; font-weight: 700; cursor: pointer } .zoom button:hover { background: var(--surface) }
.zoom b { min-width: 46px; text-align: center; font-size: 13px; cursor: pointer } .zoom .all { padding: 0 10px; font-size: 13px; font-weight: 800 } .zoom .vs { margin: 0 2px }
.tools { left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; height: 74px; padding: 0 12px; border-radius: 18px; box-shadow: 0 2px 6px rgba(0, 0, 0, .06), 0 6px 22px rgba(0, 0, 0, .1) }
.tl { display: grid; font-size: 13px; font-weight: 800; line-height: 1.2; padding: 0 4px; white-space: nowrap } .tl small { font-size: 11px; color: var(--hint); font-weight: 600 }
.sep { width: 1px; height: 44px; margin: 0 8px; background: #e6e6e6 }
.pb { display: grid; justify-items: center; gap: 4px; width: 68px; padding: 6px 0 4px; border: 0; border-radius: 12px; background: none; font: inherit; cursor: grab; touch-action: none }
.pb:hover { background: #f3f3f3 } .pb:hover .pc { transform: translateY(-2px) }
.pc { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 3px 0 var(--d); transition: transform .12s }
.pb.tutor .pc { border-radius: 12px } .pb.unit .pc { width: 30px; height: 30px; margin: 4px; box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--c) }
.pc svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round } .pc b { font-size: 15px; font-weight: 900 }
.pb small { font-size: 11px; font-weight: 700; color: var(--text); white-space: nowrap; max-width: 66px; overflow: hidden; text-overflow: ellipsis }
@media (max-width: 719px) {
  .tl-panel { left: 8px; right: 8px; top: 8px; padding: 4px 8px 4px 4px } .ttl { flex: 1; width: auto; min-width: 0 }
  .tr-panel { left: 8px; right: 8px; top: 58px; padding: 4px 4px 4px 10px } .tr-panel .pill { padding: 6px 9px; font-size: 12px } .pl { flex: 1 }
  .tools { left: 8px; right: 8px; bottom: 10px; transform: none; overflow-x: auto; scrollbar-width: none; padding: 0 6px; height: 70px } .tl, .tools .sep { display: none }
  .pb { flex: none; width: 58px }
  .pop { position: fixed; left: 8px !important; right: 8px; top: auto !important; bottom: 88px; width: auto !important; max-height: 62vh; overflow-y: auto; z-index: 20 }      /* телефон: карточка — снизу над панелью */
  .zoom { right: 8px; bottom: 88px; padding: 2px } .zoom b { display: none } .zoom .all { font-size: 12px; padding: 0 8px } .pl, .tr-panel .pill, .tr-panel .vs.dk { display: none } .tr-panel { justify-content: space-between; gap: 3px } .cap { width: 120px; font-size: 13px }      /* телефон: только вид и прогресс; экспорт и сброс — на компьютере */
}
</style>

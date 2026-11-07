<script setup>
// ЧЕРНОВИК. Редактор курсов — холст как во FigJam + «рельс».
//  • Холст: тянуть по пустому месту / колёсико — двигать; Ctrl + колёсико, щипок, кнопки — масштаб; «Весь курс» — показать всё.
//  • Рельс — одна линия сверху вниз («Волна» или «Прямая»), на ней по порядку задания. Рельс и есть шкала прогресса:
//    пройденное закрашено, текущее — «Сейчас». Сверху — сводка, как увидит ученик.
//  • Задание можно просто положить на холст рядом (черновики), потом перетащить на рельс — встанет в ближайший промежуток,
//    соседи расступятся. С рельса — оттащить на холст. С панели — тянуть куда угодно или нажать (в конец рельса).
//  • Кружки из Telegram: перетащить видео на холст / рельс (или «Кружок» на панели — выбрать файл).
//  • Два рельса (как в Busuu): вертикальный — юниты и уроки курса; от урока вправо — горизонтальный рельс его экранов
//    (интерактив: новое слово, выбор ответа, пары), в конце всегда «Итог урока». Всё на одном холсте, без окон (LessonRail).
//    Экраны — в item.steps; их файлы — в S3 рядом с кружками (до загрузки — в IndexedDB).
//  • Нижняя панель — как в FigJam: нажали группу — над панелью выезжает ряд элементов, нажали элемент — добавился.
//  • Стикеры-заметки, как в FigJam: doc.notes, лежат на холсте; двойной клик — писать, тянуть — двигать.
// Только для преподавателя. Хранение: на сервере (Firestore, курс целиком; кружки — в S3 через сервер), а в браузере —
// копия на случай, когда сети нет (localStorage; видео до загрузки — IndexedDB). Без сервера (демо) — только в браузере.
import { ask, say, askText, dialog } from '../../composables/useDialog'
import { useAuthStore } from '../../stores/auth'
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import BackButton from '../../components/BackButton.vue'
import { useRouter, useRoute } from 'vue-router'
import { API, apiRequest, fb, isDemo } from '../../firebase'
import { showToast } from '../../composables/useToast'
import { live, liveSend, setWhere, onLive } from '../../composables/useLive'
import PresenceBar from '../../components/PresenceBar.vue'
import LessonRail from '../../components/LessonRail.vue'
import { shrinkPhoto, PHOTO } from '../../utils/shrink'
import LessonPlayer from '../../components/LessonPlayer.vue'
import { INTERACTIVE, KINDS, TEMPLATES, STEPS_MAX, RAIL_H, RAIL_X0, fishLesson, stepIssue, stepsOut, keepLocalFiles, stepRefs, stepId, lessonMin } from '../../utils/lesson'
import { audSrc, imgSrc } from '../../composables/useCardMedia'

const router = useRouter(), route = useRoute()
const goBack = () => router.push({ name: 'path' })            // назад — в «Курсы»
const KEY = 'tma.courseRail.v1'

// ---------- Типы заданий ----------
const T = {
  unit:   { t: 'Глава', c: 'var(--green)', d: 'var(--green-d)' },
  lesson: { t: 'Урок', c: 'var(--green)', d: 'var(--green-d)', ic: '<circle cx="12" cy="12" r="8"/><path d="M9 12.3l2 2 4-4"/>' },
  words:  { t: 'Слова', c: 'var(--blue)', d: 'var(--blue-d)', ic: '<rect x="4" y="7" width="12" height="13" rx="2.5"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16"/>' },
  hw:     { t: 'Домашка', c: '#2ec4b6', d: '#1f9e93', ic: '<path d="M14.6 6.1l3.3 3.3"/><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z"/>' },
  test:   { t: 'Тест', c: 'var(--orange)', d: 'var(--orange-d)', ic: '<path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.1l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"/>' },
  tutor:  { t: 'С репетитором', c: 'var(--purple)', d: 'var(--purple-d)', ic: '<rect x="3.5" y="6.5" width="12" height="11" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3z"/>' },
  video:  { t: 'Кружок', c: '#2aabee', d: '#1a8bc9', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M10.3 9.2v5.6l4.6-2.8z" fill="currentColor"/>' },
  photo:  { t: 'Фото', c: '#ff6fb1', d: '#e0478f', ic: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8"/>' },
  checkpoint: { t: 'Чекпоинт', c: '#ff9f1a', d: '#e07f00', ic: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 3.7L17 12H6"/>' },
  reward: { t: 'Награда', c: 'var(--yellow)', d: 'var(--yellow-d)', ic: '<path d="M8 4.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5v.8A3.7 3.7 0 0 0 8 11M16 6.5h3.5v.8A3.7 3.7 0 0 1 16 11"/><path d="M12 14v4M8.5 20h7"/>' },
}
const CHECK = '<path d="M6 12.5l4 4 8-9"/>'
const PALETTE = ['unit', 'video', 'photo', 'lesson', 'checkpoint', 'words', 'hw', 'test', 'tutor', 'reward']
const MEDIA = ['video', 'photo']                         // задания с файлом (кружок, фото) — файл в S3, ключ в поле file
// На панели — только «Урок» и «Чекпоинт» (как в Busuu). Старые типы (слова, домашка, тест, кружок, фото…) в курсах остаются и показываются.
const TASKS = ['lesson', 'checkpoint']
const TASK_D = { lesson: 'Ветка экранов, в конце — итог', checkpoint: 'Проверка навыков перед следующей главой' }
const BRANCH = ['lesson', 'checkpoint']            // у них ветка экранов видна всегда, даже пустая
// Обложка урока, как в Busuu: фото или кружок в самом кружке урока (поле file / media, вид — ck)
const covK = (x) => (MEDIA.includes(x.type) ? x.type : x.ck ?? null)
const UNIT_COLORS = [['var(--green)', 'var(--green-d)'], ['var(--purple)', 'var(--purple-d)'], ['var(--blue)', 'var(--blue-d)'], ['var(--orange)', 'var(--orange-d)']]

let seq = Date.now() % 100000
const uid = () => 'i' + (++seq)
const it = (type, title, extra = {}) => ({ id: uid(), type, title, ...extra })
const seed = () => ({
  title: 'Базовый курс A1', progress: 5, mode: 'line',
  items: [
    it('unit', 'Глава 1', { sub: 'Present Simple' }),
    it('lesson', 'Глагол to be'), it('words', 'Слова: семья'), it('hw', 'Упражнения 1–5'), it('lesson', 'Отрицания'), it('tutor', 'Разговор с репетитором'), it('test', 'Тест юнита'), it('reward', 'Сундук'),
    it('unit', 'Глава 2', { sub: 'Past Simple' }),
    it('lesson', 'Правильные глаголы'), it('words', 'Слова: путешествия'), it('lesson', 'Неправильные глаголы'), it('hw', 'Рассказ о выходных'), it('test', 'Тест юнита'),
  ],
  loose: [it('words', 'Слова: еда', { x: -320, y: 120 }), it('lesson', 'Артикли a / the', { x: -1500, y: 250 })], notes: [],
})
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v?.items) return { loose: [], notes: [], ...v } } catch { /* нет */ } return seed() }
const doc = reactive(load())
const boxTick = ref(0)
let st = 0
if (!doc.id) doc.id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const save = () => {
  if (remote) return                       // это пришло от коллеги — не сохраняем и не пересылаем обратно
  if (!restoring) histMark()
  boxTick.value++; setTimeout(() => boxTick.value++, 260)          // рамка выбранного экрана — по новому месту (после анимации)
  if (doc.loose.some(x => x.type === 'screen' && !x.steps?.length)) doc.loose = doc.loose.filter(x => x.type !== 'screen' || x.steps?.length)   // экран на доске удалили — убираем и его место
  doc.dirty = true
  clearTimeout(st); st = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(doc)) } catch { /* приватный режим */ } }, 250)
  push(); share()
}

// ---------- Ctrl+Z / Ctrl+Shift+Z: история правок (как в Figma) ----------
// Снимок курса — перед правкой; набор текста склеивается в один шаг (пауза 0,6 с). Удаления без подтверждений: их отменяет Ctrl+Z,
// поэтому файлы удалённого из хранилища убираем только при уходе из редактора (и только если они больше нигде не нужны).
const snap = () => JSON.stringify({ title: doc.title, mode: doc.mode, progress: doc.progress, items: doc.items, loose: doc.loose, notes: doc.notes ?? [], ink: doc.ink ?? [] })
const undoS = [], redoS = []; let base = null, restoring = false, histT = 0
function histMark() {                                     // первый save после паузы — фиксируем «как было»
  if (base == null) return
  if (!histT) { undoS.push(base); if (undoS.length > 80) undoS.shift(); redoS.length = 0; histCount() }
  clearTimeout(histT); histT = setTimeout(() => { histT = 0; base = snap() }, 600)
}
function histReset() { undoS.length = redoS.length = 0; clearTimeout(histT); histT = 0; base = snap(); histCount() }
function histGo(from, to) {
  if (histT) { clearTimeout(histT); histT = 0; base = snap() }
  const prev = from.pop(); if (!prev) return showToast(from === undoS ? 'Отменять больше нечего' : 'Повторять больше нечего')
  to.push(snap()); restoring = true
  Object.assign(doc, JSON.parse(prev)); base = prev
  msel.value = []; sel.value = null; selectStep(null, null); noteSel.value = noteEdit.value = null
  save(); histCount(); nextTick(() => { restoring = false })
}
const undo = () => histGo(undoS, redoS), redo = () => histGo(redoS, undoS)
const undoN = ref(0), redoN = ref(0)                      // сколько шагов назад / вперёд (для меню)
const histCount = () => { undoN.value = undoS.length + (histT ? 0 : 0); redoN.value = redoS.length }
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

// ---------- Вместе в реальном времени (useLive): курс, курсоры и выделение коллег ----------
// Курс после правки уходит коллегам в этом же курсе через ~0,1 с (сохраняет в базу тот, кто правил). Одновременные правки:
// побеждает последняя — поэтому выбранное коллегой подсвечено его цветом.
let remote = false, shareT = 0
const cleanNote = (n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y), text: n.text ?? '', color: n.color, ...(n.by ? { by: n.by } : {}), ...(n.sz && n.sz !== 's' ? { sz: n.sz } : {}), ...(n.font ? { font: n.font } : {}), ...(n.b ? { b: true } : {}), ...(n.st ? { st: true } : {}), ...(n.list ? { list: true } : {}), ...(n.nob ? { nob: true } : {}) })
const cleanInk = (k) => ({ id: k.id, c: k.c, w: k.w, p: k.p.map(Math.round) })
const payload = () => ({ title: doc.title, mode: doc.mode, progress: doc.progress, items: doc.items.map(x => clean(x)), loose: doc.loose.map(x => clean(x, true)), notes: (doc.notes ?? []).map(cleanNote), ink: (doc.ink ?? []).map(cleanInk) })
function share() { clearTimeout(shareT); shareT = setTimeout(() => liveSend({ t: 'doc', doc: payload() }), 120) }
const offDoc = onLive('doc', ({ doc: d }) => {
  if (!d || !Array.isArray(d.items)) return
  const local = new Map([...doc.items, ...doc.loose].map(x => [x.id, x]))
  const keep = (x) => ({ ...x, ...(local.get(x.id)?.media && !x.file ? { media: local.get(x.id).media } : {}), ...(x.steps ? { steps: keepLocalFiles(x.steps, local.get(x.id)?.steps) } : {}) })
  remote = true
  Object.assign(doc, { title: d.title, mode: d.mode, progress: d.progress, items: d.items.map(keep), loose: (d.loose ?? []).map(keep), notes: d.notes ?? [], ink: d.ink ?? [], dirty: false })
  nextTick(() => { remote = false })
  clearTimeout(pt); if (online) sync.value = 'saved'       // коллега сам сохранил это в базу
  try { localStorage.setItem(KEY, JSON.stringify(doc)) } catch { /* приватный режим */ }
})
// Курсоры коллег (в координатах холста) и их выделение
const cursors = reactive({}), rsel = reactive({})
const offCur = onLive('cursor', ({ cid, x, y }) => { cursors[cid] = { x, y, at: Date.now() } })
const offSel = onLive('sel', ({ cid, id }) => { rsel[cid] = id })
const who = (cid) => live.users.find(u => u.cid === cid)
const otherCursors = computed(() => Object.entries(cursors).map(([cid, c]) => ({ cid, ...c, u: who(cid) })).filter(c => c.u && Date.now() - c.at < 30000))
const selColor = computed(() => { const m = {}; for (const [cid, id] of Object.entries(rsel)) { const u = who(cid); if (u && id) m[id] = u.color } return m })
let curT = 0, lastCur = null
function sendCursor(e) {
  if (!live.on) return
  lastCur = toWorld(e.clientX, e.clientY)
  if (!curT) curT = setTimeout(() => { curT = 0; liveSend({ t: 'cursor', ...lastCur }) }, 60)      // не чаще ~16 раз в секунду
}
const tick = ref(0); const tickT = setInterval(() => { tick.value++ }, 5000)                        // убирать замолчавшие курсоры
onUnmounted(() => { offDoc(); offCur(); offSel(); clearInterval(tickT); clearTimeout(shareT); liveSend({ t: 'sel', id: null }) })

// ---------- Сервер: курс — в Firestore, кружки — в S3 ----------
// sync: 'local' — сервера нет (демо) | 'saving' | 'saved' | 'offline' (нет связи — сохраним позже, копия в браузере есть)
const online = !isDemo && !!API && !!fb
const sync = ref(online ? 'saving' : 'local'), storageOn = ref(false)
let pt = 0, busy = false
const clean = (x, loose) => ({ id: x.id, type: x.type, title: x.title ?? '', ...(loose && x.grp ? { grp: x.grp } : {}), ...(x.type === 'unit' && x.hl === 'none' ? { hl: 'none' } : {}), ...(x.type === 'unit' && x.hlw ? { hlw: true } : {}), ...(x.type === 'unit' && x.hlc ? { hlc: x.hlc } : {}), ...(x.type === 'unit' && x.hlo != null ? { hlo: x.hlo } : {}), ...(x.sub != null ? { sub: x.sub } : {}), ...(x.file ? { file: x.file } : {}), ...(x.ck && !MEDIA.includes(x.type) ? { ck: x.ck } : {}), ...((INTERACTIVE.includes(x.type) || x.type === 'screen') && x.steps?.length ? { steps: stepsOut(x.steps) } : {}), ...(loose ? { x: x.x, y: x.y } : {}) })
function push(delay = 900) {
  if (!online) return
  clearTimeout(pt); pt = setTimeout(async () => {
    if (busy) return push(400)
    busy = true; sync.value = 'saving'
    try {
      const r = await apiRequest(`/courses/${doc.id}`, { method: 'PUT', body: JSON.stringify(payload()) })
      if (!r.ok) throw new Error(String(r.status))
      doc.dirty = false; sync.value = 'saved'; localStorage.setItem(KEY, JSON.stringify(doc))
    } catch { sync.value = 'offline'; push(15000) } finally { busy = false }
  }, delay)
}
// Вышли из редактора: несохранённое — сразу на сервер и коллегам (не ждём таймеров), копия в браузере — тоже сразу
onUnmounted(() => {
  clearTimeout(st); clearTimeout(pt)
  try { localStorage.setItem(KEY, JSON.stringify(doc)) } catch { /* приватный режим */ }
  if (online && doc.dirty) {
    liveSend({ t: 'doc', doc: payload() })
    apiRequest(`/courses/${doc.id}`, { method: 'PUT', body: JSON.stringify(payload()) }).then(r => { if (r.ok) { doc.dirty = false; try { localStorage.setItem(KEY, JSON.stringify(doc)) } catch { /* — */ } } }).catch(() => {})
  }
})
// Открыли редактор (из «Курсов»: #/courses?id=<курс> или ?id=new). В браузере — копия последнего открытого курса:
// если в ней несохранённые правки другого курса — сначала отправляем их, потом открываем нужный.
const blank = () => ({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: 'Новый курс', progress: 0, mode: 'line',
  items: [it('unit', 'Глава 1', { sub: 'Тема главы' }), it('lesson', 'Урок', { steps: [] }), it('checkpoint', 'Чекпоинт', { steps: [] })], loose: [], notes: [], ink: [], dirty: false })
// Курс всегда начинается с главы, как в Busuu: пустой рельс — сразу глава, урок и чекпоинт; рельс начинается с урока — сверху ставим главу
function ensureChapter(d) {
  if (!d.items.length) {
    if (d.loose?.some(x => x.type === 'unit')) return false          // главы унесли на доску — рельс пустой нарочно, свою не добавляем
    d.items.push(it('unit', 'Глава 1', { sub: 'Тема главы' }), it('lesson', 'Урок', { steps: [] }), it('checkpoint', 'Чекпоинт', { steps: [] })); return true
  }
  if (d.items[0].type !== 'unit') { d.items.unshift(it('unit', 'Глава 1', { sub: 'Тема главы' })); return true }
  return false
}
const fromServer = (c) => {
  const local = new Map([...doc.items, ...doc.loose].map(x => [x.id, x]))       // локальные видео (ещё не в S3) не теряем
  const keep = (x) => ({ ...x, ...(local.get(x.id)?.media && !x.file ? { media: local.get(x.id).media } : {}), ...(x.steps ? { steps: keepLocalFiles(x.steps, local.get(x.id)?.steps) } : {}) })
  Object.assign(doc, { id: c.id, title: c.title, mode: c.mode, progress: c.progress, items: c.items.map(keep), loose: c.loose.map(keep), notes: c.notes ?? [], ink: c.ink ?? [], dirty: false })
  localStorage.setItem(KEY, JSON.stringify(doc)); sync.value = 'saved'; histReset()
  if (ensureChapter(doc)) save()
}
const flush = () => apiRequest(`/courses/${doc.id}`, { method: 'PUT', body: JSON.stringify(payload()) }).then(r => { if (r.ok) doc.dirty = false })
onMounted(async () => {
  if (ensureChapter(doc)) save()
  histReset()                                              // история правок — с открытого курса
  const want = String(route.query.id || '')
  if (want === 'new' || (!online && want && want !== doc.id && want !== 'local')) {
    if (online && doc.dirty) await flush().catch(() => {})
    Object.assign(doc, blank()); save()
    router.replace({ name: 'courses', query: { id: doc.id } })
  }
  setWhere('courses', doc.id)                // коллеги видят, что я в этом курсе
  if (!online) return
  try {
    const r = await apiRequest('/courses'); if (!r.ok) throw new Error(String(r.status))
    const { courses, storage } = await r.json(); storageOn.value = !!storage
    const target = want && want !== 'new' ? want : doc.id
    if (target !== doc.id && doc.dirty) await flush().catch(() => {})
    if (courses.some(c => c.id === target) && !(target === doc.id && doc.dirty)) {
      const c = await (await apiRequest(`/courses/${target}`)).json()
      if (target !== doc.id) Object.assign(doc, { items: [], loose: [] })         // другой курс — чужие локальные видео не тащим
      fromServer(c)
    } else if (!want && !doc.dirty && courses.length) fromServer(await (await apiRequest(`/courses/${courses[0].id}`)).json())
    else push(0)                                                                  // новый или с несохранёнными правками — на сервер
    setWhere('courses', doc.id)
    if (storageOn.value) uploadLocal()
  } catch { sync.value = 'offline'; push(15000) }
})
// Видео, которые лежат только в браузере (добавлены до S3 или без сети), — догружаем в S3
async function uploadLocal() {
  for (const x of [...doc.items, ...doc.loose]) {
    if (!covK(x) || x.file || !x.media) continue
    const b = await mediaOp('readonly', s => s.get(x.media)).catch(() => null)
    if (b) await upload(x, b instanceof File ? b : new File([b], covK(x) === 'photo' ? 'photo.jpg' : 'kruzhok.mp4', { type: b.type || (covK(x) === 'photo' ? 'image/jpeg' : 'video/mp4') }))
  }
  for (const x of [...doc.items, ...doc.loose]) for (const s of x.steps ?? []) {          // файлы экранов уроков
    const slots = [...['image', 'audio', 'video', 'exAudio'].map(f => [f, null]), ...(s.opts ?? []).flatMap((_, k) => [['image', k], ['audio', k]])]
    for (const [f, k] of slots) {
      const v = (k == null ? s : s.opts[k])?.[f]; if (!v?.startsWith('idb:')) continue
      const b = await mediaOp('readonly', st => st.get(v.slice(4))).catch(() => null)
      if (b) await uploadStepFile(s.id, f, k, b instanceof File ? b : new File([b], 'file', { type: b.type }), v.slice(4))
    }
  }
}
// Загрузка в S3 через сервер, с процентом (XHR — у fetch нет прогресса отправки)
const upPct = reactive({})       // id задания → 0…100, пока грузится
const AUDIO_EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', weba: 'audio/webm' }
async function sendFile(file, pk) {
  const token = await fb?.currentUser?.getIdToken()
  const type = file.type || AUDIO_EXT[file.name.split('.').pop().toLowerCase()] || (/\.webm$/i.test(file.name) ? 'video/webm' : /\.mov$/i.test(file.name) ? 'video/quicktime' : /\.png$/i.test(file.name) ? 'image/png' : /\.(jpe?g)$/i.test(file.name) ? 'image/jpeg' : 'video/mp4')
  upPct[pk] = 0
  try {
    return await new Promise((ok, no) => {
      const x = new XMLHttpRequest()
      x.open('POST', `${API}/media/upload?courseId=${encodeURIComponent(doc.id)}`)
      x.setRequestHeader('Content-Type', type); if (token) x.setRequestHeader('Authorization', `Bearer ${token}`)
      x.upload.onprogress = (e) => { if (e.lengthComputable) upPct[pk] = Math.round(e.loaded / e.total * 100) }
      x.onload = () => { if (x.status < 300) return ok(JSON.parse(x.responseText).key); let m = ''; try { m = JSON.parse(x.responseText).error } catch { /* не JSON */ } no(new Error(`${x.status}${m ? ': ' + m : ''}`)) }
      x.onerror = () => no(new Error('network'))
      x.send(file)
    })
  } finally { delete upPct[pk] }
}
async function upload(item, file) {
  try {
    const key = await sendFile(file, item.id)
    const it2 = findAny(item.id); if (!it2) return
    urls[key] = urls[it2.media] || URL.createObjectURL(file)
    it2.file = key
    if (it2.media) { mediaOp('readwrite', s => s.delete(it2.media)).catch(() => {}); delete it2.media }
    save()
  } catch (e) {        // файл остался в браузере — догрузим при следующем открытии; причину показываем
    showToast(`Не удалось загрузить ${item.type === 'photo' ? 'фото' : 'кружок'} в хранилище (${e.message}). Он сохранён в браузере, попробую снова при следующем открытии.`, null, 'bad')
  }
}

// ---------- Файлы экранов интерактивного урока ----------
// Поле экрана (или варианта ответа): сначала «idb:<id>» — файл в этом браузере, после загрузки — ключ в S3.
const findStep = (sid) => { for (const x of [...doc.items, ...doc.loose]) { const s = x.steps?.find(v => v.id === sid); if (s) return s } return null }
const slotOf = (sid, opt) => { const s = findStep(sid); return opt == null ? s : s?.opts?.[opt] }
async function putStepFile(sid, field, file, opt = null) {
  const obj = slotOf(sid, opt); if (!obj) return
  if (field === 'image') {             // фото — как в Busuu: обрезаем под 16:9 (у варианта ответа 3:2) и сжимаем
    const kind = opt == null ? 'main' : 'opt', r = await shrinkPhoto(file, kind); file = r.file
    if (r.small) showToast(`Фото маленькое (${r.w}×${r.h}) — на большом экране будет мутным. Лучше ${PHOTO[kind].label.split(', ')[1].replace('лучше ', '')} и больше.`, null, 'bad')
  }
  const id = `m${sid}_${field}${opt ?? ''}_${Date.now().toString(36)}`
  try { await mediaOp('readwrite', s => s.put(file, id)) } catch { return say('Не удалось сохранить файл', { text: 'В браузере не хватило места.' }) }
  const old = obj[field]
  urls[id] = URL.createObjectURL(file); obj[field] = 'idb:' + id; save()
  if (old) dropRefs([old])
  if (storageOn.value) uploadStepFile(sid, field, opt, file, id)
}
async function uploadStepFile(sid, field, opt, file, id) {
  let key
  try { key = await sendFile(file, `${sid}:${field}:${opt ?? ''}`) } catch (e) {
    return showToast(`Не удалось загрузить файл экрана в хранилище (${e.message}). Он сохранён в браузере, попробую снова при следующем открытии.`, null, 'bad')
  }
  const obj = slotOf(sid, opt)
  if (!obj || obj[field] !== 'idb:' + id) return dropRefs([key])            // пока грузилось — заменили или удалили
  urls[key] = urls[id]; obj[field] = key; save()
  mediaOp('readwrite', s => s.delete(id)).catch(() => {})
}
// Убрать файлы экранов: свои — из браузера и хранилища; ссылки карточек не трогаем (это файлы колоды)
// Файл может быть и у копии экрана (Ctrl+C / Ctrl+V) — удаляем, только если он больше нигде в курсе не нужен.
// Проверяем чуть позже: вызывающий может убрать экран / вариант сразу после вызова.
const usedRefs = () => new Set([...doc.items, ...doc.loose].flatMap(x => [x.file, x.media && 'idb:' + x.media, ...(x.steps ?? []).flatMap(stepRefs)]).filter(Boolean))
const trash = new Set()                                   // файлы удалённого — уберём из хранилища при уходе из редактора (Ctrl+Z их вернёт)
function dropRefs(refs) { for (const v of refs) if (v) trash.add(v) }
const emptyTrash = () => { if (trash.size) { dropNow([...trash]); trash.clear() } }
onUnmounted(emptyTrash); addEventListener('pagehide', emptyTrash); onUnmounted(() => removeEventListener('pagehide', emptyTrash))
function dropNow(refs) {
  const used = usedRefs()
  for (const v of refs) {
    if (used.has(v)) continue
    if (v?.startsWith('idb:')) mediaOp('readwrite', s => s.delete(v.slice(4))).catch(() => {})
    else if (v && /^t\//.test(v) && online) apiRequest('/media/delete', { method: 'POST', body: JSON.stringify({ key: v }) }).catch(() => {})
  }
}
function resolveRef(v, kind) {
  if (!v) return ''
  if (v.startsWith('idb:')) return mediaUrl({ media: v.slice(4) })
  if (/^t\//.test(v)) return mediaUrl({ file: v })
  return kind === 'audio' ? audSrc(v) : kind === 'image' ? imgSrc(v) : v
}
// ---------- Второй рельс: экраны урока ----------
// Горизонтальные рельсы видны у всех уроков с экранами и у выбранного урока (чтобы начать собирать).
const pick = reactive({ lesson: null, step: null })                // открытый экран: урок и экран (или 'final')
const activeLesson = computed(() => (pick.lesson && findAny(pick.lesson)?.type !== 'screen' ? pick.lesson : null) ?? (selItem.value && INTERACTIVE.includes(selItem.value.type) && !selLoose.value ? selItem.value.id : null))
// «Все уроки» — ветки всех уроков курса раскрыты сразу (видно, что где, и экраны удобно копировать между уроками)
const allRails = ref(false)            // кнопку «Все уроки» убрали (05.11.2026): ветки — у уроков с экранами и у выбранного
const lessonRails = computed(() => [...order.value.map((x, i) => ({ x, p: pos(i) })), ...doc.loose.filter(l => BRANCH.includes(l.type) && !dragIds.value.has(l.id)).map(l => ({ x: l, p: { x: l.x, y: l.y } }))].filter(({ x }) => INTERACTIVE.includes(x.type) && !(drag.on && !drag.over && drag.item?.id === x.id) && (BRANCH.includes(x.type) || x.steps?.length || x.id === activeLesson.value)))   // у каждого урока сразу видна ветка с местом под экраны и итогом          // и у уроков на доске (не на рельсе) — тоже ветка

// ---------- Копировать / вставить экран (Ctrl+C / Ctrl+V или кнопки на ветке) ----------
// Копия — с новым id; файлы общие (удалятся, только когда их не останется ни у одного экрана), файлы «только в браузере» — копируются.
const clip = ref(null)                                   // { course, step }
function copyStep(s, course = doc.id) {
  const list = (Array.isArray(s) ? s : [s]).filter(Boolean); if (!list.length) return
  clip.value = { course, steps: JSON.parse(JSON.stringify(list)) }
  showToast(`${list.length === 1 ? `Экран «${KINDS[list[0].kind].t}» скопирован` : `Скопировано экранов: ${list.length}`} — Ctrl+V: в выбранный урок (после выбранного экрана) или на доску у курсора`)
}
async function pasteStep(lessonId = pick.lesson ?? activeLesson.value, after = pick.lesson === lessonId ? pick.step : null) {
  if (!clip.value) return
  if (clip.value.items) return pasteItems()
  const L = lessonId ? findAny(lessonId) : null
  if (L?.type === 'screen') {            // выбран экран на доске — копии ложатся на доску справа от него
    let k = 1, last = null
    for (const src of clip.value.steps) { const st = { ...JSON.parse(JSON.stringify(src)), id: stepId() }; await localCopies(st); last = st; doc.loose.push(freeOf(st, L.x + k++ * SCR_STEP, L.y)) }
    selectStep(doc.loose.at(-1).id, last.id); return save()
  }
  if (!L || !INTERACTIVE.includes(L.type)) return say('Куда вставить?', { text: 'Выберите урок или экран на ветке урока — копия встанет после него.' })
  if (!Array.isArray(L.steps)) L.steps = []
  if (L.steps.length + clip.value.steps.length > STEPS_MAX) return say(`В уроке не больше ${STEPS_MAX} экранов`)
  let at = after && after !== 'final' ? L.steps.findIndex(v => v.id === after) + 1 : L.steps.length
  if (at <= 0) at = L.steps.length
  let s = null
  for (const src of clip.value.steps) { s = { ...JSON.parse(JSON.stringify(src)), id: stepId() }; L.steps.splice(at++, 0, s); await localCopies(s) }
  selectStep(L.id, s.id); setProgress(doc.progress); save()
}
// Задания (свои или соседнего курса) — копировать и вставлять на рельс: новые id у задания и его экранов, файлы общие
function copyItems(list, course) {
  if (!list.length) return
  clip.value = { course, items: JSON.parse(JSON.stringify(list)) }
  showToast(`Скопировано заданий: ${list.length} — нажмите Ctrl+V, они встанут после выбранного задания (или в конец рельса)`)
}
const freshId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
async function pasteItems(at = null) {           // at — точка холста («Вставить сюда»): задания встают черновиками рядом с ней
  const list = clip.value.items.map(x => ({ ...JSON.parse(JSON.stringify(x)), id: freshId('i') }))
  if (doc.items.length + doc.loose.length + list.length > 500) return say('В курсе не больше 500 заданий')
  for (const x of list) {
    delete x.x; delete x.y
    if (x.steps) x.steps = x.steps.map(st => ({ ...st, id: stepId() }))
    if (x.media && clip.value.course === doc.id) {                 // свой кружок, который пока только в браузере, — своя копия файла
      const b = await mediaOp('readonly', st => st.get(x.media)).catch(() => null)
      if (b) { const id = 'm' + x.id; await mediaOp('readwrite', st => st.put(b, id)).catch(() => {}); urls[id] = URL.createObjectURL(b); x.media = id } else delete x.media
    } else delete x.media
    for (const st of x.steps ?? []) await localCopies(st)
  }
  if (at) list.forEach((x, k) => { x.x = Math.round(at.x + k * 150); x.y = Math.round(at.y) })
  if (at) doc.loose.push(...list)
  else { const after = sel.value ? doc.items.findIndex(v => v.id === sel.value) : -1; doc.items.splice(after >= 0 ? after + 1 : doc.items.length, 0, ...list) }
  msel.value = list.map(x => x.id); sel.value = null; setProgress(doc.progress); save()
}
// экраны из буфера — на доску рядом с точкой, по порядку слева направо
async function pasteFree(w) {
  const made = []
  for (const [k, src] of clip.value.steps.entries()) { const st = { ...JSON.parse(JSON.stringify(src)), id: stepId() }; await localCopies(st); made.push(st); doc.loose.push(freeOf(st, w.x - SCR_W / 2 + k * SCR_STEP, w.y - 24)) }
  selectStep(null, null); msel.value = made.map(st => 'st:' + doc.id + ':' + st.id); save()
}
async function localCopies(s) {
  // файлы, которые пока только в этом браузере, — своя копия (иначе после загрузки в хранилище у одной из копий файл пропадёт)
  const slots = [...['image', 'audio', 'video', 'exAudio'].map(f => [s, f, null]), ...(s.opts ?? []).flatMap((o, k) => [[o, 'image', k], [o, 'audio', k]])]
  for (const [obj, f, k] of slots) {
    const v = obj[f]; if (!v?.startsWith('idb:')) continue
    const b = await mediaOp('readonly', st => st.get(v.slice(4))).catch(() => null)
    if (!b) { delete obj[f]; continue }
    const id = `m${s.id}_${f}${k ?? ''}_${Date.now().toString(36)}`
    await mediaOp('readwrite', st => st.put(b, id)).catch(() => {})
    urls[id] = URL.createObjectURL(b); obj[f] = 'idb:' + id
    if (storageOn.value) uploadStepFile(s.id, f, k, b instanceof File ? b : new File([b], 'file', { type: b.type }), id)
  }
}

// ---------- «Все курсы»: остальные курсы — справа на том же холсте (смотреть, проходить, копировать экраны) ----------
// Правится только открытый курс; соседний — двойным нажатием по его названию он открывается в редакторе.
const allCourses = ref(false), others = ref([]), opick = ref(null)          // opick — выбранный экран соседнего курса (для Ctrl+C)
async function loadOthers() {
  try {
    if (online) {
      const r = await apiRequest('/courses'); if (!r.ok) throw new Error()
      const list = (await r.json()).courses.filter(c => c.id !== doc.id)
      others.value = (await Promise.all(list.map(c => apiRequest(`/courses/${c.id}`).then(x => (x.ok ? x.json() : null)).catch(() => null)))).filter(Boolean)
    } else others.value = (JSON.parse(localStorage.getItem('tma.demoCourses') ?? '[]') ?? []).filter(c => c.id !== doc.id)   // демо: курсы-образцы
  } catch { others.value = [] }
  if (!others.value.length) showToast('Других курсов пока нет — создайте курс на вкладке «Курсы»')
}
watch(allCourses, (v) => { if (v) loadOthers(); else { others.value = []; opick.value = null } })
// ширина курса на холсте: самая длинная ветка урока
const widthOf = (items) => Math.max(760, ...items.filter(x => INTERACTIVE.includes(x.type)).map(x => RAIL_X0 + ((x.steps?.length ?? 0) + 1) * 520 + 120))
const othersL = computed(() => {
  let x = widthOf(doc.items) + 260
  return others.value.map((c) => {
    const items = c.items ?? [], L = layoutOf(items, c.mode ?? 'line', 'o' + c.id), ox = x
    x += widthOf(items) + 260
    let k = 0
    return { ...c, ox, L, path: railPath(items.length, L, ox), h: Math.max(0, ...L.map(p => p.y)) + 200,
      st: items.map(it => (it.type === 'unit' ? 'done' : (k++ < (c.progress ?? 0) ? 'done' : 'todo'))) }
  })
})
const openOther = (id) => { allCourses.value = false; router.push({ name: 'courses', query: { id } }) }
const noop = () => {}
function selectStep(lessonId, stepId) { pick.lesson = stepId ? lessonId : null; pick.step = stepId; if (stepId) sel.value = null }
// «Интерактив» на панели: экран — в выбранный урок; ничего не выбрано — новый урок в конец рельса
// Экран добавляется «рыбой» — готовым образцом, который сразу можно пройти, а потом поправить (карандаш); 'lesson' — целый урок-образец
const TPL = [...TEMPLATES, { id: 'lesson', kind: 'intro', t: 'Готовый урок', d: '7 экранов-образцов' }]
function addScreen(id) {
  let L = activeLesson.value ? findAny(activeLesson.value) : null
  if (!L) { L = it('lesson', 'Урок', { steps: [] }); doc.items.push(L) }
  if (!Array.isArray(L.steps)) L.steps = []
  const add = id === 'lesson' ? fishLesson() : [TEMPLATES.find(t => t.id === id).make()]
  if (L.steps.length + add.length > STEPS_MAX) return say(`В уроке не больше ${STEPS_MAX} экранов`)
  L.steps.push(...add); const st = add[0]; tray.value = null
  selectStep(L.id, st.id); setProgress(doc.progress)
  nextTick(() => { const i = order.value.findIndex(v => v.id === L.id); if (i >= 0) showPoint({ x: pos(i).x + 230 + (L.steps.length - 1) * 92, y: pos(i).y + 200 }) })
}
function showPoint(w) { const p = toScreen(w); if (p.x < 40 || p.x > W.value - 300 || p.y < 90 || p.y > H.value - 140) animView({ ...view, x: view.x - (p.x - W.value / 2), y: view.y - (p.y - H.value / 2 + 60) }, true) }
async function removeStepKey() {
  const L = findAny(pick.lesson), s = L?.steps?.find(v => v.id === pick.step); if (!s) return
  const files = stepRefs(s)
  L.steps.splice(L.steps.indexOf(s), 1); dropRefs(files); selectStep(null, null); save()
}
// ---------- Экраны: тянуть как стикер — на ветку урока (в любое место), на кружок урока (в конец) или просто на доску ----------
// Тянут: мини-окошко из «Интерактива» (новый экран), экран с ветки или с доски; выделенные рамкой экраны — все вместе.
const SCR_W = 460, SCR_STEP = 520
const freeOf = (st, x, y) => ({ id: freshId('f'), type: 'screen', title: '', x: Math.round(x), y: Math.round(y), steps: [st] })
const sd = reactive({ on: false, list: [], tray: null, preview: [], extra: null, ox: 0, oy: 0, s0: { x: 0, y: 0 }, w: { x: 0, y: 0 }, to: null })
let sdP = null
// тащим сами окна, в полный размер (как в FigJam): сдвиг для экранов на ветках и на доске
const sdMoving = computed(() => (sd.on && !sd.tray ? { ids: sd.list.map(o => o.s.id), dx: sd.w.x - sd.s0.x, dy: sd.w.y - sd.s0.y } : null))
// где лежит экран: на ветке урока (lesson, i) или на доске (screen); левый верх его карточки
function whereStep(st) {
  for (const r of lessonRails.value) { const i = r.x.steps?.indexOf(st) ?? -1; if (i >= 0) return { host: r.x, i, x: r.p.x + RAIL_X0 + i * SCR_STEP, y: r.p.y + 40 } }
  for (const f of doc.loose) if (f.type === 'screen' && f.steps?.[0] === st) return { host: f, i: 0, x: f.x, y: f.y }
  for (const x of [...doc.items, ...doc.loose]) { const i = x.steps?.indexOf(st) ?? -1; if (i >= 0) return { host: x, i, x: 0, y: 0 } }
  return null
}
// куда упадёт: ветка урока и место на ней, кружок урока (в конец) или доска (null)
function screenTarget(w) {
  for (const r of lessonRails.value) {
    const n = r.x.steps?.length ?? 0, h = railHs[r.x.id] ?? 420
    if (w.y < r.p.y - 70 || w.y > r.p.y + 40 + Math.min(700, h) || w.x < r.p.x + 120 || w.x > r.p.x + RAIL_X0 + Math.max(1, n) * SCR_STEP + SCR_W + 40) continue          // до конца «Итога урока»
    const i = Math.max(0, Math.min(n, Math.floor((w.x - r.p.x - RAIL_X0 + SCR_STEP / 2) / SCR_STEP)))
    return { L: r.x, i, mark: { x: r.p.x + RAIL_X0 + i * SCR_STEP - 32, y: r.p.y - 24, h: Math.min(700, h) + 70 }, gaps: Array.from({ length: n + 1 }, (_, k) => r.p.x + RAIL_X0 + k * SCR_STEP - 30).filter((_, k) => k !== i) }
  }
  for (const [k, x] of order.value.entries()) {
    if (!INTERACTIVE.includes(x.type)) continue
    const p = pos(k); if (Math.hypot(w.x - p.x, w.y - p.y) < 52) return { L: x, i: x.steps?.length ?? 0, bead: p }
  }
  return null
}
function sdStart(e, list, tray = null, extra = null) {
  const w = toWorld(e.clientX, e.clientY)
  sdP = { sx: e.clientX, sy: e.clientY, list, tray, w, extra }
  addEventListener('pointermove', sdMove); addEventListener('pointerup', sdUp, { once: true }); addEventListener('pointercancel', sdUp, { once: true })
}
// с ветки или с доски: тащим этот экран, а если он среди выделенных рамкой — все выделенные свои экраны
function grabStep({ e, s: st }) {
  const key = 'st:' + doc.id + ':' + st.id
  const sel2 = msel.value.includes(key) ? boxOf().filter(o => o.k === 'step' && o.course === doc.id && msel.value.includes(o.id)).map(o => o.s) : [st]
  const list = sel2.map(v => ({ s: v, at: whereStep(v) })).filter(o => o.at)
  if (list.length) sdStart(e, list)
}
function trayDown(e, id) { if (e.button === 0) sdStart(e, null, id) }
// Выделено рамкой — тянуть можно с любого места выделения (как в FigJam): экраны, стикеры, рисунки и черновики-кружки едут вместе
// выделен один урок (глава, задание) на рельсе — вместе с его экранами: за выделение тянется сам урок, как с рельса
const maskItem = computed(() => {
  const own = msel.value.filter(id => doc.items.some(v => v.id === id)); if (own.length !== 1) return null
  const L = doc.items.find(v => v.id === own[0]), mine = new Set((L.steps ?? []).map(v => 'st:' + doc.id + ':' + v.id))
  return msel.value.every(id => id === L.id || mine.has(id)) ? L : null
})
const canMask = computed(() => !!chapSel.value || msel.value.length > 0 && !sd.on && (!!maskItem.value || boxOf().some(o => msel.value.includes(o.id) && (o.k === 'note' || o.k === 'ink' || (o.k === 'step' && o.course === doc.id) || (o.k === 'item' && doc.loose.some(l => l.id === o.id))))))
function maskDown(e) {
  if (e.button !== 0) return
  if (chapSel.value) { const u = findAny(chapSel.value.id); return startDrag(e, { item: u, from: chapSel.value.from }) }
  if (maskItem.value) return startDrag(e, { item: maskItem.value, from: 'rail' })
  const ids = new Set(msel.value), bs = boxOf().filter(o => ids.has(o.id))
  const steps = bs.filter(o => o.k === 'step' && o.course === doc.id).map(o => ({ s: o.s, at: whereStep(o.s) })).filter(o => o.at)
  const extra = {
    notes: (doc.notes ?? []).filter(n => ids.has(n.id)).map(n => ({ o: n, x: n.x, y: n.y })),
    loose: doc.loose.filter(l => l.type !== 'screen' && ids.has(l.id)).map(l => ({ o: l, x: l.x, y: l.y })),
    inks: (doc.ink ?? []).filter(k => ids.has(k.id)).map(k => ({ o: k, p: [...k.p] })),
  }
  sdStart(e, steps, null, extra)
}
function moveExtra(x, dx, dy) {
  if (!x) return
  for (const v of [...x.notes, ...x.loose]) { v.o.x = Math.round(v.x + dx); v.o.y = Math.round(v.y + dy) }
  for (const v of x.inks) v.o.p = v.p.map((c, i) => Math.round(c + (i % 2 ? dy : dx)))
}
function sdMove(e) {
  if (!sdP && !placing) return
  if (!sd.on) {
    if (Math.hypot(e.clientX - sdP.sx, e.clientY - sdP.sy) < 6) return
    const first = sdP.list?.find(o => o.at.x || o.at.y)?.at
    const preview = sdP.tray ? (sdP.tray === 'lesson' ? fishLesson() : [TEMPLATES.find(t => t.id === sdP.tray).make()]) : []
    Object.assign(sd, { on: true, tray: sdP.tray, preview, list: sdP.list ?? [], extra: sdP.extra, s0: sdP.w, ox: first ? sdP.w.x - first.x : SCR_W / 2, oy: first ? sdP.w.y - first.y : 24 })
    if (sdP.tray) tray.value = null
  }
  sd.w = toWorld(e.clientX, e.clientY)
  moveExtra(sd.extra, sd.w.x - sd.s0.x, sd.w.y - sd.s0.y)
  sd.to = overToolbar(e.clientY) ? 'cancel' : sd.tray || sd.list.length ? screenTarget(sd.w) : null
}
async function sdUp(e) {
  removeEventListener('pointermove', sdMove); removeEventListener('pointercancel', sdUp); removeEventListener('pointerup', sdUp)
  const P = sdP; sdP = null
  if (!sd.on) { if (P?.tray) placeStart(P.tray, e); else if (P?.extra) msel.value = []; return }     // нажатие по выделению — снять его (дальше можно нажимать внутри)
  sdDrop(e)
}
// Нажали мини-окошко (не тянули) — как стикер в FigJam: экран едет за курсором, нажатие ставит его (на ветку, кружок урока или доску)
let placing = false
function placeStart(id, e) {
  const w = toWorld(e.clientX, e.clientY)
  Object.assign(sd, { on: true, tray: id, preview: id === 'lesson' ? fishLesson() : [TEMPLATES.find(t => t.id === id).make()], list: [], extra: null, s0: w, w, ox: SCR_W / 2, oy: 24, to: null })
  tray.value = null; placing = true
  addEventListener('pointermove', sdMove); addEventListener('pointerdown', placeDown, true)
}
function placeEnd() { placing = false; removeEventListener('pointermove', sdMove); removeEventListener('pointerdown', placeDown, true) }
function placeCancel() { placeEnd(); Object.assign(sd, { on: false, tray: null, preview: [], to: null }) }
function placeDown(e) {
  e.stopPropagation(); e.preventDefault(); placeEnd()
  if (e.button !== 0) return placeCancel()
  sdDrop(e)
}
function sdDrop(e) {
  const to = overToolbar(e.clientY) ? 'cancel' : screenTarget(toWorld(e.clientX, e.clientY)), w = toWorld(e.clientX, e.clientY)
  const tr = sd.tray, list = sd.list, preview = sd.preview, extra = sd.extra, s0 = sd.s0
  Object.assign(sd, { on: false, list: [], tray: null, preview: [], extra: null, to: null })
  if (to === 'cancel') return moveExtra(extra, 0, 0)
  if (!tr && !list.length) return save()                    // ехали только стикеры, рисунки и черновики
  const moving = tr ? preview : list.map(o => o.s)
  if (to) {
    const L = to.L, have = moving.filter(st => L.steps?.includes(st)).length
    if ((L.steps?.length ?? 0) - have + moving.length > STEPS_MAX) return say(`В уроке не больше ${STEPS_MAX} экранов`)
    let i = to.i
    if (!tr) for (const o of list) if (o.at.host === L && o.at.i < to.i) i--          // уходят с этой же ветки левее — место сдвигается
    if (!tr) unhook(list)
    if (!Array.isArray(L.steps)) L.steps = []
    L.steps.splice(Math.max(0, Math.min(L.steps.length, i)), 0, ...moving)
    selectStep(L.id, moving[0].id)
  } else {
    if (!tr) unhook(list)
    const x0 = w.x - sd.ox, y0 = w.y - sd.oy
    // свои экраны сохраняют расположение друг относительно друга (сдвиг как у курсора); новые из «Интерактива» — в ряд
    if (tr) moving.forEach((st, k) => doc.loose.push(freeOf(st, x0 + k * SCR_STEP, y0)))
    else list.forEach(o => doc.loose.push(freeOf(o.s, o.at.x + w.x - s0.x, o.at.y + w.y - s0.y)))
    selectStep(doc.loose.at(-1).id, moving.at(-1).id)
  }
  msel.value = extra ? [...moving.map(st => 'st:' + doc.id + ':' + st.id), ...extra.notes.map(v => v.o.id), ...extra.loose.map(v => v.o.id), ...extra.inks.map(v => v.o.id)]
    : moving.length > 1 ? moving.map(st => 'st:' + doc.id + ':' + st.id) : []
  setProgress(doc.progress); save()
}
// снять экраны с прежних мест (ветка урока или доска) — файлы не трогаем, экран просто переезжает
function unhook(list) {
  for (const o of list) {
    const h = o.at.host, k = h.steps?.indexOf(o.s) ?? -1; if (k < 0) continue
    if (h.type === 'screen') doc.loose.splice(doc.loose.indexOf(h), 1); else h.steps.splice(k, 1)
  }
}
// новый экран из «Интерактива» — сразу в полный размер, как он ляжет
const sdGhost = computed(() => (sd.on && sd.tray ? sd.preview.map((st, j) => ({ st, left: sd.w.x - sd.ox + j * SCR_STEP, top: sd.w.y - sd.oy })) : []))
const run = ref(null)                                             // «Пройти урок» — урок целиком, как ученик (как «Презентация» в Figma)
// выбран урок с готовыми экранами (не тянем, не рамка) — под кружком карточка урока, как у ученика
const peekOf = (x) => { if (sel.value !== x.id || drag.on || msel.value.length > 1 || !INTERACTIVE.includes(x.type)) return null; const ok = (x.steps ?? []).filter(v => !stepIssue(v)); return ok.length ? ok : null }
// «Поехали!» в редакторе — не окно, а переход к самому уроку: первый экран ветки выбран и по центру
function goLesson(x) {
  const st = (x.steps ?? []).find(v => !stepIssue(v)) ?? x.steps?.[0]; if (!st) return
  selectStep(x.id, st.id)
  nextTick(() => {
    const el = document.querySelector(`.frame[data-id="${st.id}"]`); if (!el) return
    const r = el.getBoundingClientRect(), box = board.value.getBoundingClientRect()
    animView({ ...view, x: view.x - (r.left - box.left - (W.value - r.width) / 2), y: view.y - (r.top - box.top - 110) }, true)
  })
}
const runLesson = computed(() => (run.value ? findAny(run.value) : null))

// ---------- Нижняя панель как в FigJam: группа → ряд элементов над панелью ----------
const tray = ref(null)                                            // открытая группа: 'tasks' | 'media' | 'inter' | 'note'
const GROUPS = [
  { k: 'tasks', t: 'Задания', ic: T.lesson.ic, c: 'var(--green)' },
  { k: 'inter', t: 'Интерактив', ic: KINDS.choice.ic, c: 'var(--purple)' },
  { k: 'note', t: 'Стикер', ic: '<path d="M5 4.5h14v10l-4.5 4.5H5z"/><path d="M14.5 19v-4.5H19"/>', c: '#f5b400' },
]
const NOTE_COLORS = ['#ffffff', '#e6e6e6', '#ffc4b8', '#ffd6a8', '#ffe99a', '#c7efc4', '#bdeee9', '#c4e1ff', '#ddd0ff', '#ffc9e6']
const noteColor = ref('#ffe99a'), noteTool = ref(false)            // как в FigJam: выбрали стикер — нажатие по холсту ставит его

// ---------- Стикеры, как в FigJam ----------
const noteSel = ref(null), noteEdit = ref(null)
function addNote(color, at) {
  const r = board.value.getBoundingClientRect(), w = at ?? toWorld(r.left + r.width / 2, r.top + r.height / 2)
  const u = useAuthStore().user, by = (u?.first_name || u?.username || '').slice(0, 60)
  const n = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), x: Math.round(w.x - 120), y: Math.round(w.y - 120), text: '', color, ...(by ? { by } : {}) }
  noteTool.value = false
  ;(doc.notes ??= []).push(n); tray.value = null; noteSel.value = n.id; save()
  nextTick(() => editNote(n.id))
}
function editNote(id) { noteEdit.value = id; noteSel.value = id; nextTick(() => document.querySelector(`[data-note="${id}"] textarea`)?.focus()) }
let nm = null
function noteDown(e, n) {
  if (noteEdit.value === n.id || e.button === 2) return
  sel.value = null; selectStep(null, null); noteSel.value = n.id
  const w = toWorld(e.clientX, e.clientY); nm = { n, dx: w.x - n.x, dy: w.y - n.y, moved: false }
  addEventListener('pointermove', noteMove); addEventListener('pointerup', noteUp, { once: true })
}
function noteMove(e) { if (!nm) return; sendCursor(e); const w = toWorld(e.clientX, e.clientY); nm.n.x = Math.round(w.x - nm.dx); nm.n.y = Math.round(w.y - nm.dy); nm.moved = true }
function noteUp() { removeEventListener('pointermove', noteMove); if (nm?.moved) save(); nm = null }
// Панель стикера, как в FigJam: цвет, шрифт, размер, жирный, зачёркнутый, ссылка, список, подпись автора
const nmenu = ref(null)                         // открытое меню панели: 'color' | 'font' | 'size'
watch(noteSel, () => { nmenu.value = null })
const NOTE_SIZES = { s: 'Маленький', m: 'Средний', l: 'Крупный' }
const NOTE_FONTS = { '': 'Обычный', hand: 'Рукописный' }
function noteToggle(n, k) { n[k] = !n[k]; if (!n[k]) delete n[k]; save() }
async function noteLink(n) {
  const url = await askText('Ссылка', { value: 'https://', placeholder: 'https://…', ok: 'Вставить' })
  if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return
  n.text = (n.text ? n.text.replace(/\s*$/, ' ') : '') + url.trim(); save()
}
// просмотр стикера: строки (со списком — точками) и кликабельные ссылки
const noteLines = (t) => (t ?? '').split('\n').map(l => l.split(/(https?:\/\/\S+)/g).map((x, i) => ({ x, url: i % 2 === 1 })))
function delNote(id) { const i = doc.notes.findIndex(n => n.id === id); if (i >= 0) doc.notes.splice(i, 1); noteSel.value = noteEdit.value = null; save() }

// ---------- Инструменты, как в FigJam: стрелка (выделение рамкой), рука (двигать холст), маркер (рисовать) ----------
// Стрелка: тянуть по пустому месту — рамка выделения; выделенное — с квадратиками по углам, Delete — удалить всё сразу.
// Рука (или зажатый пробел): тянуть где угодно — двигать холст. Маркер: рисовать поверх холста (штрихи — doc.ink).
const tool = ref('select'), space = ref(false)
const handOn = computed(() => tool.value === 'hand' || space.value)
const INK_COLORS = ['#1e1e1e', '#f24822', '#ffa629', '#14ae5c', '#0d99ff', '#9747ff']
const inkColor = ref('#1e1e1e')
// курсор-карандаш (кончик — цветом маркера, точка рисования — внизу слева)
const penCursor = computed(() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><path d='M4 22l2.2-6.6L18.6 3a2.3 2.3 0 0 1 3.3 0l1.1 1.1a2.3 2.3 0 0 1 0 3.3L10.6 19.8z' fill='white' stroke='%231e1e1e' stroke-width='1.6' stroke-linejoin='round'/><path d='M4 22l2.2-6.6 4.4 4.4z' fill='${inkColor.value.replace('#', '%23')}' stroke='%231e1e1e' stroke-width='1.2' stroke-linejoin='round'/></svg>`
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E')}") 3 23, crosshair`
})
function setTool(t) { tool.value = t; noteTool.value = false; tray.value = t === 'pen' ? 'pen' : tray.value === 'pen' ? null : tray.value }
const inkD = (p) => { if (p.length < 4) return p.length ? `M${p[0]} ${p[1]}h0.1` : ''; let d = `M${p[0]} ${p[1]}`; for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`; return d }
// Пока рисуем — штрих живёт вне Vue (рисуем прямо в <path>, без перерисовки редактора), в курс — по отпусканию
let ink = null
const liveInk = ref(null)
function inkStart(e) {
  const w = toWorld(e.clientX, e.clientY); ink = { id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), c: inkColor.value, w: 4, p: [Math.round(w.x), Math.round(w.y)] }
  const el = liveInk.value; if (el) { el.setAttribute('stroke', ink.c); el.setAttribute('d', inkD(ink.p)) }
}
function inkMove(e) {
  if (!ink) return
  for (const ev of e.getCoalescedEvents?.() ?? [e]) {          // все точки движения, а не только по кадрам — линия ровная
    const w = toWorld(ev.clientX, ev.clientY), n = ink.p.length
    if (n >= 4000 || Math.hypot(w.x - ink.p[n - 2], w.y - ink.p[n - 1]) * view.z < 1) continue
    ink.p.push(Math.round(w.x), Math.round(w.y))
  }
  liveInk.value?.setAttribute('d', inkD(ink.p))
}
function inkEnd() { if (ink) { (doc.ink ??= []).push(ink); save() } ink = null; liveInk.value?.setAttribute('d', '') }

// Выделение рамкой: id выделенного (задания на рельсе и черновики, стикеры, штрихи)
const msel = ref([]), mq = ref(null)              // mq — рамка на экране { x0, y0, x1, y1 }
// рамка экрана — по самой карточке на экране (высота у каждого своя), в координатах холста
// Считаем по раскладке (offset*), а не по экрану: так рамка не зависит от масштаба и не отстаёт, пока холст перерисовывается
function cardBox(id) {
  const el = typeof document !== 'undefined' && document.querySelector(`.frame[data-id="${id}"] .card`); if (!el) return null
  const f = el.closest('.frame'), x0 = f.offsetLeft + el.offsetLeft, y0 = f.offsetTop + el.offsetTop
  return { x0, y0, x1: x0 + el.offsetWidth, y1: y0 + el.offsetHeight }
}
const boxOf = () => {                              // всё, что можно выделить, с рамкой в координатах холста
  const out = []
  order.value.forEach((x, i) => { const p = pos(i); out.push(x.type === 'unit' ? { id: x.id, k: 'item', x0: p.x - 46, y0: p.y - 40, x1: p.x + 324, y1: p.y + 20 } : { id: x.id, k: 'item', x0: p.x - 34, y0: p.y - 34, x1: p.x + 34, y1: p.y + 34 }) })   // юнит — заголовок с полоской справа
  for (const x of doc.loose) {
    if (x.type !== 'screen') { out.push({ id: x.id, k: 'item', x0: x.x - 34, y0: x.y - 34, x1: x.x + 34, y1: x.y + 34 }); continue }
    const st = x.steps?.[0]; if (st) out.push({ id: 'st:' + doc.id + ':' + st.id, k: 'step', course: doc.id, lesson: x.id, s: st, x0: x.x, y0: x.y, x1: x.x + 460, y1: x.y + Math.min(700, railHs[x.id] ?? 420), ...cardBox(st.id) })
  }
  for (const n of doc.notes ?? []) out.push({ id: n.id, k: 'note', x0: n.x, y0: n.y, x1: n.x + 240, y1: n.y + (noteH[n.id] ?? 240) })
  // задания соседних курсов (кружки, фото, уроки, юниты) — их тоже можно выделить и скопировать к себе
  for (const o of othersL.value) (o.items ?? []).forEach((x, i) => { const p = { x: o.ox + o.L[i].x, y: o.L[i].y }
    out.push({ id: 'oi:' + o.id + ':' + x.id, k: 'oitem', course: o.id, item: x, ...(x.type === 'unit' ? { x0: p.x - 46, y0: p.y - 40, x1: p.x + 400, y1: p.y + 20 } : { x0: p.x - 34, y0: p.y - 34, x1: p.x + 34, y1: p.y + 34 }) }) })
  // экраны уроков (свои и соседних курсов) — чтобы рамкой выделить и скопировать сразу несколько
  const rails = [...lessonRails.value.map(r => ({ course: doc.id, x: r.x, p: r.p, key: '' })),
    ...othersL.value.flatMap(o => (o.items ?? []).map((x, i) => ({ course: o.id, x, p: { x: o.ox + o.L[i].x, y: o.L[i].y }, key: 'o' + o.id })).filter(r => INTERACTIVE.includes(r.x.type)))]
  for (const r of rails) (r.x.steps ?? []).forEach((st, i) => {
    const x0 = r.p.x + RAIL_X0 + i * 520, y0 = r.p.y + 40
    out.push({ id: 'st:' + r.course + ':' + st.id, k: 'step', course: r.course, lesson: r.x.id, s: st, x0, y0, x1: x0 + 460, y1: y0 + Math.min(700, railHs[r.key + r.x.id] ?? 420), ...(r.course === doc.id ? cardBox(st.id) : null) })
  })
  for (const k of doc.ink ?? []) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < k.p.length; i += 2) { x0 = Math.min(x0, k.p[i]); x1 = Math.max(x1, k.p[i]); y0 = Math.min(y0, k.p[i + 1]); y1 = Math.max(y1, k.p[i + 1]) } out.push({ id: k.id, k: 'ink', x0: x0 - k.w, y0: y0 - k.w, x1: x1 + k.w, y1: y1 + k.w }) }
  return out
}
const noteH = reactive({})
function mqMove(e) {
  mq.value.x1 = e.clientX; mq.value.y1 = e.clientY
  const a = toWorld(Math.min(mq.value.x0, e.clientX), Math.min(mq.value.y0, e.clientY)), b = toWorld(Math.max(mq.value.x0, e.clientX), Math.max(mq.value.y0, e.clientY))
  msel.value = boxOf().filter(o => o.x0 < b.x && o.x1 > a.x && o.y0 < b.y && o.y1 > a.y).map(o => o.id)
}
const mqStyle = computed(() => { const m = mq.value, r = board.value?.getBoundingClientRect() ?? { left: 0, top: 0 }; return m && { left: Math.min(m.x0, m.x1) - r.left + 'px', top: Math.min(m.y0, m.y1) - r.top + 'px', width: Math.abs(m.x1 - m.x0) + 'px', height: Math.abs(m.y1 - m.y0) + 'px' } })
// рамка вокруг выделенного (с квадратиками по углам) — в координатах холста
// один выбранный экран — рамка с квадратиками по углам, как в Figma (по самой карточке; тянуть — за любое место карточки)
const oneBox = computed(() => {
  if (sd.on || msel.value.length || !pick.step || pick.step === 'final' || !board.value) return null
  void (view.x + view.y + view.z + (railHs[pick.lesson] ?? 0) + boxTick.value)        // пересчёт при сдвиге, масштабе и правках
  const w = cardBox(pick.step); if (!w) return null
  const a = toScreen({ x: w.x0, y: w.y0 }), b = toScreen({ x: w.x1, y: w.y1 })
  return { left: Math.round(a.x - 6) + 'px', top: Math.round(a.y - 6) + 'px', width: Math.round(b.x - a.x + 12) + 'px', height: Math.round(b.y - a.y + 12) + 'px' }
})
const selBox = computed(() => {
  if (chapSel.value && !sd.on) {             // выбрана глава — рамка вокруг всей главы
    void (view.x + view.y + view.z)
    const b = chapSel.value.box, a = toScreen({ x: b.x0, y: b.y0 }), c = toScreen({ x: b.x1, y: b.y1 })
    return { left: Math.round(a.x) + 'px', top: Math.round(a.y) + 'px', width: Math.round(c.x - a.x) + 'px', height: Math.round(c.y - a.y) + 'px' }
  }
  const ids = new Set(msel.value); if (!ids.size || sd.on) return null
  void (view.x + view.y + view.z + boxTick.value)
  const bs = boxOf().filter(o => ids.has(o.id)); if (!bs.length) return null
  // выделен урок с веткой — рамка охватывает и всю его ветку: экраны и «Итог урока»
  for (const o of [...bs]) {
    const L = o.k === 'item' && lessonRails.value.find(r => r.x.id === o.id)?.x; if (!L) continue
    for (const id of [...(L.steps ?? []).map(v => v.id), 'fin-' + L.id]) { const c = cardBox(id); if (c) bs.push(c) }
  }
  const pad = 6 / view.z                                     // отступ рамки — 6 px на экране при любом масштабе
  const x0 = Math.min(...bs.map(o => o.x0)) - pad, y0 = Math.min(...bs.map(o => o.y0)) - pad, x1 = Math.max(...bs.map(o => o.x1)) + pad, y1 = Math.max(...bs.map(o => o.y1)) + pad
  const a = toScreen({ x: x0, y: y0 }), b = toScreen({ x: x1, y: y1 })       // рамка — на экране (поверх холста): линии и квадратики всегда чёткие
  return { left: Math.round(a.x) + 'px', top: Math.round(a.y) + 'px', width: Math.round(b.x - a.x) + 'px', height: Math.round(b.y - a.y) + 'px' }
})
const isM = (id) => msel.value.includes(id)
async function delSelected() {
  const ids = new Set(msel.value); if (!ids.size) return
  const steps = boxOf().filter(o => o.k === 'step' && o.course === doc.id && ids.has(o.id) && !ids.has(o.lesson))     // свои экраны (чужие курсы не трогаем)
  const items = [...doc.items, ...doc.loose].filter(x => ids.has(x.id)), notes = (doc.notes ?? []).filter(n => ids.has(n.id)), inks = (doc.ink ?? []).filter(k => ids.has(k.id))
  const n = items.length + notes.length + inks.length + steps.length
  if (!n) return
  for (const x of items) dropRefs([x.file, x.media && 'idb:' + x.media, ...(x.steps ?? []).flatMap(stepRefs)])
  for (const o of steps) { const L = findAny(o.lesson); const k = L?.steps?.indexOf(o.s) ?? -1; if (k >= 0) { L.steps.splice(k, 1); dropRefs(stepRefs(o.s)) } }
  doc.items = doc.items.filter(x => !ids.has(x.id)); doc.loose = doc.loose.filter(x => !ids.has(x.id))
  doc.notes = (doc.notes ?? []).filter(n => !ids.has(n.id)); doc.ink = (doc.ink ?? []).filter(k => !ids.has(k.id))
  msel.value = []; sel.value = null; selectStep(null, null); noteSel.value = null; setProgress(doc.progress); save()
}
const screens = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'экран' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'экрана' : 'экранов'}`

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
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1          // строки / страницы → пиксели
  const dx = e.deltaX * k, dy = e.deltaY * k
  if (e.ctrlKey || e.metaKey) {
    // щелчок колёсика мыши (большой шаг) — ±15 %, как в Figma; щипок тачпада (мелкие шаги) — плавно
    const f = Math.abs(dy) >= 40 ? (dy < 0 ? 1.15 : 1 / 1.15) : Math.exp(-dy * 0.01)
    zoomAt(f, e.clientX, e.clientY)
  } else { view.x -= dx; view.y -= dy }
}
// «Весь курс»: рельс, черновики и сводка — на экране целиком
function fit(anim = true) {
  const ps = [...layout.value, ...doc.loose.map(l => ({ x: l.x, y: l.y })), ...(doc.notes ?? []).map(n => ({ x: n.x + 120, y: n.y + 120 })),
    ...lessonRails.value.map(({ x, p }) => ({ x: p.x + 230 + ((x.steps?.length ?? 0) + 1) * 92 - 150, y: p.y })),
    ...othersL.value.flatMap(o => [{ x: o.ox, y: -170 }, { x: o.ox + widthOf(o.items ?? []) - 200, y: o.h - 200 }])]          // «Все курсы» — и соседние курсы
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
// за курсором мимо рельса: элементы структуры и где они лягут (в координатах холста)
const flyTree = computed(() => {
  if (!drag.on || (drag.over && drag.item?.type !== 'unit') || !drag.item || !['unit', ...BRANCH].includes(drag.item.type)) return null
  const c = toWorld(drag.x, drag.y), w = { x: c.x - drag.ox, y: c.y - drag.oy }
  const u = drag.item, rel = drag.from === 'loose' && u.x != null
  const dy = kidDy(drag.extra ?? [])
  return [u, ...(drag.extra ?? [])].map((x, k) => ({ x, p: rel && k ? { x: w.x + x.x - u.x, y: w.y + x.y - u.y, side: 'r' } : { x: w.x, y: w.y + (k ? dy[k - 1] : 0), side: 'r' } }))
})
// глава на доске — блок: её урок и чекпоинт помнят главу (grp) и ездят вместе с ней
// где под главой на доске лягут её задания: столбиком, под уроком с веткой — место во всю ветку (как на рельсе)
const kidDy = (ks) => { let y = 60; return ks.map(v => { const d = y; y += BRANCH.includes(v.type) ? RAIL_H + 110 : 130; return d }) }
const kidsOf = (u) => { const ks = doc.loose.filter(l => l.grp === u.id).sort((a, b) => a.y - b.y); return ks.length ? ks : null }
const dragIds = computed(() => new Set(drag.on ? [drag.item?.id, ...(drag.extra ?? []).map(v => v.id)] : []))
// плашка главы у призрака — едет вместе с ним
const flyBox = computed(() => {
  const t = flyTree.value; if (!t || t[0].x.type !== 'unit' || t[0].x.hl === 'none') return null
  const xs = t.map(g => g.p.x), y0 = t[0].p.y - 70
  const y1 = Math.max(t[0].p.y + 70, ...t.slice(1).map(g => g.p.y + 56 + (BRANCH.includes(g.x.type) ? 40 + RAIL_H : 0)))
  const hc = t[0].x.hlc ?? HL_DEF, x0 = Math.min(...xs) + CH_X0, x1 = Math.max(...xs) + CH_X1
  return { light: hc === '#ffffff', style: { '--hc': hc, '--ho': hlOp(t[0].x) + '%', left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px', transition: 'none' } }
})
const joints = computed(() => (drag.on && drag.item?.type === 'unit' && drag.from !== 'file' ? chapterJoints().map(j => ({ ...j, hot: drag.over && drag.to === j.b })) : []))
const chapterKids = () => [newItem('lesson'), newItem('checkpoint')].map(v => ({ ...v, steps: [] }))
const drag = reactive({ on: false, item: null, extra: null, ox: 0, oy: 0, from: null, over: false, to: 0, x: 0, y: 0 })
const railHs = reactive({})                  // фактическая высота экранов урока (сообщает LessonRail)
const hasRail = (x, key = '') => INTERACTIVE.includes(x?.type) && (!!x.steps?.length || (!key && BRANCH.includes(x.type)))          // свой курс — ветка у каждого урока (и пустого); соседние — только с экранами
const layoutOf = (list, m = mode.value, key = '') => {
  let y = 0
  return list.map((x, i) => {
    if (i) {                                     // под урок с экранами — место во всю высоту его экранов (без прокрутки)
      const gap = x.type === 'unit' ? G.unitGap : G.step, prev = list[i - 1]
      // глава: от низа плашки предыдущей главы — всегда CH_GAP (низ плашки = последнее задание + 56, у урока с веткой — + ветка)
      if (x.type === 'unit' && m !== 'wave') y += 56 + (hasRail(prev, key) ? 40 + (railHs[key + prev.id] ?? RAIL_H) : 0) + CH_GAP + 70
      else y += hasRail(prev, key) ? Math.max(gap, 40 + (railHs[key + prev.id] ?? RAIL_H) + (x.type === 'unit' ? 110 : 70)) : gap
    }
    const off = m === 'wave' ? K[i % 8] * G.amp : 0
    return { x: off, y, side: off > 0 ? 'l' : 'r' }
  })
}
// Порядок на рельсе: взятое (если целимся в рельс) уже стоит на месте прицела
const order = computed(() => {
  const list = doc.items.filter(x => !dragIds.value.has(x.id))
  if (drag.on && drag.over && drag.item?.type !== 'unit') list.splice(Math.min(drag.to, list.length), 0, drag.item, ...(drag.extra ?? []))      // новая глава — сразу с уроком и чекпоинтом
  return list
})
const layout = computed(() => layoutOf(order.value))
const pos = (i) => layout.value[i] ?? { x: 0, y: 0, side: 'r' }
function railPath(n, L = layout.value, dx = 0) {
  if (!n) return ''
  const P = L.slice(0, n).map(p => ({ x: p.x + dx, y: p.y })); let d = `M${P[0].x},${P[0].y}`
  for (let i = 1; i < P.length; i++) {
    const p0 = P[i - 2] ?? P[i - 1], p1 = P[i - 1], p2 = P[i], p3 = P[i + 1] ?? p2
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`
  }
  return d
}
// рельс: от названия курса сверху — через все задания — и ещё отрезок после последней главы (туда насаживают следующую)
const railTail = computed(() => { const L = layout.value, n = order.value.length; if (!n) return { x: 0, y0: -150, y1: 200 }; const last = order.value[n - 1]; return { x: L[n - 1].x, x0: L[0].x, y0: L[0].y - 150, top: L[0].y, y: L[n - 1].y, y1: L[n - 1].y + 56 + (hasRail(last) ? 40 + (railHs[last.id] ?? RAIL_H) : 0) + CH_GAP + 60 } })
const rail = computed(() => { const t = railTail.value; return railPath(order.value.length) + (order.value.length ? ` M${t.x0},${t.y0} L${t.x0},${t.top} M${t.x},${t.y} L${t.x},${t.y1}` : ` M0,${t.y0} L0,${t.y1}`) })
const railBox = computed(() => { const ys = layout.value.map(p => p.y); return { y1: Math.max(railTail.value.y1, ...ys) + 200 } })
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
// Юниты — «главы», как в Busuu: светлая карточка вокруг своих уроков, сверху название и полоска прогресса юнита
const chapters = computed(() => {
  const out = [], L = layout.value
  order.value.forEach((x, i) => {
    if (x.type === 'unit') out.push({ id: x.id, i, last: i, tasks: 0, done: 0 })
    else if (out.length) { const c = out[out.length - 1]; c.last = i; c.tasks++; if (stateOf(x, i) === 'done') c.done++ }
  })
  const [x0, x1] = mode.value === 'wave' ? [-330, 330] : [-70, 420]
  return out.map(c => ({ ...c, pct: c.tasks ? Math.round(c.done / c.tasks * 100) : 0, style: { left: x0 + 'px', width: x1 - x0 + 'px', top: L[c.i].y - 62 + 'px', height: L[c.last].y - L[c.i].y + 62 + 64 + 'px' } }))
})
const chapterOf = (i) => chapters.value.find(c => c.i === i)
// Подсветка главы на доске (как блок): по умолчанию — светло-зелёная плашка вокруг рельса главы; в меню главы — светлая, без подсветки,
// или «с ветками» — плашка охватывает и ветки экранов уроков главы
// цвета подсветки главы — как цвета секций в Figma
const HL_COLORS = ['#1fbe78', '#ffffff', '#0d99ff', '#9747ff', '#ff6fb1', '#ff9f1a', '#ffc800', '#8a8f98']
const HL_DEF = '#1fbe78'
// бейдж процента — на конце заполненной полоски (как в Busuu), не вылезая за края
const badge = (pct) => ({ left: pct + '%', transform: `translate(-${pct}%, -50%)` })
// прозрачность плашки главы (заливка), %: по умолчанию лёгкая; 100 — непрозрачная
const HL_OP = [8, 20, 40, 70, 100], hlOp = (u) => u.hlo ?? ((u.hlc ?? HL_DEF) === '#ffffff' ? 85 : 8)
function setHlo(u, v) { if (v === ((u.hlc ?? HL_DEF) === '#ffffff' ? 85 : 8)) delete u.hlo; else u.hlo = v; chMenu.value = null; save() }
// плашка главы — рельс с названием, полоской и подписями уроков; ветки экранов начинаются правее (RAIL_X0), на неё не заезжают
const CH_X0 = -70, CH_X1 = 340, CH_GAP = 40
const chapterBoxes = computed(() => {
  const L = layout.value, out = [], rails = new Map(lessonRails.value.map(r => [r.x.id, r]))
  chapters.value.forEach((c, k) => {
    const u = order.value[c.i]; if (!u) return
    const next = chapters.value[k + 1], lastIt = order.value[c.last]
    const bottom = L[c.last].y + 56 + (c.last > c.i && hasRail(lastIt) ? 40 + (railHs[lastIt.id] ?? RAIL_H) : 0)          // низ — по последнему заданию главы (тот же отступ, что в раскладке)
    let x0 = mode.value === 'wave' ? -330 : CH_X0, x1 = mode.value === 'wave' ? 330 : CH_X1
    if (u.hlw) for (let i = c.i + 1; i <= c.last; i++) { const r = rails.get(order.value[i].id); if (r) x1 = Math.max(x1, r.p.x + RAIL_X0 + Math.max(1, r.x.steps?.length ?? 0) * 520 + 460 + 36) }
    const top = L[c.i].y - 70
    const hc = u.hlc ?? HL_DEF
    const y1 = top + Math.max(120, bottom - top)
    out.push({ id: u.id, from: 'rail', box: { x0, y0: top, x1, y1 }, light: hc === '#ffffff', w: !!u.hlw, style: { '--hc': hc, '--ho': hlOp(u) + '%', left: x0 + 'px', top: top + 'px', width: x1 - x0 + 'px', height: y1 - top + 'px' } })
  })
  // главы на доске — блоком вокруг своих урока и чекпоинта
  for (const u of doc.loose) {
    if (u.type !== 'unit' || dragIds.value.has(u.id)) continue
    const ks = doc.loose.filter(l => l.grp === u.id && !dragIds.value.has(l.id))
    let x0 = u.x + CH_X0, x1 = u.x + CH_X1, y1 = u.y + 70
    for (const k of ks) {
      x0 = Math.min(x0, k.x + CH_X0); x1 = Math.max(x1, u.hlw ? k.x + RAIL_X0 + Math.max(1, k.steps?.length ?? 0) * 520 + 460 + 36 : k.x + CH_X1)
      y1 = Math.max(y1, k.y + 56 + (BRANCH.includes(k.type) ? 40 + Math.min(700, railHs[k.id] ?? RAIL_H) : 0))
    }
    const hc = u.hlc ?? HL_DEF, top = u.y - 70
    out.push({ id: u.id, from: 'loose', box: { x0, y0: top, x1, y1 }, light: hc === '#ffffff', w: !!u.hlw, style: { '--hc': hc, '--ho': hlOp(u) + '%', left: x0 + 'px', top: top + 'px', width: x1 - x0 + 'px', height: y1 - top + 'px' } })
  }
  return out
})
// глава — жёсткий блок: на рельсе её задания — всё, что после неё до следующей главы; на доске — её урок и чекпоинт (grp)
const railKids = (u) => { const i = doc.items.indexOf(u); if (i < 0) return null; const out = []; for (let k = i + 1; k < doc.items.length && doc.items[k].type !== 'unit'; k++) out.push(doc.items[k]); return out.length ? out : null }
const chapSel = computed(() => (sel.value && !msel.value.length && !drag.on ? chapterBoxes.value.find(c => c.id === sel.value) : null))
function chapDown(e, c) { if (e.button === 2) return; const u = findAny(c.id); if (u) startDrag(e, { item: u, from: c.from }) }
const rowHl = computed(() => {
  if (drag.on || mode.value === 'wave') return null
  // выбранный урок, а если ничего не выбрано — текущий («Сейчас»), как в Busuu
  let i = sel.value ? order.value.findIndex(v => v.id === sel.value) : -1
  if (i < 0 && !sel.value) i = order.value.findIndex((v, k) => v.type !== 'unit' && stateOf(v, k) === 'current')
  const x = order.value[i]; if (!x || x.type === 'unit') return null
  const p = pos(i); return { left: p.x + CH_X0 + 10 + 'px', top: p.y - 54 + 'px', width: CH_X1 - CH_X0 - 20 + 'px', height: '108px' }
})
const lessonBox = computed(() => {
  if (!sel.value || drag.on || msel.value.length) return null
  const r = lessonRails.value.find(v => v.x.id === sel.value); if (!r) return null
  const n = r.x.steps?.length ?? 0, k = 1 / view.z
  const x0 = r.p.x - 44, y0 = r.p.y - 50, x1 = r.p.x + RAIL_X0 + Math.max(1, n) * 520 + SCR_W + 14, y1 = r.p.y + 40 + Math.min(900, railHs[r.x.id] ?? RAIL_H) + 14
  return { x: r.x, from: doc.items.includes(r.x) ? 'rail' : 'loose', style: { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px', '--k': k } }
})
const titleEdit = ref(false)
function editTitle() { titleEdit.value = true; nextTick(() => document.querySelector('[data-ctitle]')?.select()) }
const chMenu = ref(null)                 // открытый список в меню главы: 'color'
// вид подсветки: 'rail' — рельс главы, 'wide' — с ветками, 'none' — без подсветки; цвет — отдельно
function setHl(u, how) { delete u.hl; delete u.hlw; if (how === 'none') u.hl = 'none'; if (how === 'wide') u.hlw = true; save() }
function setHlc(u, c) { if (c === HL_DEF) delete u.hlc; else u.hlc = c; if (u.hl === 'none') delete u.hl; chMenu.value = null; save() }
const hlHow = (u) => (u.hl === 'none' ? 'none' : u.hlw ? 'wide' : 'rail')
const looseShown = computed(() => doc.loose.filter(l => l.type !== 'screen' && !dragIds.value.has(l.id)))
const freeScreens = computed(() => doc.loose.filter(l => l.type === 'screen' && l.steps?.length))
const beadStyle = (x, p, c) => ({ left: p.x + 'px', top: p.y + 'px', '--c': c[0], '--d': c[1], ...(selColor.value[x.id] ? { '--rc': selColor.value[x.id] } : {}) })
const colorOf = (x, i) => (x.type === 'unit' ? (i == null ? UNIT_COLORS[0] : unitColor(i)) : [T[x.type].c, T[x.type].d])

// ---------- Перетаскивание: с панели, с рельса, с холста ----------
let pending = null
// Ближайший промежуток рельса к точке холста; «на рельсе» — если близко к линии
// Стыки рельса — куда можно насадить главу: перед первой главой, между главами и после последней (в середине промежутка)
function chapterJoints() {
  const keep = doc.items.filter(v => !dragIds.value.has(v.id)), P = layoutOf(keep), n = keep.length, out = []
  const bottom = (i) => P[i].y + 56 + (hasRail(keep[i]) ? 40 + (railHs[keep[i].id] ?? RAIL_H) : 0)
  if (!n) return [{ b: 0, x: 0, y: 0 }]
  for (let b = 0; b <= n; b++) {
    if (b < n && keep[b].type !== 'unit') continue
    out.push({ b, x: (P[Math.min(b, n - 1)] ?? P[n - 1]).x, y: b < n ? P[b].y - 70 - CH_GAP / 2 : bottom(n - 1) + CH_GAP / 2 })
  }
  return out
}
function nearest(w) {
  if (drag.item?.type === 'unit') {          // глава — только в стык между главами, «магнитом»
    let best = null
    for (const j of chapterJoints()) { const d = Math.abs(w.y - j.y); if (Math.abs(w.x - j.x) < 260 && d < 220 && (!best || d < best.d)) best = { ...j, d } }
    return best ? { i: best.b, near: true } : { i: 0, near: false }
  }
  // место вставки — по высоте (сколько заданий выше точки); «на рельсе» — если близко к самой линии рельса по горизонтали.
  // Раньше мерили до середины промежутка: между уроками с ветками промежутки большие, и на рельс было не попасть.
  const keep = doc.items.filter(v => v.id !== drag.item?.id && !(drag.extra ?? []).includes(v)), P = layoutOf(keep), n = keep.length
  if (!n) return { i: 0, near: Math.abs(w.x) < 200 && Math.abs(w.y) < 260 }          // рельс пустой — «на рельсе» у его начала
  let i = 0; while (i < n && P[i].y < w.y) i++
  const a = P[i - 1], b = P[i], rx = a && b ? a.x + (b.x - a.x) * Math.min(1, Math.max(0, (w.y - a.y) / Math.max(1, b.y - a.y))) : (a ?? b).x
  const inY = w.y > P[0].y - 140 && w.y < P[n - 1].y + 180
  return { i, near: inY && Math.abs(w.x - rx) < 110 }
}
const overToolbar = (cy) => cy > H.value - (phone.value ? 92 : 104)
function startDrag(e, src) {
  if (e.button === 2) return                                  // правая кнопка — меню
  if (editing.value || touches.size > 1) return
  pending = { ...src, sx: e.clientX, sy: e.clientY }
  addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true }); addEventListener('pointercancel', up, { once: true })
}
function move(e) {
  sendCursor(e)
  if (pending && !drag.on) {
    if (Math.hypot(e.clientX - pending.sx, e.clientY - pending.sy) < 5) return
    sel.value = null
    Object.assign(drag, { on: true, item: pending.type ? newItem(pending.type) : pending.item, extra: pending.type === 'unit' ? chapterKids() : pending.from === 'loose' && pending.item?.type === 'unit' ? kidsOf(pending.item) : pending.from === 'rail' && pending.item?.type === 'unit' ? railKids(pending.item) : null, from: pending.type ? 'new' : pending.from })
    // за какое место взяли — так и держим: задание не «прыгает» под курсор своим углом
    const sw = toWorld(pending.sx, pending.sy), src = pending.from === 'rail' ? pos(doc.items.indexOf(pending.item)) : pending.from === 'loose' ? pending.item : null
    drag.ox = src ? sw.x - src.x : 0; drag.oy = src ? sw.y - src.y : 0
  }
  if (!drag.on) return
  drag.x = e.clientX; drag.y = e.clientY
  const n = nearest(toWorld(e.clientX, e.clientY)); drag.over = n.near && !overToolbar(e.clientY); drag.to = n.i
}
function up(e) {
  removeEventListener('pointermove', move)
  const p = pending; pending = null
  if (!drag.on) {                    // нажатие
    if (MEDIA.includes(p?.type)) return pickFile(null, p.type)
    if (p?.type) return itemPlaceStart(p.type, e)     // нажали «Урок» / «Чекпоинт» / «Юнит» — едет за курсором, нажатие ставит (как стикер)
    else if (p?.item) { sel.value = sel.value === p.item.id ? null : p.item.id; selectStep(null, null); noteSel.value = null }
    return
  }
  // на ветку урока (место экранов) задание не кладём — только экраны; отпустили там — задание возвращается
  drop(drag.over ? 'rail' : overToolbar(e.clientY) || screenTarget(toWorld(e.clientX, e.clientY))?.mark ? 'cancel' : 'canvas', toWorld(e.clientX, e.clientY))
}
// Нажали задание на панели (не тянули): оно едет за курсором, нажатие ставит — на рельс (если рядом) или на холст; Esc — отмена
let placingItem = false
function itemPlaceStart(type, e) {
  Object.assign(drag, { on: true, item: newItem(type), extra: type === 'unit' ? chapterKids() : null, ox: 0, oy: 0, from: 'new', x: e.clientX, y: e.clientY, over: false })
  tray.value = null; placingItem = true
  addEventListener('pointermove', itemPlaceMove); addEventListener('pointerdown', itemPlaceDown, true)
}
function itemPlaceMove(e) {
  drag.x = e.clientX; drag.y = e.clientY
  const n = nearest(toWorld(e.clientX, e.clientY)); drag.over = n.near && !overToolbar(e.clientY); drag.to = n.i
}
function itemPlaceEnd() { placingItem = false; removeEventListener('pointermove', itemPlaceMove); removeEventListener('pointerdown', itemPlaceDown, true) }
function itemPlaceCancel() { itemPlaceEnd(); Object.assign(drag, { on: false, item: null, extra: null, over: false, ox: 0, oy: 0 }) }
function itemPlaceDown(e) {
  e.stopPropagation(); e.preventDefault(); itemPlaceEnd()
  if (e.button !== 0) return itemPlaceCancel()
  itemPlaceMove(e)
  const w = toWorld(e.clientX, e.clientY)
  drop(drag.over ? 'rail' : overToolbar(e.clientY) || screenTarget(w)?.mark ? 'cancel' : 'canvas', w); save()
}
// Куда легло взятое: на рельс (в промежуток), на холст (где отпустили) или отмена (над панелью)
function drop(where, w) {
  const x = drag.item, from = drag.from
  const kids = drag.extra ?? []
  if (where === 'rail') {
    if (from === 'loose') { const out = new Set([x.id, ...kids.map(v => v.id)]); doc.loose = doc.loose.filter(l => !out.has(l.id)) }
    for (const v of [x, ...kids]) { delete v.x; delete v.y; delete v.grp }
    if (x.type === 'unit') { const list = doc.items.filter(v => !dragIds.value.has(v.id)); list.splice(Math.min(drag.to, list.length), 0, x, ...kids); doc.items.splice(0, doc.items.length, ...list) }
    else doc.items.splice(0, doc.items.length, ...order.value)          // глава с доски встаёт на рельс вместе со своим уроком и чекпоинтом
  } else if (where === 'canvas') {
    if (from === 'rail') {
      const out = new Set([x.id, ...kids.map(v => v.id)]); doc.items = doc.items.filter(v => !out.has(v.id))
      const dy = kidDy(kids); kids.forEach((v, k) => { v.x = Math.round(w.x); v.y = Math.round(w.y) + dy[k]; v.grp = x.id; doc.loose.push(v) })      // глава с рельса — на доску блоком
    }
    w = { x: w.x - drag.ox, y: w.y - drag.oy }                       // место — с учётом, за какое место взяли
    const dx = from === 'loose' ? Math.round(w.x) - x.x : 0, dy = from === 'loose' ? Math.round(w.y) - x.y : 0
    x.x = Math.round(w.x); x.y = Math.round(w.y)
    if (from !== 'loose') doc.loose.push(x)
    if (from === 'loose') for (const v of kids) { v.x += dx; v.y += dy }          // глава на доске едет вместе со своим блоком
  }
  // новая глава — сразу со структурой, как в Busuu: глава, урок, чекпоинт (на рельсе они уже встали вместе с главой; на доске — блоком)
  if (where === 'canvas' && from === 'new' && kids.length) { const dy = kidDy(kids); kids.forEach((v, k) => { v.x = x.x; v.y = x.y + dy[k]; v.grp = x.id; doc.loose.push(v) }) }
  if (where === 'canvas' && x.type === 'unit') keepApart(x)
  Object.assign(drag, { on: false, item: null, extra: null, over: false, ox: 0, oy: 0 })
  if (where !== 'cancel' && from === 'new') { sel.value = x.id; if (MEDIA.includes(x.type) && !x.media) pickFile(findAny(x.id), x.type) }
  setProgress(doc.progress)
}
// Глава на доске не налезает на рельс и другие главы (вместе с ветками экранов): если легла поверх — сдвигаем левее, с зазором
const branchEnd = (x, px) => (BRANCH.includes(x.type) || x.steps?.length ? px + RAIL_X0 + Math.max(1, x.steps?.length ?? 0) * 520 + SCR_W : px + CH_X1)
function blockOf(u, ks) {
  let x0 = u.x + CH_X0, x1 = u.x + CH_X1, y1 = u.y + 70
  for (const k of ks) { x0 = Math.min(x0, k.x + CH_X0); x1 = Math.max(x1, branchEnd(k, k.x)); y1 = Math.max(y1, k.y + 56 + (BRANCH.includes(k.type) ? 40 + (railHs[k.id] ?? RAIL_H) : 0)) }
  return { x0, y0: u.y - 70, x1, y1 }
}
function obstacles(self) {
  const L = layout.value, out = []
  chapters.value.forEach((c, k) => {          // главы на рельсе — с ветками своих уроков
    const next = chapters.value[k + 1], last = order.value[c.last]
    let x1 = CH_X1; for (let i = c.i + 1; i <= c.last; i++) x1 = Math.max(x1, branchEnd(order.value[i], L[i].x))
    out.push({ x0: L[c.i].x + CH_X0, y0: L[c.i].y - 70, x1, y1: next ? L[next.i].y - 70 : L[c.last].y + 56 + (hasRail(last) ? 40 + (railHs[last.id] ?? RAIL_H) : 0) })
  })
  for (const u of doc.loose) if (u.type === 'unit' && u.id !== self.id) out.push(blockOf(u, doc.loose.filter(l => l.grp === u.id)))
  return out
}
function keepApart(u) {
  const ks = doc.loose.filter(l => l.grp === u.id), obs = obstacles(u), GAPX = 60
  for (let n = 0; n < 12; n++) {
    const b = blockOf(u, ks), hit = obs.filter(o => o.x0 < b.x1 + GAPX && o.x1 > b.x0 - GAPX && o.y0 < b.y1 + 40 && o.y1 > b.y0 - 40)
    if (!hit.length) return
    const dx = Math.min(...hit.map(o => o.x0)) - GAPX - b.x1          // левее всего, на что легла
    for (const v of [u, ...ks]) v.x = Math.round(v.x + dx)
  }
}
function newItem(type) {
  const nUnits = doc.items.filter(x => x.type === 'unit').length
  return it(type, type === 'unit' ? `Глава ${nUnits + 1}` : T[type].t, type === 'unit' ? { sub: 'Тема главы' } : {})
}
const findAny = (id) => doc.items.find(v => v.id === id) ?? doc.loose.find(v => v.id === id)
function showRailEnd() { const p = toScreen(pos(order.value.length - 1)); if (p.y > H.value - 160 || p.y < 100) animView({ ...view, y: view.y - (p.y - H.value / 2) }, true) }

// ---------- Пустое место: двигать холст; два пальца — масштаб ----------
const touches = new Map(); let pan = null, pinch = null
function boardDown(e) {
  if (e.button === 2) return                                  // правая кнопка — меню, не рамка и не сдвиг
  if (e.button === 0 && !handOn.value && e.pointerType !== 'touch') {
    if (tool.value === 'pen' && !noteTool.value) { inkStart(e); board.value.setPointerCapture?.(e.pointerId); return }
    if (!noteTool.value) {                                    // стрелка: рамка выделения
      msel.value = []; sel.value = null; selectStep(null, null); noteSel.value = noteEdit.value = null; tray.value = null
      window.getSelection()?.removeAllRanges()               // рамка не выделяет текст на экранах (иначе Ctrl+C скопирует текст, а не экраны)
      mq.value = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }; board.value.setPointerCapture?.(e.pointerId); return
    }
  }
  if (e.pointerType === 'touch') { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; pan = null; return } }
  pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
  board.value.setPointerCapture?.(e.pointerId)
}
const ghost = ref(null)                                   // выбран стикер — его «призрак» под курсором (как в FigJam)
watch(() => noteTool.value, (v) => { if (!v) ghost.value = null })
let lastW = null                                          // где мышь на холсте — туда Ctrl+V кладёт экраны, если урок не выбран
function boardMove(e) {
  sendCursor(e); lastW = toWorld(e.clientX, e.clientY)
  if (noteTool.value && e.pointerType !== 'touch') { const w = toWorld(e.clientX, e.clientY); ghost.value = { x: Math.round(w.x - 120), y: Math.round(w.y - 120) } }
  if (ink) return inkMove(e)
  if (mq.value) return mqMove(e)
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
  if (ink) return inkEnd()
  if (mq.value) { mq.value = null; return }
  touches.delete(e.pointerId); if (touches.size < 2) pinch = null
  if (pan && !pan.moved && noteTool.value) { addNote(noteColor.value, toWorld(e.clientX, e.clientY)); pan = null; return }
  if (pan && !pan.moved) { sel.value = null; selectStep(null, null); noteSel.value = noteEdit.value = null; msel.value = []; if (tray.value !== 'pen') tray.value = null }
  pan = null
}

// ---------- Кружки из Telegram ----------
// Видео — в IndexedDB этого браузера (в localStorage не влезет); на сервер пока не уходит.
const IDB = 'tma-course-media'
const idb = () => new Promise((ok, no) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore('v'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
async function mediaOp(mode, fn) { const db = await idb(); return new Promise((ok, no) => { const tx = db.transaction('v', mode), r = fn(tx.objectStore('v')); tx.oncomplete = () => ok(r?.result ?? null); tx.onerror = () => no(tx.error) }) }
const urls = reactive({})
// Ссылки на просмотр из S3 — пачкой (сервер подписывает на 6 ч)
const want = new Set(); let vt = 0
function askView(key) {
  want.add(key); clearTimeout(vt)
  vt = setTimeout(async () => {
    const keys = [...want]; want.clear()
    try { const r = await apiRequest('/media/view', { method: 'POST', body: JSON.stringify({ keys }) }); if (r.ok) Object.assign(urls, (await r.json()).urls) } catch { /* без сети — позже */ }
  }, 50)
}
function mediaUrl(x) {
  if (x?.file && online) { if (!(x.file in urls)) { urls[x.file] = ''; askView(x.file) } return urls[x.file] }
  if (!x?.media) return ''
  if (!(x.media in urls)) { urls[x.media] = ''; mediaOp('readonly', s => s.get(x.media)).then(b => { if (b) urls[x.media] = URL.createObjectURL(b) }).catch(() => {}) }
  return urls[x.media]
}
const isVideo = (f) => f && (f.type?.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(f.name))
const isImage = (f) => f && (/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(f.type) || /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name))
const kindOf = (f) => (isVideo(f) ? 'video' : isImage(f) ? 'photo' : null)
const MAX_MB = 200
async function attach(item, file) {
  if (!item) return
  let kind = kindOf(file)
  const cover = !MEDIA.includes(item.type)
  if (cover && kind) {                                            // обложка урока: фото — кругом 480×480, сжатое
    if (kind === 'photo') { file = (await shrinkPhoto(file, 'cover')).file; kind = 'photo' }
    if (item.ck && (item.file || item.media)) dropRefs([item.file, item.media && 'idb:' + item.media]), delete item.file, delete item.media
    item.ck = kind
  }
  if (!kind || (!cover && kind !== item.type)) return say(item.type === 'photo' ? 'Это не фото' : 'Это не видео', { text: item.type === 'photo' ? 'Нужна картинка: JPG, PNG или WebP.' : 'Перетащите кружок из Telegram (видеофайл).' })
  if (file.size > MAX_MB * 1024 * 1024) return say('Файл слишком большой', { text: `Можно до ${MAX_MB} МБ.` })
  const id = 'm' + item.id
  try { await mediaOp('readwrite', s => s.put(file, id)) } catch { return say('Не удалось сохранить файл', { text: 'В браузере не хватило места.' }) }
  urls[id] = URL.createObjectURL(file); item.media = id; save()
  if (storageOn.value) upload(item, file)                   // и сразу в S3 (копия в браузере удалится после загрузки)
}
const fileInput = ref(null), pickKind = ref('video'); let pickFor = null
const pickFile = (item, kind = item?.type ?? 'video') => { pickFor = item; pickKind.value = kind; fileInput.value.value = ''; nextTick(() => fileInput.value.click()) }
async function onPicked(e) {
  const files = [...e.target.files].filter(f => kindOf(f) === pickKind.value); if (!files.length) return
  if (pickFor && !MEDIA.includes(pickFor.type)) files.length = 1          // обложка урока — один файл
  let item = pickFor
  for (const f of files) {
    if (!item) { item = newItem(pickKind.value); doc.items.push(item) }
    await attach(findAny(item.id), f); sel.value = item.id; item = null
  }
  if (!pickFor) nextTick(() => showRailEnd())
}
// Файл тащат из Telegram / проводника: на рельс — с местом вставки, мимо — на холст
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
function fileOver(e) {
  if (!hasFiles(e)) return
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
  if (!drag.on) {        // тип видно по первому файлу ещё до броска (картинка → «Фото», иначе — кружок)
    const t = e.dataTransfer.items?.[0]?.type ?? ''
    sel.value = null; Object.assign(drag, { on: true, item: newItem(t.startsWith('image/') ? 'photo' : 'video'), ox: 0, oy: 0, from: 'file' })
  }
  drag.x = e.clientX; drag.y = e.clientY
  const n = nearest(toWorld(e.clientX, e.clientY)); drag.over = n.near && !overToolbar(e.clientY); drag.to = n.i
}
function fileLeave(e) { if (!e.relatedTarget && drag.on && drag.from === 'file') Object.assign(drag, { on: false, item: null }) }
async function fileDrop(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  const files = [...e.dataTransfer.files].filter(kindOf), first = drag.item, w = toWorld(e.clientX, e.clientY), onRail = drag.over
  if (!files.length || !first) { Object.assign(drag, { on: false, item: null }); return say('Это не кружок и не фото', { text: 'Перетащите кружок из Telegram (видео) или фото.' }) }
  first.type = kindOf(files[0]); if (first.title === T.video.t || first.title === T.photo.t) first.title = T[first.type].t
  const extra = files.slice(1).map(f => newItem(kindOf(f)))
  if (onRail) {
    const list = order.value.slice(), at = list.findIndex(v => v.id === first.id)
    list.splice(at + 1, 0, ...extra); doc.items.splice(0, doc.items.length, ...list)
  } else [first, ...extra].forEach((x, k) => { x.x = Math.round(w.x + k * 90); x.y = Math.round(w.y); doc.loose.push(x) })
  Object.assign(drag, { on: false, item: null, over: false })
  const targets = [first, ...extra]
  for (let k = 0; k < files.length; k++) await attach(findAny(targets[k].id), files[k])
  sel.value = first.id; setProgress(doc.progress)
}
function dropCover(x) { dropRefs([x.file, x.media && 'idb:' + x.media]); delete x.file; delete x.media; delete x.ck; save() }
const play = (e, on) => { const v = e.currentTarget.querySelector('video'); if (v) on ? v.play().catch(() => {}) : v.pause() }

// ---------- Карточка выбранного ----------
const sel = ref(null), editing = ref(false)
watch(sel, (id) => { liveSend({ t: 'sel', id }); if (id) msel.value = []; chMenu.value = null })
const selItem = computed(() => findAny(sel.value))
const selLoose = computed(() => !!doc.loose.find(v => v.id === sel.value))
async function remove() {
  const x = selItem.value; if (!x) return
  dropRefs([x.file, x.media && 'idb:' + x.media, ...(x.steps ?? []).flatMap(stepRefs)])
  const a = doc.items.findIndex(v => v.id === x.id); if (a >= 0) doc.items.splice(a, 1)
  const b = doc.loose.findIndex(v => v.id === x.id); if (b >= 0) doc.loose.splice(b, 1)
  sel.value = null; setProgress(doc.progress); showToast('Удалено — Ctrl+Z, чтобы вернуть')
}
function toRailEnd() { const x = selItem.value; doc.loose.splice(doc.loose.findIndex(v => v.id === x.id), 1); delete x.x; delete x.y; doc.items.push(x); setProgress(doc.progress); nextTick(showRailEnd) }
// Переименование прямо на холсте, как в Figma: двойной клик по заданию / Enter у выделенного. Кружок и фото — двойной клик: другой файл.
const renaming = ref(null)
function rename(x) {
  if (!x) return
  if (MEDIA.includes(x.type)) return pickFile(x)
  renaming.value = x.id; editing.value = true
  nextTick(() => { const el = document.querySelector(`[data-ren="${x.id}"]`); el?.focus(); el?.select?.() })
}
function renameDone() { renaming.value = null; editing.value = false; save() }
const onKey = (e) => {
  if (dialog.open) return                                       // открыто окно подтверждения — клавиши его
  if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)) { if (e.key === 'Escape') e.target.blur(); return }
  if (e.key === 'Enter' && sel.value && !run.value) { e.preventDefault(); return rename(selItem.value) }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && !run.value) {          // V — стрелка, H — рука, P — маркер (как в Figma)
    if (e.code === 'KeyV') return setTool('select')
    if (e.code === 'KeyH') return setTool('hand')
    if (e.code === 'KeyP') return setTool('pen')
    if (e.code === 'Space') { e.preventDefault(); space.value = true; return }
  }
  if ((e.ctrlKey || e.metaKey) && !run.value && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); return e.code === 'KeyY' || e.shiftKey ? redo() : undo() }
  if ((e.ctrlKey || e.metaKey) && !run.value && (e.code === 'KeyC' || e.code === 'KeyV')) {
    const picked = msel.value.length || sel.value || pick.step       // что-то выделено на холсте — копируем его, а не случайно выделенный текст
    if (!picked && window.getSelection()?.toString()) return          // выделен текст — обычное копирование
    window.getSelection()?.removeAllRanges()
    e.preventDefault()
    return e.code === 'KeyC' ? doCopy() : doPaste()
  }
  if (e.key === 'Escape' && placing) return placeCancel()
  if (e.key === 'Escape' && placingItem) return itemPlaceCancel()
  if (e.key === 'Escape') { if (run.value) run.value = null; else { noteTool.value = false; sel.value = null; selectStep(null, null); noteSel.value = null; tray.value = null; msel.value = []; if (tool.value === 'pen') tool.value = 'select' } }
  if (run.value || !(e.key === 'Delete' || e.key === 'Backspace')) return
  doDelete()
}
// Копировать / вставить / удалить — общие для клавиш и правого меню
function doCopy() {
  const itemsSel = msel.value.filter(id => !id.startsWith('st:'))
  if (itemsSel.some(id => id.startsWith('oi:')) || itemsSel.some(id => findAny(id))) {     // выделены задания — копируем их (с экранами)
    const boxes = boxOf().filter(o => (o.k === 'oitem' || o.k === 'item') && itemsSel.includes(o.id)).sort((a, b) => a.y0 - b.y0)
    const other = boxes.find(o => o.k === 'oitem')
    return copyItems(boxes.filter(o => (other ? o.k === 'oitem' && o.course === other.course : o.k === 'item')).map(o => o.item ?? findAny(o.id)), other ? other.course : doc.id)
  }
  if (!msel.value.length && sel.value && findAny(sel.value)) return copyItems([findAny(sel.value)], doc.id)
  if (msel.value.some(id => id.startsWith('st:'))) {          // рамкой выделены экраны — копируем все (по порядку на холсте)
    const ss = boxOf().filter(o => o.k === 'step' && msel.value.includes(o.id)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    return copyStep(ss.map(o => o.s), ss[0].course)
  }
  if (opick.value && !pick.step) return copyStep(opick.value.s, opick.value.course)
  const L = findAny(pick.lesson); return copyStep(L?.steps?.find(v => v.id === pick.step))
}
function doPaste(at = null) {
  if (!clip.value) return
  if (clip.value.items) return pasteItems(at)
  const L = at ? null : pick.lesson ?? (selItem.value && INTERACTIVE.includes(selItem.value.type) ? selItem.value.id : activeLesson.value)
  if (!L) return pasteFree(at ?? lastW ?? toWorld(W.value / 2, H.value / 2))      // урок не выбран — экраны ложатся на доску (у мыши или где открыли меню)
  return pasteStep(L)
}
function doDelete() {
  if (msel.value.length) return delSelected()
  if (noteSel.value) delNote(noteSel.value)
  else if (pick.step && pick.step !== 'final') removeStepKey()
  else if (sel.value) remove()
}
const canCopy = computed(() => msel.value.some(id => id.startsWith('oi:') || id.startsWith('st:') || findAny(id)) || (!!sel.value && !!findAny(sel.value)) || (!!pick.step && pick.step !== 'final') || !!opick.value)
const canDelete = computed(() => msel.value.some(id => !id.startsWith('oi:') && !(id.startsWith('st:') && !id.startsWith('st:' + doc.id + ':'))) || !!noteSel.value || (!!pick.step && pick.step !== 'final') || !!sel.value)

// ---------- Правое меню, как в Figma ----------
const cm = ref(null)                                     // { x, y, w } — где открыто (экран) и точка холста для «Вставить сюда»
function onCtx(e) {
  if (run.value) return
  const t = e.target.closest?.('[data-sel]'), id = t?.dataset.sel
  if (id && !(isM(id) || sel.value === id || noteSel.value === id)) {          // нажали правой по невыделенному — выделяем его (как в Figma)
    if (id.startsWith('oi:')) { msel.value = [id]; sel.value = null }
    else if ((doc.notes ?? []).some(n => n.id === id)) { msel.value = []; sel.value = null; noteSel.value = id }
    else { msel.value = []; noteSel.value = null; selectStep(null, null); sel.value = id }
  }
  const w = toWorld(e.clientX, e.clientY)
  cm.value = { x: Math.min(e.clientX, innerWidth - 270), y: Math.min(e.clientY, innerHeight - 290), w }
}
const cmDo = (f) => { const w = cm.value?.w; cm.value = null; f(w) }
const cmClose = () => { cm.value = null }
onMounted(() => addEventListener('pointerdown', cmClose)); onUnmounted(() => removeEventListener('pointerdown', cmClose))
const ctrl = isMac ? '⌘' : 'Ctrl'
const onKeyUp = (e) => { if (e.code === 'Space') space.value = false }
onMounted(() => { addEventListener('keydown', onKey); addEventListener('keyup', onKeyUp) }); onUnmounted(() => { removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp) })

function exportJson() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })); a.download = 'course.json'; a.click()
}
async function reset() { if (!(await ask('Вернуть пример курса?', { text: 'Текущий черновик удалится.', ok: 'Вернуть', danger: true }))) return; Object.assign(doc, seed()); sel.value = null; selectStep(null, null); save(); nextTick(() => fit()) }
</script>

<template>
  <div class="ce" :class="{ dragging: drag.on }" @dragover="fileOver" @dragleave="fileLeave" @drop="fileDrop">
    <input ref="fileInput" type="file" :accept="pickKind === 'photo' ? 'image/*' : 'video/*'" multiple hidden @change="onPicked" />
    <div ref="board" class="board" :class="{ moving: sd.on, dragging: drag.on && drag.from === 'loose', placing: noteTool, hand: handOn, pen: tool === 'pen' && !handOn && !noteTool }" :style="[dots, tool === 'pen' && !handOn && !noteTool ? { cursor: penCursor } : null]" @pointerdown="boardDown" @pointermove="boardMove" @pointerup="boardUp" @pointercancel="boardUp" @pointerleave="ghost = null" @wheel="onWheel" @contextmenu.prevent="onCtx">
      <div class="world" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }">
        <div v-if="noteTool && ghost" class="note ghost" :style="{ left: ghost.x + 'px', top: ghost.y + 'px', background: noteColor }" />
        <!-- Рисунки маркером -->
        <svg class="ink"><path v-for="k in doc.ink ?? []" :key="k.id" :d="inkD(k.p)" :stroke="k.c" :stroke-width="k.w" :class="{ on: isM(k.id) }" /><path ref="liveInk" stroke-width="4" /></svg>
        <!-- Наверху — название курса-шаблона и прогресс, как в Busuu; от них вниз идёт рельс -->
        <div class="chead" :style="{ left: (layout[0]?.x ?? 0) + CH_X0 + 'px', top: railTail.y0 - 116 + 'px' }" @pointerdown.stop>
          <div class="cht"><input v-if="titleEdit" v-model="doc.title" class="rin big" data-ctitle @keydown.enter="titleEdit = false; save()" @keydown.esc="titleEdit = false" @blur="titleEdit = false; save()" /><b v-else title="Нажмите, чтобы переименовать курс" @click="editTitle">{{ doc.title || 'Курс' }}</b><small>шаблон</small></div>
          <div class="cpill"><svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg><b>{{ doc.progress }} из {{ tasksCount }}</b><span>·</span><b>{{ pct }}%</b></div>
        </div>
        <span class="rstart" :style="{ left: (layout[0]?.x ?? 0) + 'px', top: railTail.y0 + 'px' }" />
        <!-- стыки рельса: тянем главу — видно, куда её можно насадить; ближайший «магнитит» -->
        <template v-for="j in joints" :key="'j' + j.b">
          <span class="jnt" :class="{ hot: j.hot }" :style="{ left: j.x + 'px', top: j.y + 'px' }">{{ j.hot ? '🧲' : '' }}</span>
          <span v-if="j.hot" class="jseg" :style="{ left: j.x + 'px', top: j.y + 'px' }" /><span v-if="j.hot" class="jtip" :style="{ left: j.x + 34 + 'px', top: j.y + 'px' }">Глава встанет сюда</span>
        </template>
        <!-- выбранный урок — светлая строка во всю ширину плашки главы, как текущий урок в Busuu -->
        <div v-if="rowHl" class="rowhl" :style="rowHl" />
        <!-- выбранный урок — весь объект (кружок, ветка экранов, итог) в синей рамке; за пустое место рамки урок тянется целиком -->
        <div v-if="lessonBox" class="lsel" :style="lessonBox.style" @pointerdown.stop="startDrag($event, { item: lessonBox.x, from: lessonBox.from })"><i /><i /><i /><i /></div>
        <!-- Главы — блоками (подсветка из меню главы) -->
        <!-- нажали на плашку главы — выделяется вся глава (как объект); тянуть — едет целиком -->
        <div v-for="c in chapterBoxes" :key="'cb' + c.id" class="chapbox" :class="{ light: c.light, wide: c.w, off: findAny(c.id)?.hl === 'none', still: c.from === 'loose' }" :style="c.style" @pointerdown.stop="chapDown($event, c)" />
        <svg class="rail" :height="railBox.y1"><path :d="rail" class="r0" /><path :d="doneRail" class="r1" /></svg>
        <!-- Тянем главу / урок / чекпоинт мимо рельса — за курсором вся структура, как она ляжет (глава с уроком и чекпоинтом, у урока ветка с итогом) -->
        <div v-if="flyTree" class="ftree">
          <div v-if="flyBox" class="chapbox" :class="{ light: flyBox.light }" :style="flyBox.style" />
          <div v-for="g in flyTree" :key="'ft' + g.x.id">
            <div class="bead" :class="[g.x.type, 'todo', 's-r']" :style="beadStyle(g.x, g.p, colorOf(g.x))">
              <template v-if="g.x.type === 'unit'"><div class="uh"><b>{{ g.x.title }}<template v-if="g.x.sub">: {{ g.x.sub }}</template></b></div><div class="ubar"><em :style="badge(0)">0%</em></div></template>
              <template v-else><svg viewBox="0 0 24 24" class="ic" v-html="T[g.x.type].ic" /><em class="cap">{{ g.x.title }}<small>{{ T[g.x.type].t }}</small></em></template>
            </div>
            <LessonRail v-if="g.x.type !== 'unit'" :item="g.x" :x="g.p.x" :y="g.p.y" :to-world="toWorld" :resolve="resolveRef" :put-file="noop" :drop-files="noop" readonly />
          </div>
        </div>
        <!-- Вторые рельсы: экраны уроков, вправо от урока -->
        <LessonRail v-for="r in lessonRails" :key="'lr' + r.x.id" :item="r.x" :x="r.p.x" :y="r.p.y" :sel="pick.lesson === r.x.id ? pick.step : null" :to-world="toWorld"
          :resolve="resolveRef" :put-file="putStepFile" :drop-files="dropRefs" :up-pct="upPct"
          :can-paste="!!clip?.steps" @copy="copyStep" @paste="pasteStep(r.x.id, $event)"
          @focus="showPoint" @change="save" @height="railHs[r.x.id] = $event" @select="selectStep(r.x.id, $event)" @play="run = r.x.id" @add="sel = r.x.id; tray = 'inter'" :moving="sdMoving" @grab="grabStep" />
        <!-- Экраны прямо на доске (унесли с ветки или положили из «Интерактива») -->
        <LessonRail v-for="f in freeScreens" :key="'fs' + f.id" free :item="f" :x="f.x" :y="f.y" :sel="pick.lesson === f.id ? pick.step : null" :to-world="toWorld"
          :resolve="resolveRef" :put-file="putStepFile" :drop-files="dropRefs" :up-pct="upPct" :moving="sdMoving"
          @copy="copyStep" @change="save" @height="railHs[f.id] = $event" @select="selectStep(f.id, $event)" @grab="grabStep" />
        <!-- Тянем экраны: место на ветке, кружок урока, призраки карточек -->
        <!-- ветка урока: стыки между экранами; ближайший к экрану «магнитит» -->
        <template v-if="sd.on && sd.to && sd.to !== 'cancel' && sd.to.mark">
          <span v-for="g in sd.to.gaps" :key="'g' + g" class="jnt" :style="{ left: g + 'px', top: sd.to.mark.y + 24 + 'px' }" />
          <span class="jseg h" :style="{ left: sd.to.mark.x + 2 + 'px', top: sd.to.mark.y + 24 + 'px' }" />
          <span class="jnt hot" :style="{ left: sd.to.mark.x + 2 + 'px', top: sd.to.mark.y + 24 + 'px' }">🧲</span>
          <span class="jtip up" :style="{ left: sd.to.mark.x + 2 + 'px', top: sd.to.mark.y + 24 + 'px' }">Экран встанет сюда</span>
        </template>
        <div v-if="sd.on && sd.to?.bead" class="sdbead" :style="{ left: sd.to.bead.x + 'px', top: sd.to.bead.y + 'px' }" />
        <div v-for="g in sdGhost" :key="'g' + g.st.id" class="sdg" :style="{ left: g.left + 'px', top: g.top + 'px', '--c': KINDS[g.st.kind].c }">
          <div class="sdl"><span class="kc"><svg viewBox="0 0 24 24" v-html="KINDS[g.st.kind].ic" /></span><b>{{ KINDS[g.st.kind].t }}</b></div>
          <div class="sdc"><LessonPlayer embedded :steps="[g.st]" :start="0" :resolve="resolveRef" /></div>
        </div>
        <!-- «Все курсы»: соседние курсы справа (только смотреть, проходить и копировать) -->
        <template v-for="o in othersL" :key="'oc' + o.id">
          <div class="och" :style="{ left: o.ox - 46 + 'px', top: '-170px' }" title="Дважды — открыть этот курс в редакторе" @pointerdown.stop @dblclick.stop="openOther(o.id)"><b>{{ o.title }}</b><small>другой курс · смотреть и копировать экраны · дважды — открыть</small></div>
          <svg class="rail" :height="o.h"><path :d="o.path" class="r0" /></svg>
          <LessonRail v-for="(x, i) in o.items.filter(v => INTERACTIVE.includes(v.type) && v.steps?.length)" :key="'olr' + o.id + x.id" :item="x" :x="o.ox + o.L[o.items.indexOf(x)].x" :y="o.L[o.items.indexOf(x)].y"
            :sel="opick?.lesson === x.id ? opick.s.id : null" :to-world="toWorld" :resolve="resolveRef" :put-file="noop" :drop-files="noop" readonly
            @copy="copyStep($event, o.id)" @select="(sid) => { opick = sid && sid !== 'final' ? { course: o.id, lesson: x.id, s: x.steps.find(v => v.id === sid) } : null; if (sid) selectStep(null, null) }"
            @height="railHs['o' + o.id + x.id] = $event" @focus="showPoint" />
          <div v-for="(x, i) in o.items" :key="'ob' + o.id + x.id" :data-sel="'oi:' + o.id + ':' + x.id" class="bead ro" :class="[x.type, o.st[i], 's-' + o.L[i].side, { on: isM('oi:' + o.id + ':' + x.id) }]" :style="beadStyle(x, { x: o.ox + o.L[i].x, y: o.L[i].y }, colorOf(x, null))" @pointerdown.stop="msel = [($event.shiftKey ? msel : []), 'oi:' + o.id + ':' + x.id].flat(); sel = null; selectStep(null, null)" @dblclick.stop="openOther(o.id)" @pointerenter="play($event, true)" @pointerleave="play($event, false)">
            <div v-if="x.type === 'unit'" class="uh"><b>{{ x.title }}<template v-if="x.sub">: {{ x.sub }}</template></b></div>
            <template v-else>
              <!-- кружок и фото соседнего курса — тоже видно (файлы курса в хранилище) -->
              <video v-if="x.type === 'video' && x.file && mediaUrl({ file: x.file })" :src="mediaUrl({ file: x.file })" class="vid" muted loop playsinline preload="metadata" />
              <img v-else-if="x.type === 'photo' && x.file && mediaUrl({ file: x.file })" :src="mediaUrl({ file: x.file })" class="vid img" alt="" draggable="false" />
              <svg v-if="!MEDIA.includes(x.type) || !x.file || !mediaUrl({ file: x.file })" viewBox="0 0 24 24" class="ic" v-html="T[x.type].ic" />
              <em class="cap">{{ x.title }}<small>{{ [T[x.type].t, x.steps?.length ? screens(x.steps.length) : '', x.steps?.length ? `≈ ${lessonMin(x.steps)} мин` : ''].filter(Boolean).join(' · ') }}</small></em>
            </template>
          </div>
        </template>
        <!-- Рельс -->
        <div v-for="(x, i) in order" :key="x.id" :data-sel="x.id" class="bead" :class="[x.type, stateOf(x, i), 's-' + pos(i).side, { lift: drag.on && drag.item?.id === x.id, on: sel === x.id || isM(x.id), rsel: !!selColor[x.id] }]"
          :style="beadStyle(x, pos(i), colorOf(x, i))" @pointerdown.stop="startDrag($event, { item: x, from: 'rail' })" @dblclick.stop="rename(x)" @pointerenter="play($event, true)" @pointerleave="play($event, false)">
          <template v-if="x.type === 'unit'">
            <!-- меню главы, как в Figma: подсветка блока главы -->
            <div v-if="sel === x.id && !drag.on && renaming !== x.id" class="nbar chbar" :style="{ transform: `scale(${1 / view.z})` }" @pointerdown.stop @dblclick.stop>
              <button class="nb-i" title="Переименовать главу (Enter или двойной щелчок)" @click="rename(x)"><svg viewBox="0 0 24 24"><path d="M14.6 6.1l3.3 3.3" /><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z" /></svg></button>
              <i class="nb-s" />
              <div class="nb-g"><button class="nb-c" :class="{ open: chMenu === 'color' }" title="Цвет главы" @click="chMenu = chMenu === 'color' ? null : 'color'"><i :style="{ background: x.hlc ?? HL_DEF }" /><svg viewBox="0 0 24 24" class="dd"><path d="M7 10l5 5 5-5" /></svg></button>
                <div v-if="chMenu === 'color'" class="nb-pop sw hlsw"><button v-for="c in HL_COLORS" :key="c" :style="{ background: c }" :class="{ on: (x.hlc ?? HL_DEF) === c }" @click="setHlc(x, c)" /></div></div>
              <div class="nb-g"><button class="nb-t" :class="{ open: chMenu === 'op' }" title="Прозрачность плашки" @click="chMenu = chMenu === 'op' ? null : 'op'"><svg viewBox="0 0 24 24" class="opi"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" /></svg><small class="opv">{{ hlOp(x) }}%</small><svg viewBox="0 0 24 24" class="dd"><path d="M7 10l5 5 5-5" /></svg></button>
                <div v-if="chMenu === 'op'" class="nb-pop"><button v-for="v in HL_OP" :key="v" :class="{ on: hlOp(x) === v }" @click="setHlo(x, v)">{{ v === 100 ? 'Непрозрачная' : v + '%' }}</button></div></div>
              <i class="nb-s" />
              <button class="cbw" :class="{ on: hlHow(x) === 'rail' }" title="Подсветить только рельс главы: глава, уроки и чекпоинт" @click="setHl(x, 'rail')">Рельс</button>
              <button class="cbw" :class="{ on: hlHow(x) === 'wide' }" title="Подсветить всю главу — вместе с ветками экранов уроков" @click="setHl(x, 'wide')">С ветками</button>
              <button class="cbw" :class="{ on: hlHow(x) === 'none' }" title="Без подсветки" @click="setHl(x, 'none')">Без</button>
            </div>
            <div v-if="renaming === x.id" class="uh ren" @pointerdown.stop><input v-model="x.title" :data-ren="x.id" class="rin big" placeholder="Глава" @keydown.enter="renameDone" @keydown.esc="renameDone" @input="save" /><input v-model="x.sub" class="rin" placeholder="тема главы" @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="($event.relatedTarget?.classList?.contains('rin')) || renameDone()" @input="save" /></div>
            <div v-else class="uh"><b>{{ x.title }}<template v-if="x.sub">: {{ x.sub }}</template></b><button class="upen" title="Переименовать главу" @pointerdown.stop @click.stop="rename(x)"><svg viewBox="0 0 24 24"><path d="M14.6 6.1l3.3 3.3" /><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z" /></svg></button><svg v-if="chapterOf(i)?.tasks && chapterOf(i).pct === 100" viewBox="0 0 24 24" class="uok"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.3l3 3 6-6.5" /></svg></div>
            <div class="ubar"><i :style="{ width: (chapterOf(i)?.pct ?? 0) + '%' }" /><em :style="badge(chapterOf(i)?.pct ?? 0)">{{ chapterOf(i)?.pct ?? 0 }}%</em></div>
          </template>
          <template v-else>
            <video v-if="covK(x) === 'video' && mediaUrl(x)" :src="mediaUrl(x)" class="vid" muted loop playsinline preload="metadata" />
            <img v-else-if="covK(x) === 'photo' && mediaUrl(x)" :src="mediaUrl(x)" class="vid img" :class="{ round: x.ck }" alt="" draggable="false" />
            <template v-if="x.id in upPct"><svg class="upl" viewBox="0 0 88 88"><circle cx="44" cy="44" r="40" :style="{ strokeDasharray: 251, strokeDashoffset: 251 * (1 - upPct[x.id] / 100) }" /></svg><em class="upn">{{ upPct[x.id] }}%</em></template>
            <svg v-if="!covK(x) || !mediaUrl(x)" viewBox="0 0 24 24" class="ic" v-html="T[x.type].ic" />
            <svg v-if="stateOf(x, i) === 'done'" viewBox="0 0 24 24" class="ok"><circle cx="12" cy="12" r="11" /><path d="M7 12.3l3.2 3.2 6.3-6.8" /></svg>
            <em class="cap"><span v-if="stateOf(x, i) === 'current'" class="start">Сейчас</span><template v-if="renaming === x.id && !peekOf(x)"><input v-model="x.title" :data-ren="x.id" class="rin" placeholder="Название урока" @pointerdown.stop @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="($event.relatedTarget?.classList?.contains('rin')) || renameDone()" @input="save" /><input v-if="INTERACTIVE.includes(x.type)" v-model="x.sub" class="rin sub" placeholder="о чём урок, например: знакомство и приветствия" @pointerdown.stop @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="($event.relatedTarget?.classList?.contains('rin')) || renameDone()" @input="save" /></template>
              <template v-else>{{ x.title }}<span v-if="x.sub" class="csub">{{ x.sub }}</span></template><small>{{ [T[x.type].t, x.steps?.length ? screens(x.steps.length) : '', x.steps?.length ? `≈ ${lessonMin(x.steps)} мин` : ''].filter(Boolean).join(' · ') }}</small></em>
            <!-- обложка выбранного урока: фото или кружок, как в Busuu -->
            <div v-if="sel === x.id && BRANCH.includes(x.type) && !drag.on" class="cov" @pointerdown.stop @dblclick.stop>
              <button title="Переименовать (Enter или двойной щелчок)" @click="rename(x)"><svg viewBox="0 0 24 24"><path d="M14.6 6.1l3.3 3.3" /><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z" /></svg></button>
              <i class="cvs" />
              <button title="Фото на кружок урока (обрежем по кругу и сожмём)" @click="pickFile(x, 'photo')"><svg viewBox="0 0 24 24" v-html="T.photo.ic" /></button>
              <button title="Кружок (видео) на кружок урока" @click="pickFile(x, 'video')"><svg viewBox="0 0 24 24" v-html="T.video.ic" /></button>
              <button v-if="x.ck" class="rm" title="Убрать обложку" @click="dropCover(x)">✕</button>
            </div>
            <!-- карточка урока, как её увидит ученик (как в Busuu): тип, примерное время, «Поехали!» — пройти урок целиком -->
            <div v-if="peekOf(x)" class="lpv" @pointerdown.stop @dblclick.stop>
              <small>{{ T[x.type].t }} · ≈ {{ lessonMin(x.steps) }} мин</small>
              <!-- название и описание правятся прямо в карточке (карточка при этом не пропадает) -->
              <template v-if="renaming === x.id">
                <input v-model="x.title" :data-ren="x.id" class="rin lin" placeholder="Название урока" @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="($event.relatedTarget?.classList?.contains('rin')) || renameDone()" @input="save" />
                <input v-model="x.sub" class="rin lin sub" placeholder="о чём урок, например: знакомство и приветствия" @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="($event.relatedTarget?.classList?.contains('rin')) || renameDone()" @input="save" />
              </template>
              <template v-else>
                <b class="lpt" title="Нажмите, чтобы переименовать" @click="rename(x)">{{ x.title || T[x.type].t }}<svg viewBox="0 0 24 24"><path d="M14.6 6.1l3.3 3.3" /><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z" /></svg></b>
                <p v-if="x.sub" class="lps" title="Нажмите, чтобы изменить" @click="rename(x)">{{ x.sub }}</p>
              </template>
              <p>{{ screens(x.steps.length) }}<template v-if="x.steps.length > peekOf(x).length"> · не готово: {{ x.steps.length - peekOf(x).length }}</template></p>
              <button class="pgo" @click="goLesson(x)">Поехали!</button>
            </div>
          </template>
        </div>
        <!-- Черновики на холсте: ещё не на рельсе -->
        <div v-for="x in looseShown" :key="x.id" :data-sel="x.id" class="bead loose" :class="[x.type, { on: sel === x.id || isM(x.id), rsel: !!selColor[x.id] }]" :style="beadStyle(x, x, colorOf(x))"
          @pointerdown.stop="startDrag($event, { item: x, from: 'loose' })" @dblclick.stop="rename(x)" @pointerenter="play($event, true)" @pointerleave="play($event, false)">
          <template v-if="x.type === 'unit'">
            <!-- меню главы, как в Figma: подсветка блока главы -->
            <div v-if="sel === x.id && !drag.on && renaming !== x.id" class="nbar chbar" :style="{ transform: `scale(${1 / view.z})` }" @pointerdown.stop @dblclick.stop>
              <button class="nb-i" title="Переименовать главу (Enter или двойной щелчок)" @click="rename(x)"><svg viewBox="0 0 24 24"><path d="M14.6 6.1l3.3 3.3" /><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z" /></svg></button>
              <i class="nb-s" />
              <div class="nb-g"><button class="nb-c" :class="{ open: chMenu === 'color' }" title="Цвет главы" @click="chMenu = chMenu === 'color' ? null : 'color'"><i :style="{ background: x.hlc ?? HL_DEF }" /><svg viewBox="0 0 24 24" class="dd"><path d="M7 10l5 5 5-5" /></svg></button>
                <div v-if="chMenu === 'color'" class="nb-pop sw hlsw"><button v-for="c in HL_COLORS" :key="c" :style="{ background: c }" :class="{ on: (x.hlc ?? HL_DEF) === c }" @click="setHlc(x, c)" /></div></div>
              <div class="nb-g"><button class="nb-t" :class="{ open: chMenu === 'op' }" title="Прозрачность плашки" @click="chMenu = chMenu === 'op' ? null : 'op'"><svg viewBox="0 0 24 24" class="opi"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" /></svg><small class="opv">{{ hlOp(x) }}%</small><svg viewBox="0 0 24 24" class="dd"><path d="M7 10l5 5 5-5" /></svg></button>
                <div v-if="chMenu === 'op'" class="nb-pop"><button v-for="v in HL_OP" :key="v" :class="{ on: hlOp(x) === v }" @click="setHlo(x, v)">{{ v === 100 ? 'Непрозрачная' : v + '%' }}</button></div></div>
              <i class="nb-s" />
              <button class="cbw" :class="{ on: hlHow(x) === 'rail' }" title="Подсветить только рельс главы: глава, уроки и чекпоинт" @click="setHl(x, 'rail')">Рельс</button>
              <button class="cbw" :class="{ on: hlHow(x) === 'wide' }" title="Подсветить всю главу — вместе с ветками экранов уроков" @click="setHl(x, 'wide')">С ветками</button>
              <button class="cbw" :class="{ on: hlHow(x) === 'none' }" title="Без подсветки" @click="setHl(x, 'none')">Без</button>
            </div>
            <div v-if="renaming === x.id" class="uh ren" @pointerdown.stop><input v-model="x.title" :data-ren="x.id" class="rin big" placeholder="Глава" @keydown.enter="renameDone" @keydown.esc="renameDone" @input="save" /><input v-model="x.sub" class="rin" placeholder="тема главы" @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="($event.relatedTarget?.classList?.contains('rin')) || renameDone()" @input="save" /></div>
            <div v-else class="uh"><b>{{ x.title }}<template v-if="x.sub">: {{ x.sub }}</template></b><button class="upen" title="Переименовать главу" @pointerdown.stop @click.stop="rename(x)"><svg viewBox="0 0 24 24"><path d="M14.6 6.1l3.3 3.3" /><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z" /></svg></button><small class="nor">не на рельсе</small></div>
            <!-- прогресс главы, как в Busuu: сразу видна полоска (пока глава на доске — 0%) -->
            <div class="ubar"><i style="width: 0" /><em :style="badge(0)">0%</em></div>
          </template>
          <template v-else>
            <video v-if="covK(x) === 'video' && mediaUrl(x)" :src="mediaUrl(x)" class="vid" muted loop playsinline preload="metadata" />
            <img v-else-if="covK(x) === 'photo' && mediaUrl(x)" :src="mediaUrl(x)" class="vid img" :class="{ round: x.ck }" alt="" draggable="false" />
            <svg v-else viewBox="0 0 24 24" class="ic" v-html="T[x.type].ic" />
            <template v-if="x.id in upPct"><svg class="upl" viewBox="0 0 88 88"><circle cx="44" cy="44" r="40" :style="{ strokeDasharray: 251, strokeDashoffset: 251 * (1 - upPct[x.id] / 100) }" /></svg><em class="upn">{{ upPct[x.id] }}%</em></template>
            <em class="cap"><input v-if="renaming === x.id" v-model="x.title" :data-ren="x.id" class="rin" @pointerdown.stop @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="renameDone" @input="save" /><template v-else>{{ x.title }}</template><small>не на рельсе</small></em>
          </template>
        </div>
        <!-- Стикеры, как в FigJam -->
        <div v-for="n in doc.notes" :key="n.id" class="note" :data-note="n.id" :data-sel="n.id" :class="{ on: noteSel === n.id || isM(n.id), edit: noteEdit === n.id }" :ref="(el) => { if (el) noteH[n.id] = el.offsetHeight }" :style="{ left: n.x + 'px', top: n.y + 'px', background: n.color }"
          @pointerdown.stop="noteDown($event, n)" @dblclick.stop="editNote(n.id)" @wheel="noteEdit === n.id && !$event.ctrlKey && !$event.metaKey && $event.stopPropagation()">
          <div class="nt" :class="['sz-' + (n.sz || 's'), { hand: n.font === 'hand', b: n.b, st: n.st, list: n.list }]">
            <textarea v-if="noteEdit === n.id" v-model="n.text" placeholder="Напишите что угодно…" @input="save" @blur="noteEdit = null" @pointerdown.stop />
            <div v-else class="nv"><span v-if="!n.text" class="ph">Напишите что угодно…</span><p v-for="(l, k) in noteLines(n.text)" v-else :key="k"><template v-for="(x, j) in l" :key="j"><a v-if="x.url" :href="x.x" target="_blank" rel="noopener" @pointerdown.stop>{{ x.x }}</a><template v-else>{{ x.x }}</template></template><br v-if="!l.some(x => x.x)" /></p></div>
          </div>
          <small v-if="n.by && !n.nob" class="nby">{{ n.by }}</small>
          <!-- панель стикера, как в FigJam (размер панели не зависит от масштаба холста) -->
          <div v-if="noteSel === n.id && !isM(n.id)" class="nbar" :style="{ transform: `scale(${1 / view.z})` }" @pointerdown.stop @dblclick.stop>
            <div class="nb-g"><button class="nb-c" :class="{ open: nmenu === 'color' }" title="Цвет" @click="nmenu = nmenu === 'color' ? null : 'color'"><i :style="{ background: n.color }" /><svg viewBox="0 0 24 24" class="dd"><path d="M7 10l5 5 5-5" /></svg></button>
              <div v-if="nmenu === 'color'" class="nb-pop sw"><button v-for="c in NOTE_COLORS" :key="c" :style="{ background: c }" :class="{ on: n.color === c }" @click="n.color = c; nmenu = null; save()" /></div></div>
            <i class="nb-s" />
            <div class="nb-g"><button class="nb-t" title="Шрифт" @click="nmenu = nmenu === 'font' ? null : 'font'"><b :class="{ hand: n.font === 'hand' }">Aa</b><svg viewBox="0 0 24 24" class="dd"><path d="M7 10l5 5 5-5" /></svg></button>
              <div v-if="nmenu === 'font'" class="nb-pop"><button v-for="(t, k) in NOTE_FONTS" :key="k" :class="{ on: (n.font || '') === k, hand: k === 'hand' }" @click="k ? (n.font = k) : delete n.font; nmenu = null; save()">{{ t }}</button></div></div>
            <i class="nb-s" />
            <div class="nb-g"><button class="nb-t wide" title="Размер текста" @click="nmenu = nmenu === 'size' ? null : 'size'">{{ NOTE_SIZES[n.sz || 's'] }}<svg viewBox="0 0 24 24" class="dd"><path d="M7 10l5 5 5-5" /></svg></button>
              <div v-if="nmenu === 'size'" class="nb-pop"><button v-for="(t, k) in NOTE_SIZES" :key="k" :class="{ on: (n.sz || 's') === k }" @click="n.sz = k; nmenu = null; save()">{{ t }}</button></div></div>
            <i class="nb-s" />
            <button class="nb-i" :class="{ on: n.b }" title="Жирный" @click="noteToggle(n, 'b')"><svg viewBox="0 0 24 24"><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" /></svg></button>
            <button class="nb-i" :class="{ on: n.st }" title="Зачёркнутый" @click="noteToggle(n, 'st')"><svg viewBox="0 0 24 24"><path d="M4 12h16M16.5 7.5c-.6-1.6-2.3-2.5-4.5-2.5-2.8 0-4.5 1.4-4.5 3.3 0 1.2.7 2.1 2 2.7M7.5 16c.5 1.9 2.3 3 4.7 3 2.9 0 4.8-1.4 4.8-3.5 0-.6-.2-1.1-.5-1.5" /></svg></button>
            <button class="nb-i" title="Ссылка" @click="noteLink(n)"><svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg></button>
            <button class="nb-i" :class="{ on: n.list }" title="Список" @click="noteToggle(n, 'list')"><svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg></button>
            <i class="nb-s" />
            <button class="nb-i au" :class="{ on: !n.nob }" :title="n.nob ? 'Показать, кто поставил' : 'Скрыть, кто поставил'" @click="noteToggle(n, 'nob')"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14 17.5l5.5-5.5 1.8 1.8-5.5 5.5H14z" /></svg></button>
            <button class="nb-i" title="Удалить стикер" @click="delNote(n.id)"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg></button>
          </div>
        </div>
      </div>
      <!-- Рамка вокруг выделенного, с квадратиками по углам -->
      <div v-if="oneBox" class="selbox" :style="oneBox"><i /><i /><i /><i /></div>
      <div v-if="selBox" class="selbox" :style="selBox"><b v-if="canMask" class="selmask" title="Тяните — выделенное поедет вместе (на ветку, другой урок или по доске)" @pointerdown.stop.prevent="maskDown" /><i /><i /><i /><i /></div>
      <div v-if="mq" class="mq" :style="mqStyle" />
    </div>

    <!-- Курсоры коллег: стрелка их цвета и имя -->
    <div v-for="c in otherCursors" :key="c.cid + tick * 0" class="rcur" :style="{ transform: `translate(${toScreen(c).x}px, ${toScreen(c).y}px)`, '--rc': c.u.color }">
      <svg viewBox="0 0 16 16"><path d="M1 1l5.2 13.5 2-5.6L14 7z" /></svg><span>{{ c.u.name }}</span>
    </div>
    <!-- Взятое — за пальцем в масштабе холста; мимо рельса — полупрозрачное -->
    <div v-if="drag.on && !flyTree" class="fly" :class="[drag.item.type, { out: !drag.over }]" :style="{ left: drag.x - drag.ox * view.z + 'px', top: drag.y - drag.oy * view.z + 'px', '--c': T[drag.item.type].c, '--d': T[drag.item.type].d, transform: `scale(${view.z * 1.06})` }">
      <video v-if="drag.item.type === 'video' && mediaUrl(drag.item)" :src="mediaUrl(drag.item)" class="vid" muted />
      <img v-else-if="drag.item.type === 'photo' && mediaUrl(drag.item)" :src="mediaUrl(drag.item)" class="vid img" alt="" />
      <b v-else-if="drag.item.type === 'unit'" class="no">+</b><svg v-else viewBox="0 0 24 24" class="ic" v-html="T[drag.item.type].ic" />
    </div>


    <!-- «Пройти урок» — как ученик, во весь экран (как «Презентация» в Figma) -->
    <div v-if="runLesson" class="runov" @pointerdown.self="run = null"><div class="runbox"><LessonPlayer :steps="runLesson.steps ?? []" :resolve="resolveRef" closable @close="run = null" /></div></div>

    <!-- Сверху -->
    <div class="fl tl-panel">
      <BackButton to="Курсы" @click="goBack" /><i class="vs" />
      <input v-model="doc.title" class="ttl" aria-label="Название курса" @input="save" />
      <span class="sync" :class="sync" :title="{ local: 'Демо: курс хранится только в этом браузере', saving: 'Сохраняю на сервер…', saved: 'Сохранено на сервере', offline: 'Нет связи с сервером — копия в браузере, отправлю, когда появится сеть' }[sync]">{{ { local: 'в браузере', saving: 'сохраняю…', saved: 'сохранено', offline: 'нет сети' }[sync] }}</span>
    </div>
    <div class="fl tr-panel">
      <PresenceBar inline /><i v-if="live.on" class="vs" />
      <div class="seg"><button :class="{ on: mode === 'wave' }" @click="mode = 'wave'">Волна</button><button :class="{ on: mode === 'line' }" @click="mode = 'line'">Прямая</button></div><i class="vs" />
      <button class="allr" :class="{ on: allCourses }" title="Показать рядом остальные курсы — смотреть и копировать их экраны в этот (Ctrl+C / Ctrl+V)" @click="allCourses = !allCourses"><svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="7" height="16" rx="2" /><rect x="13.5" y="4" width="7" height="16" rx="2" /></svg>Все курсы</button><i class="vs" />
      <span class="pl">Прогресс<small>пример</small></span>
      <button class="sb" @click="setProgress(doc.progress - 1)">−</button><b class="pv">{{ doc.progress }} / {{ tasksCount }}</b><button class="sb" @click="setProgress(doc.progress + 1)">+</button>
      <i class="vs dk" /><button class="pill" @click="exportJson">Экспорт</button><button class="pill grey" @click="reset">Сброс</button>
    </div>
    <!-- Масштаб -->
    <div class="fl zoom"><button title="Отдалить" @click="zoomBtn(1 / 1.25)">−</button><b title="100%" @click="zoomAt(1 / view.z, W / 2, H / 2)">{{ Math.round(view.z * 100) }}%</b><button title="Приблизить" @click="zoomBtn(1.25)">+</button><i class="vs" /><button class="all" title="Показать весь курс" @click="fit()">Весь курс</button></div>

    <!-- Снизу: панель как в FigJam — группа, над ней ряд элементов -->
    <div v-if="tray" class="fl tray" :class="{ inter: tray === 'inter' }" role="toolbar" @pointerdown.stop>
      <!-- Задания — схемой, как они лягут: кружок урока, вправо ветка с экранами и итог (у чекпоинта — проверка и замок следующего юнита) -->
      <template v-if="tray === 'tasks'"><button v-for="k in TASKS" :key="k" class="ts" :title="T[k].t + ' — тяните на рельс, или нажмите и поставьте'" :style="{ '--c': T[k].c, '--d': T[k].d }" @pointerdown.prevent="startDrag($event, { type: k })">
        <svg class="sch" viewBox="0 0 160 70">
          <line x1="26" y1="22" x2="148" y2="22" class="sl" />
          <g v-for="j in 2" :key="j"><line :x1="21 + j * 36" y1="22" :x2="21 + j * 36" y2="31" class="st" /><rect :x="8 + j * 36" y="31" width="26" height="32" rx="4" class="sc" /><rect :x="13 + j * 36" y="36" width="16" height="3" rx="1.5" class="sb" /><rect :x="13 + j * 36" y="54" width="16" height="5" rx="2.5" class="sbb" /></g>
          <g class="sdots"><circle cx="117" cy="47" r="1.8" /><circle cx="123" cy="47" r="1.8" /><circle cx="129" cy="47" r="1.8" /></g>
          <template v-if="k === 'lesson'"><circle cx="144" cy="22" r="9" class="sf" /><path d="M140.5 19h7v2.6a3.5 3.5 0 0 1-7 0zM144 25v3M141.5 28.5h5" class="sfi" /></template>
          <template v-else><rect x="133" y="13" width="20" height="18" rx="5" class="slk" /><path d="M139 21v-2.5a4 4 0 0 1 8 0V21" class="slki" /><circle cx="143" cy="25" r="1.6" class="slkd" /></template>
          <circle cx="16" cy="22" r="13" class="sm" /><g transform="translate(6.5 12.5) scale(.8)" class="smi" v-html="T[k].ic" />
        </svg>
        <small><b>{{ T[k].t }}</b>{{ TASK_D[k] }}</small></button></template>
      <template v-else-if="tray === 'media'"><button v-for="k in MEDIA" :key="k" class="ti" :title="T[k].t + ' — тяните на рельс, или нажмите и поставьте'" :style="{ '--c': T[k].c }" @pointerdown.prevent="startDrag($event, { type: k })"><span class="tc" :class="k"><svg viewBox="0 0 24 24" v-html="T[k].ic" /></span><small>{{ T[k].t }}</small></button></template>
      <template v-else-if="tray === 'inter'">
        <span class="tt2">Тяните на ветку урока или на доску — или нажмите и поставьте</span>
        <!-- мини-окошки: как выглядит экран -->
        <button v-for="t in TPL" :key="t.id" class="mi" :title="t.id === 'lesson' ? 'Сразу 7 экранов-образцов: новые слова, выбор, пары, подсказка, «собери фразу»' : KINDS[t.kind].d" @pointerdown.prevent="trayDown($event, t.id)">
          <span class="mini" :class="t.id"><i class="mp" />
            <template v-if="t.id === 'intro'"><i class="mh" /><span class="mm"><i class="ma" /></span><i class="mw" /><i class="ml" /></template>
            <template v-else-if="t.id === 'choice'"><i class="mh" /><i class="ma" /><span class="mo"><i /><i class="g" /><i /></span></template>
            <template v-else-if="t.id === 'audiotest'"><i class="mh" /><span class="mm sm"><i class="ma" /></span><span class="mr"><i /><i class="g" /><i /></span></template>
            <template v-else-if="t.id === 'pairs'"><i class="mh" /><span class="mq"><i class="g" /><i class="g" /><i /><i /><i /><i /></span></template>
            <template v-else-if="t.id === 'order'"><i class="mh" /><i class="ma" /><span class="mc ln"><i /><i /></span><span class="mc"><i /><i /><i /></span></template>
            <template v-else-if="t.id === 'tip'"><i class="mh" /><i class="ml" /><i class="ml s" /><span class="mq t"><i /><i /><i /><i /></span></template>
            <template v-else-if="t.id === 'speak'"><i class="mh" /><span class="mm"><b class="cp" /></span><span class="mk"><i /><i class="b" /><i /></span></template>
            <template v-else-if="t.id === 'type'"><i class="mh" /><i class="ma" /><span class="mg"><i /><i class="d" /></span></template>
            <template v-else-if="t.id === 'fill'"><i class="mh" /><span class="mm sm" /><span class="mg"><i class="d" /></span><span class="mc"><i /><i class="o" /></span></template>
            <template v-else-if="t.id === 'answer'"><i class="mh" /><span class="mm sm" /><i class="mw" /><span class="mn"><i /><i /></span></template>
            <template v-else><span class="ms"><i /><i /><i /></span></template>
            <i class="mb" />
          </span>
          <small><b>{{ t.t }}</b>{{ t.d }}</small>
        </button>
      </template>
      <template v-else-if="tray === 'pen'"><button v-for="c in INK_COLORS" :key="c" class="sw pen" :class="{ on: inkColor === c }" :style="{ background: c }" title="Цвет маркера" @click="inkColor = c" /></template>
      <template v-else-if="tray === 'note'"><button v-for="c in NOTE_COLORS" :key="c" class="sw" :class="{ on: noteColor === c }" :style="{ background: c }" title="Цвет стикера — потом нажмите на холст" @click="noteColor = c; noteTool = true" /></template>
    </div>
    <!-- Правое меню, как в Figma -->
    <div v-if="cm" class="cmenu" :style="{ left: cm.x + 'px', top: cm.y + 'px' }" @pointerdown.stop @contextmenu.prevent>
      <button :disabled="!canCopy" @click="cmDo(doCopy)">Копировать<kbd>{{ ctrl }}+C</kbd></button>
      <button :disabled="!clip" @click="cmDo(() => doPaste())">Вставить<kbd>{{ ctrl }}+V</kbd></button>
      <button :disabled="!clip" :title="clip?.items ? 'Задания встанут черновиками там, где открыли меню' : 'Экраны лягут на доску там, где открыли меню'" @click="cmDo((w) => doPaste(w))">Вставить сюда</button>
      <i />
      <button :disabled="!canDelete" @click="cmDo(doDelete)">Удалить<kbd>Delete</kbd></button>
      <i />
      <button :disabled="!undoN" @click="cmDo(undo)">Отменить<kbd>{{ ctrl }}+Z</kbd></button>
      <button :disabled="!redoN" @click="cmDo(redo)">Повторить<kbd>{{ ctrl }}+Shift+Z</kbd></button>
    </div>
    <div class="fl tools" role="toolbar">
      <!-- Стрелка и рука, как в FigJam -->
      <div class="mode">
        <button class="md" :class="{ on: tool === 'select' && !space && !noteTool }" title="Выделение (V): тяните по пустому месту — рамка; Delete — удалить выделенное" @click="setTool('select')"><svg viewBox="0 0 24 24"><path d="M5.2 4.2l14 6.4-6.2 1.9-2.3 6.3z" /></svg></button>
        <button class="md" :class="{ on: handOn }" title="Рука (H или зажатый пробел): двигать холст" @click="setTool('hand')"><svg viewBox="0 0 24 24"><path d="M8 12.5V6.2a1.4 1.4 0 0 1 2.8 0V11M10.8 10.5V4.9a1.4 1.4 0 0 1 2.8 0v5.6M13.6 10.5V5.9a1.4 1.4 0 0 1 2.8 0V12M16.4 9.4a1.4 1.4 0 0 1 2.8 0v4.8a6.3 6.3 0 0 1-6.3 6.3h-.6a6 6 0 0 1-4.7-2.3l-3-3.9a1.5 1.5 0 0 1 2.2-2l1.2 1.1" /></svg></button>
      </div>
      <i class="tsep" />
      <!-- Маркер: выезжает, как в FigJam -->
      <button class="marker" :class="{ on: tool === 'pen' }" title="Маркер (P): рисовать на холсте" @click="setTool(tool === 'pen' ? 'select' : 'pen')"><span class="mk"><i :style="{ background: inkColor }" /></span></button>
      <!-- Стикер, как в FigJam: выезжает при наведении, выбран — стоит выше -->
      <button class="sticky" :class="{ on: noteTool || tray === 'note' }" title="Стикер — выберите цвет и нажмите на холст" @click="tray = tray === 'note' ? null : 'note'; noteTool = tray === 'note'; if (tool === 'pen') tool = 'select'">
        <span class="sk back" :style="{ background: noteColor }" /><span class="sk" :style="{ background: noteColor }" />
      </button>
      <i class="tsep" />
      <button class="tb" :title="'Глава — сразу с уроком и чекпоинтом; тяните на рельс, или нажмите и поставьте'" @pointerdown.prevent="startDrag($event, { type: 'unit' })"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="M7.5 10h9M7.5 14h5" /></svg><small>Глава</small></button>
      <button v-for="g in GROUPS.filter(g => g.k !== 'note')" :key="g.k" class="tb" :class="{ on: tray === g.k }" :style="{ '--c': g.c }" @click="tray = tray === g.k ? null : g.k; noteTool = false; if (tool === 'pen') tool = 'select'"><svg viewBox="0 0 24 24" v-html="g.ic" /><small>{{ g.t }}</small></button>
    </div>
  </div>
</template>

<style scoped>
.ce { position: fixed; inset: 0; z-index: 30; background: #f5f5f5; user-select: none; -webkit-user-select: none; font-family: var(--font) }
.ce.dragging, .ce.dragging * { cursor: grabbing !important }
/* Холст: бесконечное поле в точку; содержимое — в координатах холста (центр рельса — x = 0) */
.board { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; background-image: radial-gradient(circle, #cfcfcf 1px, transparent 1.3px) }
.board:active { cursor: grabbing }
.board.hand, .board.hand:active { cursor: grab } .board.hand:active { cursor: grabbing } .board.hand .world { pointer-events: none }
.board.pen .world { pointer-events: none }
.board:not(.hand):not(.placing):not(.pen) { cursor: default }
.ink { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; z-index: 5 }
.ink path { fill: none; stroke-linecap: round; stroke-linejoin: round } .ink path.on { filter: drop-shadow(0 0 2px #0d99ff) drop-shadow(0 0 1px #0d99ff) }
.mq { position: absolute; z-index: 20; border: 1.5px solid #0d99ff; background: rgba(13, 153, 255, .12); pointer-events: none }
.selbox { position: absolute; z-index: 19; border: 2px solid #0d99ff; pointer-events: none }
.selmask { position: absolute; inset: 0; pointer-events: auto; cursor: grab; background: rgba(13, 153, 255, .04) } .selmask:active { cursor: grabbing }
.selbox i { position: absolute; width: 12px; height: 12px; box-sizing: border-box; border: 2px solid #0d99ff; border-radius: 3px; background: #fff }
.selbox i:nth-of-type(1) { left: -7px; top: -7px } .selbox i:nth-of-type(2) { right: -7px; top: -7px } .selbox i:nth-of-type(3) { left: -7px; bottom: -7px } .selbox i:nth-of-type(4) { right: -7px; bottom: -7px }
/* стрелка и рука на панели */
.mode { display: flex; gap: 4px; padding: 0 2px }
.md { display: grid; place-items: center; width: 54px; height: 54px; border: 0; border-radius: 13px; background: none; color: #2c2c2c; cursor: pointer; padding: 0 } .md:hover { background: #f2f2f2 }
.md svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round }
.md.on { background: #9747ff; color: #fff }
/* маркер, как в FigJam: торчит из панели, выбран — выше */
.marker { position: relative; align-self: stretch; width: 60px; border: 0; background: none; padding: 0; cursor: pointer; clip-path: inset(-80px -20px 0 -20px) }   /* сверху вылезает на холст, снизу прячется в панель */
.mk { position: absolute; left: 50%; top: 26px; width: 24px; height: 130px; margin-left: -12px; border-radius: 6px 6px 3px 3px; background: linear-gradient(90deg, #fafafa, #fff 40%, #e9e9e9); box-shadow: 0 2px 6px rgba(0, 0, 0, .18); transition: top .18s ease }
.mk::before { content: ''; position: absolute; left: 3px; right: 3px; top: -14px; height: 16px; background: #2b2b2b; clip-path: polygon(30% 0, 70% 0, 100% 100%, 0 100%) }
.mk i { position: absolute; left: 50%; top: -20px; width: 6px; height: 8px; margin-left: -3px; border-radius: 3px 3px 0 0 }
.marker:hover .mk { top: 10px } .marker.on .mk { top: -14px }
.sw.pen { border-radius: 50% }
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
.vid { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--c); pointer-events: none; background: #000 }
.bead.video.todo .vid { filter: grayscale(1); opacity: .6; box-shadow: 0 0 0 3px #fff, 0 0 0 5px #d6d6d6 }
.ic.badge { position: absolute; right: -4px; bottom: -4px; width: 22px; height: 22px; padding: 3px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 2px #fff; box-sizing: border-box; stroke-width: 3 }
.bead.video:has(.vid) { background: transparent; box-shadow: none }
/* Фото: скруглённый квадрат с миниатюрой (кружок — круглый, фото — нет: сразу видно, что где) */
.bead.photo { width: 76px; height: 76px; margin: -38px 0 0 -38px; border-radius: 20px; overflow: visible }
.vid.img { border-radius: 18px } .vid.img.round { border-radius: 50% } .bead.photo:has(.img) { background: transparent; box-shadow: none }
.bead.photo.todo .img { filter: grayscale(1); opacity: .6; box-shadow: 0 0 0 3px #fff, 0 0 0 5px #d6d6d6 }
.bead.photo .upl { inset: -6px } .fly.photo { border-radius: 20px }
.pbig { display: block; width: 100%; max-height: 220px; object-fit: contain; border-radius: 12px; background: var(--surface) }
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
.btn-l { display: flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 9px; padding: 8px; background: var(--blue-l); color: var(--blue-d); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.btn-l svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round }
.ilb { position: absolute; right: -6px; top: -6px; min-width: 22px; height: 22px; padding: 0 5px; box-sizing: border-box; border-radius: 11px; background: var(--blue); box-shadow: 0 0 0 2px #fff; color: #fff; font-size: 12px; font-weight: 900; font-style: normal; display: grid; place-items: center; pointer-events: none }
.bead.todo .ilb { background: #b9b9b9 }
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
.rcur { position: fixed; left: 0; top: 0; z-index: 40; pointer-events: none; transition: transform .08s linear }
.rcur svg { width: 18px; height: 18px; fill: var(--rc); stroke: #fff; stroke-width: 1.4; stroke-linejoin: round; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .25)) }
.rcur span { position: absolute; left: 14px; top: 16px; padding: 2px 7px; border-radius: 6px 6px 6px 2px; background: var(--rc); color: #fff; font-size: 11px; font-weight: 800; white-space: nowrap }
.bead.rsel::after { content: ''; position: absolute; inset: -9px; border: 3px solid var(--rc); border-radius: inherit; pointer-events: none }
.bead.rsel:not(.tutor):not(.photo)::after { border-radius: 50% }
.sync { font-size: 11px; font-weight: 800; border-radius: 6px; padding: 2px 7px; white-space: nowrap; color: var(--hint); background: var(--surface) }
.sync.saved { color: var(--green-d); background: var(--green-l) } .sync.offline { color: var(--red-d); background: var(--red-l) } .sync.local { color: var(--purple-d); background: #f1e6ff }
.upl { position: absolute; inset: -6px; pointer-events: none; transform: rotate(-90deg) } .upl circle { fill: none; stroke: var(--c); stroke-width: 4; stroke-linecap: round; transition: stroke-dashoffset .2s }
.upn { position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); font-size: 11px; font-weight: 900; color: var(--c); font-style: normal; pointer-events: none }
.badge-local { font-size: 11px; font-weight: 700; color: var(--purple-d); background: #f1e6ff; border-radius: 6px; padding: 2px 7px; white-space: nowrap }
.ib { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 10px; background: none; cursor: pointer } .ib:hover { background: var(--surface) }
.ib svg { width: 20px; height: 20px; fill: none; stroke: var(--text); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
.tr-panel { right: 14px; top: 14px; display: flex; align-items: center; gap: 4px; padding: 6px 6px 6px 12px }
.pl { display: grid; font-size: 12px; font-weight: 800; line-height: 1.15; margin-right: 6px } .pl small { font-size: 10px; color: var(--hint); font-weight: 700 }
.sb { width: 30px; height: 30px; border: 0; border-radius: 8px; background: var(--surface); font: inherit; font-size: 17px; font-weight: 800; cursor: pointer }
.pv { min-width: 52px; text-align: center; font-size: 14px; color: var(--green-d) }
.vs { width: 1px; height: 24px; margin: 0 6px; background: var(--border) }
.pill { border: 0; border-radius: 9px; padding: 7px 12px; background: var(--blue); color: #fff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer } .pill.grey { background: var(--surface); color: var(--hint) }
.zoom { right: 14px; bottom: 124px; display: flex; align-items: center; padding: 4px } .zoom button { min-width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 18px; font-weight: 700; cursor: pointer } .zoom button:hover { background: var(--surface) }
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
/* ===== Стиль как в Busuu: тонкая линия, кружки с кольцом и галочкой снизу, юнит — светлая «глава» с прогрессом ===== */
.r0 { stroke: #dedede; stroke-width: 4 } .r1 { stroke: #1fbe78; stroke-width: 4 }
.chapbox { position: absolute; z-index: 0; box-sizing: border-box; border-radius: 26px; pointer-events: none; transition: left .22s ease, top .22s ease, width .22s ease, height .22s ease }
.lsel { position: absolute; z-index: 1; box-sizing: border-box; border: calc(2px * var(--k)) solid #0d99ff; cursor: grab; background: rgba(13, 153, 255, .03) } .lsel:active { cursor: grabbing }
.lsel i { position: absolute; width: calc(12px * var(--k)); height: calc(12px * var(--k)); box-sizing: border-box; border: calc(2px * var(--k)) solid #0d99ff; border-radius: calc(3px * var(--k)); background: #fff }
.lsel i:nth-child(1) { left: calc(-7px * var(--k)); top: calc(-7px * var(--k)) } .lsel i:nth-child(2) { right: calc(-7px * var(--k)); top: calc(-7px * var(--k)) } .lsel i:nth-child(3) { left: calc(-7px * var(--k)); bottom: calc(-7px * var(--k)) } .lsel i:nth-child(4) { right: calc(-7px * var(--k)); bottom: calc(-7px * var(--k)) }
.chead { position: absolute; z-index: 2; display: grid; gap: 12px; cursor: default }
.cht { display: flex; align-items: center; gap: 10px; white-space: nowrap } .cht b { font-size: 34px; font-weight: 900; cursor: text } .cht .rin.big { width: 380px; font-size: 30px }
.cht small { padding: 2px 8px; border-radius: 7px; background: #ececec; color: #7a7f87; font-size: 12px; font-weight: 800 }
.cpill { display: flex; align-items: center; gap: 8px; width: 380px; box-sizing: border-box; padding: 11px 14px; border: 1.5px solid #e2e2e2; border-radius: 14px; background: #fff; font-size: 16px }
.cpill svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round } .cpill span { color: var(--hint) }
.rstart { position: absolute; z-index: 1; width: 22px; height: 22px; margin: -11px; border-radius: 50%; background: #d6d6d6; box-shadow: 0 0 0 5px #f4f4f4 }
.jnt { position: absolute; z-index: 25; width: 34px; height: 34px; margin: -17px; box-sizing: border-box; border-radius: 50%; border: 2.5px dashed #aeb5bd; background: #f4f4f4; display: grid; place-items: center; font-size: 17px; pointer-events: none }
.jnt.hot { border: 2.5px solid #0d99ff; background: #0d99ff; box-shadow: 0 0 0 7px rgba(13, 153, 255, .2), 0 0 0 14px rgba(13, 153, 255, .08) }
.jseg { position: absolute; z-index: 24; width: 8px; height: 90px; margin: -45px 0 0 -4px; border-radius: 4px; background: #0d99ff; box-shadow: 0 0 12px rgba(13, 153, 255, .5); pointer-events: none } .jseg.h { width: 90px; height: 8px; margin: -4px 0 0 -45px }
.jtip { position: absolute; z-index: 26; transform: translateY(-50%); padding: 4px 10px; border-radius: 8px; background: #0d99ff; color: #fff; font-size: 13px; font-weight: 800; white-space: nowrap; pointer-events: none } .jtip.up { transform: translate(-50%, -150%) }
.rowhl { position: absolute; z-index: 1; border-radius: 22px; background: #eef4fd; pointer-events: none }
.chapbox { pointer-events: auto; cursor: default } .chapbox.still, .board.moving .chapbox { transition: none } .chapbox.off { background: none !important; box-shadow: none !important }
.chapbox { background: color-mix(in srgb, var(--hc) var(--ho, 8%), transparent); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--hc) 38%, transparent) }
.chapbox.light { background: color-mix(in srgb, #fff var(--ho, 85%), transparent); box-shadow: inset 0 0 0 1.5px #e3e3e3, 0 2px 10px rgba(0, 0, 0, .04) }
.chbar .nb-pop:not(.sw) { top: auto; bottom: calc(100% + 8px) }          /* списки меню главы открываются вверх — внизу выделение главы */
.upen { flex: none; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: none; color: #8a9099; cursor: pointer; opacity: 0; transition: opacity .15s } .upen svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.bead.unit:hover .upen, .bead.unit.on .upen { opacity: 1 } .upen:hover { background: rgba(0, 0, 0, .06); color: #252a31 }
.uh.ren { display: grid; gap: 4px } .uh.ren .rin { border: 0; border-bottom: 2px solid #0d99ff; border-radius: 0; background: transparent; padding: 0 2px } .uh.ren .rin.big { font-size: 20px; font-weight: 900 } .uh.ren .rin:not(.big) { font-size: 14px; font-weight: 600; color: #4b5563 }
.opi { width: 18px; height: 18px; fill: none; stroke: #fff; stroke-width: 1.8 } .opi path { fill: #fff; stroke: none } .opv { font-size: 13px; font-weight: 700; color: #fff; min-width: 34px; text-align: left }
.hlsw { grid-template-columns: repeat(8, 32px) } .hlsw button[style*="#ffffff"] { box-shadow: inset 0 0 0 1.5px #ccc }
.bead.unit.on { z-index: 30; outline: none }          /* выбранная глава — рамка вокруг всей главы, без второй рамки у названия */ .nor { flex: none; padding: 1px 7px; border-radius: 6px; background: #fff4c2; color: #8a6d00; font-size: 11px; font-weight: 800 }          /* меню главы — поверх соседних карточек */
.nbar.chbar { bottom: calc(100% + 50px); gap: 4px; padding: 0 8px; z-index: 40 }
.cbw { height: 34px; padding: 0 10px !important; border-radius: 8px; font-size: 13px !important; font-weight: 700 } .cbw:hover:not(:disabled) { background: #383838 } .cbw.on { background: #383838; box-shadow: inset 0 0 0 1.5px #0d99ff } .cbw:disabled { opacity: .35; cursor: default }
.chap { position: absolute; z-index: 0; box-sizing: border-box; border: 1px solid #e3e3e3; border-radius: 22px; background: #fff; pointer-events: none }
.chap.full { border-color: #1fbe78; background: #f2fbf7 }
.bead { width: 56px; height: 56px; margin: -28px 0 0 -28px; color: #fff; background: var(--c); box-shadow: 0 0 0 3px #fff, 0 0 0 6px #1fbe78 }
.bead:hover { transform: none; filter: brightness(1.04) }
.bead.todo { background: #f1f1f1; color: #b7b7b7; box-shadow: 0 0 0 3px #fff, 0 0 0 6px #e2e2e2 } .bead.todo .cap { color: var(--text) }
.bead.current { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 12px color-mix(in srgb, var(--c) 18%, transparent); animation: softpulse 2.4s ease-in-out infinite }
/* текущий урок — мягко «дышит», как в Busuu */
@keyframes softpulse { 0%, 100% { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 9px color-mix(in srgb, var(--c) 24%, transparent) } 50% { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 17px color-mix(in srgb, var(--c) 7%, transparent) } }
.bead.tutor { border-radius: 50% }
.ic { width: 26px; height: 26px; stroke-width: 2 }
.ok { position: absolute; left: 50%; bottom: -12px; width: 22px; height: 22px; margin-left: -11px; pointer-events: none; z-index: 2 }
.ok circle { fill: #1fbe78; stroke: #fff; stroke-width: 2 } .ok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.cap { left: calc(100% + 22px); width: 190px; gap: 2px; font-size: 15px; font-weight: 800; color: #252a31 }
.cap small { font-size: 12.5px; font-weight: 600; color: #6b7280 }
.csub { font-size: 13.5px; font-weight: 500; color: #3b4048; line-height: 1.3 }      /* описание урока — как в Busuu: под жирным названием обычным шрифтом */
.rin.sub { font-size: 13px; font-weight: 500 } .lpv .lps { margin: -2px 0 0; font-size: 15px; font-weight: 500; opacity: 1 }
.bead.s-l .cap { right: calc(100% + 22px) }
.start { margin-bottom: 4px; padding: 2px 8px; border-radius: 6px; background: var(--c); color: #fff; font-size: 10px; box-shadow: none }
/* юнит: заголовок главы и полоска прогресса */
.bead.unit { width: auto; height: auto; margin: -40px 0 0 -46px; display: grid; gap: 10px; place-items: stretch; padding: 0; border-radius: 0; background: none !important; box-shadow: none !important; color: #252a31; cursor: grab; outline-offset: 10px }
.bead.unit.todo { box-shadow: none } .bead.unit .sign, .bead.unit .no { display: none }
.uh { display: flex; align-items: center; gap: 8px; width: 360px; white-space: nowrap }
.uh b { font-size: 20px; font-weight: 900; overflow: hidden; text-overflow: ellipsis }
.uok { flex: none; width: 22px; height: 22px } .uok circle { fill: #1fbe78 } .uok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.ubar { position: relative; width: 370px; height: 10px; border-radius: 6px; background: #e6e6e6 } .ubar i { display: block; height: 100%; border-radius: 6px; background: #1fbe78; transition: width .25s }
.ubar em { position: absolute; top: 50%; transform: translate(-50%, -50%); padding: 1px 7px; border-radius: 8px; background: #1fbe78; color: #fff; font-size: 11px; font-weight: 900; font-style: normal }
.board.moving :deep(.lr *), .board.dragging :deep(.lr *) { transition: none } .board.moving .bead, .board.dragging .bead.loose { transition: transform .12s, opacity .15s }       /* тянем выделение — ветки едут вместе с кружками, без запаздывания */
.ftree { opacity: .75; pointer-events: none } .ftree * { pointer-events: none !important }
.ftree .bead, .ftree :deep(.lr *) { transition: none !important }          /* призрак главы / урока — ровно за курсором, без подъезда */
.bead.unit.lift { outline: 2px dashed #1fbe78; background: #fff !important }
.fly.unit { width: 50px; height: 50px; margin: -25px 0 0 -25px; background: #1fbe78; box-shadow: 0 10px 20px rgba(0, 0, 0, .2) }
/* сводка курса — плоско */
.sum { box-shadow: none; border: 1px solid #e3e3e3 } .pp { background: #e3fbef; color: #128a55 } .bar i { background: #1fbe78 } .dt { background: #1fbe78 }
.bead.loose { box-shadow: 0 0 0 3px #f5f5f5, 0 0 0 5px color-mix(in srgb, var(--c) 55%, transparent) }
.hint-l { margin: 0; font-size: 12px; color: var(--hint); font-weight: 600 }
/* «Пройти урок» */
.lpv { position: absolute; left: 50%; top: calc(100% + 22px); z-index: 30; width: 270px; margin-left: -34px; display: grid; gap: 5px; padding: 16px 16px 16px; border-radius: 16px; background: var(--c); color: #fff; text-align: left; cursor: default; box-shadow: 0 10px 26px rgba(0, 0, 0, .18); white-space: normal }
.lpv::before { content: ''; position: absolute; left: 24px; top: -9px; border: 10px solid transparent; border-top: 0; border-bottom-color: var(--c) }
.lpv small { font-size: 11px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; opacity: .85 }
.lpv b { font-size: 18px; font-weight: 900; line-height: 1.2 } .lpv p { margin: 0 0 6px; font-size: 13px; font-weight: 600; opacity: .9 }
.pgo { padding: 11px; border: 0; border-radius: 12px; background: #fff; color: var(--d); font: inherit; font-size: 15px; font-weight: 900; cursor: pointer; box-shadow: 0 3px 0 rgba(0, 0, 0, .12) }
.pgo:active { transform: translateY(2px); box-shadow: none }
.sdmark { position: absolute; z-index: 20; width: 6px; margin-left: -3px; border-radius: 3px; background: var(--blue, #2aabee); box-shadow: 0 0 0 3px rgba(42, 171, 238, .25); pointer-events: none }
.sdbead { position: absolute; z-index: 20; width: 96px; height: 96px; margin: -48px 0 0 -48px; border-radius: 50%; border: 4px dashed var(--blue, #2aabee); pointer-events: none }
.sdg { position: absolute; z-index: 30; width: 460px; pointer-events: none; opacity: .95 }
.sdl { display: flex; align-items: center; gap: 6px; height: 34px; font-size: 13px; color: #555 } .sdl b { font-weight: 800 }
.sdl .kc { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--c); color: #fff } .sdl .kc svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.sdc { overflow: hidden; border-radius: 22px; background: #fff; box-shadow: 0 0 0 2px var(--c), 0 18px 40px rgba(0, 0, 0, .2) }
.runov { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .45) }
.runbox { width: min(560px, 100%); height: min(820px, 96vh); border-radius: 22px; overflow: hidden; background: #fff }
/* Стикеры */
.note { position: absolute; z-index: 4; width: 240px; min-height: 240px; display: flex; box-sizing: border-box; padding: 16px; border-radius: 2px; box-shadow: 0 1px 2px rgba(0, 0, 0, .08), 0 2px 8px rgba(0, 0, 0, .06); cursor: grab; touch-action: none }
.note.ghost { opacity: .6; pointer-events: none; z-index: 9; box-shadow: none }
.nt { flex: 1; display: flex; min-width: 0 }
.nt textarea, .nv { flex: 1; min-height: 140px; margin: 0; padding: 0; border: 0; background: none; resize: none; outline: none; font: inherit; color: #2b2b2b; line-height: 1.3; overflow-wrap: anywhere }
.nt textarea { pointer-events: auto; cursor: text }
.nv p { margin: 0 } .nv .ph { color: rgba(0, 0, 0, .38) } .nv a { color: #0d69d9; text-decoration: underline; pointer-events: auto; cursor: pointer }
.nt textarea::placeholder { color: rgba(0, 0, 0, .38) }
.nt.sz-s textarea, .nt.sz-s .nv { font-size: 16px } .nt.sz-m textarea, .nt.sz-m .nv { font-size: 22px } .nt.sz-l textarea, .nt.sz-l .nv { font-size: 30px; line-height: 1.15 }
.nt textarea, .nv { font-weight: 500 } .nt.b textarea, .nt.b .nv { font-weight: 800 } .nt.st textarea, .nt.st .nv { text-decoration: line-through }
.nt.hand textarea, .nt.hand .nv, .hand { font-family: 'Comic Sans MS', 'Marker Felt', 'Segoe Print', cursive }
.nt.list .nv p::before { content: '• ' } .nt.list .nv p:has(br:only-child)::before { content: '' }
.nby { position: absolute; left: 16px; bottom: 12px; font-size: 12px; font-weight: 600; color: rgba(0, 0, 0, .55); pointer-events: none }
.note { padding-bottom: 34px }
.note.on { outline: 3px solid #a5d6fb; outline-offset: 0 }
.note.edit textarea { pointer-events: auto; cursor: text } .note.edit { cursor: default }
.nbar { position: absolute; left: 50%; bottom: calc(100% + 22px); translate: -50% 0; transform-origin: 50% 100%; display: flex; align-items: center; gap: 2px; height: 48px; padding: 0 8px; border-radius: 12px; background: #1e1e1e; box-shadow: 0 4px 14px rgba(0, 0, 0, .25); white-space: nowrap; cursor: default; z-index: 20 }
.nbar button { border: 0; background: none; color: #fff; font: inherit; cursor: pointer; padding: 0 }
.nb-g { position: relative }
.nb-c, .nb-t { display: flex; align-items: center; gap: 4px; height: 36px; padding: 0 8px; border-radius: 8px } .nb-c:hover, .nb-t:hover, .nb-i:hover { background: #383838 }
.nb-c i { width: 22px; height: 22px; border-radius: 50% } .nb-t b { font-size: 17px; font-weight: 500 } .nb-t.wide { min-width: 120px; justify-content: space-between; font-size: 14px; font-weight: 600 }
.dd { width: 14px; height: 14px; fill: none; stroke: #bbb; stroke-width: 2; stroke-linecap: round }
.nb-s { width: 1px; height: 28px; margin: 0 6px; background: #3d3d3d }
.nb-i { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px } .nb-i.on:not(.au) { background: #383838 }
.nb-i svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round }
.nb-i.au { color: #bbb } .nb-i.au.on { background: #9747ff; color: #fff }
.nb-pop { position: absolute; left: 0; top: calc(100% + 8px); display: grid; gap: 2px; min-width: 150px; padding: 6px; border-radius: 10px; background: #1e1e1e; box-shadow: 0 6px 18px rgba(0, 0, 0, .3) }
.nb-pop button { padding: 8px 10px; border-radius: 6px; text-align: left; font-size: 14px; font-weight: 600 } .nb-pop button:hover { background: #383838 } .nb-pop button.on { background: #0d99ff }
.nb-pop.sw { top: auto; bottom: calc(100% + 14px); left: -12px; width: max-content; height: 58px; box-sizing: border-box; align-items: center; grid-template-columns: repeat(10, 32px); min-width: 0; gap: 8px; padding: 12px 14px; border-radius: 14px }
.nb-pop.sw button { width: 32px; height: 32px; padding: 0; border-radius: 50% } .nb-pop.sw button:hover { filter: brightness(.95) } .nb-pop.sw button.on { box-shadow: 0 0 0 3px #1e1e1e, 0 0 0 5px #9747ff }
.nb-c.open { background: #383838 }
/* Нижняя панель как в FigJam — крупно */
.tools { height: 84px; padding: 0 10px; gap: 4px; border-radius: 20px }
.tb { display: grid; justify-items: center; gap: 4px; width: 92px; padding: 10px 0 8px; border: 0; border-radius: 14px; background: none; font: inherit; color: #2c2c2c; cursor: pointer; touch-action: none }
.tb:hover { background: #f2f2f2 } .tb.on { background: #e5f4ff; color: #0d99ff }
.tb svg { width: 32px; height: 32px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round }
.tb small { font-size: 13px; font-weight: 800 }
.tsep { width: 1px; height: 50px; margin: 0 6px; background: #e6e6e6 }
/* стикер на панели: торчит снизу, при наведении выезжает */
.sticky { position: relative; align-self: stretch; width: 96px; border: 0; background: none; padding: 0; cursor: pointer; clip-path: inset(-80px -20px 0 -20px) }
.sticky::before { content: ''; position: absolute; left: 6px; right: 6px; top: 8px; bottom: 8px; border-radius: 12px; background: transparent; transition: background .15s }
.sticky::before { display: none }
.sk { position: absolute; left: 14px; top: 18px; width: 64px; height: 70px; border-radius: 2px; box-shadow: 0 1px 2px rgba(0, 0, 0, .1), 0 4px 10px rgba(0, 0, 0, .12); transform: rotate(-3deg); transition: top .18s ease, transform .18s ease }
.sk.back { left: 22px; top: 24px; transform: rotate(4deg); filter: brightness(.95) }
.sticky:hover .sk { top: 8px } .sticky:hover .sk.back { top: 14px } .sticky.on .sk { top: -2px; transform: rotate(-1deg) } .sticky.on .sk.back { top: 6px; transform: rotate(5deg) }
.board.placing, .board.placing * { cursor: none !important }
.tray { left: 50%; bottom: 116px; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 8px 10px; border-radius: 18px; animation: tray .14s ease-out; max-width: calc(100vw - 16px); overflow-x: auto; scrollbar-width: none }
@keyframes tray { from { opacity: 0; transform: translate(-50%, 6px) } }
.ts { display: grid; justify-items: center; gap: 4px; width: 190px; padding: 10px 8px 8px; border: 0; border-radius: 14px; background: none; font: inherit; cursor: grab; touch-action: none; flex: none } .ts:hover { background: #f2f2f2 }
.sch { width: 170px; height: 74px; border-radius: 10px; background: #fafafa; box-shadow: inset 0 0 0 1px #ececec }
.sch .sl { stroke: #dcdcdc; stroke-width: 4; stroke-linecap: round } .sch .st { stroke: #dcdcdc; stroke-width: 1.5 }
.sch .sdots { fill: #c8c8c8 } .sch .sc { fill: #fff; stroke: #d6d6d6; stroke-width: 1.2 } .sch .sb { fill: #e3e3e3 } .sch .sbb { fill: #9fd3ff }
.sch .sm { fill: var(--c); stroke: #fff; stroke-width: 2.5 } .sch .smi { fill: none; stroke: #fff; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
.sch .sf { fill: var(--yellow, #ffc800) } .sch .sfi { fill: none; stroke: #fff; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round }
.sch .slk { fill: #c9c9c9 } .sch .slki { fill: none; stroke: #c9c9c9; stroke-width: 2.2 } .sch .slkd { fill: #fff }
.ts small { display: grid; gap: 1px; font-size: 11.5px; font-weight: 600; color: var(--hint); text-align: center; line-height: 1.25 } .ts small b { font-size: 14px; font-weight: 800; color: #2c2c2c }
.cov { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: #1e1e1e; box-shadow: 0 6px 18px rgba(0, 0, 0, .25); z-index: 31 }
.cov button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: none; color: #fff; cursor: pointer; font: inherit; font-size: 13px } .cov button:hover { background: #3a3a3a }
.cov svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round } .cov .rm { color: #ff8f8f } .cvs { width: 1px; margin: 6px 2px; background: #444 }
.rin.lin { width: 100%; box-sizing: border-box; padding: 4px 8px; border: 2px solid rgba(255, 255, 255, .75); border-radius: 8px; background: rgba(255, 255, 255, .18); color: #fff; font-size: 18px; font-weight: 900 }
.rin.lin::placeholder { color: rgba(255, 255, 255, .7) } .rin.lin:focus { border-color: #fff; background: rgba(255, 255, 255, .26) }
.rin.lin.sub { font-size: 14px; font-weight: 500 } .lpv .lps { cursor: text }
.lpt { display: flex; align-items: center; gap: 6px; cursor: text } .lpt svg { flex: none; width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; opacity: .7 } .lpt:hover svg { opacity: 1 }
.ti { display: grid; justify-items: center; gap: 5px; width: 92px; padding: 8px 0 6px; border: 0; border-radius: 12px; background: none; font: inherit; cursor: pointer; touch-action: none; flex: none }
.ti.wide { width: 116px } .ti:hover { background: #f2f2f2 }
.tc { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: #fff; background: var(--c) }
.tc svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2.1; stroke-linecap: round; stroke-linejoin: round }
.ti small { font-size: 13px; font-weight: 800; color: #2c2c2c; white-space: nowrap }
.tt2 { padding: 0 10px; font-size: 13px; font-weight: 800; color: var(--hint); max-width: 130px; line-height: 1.25 }
.cmenu { position: fixed; z-index: 60; display: grid; min-width: 250px; padding: 8px; border-radius: 14px; background: #1e1e1e; box-shadow: 0 10px 30px rgba(0, 0, 0, .3); color: #fff }
.cmenu button { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 7px 12px; border: 0; border-radius: 7px; background: none; color: #fff; font: inherit; font-size: 14px; font-weight: 600; text-align: left; cursor: pointer }
.cmenu button:hover:not(:disabled) { background: #0d99ff } .cmenu button:disabled { color: #6f6f6f; cursor: default }
.cmenu kbd { font: inherit; font-size: 13px; font-weight: 600; color: #bdbdbd } .cmenu button:hover:not(:disabled) kbd { color: #fff } .cmenu button:disabled kbd { color: #5a5a5a }
.cmenu i { height: 1px; margin: 6px 4px; background: #383838 }
.allr { display: flex; align-items: center; gap: 5px; height: 32px; padding: 0 11px; border: 1px solid var(--border); border-radius: 9px; background: #fff; font: inherit; font-size: 13px; font-weight: 800; color: var(--hint); cursor: pointer; white-space: nowrap }
.allr svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round } .allr:hover { background: var(--surface) }
.och { position: absolute; z-index: 3; display: grid; gap: 2px; padding: 10px 14px; border: 1px dashed #c9c9c9; border-radius: 12px; background: #fff; white-space: nowrap; cursor: default }
.och b { font-size: 22px; font-weight: 900 } .och small { font-size: 12px; font-weight: 700; color: var(--hint) }
.bead.ro { cursor: default } .bead.ro:hover { transform: none }
.allr.on { background: var(--blue-l); border-color: var(--blue); color: var(--blue-d) }
.tray.inter { display: grid; grid-template-columns: auto repeat(6, 124px); gap: 2px 4px; overflow: visible } .tray.inter .tt2 { grid-row: span 2 }
.tray.inter .mini { width: 112px; height: 86px; padding: 6px 9px 16px; gap: 4px; overflow: hidden } .tray.inter .mi { width: 124px; gap: 5px; padding: 6px 4px 4px; align-self: start }
.tray.inter .mini .mb { right: 6px; bottom: 5px; width: 26px; height: 7px } .tray.inter .mini.lesson { overflow: visible } .tray.inter .mini .ms { transform: scale(.82); transform-origin: top center }
.tray.inter .mi small { font-size: 10.5px; line-height: 1.2 } .tray.inter .mi small b { font-size: 12.5px }
.mini .mm { position: relative; display: block } .mini .mm .ma { position: absolute; left: 8%; right: 8%; bottom: 3px; width: auto; height: 5px; background: #1a73e8 } .mini .mm.sm { height: 24px }
.mini .mr { display: grid; gap: 3px; width: 100% } .mini .mr i { height: 7px; border: 1px solid #e3e3e3; background: #fff } .mini .mr i.g { background: #8ff0c8; border-color: #5fe0aa }
.mini .mc { display: flex; gap: 3px; justify-content: center; width: 100% } .mini .mc i { width: 18px; height: 8px; border: 1px solid #d5d5d5; background: #fff } .mini .mc i.o { border-color: #1a73e8 }
.mini .mc.ln { justify-content: flex-start; padding-bottom: 3px; border-bottom: 1.5px solid #e3e3e3 }
.mini .ml.s { width: 60% } .mini .mq.t { gap: 0 } .mini .mq.t i { height: 7px; border-radius: 0 }
.mini .cp { position: absolute; left: 50%; bottom: 3px; width: 26px; height: 5px; margin-left: -13px; border-radius: 2px; background: rgba(0, 0, 0, .55) }
.mini .mk { display: flex; gap: 6px; align-items: center } .mini .mk i { width: 9px; height: 9px; border-radius: 50%; border: 1px solid #c9dcfb; background: #fff } .mini .mk i.b { width: 13px; height: 13px; background: #1a73e8; border-color: #1a73e8 }
.mini .mg { display: flex; gap: 4px; align-items: flex-end; justify-content: center; width: 100%; margin-top: 3px } .mini .mg i { width: 28px; height: 5px; background: #cfcfcf } .mini .mg i.d { width: 26px; height: 2px; background: none; border-bottom: 2px dotted #1a73e8; border-radius: 0 }
.mini .mn { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; width: 100% } .mini .mn i { height: 8px; border: 1px solid #1a73e8; border-radius: 5px; background: #fff }
.mi { flex: none; display: grid; justify-items: center; gap: 7px; width: 168px; padding: 8px 6px 6px; border: 0; border-radius: 14px; background: none; font: inherit; cursor: pointer }
.mi:hover { background: #f2f2f2 } .mi:hover .mini { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(0, 0, 0, .12) }
.mi small { display: grid; gap: 1px; font-size: 12px; font-weight: 600; color: var(--hint); text-align: center } .mi small b { font-size: 14px; font-weight: 800; color: #2c2c2c }
/* мини-окошко экрана */
.mini { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; width: 150px; height: 104px; box-sizing: border-box; padding: 8px 12px; border: 1px solid #e3e3e3; border-radius: 10px; background: #fff; transition: transform .15s, box-shadow .15s }
.mini i { display: block; border-radius: 3px; background: #e9e9e9 }
.mini .mp { width: 60px; height: 4px; background: linear-gradient(90deg, #1fbe78 45%, #e6e6e6 45%) }
.mini .mh { width: 70px; height: 5px; background: #cfcfcf }
.mini .mm { width: 100%; height: 30px; border-radius: 5px; background: #8fb8e8 } .mini .mw { width: 90%; height: 10px; background: #e6f0ff } .mini .ml { width: 80%; height: 4px }
.mini .ma { width: 100%; height: 8px; border-radius: 5px; background: #1cb0f6 }
.mini .mo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; width: 100% } .mini .mo i { height: 30px; border: 1px solid #e3e3e3; background: #f4f4f4 } .mini .mo i.g { background: #8ff0c8; border-color: #5fe0aa }
.mini .mq { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; width: 100% } .mini .mq i { height: 11px; border: 1px solid #e3e3e3; background: #fff } .mini .mq i.g { background: #8ff0c8; border-color: #5fe0aa }
.mini .mb { position: absolute; right: 8px; bottom: 7px; width: 34px; height: 9px; border-radius: 5px; background: #1cb0f6 }
.mini.lesson { background: none; border: 0; padding: 4px } .mini.lesson .mp, .mini.lesson .mb { display: none }
.mini .ms { position: relative; width: 120px; height: 90px } .mini .ms i { position: absolute; width: 84px; height: 62px; border: 1px solid #e3e3e3; border-radius: 8px; background: #fff; box-shadow: 0 2px 5px rgba(0, 0, 0, .08) }
.mini .ms i:nth-child(1) { left: 0; top: 0; background: linear-gradient(#fff 20%, #8fb8e8 20% 60%, #fff 60%) } .mini .ms i:nth-child(2) { left: 18px; top: 13px; background: linear-gradient(#fff 35%, #8ff0c8 35% 70%, #fff 70%) } .mini .ms i:nth-child(3) { left: 36px; top: 26px; background: radial-gradient(circle at 50% 40%, #ffc800 12px, #fff 13px) }
.sw { flex: none; width: 30px; height: 30px; margin: 4px; border: 1px solid rgba(0, 0, 0, .12); border-radius: 50%; cursor: pointer; padding: 0 } .sw:hover { transform: scale(1.1) }
.sw.on { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #7b61ff }
@media (max-width: 719px) {
  .tools { left: 8px; right: 8px; transform: none; height: 72px; justify-content: center } .tb { width: 64px } .tb svg { width: 26px; height: 26px } .tb small { font-size: 11px } .sticky { width: 72px } .sk { left: 12px; width: 48px; height: 48px } .sk.back { left: 17px } .tray { bottom: 92px } .tsep { display: none }
}
.rin { pointer-events: auto; width: 100%; margin: 0; padding: 2px 6px; border: 2px solid #0d99ff; border-radius: 6px; background: #fff; font: inherit; font-size: 15px; font-weight: 800; color: #252a31; outline: none; user-select: text }
.uh.ren { display: grid; gap: 4px } .rin.big { font-size: 20px; font-weight: 900 }
</style>

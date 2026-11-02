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
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import BackButton from '../../components/BackButton.vue'
import { useRouter, useRoute } from 'vue-router'
import { API, apiRequest, fb, isDemo } from '../../firebase'
import { showToast } from '../../composables/useToast'
import { live, liveSend, setWhere, onLive } from '../../composables/useLive'
import PresenceBar from '../../components/PresenceBar.vue'
import LessonRail from '../../components/LessonRail.vue'
import LessonPlayer from '../../components/LessonPlayer.vue'
import { INTERACTIVE, KINDS, KIND_LIST, STEPS_MAX, RAIL_H, fishStep, fishLesson, stepsOut, keepLocalFiles, stepRefs } from '../../utils/lesson'
import { audSrc, imgSrc } from '../../composables/useCardMedia'

const router = useRouter(), route = useRoute()
const goBack = () => router.push({ name: 'path' })            // назад — в «Курсы»
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
  photo:  { t: 'Фото', c: '#ff6fb1', d: '#e0478f', ic: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8"/>' },
  reward: { t: 'Награда', c: 'var(--yellow)', d: 'var(--yellow-d)', ic: '<path d="M8 4.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5v.8A3.7 3.7 0 0 0 8 11M16 6.5h3.5v.8A3.7 3.7 0 0 1 16 11"/><path d="M12 14v4M8.5 20h7"/>' },
}
const CHECK = '<path d="M6 12.5l4 4 8-9"/>'
const PALETTE = ['unit', 'video', 'photo', 'lesson', 'words', 'hw', 'test', 'tutor', 'reward']
const MEDIA = ['video', 'photo']                         // задания с файлом (кружок, фото) — файл в S3, ключ в поле file
const TASKS = PALETTE.filter(k => k !== 'unit' && !MEDIA.includes(k))
const UNIT_COLORS = [['var(--green)', 'var(--green-d)'], ['var(--purple)', 'var(--purple-d)'], ['var(--blue)', 'var(--blue-d)'], ['var(--orange)', 'var(--orange-d)']]

let seq = Date.now() % 100000
const uid = () => 'i' + (++seq)
const it = (type, title, extra = {}) => ({ id: uid(), type, title, ...extra })
const seed = () => ({
  title: 'Базовый курс A1', progress: 5, mode: 'line',
  items: [
    it('unit', 'Юнит 1', { sub: 'Present Simple' }),
    it('lesson', 'Глагол to be'), it('words', 'Слова: семья'), it('hw', 'Упражнения 1–5'), it('lesson', 'Отрицания'), it('tutor', 'Разговор с репетитором'), it('test', 'Тест юнита'), it('reward', 'Сундук'),
    it('unit', 'Юнит 2', { sub: 'Past Simple' }),
    it('lesson', 'Правильные глаголы'), it('words', 'Слова: путешествия'), it('lesson', 'Неправильные глаголы'), it('hw', 'Рассказ о выходных'), it('test', 'Тест юнита'),
  ],
  loose: [it('words', 'Слова: еда', { x: -320, y: 120 }), it('lesson', 'Артикли a / the', { x: -320, y: 250 })], notes: [],
})
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v?.items) return { loose: [], notes: [], ...v } } catch { /* нет */ } return seed() }
const doc = reactive(load())
let st = 0
if (!doc.id) doc.id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const save = () => {
  if (remote) return                       // это пришло от коллеги — не сохраняем и не пересылаем обратно
  doc.dirty = true
  clearTimeout(st); st = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(doc)) } catch { /* приватный режим */ } }, 250)
  push(); share()
}

// ---------- Вместе в реальном времени (useLive): курс, курсоры и выделение коллег ----------
// Курс после правки уходит коллегам в этом же курсе через ~0,1 с (сохраняет в базу тот, кто правил). Одновременные правки:
// побеждает последняя — поэтому выбранное коллегой подсвечено его цветом.
let remote = false, shareT = 0
const cleanNote = (n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y), text: n.text ?? '', color: n.color })
const payload = () => ({ title: doc.title, mode: doc.mode, progress: doc.progress, items: doc.items.map(x => clean(x)), loose: doc.loose.map(x => clean(x, true)), notes: (doc.notes ?? []).map(cleanNote) })
function share() { clearTimeout(shareT); shareT = setTimeout(() => liveSend({ t: 'doc', doc: payload() }), 120) }
const offDoc = onLive('doc', ({ doc: d }) => {
  if (!d || !Array.isArray(d.items)) return
  const local = new Map([...doc.items, ...doc.loose].map(x => [x.id, x]))
  const keep = (x) => ({ ...x, ...(local.get(x.id)?.media && !x.file ? { media: local.get(x.id).media } : {}), ...(x.steps ? { steps: keepLocalFiles(x.steps, local.get(x.id)?.steps) } : {}) })
  remote = true
  Object.assign(doc, { title: d.title, mode: d.mode, progress: d.progress, items: d.items.map(keep), loose: (d.loose ?? []).map(keep), notes: d.notes ?? [], dirty: false })
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
const clean = (x, loose) => ({ id: x.id, type: x.type, title: x.title ?? '', ...(x.sub != null ? { sub: x.sub } : {}), ...(x.file ? { file: x.file } : {}), ...(INTERACTIVE.includes(x.type) && x.steps?.length ? { steps: stepsOut(x.steps) } : {}), ...(loose ? { x: x.x, y: x.y } : {}) })
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
  items: [it('unit', 'Юнит 1', { sub: 'Тема юнита' })], loose: [], notes: [], dirty: false })
const fromServer = (c) => {
  const local = new Map([...doc.items, ...doc.loose].map(x => [x.id, x]))       // локальные видео (ещё не в S3) не теряем
  const keep = (x) => ({ ...x, ...(local.get(x.id)?.media && !x.file ? { media: local.get(x.id).media } : {}), ...(x.steps ? { steps: keepLocalFiles(x.steps, local.get(x.id)?.steps) } : {}) })
  Object.assign(doc, { id: c.id, title: c.title, mode: c.mode, progress: c.progress, items: c.items.map(keep), loose: c.loose.map(keep), notes: c.notes ?? [], dirty: false })
  localStorage.setItem(KEY, JSON.stringify(doc)); sync.value = 'saved'
}
const flush = () => apiRequest(`/courses/${doc.id}`, { method: 'PUT', body: JSON.stringify(payload()) }).then(r => { if (r.ok) doc.dirty = false })
onMounted(async () => {
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
    if (!MEDIA.includes(x.type) || x.file || !x.media) continue
    const b = await mediaOp('readonly', s => s.get(x.media)).catch(() => null)
    if (b) await upload(x, b instanceof File ? b : new File([b], x.type === 'photo' ? 'photo.jpg' : 'kruzhok.mp4', { type: b.type || (x.type === 'photo' ? 'image/jpeg' : 'video/mp4') }))
  }
  for (const x of [...doc.items, ...doc.loose]) for (const s of x.steps ?? []) {          // файлы экранов уроков
    const slots = [...['image', 'audio', 'video'].map(f => [f, null]), ...(s.opts ?? []).flatMap((_, k) => [['image', k], ['audio', k]])]
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
  const id = `m${sid}_${field}${opt ?? ''}_${Date.now().toString(36)}`
  try { await mediaOp('readwrite', s => s.put(file, id)) } catch { return alert('Не удалось сохранить файл в браузере (мало места?).') }
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
function dropRefs(refs) {
  for (const v of refs) {
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
const activeLesson = computed(() => pick.lesson ?? (selItem.value && INTERACTIVE.includes(selItem.value.type) && !selLoose.value ? selItem.value.id : null))
const lessonRails = computed(() => order.value.map((x, i) => ({ x, p: pos(i) })).filter(({ x }) => INTERACTIVE.includes(x.type) && !(drag.on && drag.item?.id === x.id) && (x.steps?.length || x.id === activeLesson.value)))
function selectStep(lessonId, stepId) { pick.lesson = stepId ? lessonId : null; pick.step = stepId; if (stepId) sel.value = null }
// «Интерактив» на панели: экран — в выбранный урок; ничего не выбрано — новый урок в конец рельса
// Экран добавляется «рыбой» — готовым образцом, который сразу можно пройти, а потом поправить (карандаш); kind 'lesson' — целый урок-образец
function addScreen(kind) {
  let L = activeLesson.value ? findAny(activeLesson.value) : null
  if (!L) { L = it('lesson', 'Урок', { steps: [] }); doc.items.push(L) }
  if (!Array.isArray(L.steps)) L.steps = []
  const add = kind === 'lesson' ? fishLesson() : [fishStep(kind)]
  if (L.steps.length + add.length > STEPS_MAX) return alert(`В уроке не больше ${STEPS_MAX} экранов`)
  L.steps.push(...add); const st = add[0]; tray.value = null
  selectStep(L.id, st.id); setProgress(doc.progress)
  nextTick(() => { const i = order.value.findIndex(v => v.id === L.id); if (i >= 0) showPoint({ x: pos(i).x + 230 + (L.steps.length - 1) * 92, y: pos(i).y + 200 }) })
}
function showPoint(w) { const p = toScreen(w); if (p.x < 40 || p.x > W.value - 300 || p.y < 90 || p.y > H.value - 140) animView({ ...view, x: view.x - (p.x - W.value / 2), y: view.y - (p.y - H.value / 2 + 60) }, true) }
function removeStepKey() {
  const L = findAny(pick.lesson), s = L?.steps?.find(v => v.id === pick.step); if (!s) return
  const files = stepRefs(s)
  if (files.some(f => !f.startsWith('https://')) && !confirm('Удалить экран? Его видео, фото и звук удалятся из хранилища.')) return
  L.steps.splice(L.steps.indexOf(s), 1); dropRefs(files); selectStep(null, null); save()
}
const run = ref(null)                                             // «Пройти урок» — урок целиком, как ученик (как «Презентация» в Figma)
const runLesson = computed(() => (run.value ? findAny(run.value) : null))

// ---------- Нижняя панель как в FigJam: группа → ряд элементов над панелью ----------
const tray = ref(null)                                            // открытая группа: 'tasks' | 'media' | 'inter' | 'note'
const GROUPS = [
  { k: 'tasks', t: 'Задания', ic: T.lesson.ic, c: 'var(--green)' },
  { k: 'media', t: 'Медиа', ic: T.video.ic, c: '#2aabee' },
  { k: 'inter', t: 'Интерактив', ic: KINDS.choice.ic, c: 'var(--purple)' },
  { k: 'note', t: 'Стикер', ic: '<path d="M5 4.5h14v10l-4.5 4.5H5z"/><path d="M14.5 19v-4.5H19"/>', c: '#f5b400' },
]
const NOTE_COLORS = ['#ffffff', '#e6e6e6', '#ffc4b8', '#ffd6a8', '#ffe99a', '#c7efc4', '#bdeee9', '#c4e1ff', '#ddd0ff', '#ffc9e6']
const noteColor = ref('#ffe99a'), noteTool = ref(false)            // как в FigJam: выбрали стикер — нажатие по холсту ставит его

// ---------- Стикеры, как в FigJam ----------
const noteSel = ref(null), noteEdit = ref(null)
function addNote(color, at) {
  const r = board.value.getBoundingClientRect(), w = at ?? toWorld(r.left + r.width / 2, r.top + r.height / 2)
  const n = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), x: Math.round(w.x - 95), y: Math.round(w.y - 95), text: '', color }
  noteTool.value = false
  ;(doc.notes ??= []).push(n); tray.value = null; noteSel.value = n.id; save()
  nextTick(() => editNote(n.id))
}
function editNote(id) { noteEdit.value = id; noteSel.value = id; nextTick(() => document.querySelector(`[data-note="${id}"] textarea`)?.focus()) }
let nm = null
function noteDown(e, n) {
  if (noteEdit.value === n.id) return
  sel.value = null; selectStep(null, null); noteSel.value = n.id
  const w = toWorld(e.clientX, e.clientY); nm = { n, dx: w.x - n.x, dy: w.y - n.y, moved: false }
  addEventListener('pointermove', noteMove); addEventListener('pointerup', noteUp, { once: true })
}
function noteMove(e) { if (!nm) return; sendCursor(e); const w = toWorld(e.clientX, e.clientY); nm.n.x = Math.round(w.x - nm.dx); nm.n.y = Math.round(w.y - nm.dy); nm.moved = true }
function noteUp() { removeEventListener('pointermove', noteMove); if (nm?.moved) save(); nm = null }
function delNote(id) { const i = doc.notes.findIndex(n => n.id === id); if (i >= 0) doc.notes.splice(i, 1); noteSel.value = noteEdit.value = null; save() }
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
  const ps = [...layout.value, ...doc.loose.map(l => ({ x: l.x, y: l.y })), ...(doc.notes ?? []).map(n => ({ x: n.x + 100, y: n.y + 100 })),
    ...lessonRails.value.map(({ x, p }) => ({ x: p.x + 230 + ((x.steps?.length ?? 0) + 1) * 92 - 150, y: p.y }))]
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
const railHs = reactive({})                  // фактическая высота экранов урока (сообщает LessonRail)
const hasRail = (x) => INTERACTIVE.includes(x?.type) && !!x.steps?.length
const layoutOf = (list) => {
  let y = 0
  return list.map((x, i) => {
    if (i) {                                     // под урок с экранами — место во всю высоту его экранов (без прокрутки)
      const gap = x.type === 'unit' ? G.unitGap : G.step, prev = list[i - 1]
      y += hasRail(prev) ? Math.max(gap, 40 + (railHs[prev.id] ?? RAIL_H) + (x.type === 'unit' ? 110 : 70)) : gap
    }
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
const looseShown = computed(() => doc.loose.filter(l => !(drag.on && l.id === drag.item?.id)))
const beadStyle = (x, p, c) => ({ left: p.x + 'px', top: p.y + 'px', '--c': c[0], '--d': c[1], ...(selColor.value[x.id] ? { '--rc': selColor.value[x.id] } : {}) })
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
  sendCursor(e)
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
    if (MEDIA.includes(p?.type)) return pickFile(null, p.type)
    if (p?.type) { const x = newItem(p.type); doc.items.push(x); sel.value = x.id; save(); nextTick(() => showRailEnd()) }
    else if (p?.item) { sel.value = sel.value === p.item.id ? null : p.item.id; selectStep(null, null); noteSel.value = null }
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
  if (where !== 'cancel' && from === 'new') { sel.value = x.id; if (MEDIA.includes(x.type) && !x.media) pickFile(findAny(x.id), x.type) }
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
  sendCursor(e)
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
  if (pan && !pan.moved && noteTool.value) { addNote(noteColor.value, toWorld(e.clientX, e.clientY)); pan = null; return }
  if (pan && !pan.moved) { sel.value = null; selectStep(null, null); noteSel.value = noteEdit.value = null; tray.value = null }
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
  const kind = kindOf(file)
  if (!kind || kind !== item.type) return alert(item.type === 'photo' ? 'Это не фото. Нужна картинка (JPG, PNG, WebP).' : 'Это не видео. Перетащите кружок из Telegram (видеофайл).')
  if (file.size > MAX_MB * 1024 * 1024) return alert(`Файл больше ${MAX_MB} МБ — слишком большой.`)
  const id = 'm' + item.id
  try { await mediaOp('readwrite', s => s.put(file, id)) } catch { return alert('Не удалось сохранить файл в браузере (мало места?).') }
  urls[id] = URL.createObjectURL(file); item.media = id; save()
  if (storageOn.value) upload(item, file)                   // и сразу в S3 (копия в браузере удалится после загрузки)
}
const fileInput = ref(null), pickKind = ref('video'); let pickFor = null
const pickFile = (item, kind = item?.type ?? 'video') => { pickFor = item; pickKind.value = kind; fileInput.value.value = ''; nextTick(() => fileInput.value.click()) }
async function onPicked(e) {
  const files = [...e.target.files].filter(f => kindOf(f) === pickKind.value); if (!files.length) return
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
    sel.value = null; Object.assign(drag, { on: true, item: newItem(t.startsWith('image/') ? 'photo' : 'video'), from: 'file' })
  }
  drag.x = e.clientX; drag.y = e.clientY
  const n = nearest(toWorld(e.clientX, e.clientY)); drag.over = n.near && !overToolbar(e.clientY); drag.to = n.i
}
function fileLeave(e) { if (!e.relatedTarget && drag.on && drag.from === 'file') Object.assign(drag, { on: false, item: null }) }
async function fileDrop(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  const files = [...e.dataTransfer.files].filter(kindOf), first = drag.item, w = toWorld(e.clientX, e.clientY), onRail = drag.over
  if (!files.length || !first) { Object.assign(drag, { on: false, item: null }); return alert('Перетащите кружок из Telegram (видео) или фото') }
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
const play = (e, on) => { const v = e.currentTarget.querySelector('video'); if (v) on ? v.play().catch(() => {}) : v.pause() }

// ---------- Карточка выбранного ----------
const sel = ref(null), editing = ref(false)
watch(sel, (id) => liveSend({ t: 'sel', id }))
const selItem = computed(() => findAny(sel.value))
const selLoose = computed(() => !!doc.loose.find(v => v.id === sel.value))
function remove() {
  const x = selItem.value; if (!x) return
  if (x.file && !confirm(`Удалить ${x.type === 'photo' ? 'фото' : 'кружок'}? Файл удалится и из хранилища.`)) return
  if (x.steps?.length && !confirm(`Удалить «${x.title}» вместе с интерактивным уроком (${screens(x.steps.length)})?`)) return
  dropRefs((x.steps ?? []).flatMap(stepRefs))
  const a = doc.items.findIndex(v => v.id === x.id); if (a >= 0) doc.items.splice(a, 1)
  const b = doc.loose.findIndex(v => v.id === x.id); if (b >= 0) doc.loose.splice(b, 1)
  if (x.media) mediaOp('readwrite', s => s.delete(x.media)).catch(() => {})
  if (x.file && online) apiRequest('/media/delete', { method: 'POST', body: JSON.stringify({ key: x.file }) }).catch(() => {})
  sel.value = null; setProgress(doc.progress)
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
  if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)) { if (e.key === 'Escape') e.target.blur(); return }
  if (e.key === 'Enter' && sel.value && !run.value) { e.preventDefault(); return rename(selItem.value) }
  if (e.key === 'Escape') { if (run.value) run.value = null; else { noteTool.value = false; sel.value = null; selectStep(null, null); noteSel.value = null; tray.value = null } }
  if (run.value || !(e.key === 'Delete' || e.key === 'Backspace')) return
  if (noteSel.value) delNote(noteSel.value)
  else if (pick.step && pick.step !== 'final') removeStepKey()
  else if (sel.value) remove()
}
onMounted(() => addEventListener('keydown', onKey)); onUnmounted(() => removeEventListener('keydown', onKey))

function exportJson() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })); a.download = 'course.json'; a.click()
}
function reset() { if (!confirm('Вернуть пример курса? Текущий черновик удалится.')) return; Object.assign(doc, seed()); sel.value = null; selectStep(null, null); save(); nextTick(() => fit()) }
</script>

<template>
  <div class="ce" :class="{ dragging: drag.on }" @dragover="fileOver" @dragleave="fileLeave" @drop="fileDrop">
    <input ref="fileInput" type="file" :accept="pickKind === 'photo' ? 'image/*' : 'video/*'" multiple hidden @change="onPicked" />
    <div ref="board" class="board" :class="{ placing: noteTool }" :style="dots" @pointerdown="boardDown" @pointermove="boardMove" @pointerup="boardUp" @pointercancel="boardUp" @wheel="onWheel">
      <div class="world" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }">
        <!-- Сводка, как увидит ученик -->
        <div class="sum" @pointerdown.stop>
          <div class="sh"><span><i class="dt" />Юнит {{ curUnitNo }} из {{ unitsCount }}</span><b class="pp">{{ pct }}%</b></div>
          <div class="st">{{ curUnit?.sub || curUnit?.title }}</div>
          <div class="bar"><i :style="{ width: pct + '%' }" /></div>
          <div class="sf"><span>Пройдено: <b>{{ doc.progress }} из {{ tasksCount }}</b></span><span>Осталось {{ tasksCount - doc.progress }}</span></div>
        </div>
        <svg class="rail" :height="railBox.y1"><path :d="rail" class="r0" /><path :d="doneRail" class="r1" /></svg>
        <!-- Вторые рельсы: экраны уроков, вправо от урока -->
        <LessonRail v-for="r in lessonRails" :key="'lr' + r.x.id" :item="r.x" :x="r.p.x" :y="r.p.y" :sel="pick.lesson === r.x.id ? pick.step : null" :to-world="toWorld"
          :resolve="resolveRef" :put-file="putStepFile" :drop-files="dropRefs" :up-pct="upPct"
          @focus="showPoint" @change="save" @height="railHs[r.x.id] = $event" @select="selectStep(r.x.id, $event)" @play="run = r.x.id" @add="sel = r.x.id; tray = 'inter'" />
        <!-- Рельс -->
        <div v-for="(x, i) in order" :key="x.id" class="bead" :class="[x.type, stateOf(x, i), 's-' + pos(i).side, { lift: drag.on && drag.item?.id === x.id, on: sel === x.id, rsel: !!selColor[x.id] }]"
          :style="beadStyle(x, pos(i), colorOf(x, i))" @pointerdown.stop="startDrag($event, { item: x, from: 'rail' })" @dblclick.stop="rename(x)" @pointerenter="play($event, true)" @pointerleave="play($event, false)">
          <template v-if="x.type === 'unit'">
            <div v-if="renaming === x.id" class="uh ren" @pointerdown.stop><input v-model="x.title" :data-ren="x.id" class="rin big" placeholder="Юнит" @keydown.enter="renameDone" @keydown.esc="renameDone" @input="save" /><input v-model="x.sub" class="rin" placeholder="тема юнита" @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="($event.relatedTarget?.classList?.contains('rin')) || renameDone()" @input="save" /></div>
            <div v-else class="uh"><b>{{ x.title }}<template v-if="x.sub">: {{ x.sub }}</template></b><svg v-if="chapterOf(i)?.tasks && chapterOf(i).pct === 100" viewBox="0 0 24 24" class="uok"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.3l3 3 6-6.5" /></svg></div>
            <div class="ubar"><i :style="{ width: (chapterOf(i)?.pct ?? 0) + '%' }" /><em>{{ chapterOf(i)?.pct ?? 0 }}%</em></div>
          </template>
          <template v-else>
            <video v-if="x.type === 'video' && mediaUrl(x)" :src="mediaUrl(x)" class="vid" muted loop playsinline preload="metadata" />
            <img v-else-if="x.type === 'photo' && mediaUrl(x)" :src="mediaUrl(x)" class="vid img" alt="" draggable="false" />
            <template v-if="x.id in upPct"><svg class="upl" viewBox="0 0 88 88"><circle cx="44" cy="44" r="40" :style="{ strokeDasharray: 251, strokeDashoffset: 251 * (1 - upPct[x.id] / 100) }" /></svg><em class="upn">{{ upPct[x.id] }}%</em></template>
            <svg v-if="!MEDIA.includes(x.type) || !mediaUrl(x)" viewBox="0 0 24 24" class="ic" v-html="T[x.type].ic" />
            <svg v-if="stateOf(x, i) === 'done'" viewBox="0 0 24 24" class="ok"><circle cx="12" cy="12" r="11" /><path d="M7 12.3l3.2 3.2 6.3-6.8" /></svg>
            <em class="cap"><span v-if="stateOf(x, i) === 'current'" class="start">Сейчас</span><input v-if="renaming === x.id" v-model="x.title" :data-ren="x.id" class="rin" @pointerdown.stop @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="renameDone" @input="save" /><template v-else>{{ x.title }}</template><small>{{ [T[x.type].t, x.steps?.length ? screens(x.steps.length) : ''].filter(Boolean).join(' · ') }}</small></em>
          </template>
        </div>
        <!-- Черновики на холсте: ещё не на рельсе -->
        <div v-for="x in looseShown" :key="x.id" class="bead loose" :class="[x.type, { on: sel === x.id, rsel: !!selColor[x.id] }]" :style="beadStyle(x, x, colorOf(x))"
          @pointerdown.stop="startDrag($event, { item: x, from: 'loose' })" @dblclick.stop="rename(x)" @pointerenter="play($event, true)" @pointerleave="play($event, false)">
          <template v-if="x.type === 'unit'"><b class="no">+</b><em class="cap">{{ x.title }}<small>не на рельсе</small></em></template>
          <template v-else>
            <video v-if="x.type === 'video' && mediaUrl(x)" :src="mediaUrl(x)" class="vid" muted loop playsinline preload="metadata" />
            <img v-else-if="x.type === 'photo' && mediaUrl(x)" :src="mediaUrl(x)" class="vid img" alt="" draggable="false" />
            <svg v-else viewBox="0 0 24 24" class="ic" v-html="T[x.type].ic" />
            <template v-if="x.id in upPct"><svg class="upl" viewBox="0 0 88 88"><circle cx="44" cy="44" r="40" :style="{ strokeDasharray: 251, strokeDashoffset: 251 * (1 - upPct[x.id] / 100) }" /></svg><em class="upn">{{ upPct[x.id] }}%</em></template>
            <em class="cap"><input v-if="renaming === x.id" v-model="x.title" :data-ren="x.id" class="rin" @pointerdown.stop @keydown.enter="renameDone" @keydown.esc="renameDone" @blur="renameDone" @input="save" /><template v-else>{{ x.title }}</template><small>не на рельсе</small></em>
          </template>
        </div>
        <!-- Стикеры, как в FigJam -->
        <div v-for="n in doc.notes" :key="n.id" class="note" :data-note="n.id" :class="{ on: noteSel === n.id, edit: noteEdit === n.id }" :style="{ left: n.x + 'px', top: n.y + 'px', background: n.color }"
          @pointerdown.stop="noteDown($event, n)" @dblclick.stop="editNote(n.id)" @wheel="noteEdit === n.id && !$event.ctrlKey && !$event.metaKey && $event.stopPropagation()">
          <textarea v-model="n.text" placeholder="Заметка…" :readonly="noteEdit !== n.id" @input="save" @blur="noteEdit = null" />
          <div v-if="noteSel === n.id" class="nbar" @pointerdown.stop><button v-for="c in NOTE_COLORS" :key="c" :style="{ background: c }" :class="{ on: n.color === c }" @click="n.color = c; save()" /><button class="nd" title="Удалить" @click="delNote(n.id)">✕</button></div>
        </div>
      </div>
    </div>

    <!-- Курсоры коллег: стрелка их цвета и имя -->
    <div v-for="c in otherCursors" :key="c.cid + tick * 0" class="rcur" :style="{ transform: `translate(${toScreen(c).x}px, ${toScreen(c).y}px)`, '--rc': c.u.color }">
      <svg viewBox="0 0 16 16"><path d="M1 1l5.2 13.5 2-5.6L14 7z" /></svg><span>{{ c.u.name }}</span>
    </div>
    <!-- Взятое — за пальцем в масштабе холста; мимо рельса — полупрозрачное -->
    <div v-if="drag.on" class="fly" :class="[drag.item.type, { out: !drag.over }]" :style="{ left: drag.x + 'px', top: drag.y + 'px', '--c': T[drag.item.type].c, '--d': T[drag.item.type].d, transform: `scale(${view.z * 1.06})` }">
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
      <span class="pl">Прогресс<small>пример</small></span>
      <button class="sb" @click="setProgress(doc.progress - 1)">−</button><b class="pv">{{ doc.progress }} / {{ tasksCount }}</b><button class="sb" @click="setProgress(doc.progress + 1)">+</button>
      <i class="vs dk" /><button class="pill" @click="exportJson">Экспорт</button><button class="pill grey" @click="reset">Сброс</button>
    </div>
    <!-- Масштаб -->
    <div class="fl zoom"><button title="Отдалить" @click="zoomBtn(1 / 1.25)">−</button><b title="100%" @click="zoomAt(1 / view.z, W / 2, H / 2)">{{ Math.round(view.z * 100) }}%</b><button title="Приблизить" @click="zoomBtn(1.25)">+</button><i class="vs" /><button class="all" title="Показать весь курс" @click="fit()">Весь курс</button></div>

    <!-- Снизу: панель как в FigJam — группа, над ней ряд элементов -->
    <div v-if="tray" class="fl tray" role="toolbar" @pointerdown.stop>
      <template v-if="tray === 'tasks'"><button v-for="k in TASKS" :key="k" class="ti" :title="T[k].t + ' — тяните на рельс или нажмите'" :style="{ '--c': T[k].c }" @pointerdown.prevent="startDrag($event, { type: k })"><span class="tc" :class="k"><svg viewBox="0 0 24 24" v-html="T[k].ic" /></span><small>{{ T[k].t }}</small></button></template>
      <template v-else-if="tray === 'media'"><button v-for="k in MEDIA" :key="k" class="ti" :title="T[k].t + ' — тяните на рельс или нажмите'" :style="{ '--c': T[k].c }" @pointerdown.prevent="startDrag($event, { type: k })"><span class="tc" :class="k"><svg viewBox="0 0 24 24" v-html="T[k].ic" /></span><small>{{ T[k].t }}</small></button></template>
      <template v-else-if="tray === 'inter'">
        <span class="tt2">{{ activeLesson ? 'В урок «' + (findAny(activeLesson)?.title || 'Урок') + '»' : 'Новый урок в конце' }}</span>
        <!-- мини-окошки: как выглядит экран -->
        <button v-for="k in [...KIND_LIST, 'lesson']" :key="k" class="mi" :title="k === 'lesson' ? 'Сразу 5 экранов-образцов: два новых слова, два выбора, пары' : KINDS[k].d" @click="addScreen(k)">
          <span class="mini" :class="k"><i class="mp" />
            <template v-if="k === 'intro'"><i class="mh" /><i class="mm" /><i class="mw" /><i class="ml" /></template>
            <template v-else-if="k === 'choice'"><i class="mh" /><i class="ma" /><span class="mo"><i /><i class="g" /><i /></span></template>
            <template v-else-if="k === 'pairs'"><i class="mh" /><span class="mq"><i class="g" /><i class="g" /><i /><i /><i /><i /></span></template>
            <template v-else><span class="ms"><i /><i /><i /></span></template>
            <i class="mb" />
          </span>
          <small><b>{{ k === 'lesson' ? 'Готовый урок' : KINDS[k].t }}</b>{{ k === 'lesson' ? '5 экранов-образцов' : { intro: 'видео, фото, звук, слово', choice: 'выбрать верный ответ', pairs: 'соединить пары' }[k] }}</small>
        </button>
      </template>
      <template v-else-if="tray === 'note'"><button v-for="c in NOTE_COLORS" :key="c" class="sw" :class="{ on: noteColor === c }" :style="{ background: c }" title="Цвет стикера — потом нажмите на холст" @click="noteColor = c; noteTool = true" /></template>
    </div>
    <div class="fl tools" role="toolbar">
      <button class="tb" :title="'Юнит — тяните на рельс или нажмите'" @pointerdown.prevent="startDrag($event, { type: 'unit' })"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="M7.5 10h9M7.5 14h5" /></svg><small>Юнит</small></button>
      <button v-for="g in GROUPS.filter(g => g.k !== 'note')" :key="g.k" class="tb" :class="{ on: tray === g.k }" :style="{ '--c': g.c }" @click="tray = tray === g.k ? null : g.k; noteTool = false"><svg viewBox="0 0 24 24" v-html="g.ic" /><small>{{ g.t }}</small></button>
      <i class="tsep" />
      <!-- Стикер, как в FigJam: выезжает при наведении, выбран — стоит выше -->
      <button class="sticky" :class="{ on: noteTool || tray === 'note' }" title="Стикер — выберите цвет и нажмите на холст" @click="tray = tray === 'note' ? null : 'note'; noteTool = tray === 'note'">
        <span class="sk" :style="{ background: noteColor }"><i /></span>
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
/* Фото: скруглённый квадрат с миниатюрой (кружок — круглый, фото — нет: сразу видно, что где) */
.bead.photo { width: 76px; height: 76px; margin: -38px 0 0 -38px; border-radius: 20px; overflow: visible }
.vid.img { border-radius: 18px } .bead.photo:has(.img) { background: transparent; box-shadow: none }
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
.chap { position: absolute; z-index: 0; box-sizing: border-box; border: 1px solid #e3e3e3; border-radius: 22px; background: #fff; pointer-events: none }
.chap.full { border-color: #1fbe78; background: #f2fbf7 }
.bead { width: 56px; height: 56px; margin: -28px 0 0 -28px; color: #fff; background: var(--c); box-shadow: 0 0 0 3px #fff, 0 0 0 6px #1fbe78 }
.bead:hover { transform: none; filter: brightness(1.04) }
.bead.todo { background: #f1f1f1; color: #b7b7b7; box-shadow: 0 0 0 3px #fff, 0 0 0 6px #e2e2e2 } .bead.todo .cap { color: var(--text) }
.bead.current { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 12px color-mix(in srgb, var(--c) 18%, transparent); animation: none }
.bead.tutor { border-radius: 50% }
.ic { width: 26px; height: 26px; stroke-width: 2 }
.ok { position: absolute; left: 50%; bottom: -12px; width: 22px; height: 22px; margin-left: -11px; pointer-events: none; z-index: 2 }
.ok circle { fill: #1fbe78; stroke: #fff; stroke-width: 2 } .ok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.cap { left: calc(100% + 22px); width: 190px; gap: 2px; font-size: 15px; font-weight: 800; color: #252a31 }
.cap small { font-size: 12.5px; font-weight: 600; color: #6b7280 }
.bead.s-l .cap { right: calc(100% + 22px) }
.start { margin-bottom: 4px; padding: 2px 8px; border-radius: 6px; background: var(--c); color: #fff; font-size: 10px; box-shadow: none }
/* юнит: заголовок главы и полоска прогресса */
.bead.unit { width: auto; height: auto; margin: -40px 0 0 -46px; display: grid; gap: 10px; place-items: stretch; padding: 0; border-radius: 0; background: none !important; box-shadow: none !important; color: #252a31; cursor: grab; outline-offset: 10px }
.bead.unit.todo { box-shadow: none } .bead.unit .sign, .bead.unit .no { display: none }
.uh { display: flex; align-items: center; gap: 8px; width: 420px; white-space: nowrap }
.uh b { font-size: 20px; font-weight: 900; overflow: hidden; text-overflow: ellipsis }
.uok { flex: none; width: 22px; height: 22px } .uok circle { fill: #1fbe78 } .uok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.ubar { position: relative; width: 446px; height: 10px; border-radius: 6px; background: #e6e6e6 } .ubar i { display: block; height: 100%; border-radius: 6px; background: #1fbe78; transition: width .25s }
.ubar em { position: absolute; right: 0; top: 50%; transform: translateY(-50%); padding: 1px 7px; border-radius: 8px; background: #1fbe78; color: #fff; font-size: 11px; font-weight: 900; font-style: normal }
.bead.unit.lift { outline: 2px dashed #1fbe78; background: #fff !important }
.fly.unit { width: 50px; height: 50px; margin: -25px 0 0 -25px; background: #1fbe78; box-shadow: 0 10px 20px rgba(0, 0, 0, .2) }
/* сводка курса — плоско */
.sum { box-shadow: none; border: 1px solid #e3e3e3 } .pp { background: #e3fbef; color: #128a55 } .bar i { background: #1fbe78 } .dt { background: #1fbe78 }
.bead.loose { box-shadow: 0 0 0 3px #f5f5f5, 0 0 0 5px color-mix(in srgb, var(--c) 55%, transparent) }
.hint-l { margin: 0; font-size: 12px; color: var(--hint); font-weight: 600 }
/* «Пройти урок» */
.runov { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .45) }
.runbox { width: min(560px, 100%); height: min(820px, 96vh); border-radius: 22px; overflow: hidden; background: #fff }
/* Стикеры */
.note { position: absolute; z-index: 4; width: 190px; min-height: 190px; display: flex; box-sizing: border-box; padding: 14px; border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, .12); cursor: grab; touch-action: none }
.note.on { outline: 2px solid #0d99ff; outline-offset: 2px }
.note textarea { flex: 1; min-height: 160px; margin: 0; padding: 0; border: 0; background: none; resize: none; outline: none; font: inherit; font-size: 16px; font-weight: 700; color: #2b2b2b; line-height: 1.3; cursor: inherit; pointer-events: none }
.note.edit textarea { pointer-events: auto; cursor: text } .note.edit { cursor: default }
.nbar { position: absolute; left: 0; top: -46px; display: flex; gap: 4px; padding: 5px; border-radius: 10px; background: #2c2c2c; box-shadow: 0 4px 12px rgba(0, 0, 0, .2) }
.nbar button { width: 22px; height: 22px; border: 2px solid transparent; border-radius: 50%; cursor: pointer; padding: 0 } .nbar button.on { border-color: #fff }
.nbar .nd { background: none; color: #fff; font-size: 12px }
/* Нижняя панель как в FigJam — крупно */
.tools { height: 84px; padding: 0 10px; gap: 4px; border-radius: 20px; overflow: hidden }
.tb { display: grid; justify-items: center; gap: 4px; width: 92px; padding: 10px 0 8px; border: 0; border-radius: 14px; background: none; font: inherit; color: #2c2c2c; cursor: pointer; touch-action: none }
.tb:hover { background: #f2f2f2 } .tb.on { background: #e5f4ff; color: #0d99ff }
.tb svg { width: 32px; height: 32px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round }
.tb small { font-size: 13px; font-weight: 800 }
.tsep { width: 1px; height: 50px; margin: 0 6px; background: #e6e6e6 }
/* стикер на панели: торчит снизу, при наведении выезжает */
.sticky { position: relative; align-self: stretch; width: 96px; border: 0; background: none; padding: 0; cursor: pointer }
.sk { position: absolute; left: 14px; top: 22px; width: 66px; height: 74px; border-radius: 3px; box-shadow: 0 2px 6px rgba(0, 0, 0, .16); transform: rotate(-4deg); transition: top .18s ease, transform .18s ease }
.sk i { position: absolute; right: 0; top: 0; width: 18px; height: 18px; background: linear-gradient(225deg, #f5f5f5 50%, rgba(0, 0, 0, .1) 50%) }
.sticky:hover .sk { top: 12px; transform: rotate(-2deg) } .sticky.on .sk { top: 8px; transform: rotate(0) }
.board.placing { cursor: crosshair }
.tray { left: 50%; bottom: 116px; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 8px 10px; border-radius: 18px; animation: tray .14s ease-out; max-width: calc(100vw - 16px); overflow-x: auto; scrollbar-width: none }
@keyframes tray { from { opacity: 0; transform: translate(-50%, 6px) } }
.ti { display: grid; justify-items: center; gap: 5px; width: 92px; padding: 8px 0 6px; border: 0; border-radius: 12px; background: none; font: inherit; cursor: pointer; touch-action: none; flex: none }
.ti.wide { width: 116px } .ti:hover { background: #f2f2f2 }
.tc { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: #fff; background: var(--c) }
.tc svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2.1; stroke-linecap: round; stroke-linejoin: round }
.ti small { font-size: 13px; font-weight: 800; color: #2c2c2c; white-space: nowrap }
.tt2 { padding: 0 10px; font-size: 13px; font-weight: 800; color: var(--hint); max-width: 130px; line-height: 1.25 }
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
  .tools { left: 8px; right: 8px; transform: none; height: 72px; justify-content: center } .tb { width: 64px } .tb svg { width: 26px; height: 26px } .tb small { font-size: 11px } .sticky { width: 72px } .sk { left: 10px; width: 52px; height: 60px } .tray { bottom: 92px } .tsep { display: none }
}
.rin { pointer-events: auto; width: 100%; margin: 0; padding: 2px 6px; border: 2px solid #0d99ff; border-radius: 6px; background: #fff; font: inherit; font-size: 15px; font-weight: 800; color: #252a31; outline: none; user-select: text }
.uh.ren { display: grid; gap: 4px } .rin.big { font-size: 20px; font-weight: 900 }
</style>

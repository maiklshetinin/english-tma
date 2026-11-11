<script setup>
// «Как видит ученик»: просмотрщик курсов на вкладке «Курсы». Курс — тем же рельсом, что в редакторе (юниты с процентом,
// кружки заданий с теми же значками, «Сейчас»). Нажал урок — он запускается во весь экран, как в Busuu; кружок и фото — тоже во весь экран.
// Ничего не правит: править — «Открыть в редакторе». Курсы — с сервера (без сервера — один курс из этого браузера, как в редакторе).
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { API, apiRequest, fb, isDemo } from '../firebase'
import { useCourseMedia } from '../composables/useCourseMedia'
import LessonPlayer from './LessonPlayer.vue'
import ReviewChart from './ReviewChart.vue'
import { topicById, detectTopic, wordsOnly, screenKey } from '../utils/skills'
import WordNow from './WordNow.vue'
import MemoryChart from './MemoryChart.vue'
import { recordStep, syncReview, review, algo } from '../stores/review'
import { hitsOf, keyOf, memOf, stateOf, levelOf, exName } from '../utils/review'
import { useAuthStore } from '../stores/auth'
import { ask } from '../composables/useDialog'
import { showToast } from '../composables/useToast'
import BackButton from './BackButton.vue'
import { INTERACTIVE, stepIssue, lessonMin } from '../utils/lesson'

const router = useRouter(), route = useRoute()
// где ты в курсе — в адресе (#/path?c=курс&l=задание&s=экран): перезагрузил страницу — открыт тот же урок на том же экране.
// В карточке ученика (of) адрес не трогаем.
const urlOn = () => !props.of
const startAt = ref(0)
let qNow = null                                // последний записанный адрес: router.replace асинхронный, route.query отстаёт
const setQ = (q) => { if (!urlOn()) return; const next = { ...(qNow ?? route.query), ...q }; qNow = next; for (const k in next) if (next[k] == null || next[k] === '') delete next[k]; router.replace({ query: next }).catch(() => {}) }
const online = !isDemo && !!API && !!fb
const LOCAL = 'tma.courseRail.v1'
const props = defineProps({
  id: { type: String, default: null },                // выбранный курс (из списка курсов)
  student: Boolean,                                   // ученик проходит свой назначенный курс: свой прогресс с сервера (server/learn.ts)
  of: { type: Object, default: null },                // карточка ученика у преподавателя: его прохождение { done, lessons } — путь, как его видит ученик
})          // выбранный курс (из списка курсов)
const course = ref(null), err = ref(''), loading = ref(false)
const onEsc = (e) => { if (e.key !== 'Escape') return; if (open.value) open.value = null; else peek.value = null }
// нажали мимо карточки урока — она закрывается
const onDown = (e) => { if (peek.value && !e.target.closest?.('.pv, .vrow.peek, .rpt')) peek.value = null }
const auth = useAuthStore()
onMounted(() => { syncReview(auth.user?.id); addEventListener('keydown', onEsc); addEventListener('pointerdown', onDown) })
onUnmounted(() => { removeEventListener('keydown', onEsc); removeEventListener('pointerdown', onDown) })

// типы заданий — как в редакторе курса
const T = {
  unit: { t: 'Chapter', c: 'var(--green)' },
  lesson: { t: 'Урок', c: 'var(--green)', d: 'var(--green-d)', ic: '<circle cx="12" cy="12" r="8"/><path d="M9 12.3l2 2 4-4"/>' },
  words: { t: 'Слова', c: 'var(--blue)', d: 'var(--blue-d)', ic: '<rect x="4" y="7" width="12" height="13" rx="2.5"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16"/>' },
  hw: { t: 'Домашка', c: '#2ec4b6', d: '#1f9e93', ic: '<path d="M14.6 6.1l3.3 3.3"/><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z"/>' },
  test: { t: 'Тест', c: 'var(--orange)', d: 'var(--orange-d)', ic: '<path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.1l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"/>' },
  tutor: { t: 'С репетитором', c: 'var(--purple)', d: 'var(--purple-d)', ic: '<rect x="3.5" y="6.5" width="12" height="11" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3z"/>' },
  video: { t: 'Кружок', c: '#2aabee', d: '#1a8bc9', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M10.3 9.2v5.6l4.6-2.8z" fill="currentColor"/>' },
  photo: { t: 'Фото', c: '#ff6fb1', d: '#e0478f', ic: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8"/>' },
  checkpoint: { t: 'Чекпоинт', c: '#ff9f1a', d: '#e07f00', ic: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 3.7L17 12H6"/>' },
  reward: { t: 'Награда', c: 'var(--yellow)', d: 'var(--yellow-d)', ic: '<path d="M8 4.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5v.8A3.7 3.7 0 0 0 8 11M16 6.5h3.5v.8A3.7 3.7 0 0 1 16 11"/><path d="M12 14v4M8.5 20h7"/>' },
}
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many)
const screens = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'экран' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'экрана' : 'экранов'}`
const state = (x) => (x.n < done.value ? 'done' : x.n === done.value ? 'current' : 'todo')

async function loadCourse(id) {
  open.value = null; peek.value = null; course.value = null; if (!id) return
  loading.value = true
  try {
    if (props.student) { const r = await apiRequest(`/my/courses/${id}`); if (!r.ok) throw new Error(`(${r.status})`); const d = await r.json(); course.value = d; run.value = d.run }
    else if (!online) { course.value = JSON.parse(localStorage.getItem(LOCAL)); if (self) run.value = readRun(id) }
    else {
      const r = await apiRequest(`/courses/${id}`); if (!r.ok) throw new Error(`(${r.status})`); course.value = await r.json()
      if (self) { const q = await apiRequest(`/courses/${id}/run`).catch(() => null); run.value = q?.ok ? await q.json() : { done: 0, lessons: {} } }
    }
  } catch (e) { err.value = e.message } finally { loading.value = false }
  nextTick(restore)
}

// путь: юниты с заданиями; прогресс курса — сколько заданий уже пройдено (как его видит ученик)
const units = computed(() => {
  const out = []; let cur = null, n = 0
  for (const x of course.value?.items ?? []) {
    if (x.type === 'unit') { cur = { ...x, tasks: [] }; out.push(cur); continue }
    if (!cur) { cur = { id: 'u0', title: '', sub: '', tasks: [] }; out.push(cur) }
    cur.tasks.push({ ...x, n: n++ })
  }
  for (const u of out) u.pct = u.tasks.length ? Math.round(u.tasks.filter(x => x.n < done.value).length / u.tasks.length * 100) : 0
  return out
})
const total = computed(() => (course.value?.items ?? []).filter(x => x.type !== 'unit').length)
// у ученика — свой прогресс (сколько заданий подряд пройдено); в «Как видит ученик» — прогресс из редактора
const run = ref({ done: 0, lessons: {} })
// преподаватель в «Как видит ученик» проходит курс по тем же правилам, что ученик: по порядку, ошибки → чекпоинт, прогресс хранится
// (на сервере — courseProgress/teacher_<uid>; без сервера — в этом браузере) и сбрасывается кнопкой «Сбросить моё прохождение»
const self = !props.student && !props.of
const RUNK = (id) => 'tma.courseRun.' + id
const readRun = (id) => { try { return JSON.parse(localStorage.getItem(RUNK(id))) ?? { done: 0, lessons: {} } } catch { return { done: 0, lessons: {} } } }
const mine = computed(() => (props.of ? { done: 0, lessons: {}, ...props.of } : run.value))          // чьё прохождение показываем
const done = computed(() => Math.min(mine.value.done, total.value))
// ученик прошёл задание (урок — по «Готово» в итоге; кружок, фото, занятие — кнопкой) → на сервер, «Сейчас» переезжает дальше
let t0 = 0
async function finish(x, sc = {}) {
  if (props.of || !x || x.virtual) return          // «Повторение» в прогресс курса не пишется
  const body = { itemId: x.id, ok: sc.ok ?? 0, all: sc.all ?? 0, sec: t0 ? Math.min(86400, Math.round((Date.now() - t0) / 1000)) : 0, ...(x.type !== 'checkpoint' && misses.size ? { miss: [...misses] } : {}) }
  if (self && !online) {                       // без сервера — те же правила, что на сервере (server/learn.ts), в этом браузере
    const r = run.value; if (x.n > r.done) return
    const res = { ok: body.ok, all: body.all, sec: body.sec, at: Date.now(), ...(body.miss ? { miss: body.miss } : {}) }
    run.value = { done: Math.max(r.done, x.n + 1), lessons: { ...r.lessons, [x.id]: res } }
    try { localStorage.setItem(RUNK(props.id), JSON.stringify(run.value)) } catch { /* приватный режим */ }
    return
  }
  const url = self ? `/courses/${props.id}/run/done` : `/my/courses/${props.id}/done`
  try { const r = await apiRequest(url, { method: 'POST', body: JSON.stringify(body) }); if (r.ok) run.value = await r.json() } catch { /* без сети — пройдёт ещё раз */ }
}
/** Преподаватель: стереть своё прохождение курса (с подтверждением) */
async function resetMine() {
  if (!(await ask('Сбросить своё прохождение курса?', { text: 'Пройденные задания и ошибки для чекпоинтов в этом курсе начнутся с нуля. Словарь Review не меняется.', ok: 'Сбросить', danger: true }))) return
  if (online) { const r = await apiRequest(`/courses/${props.id}/run/reset`, { method: 'POST', body: '{}' }).catch(() => null); if (!r?.ok) return showToast('Не удалось сбросить — попробуйте ещё раз', null, 'bad') }
  else try { localStorage.removeItem(RUNK(props.id)) } catch { /* приватный режим */ }
  run.value = { done: 0, lessons: {} }; showToast('Прохождение сброшено')
}
const markDone = (x) => { finish(x); peek.value = null; inline.value = null }
const canMark = (x) => !props.of && state(x) === 'current'
const ready = (x) => INTERACTIVE.includes(x.type) && stepsOf(x).length > 0

// ---------- Чекпоинт собирается сам ----------
// Экраны учителя (если положил) + экраны из уроков этой Chapter, где ученик ошибся (прогресс с сервера; в «Как видит ученик» — ошибки
// этого просмотра). Ошибок нет — проверяемые экраны из уроков Chapter, до CK_MAX, равномерно — чекпоинт не бывает пустым.
const GRADED = ['choice', 'order', 'gap', 'pairs'], CK_MAX = 8
const open = ref(null)                         // открытое во весь экран задание
const misses = reactive(new Set())             // экраны с ошибкой в открытом сейчас уроке
const okSteps = (x) => (x.steps ?? []).filter(s => !stepIssue(s))
// ошибки урока: с сервера (ученик) / этого просмотра; у открытого сейчас урока — плюс ошибки, сделанные только что (в реальном времени)
// тема грамматики открытого урока: своя (редактор), «без темы» или — по названию урока / его Chapter
const dictWords = computed(() => wordsOnly(review.items))         // графики урока — только слова (навыки и темы — во вкладке Review)
function topicOfOpen(x = open.value) {
  if (!x || x.topic === 'none') return undefined
  const u = units.value.find(v => v.tasks.some(t => t.id === x.id))
  return topicById(x.topic) ?? detectTopic(x.title, u ? `${u.title} ${u.sub ?? ''}` : '')
}
const missOf = (id) => { const base = mine.value.lessons?.[id]?.miss ?? []; return open.value?.id === id && misses.size ? [...new Set([...base, ...misses])] : base }
function ckParts(x) {
  const u = units.value.find(u => u.tasks.some(t => t.id === x.id))
  const before = u ? u.tasks.slice(0, u.tasks.findIndex(t => t.id === x.id)) : []
  const pool = before.filter(t => t.type !== 'checkpoint').flatMap(t => okSteps(t).filter(s => GRADED.includes(s.kind)).map(s => ({ s, from: t.id })))
  const weak = pool.filter(p => missOf(p.from).includes(p.s.id))
  const own = okSteps(x), seen = new Set(own.map(s => s.id))
  let auto = weak.filter(p => !seen.has(p.s.id))
  const fromErrors = auto.length > 0
  if (!fromErrors && pool.length) {            // ошибок нет — по экрану из каждого урока по очереди, до CK_MAX
    const step = Math.max(1, pool.length / CK_MAX)
    auto = Array.from({ length: Math.min(CK_MAX, pool.length) }, (_, k) => pool[Math.floor(k * step)]).filter(p => !seen.has(p.s.id))
  }
  return { own, auto: auto.map(p => p.s), autoFrom: auto, fromErrors }
}
const stepsOf = (x) => { if (x.type === 'repeat') return x.steps; if (x.type !== 'checkpoint') return okSteps(x); const p = ckParts(x); return [...p.own, ...p.auto] }

// открыто в рамке: урок (экраны), кружок, фото или «пусто» — объявлено выше (нужно сборке чекпоинта)
// кружок и фото — открываются прямо тут, под строкой (как в Telegram), остальное — во весь экран
const inline = ref(null)
// урок с экранами — сначала карточка, как в Busuu: тип, примерное время (сумма времён экранов), «Поехали!»
const peek = ref(null)
function tap(x) {
  if (x.type === 'video' || x.type === 'photo') { inline.value = inline.value === x.id ? null : x.id; return }
  peek.value = peek.value === x.id ? null : x.id          // всё остальное — карточкой под заданием, без перехода на отдельную страницу
}
function go(x, at = 0) { startAt.value = at; peek.value = null; open.value = x; t0 = Date.now(); misses.clear(); for (const k in snap) delete snap[k]; for (const k in rvLog) delete rvLog[k] }
// «Повторить навыки» (как Review skills в Busuu): что именно повторять — ещё решаем
// Review — слова и фразы из пройденных уроков (как в Busuu); ответы в уроках сразу попадают туда
// итог урока: какие слова урок записал в Review и как изменилась их память (FSRS) — чтобы сверять с разделом Review строка в строку
const rvChart = ref((() => { try { return localStorage.getItem('tma.lessonGraphs') === '1' } catch { return false } })())
watch(rvChart, (v) => { try { localStorage.setItem('tma.lessonGraphs', v ? '1' : '0') } catch { /* приватный режим */ } })
// ↑ графики урока (преподаватель): справа от урока, ширина тянется как в DevTools
const curStep = ref(null)                      // экран, открытый в уроке сейчас
const focusKey = computed(() => { const h = curStep.value && hitsOf(curStep.value, { ok: true })[0]; return h ? keyOf(h.text) : '' })
const PW = 'tma.lessonPanelW'
const panelW = ref((() => { try { return +localStorage.getItem(PW) || 560 } catch { return 560 } })())
function dragSplit(e) {
  e.preventDefault(); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
  const x0 = e.clientX, w0 = Math.round(e.currentTarget.nextElementSibling?.getBoundingClientRect().width || panelW.value)                    // тянем от того места, где схватили, — перегородка идёт ровно за курсором
  const move = (ev) => { panelW.value = Math.round(Math.min(window.innerWidth * 0.72, Math.max(340, w0 + x0 - ev.clientX))) }
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); document.body.style.cursor = ''; document.body.style.userSelect = ''; try { localStorage.setItem(PW, String(panelW.value)) } catch { /* приватный режим */ } }
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up)      // слушаем всё окно — мышь может уйти с перегородки
}
const snap = reactive({})                      // ключ слова → стабильность памяти до урока, дни (null — новое, ещё без ответов)
const rvLog = reactive({})                     // ключ слова → журнал: какой экран, как ответили, какая стала память
const sOf = (k) => { const m = review.items[k] && memOf(review.items[k]); return m ? Math.round(m.s * 10) / 10 : null }
const onAnswer = (a) => {
  if (a.ok === false) misses.add(a.step.id)
  const hits = hitsOf(a.step, a), was = {}
  for (const h of hits) { const k = keyOf(h.text); was[k] = sOf(k); if (!(k in snap)) snap[k] = was[k] }
  // чекпоинт и «Повторение» собраны из экранов уроков — ответ пишется уроку, где экран живёт (его тема, память экрана)
  const home = open.value?.type === 'checkpoint' || open.value?.virtual ? stepHome.value[a.step.id] ?? open.value : open.value
  recordStep(a.step, a, { lesson: home?.title, course: course.value?.title, topic: topicOfOpen(home),
    screen: home && cid.value ? { key: screenKey(cid.value, home.id, a.step.id), text: `${exName(a.step)} · ${stepWord(a.step) || '—'}`, tr: home.title || '' } : undefined })
  for (const h of hits) { const k = keyOf(h.text), now = sOf(k); (rvLog[k] ??= []).push({ ex: exName(a.step), ok: h.ok, now }) }
}
// ── «Повторение» после каждой Chapter (как «Повторяй изученный материал» в Busuu) ──
// Собирается само: экраны уроков Chapter, у которых по FSRS подошёл срок (память экрана), и слова, которым пора, — экраном
// урока, где это слово есть. Проходится как урок (до RV_MAX экранов), в прогресс курса не пишется и путь не держит.
const RV_MAX = 10
const tick = ref(Date.now()); let tickT = null
onMounted(() => { tickT = setInterval(() => { tick.value = Date.now() }, 60_000) }); onUnmounted(() => clearInterval(tickT))
const cid = computed(() => course.value?.id ?? props.id)
const stepHome = computed(() => { const m = {}; for (const u of units.value) for (const t of u.tasks) if (t.type !== 'checkpoint') for (const st of t.steps ?? []) m[st.id] = t; return m })
function repeatOf(u) {
  const now = Math.max(tick.value, Date.now()), cfg = { retention: algo.retention, maxDays: algo.maxDays }
  const pool = u.tasks.filter(t => t.type !== 'checkpoint' && INTERACTIVE.includes(t.type)).flatMap(t => okSteps(t).filter(st => GRADED.includes(st.kind)).map(st => ({ st, t })))
  const mem = (x) => { if (!x) return null; const st = stateOf(x, now, cfg); return st.isNew ? null : st }
  const isDue = (st) => st.failed || st.due <= now
  const list = [], used = new Set(), words = new Set(); let next = Infinity, started = false
  for (const p of pool) {                                   // упражнения, которым пора
    const st = mem(review.items[cid.value ? screenKey(cid.value, p.t.id, p.st.id) : '']); if (!st) continue
    started = true
    if (isDue(st)) { list.push({ st: p.st, t: p.t, kind: 'screen', w: stepWord(p.st), pct: st.failed ? null : st.recall }); used.add(p.st.id) } else next = Math.min(next, st.due)
  }
  for (const p of pool) for (const h of hitsOf(p.st, { ok: true })) {          // слова, которым пора, — экраном их урока
    const k = keyOf(h.text); if (words.has(k)) continue
    const st = mem(review.items[k]); if (!st) continue
    started = true
    if (!isDue(st)) { next = Math.min(next, st.due); continue }
    words.add(k)
    if (!used.has(p.st.id)) { list.push({ st: p.st, t: p.t, kind: 'word', w: h.text, pct: st.failed ? null : st.recall }); used.add(p.st.id) }
  }
  return { id: 'rv-' + u.id, type: 'repeat', title: 'Повторение', virtual: true, list, steps: list.slice(0, RV_MAX).map(o => o.st), words: words.size, screens: list.filter(o => o.kind === 'screen').length, next: next === Infinity ? null : next, started }
}
const repeats = computed(() => Object.fromEntries(units.value.map(u => [u.id, repeatOf(u)])))
const relDay = (t) => { if (!t) return ''; const d = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн` }
function goRepeat(rv) { if (rv.steps.length) go({ ...rv, steps: rv.steps.slice() }) }

// вкладка «Путь → чекпоинты» панели «Графики»: тот же путь курса, справа от узлов — что куда попадает (в реальном времени)
const titleOf = (id) => course.value?.items?.find(t => t.id === id)?.title || ''
const ckMap = computed(() => units.value.filter(u => u.tasks.some(t => t.type === 'checkpoint') || u.title).map(u => ({
  id: u.id, title: u.title ? u.title + (u.sub ? ': ' + u.sub : '') : '',
  lessons: u.tasks.filter(t => t.type !== 'checkpoint' && INTERACTIVE.includes(t.type)).map(t => ({ id: t.id, title: t.title || (T[t.type] ?? T.lesson).t, state: state(t), miss: missOf(t.id).length, live: open.value?.id === t.id })),
  cks: u.tasks.filter(t => t.type === 'checkpoint').map(c => { const p = ckParts(c); return { id: c.id, title: c.title || 'Чекпоинт', state: state(c), fromErrors: p.fromErrors, own: p.own.length,
    items: p.autoFrom.map(a => ({ id: a.s.id, ex: exName(a.s), w: stepWord(a.s), from: titleOf(a.from) })) } }),
  rv: (() => { const r = repeats.value[u.id]; return r?.started ? { n: r.steps.length, words: r.words, screens: r.screens, next: r.next ? relDay(r.next) : '', items: r.list.map(o => ({ id: o.st.id, kind: o.kind, ex: exName(o.st), w: o.w, from: o.t.title, pct: o.pct })) } : null })(),
})))
const dockTab = ref('mem')
const missItems = (t) => { const m = missOf(t.id); return m.length ? okSteps(t).filter(s => m.includes(s.id)).map(s => ({ id: s.id, w: stepWord(s), ex: exName(s), hot: open.value?.id === t.id && misses.has(s.id) })) : [] }
const ckInfo = (id) => ckMap.value.flatMap(c => c.cks).find(k => k.id === id)
const rvInfo = (uid) => ckMap.value.find(c => c.id === uid)?.rv
// итог урока: что уйдёт в чекпоинт этой Chapter (экраны с ошибкой) — для проверки, что автоматика сработала
const stepWord = (s) => hitsOf(s, { ok: true })[0]?.text || ''
const ckLog = computed(() => {
  const x = open.value; if (!x || x.type === 'checkpoint' || x.virtual) return null
  const u = units.value.find(u => u.tasks.some(t => t.id === x.id))
  const ck = u?.tasks.slice(u.tasks.findIndex(t => t.id === x.id) + 1).find(t => t.type === 'checkpoint')
  if (!ck) return { none: true }
  return { title: ck.title || 'Чекпоинт', items: (x.steps ?? []).filter(s => misses.has(s.id)).map(s => ({ id: s.id, ex: exName(s), w: stepWord(s) })) }
})
const rvWords = computed(() => Object.keys(snap).map(k => review.items[k] && { ...review.items[k], before: snap[k], now: sOf(k), next: stateOf(review.items[k], Date.now(), { ...algo }).ivl, log: rvLog[k] ?? [] }).filter(Boolean)
  .map(x => ({ ...x, lv: x.now == null ? 'weak' : levelOf(x.now) })).sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })))
// при наведении кружок тихо проигрывается
const hover = (e, on) => { const v = e.currentTarget.querySelector('video'); if (!v) return; if (on) v.play().catch(() => {}); else { v.pause(); v.currentTime = 0 } }
const steps = computed(() => (open.value ? stepsOf(open.value) : []))
watch(open, (x) => setQ({ l: x?.virtual ? null : x?.id, s: null }))
watch(curStep, (st) => { if (!open.value || !st) return; const k = steps.value.indexOf(st); setQ({ s: k > 0 ? String(k) : null }) })
watch(() => props.id, (id) => { if (id) setQ({ c: id }) }, { immediate: true })
// курс загрузился — открыть задание из адреса (урок — на том же экране; кружок / фото — под строкой; остальное — карточкой)
function restore() {
  const id = route.query.l; if (!urlOn() || !id || open.value) return
  const x = units.value.flatMap(u => u.tasks).find(t => t.id === id); if (!x) return setQ({ l: null, s: null })
  if (x.type === 'video' || x.type === 'photo') { inline.value = x.id; return }
  if (ready(x) && state(x) !== 'todo') go(x, Math.min(Math.max(0, +route.query.s || 0), stepsOf(x).length - 1))
  else peek.value = x.id
}

// файлы курса: свой ключ в S3, «idb:» из этого браузера, остальное — как в карточках (composables/useCourseMedia)
const { resolve, local } = useCourseMedia(online)
const fileOf = (x) => (x.file ? resolve(x.file) : x.media ? local(x.media) : '')
// всё объявлено — можно грузить выбранный курс (immediate)
watch(() => props.id, loadCourse, { immediate: true })
const edit = () => router.push({ name: 'courses', query: { id: props.id } })
</script>

<template>
  <div class="cv">
    <h3 v-if="!student && !of" class="vh">Как видит ученик <small>нажмите на урок — покажется его время и «Поехали!»</small></h3>
    <!-- как в Busuu: «Уроки» и «Review» (слова и фразы из пройденных уроков) -->
    <p v-if="err" class="hint">Не удалось загрузить курс {{ err }}</p>
    <div v-if="loading || !course" class="card hint none">{{ loading ? 'Загрузка…' : 'Выберите курс выше' }}</div>

    <!-- курс тем же рельсом, что в редакторе -->
    <!-- как в Busuu: узкая колонка по центру, название курса, плашка с прогрессом, юниты — карточками -->
    <div v-else class="cr">
      <h2 class="ctl">{{ course.title }}</h2>
      <div v-if="!student && !of && done" class="mrs"><span>Ваше прохождение — по тем же правилам, что у ученика</span><button @click="resetMine">Сбросить моё прохождение</button></div>
      <div class="cpill"><svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg><b>{{ done }} из {{ total }}</b><span>·</span><b>{{ total ? Math.round(done / total * 100) : 0 }}%</b></div>
      <!-- «что попадёт в чекпоинты» — только в панели «Графики» урока (вкладка «Экраны → чекпоинты»), над путём курса не показываем -->
      <template v-for="u in units" :key="u.id">
      <section class="un" :class="{ all: u.tasks.length && u.pct === 100 }">
        <template v-if="u.title">
          <div class="uh"><b>{{ u.title }}<template v-if="u.sub">: {{ u.sub }}</template></b><svg v-if="u.tasks.length && u.pct === 100" viewBox="0 0 24 24" class="uok"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.3l3 3 6-6.5" /></svg></div>
          <div class="ubar"><i :style="{ width: u.pct + '%' }" /><em :style="{ left: u.pct + '%', transform: `translate(-${u.pct}%, -50%)` }">{{ u.pct }}%</em></div>
        </template>
        <div v-for="(x, k) in u.tasks" :key="x.id" class="vrow" :class="[state(x), { first: k === 0, last: k === u.tasks.length - 1, peek: peek === x.id }]" :style="{ '--c': (T[x.type] ?? T.lesson).c, '--d': (T[x.type] ?? T.lesson).d }">
          <button class="bead" :class="[x.type, state(x), { open: inline === x.id }]" @pointerenter="hover($event, true)" @pointerleave="hover($event, false)" :style="{ '--c': (T[x.type] ?? T.lesson).c, '--d': (T[x.type] ?? T.lesson).d }" :title="(T[x.type] ?? T.lesson).t" @click="tap(x)">
            <video v-if="(x.type === 'video' || x.ck === 'video') && fileOf(x)" :src="fileOf(x)" class="vid" muted loop playsinline preload="metadata" />
            <img v-else-if="(x.type === 'photo' || x.ck === 'photo') && fileOf(x)" :src="fileOf(x)" class="vid img" :class="{ round: x.ck }" alt="" />
            <svg v-else viewBox="0 0 24 24" class="ic" v-html="(T[x.type] ?? T.lesson).ic" />
            <svg v-if="state(x) === 'done'" viewBox="0 0 24 24" class="ok"><circle cx="12" cy="12" r="11" /><path d="M7 12.3l3.2 3.2 6.3-6.8" /></svg>
          </button>
          <div class="cap" role="button" tabindex="0" @click="tap(x)" @keydown.enter="tap(x)"><span v-if="state(x) === 'current'" class="start" :style="{ '--c': (T[x.type] ?? T.lesson).c }">Сейчас</span>{{ x.title || (T[x.type] ?? T.lesson).t }}<span v-if="x.sub" class="csub">{{ x.sub }}</span><small>{{ [(T[x.type] ?? T.lesson).t, ready(x) ? `≈ ${lessonMin(stepsOf(x))} мин` : ''].filter(Boolean).join(' · ') }}</small></div>
          <!-- карточка урока перед стартом -->
          <div v-if="peek === x.id" class="pv" @click.stop>
            <div class="pth"><small><svg viewBox="0 0 24 24" v-html="(T[x.type] ?? T.lesson).ic" />{{ (T[x.type] ?? T.lesson).t }}</small><small v-if="ready(x)">≈ {{ lessonMin(stepsOf(x)) }} мин</small></div>
            <b>{{ x.title || (T[x.type] ?? T.lesson).t }}</b>
            <p v-if="x.sub" class="psub">{{ x.sub }}</p>
            <template v-if="!ready(x)">
              <p>{{ x.type === 'tutor' ? 'Занятие с репетитором — проходит на уроке.' : x.type === 'reward' ? 'Награда за пройденный Chapter.' : x.type === 'checkpoint' ? 'Чекпоинт собирается сам из уроков этой Chapter, но в них пока нет проверяемых экранов (выбор, пары, собрать, пропуск).' : 'В этом уроке пока нет экранов — их собирают в редакторе («Интерактив»).' }}</p>
              <button v-if="canMark(x)" class="pgo" @click="markDone(x)">Готово — дальше</button>
              <button v-else-if="INTERACTIVE.includes(x.type) && !student" class="pgo ghost" @click="edit">Открыть в редакторе</button>
            </template>
            <template v-else>
            <p>{{ screens(stepsOf(x).length) }}{{ state(x) === 'done' ? ' · уже пройден' : '' }}</p>
            <p v-if="x.type === 'checkpoint'" class="cka">{{ ckParts(x).fromErrors ? `Собран сам: ${ckParts(x).auto.length} — где ${student ? 'вы ошибались' : of ? 'ученик ошибался' : 'были ошибки'} в уроках Chapter` : `Собран сам из уроков Chapter: ${ckParts(x).auto.length}` }}{{ ckParts(x).own.length ? ` + ${ckParts(x).own.length} от преподавателя` : '' }}</p>
            <!-- пройденный — как в Busuu: повторить навыки (в разработке) или пройти урок заново -->
            <template v-if="state(x) === 'done'">
              <button class="pgo" @click="peek = null; router.push({ name: 'review' })">Повторить навыки</button>
              <button class="pgo ghost" @click="go(x)">Пройти заново</button>
            </template>
            <button v-else-if="!of && state(x) === 'todo'" class="pgo" disabled title="Курс проходится по порядку — и учеником, и преподавателем">Сначала пройдите предыдущие</button>
            <button v-else class="pgo" @click="go(x)">Поехали!</button>
            </template>
          </div>
          <!-- открыт прямо тут: кружок крупно со звуком / фото -->
          <div v-if="inline === x.id" class="kin" @click.stop>
            <video v-if="x.type === 'video' && fileOf(x)" :src="fileOf(x)" class="kbig" autoplay playsinline @click="$event.target.paused ? $event.target.play() : $event.target.pause()" @ended="$event.target.currentTime = 0" />
            <img v-else-if="x.type === 'photo' && fileOf(x)" :src="fileOf(x)" class="pbig" alt="" />
            <p v-else class="hint">{{ x.type === 'video' ? 'Кружок ещё не загружен' : 'Фото ещё не загружено' }}</p>
            <button v-if="canMark(x)" class="pgo" @click="markDone(x)">Посмотрел — дальше</button>
          </div>
        </div>
      </section>
      <!-- «Повторяй изученный материал» (как в Busuu): слова и упражнения Chapter, которым пора, — проходится как урок -->
      <div v-if="repeats[u.id]?.started" class="rpt" :class="{ due: repeats[u.id].steps.length, on: peek === 'rv-' + u.id }" role="button" tabindex="0" @click="peek = peek === 'rv-' + u.id ? null : 'rv-' + u.id" @keydown.enter="peek = peek === 'rv-' + u.id ? null : 'rv-' + u.id">
        <span class="rpi" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /><path d="M9 12.5l2 2 4-4.5" /></svg></span>
        <div class="rpt-t">
          <span v-if="repeats[u.id].steps.length" class="rec">★ Рекомендовано</span>
          <b>Повторяй изученный материал</b>
          <p v-if="repeats[u.id].steps.length">Пора повторить: {{ repeats[u.id].words ? repeats[u.id].words + ' ' + plural(repeats[u.id].words, 'слово', 'слова', 'слов') : '' }}{{ repeats[u.id].words && repeats[u.id].screens ? ' и ' : '' }}{{ repeats[u.id].screens ? repeats[u.id].screens + ' ' + plural(repeats[u.id].screens, 'упражнение', 'упражнения', 'упражнений') : '' }}. Интервальное повторение (FSRS) возвращает то, что начинает забываться.</p>
          <p v-else>Повторять пока нечего — всё свежее{{ repeats[u.id].next ? `, следующее ${relDay(repeats[u.id].next)}` : '' }}.</p>
        </div>
      </div>
      <div v-if="peek === 'rv-' + u.id" class="pv rpv" style="--c: #9747ff; --d: #6b3fd1" @click.stop>
        <div class="pth"><small>Повторение · {{ u.title || 'Chapter' }}</small><small v-if="repeats[u.id].steps.length">≈ {{ lessonMin(repeats[u.id].steps) }} мин</small></div>
        <ul v-if="repeats[u.id].list.length" class="rpl"><li v-for="o in repeats[u.id].list.slice(0, RV_MAX)" :key="o.st.id"><i :class="o.kind" /><b>{{ o.w || '—' }}</b><span>{{ exName(o.st) }} · {{ o.t.title }}</span><em>{{ o.pct == null ? 'ошибка' : o.pct + '%' }}</em></li></ul>
        <p v-if="repeats[u.id].list.length > RV_MAX" class="psub">и ещё {{ repeats[u.id].list.length - RV_MAX }} — в следующий раз</p>
        <button v-if="repeats[u.id].steps.length && !of" class="pgo" @click="goRepeat(repeats[u.id])">Повторить</button>
        <p v-else-if="!repeats[u.id].steps.length" class="psub">Слова и упражнения вернутся сюда сами, когда начнут забываться.</p>
      </div>
      </template>
      <p v-if="!units.length" class="hint none">В курсе пока нет заданий</p>
    </div>

    <!-- открытое задание — во весь экран, как в Busuu -->
    <Teleport to="body">
      <div v-if="open" class="full" :class="{ split: rvChart && steps.length && !of && auth.role === 'teacher' }" :style="{ '--pw': panelW + 'px' }">
        <!-- преподаватель: график Review сверху урока — сразу видно, куда ушло слово после ответа (как график колоды в сессии) -->
        <template v-if="steps.length && !of && auth.role === 'teacher'">
          <button class="rvt" :class="{ on: rvChart }" title="График слов Review: куда ушло слово после ответа" @click="rvChart = !rvChart">{{ rvChart ? 'Скрыть графики' : 'Графики' }}</button>
          <div v-if="rvChart" class="spl" title="Потяните, чтобы изменить ширину" @pointerdown="dragSplit" />
          <div v-if="rvChart" class="rvd">
            <div class="dtabs" role="tablist"><button role="tab" :aria-selected="dockTab === 'mem'" :class="{ on: dockTab === 'mem' }" @click="dockTab = 'mem'">График запоминания</button><button role="tab" :aria-selected="dockTab === 'curve'" :class="{ on: dockTab === 'curve' }" @click="dockTab = 'curve'">Слово сейчас</button><button role="tab" :aria-selected="dockTab === 'words'" :class="{ on: dockTab === 'words' }" @click="dockTab = 'words'">Где сейчас слова</button><button role="tab" :aria-selected="dockTab === 'ck'" :class="{ on: dockTab === 'ck' }" @click="dockTab = 'ck'">Путь → чекпоинты</button></div>
            <MemoryChart v-if="dockTab === 'mem'" :focus="focusKey" :items="dictWords" :cfg="{ retention: algo.retention, maxDays: algo.maxDays }" dock />
            <WordNow v-else-if="dockTab === 'curve'" :focus="focusKey" :items="dictWords" :cfg="{ retention: algo.retention, maxDays: algo.maxDays }" :lesson="open.title" dock />
            <ReviewChart v-else-if="dockTab === 'words'" :items="dictWords" :cfg="{ retention: algo.retention, maxDays: algo.maxDays }" :lesson="open.title" dock />
            <!-- путь курса, как у ученика; справа: у урока — экраны с ошибкой (→ в чекпоинт), у чекпоинта и «Повторения» — что в них сейчас -->
            <div v-else class="ckp">
              <p class="ckh">Ошибка в уроке → экран уходит в чекпоинт своей Chapter. Слова и упражнения, которым пора по FSRS, — в «Повторение».</p>
              <template v-for="u in units" :key="'p' + u.id">
                <section class="un" :class="{ all: u.tasks.length && u.pct === 100 }">
                  <template v-if="u.title">
                    <div class="uh"><b>{{ u.title }}<template v-if="u.sub">: {{ u.sub }}</template></b></div>
                    <div class="ubar"><i :style="{ width: u.pct + '%' }" /><em :style="{ left: u.pct + '%', transform: `translate(-${u.pct}%, -50%)` }">{{ u.pct }}%</em></div>
                  </template>
                  <div v-for="(x, k) in u.tasks" :key="x.id" class="vrow" :class="[state(x), { first: k === 0, last: k === u.tasks.length - 1 }]" :style="{ '--c': (T[x.type] ?? T.lesson).c, '--d': (T[x.type] ?? T.lesson).d }">
                    <span class="bead" :class="[x.type, state(x), { live: open.id === x.id }]" :style="{ '--c': (T[x.type] ?? T.lesson).c, '--d': (T[x.type] ?? T.lesson).d }">
                      <svg viewBox="0 0 24 24" class="ic" v-html="(T[x.type] ?? T.lesson).ic" />
                      <svg v-if="state(x) === 'done'" viewBox="0 0 24 24" class="ok"><circle cx="12" cy="12" r="11" /><path d="M7 12.3l3.2 3.2 6.3-6.8" /></svg>
                      <em v-if="missItems(x).length" class="mb">{{ missItems(x).length }}</em>
                    </span>
                    <div class="cap"><span v-if="open.id === x.id" class="start" style="--c: #1cb0f6">Открыт</span>{{ x.title || (T[x.type] ?? T.lesson).t }}<small>{{ (T[x.type] ?? T.lesson).t }}</small></div>
                    <div class="sd">
                      <template v-if="x.type === 'checkpoint' && ckInfo(x.id)">
                        <div class="sbx ck"><h4>{{ ckInfo(x.id).fromErrors ? 'Из ошибок' : ckInfo(x.id).items.length ? 'Ошибок нет — авто' : 'Пусто' }} · {{ ckInfo(x.id).items.length + ckInfo(x.id).own }} {{ plural(ckInfo(x.id).items.length + ckInfo(x.id).own, 'экран', 'экрана', 'экранов') }}</h4>
                          <div class="chs"><span v-for="i in ckInfo(x.id).items" :key="i.id" class="chp" :class="{ au: !ckInfo(x.id).fromErrors, hot: misses.has(i.id) }" :title="i.ex + (i.from ? ' · ' + i.from : '')">{{ i.w || i.ex }}<i>{{ i.ex }}</i></span><span v-if="ckInfo(x.id).own" class="chp own">+ {{ ckInfo(x.id).own }} от преподавателя</span></div>
                          <small v-if="!ckInfo(x.id).items.length && !ckInfo(x.id).own">В уроках нет проверяемых экранов — пройдётся кнопкой «Готово — дальше».</small>
                        </div>
                      </template>
                      <template v-else-if="missItems(x).length">
                        <div class="chs"><span v-for="i in missItems(x)" :key="i.id" class="chp" :class="{ hot: i.hot }">{{ i.w || i.ex }}<i>{{ i.ex }}</i></span><b class="to">→ в чекпоинт</b></div>
                      </template>
                      <span v-else-if="INTERACTIVE.includes(x.type) && state(x) !== 'todo'" class="chp no">ошибок нет</span>
                    </div>
                  </div>
                </section>
                <div v-if="rvInfo(u.id)" class="vrow rvr">
                  <span class="rpi" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /><path d="M9 12.5l2 2 4-4.5" /></svg></span>
                  <div class="cap">Повторение<small>{{ rvInfo(u.id).n ? `пора: ${rvInfo(u.id).words} сл. · ${rvInfo(u.id).screens} упр.` : 'пока нечего' + (rvInfo(u.id).next ? ' · следующее ' + rvInfo(u.id).next : '') }}</small></div>
                  <div class="sd"><div v-if="rvInfo(u.id).items.length" class="sbx rv"><h4>По FSRS · пора повторить</h4>
                    <div class="chs"><span v-for="i in rvInfo(u.id).items" :key="i.id" class="chp" :class="i.kind === 'screen' ? 'sc' : 'wd'" :title="i.ex + ' · ' + i.from">{{ i.w || i.ex }}<i>{{ i.pct == null ? 'ошибка' : i.pct + '%' }}</i></span></div></div></div>
                </div>
              </template>
            </div>
          </div>
        </template>
        <LessonPlayer v-if="steps.length" :key="open.id" :start="startAt" :steps="steps" :resolve="resolve" closable close-text="К курсу" :track="!of" :review="of ? null : rvWords" :ck-log="of ? null : ckLog" @answer="onAnswer" @step="curStep = $event" @done="finish(open, $event)" @close="open = null" />
        <div v-else class="sh">
          <BackButton class="x" to="К курсу (Esc)" @click="open = null" />
          <template v-if="open.type === 'video'"><video v-if="fileOf(open)" class="kr" :src="fileOf(open)" controls autoplay playsinline /><p v-else>Кружок ещё не загружен</p><b>{{ open.title }}</b></template>
          <template v-else-if="open.type === 'photo'"><img v-if="fileOf(open)" class="ph" :src="fileOf(open)" alt="" /><p v-else>Фото ещё не загружено</p><b>{{ open.title }}</b></template>
          <template v-else>
            <span class="bi" :style="{ '--c': (T[open.type] ?? T.lesson).c }"><svg viewBox="0 0 24 24" v-html="(T[open.type] ?? T.lesson).ic" /></span>
            <b>{{ open.title || (T[open.type] ?? T.lesson).t }}</b>
            <p>{{ open.type === 'tutor' ? 'Занятие с репетитором — проходит на уроке.' : open.type === 'reward' ? 'Награда за пройденный Chapter.' : 'В этом задании пока нет экранов — соберите их в редакторе («Интерактив»).' }}</p>
            <button v-if="INTERACTIVE.includes(open.type)" class="btn primary" @click="edit">Открыть в редакторе</button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cv { display: grid; gap: 10px; margin-bottom: 22px }
.vh { width: 100%; max-width: 620px; margin: 0 auto; font-size: 15px } .vh small { font-size: 12px; font-weight: 600; color: var(--hint) }
.tabs { flex-wrap: wrap; justify-self: start }
.none { text-align: center; margin: 0 }
/* курс — как рельс в редакторе */
.cr { display: grid; gap: 16px; width: 100%; max-width: 620px; margin: 6px auto 0 }
.ctl { margin: 0; font-size: 30px; font-weight: 900 }
.cpill { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border: 1.5px solid var(--border); border-radius: 14px; font-size: 16px }
.cpill svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round } .cpill span { color: var(--hint) }
.un { display: grid; padding: 22px 24px 14px; border: 1.5px solid var(--border); border-radius: 22px; background: #fff }
.un.all { border-color: #1fbe78; background: #f2fbf7 }
.uh { display: flex; align-items: center; gap: 8px; white-space: nowrap }
.uh b { font-size: 24px; font-weight: 900; overflow: hidden; text-overflow: ellipsis }
.uok { flex: none; width: 22px; height: 22px } .uok circle { fill: #1fbe78 } .uok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.ubar { position: relative; width: 100%; height: 10px; margin: 16px 0 12px; border-radius: 6px; background: #e6e6e6 } .ubar i { display: block; height: 100%; border-radius: 6px; background: #1fbe78 }
.ubar em { position: absolute; top: 50%; padding: 1px 7px; border-radius: 8px; background: #1fbe78; color: #fff; font-size: 11px; font-weight: 900; font-style: normal }
/* строка рельса: линия, кружок, подпись */
.vrow { position: relative; display: flex; flex-wrap: wrap; align-items: center; align-content: flex-start; gap: 22px; min-height: 130px; padding-left: 6px }
.vrow::before { content: ''; position: absolute; left: 45px; top: 0; bottom: 0; width: 4px; margin-left: -2px; background: #e6e6e6; z-index: 0 }
.vrow.done::before, .vrow.current::before { background: #1fbe78 } .vrow.current::before { bottom: auto; height: 65px }
.vrow.first::before { top: 65px } .vrow.last::before { bottom: auto; height: 65px } .vrow.first.current::before { display: none } .vrow.first.last::before { display: none }
.bead { position: relative; z-index: 1; flex: none; display: grid; place-items: center; width: 68px; height: 68px; padding: 0; border: 0; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 0 0 3px #fff, 0 0 0 6px #1fbe78; cursor: pointer }
.bead:hover { filter: brightness(1.05) }
.bead.todo { background: #f1f1f1; color: #b7b7b7; box-shadow: 0 0 0 3px #fff, 0 0 0 6px #e2e2e2 }
.bead.current { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 12px color-mix(in srgb, var(--c) 18%, transparent); animation: softpulse 2.4s ease-in-out infinite }
/* текущий урок — мягко «дышит», строка подсвечена, как в Busuu */
@keyframes softpulse { 0%, 100% { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 9px color-mix(in srgb, var(--c) 24%, transparent) } 50% { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 17px color-mix(in srgb, var(--c) 7%, transparent) } }
.vrow.current:not(.peek) { margin: 0 -14px; padding-left: 20px; padding-right: 14px; border-radius: 18px; background: #eef4fd } .vrow.current:not(.peek)::before { left: 59px }
.bead.photo { border-radius: 16px }
.ic { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
.vid { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: #000 } .vid.img { border-radius: 16px } .vid.img.round { border-radius: 50% }
.bead.todo .vid { filter: grayscale(1); opacity: .6 }
.ok { position: absolute; left: 50%; bottom: -12px; width: 22px; height: 22px; margin-left: -11px; pointer-events: none; z-index: 2 }
.ok circle { fill: #1fbe78; stroke: #fff; stroke-width: 2 } .ok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.vrow > .bead { margin: 31px 0 }
.pgo:disabled { opacity: .55; cursor: default }
.cka { font-size: 13px; font-weight: 800; opacity: .9 }
.kin { flex: 0 0 100%; padding: 4px 0 18px 64px; position: relative; z-index: 1 } .kin .pgo { margin-top: 10px; max-width: 280px; --d: #1a8bc9 }
.kbig { display: block; width: 260px; height: 260px; border-radius: 50%; object-fit: cover; background: #000; cursor: pointer; box-shadow: 0 0 0 4px #fff, 0 0 0 7px #2aabee }
.pbig { display: block; max-width: 100%; max-height: 420px; border-radius: 16px }
.bead.open { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 12px color-mix(in srgb, var(--c) 18%, transparent) }
.cap { flex: 0 1 auto; display: grid; justify-items: start; gap: 3px; padding: 0; border: 0; background: none; font: inherit; text-align: left; font-size: 17px; font-weight: 800; color: #252a31; cursor: pointer }
.csub { font-size: 15px; font-weight: 500; color: #3b4048 } .pv .psub { margin: -2px 0 0; font-size: 16px; font-weight: 500; opacity: 1 }
.cap small { font-size: 14px; font-weight: 500; color: #4b5563 }
.start { margin-bottom: 4px; padding: 2px 8px; border-radius: 6px; background: var(--c); color: #fff; font-size: 10px; font-weight: 900; text-transform: uppercase }
/* карточка урока перед стартом (как в Busuu) */
.vrow.peek { margin: 0 -14px; padding-left: 20px; padding-right: 14px; border-radius: 18px; background: color-mix(in srgb, var(--c) 9%, #fff) }
.vrow.peek::before { left: 59px }
.pv { position: relative; z-index: 2; flex: 0 0 100%; display: grid; gap: 6px; margin: -14px 0 18px; padding: 18px 20px 20px; border-radius: 18px; background: var(--c); color: #fff; box-shadow: 0 10px 28px color-mix(in srgb, var(--c) 35%, transparent) }
.pv::before { content: ''; position: absolute; left: 30px; top: -9px; border: 10px solid transparent; border-top: 0; border-bottom-color: var(--c) }
.pth { display: flex; justify-content: space-between; align-items: center; gap: 10px }
.pth small:first-child { display: flex; align-items: center; gap: 6px } .pth svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
.pgo.ghost { background: transparent; color: #fff; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .85) }
.pv small { font-size: 12px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; opacity: .85 }
.pv b { font-size: 22px; font-weight: 900; line-height: 1.2 } .pv p { margin: 0 0 8px; font-size: 14px; font-weight: 600; opacity: .9 }
.pgo { width: 100%; padding: 14px; border: 0; border-radius: 14px; background: #fff; color: var(--d); font: inherit; font-size: 16px; font-weight: 900; cursor: pointer; box-shadow: 0 3px 0 rgba(0, 0, 0, .12) }
.pgo:active { transform: translateY(2px); box-shadow: none }
/* во весь экран */
.full { position: fixed; inset: 0; z-index: 1000; background: #fff; display: flex; flex-direction: column }
.full :deep(.lp) { flex: 1; min-height: 0; height: auto }
.rvt { position: absolute; top: 12px; right: 14px; z-index: 3; border: 0; border-radius: 12px; padding: 8px 12px; background: #eaf6fe; color: #1278b0; font: inherit; font-size: 13px; font-weight: 900; cursor: pointer } .rvt.on { background: #1cb0f6; color: #fff }
.rvd { flex: none; max-height: 55vh; overflow: auto; padding: 56px 14px 6px; border-bottom: 1px solid #eef0f3 }
.rvd > * { max-width: 760px; margin: 0 auto }
.spl { display: none }
@media (min-width: 900px) {                    /* компьютер: урок слева, графики справа, между ними — перегородка (тянется) */
  .full.split { flex-direction: row }
  .full.split > :deep(.lp), .full.split > .sh { order: 1; flex: 1 1 0; min-width: 0; width: auto }
  .full.split .spl { order: 2; display: block; flex: none; width: 10px; z-index: 2; cursor: col-resize; background: #eef0f3; touch-action: none; position: relative }
  .full.split .spl::after { content: ''; position: absolute; left: 3.5px; top: 50%; width: 3px; height: 40px; margin-top: -20px; border-radius: 2px; background: #b5bac1 }
  .full.split .spl:hover, .full.split .spl:active { background: #d6ecfb }
  .full.split .rvd { order: 3; flex: 0 0 var(--pw); width: var(--pw); min-width: 0; max-width: 72vw; max-height: none; height: 100%; box-sizing: border-box; border-bottom: 0; padding-top: 0 }      /* ширина — ровно как задана (не сжимается уроком); сверху место под «Сейчас здесь» */
  .full.split .rvd > * { max-width: none } .full.split .dtabs { padding-right: 150px }      /* справа сверху — кнопки «Сейчас здесь» */
}
/* вкладки панели — как в DevTools: плоская полоса сверху, активная подчёркнута */
.dtabs { position: sticky; top: 0; z-index: 3; display: flex; overflow-x: auto; scrollbar-width: none; margin: 0 -14px 10px; padding: 0 8px; background: #f7f8fa; border-bottom: 1px solid #e3e6ea }
.dtabs button { flex: none; font: inherit; font-size: 12.5px; font-weight: 700; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 8px 11px 7px; background: none; color: #5f6368; cursor: pointer; white-space: nowrap }
.dtabs button:hover { background: #eceef1; color: #303338 } .dtabs button.on { color: #1a73e8; border-bottom-color: #1a73e8 }
.mrs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 12.5px; font-weight: 700; color: var(--hint) } .mrs button { border: 0; border-radius: 10px; padding: 6px 12px; background: #f0f1f3; color: #555; font: inherit; font-size: 12.5px; font-weight: 900; cursor: pointer }
/* «Путь → чекпоинты» в панели: тот же путь, компактнее, справа — что куда попадает */
.ckp { display: grid; gap: 10px } .ckh { margin: 0; font-size: 12px; font-weight: 700; color: var(--hint) }
.ckp .un { padding: 14px 16px 6px; border-radius: 16px } .ckp .uh b { font-size: 17px } .ckp .ubar { height: 8px; margin: 10px 0 6px }
.ckp .vrow { min-height: 84px; gap: 12px; flex-wrap: nowrap } .ckp .vrow::before { left: 33px } .ckp .vrow.current::before { height: 42px } .ckp .vrow.first::before { top: 42px } .ckp .vrow.last::before { height: 42px }
.ckp .vrow > .bead { margin: 18px 0; width: 48px; height: 48px; cursor: default } .ckp .ic { width: 22px; height: 22px } .ckp .ok { width: 18px; height: 18px; margin-left: -9px; bottom: -9px }
.ckp .bead.current { animation: none } .ckp .bead.live { box-shadow: 0 0 0 3px #fff, 0 0 0 6px #1cb0f6, 0 0 0 11px rgba(28, 176, 246, .2) }
.ckp .vrow.current { margin: 0; padding-left: 6px; padding-right: 0; background: none } .ckp .vrow.current::before { left: 33px }
.ckp .cap { flex: 0 0 132px; min-width: 0; font-size: 14px; cursor: default } .ckp .cap small { font-size: 11.5px }
.mb { position: absolute; top: -5px; right: -7px; z-index: 3; min-width: 18px; height: 18px; padding: 0 4px; box-sizing: border-box; border-radius: 9px; background: #ff4b4b; color: #fff; font-size: 11px; font-weight: 900; font-style: normal; display: grid; place-items: center; box-shadow: 0 0 0 2px #fff }
.sd { flex: 1; min-width: 0; padding: 8px 0 }
.chs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px }
.chp { display: inline-flex; align-items: baseline; gap: 5px; max-width: 100%; padding: 3px 8px; border-radius: 7px; font-size: 12px; font-weight: 800; background: #fff5f5; box-shadow: inset 2px 0 0 #ff4b4b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background .3s }
.chp i { font-style: normal; font-size: 10.5px; font-weight: 700; color: #e53935 } .chp.au { background: #f3f4f6; box-shadow: inset 2px 0 0 #b5bac1 } .chp.au i { color: #888 }
.chp.wd { background: #f2f9ff; box-shadow: inset 2px 0 0 #1cb0f6 } .chp.sc { background: #f6f1ff; box-shadow: inset 2px 0 0 #9747ff } .chp.own { background: #efe8ff; box-shadow: none; color: #6b3fd1 }
.chp.no { background: #f3f4f6; box-shadow: none; color: #9aa0a8 } .chp.hot { background: #fff0c2; animation: ckpop .5s ease-out } @keyframes ckpop { from { transform: scale(.9) } }
.to { font-size: 11px; font-weight: 900; color: #e53935 }
.sbx { display: grid; gap: 5px; padding: 8px 10px; border-radius: 10px; background: #fff8ef; box-shadow: inset 0 0 0 1.5px #ffd59a } .sbx h4 { margin: 0; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .02em; color: #b06a00 } .sbx small { font-size: 11.5px; color: var(--hint); font-weight: 600 }
.sbx.rv { background: #f7f2ff; box-shadow: inset 0 0 0 1.5px #d8c3ff } .sbx.rv h4 { color: #6b3fd1 }
.ckp .rvr { min-height: 70px; padding: 0 16px; border-radius: 16px; background: #f7f3ff; box-shadow: inset 0 0 0 1.5px #e6dcff } .ckp .rvr::before { display: none } .ckp .rvr .rpi { width: 44px; height: 44px; margin-left: 2px } .ckp .rvr .rpi svg { width: 24px; height: 24px }
.rpt { display: flex; align-items: center; gap: 16px; margin: 12px 0; padding: 16px 18px; border-radius: 18px; background: #f4f7fb; box-shadow: inset 0 0 0 1.5px #e3e8ef; cursor: pointer; transition: background .15s }
.rpt:hover, .rpt.on { background: #ecf3fc } .rpt.due { background: #f3efff; box-shadow: inset 0 0 0 1.5px #ddd0ff } .rpt.due:hover, .rpt.due.on { background: #ebe4ff }
.rpi { flex: none; width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: #fff; box-shadow: 0 2px 0 #dfe3e8 } .rpi svg { width: 28px; height: 28px; fill: none; stroke: #9747ff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
.rpt:not(.due) .rpi svg { stroke: #9aa0a8 }
.rpt-t { display: grid; gap: 3px; min-width: 0 } .rpt-t b { font-size: 16px; font-weight: 900 } .rpt-t p { margin: 0; font-size: 13.5px; font-weight: 600; color: #5f6368; line-height: 1.45 }
.rec { justify-self: start; font-size: 11px; font-weight: 900; color: #fff; background: #6b3fd1; padding: 2px 9px; border-radius: 8px }
.rpv { margin: -4px 0 12px } .rpv::before { left: 40px }
.rpl { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px }
.rpl li { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 10px; background: rgba(255, 255, 255, .16); font-size: 13px } .rpl i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #8fdcff } .rpl i.screen { background: #fff }
.pv .rpl b { flex: none; max-width: 40%; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .rpl span { flex: 1; min-width: 0; opacity: .85; font-weight: 600; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .rpl em { font-style: normal; font-weight: 900; font-size: 12px; background: rgba(255, 255, 255, .2); padding: 1px 6px; border-radius: 6px }
.sh { position: relative; flex: 1; display: grid; align-content: center; justify-items: center; gap: 12px; padding: 30px 24px; text-align: center }
.sh p { margin: 0; color: var(--hint); font-weight: 600; font-size: 14px } .sh b { font-size: 18px }
.x { position: absolute; left: 18px; top: 18px }
/* на компьютере меню приложения слева остаётся видно поверх урока — в любой момент можно уйти в другой раздел */
@media (min-width: 1024px) { .full { z-index: 9; padding-left: 116px } .x { left: 134px } }
@media (min-width: 1024px) { .rvt { top: auto; right: auto; bottom: 24px; left: 140px } }      /* справа сверху на компьютере — панель «Сейчас здесь» (курсор, чат); кнопка — внизу слева, у «Продолжить» */
.kr { width: min(360px, 80vw); height: min(360px, 80vw); border-radius: 50%; object-fit: cover; background: #000 }
.ph { max-width: min(900px, 92vw); max-height: 75vh; border-radius: 14px }
.bi { display: grid; place-items: center; width: 80px; height: 80px; border-radius: 50%; background: var(--c); color: #fff }
.bi svg { width: 38px; height: 38px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
</style>

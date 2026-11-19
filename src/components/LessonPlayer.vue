<script setup>
// Интерактивный урок глазами ученика (как в Busuu): сверху полоска прогресса, экран за экраном, снизу «Продолжить».
// Сам экран рисует шаблон своего типа (src/exercises/<тип>/<Тип>.vue): плеер даёт ему состояние, действия ученика и проверку (providePlay).
// Тот же плеер с edit — правка экрана на ветке урока (LessonRail): шаблон показывает поля на месте текста, подвал — от ветки.
// Последний экран — всегда итог урока: время, сколько верно, слова урока.
// В конструкторе (single) показывает один экран без перемешивания — чтобы правки было видно на месте.
// На ветке урока в редакторе (embedded) — один живой экран: отвечаешь, «Продолжить» → emit('next', счёт экрана);
// прогресс (pct) и итог (stats) приходят от ветки; на итоге — «Заново» и «Во весь экран».
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useTelegram } from '../composables/useTelegram'
import { sfxResult, sfxTick } from '../composables/useSfx'
import BackButton from './BackButton.vue'
import { review as rvStore, toggleFav } from '../stores/review'
import { keyOf } from '../utils/review'
import { exOf } from '../exercises'
import { providePlay, useEdit } from '../exercises/ctx'
import { checkAnswer } from '../utils/gemini'
import { shuffle, orderParts, gapParts, gapOk, gapList, BOOK, twLayout, twCheck, speechMatch } from '../utils/lesson'

const props = defineProps({
  steps: { type: Array, required: true },
  resolve: { type: Function, required: true },            // (ссылка, 'image' | 'audio' | 'video') → адрес для <img> / <audio> / <video>
  start: { type: Number, default: 0 },
  single: Boolean,                                        // просмотр одного экрана в конструкторе
  name: { type: String, default: '' },
  closable: Boolean, closeText: { type: String, default: '' },   // closeText — вместо ✕ наша кнопка «назад» (стрелка), подпись — в подсказке
  embedded: Boolean, pct: { type: Number, default: null }, stats: { type: Object, default: null },
  again: Boolean,                                         // на ветке в редакторе: ошибка → экран повторится в конце ветки (emit next с again)
  track: Boolean,                                         // ученик проходит урок — ответы уходят в Review (emit 'answer')
  ckLog: { type: Object, default: null },                 // итог: что уйдёт в чекпоинт Chapter — { title, items: [{ ex, w }] } или { none: true }
  review: { type: Array, default: null },                 // итог: слова, которые урок записал в Review, — { text, tr, kind, audio, before, now, lv } (CourseViewer)
  mini: Boolean,                                          // миниатюра экрана (ExerciseMini): всё по порядку, без случайностей и клавиш — тот же экран, только уменьшенный
  edit: Boolean,                                          // правка на ветке (LessonRail): тот же экран, поля правятся на месте; подвал — от ветки (slot foot)
})
const emit = defineEmits(['close', 'done', 'next', 'restart', 'full', 'answer', 'miss', 'step'])

const i = ref(props.start), t0 = Date.now(), endT = ref(0)
const dn = (d) => (d < 10 ? String(Math.round(d * 10) / 10).replace('.', ',') : Math.round(d)) + ' дн'      // память слова (стабильность FSRS) в днях
const score = reactive({ ok: 0, all: 0 })
// Как в Busuu: ошибся в упражнении — оно встаёт в конец урока, пока не ответишь верно (только при прохождении урока, не в редакторе)
const retry = !props.single && !props.embedded
const seq = ref(props.steps.map((_, k) => k))                          // очередь экранов: номера в steps, ошибочные добавляются в конец
watch(() => props.steps, (v) => { seq.value = v.map((_, k) => k) })

const cur = computed(() => (retry ? seq.value[i.value] : i.value))
const step = computed(() => props.steps[cur.value])
watch(step, (v) => emit('step', v ?? null), { immediate: true })          // какой экран сейчас — графики сверху урока переключаются на его слово
const isFinal = computed(() => i.value >= (retry ? seq.value.length : props.steps.length))
const pct = computed(() => props.pct != null ? props.pct : props.single ? (props.steps.length ? Math.round(Math.min(i.value + 1, props.steps.length) / (props.steps.length + 1) * 100) : 0)
  : Math.round(i.value / ((retry ? seq.value.length : props.steps.length) || 1) * 100))
const src = (v, k) => (v ? props.resolve(v, k) : '')

// ---- состояние текущего экрана ----
let au = null
const mine = reactive({ ok: 0, all: 0 })           // счёт этого экрана (для ветки в редакторе)
const { hapticResult, hapticTick } = useTelegram()      // виброотклик на ответы (в Профиле можно выключить)
const st = reactive({ wrong: [], picked: null, done: false, left: null, right: null, matched: [], bad: [], order: [], L: [], R: [], pool: [], built: [], typed: '', tys: [], res: null, showTr: false, hint: false, mode: '', text: '', place: {}, sel: null, tw: [], twr: null, ai: null, busy: false })          // ai, busy — «Ответ по смыслу» (Gemini)
function setup() {
  Object.assign(st, { wrong: [], picked: null, done: false, left: null, right: null, matched: [], bad: [], built: [], typed: '', tys: [], res: null, showTr: false, hint: false, mode: '', text: '', place: {}, sel: null, tw: [], twr: null, ai: null, busy: false }); Object.assign(mine, { ok: 0, all: 0 })
  recStop(true); rec.url = ''; rec.err = ''; rec.heard = ''; rec.miss = false
  const s = step.value; if (!s || props.edit) return
  if (s.kind === 'choice') { const idx = (s.opts ?? []).map((_, k) => k); st.order = props.single || props.mini ? idx : shuffle(idx) }
  if (s.kind === 'pairs') {
    const idx = full(s).map((_, k) => k)
    st.L = props.single || props.mini ? idx : shuffle(idx); st.R = props.single || props.mini ? idx.slice().reverse() : shuffle(idx)
  }
  if (s.kind === 'order') { const idx = orderParts(s).map((_, k) => k); let o = props.mini ? idx.slice().reverse() : shuffle(idx); if (idx.length > 1 && o.every((v, k) => v === k)) o = idx.slice(1).concat(0); st.pool = o }
  const keep = props.single || props.mini || (props.embedded && s.bk)          // в редакторе книжные — в том же порядке, что в правке (18.11.2026: окно «менялось»)
  if (s.kind === 'gap' && s.opts?.length) { const idx = s.opts.map((_, k) => k); st.order = keep ? idx : shuffle(idx) }
  if (s.kind === 'sort' && s.tw) st.tw = twLayout(s).cols.map(c => Array(c.need).fill(''))          // «Заполни таблицу»: что ученик вписал, по колонкам
  if (s.kind === 'odd' || s.kind === 'sort') { const idx = (s.kind === 'odd' ? s.opts : s.items ?? []).map((_, k) => k); st.order = keep || s.mix === false ? idx : shuffle(idx) }
  if (s.kind === 'intro' || s.kind === 'tip') { st.done = true; if (props.track) emit('answer', { step: s, ok: null }) }
  if (s.kind === 'answer' && s.bk && s.bs === 'page') st.mode = 'write'          // Т4 «Answer the questions about you» — сразу пишем, как в книге
  if (s.kind === 'speak' && props.track) emit('answer', { step: s, ok: null })          // «Повтори» — без оценки, но «Продолжить» — только когда ученик правда что-то сказал (17.11.2026: молчание засчитывалось)          // без оценки — только «встречалось»
  if (!props.single && !props.embedded) autoplay()
}
const full = (s) => (s.pairs ?? []).filter(p => p.a?.trim() && p.b?.trim())

// звук вопроса / нового слова — сразу при показе экрана (если браузер разрешит)
function autoplay() {
  au?.pause(); au = null
  const s = step.value, a = s?.kind === 'choice' ? (s.ask === 'audio' ? qAudio(s) : '') : ['intro', 'order', 'gap', 'speak'].includes(s?.kind) ? s.audio : ''
  if (!a || s.video) return
  au = new Audio(src(a, 'audio')); au.play().catch(() => {})
}
onUnmounted(() => au?.pause())
const qAudio = (s) => s.audio || s.opts?.[s.ans ?? 0]?.audio || ''

// ---- выбор ----
function pick(k) {
  if (st.done) return
  st.picked = k; verdict(k === (step.value.ans ?? 0))
}
const right = computed(() => step.value?.kind === 'choice' ? st.picked === (step.value.ans ?? 0) : st.res === true)
const checks = computed(() => ['choice', 'order', 'gap', 'odd', 'sort', 'kp'].includes(step.value?.kind))

// ---- пары ----
function tap(side, k) {
  if (st.matched.includes(k) && side) return
  st[side] = st[side] === k ? null : k
  if (st.left == null || st.right == null) return
  const a = st.left, b = st.right; st.left = st.right = null; score.all++; mine.all++
  if (a === b) { st.matched.push(a); score.ok++; mine.ok++; if (st.matched.length === full(step.value).length) { st.done = true; hapticResult(true) } else { hapticTick(); sfxTick() } }      // пара сошлась — лёгкий щелчок, все пары — «верно»
  else { hapticResult(false); sfxResult(false); st.bad = [a, 'r' + b]; if (!st.wrong.includes(a)) st.wrong.push(a); setTimeout(() => { st.bad = [] }, 550) }
}

// ---- проверка ответа (choice / order / gap): верно → зелёный низ, нет → красный и правильный ответ ----
function verdict(ok) { hapticResult(ok); st.res = ok; st.done = true; score.all++; mine.all++; if (ok) { score.ok++; mine.ok++ } }

// ---- собери фразу ----
const pw = computed(() => orderParts(step.value))
function put(k) { if (st.done) return; st.pool = st.pool.filter(x => x !== k); st.built.push(k); if (!st.pool.length) verdict(st.built.map(x => pw.value[x]).join(' ') === pw.value.join(' ')) }          // по тексту — одинаковые буквы можно ставить в любом порядке
function back(k) { if (st.done) return; st.built = st.built.filter(x => x !== k); st.pool.push(k) }

// ---- пропуск ----
const gp = computed(() => gapParts(step.value?.phrase))
function fill(k) { if (st.done) return; st.picked = k; st.typed = step.value.opts[k].w; verdict(gapOk(st.typed, gp.value.gap)) }
// «Закончи предложение»: пропусков может быть два, в каждом — несколько верных через «/» (упражнения по учебнику)
const gl = computed(() => gapList(step.value?.phrase))
const gaps = computed(() => gl.value.filter(x => x.g != null))
const typedAll = computed(() => gaps.value.length > 0 && gaps.value.every(x => (st.tys[x.i] ?? '').trim()))
function check() { if (st.done || !typedAll.value) return; st.typed = st.tys.join(' '); verdict(gaps.value.every(x => gapOk(st.tys[x.i], x.g))) }
const gapOkAt = (x) => gapOk(st.tys[x.i], x.g)

// ---- запись голоса («Повтори за диктором», «Ответь на вопрос» устно) ----
const rec = reactive({ on: false, url: '', err: '', heard: '', miss: false }); let mr = null, chunks = []
// Распознавание речи (18.11.2026): пока ученик говорит, слова появляются на экране; «Повтори» — слова фразы зеленеют, «Ответь устно» — сказанное становится ответом.
// Web Speech API (Chrome, Android, Safari); где его нет — как раньше: только запись и проверка, что голос был
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
let sr = null, srWait = null, srBroken = false
const SPEAK_OK = 0.8          // «Повтори»: засчитываем, когда сказано ≥ 80% слов фразы (у коротких фраз — все)
function srStart() {
  srBroken = !SR; if (!SR) return
  try {
    const r = new SR(); r.lang = 'en-US'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1
    r.onresult = (e) => {
      let s = ''; for (const x of e.results) s += x[0].transcript + ' '; rec.heard = s.replace(/\s+/g, ' ').trim(); rec.miss = false
      if (step.value?.kind === 'speak' && rec.on && speechMatch(step.value.phrase, rec.heard).score >= SPEAK_OK) recStop()          // сказал фразу — сами останавливаем
    }
    r.onerror = (e) => { if (e?.error !== 'no-speech' && e?.error !== 'aborted') srBroken = true }          // нет сети / доступа / не поддерживается — проверяем только, что голос был
    r.onend = () => { if (sr === r) sr = null; const f = srWait; srWait = null; f?.() }
    r.start(); sr = r
  } catch { sr = null }
}
// Закладка «в избранное» на экране «Новое слово» (как в Busuu): только когда ученик проходит урок (track) — в превью редактора её нет
const favKey = computed(() => (props.track && step.value?.kind === 'intro' && step.value.word?.trim() ? keyOf(step.value.word) : ''))
const favOn = computed(() => !!(favKey.value && rvStore.items[favKey.value]?.fav))
const favToggle = () => { if (favKey.value) toggleFav(favKey.value, { step: step.value }) }
const said = computed(() => (step.value?.kind === 'speak' && rec.heard ? speechMatch(step.value.phrase, rec.heard) : null))
// Слышно ли голос: пока пишем, меряем громкость (Web Audio). Набралось меньше ~0,4 с речи — запись не засчитываем
const VOICE_MS = 400, VOICE_RMS = 0.025
let vad = null
function vadStart(stream) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC(), an = ctx.createAnalyser(); an.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Float32Array(an.fftSize), v = { ctx, ms: 0, t: performance.now(), timer: 0 }
    v.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf); let sum = 0; for (const x of buf) sum += x * x
      const now = performance.now(); if (Math.sqrt(sum / buf.length) > VOICE_RMS) v.ms += now - v.t; v.t = now
    }, 50)
    vad = v
  } catch { vad = null }          // Web Audio нет — проверить нечем, засчитываем по длине записи
}
function vadStop() { if (!vad) return null; clearInterval(vad.timer); vad.ctx.close?.().catch(() => {}); const ms = vad.ms; vad = null; return ms }
async function recToggle() {
  if (rec.on) return recStop()
  rec.err = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mr = new MediaRecorder(stream); chunks = []; const t0 = performance.now()
    vadStart(stream)
    mr.ondataavailable = (e) => chunks.push(e.data)
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const voiced = vadStop(), long = performance.now() - t0
      if (!chunks.length) return
      if (rec.url) URL.revokeObjectURL(rec.url); rec.url = URL.createObjectURL(new Blob(chunks, { type: mr?.mimeType || chunks[0]?.type || 'audio/webm' }))
      const decide = () => {          // ждём последние слова от распознавания (оно заканчивает чуть позже записи)
        const k = step.value?.kind
        if (k !== 'speak' && k !== 'answer') return
        const loud = (voiced ?? long) >= VOICE_MS
        if (k === 'speak' && !srBroken) {          // распознавание работает — засчитываем, только когда фраза совпала (18.11.2026)
          const ok = !!rec.heard && speechMatch(step.value.phrase, rec.heard).score >= SPEAK_OK
          if (ok) { st.done = true; rec.err = ''; if (props.track) emit('answer', { step: step.value, ok: true }) } /* совпала — верный ответ: память «Речи» и темы (аналитика прогресса) */ else { rec.miss = !!rec.heard; rec.err = rec.heard ? '' : 'Не расслышали — скажите ещё раз' }
          return
        }
        if (rec.heard || loud) { st.done = true; rec.err = ''; if (k === 'answer' && rec.heard) st.text = rec.heard }          // сказанное — это и есть ответ
        else rec.err = 'Не слышно — скажите вслух и запишите ещё раз'
      }
      if (sr) { srWait = decide; setTimeout(() => { if (srWait === decide) { srWait = null; decide() } }, 1500); try { sr.stop() } catch { decide() } } else decide()
    }
    rec.heard = ''; rec.miss = false; mr.start(); rec.on = true; srStart()
  } catch { rec.err = 'Нет доступа к микрофону' }
}
function recStop(drop) { if (drop && sr) { srWait = null; try { sr.abort() } catch {} sr = null } if (!mr) return; if (drop) { chunks = []; vadStop() } if (mr.state !== 'inactive') mr.stop(); mr = null; rec.on = false }
onUnmounted(() => recStop(true))
const vid = ref(null)
function again() { const v = vid.value; if (v) { v.currentTime = 0; v.play().catch(() => {}) } else if (step.value?.audio) say(step.value.audio) }
function sendText() { if (st.text.trim()) st.done = true }

// ---- дальше ----
const later = computed(() => (retry || props.again) && st.done && ['choice', 'order', 'gap', 'odd', 'sort', 'kp'].includes(step.value?.kind) && !right.value && !st.ai?.error)          // ошибка → «вернёмся в конце» (без проверки ИИ — не ошибка)
// «Ответ по смыслу» меньше 60 % возвращается в конце урока только один раз: вторая попытка снова мимо — урок идёт дальше
const kpBack = new Set()
// на ветке в редакторе повтор встаёт в конец сразу, как только ответили неверно (не ждём «Продолжить»)
watch(later, (v) => { if (v && props.embedded) emit('miss') })
function next() {
  if (props.single || !st.done) return; if (props.embedded) return emit('next', { ...mine })
  const kp = step.value?.kind === 'kp'
  if (later.value && !(kp && kpBack.has(cur.value))) { seq.value.push(cur.value); if (kp) kpBack.add(cur.value) }
  i.value++
}
const answer = computed(() => step.value?.opts?.[step.value.ans ?? 0])
const time = computed(() => { const s = props.stats ? props.stats.sec : Math.round(((endT.value || Date.now()) - t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
const acc = computed(() => { const x = props.stats ?? score; return x.all ? Math.round(x.ok / x.all * 100) : 100 })
// слова урока для итога
const words = computed(() => {
  const out = [], seen = new Set()
  const add = (w, t, a) => { w = w?.trim(); if (!w || seen.has(w)) return; seen.add(w); out.push({ w, t: t?.trim() ?? '', a }) }
  for (const s of props.steps) {
    if (s.kind === 'intro') add(s.word, s.tr, s.audio)
    if (s.kind === 'choice') { const o = s.opts?.[s.ans ?? 0]; add(o?.w, o?.t, o?.audio) }
    if (s.kind === 'pairs') full(s).forEach(p => add(p.a, p.b))
    if (s.kind === 'speak' || s.kind === 'order') add(s.phrase, s.tr, s.audio)
  }
  return out
})
const say = (a) => { au?.pause(); au = new Audio(src(a, 'audio')); au.play().catch(() => {}) }
// экран решён (или показан, если без оценки) — ответ в Review: верно / нет, у «Пар» — какие пары перепутали
watch(() => st.done, (d) => {
  const s = step.value; if (!d || !props.track || !s || !['choice', 'order', 'gap', 'pairs', 'odd', 'sort', 'kp'].includes(s.kind)) return
  emit('answer', { step: s, ok: s.kind === 'kp' && st.ai?.error ? null : s.kind === 'pairs' ? !st.wrong.length : s.kind === 'choice' ? st.picked === (s.ans ?? 0) : st.res === true, wrong: [...st.wrong] })          // ИИ не ответил — без оценки
})
// всё объявлено — теперь можно запускать (immediate вызывает setup сразу)
watch([i, () => (props.single || props.embedded ? JSON.stringify(step.value) : props.steps)], setup, { immediate: true })     // в конструкторе — заново при каждой правке
watch(() => props.start, (v) => { i.value = v })          // ветка в редакторе: экраны добавили / переставили — этот кадр показывает свой экран
watch(isFinal, (v) => { if (v && !endT.value) { endT.value = Date.now(); emit('done', { ...score }) } }, { immediate: true })
const onKey = (e) => { if (e.key === 'Enter' && !props.single && !props.embedded && !/INPUT|TEXTAREA/.test(e.target?.tagName)) isFinal.value ? emit('close') : next() }
// Тест · упражнения Насти: экран в стиле страницы учебника (кремовая бумага, номер в оранжевом кружке, задание по-английски)
const isBook = computed(() => !isFinal.value && !!step.value?.bk && !!BOOK[step.value.bk])
// «Учебник 1:1» (18.11.2026) — отдельная вкладка: оформление точно как в книге (bs: 'page'); без bs — Настин вид
const isPage = computed(() => isBook.value && step.value?.bs === 'page')
const needCheck = computed(() => !st.done && ((step.value?.kind === 'gap' && !step.value.opts?.length) || step.value?.kind === 'odd' || step.value?.kind === 'sort' || step.value?.kind === 'kp'))
// ---- книжные (экспериментальные): «Найди лишнее» и «Распредели по колонкам» ----
const sortLeft = computed(() => (step.value?.kind !== 'sort' ? 0 : step.value.tw ? st.tw.flat().filter(v => !v.trim()).length : st.order.filter(k => st.place[k] == null).length))
// «Заполни таблицу» (Настя, 18.11.2026): банк слов, образцы зачёркнуты; ученик вписывает форму в колонку — порядок в колонке не важен
const canCheck = computed(() => { const k = step.value?.kind; return k === 'kp' ? !!st.text.trim() && !st.busy : k === 'odd' ? st.picked != null : k === 'sort' ? (step.value.tw ? st.tw.flat().length > 0 : (step.value.items?.length ?? 0) > 0) && sortLeft.value === 0 : typedAll.value })
function sortPick(k) { if (!st.done) st.sel = st.sel === k ? null : k }
function sortPut(c) { if (st.done || st.sel == null) return; st.place = { ...st.place, [st.sel]: c }; st.sel = null; hapticTick?.() }
function sortBack(k) { if (st.done) return; const p = { ...st.place }; delete p[k]; st.place = p }
const sortOkAt = (k) => st.place[k] === step.value.items[k].c
function checkAny() {
  const s = step.value; if (st.done || !canCheck.value) return
  if (s.kind === 'kp') return aiCheck()
  if (s.kind === 'odd') return verdict(st.picked === (s.ans ?? 0))
  if (s.kind === 'sort' && s.tw) { st.twr = twCheck(s, st.tw); return verdict(st.twr.all) }
  if (s.kind === 'sort') return verdict((s.items ?? []).every((_, k) => sortOkAt(k)))
  check()
}
// «Ответ по смыслу»: Gemini сверяет ответ с эталоном (utils/gemini.js); от 60 % — верно. Не ответил (нет ключа, квота, сеть) — экран
// закрывается без оценки: эталон открыт, в Review и в ошибки урока ничего не идёт
async function aiCheck() {
  const s = step.value; st.busy = true
  try {
    const r = await checkAnswer({ question: s.text ?? '', reference: s.ideal ?? '', answer: st.text })
    if (step.value !== s) return
    st.ai = r; verdict(r.ok)
  } catch (e) {
    if (step.value !== s) return
    st.ai = { error: e?.nokey ? 'Проверка недоступна: нет ключа Gemini. Сравните ответ с эталоном.' : `Проверка недоступна (${e?.message || 'ошибка'}). Сравните ответ с эталоном.` }
    st.done = true
  } finally { st.busy = false }
}
onMounted(() => { if (!props.mini) addEventListener('keydown', onKey) }); onUnmounted(() => removeEventListener('keydown', onKey))

// ---- Упражнения-шаблоны (src/exercises): экран рисует шаблон своего типа, плеер даёт ему состояние и действия ----
const edApi = useEdit()
// ответ — зелёный или красный подвал и звук (один раз на ответ)
const fbState = computed(() => (isFinal.value || props.edit || st.ai?.error ? '' : (checks.value && st.done && right.value) || (step.value?.kind === 'speak' && st.done) ? 'good' : checks.value && st.done && !right.value ? 'bad' : ''))
watch(fbState, (v) => { if (v) sfxResult(v === 'good') })          // в правке на ветке — «изменено» и файлы (от LessonRail)
const ex = computed(() => (isFinal.value ? null : exOf(step.value)))
providePlay(reactive({
  st, src, say, pick, right, later, answer, tap, put, back, rec, said, recToggle, again, setVid: (el) => { vid.value = el },
  fill, check, gapOkAt, sendText, sortPick, sortPut, sortBack, sortOkAt,
  edit: computed(() => props.edit), single: computed(() => props.single), embedded: computed(() => props.embedded), track: computed(() => props.track),
  favKey, favOn, favToggle,
}))
</script>

<template>
  <div class="lp" :class="{ single, embedded, book: isBook, bkpg: isPage, bkqa: isPage && step?.bk === 'bkqa' }">
    <div class="top">
      <BackButton v-if="closable && closeText" :to="closeText" @click="emit('close')" />
      <button v-else-if="closable" class="x" title="Закрыть" @click="emit('close')"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      <div class="pb"><i :style="{ width: (isFinal ? 100 : pct) + '%' }" /></div>
    </div>
    <div v-if="isBook && !edit" class="bkh"><b>{{ step.bn || BOOK[step.bk].n }}</b><span>{{ step.head || BOOK[step.bk].en }}</span></div>
    <!-- в правке: номер (свой, по книге) и задание по-английски — на тех же местах -->
    <div v-else-if="isBook" class="bkh"><input v-model.number="step.bn" class="exf bn" type="number" min="1" max="99" :placeholder="String(BOOK[step.bk].n)" title="Номер задания — как в учебнике (Exercise 3 → 3). Нажмите и впишите свой" @input="edApi.changed()" /><textarea v-model="step.head" class="exf bt" rows="1" :placeholder="BOOK[step.bk].en" title="Задание — как в учебнике" @input="edApi.changed()" /></div>

    <!-- Итог урока -->
    <div v-if="isFinal" class="body fin">
      <svg class="thumb" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="var(--yellow)" /><path d="M20 30h7l6-12c3 0 4.5 2 4 5l-1.5 6H45a3.5 3.5 0 0 1 3.4 4.3l-3 11A4 4 0 0 1 41.5 47H27l-7-2z" fill="#fff" /><rect x="15" y="29" width="7" height="18" rx="2" fill="#fff" /></svg>
      <h2>Отлично{{ name ? ', ' + name : '' }}!</h2>
      <div class="tiles"><div><small>Время</small><b>{{ single || (embedded && !stats) ? '—' : time }}</b></div><div><small>Верно</small><b>{{ single || (embedded && !stats) ? '—' : acc + '%' }}</b></div><div><small>Экранов</small><b>{{ steps.length }}</b></div></div>
      <!-- слова урока так, как они легли в Review: уровень и как изменилась память (FSRS: стабильность в днях) — сверять с разделом Review -->
      <div v-if="review?.length" class="wl rvw">
        <div class="wh">Слова урока → Review<span class="rsum">окрепло {{ review.filter(x => x.before != null && x.now > x.before).length }} · новых {{ review.filter(x => x.before == null).length }} · ослабло {{ review.filter(x => x.before != null && x.now < x.before).length }}</span></div>
        <div v-for="x in review" :key="x.key" class="wr rv">
          <button v-if="x.audio" class="say" title="Послушать" @click="say(x.audio)"><svg viewBox="0 0 24 24"><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg></button><span v-else class="say no" />
          <span class="rt"><b>{{ x.text }}</b><small>{{ x.kind === 'phrase' ? 'Фраза' : 'Слово' }}{{ x.tr ? ' · ' + x.tr : '' }}{{ x.next ? ` · повтор через ${x.next} дн` : '' }}</small></span>
          <span class="rs" :class="x.lv"><i :class="{ f: x.now != null }" /><i :class="{ f: x.lv !== 'weak' }" /><i :class="{ f: x.lv === 'strong' }" />{{ x.now == null ? 'Новое' : { weak: 'Слабое', medium: 'Среднее', strong: 'Сильное' }[x.lv] }}</span>
          <span class="rd" :class="x.before == null ? 'nw' : x.now > x.before ? 'up' : x.now < x.before ? 'dn' : ''" title="Память (стабильность): за сколько дней вероятность вспомнить упадёт до 90 %">{{ x.now == null ? 'новое' : x.before == null ? `новое · память ${dn(x.now)}` : x.now === x.before ? `память ${dn(x.now)} · без изм.` : `${dn(x.before)} → ${dn(x.now)} ${x.now > x.before ? '↑' : '↓'}` }}</span>
          <!-- журнал: каждый экран урока, где было слово, и какой после него стала память -->
          <span v-if="x.log?.length" class="rlog"><span v-for="(e, n) in x.log" :key="n" :class="e.ok === true ? 'ly' : e.ok === false ? 'lx' : ''">{{ e.ex }}: {{ e.ok === true ? 'верно' : e.ok === false ? 'ошибка' : 'встретилось' }}{{ e.ok !== null && e.now != null ? ` → ${dn(e.now)}` : '' }}</span></span>
        </div>
      </div>
      <!-- что уйдёт в чекпоинт Chapter -->
      <div v-if="ckLog" class="wl ckl">
        <div class="wh">В чекпоинт Chapter<span v-if="!ckLog.none" class="rsum">«{{ ckLog.title }}»</span></div>
        <p v-if="ckLog.none" class="ckn">В этой Chapter нет чекпоинта — ошибки никуда не уходят.</p>
        <p v-else-if="!ckLog.items.length" class="ckn">Ошибок нет — в чекпоинт ничего не добавится (без ошибок он соберётся из заданий уроков Chapter).</p>
        <div v-for="c in ckLog.items" v-else :key="c.id" class="wr ck"><span class="ckx">!</span><b>{{ c.ex }}</b><small>{{ c.w }}</small></div>
      </div>
      <div v-else-if="words.length" class="wl">
        <div class="wh">Слова урока</div>
        <div v-for="x in words" :key="x.w" class="wr"><button v-if="x.a" class="say" title="Послушать" @click="say(x.a)"><svg viewBox="0 0 24 24"><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg></button><span v-else class="say no" /><b>{{ x.w }}</b><small>{{ x.t }}</small></div>
      </div>
    </div>

    <!-- Экран — шаблон своего типа: разметка в src/exercises/<тип>/ (одна и для ученика, и для правки) -->
    <div v-else-if="ex" class="body" :class="['x-' + step.kind, { tw: step.kind === 'sort' && step.tw }]"><component :is="ex.view" :step="step" /></div>

    <!-- Снизу: результат и «Продолжить»; в правке — подвал ветки (время экрана, кнопки типа, «Сохранить») -->
    <slot v-if="edit" name="foot" />
    <div v-else class="foot" :class="fbState">
      <!-- как в Busuu: подвал выезжает зелёным или красным, значок ✓ / ✕ «выпрыгивает», звук — useSfx (выключается в Профиле) -->
      <span v-if="fbState" :key="fbState + i" class="mk" aria-hidden="true"><svg v-if="fbState === 'good'" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg><svg v-else viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg></span>
      <span class="fb"><component :is="ex.view" v-if="ex" :step="step" part="fb" /></span>
      <template v-if="embedded && isFinal"><button class="go ghost" @click="emit('restart')">↺ Заново</button><button class="go" @click="emit('full')">Во весь экран</button></template>
      <button v-else-if="needCheck && !single" class="go" :disabled="!canCheck" @click="checkAny">Проверить</button>
      <button v-else-if="embedded" class="go" :disabled="!st.done" @click="next">Продолжить</button>
      <button v-else-if="isFinal" class="go" @click="emit('close')">{{ single ? 'Так увидит ученик' : 'Готово' }}</button>
      <button v-else class="go" :disabled="!st.done && !single" @click="next">{{ single ? 'Так увидит ученик' : 'Продолжить' }}</button>
    </div>
  </div>
</template>

<style scoped>
.lp { position: relative; display: flex; flex-direction: column; height: 100%; background: var(--card); color: var(--text); font-family: var(--font); user-select: none }
.top { display: flex; align-items: center; gap: 12px; padding: 18px 22px 6px; max-width: 640px; width: 100%; margin: 0 auto; box-sizing: border-box }
.x { flex: none; width: 32px; height: 32px; border: 0; background: none; border-radius: 8px; cursor: pointer; display: grid; place-items: center } .x:hover { background: var(--surface) }
.x svg { width: 20px; height: 20px; stroke: var(--hint); stroke-width: 2.6; stroke-linecap: round }
.pb { flex: 1; height: 10px; border-radius: 6px; background: #e8e8e8; overflow: hidden } .pb i { display: block; height: 100%; border-radius: 6px; background: #1fbe78; transition: width .3s }
.body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; align-items: stretch; gap: 14px; width: 100%; max-width: 520px; margin: 0 auto; padding: 14px 22px 24px; box-sizing: border-box }
.aw { align-self: stretch }
.mine { background: #1fbe78 }
.err { margin: 0; text-align: center; color: var(--red-d); font-size: 13px; font-weight: 700 }
.fs { font-weight: 700 } .fb small { color: var(--hint); font-weight: 600; font-size: 12px } .fn { margin-top: 2px } .fb .lt { color: #ff9600; font-weight: 800 }
/* итог */
.fin { align-items: center; text-align: center } .thumb { width: 72px; height: 72px; margin-top: 10px }
.fin h2 { margin: 0; font-size: 22px }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; max-width: 340px }
.tiles div { display: grid; gap: 2px; padding: 10px 6px; border: 1px solid var(--border); border-radius: 12px } .tiles small { font-size: 11px; color: var(--hint); font-weight: 700 } .tiles b { font-size: 17px }
.wl { width: 100%; display: grid; gap: 6px; text-align: left } .wh { font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.wr { display: grid; grid-template-columns: 30px auto 1fr; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--surface) }
.wr b { font-size: 14px } .wr small { font-size: 12px; color: var(--hint); font-weight: 600 }
.wr.rv .rlog { grid-column: 2 / -1; display: flex; flex-wrap: wrap; gap: 4px } .rlog span { flex: none; white-space: nowrap; font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 7px; background: var(--border); color: var(--hint) } .rlog .ly { background: #e3f6d5; color: #3d8c00 } .rlog .lx { background: #ffe1e1; color: #c62828 }          /* не .x — так называется крестик закрытия */
.ckn { margin: 0; font-size: 13px; font-weight: 700; color: var(--hint) } .wr.ck { grid-template-columns: 24px auto 1fr } .ckx { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #9747ff; color: #fff; font-size: 12px; font-weight: 900 }
.wh .rsum { margin-left: 8px; text-transform: none; letter-spacing: 0; font-weight: 700 }
.wr.rv { grid-template-columns: 30px minmax(0, 1fr) auto auto; gap: 10px } .rt { display: grid; min-width: 0 } .rt b { overflow-wrap: anywhere }
.rs { display: flex; align-items: flex-end; gap: 2px; font-size: 12px; font-weight: 800; white-space: nowrap } .rs i { width: 4px; border-radius: 1px; background: #dfe2e6 } .rs i:nth-child(1) { height: 6px } .rs i:nth-child(2) { height: 9px } .rs i:nth-child(3) { height: 12px; margin-right: 5px }
.rs.weak i.f { background: #ff4b4b } .rs.medium i.f { background: #ff9600 } .rs.strong i.f { background: #58cc02 }
.rd { min-width: 82px; text-align: right; font-size: 12px; font-weight: 900; color: var(--hint); white-space: nowrap } .rd.up { color: #3d8c00 } .rd.dn { color: #d32f2f }
@media (max-width: 480px) { .wr.rv { grid-template-columns: 30px minmax(0, 1fr) auto; row-gap: 2px } .wr.rv .rd { grid-column: 2 / -1; text-align: left; min-width: 0 } }
.say { width: 28px; height: 28px; border: 0; border-radius: 50%; background: var(--card); display: grid; place-items: center; cursor: pointer; padding: 0 } .say.no { background: none }
.say svg { width: 16px; height: 16px; fill: none; stroke: var(--blue); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
/* низ */
.foot { display: flex; align-items: center; gap: 12px; padding: 14px 22px; border-top: 1px solid var(--border); background: var(--card); transition: background .15s }
.foot.good { background: #e3fbef } .foot.bad { background: var(--red-l) }
/* ответ, как в Busuu: подвал мягко выезжает снизу, значок ✓ / ✕ «выпрыгивает» (✕ — с дрожью) */
.foot.good, .foot.bad { animation: fup .28s cubic-bezier(.2, .9, .3, 1.2) }
@keyframes fup { from { transform: translateY(14px); opacity: .4 } to { transform: none; opacity: 1 } }
.mk { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #1fbe78; color: #fff; animation: mkpop .42s cubic-bezier(.2, .9, .3, 1.4) both }
.foot.bad .mk { background: var(--red, #ff4b4b); animation: mkpop .42s cubic-bezier(.2, .9, .3, 1.4) both, mkno .32s .3s }
.mk svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round }
.foot.good .mk svg path { stroke-dasharray: 22; stroke-dashoffset: 22; animation: mkdraw .3s .12s ease-out forwards }
@keyframes mkpop { 0% { transform: scale(.3); opacity: 0 } 60% { transform: scale(1.15); opacity: 1 } 100% { transform: scale(1) } }
@keyframes mkdraw { to { stroke-dashoffset: 0 } }
@keyframes mkno { 25% { transform: translateX(-3px) } 75% { transform: translateX(3px) } }
.lp:not(.embedded):not(.single) .mk { width: 40px; height: 40px } .lp:not(.embedded):not(.single) .mk svg { width: 24px; height: 24px }
@media (prefers-reduced-motion: reduce) { .foot.good, .foot.bad, .mk, .foot.good .mk svg path, .foot.bad .mk { animation: none; stroke-dashoffset: 0 } }
.fb { flex: 1; display: grid; font-size: 14px } .foot.good .fb b { color: #128a55 } .foot.bad .fb b { color: var(--red-d) }
.foot.good .fb :deep(b) { color: #128a55 } .foot.bad .fb :deep(b) { color: var(--red-d) } .fb :deep(small) { color: var(--hint); font-weight: 600; font-size: 12px } .fb :deep(.lt) { color: #ff9600; font-weight: 800 } .fb :deep(.fs) { font-weight: 700 } .fb :deep(.fn) { margin-top: 2px } .fb :deep(.left) { color: var(--hint) } .lp.book .fb :deep(.fs) { font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; color: #185fa5 }          /* строка ответа от шаблона упражнения (src/exercises) */
.go { border: 0; border-radius: 22px; padding: 11px 26px; background: var(--blue); color: #fff; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer }
.go:disabled { background: var(--border); color: var(--hint-2); cursor: not-allowed }
.single .go { background: var(--surface); color: var(--hint); cursor: default; font-size: 13px; padding: 9px 16px }
.single .top { padding-top: 14px }
/* Во весь экран на компьютере — крупно, как в Busuu */
@media (min-width: 900px) {
  /* как в Busuu: полоска прогресса по центру, 500px; «назад» — у края экрана */
  .lp:not(.embedded):not(.single) .top { position: relative; max-width: none; justify-content: center; padding: 28px 24px 6px }
  .lp:not(.embedded):not(.single) .top > :first-child:not(.pb) { position: absolute; left: 24px; top: 50%; margin-top: 11px; translate: 0 -50% }
  .lp:not(.embedded):not(.single) .pb { flex: none; width: 500px; max-width: calc(100% - 140px); height: 12px }
  .lp:not(.embedded):not(.single) .body { max-width: 760px; gap: 18px; padding-top: 22px }
  .lp:not(.embedded):not(.single) :deep(.ap) { height: 40px; border-radius: 20px; padding: 0 10px 0 8px; gap: 12px }
  .lp:not(.embedded):not(.single) :deep(.ap .pp) { width: 30px; height: 30px } .lp:not(.embedded):not(.single) :deep(.ap .pp svg) { width: 20px; height: 20px }
  .lp:not(.embedded):not(.single) :deep(.ap .sp) { font-size: 12px }
  .lp:not(.embedded):not(.single) .foot { padding: 18px max(24px, calc(50% - 560px)) } .lp:not(.embedded):not(.single) .fb { font-size: 16px }
  .lp:not(.embedded):not(.single) .go { min-width: 200px; padding: 15px 34px; font-size: 17px; border-radius: 26px }
}
.embedded { height: auto; border-radius: inherit } .embedded .body { flex: none; overflow: visible; padding: 10px 40px 20px } .embedded .top { padding: 16px 110px 4px } .embedded .foot { padding: 10px 14px }
.embedded .go { padding: 9px 22px; font-size: 14px } .go.ghost { background: var(--surface); color: var(--text); margin-right: auto }
.embedded .pb i { transition: width .5s ease }


/* ---- Тест · упражнения Насти: как страница учебника ---- */
.lp.book { background: #fffdf6; font-family: Arial, Helvetica, sans-serif; color: #2c2c2a }
.lp.book .pb { background: #ece6d6 }
.bkh { display: flex; align-items: flex-start; gap: 9px; width: 100%; max-width: 520px; margin: 8px auto 0; padding: 0 22px; box-sizing: border-box; font-size: 16px; font-weight: 700; line-height: 1.3 }
.bkh b { flex: none; display: grid; place-items: center; width: 26px; height: 26px; margin-top: -2px; border-radius: 50%; background: #f0997b; color: #4a1b0c; font-size: 14px }
.lp.book .foot { background: transparent; border-top-color: #ece6d6 }
.lp.book .fs { font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; color: #185fa5 }
.embedded .bkh { padding: 0 40px }          /* шапка учебника — по краю текста, как в правке (LessonRail .card.book .bkh) */
.lp.book .foot { font-family: var(--font) }          /* кнопки — как во всём приложении */
.lp.book .foot, .lp.book .foot button { font-family: var(--font) }

/* ---- Как в учебнике, вид 2 (18.11.2026): белая страница, всё — как в книге; по одному пункту на экран ---- */
.lp.book.bkpg { background: #fff; color: #231f20 }
.lp.book.bkpg .bkh b { border: 1.5px solid #d85a30; background: #f0997b; color: #231f20 }
/* шапка учебника в правке: номер — в том же кружке, задание — на месте текста */
.bkh .bn { flex: none; width: 26px; height: 26px; margin-top: -2px; padding: 0; border-radius: 50%; background: #f0997b; box-shadow: none; color: #4a1b0c; text-align: center; font-size: 14px; font-weight: 700; cursor: text; -moz-appearance: textfield; field-sizing: fixed }
.bkh .bn::-webkit-inner-spin-button, .bkh .bn::-webkit-outer-spin-button { -webkit-appearance: none }
.bkh .bn::placeholder { color: #4a1b0c } .bkh .bn:hover { box-shadow: 0 0 0 3px rgba(13, 153, 255, .35) } .bkh .bn:focus { box-shadow: 0 0 0 3px #0d99ff }
.bkh .bt { flex: 1; text-align: left; font-weight: 700; line-height: 1.3 } .bkh .bt::placeholder { color: #2c2c2a }
.lp.book.bkpg .bkh .bn { border: 1.5px solid #d85a30; color: #231f20 }
</style>

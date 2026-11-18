<script setup>
// Горизонтальный рельс урока: идёт вправо от урока на вертикальном рельсе курса (как главы и уроки в Busuu).
// На нём экраны урока бусинами по порядку, в конце — всегда «Итог урока» (прогресс). Всё на одном холсте, без окон.
//  • Добавить экран — «Интерактив» на нижней панели (как фигуры в FigJam) или «+» в конце рельса.
//  • Экраны — открытые карточки прямо на рельсе (как на доске), без всплывающих окон: правятся на месте — слово, перевод,
//    пример — текстом; видео / фото / звук — нажать на место под файл или перетащить файл; «из карточек» — слова из колод.
//  • Переставить экран — тянуть за шапку карточки вдоль рельса. Удалить — корзина в шапке или Delete.
// Координаты — холста (родитель масштабирует .world); x, y — центр бусины урока на вертикальном рельсе.
import { say } from '../composables/useDialog'
import { ref, reactive, computed, nextTick, onUnmounted } from 'vue'
import LessonPlayer from './LessonPlayer.vue'
import { exOf } from '../exercises'
import { provideEdit } from '../exercises/ctx'
import ExerciseMini from './ExerciseMini.vue'
import { useDecksStore } from '../stores/decks'
import { stepJson, tplOf, tplTitle, tplDesc, SKILL_T, skillsOf, BOOK } from '../utils/lesson'
import { KINDS, FINAL, STEPS_MAX, OPTS_MAX, PAIRS_MAX, stepIssue, stepRefs, cardToIntro, cardToOpt, cardToPair, stepMin, fmtMin, MIN_CHOICES, KIND_MIN, RAIL_X0 } from '../utils/lesson'

const props = defineProps({
  item: { type: Object, required: true },
  x: { type: Number, required: true }, y: { type: Number, required: true },
  sel: { type: String, default: null },                    // выбранный экран
  resolve: { type: Function, required: true }, putFile: { type: Function, required: true }, dropFiles: { type: Function, required: true },
  upPct: { type: Object, default: () => ({}) },
  toWorld: { type: Function, required: true },
  canPaste: Boolean,
  readonly: Boolean,
  auto: { type: Array, default: () => [] },               // чекпоинт: экраны, где ошиблись в уроках Chapter — { k, s, from } (сами, не сохраняются)
  toCk: Boolean,                                          // у урока есть чекпоинт Chapter — ошибки уходят и туда
  free: Boolean,                                          // экран сам по себе на доске (не на ветке урока): x, y — левый верх карточки
  hot: { type: Boolean, default: false },
  up: { type: Boolean, default: false },
  glow: { type: Boolean, default: false },                 // тянут Exercise — ветки уроков подсвечены (куда можно положить); та, над которой держим (hot), — ярче                   // ветка вверх (чекпоинт в конце главы): экраны над линией, низом к ней                  // тянут Exercise к этому пустому уроку — плашка «Exercise» оживает
  moving: { type: Object, default: null },                 // экраны, которые сейчас тащат (редактор курса): { ids, dx, dy } — едут за курсором в полный размер                                      // соседний курс («Все курсы»): только смотреть, проходить и копировать                                      // есть скопированный экран — показать «Вставить»
})
const emit = defineEmits(['change', 'select', 'play', 'add', 'height', 'focus', 'copy', 'json', 'paste', 'grab', 'weak', 'unauto'])
const decks = useDecksStore()
const changed = () => emit('change')
const steps = computed(() => props.item.steps ?? [])

// ---------- Раскладка: карточки на горизонтальном рельсе ----------
const CW = 460, GAP = 60, STEP = CW + GAP, X0 = RAIL_X0, TOP = -40      // ширина экрана, промежуток, отступ от урока (под его подпись); экраны висят под линией на «ножке»
const mv = reactive({ id: null, dx: 0, to: 0, sx: 0, on: false })
const order = computed(() => {
  const list = steps.value.filter(s => !(mv.on && s.id === mv.id))
  if (mv.on) list.splice(mv.to, 0, steps.value.find(s => s.id === mv.id))
  return list
})
const cx = (i) => props.x + (props.free ? 0 : X0) + i * STEP
// до итога; у пустого урока итог — после места под первый экран (ветка и итог видны сразу)
// ошибся при прохождении ветки — экран повторяется в конце, перед итогом (как у ученика в Busuu), пока не ответишь верно
const auto = computed(() => (isCk.value && !props.free ? props.auto : []))
const again = computed(() => run.again.filter(a => steps.value.includes(a.s) || auto.value.some(x => x.s === a.s)))
const total = computed(() => steps.value.length + auto.value.length + again.value.length)
// место на ветке: свои экраны (у пустого — место под первый), потом «авто» чекпоинта, потом повторы, потом итог
const base = computed(() => (steps.value.length ? order.value.length : 1))
const finI = computed(() => base.value + auto.value.length + again.value.length)
const endX = computed(() => cx(finI.value) + CW / 2)
// Шапка карточки: тянуть — переставить на ветке, унести на другую ветку или на доску (тащит редактор курса, с выделенными вместе)
function down(e, s, tile = false) { if (e.button === 0) emit('grab', { e, s, tile }) }      // tile — тянут за плитку на ветке: едет только плитка, по линии
// плитку тянут по ветке (17.11.2026): экран стоит на месте (бледнее), плитка едет за курсором вдоль линии того же размера
const tileMov = (s) => !!props.moving?.tile && props.moving.ids.includes(s.id)
const tileStyle = (s) => (tileMov(s) ? { translate: `calc(-50% + ${props.moving.dx}px) -100%`, transition: 'none', pointerEvents: 'none' } : null)
// как в Figma: выбранный экран тянут за любое место карточки — кроме кнопок, полей и плееров (их можно нажимать как обычно)
const LIVE = 'button, input, textarea, select, a, video, audio, label, [contenteditable], [role="button"], .aw, .wave'
function cardDown(e, s) { if (!props.readonly && !isEdit(s) && !e.target.closest?.(LIVE)) down(e, s) }
const cardStyle = (s, i) => {
  const lift = mv.on && s.id === mv.id
  const left = lift ? cx(steps.value.findIndex(v => v.id === s.id)) + mv.dx : cx(i)
  const mov = props.moving?.ids.includes(s.id)
  if (mov && props.moving.tile) return { left: left + 'px', top: (props.up ? props.y + TOP : props.y - TOP) + 'px', width: CW + 'px', '--c': KINDS[s.kind].c, zIndex: 10000 }
  if (mov) return { left: left + 'px', top: (props.free ? props.y : props.up ? props.y + TOP : props.y - TOP) + 'px', width: CW + 'px', '--c': KINDS[s.kind].c, zIndex: 10000, transition: 'none', transform: `translate(${props.moving.dx}px, ${props.moving.dy}px)${props.up && !props.free ? ' translateY(-100%)' : ''}`, pointerEvents: 'none' }
  return { left: left + 'px', top: (props.free ? props.y : props.up ? props.y + TOP : props.y - TOP) + 'px', width: CW + 'px', '--c': KINDS[s.kind].c, zIndex: lift ? 7 : 3, transition: lift ? 'none' : undefined }
}

async function removeStep(s) {
  const files = stepRefs(s)
  props.item.steps.splice(props.item.steps.indexOf(s), 1); props.dropFiles(files); emit('select', null); changed()
}
defineExpose({ removeStep })

// ---------- Файлы: нажать на место под файл или перетащить файл на него ----------
const fileIn = ref(null), accept = ref('')
let target = null
const kindOf = (f) => (/^video\//.test(f.type) || /\.(mp4|webm|mov|m4v)$/i.test(f.name) ? 'video' : /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name) ? 'image'
  : /^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|weba)$/i.test(f.name) ? 'audio' : null)
function pick(s, fields, opt = null, as = null) { target = { s, fields, opt, as }; accept.value = fields.map(f => f + '/*').join(','); fileIn.value.value = ''; nextTick(() => fileIn.value.click()) }
function take(s, fields, opt, f, as = null) {
  const k = kindOf(f)
  if (!k || !fields.includes(k)) return say(fields.includes('audio') ? 'Нужен звук' : 'Нужно видео или фото', { text: fields.includes('audio') ? 'MP3, M4A, OGG или WAV.' : 'MP4, MOV, WebM — или JPG, PNG, WebP.' })
  if (f.size > 200 * 1024 * 1024) return say('Файл слишком большой', { text: 'Можно до 200 МБ.' })
  props.putFile(s.id, as ?? k, f, opt)
}
const onFile = (e) => { const f = e.target.files?.[0]; if (f && target) take(target.s, target.fields, target.opt, f, target.as) }
const onDrop = (e, s, fields, opt = null, as = null) => { const f = e.dataTransfer?.files?.[0]; if (f) take(s, fields, opt, f, as) }
function clear(obj, field) { const v = obj[field]; delete obj[field]; if (v && !v.startsWith('https://')) props.dropFiles([v]); changed() }
const pct = (s, field, opt) => props.upPct[`${s.id}:${field}:${opt ?? ''}`]

// ---------- Карточки из колод — список прямо на карточке экрана ----------
const pk = reactive({ id: null, for: '', deck: '', q: '' })
function openPk(s, what) { Object.assign(pk, { id: pk.id === s.id && pk.for === what ? null : s.id, for: what, q: '', deck: pk.deck || decks.list[0]?.id || '' }) }
const cards = computed(() => {
  const q = pk.q.trim().toLowerCase(), d = decks.byId(pk.deck)
  return (d?.cards ?? []).filter(c => c.front?.trim() && (!q || c.front.toLowerCase().includes(q) || c.back?.toLowerCase().includes(q))).slice(0, 12)
})
const used = (s, c) => (pk.for === 'opts' ? s.opts?.some(o => o.w === c.front) : pk.for === 'pairs' ? s.pairs?.some(p => p.a === c.front) : s.word === c.front)
function takeCard(s, c) {
  if (pk.for === 'intro') {
    // как было до карточки — для «Отменить»; свои старые файлы удаляем только при «Сохранить»
    const prev = undo[s.id]?.prev ?? Object.fromEntries(INTRO_F.map(k => [k, s[k]]))
    Object.assign(s, cardToIntro(c)); undo[s.id] = { prev }; pk.id = null
  }
  if (pk.for === 'opts') {
    if (used(s, c) || (s.opts ??= []).length >= OPTS_MAX) return
    s.opts.push(cardToOpt(c)); if (s.opts.length >= OPTS_MAX) pk.id = null
  }
  if (pk.for === 'pairs') {
    if (used(s, c) || (s.pairs ??= []).length >= PAIRS_MAX) return
    s.pairs.push(cardToPair(c)); if (s.pairs.length >= PAIRS_MAX) pk.id = null
  }
  changed()
}

// «Взять из карточек» в «Новом слове» можно отменить, пока не нажали «Сохранить»
const INTRO_F = ['word', 'tr', 'ex', 'exTr', 'image', 'audio', 'exAudio']
const undo = reactive({})
function undoCard(s) { const u = undo[s.id]; if (!u) return; for (const k of INTRO_F) if (u.prev[k] === undefined) delete s[k]; else s[k] = u.prev[k]; delete undo[s.id]; changed() }
function keepCard(s) {                 // карточку оставили — свои прежние файлы больше не нужны
  const u = undo[s.id]; if (!u) return; delete undo[s.id]
  const now = new Set(stepRefs(s)); props.dropFiles(INTRO_F.map(k => u.prev[k]).filter(f => typeof f === 'string' && /^(idb:|t\/[\w-]+\/c\/)/.test(f) && !now.has(f)))
}

// правка в шаблонах упражнений (src/exercises): файлы, «изменено», карточки из колод — отсюда
provideEdit({
  pick: (s, kinds, opt = null, as = null) => pick(s, kinds, opt, as),
  drop: (e, s, kinds, opt = null, as = null) => onDrop(e, s, kinds, opt, as),
  clear: (obj, field) => clear(obj, field),
  pct: (s, field, opt) => pct(s, field, opt),
  changed,
  cards: (s, what) => openPk(s, what),
  canUndo: (s) => !!undo[s.id],
  undoCard: (s) => undoCard(s),
  dropFiles: (f) => props.dropFiles(f),
})
const full = computed(() => steps.value.length >= STEPS_MAX)
// Экраны без прокрутки — во весь рост; редактору курса сообщаем высоту самого высокого, чтобы он раздвинул рельс
const frames = new Set(); let hT = 0
const ro = new ResizeObserver(() => { cancelAnimationFrame(hT); hT = requestAnimationFrame(() => emit('height', Math.max(0, ...[...frames].map(el => el.offsetHeight)))) })
// у чекпоинта в конце — итог всей Chapter, а не урока
const isCk = computed(() => props.item?.type === 'checkpoint')
const algShut = ref(false)               // стикер «Как собирается чекпоинт» свёрнут
const finName = computed(() => (isCk.value ? 'Итог Chapter' : 'Итог урока'))
const frameH = reactive({})                     // высота каждого экрана — для пунктирного места при перетаскивании
const ro2 = new ResizeObserver((es) => { for (const e of es) if (e.target.dataset.id) frameH[e.target.dataset.id] = e.target.offsetHeight })
// Режимы экрана — один размер (17.11.2026): JSON и правка открываются в карточке той же высоты, что живой экран, — ничего не прыгает.
// Высоту живого экрана запоминаем (viewH); в JSON и правке карточка той же высоты, лишнее прокручивается внутри.
// Экран, ни разу не показанный живым (пустой — сразу в правке), — высотой как обычно у соседей.
const viewH = reactive({})
// Правка выше живого экрана — не прокручиваем (17.11.2026): оба окна растут до большей из двух высот (editH — высота правки), размер один
const editH = reactive({})
const ro3 = new ResizeObserver((es) => { for (const e of es) { const d = e.target.dataset; if (!d.id) continue; if (d.view === '1') viewH[d.id] = e.target.offsetHeight; else if (d.edit === '1') editH[d.id] = e.target.offsetHeight } })
const cardEls = new WeakSet()
const watchCard = (el) => { if (el && !cardEls.has(el)) { cardEls.add(el); ro3.observe(el) } }
const typicalH = computed(() => { const v = Object.values(viewH).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 560 })
const fixH = (s) => (jsonOn[s.id] ? { height: (viewH[s.id] ?? typicalH.value) + 'px' }
  : isEdit(s) ? { minHeight: (viewH[s.id] ?? typicalH.value) + 'px' }
  : editH[s.id] ? { minHeight: editH[s.id] + 'px' } : null)
const watchFrame = (el) => { if (el && !frames.has(el)) { frames.add(el); ro.observe(el); ro2.observe(el) } }
// ---------- Живая ветка: экраны проходятся прямо здесь, как у ученика ----------
// Карандаш — экран правится; «Сохранить» — снова живой. Пустой (незаполненный) экран сразу открыт для правки.
const editing = reactive({})
// своё время экрана; совпало со временем по типу — не храним
function setMin(s, m) { if (m === KIND_MIN[s.kind]) delete s.min; else s.min = m; changed() }
const isEdit = (s) => !props.readonly && (editing[s.id] ?? !!stepIssue(s))
function save(s) { keepCard(s); editing[s.id] = false; changed() }
// Прохождение ветки: сколько экранов пройдено, счёт каждого, время — прогресс и итог меняются на ходу
const run = reactive({ at: 0, res: {}, t0: 0, t1: 0, key: 0, again: [], n: 0 })
const pctAt = (i) => Math.round((i < run.at ? i + 1 : i) / Math.max(1, total.value) * 100)
// i — место на ветке (экраны, потом повторы); a — повтор, если проходят его
function advance(s, sc, i = steps.value.indexOf(s), a = null) {
  if (!run.t0) run.t0 = Date.now()
  run.res[a ? 'r' + a.k : s.id] = { ok: sc.ok, all: sc.all }
  run.at = Math.max(run.at, i + 1)
  if (run.at >= total.value && !run.t1) run.t1 = Date.now()
  emit('focus', { x: cx(Math.min(i + 1, total.value)) + CW / 2, y: props.y + 200 })
}
// ошиблись на экране — сразу: повтор в конец ветки и экран в чекпоинт Chapter
function miss(s) { if (!run.t0) run.t0 = Date.now(); run.t1 = 0; run.again.push({ k: ++run.n, s }); if (!isCk.value && steps.value.includes(s)) emit('weak', s) }
const stats = computed(() => {
  if (run.at < total.value) return null
  const r = Object.values(run.res)
  return { ok: r.reduce((a, x) => a + x.ok, 0), all: r.reduce((a, x) => a + x.all, 0), sec: Math.round(((run.t1 || Date.now()) - run.t0) / 1000) }
})
// Сбросить один экран: ответы на нём стираются, прохождение ветки откатывается к нему
const rk = reactive({})
function resetStep(s) {
  const i = steps.value.indexOf(s); rk[s.id] = (rk[s.id] ?? 0) + 1; delete run.res[s.id]
  if (run.at > i) { run.at = i; run.t1 = 0 }
  // откат к экрану: повторы от него и дальше тоже уходят
  run.again = run.again.filter(a => { const j = steps.value.indexOf(a.s), keep = j >= 0 && j < i; if (!keep) delete run.res['r' + a.k]; return keep })
}
function restart() { Object.assign(run, { at: 0, res: {}, t0: 0, t1: 0, key: run.key + 1, again: [] }); emit('focus', { x: cx(0) + CW / 2, y: props.y + 200 }) }
const doneX = computed(() => (!steps.value.length ? props.x : run.at >= total.value ? endX.value : run.at ? cx(run.at - 1) + CW / 2 : props.x))
// Стрелки ‹ › в подписи — переставить экран на шаг
function shift(s, d) { const a = props.item.steps, i = a.indexOf(s), j = i + d; if (j < 0 || j >= a.length) return; a.splice(i, 1); a.splice(j, 0, s); changed() }
onUnmounted(() => { ro.disconnect(); ro2.disconnect(); cancelAnimationFrame(hT) })


// Колёсико над экраном прокручивает сам экран; Ctrl + колёсико (и щипок) — масштаб холста, а не всей страницы браузера
const ownWheel = (e) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation() }
// JSON экрана прямо в карточке (17.11.2026): «{ }» — переключить живой экран ↔ его JSON; «Скопировать»; тема кода — светлая / тёмная (запоминается)
const jsonOn = reactive({})
const jsonTheme = ref((() => { try { return localStorage.getItem('tma.jsonTheme') === 'dark' ? 'dark' : 'light' } catch { return 'light' } })())
function flipTheme() { jsonTheme.value = jsonTheme.value === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('tma.jsonTheme', jsonTheme.value) } catch { /* приватный режим */ } }
const copied = ref(null)
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// подсветка: ключи, строки, числа, true / false / null
const jsonHtml = (s) => esc(JSON.stringify(stepJson(s), null, 2)).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?)\b|\b(true|false|null)\b/g,
  (m, str, colon, num, lit) => (str ? (colon ? `<span class="jk">${str}</span>${colon}` : `<span class="js">${str}</span>`) : num ? `<span class="jn">${num}</span>` : `<span class="jl">${lit}</span>`))
function copyJson(s) { emit('json', s); copied.value = s.id; setTimeout(() => { if (copied.value === s.id) copied.value = null }, 2000) }
</script>

<template>
  <div class="lr" @pointerdown.stop>
    <input ref="fileIn" type="file" :accept="accept" hidden @change="onFile" />
    <!-- Рельс урока: от урока вправо, через все экраны к итогу -->
    <svg v-if="!free" class="line" :class="{ glow, hot }" :style="{ left: x + 'px', top: y + 'px' }" :width="endX - x" height="1"><line x1="34" y1="0" :x2="endX - x" y2="0" /><line v-if="steps.length && doneX > x + 34" class="done" x1="34" y1="0" :x2="doneX - x" y2="0" /></svg>

    <!-- Пока тянем экран — пунктирное место, куда он встанет -->
    <div v-if="mv.on" class="slot" :style="{ left: cx(mv.to) + 'px', top: (up ? y + TOP - (frameH[mv.id] ?? 380) + 48 : y - TOP + 48) + 'px', width: CW + 'px', height: (frameH[mv.id] ?? 380) - 48 + 'px' }" />

    <!-- Экраны — открытые карточки, висят на ветке урока -->
    <div v-for="(s, i) in order" :key="s.id" class="frame" :class="{ lift: (mv.on && mv.id === s.id) || (moving?.ids.includes(s.id) && !moving.tile), tdrag: tileMov(s), free, upb: up && !free }" :style="cardStyle(s, i)" :ref="watchFrame" :data-id="s.id">
      <!-- станция на ветке с номером и ножка к экрану; за станцию тоже можно тянуть -->
      <!-- на линии вместо кружка с номером — плитка как в меню «Exercise» (17.11.2026): миниатюра, название, описание, навыки; номер — в уголке.
           За неё экран переставляют. У ветки чекпоинта (вверх) — прежний кружок с номером -->
      <template v-if="!free"><span class="stem" /><template v-if="up"><span class="node" :class="{ done: i < run.at, now: i === run.at }" title="Тяните вдоль ветки, чтобы переставить" @pointerdown.stop="emit('select', s.id); readonly || down($event, s)">{{ i < run.at ? '✓' : i + 1 }}</span></template></template>
      <span v-if="!free && !up" class="rmi" :class="{ done: i < run.at, now: i === run.at }" :style="tileStyle(s)" title="Тяните вдоль ветки, чтобы переставить" @pointerdown.stop="emit('select', s.id); readonly || down($event, s, true)">
        <i class="rnum">{{ i < run.at ? '✓' : i + 1 }}</i>
        <ExerciseMini :id="tplOf(s)" size="tray" />
        <small :title="tplTitle(s) + ' — ' + tplDesc(s)"><b>{{ tplTitle(s) }}</b><span>{{ tplDesc(s) }}</span></small>      <!-- одна высота у всех плиток: название — в строку, описание — не больше 2 строк -->
        <!-- навыки — прямо на линии ветки; у экранов без навыков (знакомство, подсказка) на линии — точка -->
        <span class="rskl"><template v-if="skillsOf(s).length"><i v-for="k in skillsOf(s)" :key="k" class="rchip" :class="k">{{ SKILL_T[k] }}</i></template><i v-else class="rdot" /></span>
      </span>
      <!-- подпись над экраном, как имя фрейма в Figma: за неё экран и переставляют -->
      <div class="flab" :class="{ ro: readonly }" :title="readonly ? 'Экран другого курса — скопируйте и вставьте в свой' : 'Тяните: переставить, унести на другой урок или на доску'" @pointerdown.stop="emit('select', s.id); readonly || down($event, s)">
        <svg class="grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
        <template v-if="free"><span class="kc"><svg viewBox="0 0 24 24" v-html="KINDS[s.kind].ic" /></span><b>{{ s.bk ? tplTitle(s) : KINDS[s.kind].t }}</b></template>          <!-- 18.11.2026: на ветке название и значок уже на плашке над экраном — тут не дублируем; у экрана на доске (без плашки) — оставляем --><span class="tm" :title="'Примерно столько ученик потратит на экран — из таких времён складывается время урока'">≈ {{ fmtMin(stepMin(s)) }} мин</span>
        <i v-if="stepIssue(s)" class="iss" :title="stepIssue(s)">{{ stepIssue(s) }}</i>
        <template v-if="!readonly && !free"><button class="ib mv" title="На шаг левее" :disabled="i === 0" @pointerdown.stop @click="shift(s, -1)">‹</button><button class="ib mv" title="На шаг правее" :disabled="i === order.length - 1" @pointerdown.stop @click="shift(s, 1)">›</button></template>
        <button v-if="!readonly" class="ib pen" :class="{ on: isEdit(s) }" :title="isEdit(s) ? 'Сейчас правите — «Сохранить» внизу экрана' : 'Изменить экран'" @pointerdown.stop @click="isEdit(s) ? save(s) : (editing[s.id] = true)"><svg viewBox="0 0 24 24"><path d="M14.6 6.1l3.3 3.3" /><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z" /></svg></button>
        <button class="ib cp js" :class="{ on: jsonOn[s.id] }" :title="jsonOn[s.id] ? 'Вернуть экран' : 'Показать JSON экрана (образец для ИИ). Обратно: перетащите JSON на холст или Ctrl+V'" @pointerdown.stop @click="jsonOn[s.id] = !jsonOn[s.id]">{ }</button>
        <button class="ib cp" title="Копировать экран (Ctrl+C) — потом «Вставить» на любой ветке или Ctrl+V" @pointerdown.stop @click="emit('copy', s)"><svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" /><path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" /></svg></button>
        <button class="ib rs" :style="isEdit(s) ? { visibility: 'hidden' } : null" title="Сбросить экран — пройти заново" @pointerdown.stop @click="resetStep(s)"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></svg></button>
        <button v-if="!readonly" class="ib" title="Удалить экран" @pointerdown.stop @click="removeStep(s)"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg></button>
      </div>
      <div :ref="watchCard" class="card" :class="[s.kind, { book: !!(s.bk && BOOK[s.bk]), bkpg: !!(s.bk && BOOK[s.bk]) && s.bs === 'page', bkqa: s.bk === 'bkqa' && s.bs === 'page', on: sel === s.id, editing: isEdit(s), now: !isEdit(s) && i === run.at, fixh: jsonOn[s.id] || isEdit(s) }]" :data-id="s.id" :data-view="jsonOn[s.id] || isEdit(s) ? 0 : 1" :data-edit="!jsonOn[s.id] && isEdit(s) ? 1 : 0" :style="fixH(s)" @pointerdown.stop="emit('select', s.id); cardDown($event, s)" @wheel="ownWheel">
      <!-- Живой экран: можно пройти, как ученик -->
      <!-- JSON экрана (кнопка «{ }») — вместо живого экрана, в той же карточке -->
      <div v-if="jsonOn[s.id]" class="jv" :class="jsonTheme" @pointerdown.stop>
        <div class="jtop"><small>JSON экрана</small><span class="jsp" />
          <button class="jt" :title="jsonTheme === 'dark' ? 'Светлый код' : 'Тёмный код'" @click="flipTheme">
            <svg v-if="jsonTheme === 'dark'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
          </button>
          <button class="jc" :class="{ ok: copied === s.id }" @click="copyJson(s)">{{ copied === s.id ? 'Скопировано ✓' : 'Скопировать' }}</button>
        </div>
        <pre v-html="jsonHtml(s)" />      <!-- колёсико — прокрутка JSON (карточка не пускает его на холст, ownWheel); Ctrl+колёсико — масштаб холста, не страницы -->
        <small class="jft">Образец для ИИ. Обратно — Ctrl+V или перетащите JSON на холст</small>
      </div>
      <LessonPlayer v-else-if="!isEdit(s)" :key="s.id + ':' + run.key + ':' + (rk[s.id] ?? 0)" embedded :steps="steps" :start="steps.indexOf(s)" :pct="pctAt(i)" :resolve="resolve" again @next="advance(s, $event)" @miss="miss(s)" />
      <!-- Упражнения-шаблоны (src/exercises): правка = тот же живой экран (LessonPlayer edit) — один файл разметки, окно не меняет размер -->
      <LessonPlayer v-else-if="exOf(s) && pk.id !== s.id" :key="'e:' + s.id" embedded edit :steps="steps" :start="steps.indexOf(s)" :pct="pctAt(i)" :resolve="resolve">
        <template #foot><div class="cf"><label class="mn" title="Примерное время на экран — суммируется во время урока, ученик видит его перед стартом">≈ <select :value="stepMin(s)" @change="setMin(s, +$event.target.value)"><option v-for="m in MIN_CHOICES" :key="m" :value="m">{{ fmtMin(m) }}</option></select> мин</label><span class="fdk"><component :is="exOf(s).view" :step="s" part="tools" /></span><button class="go play" @click="save(s)">Сохранить</button></div></template>
      </LessonPlayer>
      <!-- открыт список карточек из колод («Взять из карточек» у «Нового слова», «Из карточек» у вариантов и пар) — он вместо экрана -->
      <template v-else>
      <div class="pbar"><i :style="{ width: pctAt(i) + '%' }" /></div>
      <div class="pk">
        <div class="pkh"><select v-model="pk.deck"><option v-for="d in decks.list" :key="d.id" :value="d.id">{{ d.title }}</option></select><button class="add sm" @click="pk.id = null">{{ pk.for === 'intro' ? 'Отмена' : 'Готово' }}</button></div>
        <input v-model="pk.q" class="pq" placeholder="поиск" />
        <div class="pl">
          <button v-for="c in cards" :key="c.id" class="pc" :class="{ used: used(s, c) }" @click="takeCard(s, c)"><img v-if="c.image" :src="resolve(c.image, 'image')" alt="" loading="lazy" /><span><b>{{ c.front }}</b><small>{{ c.back }}</small></span><i v-if="c.audio">♪</i></button>
          <p v-if="!decks.list.length" class="none">Колод нет — создайте в «Словах»</p><p v-else-if="!cards.length" class="none">Ничего не нашлось</p>
        </div>
      </div>
      <div class="cf"><label class="mn" title="Примерное время на экран — суммируется во время урока, ученик видит его перед стартом">≈ <select :value="stepMin(s)" @change="setMin(s, +$event.target.value)"><option v-for="m in MIN_CHOICES" :key="m" :value="m">{{ fmtMin(m) }}</option></select> мин</label><button class="go play" @click="save(s)">Сохранить</button></div>
      </template>
      </div>
    </div>

    <!-- «+» — добавить экран -->
    <!-- Урок без экранов: пустое место под экраны — добавить из «Интерактива» или вставить скопированный -->
    <div v-if="!steps.length && !free" :ref="watchFrame" class="frame empty-f" :class="{ upb: up }" :style="{ left: cx(0) + 'px', top: (up ? y + TOP : y - TOP) + 'px', width: CW + 'px' }">
      <span class="stem" />
      <!-- размер не меняется, когда к уроку тянут Exercise (иначе прыгает раскладка и плашка главы): меняется только надпись в плашке -->
      <!-- как плашка «Chapter» в конце рельса: тот же значок, что у кнопки «Exercise» на панели; серая — в покое, синяя — когда к уроку тянут Exercise -->
      <div class="ef" :class="{ hot }"><span class="xpill"><em class="xn">3</em><svg viewBox="0 0 24 24" v-html="KINDS.choice.ic" /><small>Exercise</small></span><span>{{ readonly ? 'Exercise пока нет' : 'Тяните сюда «Exercise» с панели внизу или вставьте скопированный (Ctrl+V)' }}</span>
        <div v-if="!readonly" class="eb"><button class="add sm" @pointerdown.stop @click="emit('add')">Добавить Exercise</button><button v-if="canPaste" class="add sm" @pointerdown.stop @click="emit('paste', null)">Вставить</button></div></div>
    </div>
    <button v-if="canPaste && steps.length && !readonly && !free" class="paste" :style="{ left: cx(order.length) - GAP / 2 + 'px', top: (up ? y - 60 : y + 26) + 'px' }" :disabled="full" title="Вставить скопированный экран в конец ветки" @pointerdown.stop @click="emit('paste', steps.at(-1)?.id ?? null)">Вставить</button>
    <!-- «+» на ветке убрали (07.11): экраны добавляют перетаскиванием из «Интерактива» или «+ Экран» в пустом уроке -->

    <!-- Чекпоинт: экраны из уроков Chapter, где ученик ошибся, — добавляются сами -->
    <div v-for="(a, j) in auto" :key="'a' + a.k" class="frame auto" :class="{ upb: up }" :style="{ left: cx(base + j) + 'px', top: (up ? y + TOP : y - TOP) + 'px', width: CW + 'px', '--c': KINDS[a.s.kind].c }">
      <span class="stem" /><span class="node" :class="{ done: steps.length + j < run.at, now: steps.length + j === run.at }">{{ steps.length + j < run.at ? '✓' : 'A' }}</span>
      <div class="flab fix"><span class="kc"><svg viewBox="0 0 24 24" v-html="KINDS[a.s.kind].ic" /></span><b>Авто · {{ KINDS[a.s.kind].t }}</b><span class="tm" :title="'Ошибка в уроке «' + a.from + '» — экран сам попал в чекпоинт'">ошибка в «{{ a.from }}»</span>
        <button v-if="!readonly" class="ib" title="Убрать из чекпоинта" @pointerdown.stop @click="emit('unauto', a.k)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
      <div class="card" :class="{ now: steps.length + j === run.at }" @wheel="ownWheel">
        <LessonPlayer :key="'a' + a.k + ':' + run.key" embedded again :steps="[a.s]" :start="0" :pct="pctAt(steps.length + j)" :resolve="resolve" @next="advance(a.s, $event, steps.length + j, { k: 'a' + a.k })" @miss="miss(a.s)" />
      </div>
    </div>
    <!-- Стикер у чекпоинта: подробно, как он собирается (можно свернуть) -->
    <div v-if="isCk && !free" class="ckalg" :class="{ upb: up, shut: algShut }" :style="{ left: cx(finI + 1) - 20 + 'px', top: (up ? y + TOP : y - TOP) + 'px' }" @pointerdown.stop @wheel="ownWheel">
      <button class="ckh" @click="algShut = !algShut"><b>Как собирается чекпоинт</b><span>{{ algShut ? 'Открыть' : 'Свернуть' }}</span></button>
      <div v-if="!algShut" class="ckb">
        <p><b>Зачем.</b> Чекпоинт — итог Chapter: проверить, что слова и фразы уроков усвоены, прежде чем идти дальше (mastery learning, как в Busuu).</p>
        <p><b>1. Откуда задания.</b> Всё, что ученик проходит в уроках, записывается в «Твой словарь» (вкладка Review): каждое слово и фраза со своей силой 0–100.</p>
        <p><b>2. Ошибка в уроке.</b> Ответил неверно — (а) экран повторяется в конце урока, пока не ответит правильно; (б) этот же экран сразу попадает сюда, в чекпоинт Chapter, — один раз, без дублей. Здесь он с фиолетовой рамкой и пометкой «Авто · ошибка в …».</p>
        <p><b>3. Как собирается — у ученика, когда он открывает чекпоинт.</b></p>
        <ul><li>Сначала — Exercise, которые учитель положил сюда сам (если есть).</li>
          <li>Потом — экраны уроков этой Chapter, где ученик ошибался (каждый один раз).</li>
          <li>Ошибок не было — до 8 проверяемых экранов (выбор, пары, собрать слово / фразу, пропуск) из уроков этой Chapter, равномерно по всем урокам. 8 и меньше — все.</li>
          <li>В уроках нет ни одного проверяемого экрана (только «Новое слово», «Подсказка») — собирать не из чего: чекпоинт проходится кнопкой «Готово — дальше».</li>
          <li>В карточке чекпоинта видно, из чего он собран: «Собран сам: N — где вы ошибались» или «Собран сам из уроков Chapter: N». В итоге урока — «В чекпоинт Chapter»: какие экраны туда уйдут.</li>
          <li>В «Как видит ученик» — так же, по ошибкам этого просмотра.</li>
          <li>В планах: случайный набор и перемешивание; + 2–3 слабых слова из прошлых Chapter (в порог не считаются).</li></ul>
        <p><b>4. Прохождение.</b> Ошибка здесь — тоже повтор в конце чекпоинта. Сейчас чекпоинт засчитывается при любом результате. В планах — порог 80 % верных с первой попытки: набрал — Chapter пройдена, не набрал — пройти снова.</p>
        <p><b>5. Сила слова.</b> Новое — 20, верно +15, ошибка −20, после срока повтора −5 в день. Слабое — до 40, среднее — 40–74, сильное — от 75. Повторить: слабое — через день, среднее — через 4, сильное — через 14.</p>
        <p class="dem"><b>В редакторе — демо.</b> Пройдите урок этой Chapter прямо на ветке и ошибитесь — экран появится здесь фиолетовой рамкой «Авто». В курс «авто»-экраны не сохраняются: у каждого ученика чекпоинт собирается по его собственным ответам. Убрать — ✕ у экрана.</p>
      </div>
    </div>
    <!-- Повторы: экран, где ошиблись, встаёт в конец ветки перед итогом -->
    <div v-for="(a, j) in (free ? [] : again)" :key="'r' + a.k" class="frame again" :class="{ upb: up }" :style="{ left: cx(base + auto.length + j) + 'px', top: (up ? y + TOP : y - TOP) + 'px', width: CW + 'px', '--c': KINDS[a.s.kind].c }">
      <span class="stem" /><span class="node" :class="{ done: steps.length + auto.length + j < run.at, now: steps.length + auto.length + j === run.at }">{{ steps.length + auto.length + j < run.at ? '✓' : '↻' }}</span>
      <div class="flab fix"><span class="kc"><svg viewBox="0 0 24 24" v-html="KINDS[a.s.kind].ic" /></span><b>Ещё раз · {{ steps.includes(a.s) ? steps.indexOf(a.s) + 1 + ' · ' : 'авто · ' }}{{ KINDS[a.s.kind].t }}</b><span class="tm">{{ toCk ? 'ошибка — повтор в конце и в чекпоинт' : 'ошибка — повтор в конце' }}</span></div>
      <div class="card" :class="{ now: steps.length + auto.length + j === run.at }" @wheel="ownWheel">
        <LessonPlayer :key="'r' + a.k + ':' + run.key" embedded again :steps="[a.s]" :start="0" :pct="pctAt(steps.length + auto.length + j)" :resolve="resolve" @next="advance(a.s, $event, steps.length + auto.length + j, a)" @miss="miss(a.s)" />
      </div>
    </div>

    <!-- Итог урока -->
    <div v-if="!free" :ref="watchFrame" class="frame" :class="{ upb: up }" :data-id="'fin-' + item.id" :style="{ left: cx(finI) + 'px', top: (up ? y + TOP : y - TOP) + 'px', width: CW + 'px', '--c': FINAL.c }">
     <span class="stem" /><span class="node fin-n" :class="{ done: total && run.at >= total }" :title="finName + ' — всегда в конце ветки'"><svg viewBox="0 0 24 24" v-html="FINAL.ic" /></span>
    <div class="flab fix"><span class="kc"><svg viewBox="0 0 24 24" v-html="FINAL.ic" /></span><b>{{ finName }} · всегда в конце</b></div>
    <div class="card fin" :class="{ on: sel === 'final', now: total && run.at >= total }" @pointerdown.stop="emit('select', 'final')" @wheel="ownWheel">
      <div v-if="!total" class="fin0"><span class="fi"><svg viewBox="0 0 24 24" v-html="FINAL.ic" /></span><b>{{ finName }}</b><span>{{ isCk ? 'Здесь ученик увидит итог всей Chapter: что усвоено, что повторить. Появится, когда в чекпоинте будут экраны.' : 'Здесь ученик увидит результат: сколько верных ответов и за сколько времени. Появится, когда в уроке будут экраны.' }}</span></div>
      <LessonPlayer v-else :key="'fin:' + run.key" embedded :steps="steps" :start="steps.length" :pct="pctAt(steps.length)" :stats="stats" :resolve="resolve" @restart="restart" @full="emit('play')" />
    </div>
    </div>
  </div>
</template>

<style scoped>
.lr { position: absolute; left: 0; top: 0; width: 0; height: 0 }
.line { position: absolute; overflow: visible; pointer-events: none; z-index: 1 } .line line { stroke: #e0e0e0; stroke-width: 8; stroke-linecap: round }
/* экран — открытая карточка на рельсе, как на доске */
.frame { position: absolute; z-index: 3 }
.frame.upb { transform: translateY(-100%) } .frame.upb .stem { top: auto; bottom: -24px; height: 24px } .frame.upb .node { top: auto; bottom: -57px } .frame.upb .node.fin-n { bottom: -60px }          /* ветка чекпоинта — вверх: экраны над линией */
/* ветка едет вместе с кружком урока (у кружка на рельсе та же анимация), а не отстаёт от него */
.line, .plus, .paste, .frame { transition: left .22s ease, top .22s ease }
.frame.free .flab { margin-top: 0 }
.card.on:not(.editing) { cursor: grab } .card.on:not(.editing):active { cursor: grabbing }
.fin0 { display: grid; justify-items: center; gap: 8px; padding: 34px 26px; text-align: center; color: var(--hint); font-size: 13px; font-weight: 600 }
.fin0 b { color: #333; font-size: 17px } .fi { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: var(--yellow); color: #fff }
.fi svg { width: 32px; height: 32px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.frame.auto .card { outline: 2px dashed #9747ff; outline-offset: 3px; animation: autoin 1.6s ease-out } .frame.auto .flab b { color: #9747ff } .frame.auto .node:not(.done) { background: #f3ecff; color: #9747ff; border-color: #9747ff; font-weight: 900 }
@keyframes autoin { 0% { box-shadow: 0 0 0 0 rgba(151, 71, 255, .7) } 40% { box-shadow: 0 0 0 18px rgba(151, 71, 255, .25) } 100% { box-shadow: 0 0 0 0 rgba(151, 71, 255, 0) } }
.frame.again .card { outline: 2px dashed #ff9600; outline-offset: 3px } .frame.again .flab b { color: #ff9600 } .frame.again .node:not(.done) { background: #fff3e0; color: #ff9600; border-color: #ff9600 }          /* повтор после ошибки */
.frame.lift { z-index: 7 } .frame.lift .card { box-shadow: 0 16px 34px rgba(0, 0, 0, .2) }
/* подпись над экраном — как имя фрейма в Figma */
.line line.done { stroke: #1fbe78 }
.line.glow line { stroke: #cfe8ff } .line.glow.hot line { stroke: #7cc4ff; filter: drop-shadow(0 0 6px rgba(13, 153, 255, .55)) } .line.glow line.done { stroke: #1fbe78 }
.node.done { background: #1fbe78; box-shadow: 0 0 0 4px #f5f5f5, 0 0 0 6px #9be6c4 }
/* текущий экран на ветке — без пульсации (07.11): в редакторе «дышит» только текущий урок на рельсе */
.card.now { box-shadow: 0 0 0 2px #1fbe78, 0 8px 24px rgba(31, 190, 120, .18) }
.card.editing { border-color: #8cc8ff; box-shadow: 0 0 0 1px #8cc8ff, 0 2px 12px rgba(0, 0, 0, .06) }          /* правка — сплошная голубая рамка (пунктир раздражал, 17.11.2026) */
.card.fixh { min-height: 0 } .card.fixh.editing { overflow: visible } .card.fixh .jv pre { max-height: none; min-height: 0 }      /* JSON и правка — высотой с живой экран (fixH), лишнее — прокруткой внутри */
.ib.pen:hover, .ib.pen.on { background: var(--blue-l); color: var(--blue-d) }
.stem { position: absolute; left: 50%; top: -40px; width: 4px; height: 54px;      /* от самой линии ветки (на ней теперь навыки плитки, а не кружок) */ margin-left: -2px; background: #d9d9d9; border-radius: 2px }
.node { position: absolute; left: 50%; top: -54px; width: 34px; height: 34px; margin-left: -17px; display: grid; place-items: center; border-radius: 50%; background: var(--c); color: #fff; font-size: 14px; font-weight: 900; box-shadow: 0 0 0 4px #f5f5f5, 0 0 0 6px color-mix(in srgb, var(--c) 45%, transparent); cursor: grab; touch-action: none; user-select: none; z-index: 2 }
.node:hover { transform: scale(1.08) } .frame.lift .node { cursor: grabbing; transform: scale(1.12) }
/* плитка — точь-в-точь как в меню «Exercise» (CourseEditor .tray.inter .mi): без своей подложки; низ (ряд навыков) — по центру линии: линия на 40px выше рамки, ряд 16px */
.rmi { position: absolute; left: 50%; top: -32px; translate: -50% -100%; z-index: 2; display: grid; justify-items: center; align-content: start; gap: 5px; width: 124px; box-sizing: border-box; padding: 6px 4px 0; border-radius: 14px; cursor: grab; touch-action: none; user-select: none }
.rmi:hover { background: var(--surface) }
.rmi:hover :deep(.mini) { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(0, 0, 0, .12) } .frame.lift .rmi { cursor: grabbing }
/* текст плитки — одной высоты у всех (название 1 строка, описание ровно 2 строки места): миниатюры и навыки стоят на одной высоте */
.rmi small { display: grid; grid-template-rows: 15px 25px; gap: 1px; width: 100%; font-size: 10.5px; line-height: 1.2; font-weight: 600; color: var(--hint); text-align: center }
.rmi small b { overflow: hidden; font-size: 12.5px; font-weight: 800; color: #2c2c2c; text-overflow: ellipsis; white-space: nowrap }
.rmi small span { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2 }
.rskl { display: flex; gap: 3px; justify-content: center; align-items: center; height: 16px; margin-top: 3px } .rdot { width: 12px; height: 12px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px #f5f5f5 }
.frame.tdrag .rmi { z-index: 5; cursor: grabbing } .frame.tdrag .rmi :deep(.mini) { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(0, 0, 0, .18) } .frame.tdrag > :not(.rmi) { opacity: .45; transition: opacity .15s } .rchip { padding: 1px 7px; border-radius: 8px; font-size: 10px; font-style: normal; font-weight: 900; color: #fff }
.rchip.L { background: #1cb0f6 } .rchip.R { background: #a560e8 } .rchip.W { background: #ff9600 } .rchip.S { background: #58cc02 }
.rnum { position: absolute; top: -3px; left: -3px; z-index: 1; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: var(--c); color: #fff; font-size: 11px; font-style: normal; font-weight: 900; box-shadow: 0 0 0 3px #f5f5f5 }
.rmi.done :deep(.mini) { border-color: #1fbe78; box-shadow: 0 0 0 1px #1fbe78 } .rmi.done .rnum { background: #1fbe78 } .rmi.now :deep(.mini) { border-color: var(--c); box-shadow: 0 0 0 1px var(--c), 0 0 0 5px color-mix(in srgb, var(--c) 25%, transparent) }
.node.fin-n { width: 40px; height: 40px; margin-left: -20px; top: -57px; cursor: default } .node.fin-n svg { width: 22px; height: 22px; fill: none; stroke: #fff; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round }
.slot { position: absolute; z-index: 2; box-sizing: border-box; border: 3px dashed #0d99ff; border-radius: 22px; background: rgba(13, 153, 255, .06); transition: left .15s ease }
.grip { flex: none; width: 16px; height: 16px; fill: #a5a5a5 }
.ib.mv { font-size: 22px; font-weight: 900; color: var(--hint) } .ib.mv:hover:not(:disabled) { background: var(--blue-l); color: var(--blue-d) } .ib.mv:disabled { opacity: .25; cursor: default }
.flab { display: flex; align-items: center; gap: 6px; height: 34px; margin-top: 14px; padding: 0 2px; cursor: grab; user-select: none; touch-action: none }
.flab.fix, .flab.ro { cursor: default } .flab b { font-size: 13px; font-weight: 800; color: var(--hint); white-space: nowrap }
.iss { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-style: normal; font-weight: 800; color: var(--orange-d) }
/* сам экран — как у ученика на телефоне / планшете */
.card { display: flex; flex-direction: column; min-height: 330px; box-sizing: border-box; background: var(--card); border: 1px solid #e3e3e3; border-radius: 22px; box-shadow: 0 2px 12px rgba(0, 0, 0, .06); cursor: default; user-select: none; overflow: hidden }
.card.on { outline: 3px solid #0d99ff; outline-offset: 3px }
.pbar { flex: none; height: 10px; margin: 16px 110px 4px; border-radius: 6px; background: #e8e8e8; overflow: hidden } .pbar i { display: block; height: 100%; border-radius: 4px; background: #1fbe78 }
.tm { flex: none; padding: 1px 6px; border-radius: 6px; background: var(--surface); color: #777; font-size: 11px; font-weight: 800; white-space: nowrap }
.mn { display: flex; align-items: center; gap: 4px; margin-right: auto; font-size: 13px; font-weight: 800; color: var(--hint) } .mn select { padding: 5px 6px; border: 1px solid #dcdcdc; border-radius: 8px; background: var(--card); font: inherit }
.cf { flex: none; display: flex; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid #ececec }
.ca { flex: 1; display: flex; align-items: center; gap: 10px; font-size: 13px } .ca b { font-weight: 900 } .ca em { padding: 6px 12px; border-radius: 9px; background: #f1f6ff; font-style: normal; font-weight: 700 }
.go { border: 0; border-radius: 22px; padding: 11px 26px; background: var(--blue); color: #fff; font: inherit; font-size: 15px; font-weight: 800; opacity: .9 }          /* как «Продолжить» у ученика — подвал правки той же высоты */
.go.play { cursor: pointer; opacity: 1 }
.plus { position: absolute; z-index: 3; width: 40px; height: 40px; margin: -20px 0 0 -20px; border: 3px dashed #c9c9c9; border-radius: 50%; background: var(--surface); color: var(--hint); font-size: 20px; font-weight: 700; cursor: pointer; padding: 0 }
.empty-h { position: absolute; white-space: nowrap; font-size: 13px; font-weight: 700; color: var(--hint) }
.plus:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); background: var(--card) }
.ch { position: relative; flex: none; display: flex; align-items: center; gap: 7px; height: 68px; box-sizing: border-box; padding: 0 8px 0 12px; border-bottom: 1px solid var(--border); cursor: grab; user-select: none; touch-action: none }
.ch.fix { cursor: default }
.ch b { flex: 1; font-size: 12px; font-weight: 800; color: var(--hint) }
.kc { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--c); color: #fff } .kc svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
.warn { width: 18px; height: 18px; border-radius: 50%; background: var(--orange); color: #fff; font-size: 12px; font-weight: 900; font-style: normal; display: grid; place-items: center }
.ib { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 9px; background: none; color: var(--hint); cursor: pointer; padding: 0 } .ib:hover { background: var(--red-l); color: var(--red-d) }
.ib.cp:hover { background: var(--blue-l); color: var(--blue-d) }
.ib.js { font: 900 13px/1 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: -1px }      /* «{ }» — JSON экрана */
.ib.js.on { background: var(--blue-l); color: var(--blue-d) }
/* JSON экрана в карточке: светлый (по умолчанию) или тёмный код; текст можно выделять */
.jv { flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; padding: 14px; user-select: text; cursor: auto }
.jtop { display: flex; align-items: center; gap: 6px } .jtop small { font-size: 12px; font-weight: 800; color: var(--hint) } .jsp { flex: 1 }
.jt { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 9px; background: none; color: var(--hint); cursor: pointer } .jt:hover { background: var(--surface); color: var(--text) }
.jt svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.jc { height: 30px; padding: 0 12px; border: 0; border-radius: 9px; background: var(--blue-l); color: var(--blue-d); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap } .jc.ok { background: var(--green-l); color: var(--green-d) }
.jv pre { flex: 1; margin: 0; max-height: 380px; overflow: auto; padding: 12px 14px; border: 1px solid #ececec; border-radius: 12px; background: #f7f7f8; color: #3c3c3c; font: 12.5px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; word-break: break-word }
.jv.dark pre { background: #1e1e1e; border-color: #1e1e1e; color: #d4d4d4 }
.jv pre :deep(.jk) { color: #185fa5 } .jv pre :deep(.js) { color: #3b6d11 } .jv pre :deep(.jn) { color: #ba7517 } .jv pre :deep(.jl) { color: #9747ff }
.jv.dark pre :deep(.jk) { color: #9cdcfe } .jv.dark pre :deep(.js) { color: #ce9178 } .jv.dark pre :deep(.jn) { color: #b5cea8 } .jv.dark pre :deep(.jl) { color: #569cd6 }
.jft { font-size: 11px; font-weight: 700; color: var(--hint) }
.empty-f .stem { top: -26px } .ef { display: grid; justify-items: center; gap: 4px; margin-top: 14px; padding: 18px; border: 2px dashed #d6d6d6; border-radius: 18px; background: rgba(255, 255, 255, .7); text-align: center }
.ef b { font-size: 14px; font-weight: 800; color: var(--hint) }
.ckalg { position: absolute; z-index: 3; width: 340px; box-sizing: border-box; padding: 12px 14px; border-radius: 4px; background: #fff3b0; box-shadow: 0 4px 14px rgba(0, 0, 0, .12); text-align: left; max-height: 620px; overflow: auto }          /* как стикер */
.ckalg.upb { transform: translateY(-100%) } .ckalg.shut { width: 240px }
.ckh { all: unset; cursor: pointer; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; width: 100% } .ckh b { font-size: 13.5px; font-weight: 900; color: #6b5300 } .ckh span { font-size: 11px; font-weight: 800; color: #9a7b00 }
.ckb { margin-top: 8px; display: grid; gap: 6px } .ckb p, .ckb li { margin: 0; font-size: 12px; font-weight: 600; line-height: 1.42; color: #4a4020 } .ckb b { color: #3a3000; font-weight: 900 } .ckb ul { margin: 0; padding-left: 16px; display: grid; gap: 3px }
.ckb .dem { margin-top: 2px; padding: 7px 9px; border-radius: 6px; background: rgba(151, 71, 255, .1); color: #4b2a80 } .ckb .dem b { color: #6b2fd0 }
.cknote { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 4px; background: #fff3b0; text-align: left; box-shadow: 0 2px 6px rgba(0, 0, 0, .08) }          /* как стикер */
.cknote b { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 900; color: #6b5300 } .cknote ul { margin: 0; padding-left: 16px; display: grid; gap: 3px } .cknote li { font-size: 11.5px; font-weight: 600; line-height: 1.35; color: #4a4020 }
.xpill { position: relative; display: grid; justify-items: center; gap: 4px; width: 92px; padding: 10px 0 8px; box-sizing: border-box; border-radius: 14px; background: var(--card); color: #2c2c2c !important; opacity: .75; box-shadow: 0 2px 12px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04) }          /* как кнопка «Exercise» на нижней панели */
.xpill svg { width: 32px; height: 32px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round } .xpill small { font-size: 13px; font-weight: 800 }
.xn { position: absolute; top: 6px; left: 16px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--border); color: var(--hint); font-size: 11px; font-style: normal; font-weight: 900 }
.ef.hot { border-color: #0d99ff; background: rgba(13, 153, 255, .06) } .ef.hot .xpill { background: #e5f4ff; color: #0d99ff !important; opacity: 1; box-shadow: 0 0 0 2.5px #0d99ff, 0 0 0 9px rgba(13, 153, 255, .2), 0 0 0 16px rgba(13, 153, 255, .08) } .ef.hot .xn { background: #0d99ff; color: #fff }
 .ef { transition: border-color .15s, background .15s } .ef { gap: 10px } .ef span { font-size: 12px; font-weight: 600; color: var(--hint) } .eb { display: flex; gap: 6px; margin-top: 6px }
.paste { position: absolute; z-index: 3; transform: translateX(-50%); padding: 5px 10px; border: 1px solid var(--blue); border-radius: 14px; background: var(--card); color: var(--blue-d); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap }
.paste:hover:not(:disabled) { background: var(--blue-l) }
.ib.rs:hover { background: var(--blue-l); color: var(--blue-d) }
.ib svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.tpk { margin: -4px 0 2px; color: var(--hint); font-size: 12px; text-align: center } .tpk b { color: var(--text) }      /* какая это форма — подпись под заданием */
input, textarea { user-select: text }
textarea { field-sizing: content; overflow: hidden; min-height: 1.6em }
input, textarea, select { font: inherit; color: var(--text); border: 1px solid transparent; border-radius: 7px; background: none; outline: none; padding: 3px 6px; min-width: 0; resize: none }
input:hover, textarea:hover { background: var(--surface) } input:focus, textarea:focus { border-color: var(--blue); background: var(--card) }
input::placeholder, textarea::placeholder { color: var(--hint-2); font-weight: 600 }
.up { position: absolute; left: 6px; bottom: 6px; padding: 1px 6px; border-radius: 6px; background: var(--card); color: var(--blue-d); font-size: 11px; font-weight: 900; font-style: normal }
.add { border: 1px solid transparent; border-radius: 9px; padding: 6px 10px; background: rgba(13, 153, 255, .07); font: inherit; font-size: 12px; font-weight: 800; color: var(--blue-d); cursor: pointer; flex: 1 } .add:hover { background: var(--blue-l) }
.add.sm { flex: none; padding: 4px 8px; font-size: 11px }
.ex { font-size: 15px; font-weight: 500; line-height: 1.5 }      /* как текст на живом экране */
.tg { display: flex; padding: 2px; border-radius: 8px; background: var(--surface) } .tg button { flex: 1; border: 0; border-radius: 6px; padding: 4px; background: none; font: inherit; font-size: 11px; font-weight: 800; color: var(--hint); cursor: pointer }
.tg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 2px rgba(0, 0, 0, .12) }
.oi { aspect-ratio: 3 / 2; background: var(--surface); display: grid; place-items: center; cursor: pointer; font-size: 11px; font-weight: 800; color: var(--blue-d) } .oi img { width: 100%; height: 100%; object-fit: cover }
.ok { position: absolute; left: 4px; top: 4px; width: 20px; height: 20px; border: 0; border-radius: 50%; background: var(--card); color: var(--hint-2); font-size: 11px; font-weight: 900; cursor: pointer; padding: 0; box-shadow: 0 0 0 1px var(--border) }
.trw { display: grid; grid-template-columns: auto 1fr 1fr auto; align-items: center; gap: 4px; padding: 3px 0; border-bottom: 1px solid #efefef } .trw input { font-size: 14px; font-weight: 600 }
.sn { border: 0; background: none; cursor: pointer; font-size: 13px; opacity: .35; padding: 2px } .sn.on { opacity: 1 }
/* «+» на рельсе урока */
.plus-card { position: absolute; z-index: 3; width: 56px; height: 56px; border: 3px dashed #c9c9c9; border-radius: 50%; background: var(--card); color: var(--hint); font-size: 26px; font-weight: 700; cursor: pointer }
.plus-card:hover:not(:disabled) { border-color: var(--blue); color: var(--blue) }
/* итог */
.wr { display: grid; justify-items: start; width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 9px; background: #f3f3f3; font-size: 13px } .wr b::before { content: '🔈 '; font-size: 11px } .wr small { color: var(--hint); font-size: 12px }
.none { margin: 4px 0; font-size: 11px; color: var(--hint-2); font-weight: 600 }
/* список карточек колоды — прямо на экране */
.pk { flex: 1; display: flex; flex-direction: column; gap: 5px; padding: 8px 10px }
.pkh { display: flex; gap: 6px } .pkh select { flex: 1; border-color: var(--border); font-size: 12px; font-weight: 800 }
.pq { border-color: var(--border); font-size: 12px }
.pl { display: grid; gap: 2px; align-content: start }
.pc { display: flex; align-items: center; gap: 7px; padding: 4px; border: 0; border-radius: 7px; background: none; font: inherit; text-align: left; cursor: pointer; color: var(--text) } .pc:hover { background: var(--blue-l) }
.pc img { width: 36px; height: 24px; border-radius: 4px; object-fit: cover; flex: none } .pc span { flex: 1; display: grid; min-width: 0 } .pc b { font-size: 12px } .pc small { font-size: 10px; color: var(--hint) } .pc i { color: var(--blue); font-style: normal }
.pc.used { opacity: .4 }


/* Выбери ответ / Аудиотест — размеры как в LessonPlayer (embedded): .pics minmax(96px), фото 3:2, подпись 14/800, звук-пилюля 34px */
@media (hover: none) { .cx, .cph .rep { opacity: 1 } }
.fdk { display: flex; gap: 6px; margin-right: auto; margin-left: 10px }          /* «Взять из карточек» у «Нового слова» — в подвале правки, чтобы окно было не выше живого */

/* Новое слово — правка 1:1 с живым экраном (LessonPlayer .embedded): те же размеры; поля — без своих отступов, пунктир — outline (не занимает места) */
@media (hover: none) { .chip.rp { opacity: 1 } }
.qa2 { flex: none !important; font-size: 11px; padding: 0 4px }

/* Подсказка — 1:1 с LessonPlayer (.tip 15/500/1.5, таблица .tt/.tr: 14/600, ячейки 11px 12px) */
@media (hover: none) { .rx { opacity: 1 } }

/* Выбери ответ / Аудиотест — 1:1 с LessonPlayer: звук .qa (34px, синяя плашка), варианты .op/.ow 14/800 (строки — 600) */
.fdk .add.sm { padding: 4px 9px; font-size: 11px; flex: none }
.cf { height: 55px; padding: 0 14px; align-items: center; box-sizing: border-box }          /* подвал правки — ровно как у ученика (.foot 55px) */

/* Заполни пропуск / Закончи предложение — 1:1 с LessonPlayer (.sent 18/600/1.6, .slot, .pool/.chip 15/600) */
.fdk { position: relative } .add.on { background: var(--blue-l) }
@media (hover: none) { .vchip .xx { opacity: 1 } }

/* Собери фразу — 1:1 с LessonPlayer (.built 50px, линия 2px; .pool/.chip) */
.cf .go { padding-left: 20px; padding-right: 20px; flex: none } .fdk { margin-left: 6px; gap: 4px } .fdk .add.sm { padding: 4px 8px } .cf .mn { flex: none }          /* подвал: кнопки не налезают на «Сохранить» (высота — как у «Продолжить») */


/* Ответь на вопрос — 1:1 с LessonPlayer (.word + .qq 15/600, .lnk 12px, .how 13px, .two/.out) */
.vtop { margin-bottom: 8px }

/* книжные — 1:1 с LessonPlayer (.odd/.ot, .sub/.scols/.sch/.sbox/.sw) */
.swa { display: flex; align-items: center; gap: 2px; flex: none }
.mv { border: 0; padding: 0 3px; background: none; color: inherit; opacity: .55; font-size: 12px; font-weight: 800; cursor: pointer } .mv:hover { opacity: 1 }
.add.tg { min-width: 26px; color: var(--hint) } .add.tg.on { color: var(--blue-d); background: var(--blue-l) }          /* переключатели в подвале: синий — включено */
/* «Распредели» до 5 колонок: кнопки фразы — поверх, при наведении (иначе пятая колонка вылезала за окно) */
@media (hover: none) { .vso .swa { opacity: 1 } }

/* ---- Тест · упражнения Насти: правка — как страница учебника (как в LessonPlayer .lp.book) ---- */
.card.book.editing { background: #fffdf6; font-family: Arial, Helvetica, sans-serif }
.card.book .cf { background: transparent }


/* «Распредели»: меню фразы по карандашу (как у Насти) */
.mv.pen { position: absolute; right: 3px; top: 3px; width: 20px; height: 20px; padding: 0; border-radius: 6px; background: rgba(255, 255, 255, .7); opacity: 0; transition: opacity .12s }
@media (hover: none) { .mv.pen { opacity: 1 } }
.card.book { background: #fffdf6 }          /* и в просмотре — бумага учебника до краёв */
.card.book .cf, .card.book .cf button, .card.book .cf select { font-family: var(--font) }          /* подвал — как во всём приложении, той же высоты, что у ученика */
.cf { height: auto; padding: 10px 14px } .cf .go { padding: 9px 22px; font-size: 14px }          /* подвал правки = подвал у ученика на ветке (LessonPlayer .embedded .foot / .go) */
.cf select { height: 34px; margin: 0; padding-top: 0; padding-bottom: 0; box-sizing: border-box }
.cf { gap: 6px } .cf .mn { flex: none; gap: 3px; font-size: 11px } .cf .mn select { width: 52px } .fdk { margin-left: 2px; gap: 3px; min-width: 0; flex-wrap: nowrap } .fdk .add.sm { padding: 4px 7px; font-size: 10.5px; white-space: nowrap }          /* подвал правки: до 4 кнопок + «Сохранить» в одну строку */

/* ---- Как в учебнике, вид 2: правка (как LessonPlayer .lp.book) ---- */
.card.book.bkpg, .card.book.bkpg.editing { background: #fff }
/* «Заполни таблицу» — правка: та же таблица, в клетке ответ и слово для банка */
@media (hover: none) { .etw .etwd { opacity: 1 } }
</style>

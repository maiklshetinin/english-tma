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
import AudioWave from './AudioWave.vue'
import LessonPlayer from './LessonPlayer.vue'
import { useDecksStore } from '../stores/decks'
import { KINDS, FINAL, STEPS_MAX, OPTS_MAX, PAIRS_MAX, stepIssue, stepRefs, cardToIntro, cardToOpt, cardToPair, phraseWords, gapParts, stepMin, fmtMin, MIN_CHOICES, KIND_MIN } from '../utils/lesson'

const props = defineProps({
  item: { type: Object, required: true },
  x: { type: Number, required: true }, y: { type: Number, required: true },
  sel: { type: String, default: null },                    // выбранный экран
  resolve: { type: Function, required: true }, putFile: { type: Function, required: true }, dropFiles: { type: Function, required: true },
  upPct: { type: Object, default: () => ({}) },
  toWorld: { type: Function, required: true },
  canPaste: Boolean,
  readonly: Boolean,
  free: Boolean,                                          // экран сам по себе на доске (не на ветке урока): x, y — левый верх карточки
  moving: { type: Object, default: null },                 // экраны, которые сейчас тащат (редактор курса): { ids, dx, dy } — едут за курсором в полный размер                                      // соседний курс («Все курсы»): только смотреть, проходить и копировать                                      // есть скопированный экран — показать «Вставить»
})
const emit = defineEmits(['change', 'select', 'play', 'add', 'height', 'focus', 'copy', 'paste', 'grab'])
const decks = useDecksStore()
const changed = () => emit('change')
const steps = computed(() => props.item.steps ?? [])

// ---------- Раскладка: карточки на горизонтальном рельсе ----------
const CW = 460, GAP = 60, STEP = CW + GAP, X0 = 280, TOP = -40      // ширина экрана, промежуток, отступ от урока (под его подпись); экраны висят под линией на «ножке»
const mv = reactive({ id: null, dx: 0, to: 0, sx: 0, on: false })
const order = computed(() => {
  const list = steps.value.filter(s => !(mv.on && s.id === mv.id))
  if (mv.on) list.splice(mv.to, 0, steps.value.find(s => s.id === mv.id))
  return list
})
const cx = (i) => props.x + (props.free ? 0 : X0) + i * STEP
const endX = computed(() => (steps.value.length ? cx(order.value.length) + CW / 2 : cx(0) - GAP / 2))                   // до итога
// Шапка карточки: тянуть — переставить на ветке, унести на другую ветку или на доску (тащит редактор курса, с выделенными вместе)
function down(e, s) { if (e.button === 0) emit('grab', { e, s }) }
const cardStyle = (s, i) => {
  const lift = mv.on && s.id === mv.id
  const left = lift ? cx(steps.value.findIndex(v => v.id === s.id)) + mv.dx : cx(i)
  const mov = props.moving?.ids.includes(s.id)
  if (mov) return { left: left + 'px', top: (props.free ? props.y : props.y - TOP) + 'px', width: CW + 'px', '--c': KINDS[s.kind].c, zIndex: 30, transition: 'none', transform: `translate(${props.moving.dx}px, ${props.moving.dy}px)`, pointerEvents: 'none' }
  return { left: left + 'px', top: (props.free ? props.y : props.y - TOP) + 'px', width: CW + 'px', '--c': KINDS[s.kind].c, zIndex: lift ? 7 : 3, transition: lift ? 'none' : undefined }
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

// ---------- Варианты и пары ----------
const addOpt = (s) => { if ((s.opts ??= []).length < OPTS_MAX) { s.opts.push({ w: '' }); changed() } }
function delOpt(s, k) {
  const o = s.opts[k]; props.dropFiles([o.image, o.audio].filter(f => f && !f.startsWith('https://')))
  s.opts.splice(k, 1); if (s.ans >= s.opts.length || s.ans === k) s.ans = 0; else if (s.ans > k) s.ans--
  changed()
}
const addTipRow = (s) => { if ((s.opts ??= []).length < 6) { s.opts.push({ w: '', t: '' }); changed() } }
const gapEl = {}                                   // поле фразы пропуска каждого экрана (не в данных экрана)
// «Заполни пропуск»: выделенный текст фразы → [пропуск]
function markGap(s, el) {
  const p = (s.phrase ?? '').replace(/[\[\]]/g, ''), a = el?.selectionStart ?? 0, b = el?.selectionEnd ?? 0
  if (b <= a) return say('Выделите слово в фразе', { text: 'Выделенное станет пропуском — его ученик впишет или выберет.' })
  s.phrase = p.slice(0, a) + '[' + p.slice(a, b).trim() + ']' + p.slice(b); changed()
}
const addPair = (s) => { if ((s.pairs ??= []).length < PAIRS_MAX) { s.pairs.push({ a: '', b: '' }); changed() } }
const qAudio = (s) => s.audio || s.opts?.[s.ans ?? 0]?.audio || ''
const words = computed(() => {
  const out = [], seen = new Set(), add = (w, t) => { w = w?.trim(); if (w && !seen.has(w)) { seen.add(w); out.push({ w, t: t?.trim() ?? '' }) } }
  for (const s of steps.value) {
    if (s.kind === 'intro') add(s.word, s.tr)
    if (s.kind === 'choice') { const o = s.opts?.[s.ans ?? 0]; add(o?.w, o?.t) }
    if (s.kind === 'pairs') (s.pairs ?? []).forEach(p => add(p.a, p.b))
  }
  return out
})
const full = computed(() => steps.value.length >= STEPS_MAX)
// Экраны без прокрутки — во весь рост; редактору курса сообщаем высоту самого высокого, чтобы он раздвинул рельс
const frames = new Set(); let hT = 0
const ro = new ResizeObserver(() => { cancelAnimationFrame(hT); hT = requestAnimationFrame(() => emit('height', Math.max(0, ...[...frames].map(el => el.offsetHeight)))) })
const frameH = reactive({})                     // высота каждого экрана — для пунктирного места при перетаскивании
const ro2 = new ResizeObserver((es) => { for (const e of es) if (e.target.dataset.id) frameH[e.target.dataset.id] = e.target.offsetHeight })
const watchFrame = (el) => { if (el && !frames.has(el)) { frames.add(el); ro.observe(el); ro2.observe(el) } }
// ---------- Живая ветка: экраны проходятся прямо здесь, как у ученика ----------
// Карандаш — экран правится; «Сохранить» — снова живой. Пустой (незаполненный) экран сразу открыт для правки.
const editing = reactive({})
// своё время экрана; совпало со временем по типу — не храним
function setMin(s, m) { if (m === KIND_MIN[s.kind]) delete s.min; else s.min = m; changed() }
const isEdit = (s) => !props.readonly && (editing[s.id] ?? !!stepIssue(s))
function save(s) { keepCard(s); editing[s.id] = false; changed() }
// Прохождение ветки: сколько экранов пройдено, счёт каждого, время — прогресс и итог меняются на ходу
const run = reactive({ at: 0, res: {}, t0: 0, t1: 0, key: 0 })
const pctAt = (i) => Math.round((i < run.at ? i + 1 : i) / Math.max(1, steps.value.length) * 100)
function advance(s, sc) {
  const i = steps.value.indexOf(s); if (!run.t0) run.t0 = Date.now()
  run.res[s.id] = sc; run.at = Math.max(run.at, i + 1)
  if (run.at >= steps.value.length && !run.t1) run.t1 = Date.now()
  emit('focus', { x: cx(Math.min(i + 1, steps.value.length)) + CW / 2, y: props.y + 200 })
}
const stats = computed(() => {
  if (run.at < steps.value.length) return null
  const r = steps.value.map(s => run.res[s.id] ?? { ok: 0, all: 0 })
  return { ok: r.reduce((a, x) => a + x.ok, 0), all: r.reduce((a, x) => a + x.all, 0), sec: Math.round(((run.t1 || Date.now()) - run.t0) / 1000) }
})
// Сбросить один экран: ответы на нём стираются, прохождение ветки откатывается к нему
const rk = reactive({})
function resetStep(s) {
  const i = steps.value.indexOf(s); rk[s.id] = (rk[s.id] ?? 0) + 1; delete run.res[s.id]
  if (run.at > i) { run.at = i; run.t1 = 0 }
}
function restart() { Object.assign(run, { at: 0, res: {}, t0: 0, t1: 0, key: run.key + 1 }); emit('focus', { x: cx(0) + CW / 2, y: props.y + 200 }) }
const doneX = computed(() => (run.at >= steps.value.length ? endX.value : run.at ? cx(run.at - 1) + CW / 2 : props.x))
// Стрелки ‹ › в подписи — переставить экран на шаг
function shift(s, d) { const a = props.item.steps, i = a.indexOf(s), j = i + d; if (j < 0 || j >= a.length) return; a.splice(i, 1); a.splice(j, 0, s); changed() }
onUnmounted(() => { ro.disconnect(); ro2.disconnect(); cancelAnimationFrame(hT) })
// Колёсико над экраном прокручивает сам экран; Ctrl + колёсико (и щипок) — масштаб холста, а не всей страницы браузера
const ownWheel = (e) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation() }
</script>

<template>
  <div class="lr" @pointerdown.stop>
    <input ref="fileIn" type="file" :accept="accept" hidden @change="onFile" />
    <!-- Рельс урока: от урока вправо, через все экраны к итогу -->
    <svg v-if="!free" class="line" :style="{ left: x + 'px', top: y + 'px' }" :width="endX - x" height="1"><line x1="34" y1="0" :x2="endX - x" y2="0" /><line v-if="steps.length && doneX > x + 34" class="done" x1="34" y1="0" :x2="doneX - x" y2="0" /></svg>

    <!-- Пока тянем экран — пунктирное место, куда он встанет -->
    <div v-if="mv.on" class="slot" :style="{ left: cx(mv.to) + 'px', top: y - TOP + 48 + 'px', width: CW + 'px', height: (frameH[mv.id] ?? 380) - 48 + 'px' }" />

    <!-- Экраны — открытые карточки, висят на ветке урока -->
    <div v-for="(s, i) in order" :key="s.id" class="frame" :class="{ lift: (mv.on && mv.id === s.id) || moving?.ids.includes(s.id), free }" :style="cardStyle(s, i)" :ref="watchFrame" :data-id="s.id">
      <!-- станция на ветке с номером и ножка к экрану; за станцию тоже можно тянуть -->
      <template v-if="!free"><span class="stem" /><span class="node" :class="{ done: i < run.at, now: i === run.at }" title="Тяните вдоль ветки, чтобы переставить" @pointerdown.stop="emit('select', s.id); readonly || down($event, s)">{{ i < run.at ? '✓' : i + 1 }}</span></template>
      <!-- подпись над экраном, как имя фрейма в Figma: за неё экран и переставляют -->
      <div class="flab" :class="{ ro: readonly }" :title="readonly ? 'Экран другого курса — скопируйте и вставьте в свой' : 'Тяните: переставить, унести на другой урок или на доску'" @pointerdown.stop="emit('select', s.id); readonly || down($event, s)">
        <svg class="grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
        <span class="kc"><svg viewBox="0 0 24 24" v-html="KINDS[s.kind].ic" /></span><b>{{ free ? '' : i + 1 + ' · ' }}{{ KINDS[s.kind].t }}</b><span class="tm" :title="'Примерно столько ученик потратит на экран — из таких времён складывается время урока'">≈ {{ fmtMin(stepMin(s)) }} мин</span>
        <i v-if="stepIssue(s)" class="iss" :title="stepIssue(s)">{{ stepIssue(s) }}</i>
        <template v-if="!readonly && !free"><button class="ib mv" title="На шаг левее" :disabled="i === 0" @pointerdown.stop @click="shift(s, -1)">‹</button><button class="ib mv" title="На шаг правее" :disabled="i === order.length - 1" @pointerdown.stop @click="shift(s, 1)">›</button></template>
        <button v-if="!readonly" class="ib pen" :class="{ on: isEdit(s) }" :title="isEdit(s) ? 'Сейчас правите — «Сохранить» внизу экрана' : 'Изменить экран'" @pointerdown.stop @click="isEdit(s) ? save(s) : (editing[s.id] = true)"><svg viewBox="0 0 24 24"><path d="M14.6 6.1l3.3 3.3" /><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z" /></svg></button>
        <button class="ib cp" title="Копировать экран (Ctrl+C) — потом «Вставить» на любой ветке или Ctrl+V" @pointerdown.stop @click="emit('copy', s)"><svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" /><path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" /></svg></button>
        <button v-if="!isEdit(s)" class="ib rs" title="Сбросить экран — пройти заново" @pointerdown.stop @click="resetStep(s)"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></svg></button>
        <button v-if="!readonly" class="ib" title="Удалить экран" @pointerdown.stop @click="removeStep(s)"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg></button>
      </div>
      <div class="card" :class="[s.kind, { on: sel === s.id, editing: isEdit(s), now: !isEdit(s) && i === run.at }]" @pointerdown.stop="emit('select', s.id)" @wheel="ownWheel">
      <!-- Живой экран: можно пройти, как ученик -->
      <LessonPlayer v-if="!isEdit(s)" :key="s.id + ':' + run.key + ':' + (rk[s.id] ?? 0)" embedded :steps="steps" :start="steps.indexOf(s)" :pct="pctAt(i)" :resolve="resolve" @next="advance(s, $event)" />
      <template v-else>
      <div class="pbar"><i :style="{ width: pctAt(i) + '%' }" /></div>

      <!-- Карточки из колод: прямо на экране, вместо его содержимого -->
      <div v-if="pk.id === s.id" class="pk">
        <div class="pkh"><select v-model="pk.deck"><option v-for="d in decks.list" :key="d.id" :value="d.id">{{ d.title }}</option></select><button class="add sm" @click="pk.id = null">{{ pk.for === 'intro' ? 'Отмена' : 'Готово' }}</button></div>
        <input v-model="pk.q" class="pq" placeholder="поиск" />
        <div class="pl">
          <button v-for="c in cards" :key="c.id" class="pc" :class="{ used: used(s, c) }" @click="takeCard(s, c)"><img v-if="c.image" :src="resolve(c.image, 'image')" alt="" loading="lazy" /><span><b>{{ c.front }}</b><small>{{ c.back }}</small></span><i v-if="c.audio">♪</i></button>
          <p v-if="!decks.list.length" class="none">Колод нет — создайте в «Словах»</p><p v-else-if="!cards.length" class="none">Ничего не нашлось</p>
        </div>
      </div>

      <!-- Новое слово -->
      <div v-else-if="s.kind === 'intro'" class="cb">
        <div class="hd">{{ KINDS.intro.head }}</div>
        <div class="media" :class="{ empty: !s.video && !s.image }" @click="!s.video && !s.image && pick(s, ['video', 'image'])" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['video', 'image'])">
          <video v-if="s.video" :src="resolve(s.video, 'video')" controls playsinline preload="metadata" />
          <img v-else-if="s.image" :src="resolve(s.image, 'image')" alt="" draggable="false" />
          <span v-else class="ph">＋ Видео или фото<small>16:9 — как в Busuu, фото лучше от 1280×720 (обрежем и сожмём сами)</small><small>нажмите или перетащите файл</small></span>
          <button v-if="s.video || s.image" class="x" title="Убрать" @click.stop="clear(s, s.video ? 'video' : 'image')">✕</button>
          <em v-if="pct(s, 'video') != null || pct(s, 'image') != null" class="up">{{ pct(s, 'video') ?? pct(s, 'image') }}%</em>
        </div>
        <div class="aud" :class="{ over: s.video || s.image }" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['audio'])">
          <AudioWave v-if="s.audio" :key="s.audio" :src="resolve(s.audio, 'audio')" small />
          <button v-else class="add" @click="pick(s, ['audio'])">＋ Аудио — нажмите или перетащите</button>
          <button v-if="s.audio" class="x in" title="Убрать звук" @click="clear(s, 'audio')">✕</button>
          <em v-if="pct(s, 'audio') != null" class="up">{{ pct(s, 'audio') }}%</em>
        </div>
        <div class="word"><input v-model="s.word" placeholder="слово" @input="changed" /><input v-model="s.tr" class="tr" placeholder="перевод" @input="changed" /></div>
        <textarea v-model="s.ex" class="ex" rows="2" placeholder="Пример: He said it’s fine." @input="changed" />
        <textarea v-model="s.exTr" class="ex tr" rows="1" placeholder="перевод примера" @input="changed" />
        <div class="aud" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['audio'], null, 'exAudio')">
          <AudioWave v-if="s.exAudio" :key="s.exAudio" :src="resolve(s.exAudio, 'audio')" small />
          <button v-else class="add sm" @click="pick(s, ['audio'], null, 'exAudio')">＋ Озвучка примера</button>
          <button v-if="s.exAudio" class="x in" title="Убрать озвучку примера" @click="clear(s, 'exAudio')">✕</button>
          <em v-if="pct(s, 'exAudio') != null" class="up">{{ pct(s, 'exAudio') }}%</em>
        </div>
        <div class="dk"><button class="add deck" @click="openPk(s, 'intro')">{{ undo[s.id] ? 'Другая карточка' : 'Взять из карточек' }}</button><button v-if="undo[s.id]" class="add deck un" title="Вернуть, как было до карточки" @click="undoCard(s)">↺ Отменить</button></div>
      </div>

      <!-- Выбери ответ -->
      <div v-else-if="s.kind === 'choice'" class="cb">
        <div class="hd">{{ KINDS.choice.head }}</div>
        <div v-if="s.image" class="media" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['image'])"><img :src="resolve(s.image, 'image')" alt="" draggable="false" /><button class="x" title="Убрать фото вопроса" @click.stop="clear(s, 'image')">✕</button></div>
        <button v-else class="add sm" title="Фото 16:9, лучше от 1280×720 — обрежем и сожмём сами" @click="pick(s, ['image'])" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['image'])">＋ Фото к вопросу</button>
        <div class="tg"><button :class="{ on: s.ask === 'audio' }" @click="s.ask = 'audio'; changed()">На слух</button><button :class="{ on: s.ask === 'tr' }" @click="s.ask = 'tr'; changed()">Переводом</button></div>
        <div v-if="s.ask === 'audio'" class="aud" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['audio'])">
          <AudioWave v-if="qAudio(s)" :key="qAudio(s)" :src="resolve(qAudio(s), 'audio')" small />
          <button class="add sm" :title="s.audio ? 'Свой звук вопроса' : 'Звук берётся из верного ответа — можно загрузить свой'" @click="pick(s, ['audio'])">{{ s.audio ? 'свой ✓' : qAudio(s) ? 'свой звук' : '＋ Звук вопроса' }}</button>
          <button v-if="s.audio" class="x in" title="Убрать свой звук" @click="clear(s, 'audio')">✕</button>
        </div>
        <div v-else class="q">{{ s.opts?.[s.ans ?? 0]?.t || 'перевод верного ответа' }}</div>
        <div class="tg"><button :class="{ on: s.show === 'pics' }" @click="s.show = 'pics'; changed()">Картинки</button><button :class="{ on: s.show === 'text' }" @click="s.show = 'text'; changed()">Текст</button></div>
        <div class="opts" :class="s.show">
          <div v-for="(o, k) in s.opts" :key="k" class="op" :class="{ right: (s.ans ?? 0) === k }">
            <div v-if="s.show === 'pics'" class="oi" title="Фото варианта 3:2, лучше от 600×400 — обрежем по центру и сожмём. Нажмите или перетащите" @click="pick(s, ['image'], k)" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['image'], k)">
              <img v-if="o.image" :src="resolve(o.image, 'image')" alt="" draggable="false" /><span v-else>＋ фото</span>
            </div>
            <input v-model="o.w" placeholder="слово" @input="changed" />
            <button class="ok" :title="(s.ans ?? 0) === k ? 'Верный ответ' : 'Сделать верным'" @click="s.ans = k; changed()">✓</button>
            <button class="x" title="Убрать вариант" @click="delOpt(s, k)">✕</button>
          </div>
          <button v-if="(s.opts?.length ?? 0) < OPTS_MAX" class="op plus" @click="addOpt(s)">＋</button>
        </div>
        <button class="add deck" @click="openPk(s, 'opts')">Варианты из карточек</button>
      </div>

      <!-- Собери фразу, Подсказка, Повтори за диктором, Заполни пропуск, Ответь на вопрос -->
      <div v-else-if="s.kind !== 'pairs'" class="cb">
        <div class="hd">{{ KINDS[s.kind].head }}</div>
        <!-- видео / фото -->
        <div v-if="['speak', 'gap', 'answer'].includes(s.kind)" class="media" :class="{ empty: !s.video && !s.image }" @click="!s.video && !s.image && pick(s, ['video', 'image'])" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['video', 'image'])">
          <video v-if="s.video" :src="resolve(s.video, 'video')" controls playsinline preload="metadata" />
          <img v-else-if="s.image" :src="resolve(s.image, 'image')" alt="" draggable="false" />
          <span v-else class="ph">＋ Видео или фото<small>16:9 — как в Busuu, фото лучше от 1280×720 (обрежем и сожмём сами)</small><small>нажмите или перетащите файл</small></span>
          <button v-if="s.video || s.image" class="x" title="Убрать" @click.stop="clear(s, s.video ? 'video' : 'image')">✕</button>
          <em v-if="pct(s, 'video') != null || pct(s, 'image') != null" class="up">{{ pct(s, 'video') ?? pct(s, 'image') }}%</em>
        </div>
        <!-- звук -->
        <div v-if="['order', 'speak', 'gap'].includes(s.kind) && !s.video" class="aud" :class="{ over: s.image }" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['audio'])">
          <AudioWave v-if="s.audio" :key="s.audio" :src="resolve(s.audio, 'audio')" small />
          <button v-else class="add" @click="pick(s, ['audio'])">＋ Аудио — нажмите или перетащите</button>
          <button v-if="s.audio" class="x in" title="Убрать звук" @click="clear(s, 'audio')">✕</button>
          <em v-if="pct(s, 'audio') != null" class="up">{{ pct(s, 'audio') }}%</em>
        </div>
        <!-- собери фразу -->
        <template v-if="s.kind === 'order'">
          <input v-model="s.phrase" class="big" placeholder="See you later!" @input="changed" />
          <div class="chips"><span v-for="(w, k) in phraseWords(s.phrase)" :key="k">{{ w }}</span><small v-if="phraseWords(s.phrase).length">← ученик увидит вразброс</small></div>
          <input v-model="s.tr" class="tr" placeholder="перевод фразы" @input="changed" />
          <textarea v-model="s.note" class="ex tr" rows="2" placeholder="Пояснение после ответа (необязательно)" @input="changed" />
        </template>
        <!-- подсказка -->
        <template v-if="s.kind === 'tip'">
          <textarea v-model="s.text" class="ex" rows="3" placeholder="Правило. **Жирным** — в двух звёздочках" @input="changed" />
          <div v-for="(o, k) in s.opts" :key="k" class="trw">
            <button class="sn" :class="{ on: o.audio }" :title="o.audio ? 'Заменить озвучку' : 'Добавить озвучку'" @click="pick(s, ['audio'], k)" @dragover.prevent.stop @drop.prevent.stop="onDrop($event, s, ['audio'], k)">🔈</button>
            <input v-model="o.w" placeholder="See you later!" @input="changed" /><input v-model="o.t" class="tr" placeholder="Увидимся!" @input="changed" />
            <button class="x in" title="Убрать строку" @click="delOpt(s, k)">✕</button>
          </div>
          <button v-if="(s.opts?.length ?? 0) < 6" class="add" @click="addTipRow(s)">＋ Строка таблицы</button>
        </template>
        <!-- повтори за диктором -->
        <template v-if="s.kind === 'speak'">
          <input v-model="s.phrase" class="big" placeholder="Hello!" @input="changed" />
          <input v-model="s.tr" class="tr" placeholder="перевод (по кнопке «Перевести»)" @input="changed" />
        </template>
        <!-- заполни пропуск -->
        <template v-if="s.kind === 'gap'">
          <textarea :ref="(el) => (gapEl[s.id] = el)" v-model="s.phrase" class="ex big" rows="1" placeholder="And [you]? — пропуск в [скобках]" @input="changed" />
          <div class="gp"><span v-if="gapParts(s.phrase).gap">Пропуск: <b>{{ gapParts(s.phrase).gap }}</b></span><button class="add sm" @click="markGap(s, gapEl[s.id])">Выделенное → пропуск</button></div>
          <input v-model="s.tr" class="tr" placeholder="перевод фразы" @input="changed" />
          <div class="tg"><button :class="{ on: !s.opts?.length }" @click="s.opts = []; changed()">Вписать</button><button :class="{ on: s.opts?.length }" @click="!s.opts?.length && (s.opts = [{ w: gapParts(s.phrase).gap }, { w: '' }]); changed()">Варианты</button></div>
          <div v-if="s.opts?.length" class="chips ed">
            <span v-for="(o, k) in s.opts" :key="k" :class="{ right: o.w && o.w.trim().toLowerCase() === gapParts(s.phrase).gap.toLowerCase() }"><input v-model="o.w" :size="Math.max(4, o.w.length)" placeholder="слово" @input="changed" /><button class="xx" title="Убрать" @click="s.opts.splice(k, 1); changed()">✕</button></span>
            <button v-if="s.opts.length < OPTS_MAX" class="add sm" @click="s.opts.push({ w: '' }); changed()">＋</button>
          </div>
        </template>
        <!-- ответь на вопрос -->
        <template v-if="s.kind === 'answer'">
          <input v-model="s.text" class="big" placeholder="What’s your name?" @input="changed" />
          <input v-model="s.note" class="tr" placeholder="Подсказка (по ссылке «Показать подсказку»)" @input="changed" />
          <input v-model="s.tr" class="tr" placeholder="Пример ответа — ученик увидит после своего" @input="changed" />
        </template>
      </div>

      <!-- Пары -->
      <div v-else class="cb">
        <div class="hd">{{ KINDS.pairs.head }}</div>
        <div v-for="(p, k) in s.pairs" :key="k" class="pr"><input v-model="p.a" placeholder="I approve" @input="changed" /><input v-model="p.b" placeholder="одобряю" @input="changed" /><button class="x" title="Убрать пару" @click="s.pairs.splice(k, 1); changed()">✕</button></div>
        <button v-if="(s.pairs?.length ?? 0) < PAIRS_MAX" class="add" @click="addPair(s)">＋ Пара</button>
        <button class="add deck" @click="openPk(s, 'pairs')">Пары из карточек</button>
      </div>

      <div class="cf"><label class="mn" title="Примерное время на экран — суммируется во время урока, ученик видит его перед стартом">≈ <select :value="stepMin(s)" @change="setMin(s, +$event.target.value)"><option v-for="m in MIN_CHOICES" :key="m" :value="m">{{ fmtMin(m) }}</option></select> мин</label><span v-if="s.kind === 'choice' && s.opts?.length" class="ca"><b>Верный ответ</b><em>{{ s.opts[s.ans ?? 0]?.w || '…' }}</em></span><button class="go play" @click="save(s)">Сохранить</button></div>
      </template>
      </div>
    </div>

    <!-- «+» — добавить экран -->
    <!-- Урок без экранов: пустое место под экраны — добавить из «Интерактива» или вставить скопированный -->
    <div v-if="!steps.length && !free" :ref="watchFrame" class="frame empty-f" :style="{ left: cx(0) + 'px', top: y - TOP + 'px', width: CW + 'px' }">
      <span class="stem" />
      <div class="ef"><b>Экранов пока нет</b><span>Добавьте из «Интерактива» внизу или вставьте скопированный (Ctrl+V)</span>
        <div class="eb"><button class="add sm" @pointerdown.stop @click="emit('add')">＋ Экран</button><button v-if="canPaste" class="add sm" @pointerdown.stop @click="emit('paste', null)">Вставить</button></div></div>
    </div>
    <button v-if="canPaste && steps.length && !readonly && !free" class="paste" :style="{ left: cx(order.length) - GAP / 2 + 'px', top: y + 26 + 'px' }" :disabled="full" title="Вставить скопированный экран в конец ветки" @pointerdown.stop @click="emit('paste', steps.at(-1)?.id ?? null)">Вставить</button>
    <button v-if="!readonly && !free" class="plus" :style="{ left: cx(order.length) - GAP / 2 + 'px', top: y + 'px' }" :disabled="full" :title="full ? `Не больше ${STEPS_MAX} экранов` : 'Добавить экран'" @pointerdown.stop @click="emit('add')">＋</button>

    <!-- Итог урока -->
    <div v-if="steps.length && !free" :ref="watchFrame" class="frame" :style="{ left: cx(order.length) + 'px', top: y - TOP + 'px', width: CW + 'px', '--c': FINAL.c }">
     <span class="stem" /><span class="node fin-n" :class="{ done: run.at >= steps.length }" title="Итог урока — всегда в конце ветки"><svg viewBox="0 0 24 24" v-html="FINAL.ic" /></span>
    <div class="flab fix"><span class="kc"><svg viewBox="0 0 24 24" v-html="FINAL.ic" /></span><b>Итог урока · всегда в конце</b></div>
    <div class="card fin" :class="{ on: sel === 'final', now: run.at >= steps.length }" @pointerdown.stop="emit('select', 'final')" @wheel="ownWheel">
      <LessonPlayer :key="'fin:' + run.key" embedded :steps="steps" :start="steps.length" :pct="pctAt(steps.length)" :stats="stats" :resolve="resolve" @restart="restart" @full="emit('play')" />
    </div>
    </div>
  </div>
</template>

<style scoped>
.lr { position: absolute; left: 0; top: 0; width: 0; height: 0 }
.line { position: absolute; overflow: visible; pointer-events: none; z-index: 1 } .line line { stroke: #e0e0e0; stroke-width: 8; stroke-linecap: round }
/* экран — открытая карточка на рельсе, как на доске */
.frame { position: absolute; z-index: 3; transition: left .2s ease }
.frame.free .flab { margin-top: 0 }
.frame.lift { z-index: 7 } .frame.lift .card { box-shadow: 0 16px 34px rgba(0, 0, 0, .2) }
/* подпись над экраном — как имя фрейма в Figma */
.line line.done { stroke: #1fbe78 }
.node.done { background: #1fbe78; box-shadow: 0 0 0 4px #f5f5f5, 0 0 0 6px #9be6c4 }
.node.now { animation: pulse 1.4s ease-in-out infinite } @keyframes pulse { 50% { box-shadow: 0 0 0 4px #f5f5f5, 0 0 0 11px color-mix(in srgb, var(--c) 30%, transparent) } }
.card.now { box-shadow: 0 0 0 2px #1fbe78, 0 8px 24px rgba(31, 190, 120, .18) }
.card.editing { border: 2px dashed #0d99ff }
.ib.pen:hover, .ib.pen.on { background: var(--blue-l); color: var(--blue-d) }
.stem { position: absolute; left: 50%; top: -26px; width: 4px; height: 40px; margin-left: -2px; background: #d9d9d9; border-radius: 2px }
.node { position: absolute; left: 50%; top: -54px; width: 34px; height: 34px; margin-left: -17px; display: grid; place-items: center; border-radius: 50%; background: var(--c); color: #fff; font-size: 14px; font-weight: 900; box-shadow: 0 0 0 4px #f5f5f5, 0 0 0 6px color-mix(in srgb, var(--c) 45%, transparent); cursor: grab; touch-action: none; user-select: none; z-index: 2 }
.node:hover { transform: scale(1.08) } .frame.lift .node { cursor: grabbing; transform: scale(1.12) }
.node.fin-n { width: 40px; height: 40px; margin-left: -20px; top: -57px; cursor: default } .node.fin-n svg { width: 22px; height: 22px; fill: none; stroke: #fff; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round }
.slot { position: absolute; z-index: 2; box-sizing: border-box; border: 3px dashed #0d99ff; border-radius: 22px; background: rgba(13, 153, 255, .06); transition: left .15s ease }
.grip { flex: none; width: 16px; height: 16px; fill: #a5a5a5 }
.ib.mv { font-size: 22px; font-weight: 900; color: var(--hint) } .ib.mv:hover:not(:disabled) { background: var(--blue-l); color: var(--blue-d) } .ib.mv:disabled { opacity: .25; cursor: default }
.flab { display: flex; align-items: center; gap: 6px; height: 34px; margin-top: 14px; padding: 0 2px; cursor: grab; user-select: none; touch-action: none }
.flab.fix, .flab.ro { cursor: default } .flab b { font-size: 13px; font-weight: 800; color: #555; white-space: nowrap }
.iss { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-style: normal; font-weight: 800; color: var(--orange-d) }
/* сам экран — как у ученика на телефоне / планшете */
.card { display: flex; flex-direction: column; min-height: 330px; box-sizing: border-box; background: #fff; border: 1px solid #e3e3e3; border-radius: 22px; box-shadow: 0 2px 12px rgba(0, 0, 0, .06); cursor: default; user-select: none; overflow: hidden }
.card.on { outline: 3px solid #0d99ff; outline-offset: 3px }
.pbar { flex: none; height: 8px; margin: 18px 120px 4px; border-radius: 4px; background: #e8e8e8; overflow: hidden } .pbar i { display: block; height: 100%; border-radius: 4px; background: #1fbe78 }
.tm { flex: none; padding: 1px 6px; border-radius: 6px; background: #f1f1f1; color: #777; font-size: 11px; font-weight: 800; white-space: nowrap }
.mn { display: flex; align-items: center; gap: 4px; margin-right: auto; font-size: 13px; font-weight: 800; color: #555 } .mn select { padding: 5px 6px; border: 1px solid #dcdcdc; border-radius: 8px; background: #fff; font: inherit }
.cf { flex: none; display: flex; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid #ececec }
.ca { flex: 1; display: flex; align-items: center; gap: 10px; font-size: 13px } .ca b { font-weight: 900 } .ca em { padding: 6px 12px; border-radius: 9px; background: #f1f6ff; font-style: normal; font-weight: 700 }
.go { border: 0; border-radius: 20px; padding: 8px 22px; background: var(--blue); color: #fff; font: inherit; font-size: 13px; font-weight: 800; opacity: .9 }
.go.play { cursor: pointer; opacity: 1 }
.aud.over { position: relative; margin-top: -48px; margin-left: 10px; margin-right: 10px; padding: 4px 8px; border-radius: 20px; background: rgba(255, 255, 255, .95); box-shadow: 0 2px 6px rgba(0, 0, 0, .15); z-index: 2 }
.plus { position: absolute; z-index: 3; width: 40px; height: 40px; margin: -20px 0 0 -20px; border: 3px dashed #c9c9c9; border-radius: 50%; background: #f5f5f5; color: var(--hint); font-size: 20px; font-weight: 700; cursor: pointer; padding: 0 }
.empty-h { position: absolute; white-space: nowrap; font-size: 13px; font-weight: 700; color: var(--hint) }
.plus:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); background: #fff }
.ch { position: relative; flex: none; display: flex; align-items: center; gap: 7px; height: 68px; box-sizing: border-box; padding: 0 8px 0 12px; border-bottom: 1px solid var(--border); cursor: grab; user-select: none; touch-action: none }
.ch.fix { cursor: default }
.ch b { flex: 1; font-size: 12px; font-weight: 800; color: var(--hint) }
.kc { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--c); color: #fff } .kc svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
.warn { width: 18px; height: 18px; border-radius: 50%; background: var(--orange); color: #fff; font-size: 12px; font-weight: 900; font-style: normal; display: grid; place-items: center }
.ib { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 9px; background: none; color: var(--hint); cursor: pointer; padding: 0 } .ib:hover { background: var(--red-l); color: var(--red-d) }
.ib.cp:hover { background: var(--blue-l); color: var(--blue-d) }
.empty-f .stem { top: -26px } .ef { display: grid; justify-items: center; gap: 4px; margin-top: 14px; padding: 18px; border: 2px dashed #d6d6d6; border-radius: 18px; background: rgba(255, 255, 255, .7); text-align: center }
.ef b { font-size: 14px; font-weight: 800; color: #555 } .ef span { font-size: 12px; font-weight: 600; color: var(--hint) } .eb { display: flex; gap: 6px; margin-top: 6px }
.paste { position: absolute; z-index: 3; transform: translateX(-50%); padding: 5px 10px; border: 1px solid var(--blue); border-radius: 14px; background: #fff; color: var(--blue-d); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap }
.paste:hover:not(:disabled) { background: var(--blue-l) }
.ib.rs:hover { background: var(--blue-l); color: var(--blue-d) }
.ib svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.cb { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 8px 60px 14px }
.choice .cb, .pairs .cb { padding: 8px 34px 12px }
.hd { text-align: center; font-size: 15px; font-weight: 800; margin: 4px 0 2px }
input, textarea { user-select: text }
textarea { field-sizing: content; overflow: hidden; min-height: 1.6em }
input, textarea, select { font: inherit; color: var(--text); border: 1px solid transparent; border-radius: 7px; background: none; outline: none; padding: 3px 6px; min-width: 0; resize: none }
input:hover, textarea:hover { background: var(--surface) } input:focus, textarea:focus { border-color: var(--blue); background: #fff }
input::placeholder, textarea::placeholder { color: var(--hint-2); font-weight: 600 }
.media { position: relative; flex: none; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: #000 }
.media.empty { background: var(--surface); border: 1px dashed #cfcfcf; cursor: pointer } .media.empty:hover { background: var(--blue-l) }
.media video, .media img { display: block; width: 100%; height: 100%; object-fit: cover }
.ph { display: grid; place-items: center; align-content: center; height: 100%; gap: 2px; color: var(--blue-d); font-size: 13px; font-weight: 800 } .ph small { color: var(--hint); font-size: 10px; font-weight: 600 }
.x { position: absolute; right: 5px; top: 5px; width: 22px; height: 22px; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; font-size: 11px; cursor: pointer; padding: 0 }
.x.in { position: static; flex: none; background: var(--surface); color: var(--hint) }
.up { position: absolute; left: 6px; bottom: 6px; padding: 1px 6px; border-radius: 6px; background: #fff; color: var(--blue-d); font-size: 11px; font-weight: 900; font-style: normal }
.aud { position: relative; display: flex; align-items: center; gap: 6px; min-height: 30px } .aud > :first-child:not(button) { flex: 1; min-width: 0 }
.add { border: 1px dashed #cfcfcf; border-radius: 9px; padding: 6px 10px; background: none; font: inherit; font-size: 12px; font-weight: 800; color: var(--blue-d); cursor: pointer; flex: 1 } .add:hover { background: var(--blue-l) }
.add.sm { flex: none; padding: 4px 8px; font-size: 11px }
.dk { display: flex; gap: 6px; margin-top: auto } .dk .add.deck { flex: 1; margin-top: 0 } .add.deck.un { flex: none; background: #fff; border-color: var(--border); color: var(--text) }
.add.deck { flex: none; margin-top: auto; border-style: solid; border-color: var(--blue-l); background: var(--blue-l) }
.word { display: grid; gap: 0; padding: 6px; border-radius: 10px; background: #f1f6ff; text-align: center }
.word input { text-align: center; font-size: 17px; font-weight: 900 } .word input.tr { font-size: 12px; font-weight: 700; color: var(--hint) }
.ex { font-size: 13px; font-weight: 700 } .ex.tr { font-size: 12px; font-weight: 600; color: var(--hint) }
.tg { display: flex; padding: 2px; border-radius: 8px; background: var(--surface) } .tg button { flex: 1; border: 0; border-radius: 6px; padding: 4px; background: none; font: inherit; font-size: 11px; font-weight: 800; color: var(--hint); cursor: pointer }
.tg button.on { background: #fff; color: var(--text); box-shadow: 0 1px 2px rgba(0, 0, 0, .12) }
.q { padding: 8px; border-radius: 10px; background: #f1f6ff; text-align: center; font-size: 15px; font-weight: 900; color: var(--hint) }
.opts { display: grid; gap: 10px } .opts.pics { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)) }
.op { position: relative; display: grid; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; background: #fff }
.opts.text .op { grid-template-columns: 1fr auto auto; align-items: center }
.op.right { border-color: #1fbe78; background: #e3fbef }
.oi { aspect-ratio: 3 / 2; background: var(--surface); display: grid; place-items: center; cursor: pointer; font-size: 11px; font-weight: 800; color: var(--blue-d) } .oi img { width: 100%; height: 100%; object-fit: cover }
.op input { text-align: center; font-size: 12px; font-weight: 800; padding: 5px 4px; border-radius: 0 }
.ok { position: absolute; left: 4px; top: 4px; width: 20px; height: 20px; border: 0; border-radius: 50%; background: #fff; color: var(--hint-2); font-size: 11px; font-weight: 900; cursor: pointer; padding: 0; box-shadow: 0 0 0 1px var(--border) }
.op.right .ok { background: #1fbe78; color: #fff; box-shadow: none }
.op .x { right: 4px; top: 4px; width: 20px; height: 20px; font-size: 10px; opacity: 0 } .op:hover .x { opacity: 1 }
.opts.text .ok, .opts.text .x { position: static; margin-right: 4px }
.op.plus { place-items: center; min-height: 36px; border-style: dashed; color: var(--blue-d); font-size: 18px; cursor: pointer; font: inherit }
.opts.pics .op.plus { min-height: 90px } .opts.text .op.plus { display: grid; width: 100% }
.big { text-align: center; font-size: 17px; font-weight: 800 } .cb > input.tr { text-align: center; font-size: 12px; font-weight: 700; color: var(--hint) }
.chips { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px } .chips > span { padding: 4px 9px; border: 1px solid var(--border); border-radius: 7px; font-size: 13px; font-weight: 600; background: #fff }
.chips small { font-size: 10px; color: var(--hint-2); font-weight: 600 }
.chips.ed > span { display: flex; align-items: center; padding: 0 2px 0 0 } .chips.ed > span.right { border-color: #1fbe78; background: #e3fbef } .chips.ed input { text-align: center; font-size: 13px; font-weight: 700 }
.xx { border: 0; background: none; color: var(--hint-2); font-size: 10px; cursor: pointer; padding: 2px }
.gp { display: flex; justify-content: center; align-items: center; gap: 8px; font-size: 12px; color: var(--hint); font-weight: 600 } .gp b { color: #1a73e8 }
.trw { display: grid; grid-template-columns: auto 1fr 1fr auto; align-items: center; gap: 4px; border-bottom: 1px solid #efefef } .trw input { font-size: 13px; font-weight: 600 } .trw input.tr { color: var(--hint) }
.sn { border: 0; background: none; cursor: pointer; font-size: 13px; opacity: .35; padding: 2px } .sn.on { opacity: 1 }
.pr { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: center }
.pr input { height: 44px; border: 1px solid #dcdcdc; border-radius: 9px; background: #fff; text-align: center; font-size: 14px; font-weight: 600 }
.pr:first-of-type input { background: #8ff0c8; border-color: #5fe0aa }
.pr .x { right: -26px; top: 12px; background: none; color: var(--hint-2); opacity: 0 } .pr:hover .x { opacity: 1 }
/* «+» на рельсе урока */
.plus-card { position: absolute; z-index: 3; width: 56px; height: 56px; border: 3px dashed #c9c9c9; border-radius: 50%; background: #fff; color: var(--hint); font-size: 26px; font-weight: 700; cursor: pointer }
.plus-card:hover:not(:disabled) { border-color: var(--blue); color: var(--blue) }
/* итог */
.fin .cb { align-items: center; text-align: center; padding: 8px 90px 12px } .thumb { width: 64px; height: 64px; flex: none }
.fin .hd { font-size: 20px; font-weight: 900 }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 100% } .tiles span { padding: 8px 2px; border: 1px solid var(--border); border-radius: 10px; font-size: 11px; font-weight: 800; color: var(--hint) }
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
</style>

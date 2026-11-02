<script setup>
// Конструктор интерактивного урока (как в Busuu). Открывается из редактора курса: двойной клик по уроку или «Собрать урок».
//  • Слева — рельс экранов сверху вниз, как рельс курса. Последний пункт — всегда «Итог урока» (его не двигают и не удаляют).
//  • Снизу — «Интерактив ▾»: раскрывающийся список шаблонов с подписями. Тянуть шаблон на рельс (встанет в промежуток)
//    или нажать — в конец, перед итогом. Экраны на рельсе тоже перетаскиваются.
//  • В центре — экран, как его увидит ученик (можно потыкать), справа — настройки: своё видео / фото / аудио, карточки из колод.
//  • «Пройти урок» — весь урок от начала до итога.
// Данные — item.steps (src/utils/lesson.ts). Каждая правка — emit('change'): редактор курса сохраняет и рассылает коллегам.
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import BackButton from './BackButton.vue'
import LessonPlayer from './LessonPlayer.vue'
import AudioWave from './AudioWave.vue'
import { useDecksStore } from '../stores/decks'
import { KINDS, KIND_LIST, FINAL, STEPS_MAX, OPTS_MAX, PAIRS_MAX, newStep, stepId, stepTitle, stepIssue, stepRefs, cardToIntro, cardToOpt, cardToPair } from '../utils/lesson'

const props = defineProps({
  item: { type: Object, required: true },                  // задание курса (урок); экраны — item.steps
  typeName: { type: String, default: 'Урок' },
  resolve: { type: Function, required: true },            // (ссылка, вид) → адрес файла
  putFile: { type: Function, required: true },            // (id экрана, поле, файл, № варианта?) — в браузер и в хранилище
  dropFiles: { type: Function, required: true },          // (ссылки) — убрать файлы из хранилища
  upPct: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['change', 'close'])
const decks = useDecksStore()

if (!Array.isArray(props.item.steps)) props.item.steps = []
const steps = computed(() => props.item.steps)
const changed = () => emit('change')
const W = ref(innerWidth); const onResize = () => { W.value = innerWidth }
const narrow = computed(() => W.value < 980)

// ---------- Выбранный экран ----------
const sel = ref(steps.value[0]?.id ?? 'final')
const selStep = computed(() => steps.value.find(s => s.id === sel.value))
const selIndex = computed(() => (sel.value === 'final' ? steps.value.length : steps.value.findIndex(s => s.id === sel.value)))
const sheet = ref(false)                 // на узком экране настройки — снизу, по нажатию
function choose(id) { sel.value = id; sheet.value = true }

// ---------- Рельс: раскладка и перетаскивание ----------
const STEP = 104, TOP = 70
const col = ref(null)
const drag = reactive({ on: false, item: null, from: null, over: false, to: 0, x: 0, y: 0 })
const order = computed(() => {
  const list = steps.value.filter(s => !(drag.on && s.id === drag.item?.id))
  if (drag.on && drag.over) list.splice(Math.min(drag.to, list.length), 0, drag.item)
  return list
})
const yOf = (i) => TOP + i * STEP
const railH = computed(() => yOf(order.value.length) + 120)
let pending = null
function startDrag(e, src) {
  pending = { ...src, sx: e.clientX, sy: e.clientY }
  addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true }); addEventListener('pointercancel', up, { once: true })
}
let scrollT = 0
function move(e) {
  if (pending && !drag.on) {
    if (Math.hypot(e.clientX - pending.sx, e.clientY - pending.sy) < 5) return
    menu.value = false
    Object.assign(drag, { on: true, item: pending.kind ? newStep(pending.kind) : pending.step, from: pending.kind ? 'new' : 'rail' })
  }
  if (!drag.on) return
  drag.x = e.clientX; drag.y = e.clientY
  const r = col.value.getBoundingClientRect()
  drag.over = e.clientX > r.left - 40 && e.clientX < r.right + 40 && e.clientY > r.top && e.clientY < r.bottom - (narrow.value ? 80 : 96)
  const n = steps.value.filter(s => s.id !== drag.item.id).length
  drag.to = Math.max(0, Math.min(n, Math.round((e.clientY - r.top + col.value.scrollTop - TOP) / STEP)))
  clearInterval(scrollT)                                  // у края — прокручиваем рельс
  const edge = e.clientY < r.top + 60 ? -14 : e.clientY > r.bottom - 150 ? 14 : 0
  if (edge && drag.over) scrollT = setInterval(() => { col.value.scrollTop += edge }, 30)
}
function up() {
  removeEventListener('pointermove', move); clearInterval(scrollT)
  const p = pending; pending = null
  if (!drag.on) {                                        // нажатие: шаблон — в конец, экран — выбрать
    if (p?.kind) add(p.kind)
    else if (p?.step) choose(p.step.id)
    else if (p?.final) choose('final')
    return
  }
  const x = drag.item
  if (drag.over) {
    if (drag.from === 'new' && steps.value.length >= STEPS_MAX) return cancel(`В уроке не больше ${STEPS_MAX} экранов`)
    props.item.steps.splice(0, props.item.steps.length, ...order.value)
    sel.value = x.id; changed()
  }
  cancel()
}
const cancel = (msg) => { Object.assign(drag, { on: false, item: null, over: false }); if (msg) alert(msg) }
function add(kind) {
  if (steps.value.length >= STEPS_MAX) return alert(`В уроке не больше ${STEPS_MAX} экранов`)
  const s = newStep(kind); props.item.steps.push(s); sel.value = s.id; menu.value = false; changed()
  nextTick(() => { col.value?.scrollTo({ top: yOf(steps.value.length) - col.value.clientHeight / 2, behavior: 'smooth' }) })
}
function removeStep(s = selStep.value) {
  if (!s) return
  const files = stepRefs(s)
  if (files.some(f => !f.startsWith('https://')) && !confirm('Удалить экран? Его видео, фото и звук удалятся из хранилища.')) return
  const i = props.item.steps.findIndex(x => x.id === s.id)
  props.item.steps.splice(i, 1); props.dropFiles(files)
  sel.value = props.item.steps[Math.min(i, props.item.steps.length - 1)]?.id ?? 'final'; changed()
}
function duplicate() {
  const s = selStep.value; if (!s || steps.value.length >= STEPS_MAX) return
  const c = JSON.parse(JSON.stringify(s)); c.id = stepId()
  // свои файлы не копируем (одним файлом владеет один экран), ссылки карточек — можно
  for (const f of ['image', 'audio', 'video']) if (c[f] && !c[f].startsWith('https://')) delete c[f]
  c.opts?.forEach(o => { for (const f of ['image', 'audio']) if (o[f] && !o[f].startsWith('https://')) delete o[f] })
  props.item.steps.splice(selIndex.value + 1, 0, c); sel.value = c.id; changed()
}

// ---------- Раскрывающийся список интерактивов ----------
const menu = ref(!steps.value.length)        // пустой урок — список сразу открыт

// ---------- Файлы ----------
const fileIn = ref(null), accept = ref('')
let target = null
const ACC = { video: 'video/*', image: 'image/*', audio: 'audio/*' }
function pick(field, opt) { target = { id: sel.value, field, opt }; accept.value = ACC[field]; fileIn.value.value = ''; nextTick(() => fileIn.value.click()) }
function onFile(e) {
  const f = e.target.files?.[0]; if (!f || !target) return
  const ok = target.field === 'video' ? /^video\//.test(f.type) || /\.(mp4|webm|mov|m4v)$/i.test(f.name)
    : target.field === 'image' ? /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)
      : /^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|weba)$/i.test(f.name)
  if (!ok) return alert({ video: 'Нужен видеофайл (MP4, MOV, WebM)', image: 'Нужна картинка (JPG, PNG, WebP)', audio: 'Нужен звук (MP3, M4A, OGG, WAV)' }[target.field])
  if (f.size > 200 * 1024 * 1024) return alert('Файл больше 200 МБ — слишком большой.')
  props.putFile(target.id, target.field, f, target.opt)
}
function clearFile(obj, field) { const v = obj[field]; delete obj[field]; if (v && !v.startsWith('https://')) props.dropFiles([v]); changed() }
const pctOf = (field, opt) => props.upPct[`${sel.value}:${field}:${opt ?? ''}`]

// ---------- Карточки из колод ----------
const picker = reactive({ on: false, deck: null, q: '', chosen: [], max: 1, for: '' })
const allCards = computed(() => decks.list.flatMap(d => d.cards.map(c => ({ ...c, deck: d.id }))))
const shown = computed(() => {
  const q = picker.q.trim().toLowerCase()
  return (picker.deck ? allCards.value.filter(c => c.deck === picker.deck) : allCards.value)
    .filter(c => !q || c.front?.toLowerCase().includes(q) || c.back?.toLowerCase().includes(q)).slice(0, 200)
})
function openPicker(forWhat) {
  const s = selStep.value
  const max = forWhat === 'intro' ? 1 : forWhat === 'opts' ? OPTS_MAX - (s.opts?.length ?? 0) : PAIRS_MAX - (s.pairs?.length ?? 0)
  if (max <= 0) return alert(forWhat === 'opts' ? `Вариантов не больше ${OPTS_MAX}` : `Пар не больше ${PAIRS_MAX}`)
  Object.assign(picker, { on: true, q: '', chosen: [], max, for: forWhat, deck: picker.deck ?? decks.list[0]?.id ?? null })
}
function toggleCard(c) {
  const k = picker.chosen.findIndex(x => x.id === c.id)
  if (k >= 0) return picker.chosen.splice(k, 1)
  if (picker.max === 1) { picker.chosen = [c]; return takeCards() }
  if (picker.chosen.length < picker.max) picker.chosen.push(c)
}
function takeCards() {
  const s = selStep.value, cs = picker.chosen; if (!s || !cs.length) return
  if (picker.for === 'intro') {
    const old = stepRefs(s).filter(f => !f.startsWith('https://') && f !== s.video)
    Object.assign(s, cardToIntro(cs[0])); props.dropFiles(old)
  }
  if (picker.for === 'opts') { s.opts = [...(s.opts ?? []), ...cs.map(cardToOpt)]; if (cs.length && !s.audio && s.ask === 'audio' && !s.opts[s.ans ?? 0]?.audio) s.ans = s.opts.findIndex(o => o.audio) }
  if (picker.for === 'pairs') s.pairs = [...(s.pairs ?? []), ...cs.map(cardToPair)]
  if (s.ans < 0) s.ans = 0
  picker.on = false; changed()
}
const deckName = (id) => decks.byId(id)?.title ?? ''

// ---------- Варианты и пары ----------
function addOpt() { const s = selStep.value; if ((s.opts ??= []).length >= OPTS_MAX) return; s.opts.push({ w: '' }); changed() }
function delOpt(k) {
  const s = selStep.value, o = s.opts[k]
  props.dropFiles([o.image, o.audio].filter(f => f && !f.startsWith('https://')))
  s.opts.splice(k, 1); if (s.ans >= s.opts.length || s.ans === k) s.ans = 0; else if (s.ans > k) s.ans--
  changed()
}
function addPair() { const s = selStep.value; if ((s.pairs ??= []).length >= PAIRS_MAX) return; s.pairs.push({ a: '', b: '' }); changed() }
function delPair(k) { selStep.value.pairs.splice(k, 1); changed() }

// ---------- Пройти урок ----------
const run = ref(null)          // null | { start, single }
const onKey = (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)) return
  if (e.key === 'Escape') { if (run.value) run.value = null; else if (picker.on) picker.on = false; else if (menu.value) menu.value = false; else if (sheet.value) sheet.value = false; else emit('close') }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selStep.value && !run.value && !picker.on) removeStep()
}
onMounted(() => { addEventListener('keydown', onKey); addEventListener('resize', onResize) })
onUnmounted(() => { removeEventListener('keydown', onKey); removeEventListener('resize', onResize); removeEventListener('pointermove', move); clearInterval(scrollT) })
const issues = computed(() => steps.value.filter(s => stepIssue(s)).length)
</script>

<template>
  <div class="lb" :class="{ dragging: drag.on, narrow }">
    <input ref="fileIn" type="file" :accept="accept" hidden @change="onFile" />

    <!-- Рельс экранов -->
    <div ref="col" class="col">
      <div class="rail" :style="{ height: railH + 'px' }">
        <svg class="line" :height="railH"><line x1="0" :y1="yOf(0)" x2="0" :y2="yOf(order.length)" /></svg>
        <div v-for="(s, i) in order" :key="s.id" class="bead" :class="[s.kind, { on: sel === s.id, lift: drag.on && drag.item?.id === s.id }]"
          :style="{ top: yOf(i) + 'px', '--c': KINDS[s.kind].c, '--d': KINDS[s.kind].dk }" @pointerdown.prevent="startDrag($event, { step: s })">
          <svg viewBox="0 0 24 24" class="ic" v-html="KINDS[s.kind].ic" />
          <i v-if="stepIssue(s)" class="warn" :title="stepIssue(s)">!</i>
          <em class="cap"><small>{{ i + 1 }} · {{ KINDS[s.kind].t }}</small>{{ stepTitle(s) }}</em>
        </div>
        <div class="bead final" :class="{ on: sel === 'final' }" :style="{ top: yOf(order.length) + 'px', '--c': FINAL.c, '--d': FINAL.dk }" @pointerdown.prevent="startDrag($event, { final: true })">
          <svg viewBox="0 0 24 24" class="ic" v-html="FINAL.ic" />
          <em class="cap"><small>Всегда в конце</small>{{ FINAL.t }}</em>
        </div>
        <p v-if="!steps.length && !drag.on" class="hint0">Откройте «Интерактив» внизу и перетащите экран сюда — или просто нажмите на него</p>
      </div>
    </div>

    <!-- Как увидит ученик -->
    <div v-if="!narrow" class="stage">
      <div class="phone">
        <LessonPlayer :key="sel + ':' + steps.length" :steps="steps" :start="selIndex" single :resolve="resolve" />
      </div>
    </div>

    <!-- Настройки выбранного экрана -->
    <aside v-if="(!narrow || sheet) && (selStep || sel === 'final')" class="side" @pointerdown.stop>
      <template v-if="sel === 'final'">
        <div class="sh"><span class="kc" :style="{ '--c': FINAL.c }"><svg viewBox="0 0 24 24" v-html="FINAL.ic" /></span><b>{{ FINAL.t }}</b><button v-if="narrow" class="icon-btn" @click="sheet = false">✕</button></div>
        <p class="note">Последний экран урока — его нельзя убрать или передвинуть. Ученик видит время, сколько ответил верно и все слова урока.</p>
        <button v-if="narrow" class="btn" @click="run = { start: steps.length, single: true }">Как увидит ученик</button>
      </template>
      <template v-else>
        <div class="sh">
          <span class="kc" :style="{ '--c': KINDS[selStep.kind].c }"><svg viewBox="0 0 24 24" v-html="KINDS[selStep.kind].ic" /></span><b>{{ KINDS[selStep.kind].t }}</b>
          <button class="icon-btn" title="Копия экрана" @click="duplicate"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg></button>
          <button class="icon-btn danger" title="Удалить экран" @click="removeStep()"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg></button>
          <button v-if="narrow" class="icon-btn" @click="sheet = false">✕</button>
        </div>
        <p v-if="stepIssue(selStep)" class="issue">{{ stepIssue(selStep) }}</p>

        <!-- Новое слово -->
        <template v-if="selStep.kind === 'intro'">
          <button class="btn primary" @click="openPicker('intro')">Взять из карточек</button>
          <div class="files">
            <div class="fx">
              <span class="lab">Видео</span>
              <video v-if="selStep.video" :src="resolve(selStep.video, 'video')" class="thumb" muted playsinline preload="metadata" />
              <span v-if="pctOf('video') != null" class="pct">{{ pctOf('video') }}%</span>
              <div class="fa"><button class="btn sm" @click="pick('video')">{{ selStep.video ? 'Заменить' : 'Загрузить' }}</button><button v-if="selStep.video" class="btn sm" @click="clearFile(selStep, 'video')">Убрать</button></div>
            </div>
            <div class="fx">
              <span class="lab">Фото</span>
              <img v-if="selStep.image" :src="resolve(selStep.image, 'image')" class="thumb" alt="" />
              <span v-if="pctOf('image') != null" class="pct">{{ pctOf('image') }}%</span>
              <div class="fa"><button class="btn sm" @click="pick('image')">{{ selStep.image ? 'Заменить' : 'Загрузить' }}</button><button v-if="selStep.image" class="btn sm" @click="clearFile(selStep, 'image')">Убрать</button></div>
            </div>
          </div>
          <div class="fx wide">
            <span class="lab">Аудио</span>
            <AudioWave v-if="selStep.audio" :key="selStep.audio" :src="resolve(selStep.audio, 'audio')" small />
            <span v-if="pctOf('audio') != null" class="pct">{{ pctOf('audio') }}%</span>
            <div class="fa"><button class="btn sm" @click="pick('audio')">{{ selStep.audio ? 'Заменить' : 'Загрузить' }}</button><button v-if="selStep.audio" class="btn sm" @click="clearFile(selStep, 'audio')">Убрать</button></div>
          </div>
          <label class="lab">Слово</label><input v-model="selStep.word" class="in" placeholder="it’s fine" @input="changed" />
          <label class="lab">Перевод</label><input v-model="selStep.tr" class="in" placeholder="всё в порядке" @input="changed" />
          <label class="lab">Пример</label><textarea v-model="selStep.ex" class="in" rows="2" placeholder="He said it’s fine if we meet at 3." @input="changed" />
          <label class="lab">Перевод примера</label><textarea v-model="selStep.exTr" class="in" rows="2" @input="changed" />
          <p class="note">Видео показывается вместо фото. Звук играет сам, когда ученик открывает экран.</p>
        </template>

        <!-- Выбери ответ -->
        <template v-else-if="selStep.kind === 'choice'">
          <label class="lab">Вопрос</label>
          <div class="seg"><button :class="{ on: selStep.ask === 'audio' }" @click="selStep.ask = 'audio'; changed()">На слух</button><button :class="{ on: selStep.ask === 'tr' }" @click="selStep.ask = 'tr'; changed()">Переводом</button></div>
          <label class="lab">Ответы</label>
          <div class="seg"><button :class="{ on: selStep.show === 'pics' }" @click="selStep.show = 'pics'; changed()">Картинки</button><button :class="{ on: selStep.show === 'text' }" @click="selStep.show = 'text'; changed()">Текст</button></div>
          <div v-if="selStep.ask === 'audio'" class="fx wide">
            <span class="lab">Звук вопроса <small>{{ selStep.audio ? 'свой' : 'из верного ответа' }}</small></span>
            <span v-if="pctOf('audio') != null" class="pct">{{ pctOf('audio') }}%</span>
            <div class="fa"><button class="btn sm" @click="pick('audio')">{{ selStep.audio ? 'Заменить' : 'Свой звук' }}</button><button v-if="selStep.audio" class="btn sm" @click="clearFile(selStep, 'audio')">Убрать</button></div>
          </div>
          <label class="lab">Варианты <small>отметьте верный</small></label>
          <div v-for="(o, k) in selStep.opts" :key="k" class="opt" :class="{ right: (selStep.ans ?? 0) === k }">
            <button class="rad" :title="(selStep.ans ?? 0) === k ? 'Верный ответ' : 'Сделать верным'" @click="selStep.ans = k; changed()"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg></button>
            <button class="oth" title="Своё фото" @click="pick('image', k)"><img v-if="o.image" :src="resolve(o.image, 'image')" alt="" /><svg v-else viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 16l-5-5-8.5 8" /></svg><em v-if="pctOf('image', k) != null">{{ pctOf('image', k) }}%</em></button>
            <div class="ot"><input v-model="o.w" class="in" placeholder="Слово" @input="changed" /><input v-model="o.t" class="in sm" placeholder="Перевод" @input="changed" /></div>
            <span v-if="o.audio" class="aud" title="Есть звук">♪</span>
            <button class="icon-btn danger sm" title="Убрать вариант" @click="delOpt(k)">✕</button>
          </div>
          <div class="row2"><button class="btn primary" :disabled="(selStep.opts?.length ?? 0) >= OPTS_MAX" @click="openPicker('opts')">Из карточек</button><button class="btn" :disabled="(selStep.opts?.length ?? 0) >= OPTS_MAX" @click="addOpt">+ Вариант</button></div>
          <p class="note">2–4 варианта. Ученик выбирает один раз и сразу видит, верно ли.</p>
        </template>

        <!-- Пары -->
        <template v-else-if="selStep.kind === 'pairs'">
          <label class="lab">Пары <small>слово — перевод</small></label>
          <div v-for="(p, k) in selStep.pairs" :key="k" class="pair">
            <input v-model="p.a" class="in" placeholder="I approve" @input="changed" /><span>—</span><input v-model="p.b" class="in" placeholder="одобряю" @input="changed" />
            <button class="icon-btn danger sm" title="Убрать пару" @click="delPair(k)">✕</button>
          </div>
          <div class="row2"><button class="btn primary" :disabled="(selStep.pairs?.length ?? 0) >= PAIRS_MAX" @click="openPicker('pairs')">Из карточек</button><button class="btn" :disabled="(selStep.pairs?.length ?? 0) >= PAIRS_MAX" @click="addPair">+ Пара</button></div>
          <p class="note">2–6 пар. У ученика обе колонки перемешаны.</p>
        </template>
        <button v-if="narrow" class="btn" @click="run = { start: selIndex, single: true }">Как увидит ученик</button>
      </template>
    </aside>

    <!-- Сверху -->
    <div class="fl tl">
      <BackButton to="Курс" @click="emit('close')" /><i class="vs" />
      <span class="tk">{{ typeName }}</span>
      <input v-model="item.title" class="ttl" aria-label="Название урока" @input="changed" />
    </div>
    <div class="fl tr">
      <span class="cnt">{{ steps.length }} {{ steps.length % 10 === 1 && steps.length % 100 !== 11 ? 'экран' : [2, 3, 4].includes(steps.length % 10) && ![12, 13, 14].includes(steps.length % 100) ? 'экрана' : 'экранов' }}<small v-if="issues" class="iss">· не заполнено {{ issues }}</small></span>
      <button class="btn primary sm" :disabled="!steps.length" @click="run = { start: 0, single: false }">Пройти урок</button>
    </div>

    <!-- Снизу: раскрывающийся список интерактивов -->
    <div class="fl tools">
      <div v-if="menu" class="menu" @pointerdown.stop>
        <div class="mh">Тяните на рельс или нажмите — в конец</div>
        <button v-for="k in KIND_LIST" :key="k" class="mi" :style="{ '--c': KINDS[k].c, '--d': KINDS[k].dk }" @pointerdown.prevent="startDrag($event, { kind: k })">
          <span class="pc"><svg viewBox="0 0 24 24" v-html="KINDS[k].ic" /></span><span class="mt"><b>{{ KINDS[k].t }}</b><small>{{ KINDS[k].d }}</small></span>
        </button>
      </div>
      <button class="dd" :class="{ on: menu }" @click="menu = !menu">
        <span class="plus">+</span>Интерактив<svg viewBox="0 0 24 24" class="chev"><path d="M6 15l6-6 6 6" /></svg>
      </button>
    </div>

    <!-- Взятое — за пальцем -->
    <div v-if="drag.on" class="fly" :class="{ out: !drag.over }" :style="{ left: drag.x + 'px', top: drag.y + 'px', '--c': KINDS[drag.item.kind].c, '--d': KINDS[drag.item.kind].dk }">
      <svg viewBox="0 0 24 24" class="ic" v-html="KINDS[drag.item.kind].ic" />
    </div>

    <!-- Карточки из колод -->
    <div v-if="picker.on" class="ov" @pointerdown.self="picker.on = false">
      <div class="pk">
        <div class="pkh"><b>Карточки</b><small>{{ picker.max === 1 ? 'выберите одну' : `до ${picker.max}` }}</small><button class="icon-btn" @click="picker.on = false">✕</button></div>
        <div v-if="!decks.list.length" class="note">Колод пока нет — создайте их в разделе «Слова».</div>
        <template v-else>
          <div class="chips"><button :class="{ on: !picker.deck }" @click="picker.deck = null">Все</button><button v-for="d in decks.list" :key="d.id" :class="{ on: picker.deck === d.id }" @click="picker.deck = d.id">{{ d.title }} <small>{{ d.cards.length }}</small></button></div>
          <input v-model="picker.q" class="in" placeholder="Поиск по слову или переводу" />
          <div class="cl">
            <button v-for="c in shown" :key="c.id" class="cr" :class="{ on: picker.chosen.some(x => x.id === c.id) }" @click="toggleCard(c)">
              <span class="ct"><img v-if="c.image" :src="resolve(c.image, 'image')" alt="" loading="lazy" /></span>
              <span class="cw"><b>{{ c.front }}</b><small>{{ c.back }}</small></span>
              <span class="cm"><span v-if="c.audio" title="Есть звук">♪</span><small v-if="!picker.deck">{{ deckName(c.deck) }}</small></span>
            </button>
            <p v-if="!shown.length" class="note">Ничего не нашлось</p>
          </div>
          <div v-if="picker.max > 1" class="pkf"><button class="btn primary" :disabled="!picker.chosen.length" @click="takeCards">Добавить {{ picker.chosen.length || '' }}</button></div>
        </template>
      </div>
    </div>

    <!-- Урок целиком / один экран на телефоне -->
    <div v-if="run" class="ov run">
      <div class="runbox"><LessonPlayer :steps="steps" :start="run.start" :single="run.single" :resolve="resolve" closable @close="run = null" /></div>
    </div>
  </div>
</template>

<style scoped>
.lb { position: fixed; inset: 0; z-index: 60; display: grid; grid-template-columns: 340px 1fr 380px; background: #f5f5f5; background-image: radial-gradient(circle, #cfcfcf 1px, transparent 1.3px); background-size: 20px 20px; font-family: var(--font); user-select: none }
.lb.narrow { grid-template-columns: 1fr }
.lb.dragging, .lb.dragging * { cursor: grabbing !important }
/* рельс */
.col { position: relative; overflow-y: auto; overflow-x: hidden; padding: 64px 0 120px; scrollbar-width: thin }
.rail { position: relative; margin-left: 90px }
.narrow .rail { margin-left: max(70px, calc(50% - 90px)) }
.line { position: absolute; left: 0; top: 0; width: 1px; overflow: visible; pointer-events: none } .line line { stroke: #e0e0e0; stroke-width: 12; stroke-linecap: round }
.bead { position: absolute; left: 0; width: 60px; height: 60px; margin: -30px 0 0 -30px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 5px 0 var(--d);
  cursor: grab; transition: top .2s ease, transform .12s; touch-action: none; z-index: 2 }
.bead:hover { transform: translateY(-2px) }
.bead.on { outline: 3px solid #0d99ff; outline-offset: 6px }
.bead.lift { background: #fff; box-shadow: none; outline: 3px dashed var(--c); outline-offset: -3px; transform: none } .bead.lift > * { visibility: hidden }
.bead.final { width: 68px; height: 68px; margin: -34px 0 0 -34px; cursor: pointer; box-shadow: 0 5px 0 var(--d), 0 0 0 6px #f5f5f5, 0 0 0 9px var(--c) }
.ic { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
.warn { position: absolute; right: -4px; top: -4px; width: 20px; height: 20px; border-radius: 50%; background: var(--orange); box-shadow: 0 0 0 2px #fff; color: #fff; font-size: 13px; font-weight: 900; font-style: normal; display: grid; place-items: center }
.cap { position: absolute; top: 50%; left: calc(100% + 16px); transform: translateY(-50%); width: 170px; display: grid; gap: 1px; font-style: normal; font-size: 14px; font-weight: 800; line-height: 1.2; color: var(--text); pointer-events: none; overflow: hidden; text-overflow: ellipsis }
.cap small { font-size: 11px; font-weight: 700; color: var(--hint) }
.hint0 { position: absolute; left: -60px; top: 130px; width: 220px; margin: 0; padding: 10px 12px; border-radius: 12px; background: #fff; border: 1px solid var(--border); font-size: 13px; color: var(--hint) }
/* как увидит ученик */
.stage { display: grid; place-items: center; padding: 70px 10px 110px; min-width: 0 }
.phone { width: min(420px, 100%); height: min(720px, 100%); border-radius: 26px; overflow: hidden; background: #fff; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0, 0, 0, .08) }
/* настройки */
.side { display: flex; flex-direction: column; gap: 8px; margin: 70px 14px 110px 0; padding: 14px; overflow-y: auto; background: #fff; border: 1px solid var(--border); border-radius: 16px; user-select: text }
.narrow .side { position: fixed; left: 8px; right: 8px; bottom: 88px; top: auto; margin: 0; max-height: 64vh; z-index: 8; box-shadow: 0 10px 30px rgba(0, 0, 0, .16) }
.sh { display: flex; align-items: center; gap: 8px } .sh b { flex: 1; font-size: 16px }
.kc { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--c); color: #fff } .kc svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round }
.icon-btn { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 10px; background: #fff; color: var(--hint); cursor: pointer; padding: 0; font: inherit; font-size: 14px }
.icon-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.icon-btn.danger:hover { color: var(--red-d); border-color: var(--red) } .icon-btn.sm { width: 28px; height: 28px; font-size: 12px }
.issue { margin: 0; padding: 7px 10px; border-radius: 9px; background: var(--orange-l); color: var(--orange-d); font-size: 13px }
.note { margin: 2px 0; font-size: 12px; color: var(--hint); font-weight: 600 }
.lab { margin: 6px 0 0; font-size: 12px; font-weight: 800; color: var(--hint) } .lab small { font-weight: 600; color: var(--hint-2) }
.in { width: 100%; margin: 0; padding: 8px 10px; border: 1px solid var(--border); border-radius: 9px; font: inherit; font-size: 14px; font-weight: 700; color: var(--text); background: #fff; resize: vertical; box-sizing: border-box }
.in:focus { border-color: var(--blue) } .in.sm { font-size: 12px; font-weight: 600; padding: 5px 8px }
.btn.sm { padding: 7px 12px; font-size: 13px; border-radius: 10px }
.side > * { flex-shrink: 0 }
.files { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; align-items: start }
.fx { display: grid; align-content: start; justify-items: start; gap: 6px; padding: 8px; border: 1px solid var(--border); border-radius: 12px; position: relative } .fx .lab { margin: 0 }
.fx.wide { margin-top: 2px }
.fx > .aw, .fx > .thumb { justify-self: stretch }
.thumb { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 8px; background: #000 }
.fa { display: flex; gap: 6px; flex-wrap: wrap }
.pct { position: absolute; right: 8px; top: 8px; font-size: 11px; font-weight: 900; color: var(--blue) }
.seg { display: flex; padding: 2px; border-radius: 10px; background: var(--surface) } .seg button { flex: 1; border: 0; border-radius: 8px; padding: 6px 10px; background: none; font: inherit; font-size: 13px; font-weight: 800; color: var(--hint); cursor: pointer }
.seg button.on { background: #fff; color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.opt { display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid var(--border); border-radius: 12px } .opt.right { border-color: #1fbe78; background: #effcf5 }
.rad { flex: none; width: 26px; height: 26px; border: 2px solid var(--border); border-radius: 50%; background: #fff; display: grid; place-items: center; cursor: pointer; padding: 0 }
.rad svg { width: 14px; height: 14px; fill: none; stroke: transparent; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round } .opt.right .rad { background: #1fbe78; border-color: #1fbe78 } .opt.right .rad svg { stroke: #fff }
.oth { position: relative; flex: none; width: 54px; height: 36px; border: 1px dashed var(--border); border-radius: 8px; background: var(--surface); display: grid; place-items: center; padding: 0; overflow: hidden; cursor: pointer }
.oth img { width: 100%; height: 100%; object-fit: cover } .oth svg { width: 18px; height: 18px; fill: none; stroke: var(--hint-2); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.oth em { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255, 255, 255, .8); font-size: 10px; font-style: normal; color: var(--blue) }
.ot { flex: 1; display: grid; gap: 3px; min-width: 0 } .aud { color: var(--blue); font-size: 14px }
.pair { display: flex; align-items: center; gap: 6px } .pair span { color: var(--hint-2) }
.row2 { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px }
/* панели */
.fl { position: fixed; z-index: 7; background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04) }
.tl { left: 14px; top: 14px; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; max-width: calc(100% - 330px) }
.tk { font-size: 11px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px; white-space: nowrap }
.ttl { width: 240px; min-width: 0; margin: 0; padding: 6px 8px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 15px; font-weight: 800; color: var(--text) } .ttl:focus { background: var(--surface) }
.vs { width: 1px; height: 24px; margin: 0 4px; background: var(--border) }
.tr { right: 14px; top: 14px; display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 14px }
.cnt { font-size: 13px; font-weight: 800; white-space: nowrap } .iss { margin-left: 4px; color: var(--orange-d); font-size: 12px }
.tools { left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; height: 62px; padding: 0 8px; border-radius: 18px; box-shadow: 0 2px 6px rgba(0, 0, 0, .06), 0 6px 22px rgba(0, 0, 0, .1) }
.dd { display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 14px 0 8px; border: 0; border-radius: 12px; background: var(--surface); font: inherit; font-size: 15px; font-weight: 800; color: var(--text); cursor: pointer }
.dd.on { background: var(--blue-l) } .plus { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--blue); color: #fff; font-size: 20px; line-height: 1 }
.chev { width: 16px; height: 16px; fill: none; stroke: var(--hint); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s } .dd:not(.on) .chev { transform: rotate(180deg) }
.pc { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 3px 0 var(--d) }
.pc svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round }
.menu { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(100% + 10px); width: 360px; display: grid; gap: 2px; padding: 8px; background: #fff; border-radius: 16px; box-shadow: 0 10px 30px rgba(0, 0, 0, .16), 0 0 0 1px rgba(0, 0, 0, .04); animation: pop .14s ease-out }
@keyframes pop { from { opacity: 0 } }
.mh { padding: 4px 8px 6px; font-size: 11px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.mi { display: flex; align-items: center; gap: 12px; padding: 8px; border: 0; border-radius: 12px; background: none; font: inherit; text-align: left; cursor: grab; touch-action: none } .mi:hover { background: var(--surface) }
.mt { display: grid; gap: 1px } .mt b { font-size: 14px; color: var(--text) } .mt small { font-size: 12px; font-weight: 600; color: var(--hint); line-height: 1.25 }
.fly { position: fixed; z-index: 90; width: 60px; height: 60px; margin: -30px 0 0 -30px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 5px 0 var(--d), 0 14px 26px rgba(0, 0, 0, .22); pointer-events: none; transition: opacity .12s }
.fly.out { opacity: .45 }
/* окна */
.ov { position: fixed; inset: 0; z-index: 95; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .35) }
.pk { width: min(560px, 100%); max-height: min(720px, 92vh); display: flex; flex-direction: column; gap: 10px; padding: 14px; background: #fff; border-radius: 18px; user-select: text }
.pkh { display: flex; align-items: center; gap: 8px } .pkh b { font-size: 17px } .pkh small { flex: 1; color: var(--hint); font-size: 12px }
.chips { display: flex; gap: 6px; flex-wrap: wrap } .chips button { border: 1px solid var(--border); border-radius: 18px; padding: 5px 11px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; color: var(--text); cursor: pointer }
.chips button.on { background: var(--blue-l); border-color: var(--blue-l) } .chips small { color: var(--hint); font-size: 11px }
.cl { flex: 1; overflow-y: auto; display: grid; gap: 4px; align-content: start; min-height: 160px }
.cr { display: flex; align-items: center; gap: 10px; padding: 6px; border: 1px solid transparent; border-radius: 10px; background: none; font: inherit; text-align: left; cursor: pointer; color: var(--text) }
.cr:hover { background: var(--surface) } .cr.on { background: var(--blue-l); border-color: var(--blue) }
.ct { flex: none; width: 54px; height: 36px; border-radius: 7px; background: var(--surface); overflow: hidden } .ct img { width: 100%; height: 100%; object-fit: cover }
.cw { flex: 1; display: grid; min-width: 0 } .cw b { font-size: 14px } .cw small { font-size: 12px; color: var(--hint); font-weight: 600 }
.cm { display: grid; justify-items: end; color: var(--blue); font-size: 13px } .cm small { color: var(--hint-2); font-size: 11px; font-weight: 600 }
.pkf { display: flex; justify-content: flex-end }
.run { background: rgba(0, 0, 0, .45) } .runbox { width: min(560px, 100%); height: min(820px, 96vh); border-radius: 22px; overflow: hidden; background: #fff }
@media (max-width: 719px) {
  .tl { left: 8px; right: 8px; top: 8px; max-width: none } .ttl { flex: 1; width: auto }
  .tr { left: 8px; right: 8px; top: 58px; justify-content: space-between }
  .col { padding-top: 110px }
  .tools { left: 8px; right: 8px; bottom: 10px; transform: none; height: 62px } .dd { flex: 1; justify-content: center }
  .menu { width: auto; left: 0; right: 0; transform: none }
  .runbox { height: 100%; border-radius: 0 } .run { padding: 0 }
}
</style>

<script setup>
// Интерактивный урок глазами ученика (как в Busuu): сверху полоска прогресса, экран за экраном, снизу «Продолжить».
//  • Новое слово — видео или фото, звук, слово с переводом и пример.
//  • Выбери ответ — вопрос на слух или переводом; один ответ: сразу видно, верно или нет.
//  • Пары — нажать слово, потом перевод; верная пара зеленеет, ошибка мигает красным.
//  • Собери фразу — плашки-слова вразброс, нажимаешь по порядку; собрал все — проверка, снизу фраза, перевод и пояснение.
//  • Подсказка — правило (**жирное**) и табличка фраз со звуком.
//  • Повтори за диктором — видео, «Ещё раз», запись своего голоса (микрофон) и «Перевести».
//  • Заполни пропуск — есть варианты: плашки; нет — вписать и «Проверить».
//  • Ответь на вопрос — фото и вопрос, подсказка; ответ голосом или письменно (без проверки, снизу — пример ответа).
//  • Последний экран — всегда итог урока: время, сколько верно, слова урока.
// В конструкторе (single) показывает один экран без перемешивания — чтобы правки было видно на месте.
// На ветке урока в редакторе (embedded) — один живой экран: отвечаешь, «Продолжить» → emit('next', счёт экрана);
// прогресс (pct) и итог (stats) приходят от ветки; на итоге — «Заново» и «Во весь экран».
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import AudioPill from './AudioPill.vue'
import BackButton from './BackButton.vue'
import { KINDS, shuffle, phraseWords, tipParts, gapParts, sameAnswer } from '../utils/lesson'

const props = defineProps({
  steps: { type: Array, required: true },
  resolve: { type: Function, required: true },            // (ссылка, 'image' | 'audio' | 'video') → адрес для <img> / <audio> / <video>
  start: { type: Number, default: 0 },
  single: Boolean,                                        // просмотр одного экрана в конструкторе
  name: { type: String, default: '' },
  closable: Boolean, closeText: { type: String, default: '' },   // closeText — вместо ✕ наша кнопка «назад» (стрелка), подпись — в подсказке
  embedded: Boolean, pct: { type: Number, default: null }, stats: { type: Object, default: null },
})
const emit = defineEmits(['close', 'done', 'next', 'restart', 'full'])

const i = ref(props.start), t0 = Date.now(), endT = ref(0)
const score = reactive({ ok: 0, all: 0 })
const step = computed(() => props.steps[i.value])
const isFinal = computed(() => i.value >= props.steps.length)
const pct = computed(() => props.pct != null ? props.pct : props.single ? (props.steps.length ? Math.round(Math.min(i.value + 1, props.steps.length) / (props.steps.length + 1) * 100) : 0)
  : Math.round(i.value / (props.steps.length || 1) * 100))
const src = (v, k) => (v ? props.resolve(v, k) : '')

// ---- состояние текущего экрана ----
let au = null
const mine = reactive({ ok: 0, all: 0 })           // счёт этого экрана (для ветки в редакторе)
const st = reactive({ picked: null, done: false, left: null, right: null, matched: [], bad: [], order: [], L: [], R: [], pool: [], built: [], typed: '', res: null, showTr: false, hint: false, mode: '', text: '' })
function setup() {
  Object.assign(st, { picked: null, done: false, left: null, right: null, matched: [], bad: [], built: [], typed: '', res: null, showTr: false, hint: false, mode: '', text: '' }); Object.assign(mine, { ok: 0, all: 0 })
  recStop(true); rec.url = ''; rec.err = ''
  const s = step.value; if (!s) return
  if (s.kind === 'choice') { const idx = (s.opts ?? []).map((_, k) => k); st.order = props.single ? idx : shuffle(idx) }
  if (s.kind === 'pairs') {
    const idx = full(s).map((_, k) => k)
    st.L = props.single ? idx : shuffle(idx); st.R = props.single ? idx.slice().reverse() : shuffle(idx)
  }
  if (s.kind === 'order') { const idx = phraseWords(s.phrase).map((_, k) => k); let o = shuffle(idx); if (idx.length > 1 && o.every((v, k) => v === k)) o = idx.slice(1).concat(0); st.pool = o }
  if (s.kind === 'gap' && s.opts?.length) { const idx = s.opts.map((_, k) => k); st.order = props.single ? idx : shuffle(idx) }
  if (s.kind === 'intro' || s.kind === 'tip' || s.kind === 'speak') st.done = true
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
const checks = computed(() => ['choice', 'order', 'gap'].includes(step.value?.kind))

// ---- пары ----
function tap(side, k) {
  if (st.matched.includes(k) && side) return
  st[side] = st[side] === k ? null : k
  if (st.left == null || st.right == null) return
  const a = st.left, b = st.right; st.left = st.right = null; score.all++; mine.all++
  if (a === b) { st.matched.push(a); score.ok++; mine.ok++; if (st.matched.length === full(step.value).length) st.done = true }
  else { st.bad = [a, 'r' + b]; setTimeout(() => { st.bad = [] }, 550) }
}

// ---- проверка ответа (choice / order / gap): верно → зелёный низ, нет → красный и правильный ответ ----
function verdict(ok) { st.res = ok; st.done = true; score.all++; mine.all++; if (ok) { score.ok++; mine.ok++ } }

// ---- собери фразу ----
const pw = computed(() => phraseWords(step.value?.phrase))
function put(k) { if (st.done) return; st.pool = st.pool.filter(x => x !== k); st.built.push(k); if (!st.pool.length) verdict(st.built.map(x => pw.value[x]).join(' ') === pw.value.join(' ')) }
function back(k) { if (st.done) return; st.built = st.built.filter(x => x !== k); st.pool.push(k) }

// ---- пропуск ----
const gp = computed(() => gapParts(step.value?.phrase))
function fill(k) { if (st.done) return; st.picked = k; st.typed = step.value.opts[k].w; verdict(sameAnswer(st.typed, gp.value.gap)) }
function check() { if (st.done || !st.typed.trim()) return; verdict(sameAnswer(st.typed, gp.value.gap)) }

// ---- запись голоса («Повтори за диктором», «Ответь на вопрос» устно) ----
const rec = reactive({ on: false, url: '', err: '' }); let mr = null, chunks = []
async function recToggle() {
  if (rec.on) return recStop()
  rec.err = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mr = new MediaRecorder(stream); chunks = []
    mr.ondataavailable = (e) => chunks.push(e.data)
    mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (chunks.length) { if (rec.url) URL.revokeObjectURL(rec.url); rec.url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType })); if (step.value?.kind === 'answer') st.done = true } }
    mr.start(); rec.on = true
  } catch { rec.err = 'Нет доступа к микрофону' }
}
function recStop(drop) { if (!mr) return; if (drop) chunks = []; if (mr.state !== 'inactive') mr.stop(); mr = null; rec.on = false }
onUnmounted(() => recStop(true))
const vid = ref(null)
function again() { const v = vid.value; if (v) { v.currentTime = 0; v.play().catch(() => {}) } else if (step.value?.audio) say(step.value.audio) }
function sendText() { if (st.text.trim()) st.done = true }

// ---- дальше ----
function next() { if (props.single || !st.done) return; if (props.embedded) return emit('next', { ...mine }); i.value++ }
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
// всё объявлено — теперь можно запускать (immediate вызывает setup сразу)
watch([i, () => (props.single || props.embedded ? JSON.stringify(step.value) : props.steps)], setup, { immediate: true })     // в конструкторе — заново при каждой правке
watch(() => props.start, (v) => { i.value = v })          // ветка в редакторе: экраны добавили / переставили — этот кадр показывает свой экран
watch(isFinal, (v) => { if (v && !endT.value) { endT.value = Date.now(); emit('done', { ...score }) } }, { immediate: true })
const onKey = (e) => { if (e.key === 'Enter' && !props.single && !props.embedded && !/INPUT|TEXTAREA/.test(e.target?.tagName)) isFinal.value ? emit('close') : next() }
const needCheck = computed(() => step.value?.kind === 'gap' && !step.value.opts?.length && !st.done)
onMounted(() => addEventListener('keydown', onKey)); onUnmounted(() => removeEventListener('keydown', onKey))
</script>

<template>
  <div class="lp" :class="{ single, embedded }">
    <div class="top">
      <BackButton v-if="closable && closeText" :to="closeText" @click="emit('close')" />
      <button v-else-if="closable" class="x" title="Закрыть" @click="emit('close')"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      <div class="pb"><i :style="{ width: (isFinal ? 100 : pct) + '%' }" /></div>
    </div>

    <!-- Итог урока -->
    <div v-if="isFinal" class="body fin">
      <svg class="thumb" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="var(--yellow)" /><path d="M20 30h7l6-12c3 0 4.5 2 4 5l-1.5 6H45a3.5 3.5 0 0 1 3.4 4.3l-3 11A4 4 0 0 1 41.5 47H27l-7-2z" fill="#fff" /><rect x="15" y="29" width="7" height="18" rx="2" fill="#fff" /></svg>
      <h2>Отлично{{ name ? ', ' + name : '' }}!</h2>
      <div class="tiles"><div><small>Время</small><b>{{ single || (embedded && !stats) ? '—' : time }}</b></div><div><small>Верно</small><b>{{ single || (embedded && !stats) ? '—' : acc + '%' }}</b></div><div><small>Экранов</small><b>{{ steps.length }}</b></div></div>
      <div v-if="words.length" class="wl">
        <div class="wh">Слова урока</div>
        <div v-for="x in words" :key="x.w" class="wr"><button v-if="x.a" class="say" title="Послушать" @click="say(x.a)"><svg viewBox="0 0 24 24"><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg></button><span v-else class="say no" /><b>{{ x.w }}</b><small>{{ x.t }}</small></div>
      </div>
    </div>

    <!-- Новое слово -->
    <div v-else-if="step.kind === 'intro'" class="body">
      <h3 class="hd">{{ KINDS.intro.head }}</h3>
      <!-- как в Busuu: фото со звуком поверх, под ним голубой блок со словом — одной карточкой -->
      <div class="nw">
        <div v-if="step.video || step.image" class="media">
          <video v-if="step.video" :src="src(step.video, 'video')" controls playsinline :autoplay="!single" />
          <img v-else :src="src(step.image, 'image')" alt="" />
          <AudioPill v-if="step.audio && !step.video" :key="step.audio" :src="src(step.audio, 'audio')" class="over" />
        </div>
        <AudioPill v-else-if="step.audio" :key="step.audio" :src="src(step.audio, 'audio')" />
        <div v-if="step.word || step.tr" class="word" :class="{ joined: step.video || step.image }"><b>{{ step.word }}</b><span>{{ step.tr }}</span></div>
      </div>
      <div v-if="step.ex" class="ex"><small>Пример</small>
        <p><button v-if="step.exAudio" class="exs" title="Послушать пример" @click="say(step.exAudio)"><svg viewBox="0 0 24 24"><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg></button>{{ step.ex }}</p><span>{{ step.exTr }}</span></div>
      <p v-if="!step.word && !step.video && !step.image" class="empty">Добавьте слово, видео или фото — или возьмите карточку</p>
    </div>

    <!-- Выбери ответ -->
    <div v-else-if="step.kind === 'choice'" class="body">
      <h3 class="hd">{{ KINDS.choice.head }}</h3>
      <div v-if="step.image" class="nw"><div class="media"><img :src="src(step.image, 'image')" alt="" /><AudioPill v-if="step.ask === 'audio' && qAudio(step)" :key="qAudio(step)" :src="src(qAudio(step), 'audio')" class="over" /></div></div>
      <template v-if="step.image && step.ask === 'audio'" />
      <template v-else-if="step.ask === 'audio'"><AudioPill v-if="qAudio(step)" :key="qAudio(step)" :src="src(qAudio(step), 'audio')" class="qa" /><p v-else class="empty">Нет звука для вопроса</p></template>
      <div v-else class="q">{{ answer?.t || '…' }}</div>
      <div v-if="!step.opts?.length" class="empty">Добавьте варианты — из карточек или свои</div>
      <div v-else :class="step.show === 'pics' ? 'pics' : 'rows'">
        <button v-for="k in st.order" :key="k" class="op" :class="{ ok: st.done && k === (step.ans ?? 0), no: st.done && k === st.picked && k !== (step.ans ?? 0), dim: st.done && k !== st.picked && k !== (step.ans ?? 0) }" @click="pick(k)">
          <span v-if="step.show === 'pics'" class="ph"><img v-if="step.opts[k].image" :src="src(step.opts[k].image, 'image')" alt="" /><i v-else>нет фото</i></span>
          <span class="ow">{{ step.opts[k].w || '…' }}</span>
        </button>
      </div>
    </div>

    <!-- Пары -->
    <div v-else-if="step.kind === 'pairs'" class="body">
      <h3 class="hd">{{ KINDS.pairs.head }}</h3>
      <div v-if="full(step).length < 2" class="empty">Нужно хотя бы 2 пары</div>
      <div v-else class="pairs">
        <div class="col"><button v-for="k in st.L" :key="'l' + k" class="pr" :class="{ sel: st.left === k, ok: st.matched.includes(k), no: st.bad[0] === k }" :disabled="st.matched.includes(k)" @click="tap('left', k)">{{ full(step)[k].a }}</button></div>
        <div class="col"><button v-for="k in st.R" :key="'r' + k" class="pr" :class="{ sel: st.right === k, ok: st.matched.includes(k), no: st.bad[1] === 'r' + k }" :disabled="st.matched.includes(k)" @click="tap('right', k)">{{ full(step)[k].b }}</button></div>
      </div>
    </div>

    <!-- Собери фразу -->
    <div v-else-if="step.kind === 'order'" class="body">
      <h3 class="hd">{{ KINDS.order.head }}</h3>
      <AudioPill v-if="step.audio" :key="step.audio" :src="src(step.audio, 'audio')" class="qa" />
      <div v-if="pw.length < 2" class="empty">Впишите фразу хотя бы из 2 слов</div>
      <template v-else>
        <div class="built" :class="{ ok: st.done && st.res, no: st.done && !st.res }"><button v-for="k in st.built" :key="'b' + k" class="chip" @click="back(k)">{{ pw[k] }}</button></div>
        <div class="pool"><button v-for="k in st.pool" :key="'p' + k" class="chip" @click="put(k)">{{ pw[k] }}</button></div>
      </template>
    </div>

    <!-- Подсказка -->
    <div v-else-if="step.kind === 'tip'" class="body">
      <h3 class="hd">{{ KINDS.tip.head }}</h3>
      <p class="tip"><template v-for="(x, k) in tipParts(step.text)" :key="k"><b v-if="x.b">{{ x.x }}</b><template v-else>{{ x.x }}</template></template></p>
      <div v-if="step.opts?.length" class="tt">
        <div v-for="(o, k) in step.opts" :key="k" class="tr"><span><button v-if="o.audio" class="exs" title="Послушать" @click="say(o.audio)"><svg viewBox="0 0 24 24"><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg></button>{{ o.w }}</span><span>{{ o.t }}</span></div>
      </div>
    </div>

    <!-- Повтори за диктором -->
    <div v-else-if="step.kind === 'speak'" class="body">
      <h3 class="hd">{{ KINDS.speak.head }}</h3>
      <div class="nw">
        <div v-if="step.video || step.image" class="media">
          <video v-if="step.video" ref="vid" :src="src(step.video, 'video')" playsinline :autoplay="!single && !embedded" @click="again" />
          <img v-else :src="src(step.image, 'image')" alt="" />
          <span v-if="step.phrase" class="cap">{{ step.phrase }}</span>
          <AudioPill v-if="!step.video && step.audio" :key="step.audio" :src="src(step.audio, 'audio')" class="over" />
        </div>
        <AudioPill v-else-if="step.audio" :key="step.audio" :src="src(step.audio, 'audio')" />
        <p v-if="!step.video && !step.image && step.phrase" class="q">{{ step.phrase }}</p>
      </div>
      <p v-if="st.showTr && step.tr" class="trl">{{ step.tr }}</p>
      <div class="acts">
        <button class="act" @click="again"><i><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg></i>Ещё раз</button>
        <button class="act big" :class="{ on: rec.on }" @click="recToggle"><i><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg></i>{{ rec.on ? 'Стоп' : 'Нажми и повтори' }}</button>
        <button class="act" :disabled="!step.tr" @click="st.showTr = !st.showTr"><i><svg viewBox="0 0 24 24"><path d="M4 6h9M8.5 4v2c0 4-2 7-4.5 8.5M6 10c1 2 3 3.5 5 4.5M13 20l4-9 4 9M14.5 17h5" /></svg></i>Перевести</button>
      </div>
      <AudioPill v-if="rec.url" :key="rec.url" :src="rec.url" class="qa mine" />
      <p v-if="rec.err" class="err">{{ rec.err }}</p>
    </div>

    <!-- Заполни пропуск / Закончи предложение -->
    <div v-else-if="step.kind === 'gap'" class="body">
      <h3 class="hd">{{ KINDS.gap.head }}</h3>
      <div v-if="step.video || step.image" class="nw"><div class="media">
        <video v-if="step.video" ref="vid" :src="src(step.video, 'video')" playsinline :autoplay="!single && !embedded" @click="again" />
        <img v-else :src="src(step.image, 'image')" alt="" />
        <AudioPill v-if="step.video ? vid : step.audio" :key="step.video || step.audio" :media="step.video ? vid : null" :src="step.video ? '' : src(step.audio, 'audio')" class="over" />
      </div></div>
      <AudioPill v-else-if="step.audio" :key="step.audio" :src="src(step.audio, 'audio')" class="qa" />
      <div v-if="!gp.gap" class="empty">Отметьте пропуск: слово в [квадратных скобках]</div>
      <p v-else class="sent">{{ gp.a }}<span v-if="step.opts?.length" class="slot" :class="{ ok: st.done && st.res, no: st.done && !st.res }">{{ st.typed || '\u00a0' }}</span><input v-else v-model="st.typed" class="slot in" :style="{ width: gp.gap.length + 3 + 'ch' }" :class="{ ok: st.done && st.res, no: st.done && !st.res }" :readonly="st.done" :size="Math.max(4, gp.gap.length + 1)" autocomplete="off" autocapitalize="off" spellcheck="false" @keydown.enter.stop="check" />{{ gp.b }}</p>
      <div v-if="step.opts?.length" class="pool">
        <button v-for="k in st.order" :key="k" class="chip" :class="{ ok: st.done && sameAnswer(step.opts[k].w, gp.gap), no: st.done && k === st.picked && !st.res }" @click="fill(k)">{{ step.opts[k].w }}</button>
      </div>
    </div>

    <!-- Ответь на вопрос -->
    <div v-else-if="step.kind === 'answer'" class="body">
      <h3 class="hd">{{ KINDS.answer.head }}</h3>
      <div class="nw">
        <div v-if="step.image || step.video" class="media"><video v-if="step.video" :src="src(step.video, 'video')" playsinline controls /><img v-else :src="src(step.image, 'image')" alt="" /></div>
        <div class="word" :class="{ joined: step.image || step.video }"><b class="qq">{{ step.text || '…' }}</b>
          <template v-if="step.note"><button v-if="!st.hint" class="lnk" @click="st.hint = true">Показать подсказку</button><span v-else>{{ step.note }}</span></template></div>
      </div>
      <template v-if="!st.mode">
        <p class="how">Как ты хочешь выполнить это упражнение?</p>
        <div class="two"><button class="out" @click="st.mode = 'say'"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>Говорить</button>
          <button class="out" @click="st.mode = 'write'"><svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z" /></svg>Письменно</button></div>
      </template>
      <div v-else-if="st.mode === 'say'" class="acts">
        <button class="act big" :class="{ on: rec.on }" @click="recToggle"><i><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg></i>{{ rec.on ? 'Стоп' : 'Нажми и говори' }}</button>
      </div>
      <div v-else class="wr2"><textarea v-model="st.text" rows="3" placeholder="Напиши ответ по-английски" :readonly="st.done" /><button v-if="!st.done" class="out" :disabled="!st.text.trim()" @click="sendText">Отправить</button></div>
      <AudioPill v-if="rec.url" :key="rec.url" :src="rec.url" class="qa mine" />
      <p v-if="rec.err" class="err">{{ rec.err }}</p>
    </div>

    <!-- Снизу: результат и «Продолжить» -->
    <div class="foot" :class="{ good: !isFinal && checks && st.done && right, bad: !isFinal && checks && st.done && !right }">
      <span v-if="!isFinal && step.kind === 'choice' && st.done" class="fb"><b>{{ right ? 'Верно!' : 'Правильный ответ:' }}</b><span v-if="!right">{{ answer?.w }}</span></span>
      <span v-else-if="!isFinal && step.kind === 'order' && st.done" class="fb"><b>{{ right ? 'Верно!' : 'Правильно так:' }}</b><span class="fs">{{ step.phrase }}</span><small>{{ step.tr }}</small><small v-if="step.note" class="fn">{{ step.note }}</small></span>
      <span v-else-if="!isFinal && step.kind === 'gap' && st.done" class="fb"><b>{{ right ? 'Верно!' : 'Правильный ответ:' }}</b><span class="fs">{{ gp.a }}{{ gp.gap }}{{ gp.b }}</span><small>{{ step.tr }}</small></span>
      <span v-else-if="!isFinal && step.kind === 'answer' && st.done && step.tr" class="fb"><small>Пример ответа</small><span class="fs">{{ step.tr }}</span></span>
      <span v-else class="fb" />
      <template v-if="embedded && isFinal"><button class="go ghost" @click="emit('restart')">↺ Заново</button><button class="go" @click="emit('full')">Во весь экран</button></template>
      <button v-else-if="needCheck && !single" class="go" :disabled="!st.typed.trim()" @click="check">Проверить</button>
      <button v-else-if="embedded" class="go" :disabled="!st.done" @click="next">Продолжить</button>
      <button v-else-if="isFinal" class="go" @click="emit('close')">{{ single ? 'Так увидит ученик' : 'Готово' }}</button>
      <button v-else class="go" :disabled="!st.done && !single" @click="next">{{ single ? 'Так увидит ученик' : 'Продолжить' }}</button>
    </div>
  </div>
</template>

<style scoped>
.lp { position: relative; display: flex; flex-direction: column; height: 100%; background: #fff; color: var(--text); font-family: var(--font); user-select: none }
.top { display: flex; align-items: center; gap: 12px; padding: 18px 22px 6px; max-width: 640px; width: 100%; margin: 0 auto; box-sizing: border-box }
.x { flex: none; width: 32px; height: 32px; border: 0; background: none; border-radius: 8px; cursor: pointer; display: grid; place-items: center } .x:hover { background: var(--surface) }
.x svg { width: 20px; height: 20px; stroke: var(--hint); stroke-width: 2.6; stroke-linecap: round }
.pb { flex: 1; height: 10px; border-radius: 6px; background: #e8e8e8; overflow: hidden } .pb i { display: block; height: 100%; border-radius: 6px; background: #1fbe78; transition: width .3s }
.body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; align-items: stretch; gap: 14px; width: 100%; max-width: 520px; margin: 0 auto; padding: 14px 22px 24px; box-sizing: border-box }
.hd { margin: 8px 0 4px; text-align: center; font-size: 15px; font-weight: 800 }
.qa { width: 100%; max-width: 420px; align-self: center; height: 34px; border-radius: 17px; margin: 6px 0 10px }
.nw { width: 100%; max-width: 380px; align-self: center; display: grid }
.media { position: relative; border-radius: 12px 12px 0 0; overflow: hidden; background: #000; aspect-ratio: 16 / 9 } .media video, .media img { display: block; width: 100%; height: 100%; object-fit: cover }
.media:last-child { border-radius: 12px }
.media .over { position: absolute; left: 8%; right: 8%; bottom: 10px }
.aw { align-self: stretch }
.word { display: grid; justify-items: center; gap: 4px; padding: 12px; border-radius: 12px; background: #f1f6ff; text-align: center }
.word.joined { border-radius: 0 0 12px 12px }
.word b { font-size: 16px; font-weight: 800 } .word span { font-size: 12px; color: var(--hint); font-weight: 600 }
.ex { display: grid; gap: 3px; width: 100%; max-width: 380px; align-self: center; padding: 0 2px; box-sizing: border-box } .ex small { font-size: 10px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .4px }
.ex p { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 15px; font-weight: 600 } .ex span { font-size: 12px; color: var(--hint); font-weight: 600 }
.exs { flex: none; display: grid; place-items: center; width: 22px; height: 22px; margin-top: -1px; border: 0; padding: 0; background: none; color: #1a73e8; cursor: pointer }
.exs svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.empty { margin: 6px 0; padding: 18px; border: 1px dashed var(--border); border-radius: 12px; text-align: center; color: var(--hint); font-size: 14px; font-weight: 700 }
.q { padding: 14px; border-radius: 14px; background: #f1f6ff; text-align: center; font-size: 20px; font-weight: 900 }
/* варианты */
.pics { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 10px }
.rows { display: grid; gap: 8px }
.op { display: grid; gap: 0; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: #fff; font: inherit; color: var(--text); cursor: pointer; overflow: hidden; transition: background .12s, border-color .12s, opacity .12s }
.op:hover { border-color: #c9c9c9 }
.ph { display: block; aspect-ratio: 3 / 2; background: var(--surface) } .ph img { display: block; width: 100%; height: 100%; object-fit: cover } .ph i { display: grid; place-items: center; height: 100%; font-size: 12px; color: var(--hint-2); font-style: normal }
.ow { padding: 9px 10px; font-size: 14px; font-weight: 800; text-align: center }
.rows .ow { padding: 13px 12px; font-weight: 600 } .op.ok { background: #8ff0c8; border-color: #8ff0c8 } .op.no { background: var(--red-l); border-color: var(--red) } .op.dim { opacity: .55 }
.op.no { animation: shake .3s }
@keyframes shake { 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
/* пары */
.pairs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px } .col { display: grid; gap: 10px; align-content: start }
.pr { min-height: 48px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: #fff; font: inherit; font-size: 14px; font-weight: 700; color: var(--text); cursor: pointer }
.pr.sel { border-color: var(--blue); background: var(--blue-l) } .pr.ok { background: #8ff0c8; border-color: #8ff0c8; cursor: default } .pr.no { background: var(--red-l); border-color: var(--red); animation: shake .3s }
/* собери фразу, пропуск */
.built { min-height: 50px; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 8px; padding: 10px; border-bottom: 2px solid var(--border) }
.pool { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding-top: 4px }
.chip { padding: 9px 14px; border: 1px solid var(--border); border-radius: 8px; background: #fff; font: inherit; font-size: 15px; font-weight: 600; color: var(--text); cursor: pointer }
.chip:hover { border-color: #1a73e8 } .chip.ok { background: #8ff0c8; border-color: #8ff0c8 } .chip.no { background: var(--red-l); border-color: var(--red); animation: shake .3s }
.built.ok .chip { background: #e3fbef; border-color: #8ff0c8 } .built.no .chip { background: var(--red-l); border-color: var(--red-l) }
.sent { margin: 6px 0; text-align: center; font-size: 18px; font-weight: 600; line-height: 1.6 }
.slot { display: inline-block; min-width: 80px; margin: 0 3px; padding: 0 4px; border-bottom: 2px dotted #1a73e8; color: #1a73e8; text-align: center }
.slot.in { min-width: 0; border: 0; border-bottom: 2px dotted #1a73e8; background: none; font: inherit; outline: none; border-radius: 0 }
.slot.ok { color: #128a55; border-bottom-color: #1fbe78 } .slot.no { color: var(--red-d); border-bottom-color: var(--red) }
/* подсказка */
.tip { margin: 0; font-size: 15px; font-weight: 500; line-height: 1.5 } .tip b { font-weight: 800 }
.tt { border: 1px solid var(--border); border-radius: 12px; overflow: hidden }
.tr { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 11px 12px; font-size: 14px; font-weight: 600 } .tr + .tr { border-top: 1px solid var(--border) }
.tr span:first-child { display: flex; align-items: center; gap: 6px } .tr span:last-child { color: var(--hint) }
/* повтори за диктором, ответь на вопрос */
.cap { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); padding: 4px 12px; border-radius: 6px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 15px; font-weight: 700; white-space: nowrap }
.media video { cursor: pointer }
.trl { margin: 0; text-align: center; color: var(--hint); font-size: 14px; font-weight: 600 }
.acts { display: flex; justify-content: center; align-items: flex-start; gap: 22px; margin-top: 4px }
.act { display: grid; justify-items: center; gap: 6px; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 700; color: #1a73e8; cursor: pointer; padding: 0; width: 84px }
.act i { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid #c9dcfb; background: #fff }
.act svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.act.big i { width: 60px; height: 60px; background: #1a73e8; border-color: #1a73e8; color: #fff } .act.big svg { width: 26px; height: 26px }
.act.on i { background: var(--red); border-color: var(--red); animation: pulse 1s infinite } .act:disabled { opacity: .4; cursor: default }
@keyframes pulse { 50% { box-shadow: 0 0 0 8px rgba(255, 75, 75, .18) } }
.mine { background: #1fbe78 }
.err { margin: 0; text-align: center; color: var(--red-d); font-size: 13px; font-weight: 700 }
.qq { font-size: 15px !important; font-weight: 600 !important } .lnk { border: 0; background: none; padding: 0; color: #1a73e8; text-decoration: underline; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer }
.how { margin: 4px 0 0; text-align: center; font-size: 13px; font-weight: 600 }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; max-width: 380px; align-self: center }
.out { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border: 1.5px solid #1a73e8; border-radius: 22px; background: #fff; color: #1a73e8; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer }
.out svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round } .out:disabled { opacity: .45; cursor: default }
.wr2 { display: grid; gap: 8px; width: 100%; max-width: 380px; align-self: center } .wr2 .out { justify-self: end }
.wr2 textarea { resize: none; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; font: inherit; font-size: 15px; outline: none } .wr2 textarea:focus { border-color: #1a73e8 }
.fs { font-weight: 700 } .fb small { color: var(--hint); font-weight: 600; font-size: 12px } .fn { margin-top: 2px }
/* итог */
.fin { align-items: center; text-align: center } .thumb { width: 72px; height: 72px; margin-top: 10px }
.fin h2 { margin: 0; font-size: 22px }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; max-width: 340px }
.tiles div { display: grid; gap: 2px; padding: 10px 6px; border: 1px solid var(--border); border-radius: 12px } .tiles small { font-size: 11px; color: var(--hint); font-weight: 700 } .tiles b { font-size: 17px }
.wl { width: 100%; display: grid; gap: 6px; text-align: left } .wh { font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.wr { display: grid; grid-template-columns: 30px auto 1fr; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--surface) }
.wr b { font-size: 14px } .wr small { font-size: 12px; color: var(--hint); font-weight: 600 }
.say { width: 28px; height: 28px; border: 0; border-radius: 50%; background: #fff; display: grid; place-items: center; cursor: pointer; padding: 0 } .say.no { background: none }
.say svg { width: 16px; height: 16px; fill: none; stroke: var(--blue); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
/* низ */
.foot { display: flex; align-items: center; gap: 12px; padding: 14px 22px; border-top: 1px solid var(--border); background: #fff; transition: background .15s }
.foot.good { background: #e3fbef } .foot.bad { background: var(--red-l) }
.fb { flex: 1; display: grid; font-size: 14px } .foot.good .fb b { color: #128a55 } .foot.bad .fb b { color: var(--red-d) }
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
  .lp:not(.embedded):not(.single) .hd { font-size: 19px; margin-bottom: 6px }
  .lp:not(.embedded):not(.single) .nw, .lp:not(.embedded):not(.single) .ex, .lp:not(.embedded):not(.single) .two, .lp:not(.embedded):not(.single) .wr2 { max-width: 700px }
  .lp:not(.embedded):not(.single) .media { aspect-ratio: 16 / 9 }
  .lp:not(.embedded):not(.single) .word { padding: 18px } .lp:not(.embedded):not(.single) .word b { font-size: 20px } .lp:not(.embedded):not(.single) .word span { font-size: 15px }
  .lp:not(.embedded):not(.single) .ex small { font-size: 12px } .lp:not(.embedded):not(.single) .ex p { font-size: 19px } .lp:not(.embedded):not(.single) .ex span { font-size: 15px }
  .lp:not(.embedded):not(.single) .exs { width: 26px; height: 26px } .lp:not(.embedded):not(.single) .exs svg { width: 22px; height: 22px }
  .lp:not(.embedded):not(.single) .qa { max-width: 700px; height: 42px }
  .lp:not(.embedded):not(.single) :deep(.ap) { height: 40px; border-radius: 20px; padding: 0 10px 0 8px; gap: 12px }
  .lp:not(.embedded):not(.single) :deep(.ap .pp) { width: 30px; height: 30px } .lp:not(.embedded):not(.single) :deep(.ap .pp svg) { width: 20px; height: 20px }
  .lp:not(.embedded):not(.single) :deep(.ap .sp) { font-size: 12px }
  .lp:not(.embedded):not(.single) .media .over { left: 9%; right: 9%; bottom: 16px }
  .lp:not(.embedded):not(.single) .pics { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px }
  .lp:not(.embedded):not(.single) .ow { font-size: 17px; padding: 12px } .lp:not(.embedded):not(.single) .rows .ow { padding: 18px 16px; font-size: 17px }
  .lp:not(.embedded):not(.single) .q { font-size: 24px; padding: 20px }
  .lp:not(.embedded):not(.single) .pr { min-height: 60px; font-size: 17px }
  .lp:not(.embedded):not(.single) .chip { font-size: 18px; padding: 11px 18px } .lp:not(.embedded):not(.single) .sent { font-size: 22px }
  .lp:not(.embedded):not(.single) .tip { font-size: 18px } .lp:not(.embedded):not(.single) .tr { font-size: 16px; padding: 14px 16px }
  .lp:not(.embedded):not(.single) .foot { padding: 18px max(24px, calc(50% - 560px)) } .lp:not(.embedded):not(.single) .fb { font-size: 16px }
  .lp:not(.embedded):not(.single) .go { min-width: 200px; padding: 15px 34px; font-size: 17px; border-radius: 26px }
}
.embedded { height: auto; border-radius: inherit } .embedded .body { flex: none; overflow: visible; padding: 10px 40px 20px } .embedded .top { padding: 16px 110px 4px } .embedded .foot { padding: 10px 14px }
.embedded .go { padding: 9px 22px; font-size: 14px } .go.ghost { background: var(--surface); color: var(--text); margin-right: auto }
.embedded .pb i { transition: width .5s ease }
</style>

<script setup>
// Интерактивный урок глазами ученика (как в Busuu): сверху полоска прогресса, экран за экраном, снизу «Продолжить».
//  • Новое слово — видео или фото, звук, слово с переводом и пример.
//  • Выбери ответ — вопрос на слух или переводом; один ответ: сразу видно, верно или нет.
//  • Пары — нажать слово, потом перевод; верная пара зеленеет, ошибка мигает красным.
//  • Последний экран — всегда итог урока: время, сколько верно, слова урока.
// В конструкторе (single) показывает один экран без перемешивания — чтобы правки было видно на месте.
// На ветке урока в редакторе (embedded) — один живой экран: отвечаешь, «Продолжить» → emit('next', счёт экрана);
// прогресс (pct) и итог (stats) приходят от ветки; на итоге — «Заново» и «Во весь экран».
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import AudioWave from './AudioWave.vue'
import { KINDS, shuffle } from '../utils/lesson'

const props = defineProps({
  steps: { type: Array, required: true },
  resolve: { type: Function, required: true },            // (ссылка, 'image' | 'audio' | 'video') → адрес для <img> / <audio> / <video>
  start: { type: Number, default: 0 },
  single: Boolean,                                        // просмотр одного экрана в конструкторе
  name: { type: String, default: '' },
  closable: Boolean,
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
const st = reactive({ picked: null, done: false, left: null, right: null, matched: [], bad: [], order: [], L: [], R: [] })
function setup() {
  Object.assign(st, { picked: null, done: false, left: null, right: null, matched: [], bad: [] }); Object.assign(mine, { ok: 0, all: 0 })
  const s = step.value; if (!s) return
  if (s.kind === 'choice') { const idx = (s.opts ?? []).map((_, k) => k); st.order = props.single ? idx : shuffle(idx) }
  if (s.kind === 'pairs') {
    const idx = full(s).map((_, k) => k)
    st.L = props.single ? idx : shuffle(idx); st.R = props.single ? idx.slice().reverse() : shuffle(idx)
  }
  if (s.kind === 'intro') st.done = true
  if (!props.single && !props.embedded) autoplay()
}
const full = (s) => (s.pairs ?? []).filter(p => p.a?.trim() && p.b?.trim())

// звук вопроса / нового слова — сразу при показе экрана (если браузер разрешит)
function autoplay() {
  au?.pause(); au = null
  const s = step.value, a = s?.kind === 'intro' ? s.audio : s?.kind === 'choice' && s.ask === 'audio' ? qAudio(s) : ''
  if (!a || (s.kind === 'intro' && s.video)) return
  au = new Audio(src(a, 'audio')); au.play().catch(() => {})
}
onUnmounted(() => au?.pause())
const qAudio = (s) => s.audio || s.opts?.[s.ans ?? 0]?.audio || ''

// ---- выбор ----
function pick(k) {
  if (st.done) return
  st.picked = k; st.done = true; score.all++; mine.all++
  if (k === (step.value.ans ?? 0)) { score.ok++; mine.ok++ }
}
const right = computed(() => step.value?.kind === 'choice' && st.picked === (step.value.ans ?? 0))

// ---- пары ----
function tap(side, k) {
  if (st.matched.includes(k) && side) return
  st[side] = st[side] === k ? null : k
  if (st.left == null || st.right == null) return
  const a = st.left, b = st.right; st.left = st.right = null; score.all++; mine.all++
  if (a === b) { st.matched.push(a); score.ok++; mine.ok++; if (st.matched.length === full(step.value).length) st.done = true }
  else { st.bad = [a, 'r' + b]; setTimeout(() => { st.bad = [] }, 550) }
}

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
  }
  return out
})
const say = (a) => { au?.pause(); au = new Audio(src(a, 'audio')); au.play().catch(() => {}) }
// всё объявлено — теперь можно запускать (immediate вызывает setup сразу)
watch([i, () => (props.single || props.embedded ? JSON.stringify(step.value) : props.steps)], setup, { immediate: true })     // в конструкторе — заново при каждой правке
watch(isFinal, (v) => { if (v && !endT.value) { endT.value = Date.now(); emit('done', { ...score }) } }, { immediate: true })
const onKey = (e) => { if (e.key === 'Enter' && !props.single && !props.embedded && !/INPUT|TEXTAREA/.test(e.target?.tagName)) isFinal.value ? emit('close') : next() }
onMounted(() => addEventListener('keydown', onKey)); onUnmounted(() => removeEventListener('keydown', onKey))
</script>

<template>
  <div class="lp" :class="{ single, embedded }">
    <div class="top">
      <button v-if="closable" class="x" title="Закрыть" @click="emit('close')"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
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
      <div v-if="step.video || step.image" class="media">
        <video v-if="step.video" :src="src(step.video, 'video')" controls playsinline :autoplay="!single" />
        <img v-else :src="src(step.image, 'image')" alt="" />
      </div>
      <AudioWave v-if="step.audio" :key="step.audio" :src="src(step.audio, 'audio')" class="aw" />
      <div v-if="step.word || step.tr" class="word"><b>{{ step.word }}</b><span>{{ step.tr }}</span></div>
      <div v-if="step.ex" class="ex"><small>Пример</small><p>{{ step.ex }}</p><span>{{ step.exTr }}</span></div>
      <p v-if="!step.word && !step.video && !step.image" class="empty">Добавьте слово, видео или фото — или возьмите карточку</p>
    </div>

    <!-- Выбери ответ -->
    <div v-else-if="step.kind === 'choice'" class="body">
      <h3 class="hd">{{ KINDS.choice.head }}</h3>
      <template v-if="step.ask === 'audio'"><AudioWave v-if="qAudio(step)" :key="qAudio(step)" :src="src(qAudio(step), 'audio')" class="aw" /><p v-else class="empty">Нет звука для вопроса</p></template>
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

    <!-- Снизу: результат и «Продолжить» -->
    <div class="foot" :class="{ good: step?.kind === 'choice' && st.done && right, bad: step?.kind === 'choice' && st.done && !right }">
      <template v-if="!isFinal && step.kind === 'choice' && st.done">
        <span class="fb"><b>{{ right ? 'Верно!' : 'Правильный ответ:' }}</b><span v-if="!right">{{ answer?.w }}</span></span>
      </template>
      <span v-else class="fb" />
      <template v-if="embedded && isFinal"><button class="go ghost" @click="emit('restart')">↺ Заново</button><button class="go" @click="emit('full')">Во весь экран</button></template>
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
.hd { margin: 8px 0 2px; text-align: center; font-size: 17px; font-weight: 800 }
.media { border-radius: 14px; overflow: hidden; background: #000; aspect-ratio: 3 / 2 } .media video, .media img { display: block; width: 100%; height: 100%; object-fit: cover }
.aw { align-self: stretch }
.word { display: grid; justify-items: center; gap: 2px; padding: 14px; border-radius: 14px; background: #f1f6ff; text-align: center }
.word b { font-size: 22px; font-weight: 900 } .word span { font-size: 14px; color: var(--hint); font-weight: 700 }
.ex { display: grid; gap: 2px; padding: 0 2px } .ex small { font-size: 11px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.ex p { margin: 0; font-size: 15px; font-weight: 700 } .ex span { font-size: 13px; color: var(--hint); font-weight: 600 }
.empty { margin: 6px 0; padding: 18px; border: 1px dashed var(--border); border-radius: 12px; text-align: center; color: var(--hint); font-size: 14px; font-weight: 700 }
.q { padding: 14px; border-radius: 14px; background: #f1f6ff; text-align: center; font-size: 20px; font-weight: 900 }
/* варианты */
.pics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px }
.rows { display: grid; gap: 8px }
.op { display: grid; gap: 0; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: #fff; font: inherit; color: var(--text); cursor: pointer; overflow: hidden; transition: background .12s, border-color .12s, opacity .12s }
.op:hover { border-color: #c9c9c9 }
.ph { display: block; aspect-ratio: 3 / 2; background: var(--surface) } .ph img { display: block; width: 100%; height: 100%; object-fit: cover } .ph i { display: grid; place-items: center; height: 100%; font-size: 12px; color: var(--hint-2); font-style: normal }
.ow { padding: 9px 10px; font-size: 14px; font-weight: 800; text-align: center }
.rows .ow { padding: 12px } .op.ok { background: #8ff0c8; border-color: #8ff0c8 } .op.no { background: var(--red-l); border-color: var(--red) } .op.dim { opacity: .55 }
.op.no { animation: shake .3s }
@keyframes shake { 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
/* пары */
.pairs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px } .col { display: grid; gap: 10px; align-content: start }
.pr { min-height: 48px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: #fff; font: inherit; font-size: 14px; font-weight: 700; color: var(--text); cursor: pointer }
.pr.sel { border-color: var(--blue); background: var(--blue-l) } .pr.ok { background: #8ff0c8; border-color: #8ff0c8; cursor: default } .pr.no { background: var(--red-l); border-color: var(--red); animation: shake .3s }
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
.embedded { height: auto; border-radius: inherit } .embedded .body { flex: none; overflow: visible; padding: 10px 40px 20px } .embedded .top { padding: 16px 110px 4px } .embedded .foot { padding: 10px 14px }
.embedded .go { padding: 9px 22px; font-size: 14px } .go.ghost { background: var(--surface); color: var(--text); margin-right: auto }
.embedded .pb i { transition: width .5s ease }
</style>

<script setup>
// График колоды: где сейчас каждое слово и как алгоритм (Anki / FSRS) его «отбрасывает».
//  • Столбики — сколько слов придёт в каждый отрезок времени. Масштаб: «Сутки» (по часам), «Неделя», «Месяц» (по дням), «Год» (по месяцам).
//    Отрезки считаются от «сейчас», поэтому со временем столбики сами сдвигаются влево, к «Сейчас».
//  • Нажатие на столбик — слова этого отрезка (карточки с обратным отсчётом); нажатие на слово — его история ответов.
//  • В реальном времени: ответили в сессии — над графиком всплывает «budget · Снова → <1 мин.», столбик с этим словом
//    подсвечивается и сразу открывается. Часы тикают раз в секунду.
//  dock — график сверху сессии (над карточкой), без него — отдельный экран из списка колод.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { srsOf, kindOf, today, LEARNED_DAYS } from '../composables/useSrs'
import { dueMs, recallNow, fmtSpan, memoryOf } from '../utils/fsrs'
import AppIcon from './AppIcon.vue'
const props = defineProps({ deck: { type: Object, required: true }, userKey: { type: [String, Number], required: true }, dock: Boolean })
const emit = defineEmits(['back'])

const now = ref(Date.now()); let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(clock))
const HOUR = 3_600_000, DAY = 86_400_000
const GRADE = ['Снова', 'Трудно', 'Хорошо', 'Легко']
const KIND = { new: 'Новое', learn: 'Изучаю', review: 'Повторение', mature: 'Выучено' }

// Все слова колоды: когда придут, состояние, вероятность вспомнить
const rows = computed(() => props.deck.cards.filter(c => !c.suspended).map(c => {
  const s = srsOf(props.userKey, c), k = kindOf(s)
  if (!s) return { c, k, s: null }
  return { c, k: k === 'review' && s.interval >= LEARNED_DAYS ? 'mature' : k, s, at: dueMs(s), r: recallNow(s, now.value), mem: memoryOf(s) }
}))
const started = computed(() => rows.value.filter(r => r.s))
const counts = computed(() => { const o = { new: 0, learn: 0, review: 0, mature: 0 }; for (const r of rows.value) o[r.k]++; return o })

// ── Масштаб ──
const SCALES = [
  { id: 'day', t: 'Сутки', n: 24 },        // сейчас + 23 часа по часу + «позже»
  { id: 'week', t: 'Неделя', n: 8 },       // сегодня + 7 дней + «позже»
  { id: 'month', t: 'Месяц', n: 31 },      // сегодня + 30 дней + «позже»
  { id: 'year', t: 'Год', n: 13 },         // этот месяц + 12 + «позже»
]
const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v) } catch { return null } }
const saved = store('tma.chartScale')
const scale = ref(SCALES.some(s => s.id === saved) ? saved : 'month')
const sc = computed(() => SCALES.find(s => s.id === scale.value))

const dayDiff = (ymd) => Math.round((new Date(ymd + 'T12:00') - new Date(today() + 'T12:00')) / DAY)
const monthDiff = (ymd) => { const a = today(); return (+ymd.slice(0, 4) - +a.slice(0, 4)) * 12 + (+ymd.slice(5, 7) - +a.slice(5, 7)) }
/** В какой столбик попадает слово при текущем масштабе (0 — «сейчас», n — «позже»). */
function binOf(r) {
  const n = sc.value.n
  if (scale.value === 'day') { const d = r.at - now.value; return d <= 0 ? 0 : Math.min(n, Math.floor(d / HOUR) + 1) }
  if (r.k === 'learn') return 0
  return Math.min(n, Math.max(0, scale.value === 'year' ? monthDiff(r.s.due) : dayDiff(r.s.due)))
}
const bins = computed(() => {
  const out = Array.from({ length: sc.value.n + 1 }, (_, i) => ({ i, items: [] }))
  for (const r of started.value) out[binOf(r)].items.push(r)
  for (const b of out) b.items.sort((a, z) => a.at - z.at)
  return out
})
const maxN = computed(() => Math.max(1, ...bins.value.map(b => b.items.length)))
const segs = (b) => ['learn', 'review', 'mature'].map(k => ({ k, n: b.items.filter(r => r.k === k).length })).filter(x => x.n)

// Подписи
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const dateAt = (i) => { const d = new Date(today() + 'T12:00'); d.setDate(d.getDate() + i); return d }
const monthAt = (i) => { const d = new Date(today() + 'T12:00'); d.setDate(1); d.setMonth(d.getMonth() + i); return d }
function axis(i) {                                          // подпись под столбиком (не под каждым)
  if (i === sc.value.n) return 'позже'
  if (i === 0) return 'сейчас'
  if (i === sc.value.n - 1 && scale.value !== 'week') return ''
  if (scale.value === 'day') return i % 6 === 0 ? `+${i} ч` : ''
  if (scale.value === 'week') return i === 1 ? 'завтра' : DOW[dateAt(i).getDay()]
  if (scale.value === 'month') return i % 7 === 0 ? `+${i / 7} нед` : ''
  return i % 3 === 0 ? MON[monthAt(i).getMonth()] : ''
}
function title(i) {                                         // заголовок открытого столбика
  const n = sc.value.n
  if (i === n) return scale.value === 'day' ? 'Позже, чем через сутки' : scale.value === 'year' ? 'Позже, чем через год' : `Позже, чем через ${n - 1} дн.`
  if (scale.value === 'day') return i === 0 ? 'Сейчас — пора повторять' : i === 1 ? 'В ближайший час' : `Через ${i - 1}–${i} ч`
  if (scale.value === 'year') { const d = monthAt(i); return i === 0 ? `Этот месяц (${MONN[d.getMonth()].toLowerCase()})` : `${MONN[d.getMonth()]} ${d.getFullYear()}` }
  if (i === 0) return 'Сегодня — и всё, что уже пора'
  const d = dateAt(i), dw = DOW[d.getDay()]
  return `${i === 1 ? 'Завтра' : dw[0].toUpperCase() + dw[1]}, ${d.getDate()} ${MONG[d.getMonth()]}`
}
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов')

// Открытый столбик: наведённый (на компьютере) или выбранный нажатием
const hover = ref(null), pinned = ref(0), open = ref(null)
watch(scale, (v) => { store('tma.chartScale', v); pinned.value = 0; hover.value = null })
const activeI = computed(() => hover.value ?? pinned.value)
const active = computed(() => bins.value[activeI.value] ?? bins.value[0])

// Когда вернётся слово: обратный отсчёт до часа, дальше — «завтра / 5 дн.»
function when(r) {
  const ms = r.at - now.value
  if (ms <= 0) return 'пора'
  if (ms < HOUR) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  if (r.k === 'learn') return `${Math.round(ms / HOUR)} ч`
  const d = dayDiff(r.s.due); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : fmtSpan(0, d)
}

// ── В реальном времени: слово только что «ушло» ──
const jump = ref(null); let jumpTimer = null
const lastKey = computed(() => { let m = null; for (const r of started.value) if (!m || (r.s.lastAt ?? 0) > (m.s.lastAt ?? 0)) m = r; return m ? `${m.c.id}:${m.s.lastAt}` : '' })
watch(lastKey, (v, was) => {
  if (!v || !was) return                                    // при открытии графика не всплываем
  const id = v.split(':')[0], r = started.value.find(x => x.c.id === id); if (!r) return
  const h = r.s.hist?.at(-1)
  jump.value = { id, word: r.c.front, q: h?.q ?? 2, to: h ? (h.i < 0 ? fmtSpan(-h.i, 0) : fmtSpan(0, h.i)) : '' }
  hover.value = null; pinned.value = binOf(r); open.value = null
  clearTimeout(jumpTimer); jumpTimer = setTimeout(() => { jump.value = null }, 4500)
})
onUnmounted(() => clearTimeout(jumpTimer))
const fresh = (r) => jump.value?.id === r.c.id

// История слова
const picked = computed(() => started.value.find(r => r.c.id === open.value) ?? null)
const histOf = (r) => (r.s?.hist ?? []).filter(h => !Array.isArray(h)).map(({ t: at, q, i: iv }) => ({ at, q, label: iv < 0 ? fmtSpan(-iv, 0) : fmtSpan(0, iv), days: iv < 0 ? -iv / 1440 : iv }))
const histMax = (r) => Math.max(1, ...histOf(r).map(h => h.days))
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}` }
</script>

<template>
  <div class="dc" :class="{ docked: dock }">
    <header v-if="!dock" class="bar">
      <button class="btn ghost sm" @click="emit('back')"><AppIcon name="back" :size="18" /> Колоды</button>
      <b class="dt">{{ deck.title }}</b>
    </header>

    <section class="card ch">
      <div class="top">
        <div class="ttl"><b>Где слова</b>
          <span class="cnt"><i class="new" />{{ counts.new }} новых <i class="learn" />{{ counts.learn }} изучаю <i class="review" />{{ counts.review }} повтор. <i class="mature" />{{ counts.mature }} выучено</span></div>
        <div class="seg scl" role="radiogroup" aria-label="Масштаб">
          <button v-for="s in SCALES" :key="s.id" role="radio" :aria-checked="scale === s.id" :class="{ on: scale === s.id }" @click="scale = s.id">{{ s.t }}</button>
        </div>
        <button v-if="dock" class="x" aria-label="Скрыть график" title="Скрыть" @click="emit('back')"><AppIcon name="x" :size="16" /></button>
      </div>


      <!-- Столбики -->
      <div class="plot" :style="{ '--n': bins.length }" @mouseleave="hover = null">
        <div class="grid"><i /><i /><i /></div>
        <!-- Всплывашка над столбиками: слово только что ушло -->
        <Transition name="jmp"><div v-if="jump" class="jump" :class="'jq' + jump.q"><b>{{ jump.word }}</b> · {{ GRADE[jump.q] }} → <b class="to">{{ jump.to }}</b></div></Transition>
        <button v-for="b in bins" :key="b.i" class="bc" :class="{ on: activeI === b.i, later: b.i === sc.n, hot: b.items.some(fresh) }"
          :aria-label="`${title(b.i)}: ${b.items.length} ${word(b.items.length)}`" @mouseenter="hover = b.i" @click="pinned = b.i; hover = null; open = null">
          <span v-if="b.items.length" class="bn">{{ b.items.length }}</span>
          <span class="stk" :style="{ height: (b.items.length ? 8 + b.items.length / maxN * (dock ? 74 : 100) : 3) + 'px' }"><i v-for="g in segs(b)" :key="g.k" :class="g.k" :style="{ flexGrow: g.n }" /></span>
        </button>
      </div>
      <div class="ax" :style="{ '--n': bins.length }"><span v-for="b in bins" :key="b.i" :class="{ now: b.i === 0 }">{{ axis(b.i) }}</span></div>

      <!-- Слова открытого столбика -->
      <div class="pop">
        <div class="ph"><b>{{ title(activeI) }}</b><span>{{ active.items.length ? `${active.items.length} ${word(active.items.length)}` : 'слов нет' }}</span></div>
        <TransitionGroup v-if="active.items.length" name="chip" tag="div" class="chips">
          <button v-for="r in active.items" :key="r.c.id" class="chip" :class="[r.k, { on: open === r.c.id, fresh: fresh(r) }]" @click="open = open === r.c.id ? null : r.c.id">
            <span class="cw"><b>{{ r.c.front }}</b><small>{{ r.c.back }}</small></span>
            <span class="cd">{{ when(r) }}</span>
          </button>
        </TransitionGroup>
        <p v-else class="hint none">{{ started.length ? 'Нажмите на другой столбик, чтобы увидеть его слова' : 'Слова ещё не начаты — ответьте на первую карточку' }}</p>

        <!-- История слова -->
        <div v-if="picked" class="hist">
          <div class="meta"><b>{{ picked.c.front }}</b><span>{{ KIND[picked.k] }}</span><span>вспомнит сейчас <b>{{ Math.round(picked.r * 100) }}%</b></span>
            <span>стабильность <b>{{ fmtSpan(0, Math.max(1, Math.round(picked.mem.stab))) }}</b></span><span>сложность <b>{{ picked.mem.diff.toFixed(1) }}</b></span><span>ошибок <b>{{ picked.s.lapses }}</b></span></div>
          <div v-if="histOf(picked).length" class="hb">
            <div v-for="(h, i) in histOf(picked)" :key="i" class="hc" :title="`${fmtDate(h.at)} · ${GRADE[h.q]} → ${h.label}`">
              <small class="hv">{{ h.label }}</small><i :class="'q' + h.q" :style="{ height: Math.max(4, Math.sqrt(h.days / histMax(picked)) * 56) + 'px' }" /><small class="hd">{{ fmtDate(h.at) }}</small>
            </div>
          </div>
          <div class="lg"><span><i class="q0" />Снова</span><span><i class="q1" />Трудно</span><span><i class="q2" />Хорошо</span><span><i class="q3" />Легко</span><span>— на сколько отбросило после ответа</span></div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dc { display: grid; gap: 12px }
.bar { display: flex; align-items: center; gap: 10px } .dt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; text-align: center; margin-right: 90px }
.ch { position: relative; display: grid; gap: 8px; padding: 12px 12px 10px; min-width: 0 }
.dc.docked .ch { animation: down .25s ease } @keyframes down { from { transform: translateY(-12px); opacity: 0 } }
.dc.docked .plot { height: 120px }
/* Шапка: заголовок, счётчики, масштаб */
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px }
.ttl { flex: 1; min-width: 180px; display: grid; gap: 2px } .ttl > b { font-size: 16px }
.cnt { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 5px; font-size: 11px; font-weight: 700; color: var(--hint) }
.cnt i { width: 8px; height: 8px; border-radius: 2px; margin-left: 6px } .cnt i:first-child { margin-left: 0 }
.cnt .new { background: var(--blue) } .cnt .learn { background: var(--red) } .cnt .review { background: var(--green) } .cnt .mature { background: var(--green-d) }
.scl { flex: none; padding: 2px } .scl button { padding: 4px 9px; font-size: 12px }
.x { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .x:hover { background: var(--surface) }
/* Всплывашка «слово ушло» */
.jump { position: absolute; top: 0; left: 50%; max-width: 92%; overflow: hidden; text-overflow: ellipsis; transform: translateX(-50%); z-index: 3; padding: 6px 14px; border-radius: 99px; background: #2f3a40; color: #fff; font-size: 13px; font-weight: 700; white-space: nowrap; box-shadow: 0 6px 16px rgba(0, 0, 0, .2) }
.jump.jq0 .to { color: #ff8a8a } .jump.jq1 .to { color: #ffc266 } .jump.jq2 .to { color: #a0f07a } .jump.jq3 .to { color: #8fdcff }
.jmp-enter-active, .jmp-leave-active { transition: all .3s ease } .jmp-enter-from, .jmp-leave-to { opacity: 0; transform: translate(-50%, -8px) }
/* Столбики */
.plot { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 3px; align-items: end; height: 150px; padding-top: 14px }
.grid { position: absolute; inset: 14px 0 0; display: grid; grid-template-rows: repeat(3, 1fr); pointer-events: none } .grid i { border-top: 1px dashed var(--border) }
.bc { position: relative; display: grid; justify-items: center; align-content: end; gap: 2px; height: 100%; padding: 0 0 1px; border: 0; border-radius: 8px 8px 0 0; background: none; cursor: pointer; min-width: 0; font: inherit; z-index: 1 }
.bc:hover, .bc.on { background: var(--blue-l) } .bc.later { border-left: 1px dashed var(--border); border-radius: 0 8px 0 0 }
.stk { display: flex; flex-direction: column-reverse; gap: 2px; width: 72%; max-width: 26px; border-radius: 5px 5px 2px 2px; overflow: hidden; background: var(--border); transition: height .5s cubic-bezier(.3, 1.4, .5, 1) }
.stk i { display: block; min-height: 3px } .stk .learn { background: var(--red) } .stk .review { background: var(--green) } .stk .mature { background: var(--green-d) }
.bc.hot .stk { animation: hot 1s ease 3; transform-origin: bottom } @keyframes hot { 50% { transform: scaleY(1.1); filter: brightness(1.15) } }
.bn { font-size: 11px; font-weight: 900; color: var(--text); line-height: 1 }
.ax { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 3px; height: 14px; border-top: 1px solid var(--border); padding-top: 3px }
.ax span { display: flex; justify-content: center; width: 0; justify-self: center; font-size: 10px; font-weight: 800; color: var(--hint-2); white-space: nowrap } .ax span.now { color: var(--blue) }
/* Слова столбика */
.pop { display: grid; gap: 8px; margin-top: 4px; padding: 10px; border-radius: 14px; background: var(--surface) }
.ph { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 14px } .ph span { flex: none; font-size: 13px; font-weight: 800; color: var(--hint) }
.chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; max-height: 196px; overflow-y: auto; padding: 2px }
.chip { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 7px 10px; border: 0; border-left: 4px solid var(--c); border-radius: 10px; background: var(--card); font: inherit; color: var(--text); text-align: left; cursor: pointer; box-shadow: 0 1px 0 var(--border); transition: transform .15s }
.chip:hover { transform: translateY(-1px) } .chip.on { box-shadow: 0 0 0 2px var(--blue) }
.chip.learn { --c: var(--red) } .chip.review { --c: var(--green) } .chip.mature { --c: var(--green-d) }
.chip.fresh { background: #fff6e0; box-shadow: 0 0 0 2px var(--orange) } html[data-theme='dark'] .chip.fresh { background: var(--card) }
.cw { flex: 1; display: grid; min-width: 0; line-height: 1.2 } .cw b, .cw small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .cw b { font-size: 14px } .cw small { font-size: 11px; color: var(--hint); font-weight: 600 }
.cd { flex: none; font-size: 12px; font-weight: 800; color: var(--hint); font-variant-numeric: tabular-nums } .chip.learn .cd { color: var(--red-d) }
.chip-enter-active { transition: all .35s ease } .chip-enter-from { opacity: 0; transform: scale(.8) } .chip-leave-active { display: none }
.none { margin: 0; text-align: center; font-size: 13px }
/* История слова */
.hist { display: grid; gap: 6px; padding: 10px; border-radius: 12px; background: var(--card) }
.meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; font-size: 12px; font-weight: 700; color: var(--hint) } .meta > b:first-child { font-size: 15px; color: var(--text) } .meta span b { color: var(--text) }
.hb { display: flex; align-items: flex-end; gap: 6px; overflow-x: auto; padding-bottom: 2px }
.hc { flex: none; width: 44px; display: grid; justify-items: center; align-content: end; gap: 2px }
.hc i { display: block; width: 24px; border-radius: 4px 4px 0 0 } .hv { font-size: 10px; font-weight: 800; white-space: nowrap } .hd { font-size: 9px; color: var(--hint-2); font-weight: 700 }
.q0 { background: var(--red) } .q1 { background: var(--orange) } .q2 { background: var(--green) } .q3 { background: var(--blue) }
.lg { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; font-weight: 700; color: var(--hint) } .lg span { display: inline-flex; align-items: center; gap: 4px } .lg i { width: 10px; height: 10px; border-radius: 3px; display: inline-block }
@media (max-width: 520px) { .dt { margin-right: 0 } .scl button { padding: 4px 7px } .chips { grid-template-columns: 1fr 1fr } .plot { height: 130px } }
</style>

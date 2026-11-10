<script setup>
// График Review: где сейчас каждое слово и фраза — когда их повторять (как график колоды, только для словаря уроков).
//  • Столбики — сколько слов придёт на повтор в каждый день («Неделя», «Месяц») или месяц («Год»); цвет — уровень
//    (слабое / среднее / сильное). Слова без ответов («новые») — отдельной плашкой, в столбики не попадают.
//  • Нажатие на столбик — список его слов: вероятность вспомнить сейчас и когда повтор; нажатие на слово — emit('pick', key)
//    (Review открывает это слово с кривой памяти; сверху урока — кривая открывается прямо под графиком).
//  • В реальном времени: слово получило ответ (свой урок или — у преподавателя — ответ ученика, который подтягивается с
//    сервера) → над графиком всплывает «go ahead · верно → повтор через 5 дн», его столбик подсвечивается и открывается.
//  • Фильтр: все / слова / фразы / один урок.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { stateOf } from '../utils/review'
import WordCurve from './WordCurve.vue'

const props = defineProps({
  items: { type: Object, required: true },             // словарь { ключ: RItem }
  cfg: { type: Object, required: true },               // { retention, maxDays }
  lesson: { type: String, default: '' },               // сразу показать только слова этого урока
  dock: Boolean,                                       // компактно — сверху урока
})
const emit = defineEmits(['pick'])
const DAY = 86_400_000
const now = ref(Date.now()); let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 30_000) }); onUnmounted(() => clearInterval(clock))

const SCALES = [{ id: 'week', t: 'Неделя', n: 8 }, { id: 'month', t: 'Месяц', n: 31 }, { id: 'year', t: 'Год', n: 13 }]
const scale = ref('week'), sc = computed(() => SCALES.find(s => s.id === scale.value))
const filter = ref(props.lesson ? 'lesson:' + props.lesson : 'all')
watch(() => props.lesson, (v) => { if (v) filter.value = 'lesson:' + v })
const lessons = computed(() => [...new Set(Object.values(props.items).map(x => x.lesson).filter(Boolean))].sort())
const pass = (x) => filter.value === 'all' || x.kind === filter.value || (filter.value.startsWith('lesson:') && (x.lesson === filter.value.slice(7) || x.hist.some(h => h.lesson === filter.value.slice(7))))

const rows = computed(() => Object.values(props.items).filter(pass).map(x => ({ x, st: stateOf(x, now.value, props.cfg) })))
const fresh = computed(() => rows.value.filter(r => r.st.isNew))
const startOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
function binOf(due) {
  const n = sc.value.n
  if (scale.value === 'year') { const a = new Date(now.value), b = new Date(due); return Math.min(n, Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth())) }
  return Math.min(n, Math.max(0, Math.round((startOf(due) - startOf(now.value)) / DAY)))
}
const bins = computed(() => {
  const out = Array.from({ length: sc.value.n + 1 }, (_, i) => ({ i, items: [] }))
  for (const r of rows.value) if (!r.st.isNew) out[binOf(r.st.due)].items.push(r)
  for (const b of out) b.items.sort((a, z) => a.st.due - z.st.due)
  return out
})
const maxN = computed(() => Math.max(1, ...bins.value.map(b => b.items.length)))
const segs = (b) => ['strong', 'medium', 'weak'].map(k => ({ k, n: b.items.filter(r => r.st.level === k).length })).filter(s => s.n)

const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const dateAt = (i) => { const d = new Date(now.value); d.setDate(d.getDate() + i); return d }
function axis(i) {
  const n = sc.value.n
  if (i === n) return 'позже'
  if (i === 0) return scale.value === 'year' ? MON[new Date(now.value).getMonth()] : 'сегодня'
  if (scale.value === 'week') return i === 1 ? 'завтра' : DOW[dateAt(i).getDay()]
  if (scale.value === 'month') return i % 7 === 0 && i < 28 ? `+${i / 7} нед` : ''
  const d = new Date(now.value); d.setDate(1); d.setMonth(d.getMonth() + i); return i % 3 === 0 ? MON[d.getMonth()] : ''
}
function title(i) {
  const n = sc.value.n
  if (i === n) return scale.value === 'year' ? 'Позже, чем через год' : `Позже, чем через ${n - 1} дн.`
  if (i === 0) return scale.value === 'year' ? 'Этот месяц' : 'Сегодня — и всё, что уже пора'
  if (scale.value === 'year') { const d = new Date(now.value); d.setDate(1); d.setMonth(d.getMonth() + i); return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) }
  const d = dateAt(i); return (i === 1 ? 'Завтра, ' : '') + d.toLocaleDateString('ru-RU', { weekday: i === 1 ? undefined : 'long', day: 'numeric', month: 'long' })
}
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов')
const rel = (t) => { const d = Math.round((startOf(t) - startOf(now.value)) / DAY); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн` }

const openI = ref(null), sel = ref(null)          // sel — слово, чья кривая открыта под списком (сверху урока)
const pickW = (k) => { emit('pick', k); if (props.dock) sel.value = sel.value === k ? null : k }
watch(scale, () => { openI.value = null })
const open = computed(() => openI.value == null ? null : bins.value[openI.value])
const LV = { weak: 'слабое', medium: 'среднее', strong: 'сильное' }

// ── в реальном времени: какие слова только что получили ответ ──
const flash = ref(null), hot = ref(new Set()); let flashT = null
const sig = () => Object.fromEntries(Object.values(props.items).map(x => [x.key, x.hist[0]?.t ?? 0]))
let seen = sig()
watch(() => props.items, () => {
  const cur = sig(), first = !Object.keys(seen).length, changed = Object.keys(cur).filter(k => cur[k] !== seen[k] && cur[k] > (seen[k] ?? 0)); seen = cur
  if (!changed.length || first) return                    // первая загрузка словаря — это не «ответ», не подсвечиваем
  const x = props.items[changed[0]], h = x.hist[0], st = stateOf(x, Date.now(), props.cfg)
  flash.value = { text: x.text, more: changed.length - 1, ok: h.ok, what: h.ok === null ? 'встретилось — новое' : `${h.ok ? 'верно' : 'ошибка'} → повтор ${rel(st.due)}`, lv: st.isNew ? '' : st.level }
  hot.value = new Set(changed)
  if (!st.isNew) { if (!pass(x)) filter.value = 'all'; openI.value = binOf(st.due) }
  clearTimeout(flashT); flashT = setTimeout(() => { flash.value = null; hot.value = new Set() }, 4000)
}, { deep: true })
onUnmounted(() => clearTimeout(flashT))
</script>

<template>
  <div class="rc" :class="{ dock }">
    <div class="hd">
      <b>Где сейчас слова</b>
      <select v-model="filter" aria-label="Какие слова"><option value="all">Все</option><option value="word">Слова</option><option value="phrase">Фразы</option><option v-for="l in lessons" :key="l" :value="'lesson:' + l">Урок: {{ l }}</option></select>
      <span class="sp" />
      <div class="seg" role="tablist" aria-label="Масштаб"><button v-for="s in SCALES" :key="s.id" role="tab" :aria-selected="scale === s.id" :class="{ on: scale === s.id }" @click="scale = s.id">{{ s.t }}</button></div>
    </div>
    <div class="fl" :class="{ on: flash }" aria-live="polite"><template v-if="flash"><i :class="flash.ok === true ? 'y' : flash.ok === false ? 'x' : 'n'" /><b>{{ flash.text }}</b> · {{ flash.what }}<span v-if="flash.more"> · и ещё {{ flash.more }}</span></template></div>
    <div class="plot" :style="{ '--n': bins.length }">
      <button v-for="b in bins" :key="b.i" class="bc" :class="{ on: openI === b.i, hot: b.items.some(r => hot.has(r.x.key)) }" :title="title(b.i) + ': ' + b.items.length" @click="openI = openI === b.i ? null : b.i">
        <span v-if="b.items.length" class="bn">{{ b.items.length }}</span>
        <span class="stk" :style="{ height: (b.items.length ? Math.max(6, b.items.length / maxN * 100) : 0) + '%' }"><i v-for="s in segs(b)" :key="s.k" :class="s.k" :style="{ flex: s.n }" /></span>
        <span class="ax"><span class="al">{{ axis(b.i) }}</span><span class="as">{{ { сегодня: 'сег.', завтра: 'зав.' }[axis(b.i)] ?? axis(b.i) }}</span></span>
      </button>
    </div>
    <div class="foot">
      <span class="lg"><i class="weak" />слабое <i class="medium" />среднее <i class="strong" />сильное</span>
      <span v-if="fresh.length" class="nw" :class="{ hot: fresh.some(r => hot.has(r.x.key)) }">новых без ответа: {{ fresh.length }}</span>
    </div>
    <div v-if="open" class="pop">
      <div class="ph"><b>{{ title(open.i) }}</b> · {{ open.items.length }} {{ word(open.items.length) }}<button class="cl" aria-label="Закрыть" @click="openI = null">✕</button></div>
      <p v-if="!open.items.length" class="em">Здесь пусто.</p>
      <button v-for="r in open.items" :key="r.x.key" class="wi" :class="{ hot: hot.has(r.x.key) }" @click="pickW(r.x.key)">
        <span class="wt"><b>{{ r.x.text }}</b><small>{{ r.x.tr }}<template v-if="r.x.lesson"> · {{ r.x.lesson }}</template></small></span>
        <span class="wr"><b :class="r.st.level">{{ r.st.recall }}%</b><small>{{ LV[r.st.level] }} · {{ rel(r.st.due) }}</small></span>
      </button>
    </div>
    <div v-if="dock && sel && items[sel]" class="cv"><WordCurve :item="items[sel]" :cfg="cfg" /></div>
  </div>
</template>

<style scoped>
.rc { display: grid; gap: 8px; min-width: 0; padding: 12px 14px; border-radius: 16px; background: #f6f8fa }
.hd { display: flex; flex-wrap: wrap; align-items: center; gap: 8px } .hd > b { font-size: 15px; font-weight: 900 }
.hd select { width: auto; max-width: 220px; font: inherit; font-size: 12.5px; font-weight: 700; padding: 4px 8px; border-radius: 9px; border: 1.5px solid #e3e6ea; background: #fff }
.sp { flex: 1 }
.seg { display: flex; gap: 3px; padding: 3px; border-radius: 11px; background: #e9ecef } .seg button { font: inherit; font-size: 12px; font-weight: 800; border: 0; border-radius: 8px; padding: 4px 10px; background: none; color: #5f6368; cursor: pointer } .seg button.on { background: #fff; color: #1278b0; box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.fl { min-height: 0; height: 0; overflow: hidden; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; border-radius: 10px; background: #fff; transition: height .2s, padding .2s; padding: 0 10px }
.fl.on { height: 30px; padding: 0 10px; box-shadow: 0 0 0 1.5px #1cb0f6 } .fl i { flex: none; width: 9px; height: 9px; border-radius: 50% } .fl .y { background: #58cc02 } .fl .x { background: #ff4b4b } .fl .n { background: #b5bac1 }
.plot { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 3px; align-items: end; height: 150px; padding-top: 16px }
.dock .plot { height: 96px }
.bc { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 0 0 16px; border: 0; border-radius: 8px 8px 0 0; background: none; cursor: pointer; font: inherit; min-width: 0 }
.bc:hover, .bc.on { background: #eaf2fb }
.stk { width: 70%; max-width: 30px; display: flex; flex-direction: column; border-radius: 5px 5px 2px 2px; overflow: hidden; transition: height .35s }
.stk i, .lg i { display: block } .weak { background: #ff4b4b } .medium { background: #ff9600 } .strong { background: #58cc02 }
.bn { font-size: 11px; font-weight: 900; color: #555; margin-bottom: 2px }
.ax { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); font-size: 10.5px; font-weight: 700; color: var(--hint); white-space: nowrap }
.as { display: none }
.bc.hot .stk { animation: pulse 1s ease-in-out 3; box-shadow: 0 0 0 3px #1cb0f6 }
@keyframes pulse { 50% { transform: scale(1.12) } }
.foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; font-size: 11.5px; font-weight: 700; color: var(--hint) }
.lg { display: inline-flex; align-items: center; gap: 5px } .lg i { width: 9px; height: 9px; border-radius: 3px; margin-left: 6px } .lg i:first-child { margin-left: 0 }
.nw.hot { color: #1278b0 }
.cv { padding: 10px; border-radius: 12px; background: #fff }
.pop { display: grid; gap: 2px; max-height: 260px; overflow: auto; padding: 8px; border-radius: 12px; background: #fff; box-shadow: 0 6px 22px rgba(0, 0, 0, .08) }
.ph { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; padding: 2px 4px 6px } .ph b::first-letter { text-transform: uppercase }
.cl { margin-left: auto; border: 0; background: none; font-size: 13px; color: var(--hint); cursor: pointer }
.em { margin: 0; padding: 4px; font-size: 13px; color: var(--hint) }
.wi { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 0; border-radius: 9px; background: none; font: inherit; text-align: left; cursor: pointer }
.wi:hover { background: #f3f8fd } .wi.hot { background: #e3f4ff }
.wt { display: grid; min-width: 0; flex: 1 } .wt b { font-size: 14px } .wt small, .wr small { font-size: 11.5px; font-weight: 600; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.wr { display: grid; justify-items: end } .wr b { font-size: 14px; font-weight: 900 } .wr b.weak { color: #e53935; background: none } .wr b.medium { color: #e08600; background: none } .wr b.strong { color: #46a302; background: none }
@media (max-width: 520px) { .plot { height: 120px } .al { display: none } .as { display: inline } .ax { font-size: 9.5px } .hd select { max-width: 150px } }
</style>

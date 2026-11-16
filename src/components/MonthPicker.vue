<script setup>
// Календарь, как в Telegram (16.11.2026): попап по центру экрана поверх затемнения, открывается нажатием на плашку недели.
// Колёсико мыши (и свайп по тачпаду) листает по одной неделе; название месяца и заработок сами переключаются на месяц, который сейчас в окне.
// ∧ ∨ — сразу на месяц. Нажатие на день или строку — перейти на эту неделю (вперёд — до 4 недель). Открытая неделя — голубая полоса.
// Дни с уроками: голубой кружок — есть запланированные, зелёный — все уроки дня проведены; сегодня — синий.
// Наверху — деньги месяца, как в плашке: заработано (проведённые) из прогноза, отмены и их доля от суммы (как в «Информации»).
// Уроки: свежие — из стора, остальные — GET /lessons/range по месяцам (кэш).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useScheduleStore } from '../stores/schedule'
import { useStudentsStore } from '../stores/students'
import { sumMoney, fmtMoney } from '../utils/price'
import { apiRequest, isDemo } from '../firebase'

const props = defineProps({
  selected: { type: String, required: true },    // понедельник открытой недели
  thisWeek: { type: String, required: true },    // понедельник этой недели
  maxMonday: { type: String, required: true },   // дальше этой недели не листаем (планируем на 4 недели)
  today: { type: String, required: true },
})
const emit = defineEmits(['pick', 'close'])
const scheduleStore = useScheduleStore(), studentStore = useStudentsStore()

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const iso = (d) => d.toISOString().slice(0, 10)
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const monday = (s) => { const d = new Date(s + 'T12:00:00Z'); return add(s, -((d.getUTCDay() + 6) % 7)) }
const firstOf = (ym, n = 0) => { const [y, m] = ym.split('-').map(Number); return iso(new Date(Date.UTC(y, m - 1 + n, 1))) }

// Окно — 6 недель с понедельника start. Месяц окна — по четвергу третьей строки (как в календарях: «чей» месяц в середине)
const startMonth = (props.selected === props.thisWeek ? props.today : add(props.selected, 3)).slice(0, 7)
const start = ref(monday(firstOf(startMonth)))
const weeks = computed(() => Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => add(start.value, w * 7 + d))))
const ym = computed(() => add(start.value, 17).slice(0, 7))
const title = computed(() => `${MONTHS[+ym.value.slice(5) - 1]} ${ym.value.slice(0, 4)}`)
const lastStart = computed(() => add(props.maxMonday, -14))      // дальше не листаем: внизу окна — последние доступные недели
const canNext = computed(() => start.value < lastStart.value)
function setStart(s) { start.value = s > lastStart.value ? lastStart.value : s }
const jump = (n) => setStart(monday(firstOf(ym.value, n)))      // ∧ ∨ — на месяц

// Колёсико: одна неделя за «щелчок»; у тачпада много мелких событий — копим до порога
let acc = 0, lastT = 0
function onWheel(e) {
  const t = performance.now(); if (t - lastT > 300) acc = 0; lastT = t
  acc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY
  while (Math.abs(acc) >= 100) {      // щелчок колёсика мыши ≈ 100 — ровно одна неделя
    const dir = Math.sign(acc); acc -= dir * 100
    if (dir > 0 && !canNext.value) { acc = 0; break }
    setStart(add(start.value, 7 * dir))
  }
}

// Уроки: месяцы, которые попали в окно, грузим целиком (и для денег месяца), кэш по месяцам
const cache = new Map(), got = ref(0)
async function fetchMonth(m) {
  if (isDemo || cache.has(m)) return
  cache.set(m, [])
  const a = firstOf(m), b = add(firstOf(m, 1), -1)
  try { const r = await apiRequest(`/lessons/range?from=${a}&to=${b}`); if (r.ok) { cache.set(m, await r.json()); got.value++ } else cache.delete(m) } catch { cache.delete(m) }
}
let ft = 0
watch(start, () => { clearTimeout(ft); ft = setTimeout(() => { for (const m of new Set([weeks.value[0][0], ym.value + '-01', weeks.value[5][6]].map(d => d.slice(0, 7)))) fetchMonth(m) }, 150) }, { immediate: true })
const lessonsIn = (a, b) => {
  got.value
  const m = new Map()
  for (const [k, ls] of cache) if (k >= a.slice(0, 7) && k <= b.slice(0, 7)) for (const l of ls) if (l.date >= a && l.date <= b) m.set(l.id, l)
  for (const l of scheduleStore.lessons) if (l.date >= a && l.date <= b) m.set(l.id, l)
  return [...m.values()].filter(l => !l.trial && l.studentIds?.length)
}
const lessons = computed(() => lessonsIn(weeks.value[0][0], weeks.value[5][6]))
const byDay = computed(() => { const m = new Map(); for (const l of lessons.value) m.set(l.date, [...(m.get(l.date) ?? []), l]); return m })
const off = (l) => l.studentIds.every(id => l.canceled?.[id])
function dayKind(d) {
  const ls = (byDay.value.get(d) ?? []).filter(l => !off(l)); if (!ls.length) return ''
  return ls.every(l => l.done) ? 'done' : 'plan'
}
const dayTitle = (d) => { const ls = byDay.value.get(d) ?? []; if (!ls.length) return ''; const n = ls.filter(l => l.done).length; return `Уроков: ${ls.length}${n ? `, проведено: ${n}` : ''}` }

// Деньги месяца окна — только его дни
const money = computed(() => {
  const m = sumMoney(lessonsIn(firstOf(ym.value), add(firstOf(ym.value, 1), -1)), studentStore.byId), sum = m.plan + m.lost
  return { ...m, pct: sum ? Math.round(m.lost / sum * 100) : 0, bar: m.plan ? Math.min(100, Math.round(m.real / m.plan * 100)) : 0 }
})

const allowed = (mon) => mon <= props.maxMonday
function pick(mon) { if (allowed(mon)) emit('pick', mon) }
const onKey = (e) => { if (e.key === 'Escape') emit('close') }
onMounted(() => addEventListener('keydown', onKey))
onUnmounted(() => { removeEventListener('keydown', onKey); clearTimeout(ft) })
</script>

<template>
  <Teleport to="body">
    <div class="mp-bg" @click.self="emit('close')" @wheel.self.prevent>
      <div class="mp" role="dialog" aria-modal="true" aria-label="Календарь: выбрать неделю" @wheel.prevent="onWheel">
        <div class="mh">
          <b>{{ title }}</b>
          <button class="ar" aria-label="Предыдущий месяц" @click="jump(-1)"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg></button>
          <button class="ar" :disabled="!canNext" aria-label="Следующий месяц" @click="jump(1)"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></button>
        </div>
        <div class="mm" :title="`${title}: заработано ${fmtMoney(money.real)} из ${fmtMoney(money.plan)}${money.lost ? `, потеряно из-за отмен ${fmtMoney(money.lost)} — ${money.pct}% от суммы` : ''}`">
          <span class="top"><b>{{ fmtMoney(money.real) }}</b><small>из {{ fmtMoney(money.plan) }}</small><em v-if="money.lost" class="lost">−{{ fmtMoney(money.lost) }} · {{ money.pct }}%</em></span>
          <span class="bar" aria-hidden="true"><i :style="{ width: money.bar + '%' }" /></span>
        </div>
        <div class="dn"><span v-for="d in DAYS" :key="d">{{ d }}</span></div>
        <div v-for="w in weeks" :key="w[0]" class="wr" :class="{ sel: w[0] === selected, no: !allowed(w[0]) }" role="button" :tabindex="allowed(w[0]) ? 0 : -1"
          :aria-label="`Неделя с ${+w[0].slice(8)} ${MON_GEN[+w[0].slice(5, 7) - 1]}`" @click="pick(w[0])" @keydown.enter="pick(w[0])">
          <span v-for="d in w" :key="d" class="d" :class="[dayKind(d), { out: !d.startsWith(ym), today: d === today }]" :title="dayTitle(d)">{{ +d.slice(8) }}<small v-if="+d.slice(8) === 1" class="m1">{{ MON_GEN[+d.slice(5, 7) - 1].slice(0, 3) }}</small></span>
        </div>
        <div class="mf">
          <button class="lk" @click="emit('pick', thisWeek)">Эта неделя</button>
          <button class="lk" @click="emit('close')">Закрыть</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mp-bg { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .4); animation: bgIn .15s ease-out }
@keyframes bgIn { from { background: rgba(0, 0, 0, 0) } }
.mp { width: 320px; max-width: 100%; box-sizing: border-box; padding: 16px 12px 8px; border-radius: 18px; background: var(--card); box-shadow: 0 16px 50px rgba(0, 0, 0, .3); animation: mpIn .16s ease-out; font-variant-numeric: tabular-nums; overscroll-behavior: contain }
@keyframes mpIn { from { opacity: 0; transform: scale(.94) } }
.mh { display: flex; align-items: center; gap: 4px; padding: 0 4px 8px }
.mh b { flex: 1; font-size: 18px; font-weight: 900; color: var(--text) }
.ar { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--text); cursor: pointer }
.ar:hover:not(:disabled) { background: var(--surface) } .ar:disabled { opacity: .3; cursor: default }
.ar svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
/* Деньги месяца — как плашка «ноябрь» в шапке */
.mm { display: grid; gap: 4px; margin: 0 4px 10px; padding: 8px 10px; border-radius: 12px; background: var(--surface) }
.mm .top { display: flex; align-items: baseline; gap: 5px; white-space: nowrap }
.mm b { font-size: 17px; font-weight: 900; color: #009300 } .mm small { font-size: 12px; font-weight: 800; color: var(--hint) }
.mm .lost { margin-left: auto; font-style: normal; font-size: 12px; font-weight: 800; color: var(--red-d) }
.mm .bar { height: 4px; border-radius: 2px; background: var(--border); overflow: hidden } .mm .bar i { display: block; height: 100%; border-radius: 2px; background: #009300; transition: width .3s }
html[data-theme='dark'] .mm b { color: #3fb950 } html[data-theme='dark'] .mm .bar i { background: #3fb950 } html[data-theme='dark'] .mm .lost { color: var(--red) }
.dn, .wr { display: grid; grid-template-columns: repeat(7, 1fr) }
.dn span { padding: 2px 0 6px; text-align: center; font-size: 12px; font-weight: 800; color: var(--hint) }
/* Строка — неделя: наведение подсвечивает всю неделю, открытая — голубая полоса */
.wr { border-radius: 12px; cursor: pointer } .wr:hover { background: var(--surface) } .wr.sel { background: var(--blue-l) }
.wr.no { cursor: default; opacity: .35 } .wr.no:hover { background: none }
.d { position: relative; display: grid; place-items: center; width: 36px; height: 36px; margin: 2px auto; border-radius: 50%; font-size: 14px; font-weight: 700; color: var(--text); transition: color .15s }
.d.out { color: var(--hint-2) }
.m1 { position: absolute; bottom: -1px; font-size: 8px; font-weight: 800; line-height: 1; color: var(--hint) }      /* «1 дек» — видно, где начался месяц */
.d.plan { background: rgba(28, 176, 246, .16); color: var(--blue) }      /* есть запланированные уроки */
.d.done { background: rgba(0, 147, 0, .14); color: #007a00 }            /* все уроки дня проведены */
.d.out.plan, .d.out.done { opacity: .55 }
.d.today { background: var(--blue); color: #fff; font-weight: 900 } .d.today .m1 { color: #fff }
html[data-theme='dark'] .d.done { color: #3fb950 }
.mf { display: flex; justify-content: space-between; padding: 8px 4px 2px }
.lk { border: 0; background: none; padding: 6px 4px; color: var(--blue); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer } .lk:hover { text-decoration: underline }
</style>

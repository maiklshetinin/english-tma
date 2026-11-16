<script setup>
// Календарь месяца, как в Telegram (16.11.2026): открывается нажатием на плашку недели в шапке расписания.
// ∧ ∨ — листать месяцы; нажатие на день (или на любую клетку строки) — перейти на эту неделю. Строка выбранной недели подсвечена.
// Дни с уроками: голубой кружок — есть запланированные, зелёный — все уроки дня проведены; сегодня — синий.
// Наверху — деньги месяца, как в плашке: заработано (проведённые) из прогноза, отмены и их доля от суммы (как в «Информации»).
// Уроки месяца: свежие — из стора (две недели и пролистанные), остальные — GET /lessons/range (кэш по месяцам).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useScheduleStore } from '../stores/schedule'
import { useStudentsStore } from '../stores/students'
import { sumMoney, fmtMoney } from '../utils/price'
import { apiRequest, isDemo } from '../firebase'

const props = defineProps({
  at: { type: Object, required: true },          // { left, top } — где открыть (под плашкой недели)
  selected: { type: String, required: true },    // понедельник открытой недели
  thisWeek: { type: String, required: true },    // понедельник этой недели
  maxMonday: { type: String, required: true },   // дальше этой недели не листаем (планируем на 4 недели)
  today: { type: String, required: true },
})
const emit = defineEmits(['pick', 'close'])
const scheduleStore = useScheduleStore(), studentStore = useStudentsStore()

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const iso = (d) => d.toISOString().slice(0, 10)
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const monday = (s) => { const d = new Date(s + 'T12:00:00Z'); return add(s, -((d.getUTCDay() + 6) % 7)) }

// Какой месяц показать сначала: месяц сегодняшнего дня, если открыта эта неделя; иначе — месяц четверга открытой недели
const ym = ref((props.selected === props.thisWeek ? props.today : add(props.selected, 3)).slice(0, 7))
const step = (n) => { const [y, m] = ym.value.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + n, 1)); ym.value = iso(d).slice(0, 7) }
const nextFirst = computed(() => { const [y, m] = ym.value.split('-').map(Number); return iso(new Date(Date.UTC(y, m, 1))) })
const canNext = computed(() => monday(nextFirst.value) <= props.maxMonday)      // в следующем месяце есть неделя, куда можно перейти
const title = computed(() => `${MONTHS[+ym.value.slice(5) - 1]} ${ym.value.slice(0, 4)}`)

// Сетка: 6 недель с понедельника, на который приходится 1-е число
const first = computed(() => monday(`${ym.value}-01`))
const weeks = computed(() => Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => add(first.value, w * 7 + d))))
const last = computed(() => weeks.value[5][6])

// Уроки месяца: с сервера (по месяцам, кэш) + стор поверх (там свежие правки)
const cache = new Map(), got = ref(0)
async function fetchMonth(from, to) {
  const k = from + to; if (isDemo || cache.has(k)) return
  cache.set(k, [])
  try { const r = await apiRequest(`/lessons/range?from=${from}&to=${to}`); if (r.ok) { cache.set(k, await r.json()); got.value++ } } catch { cache.delete(k) }
}
watch([first, last], ([a, b]) => fetchMonth(a, b), { immediate: true })
const lessons = computed(() => {
  got.value
  const a = first.value, b = last.value, m = new Map()
  for (const l of cache.get(a + b) ?? []) m.set(l.id, l)
  for (const l of scheduleStore.lessons) if (l.date >= a && l.date <= b) m.set(l.id, l)
  return [...m.values()].filter(l => !l.trial && l.studentIds?.length)
})
const byDay = computed(() => { const m = new Map(); for (const l of lessons.value) m.set(l.date, [...(m.get(l.date) ?? []), l]); return m })
const off = (l) => l.studentIds.every(id => l.canceled?.[id])
function dayKind(d) {
  const ls = (byDay.value.get(d) ?? []).filter(l => !off(l)); if (!ls.length) return ''
  return ls.every(l => l.done) ? 'done' : 'plan'
}
const dayTitle = (d) => { const ls = byDay.value.get(d) ?? []; if (!ls.length) return ''; const n = ls.filter(l => l.done).length; return `Уроков: ${ls.length}${n ? `, проведено: ${n}` : ''}` }

// Деньги месяца — только дни этого месяца (уроки соседних месяцев в сетке не считаем)
const money = computed(() => {
  const m = sumMoney(lessons.value.filter(l => l.date.startsWith(ym.value)), studentStore.byId), sum = m.plan + m.lost
  return { ...m, pct: sum ? Math.round(m.lost / sum * 100) : 0, bar: m.plan ? Math.min(100, Math.round(m.real / m.plan * 100)) : 0 }
})

const allowed = (mon) => mon <= props.maxMonday
function pick(mon) { if (allowed(mon)) emit('pick', mon) }

const box = ref(null)
const onDown = (e) => { if (box.value && !box.value.contains(e.target) && !e.target.closest?.('.wk-now')) emit('close') }
const onKey = (e) => { if (e.key === 'Escape') emit('close') }
onMounted(() => { addEventListener('pointerdown', onDown, true); addEventListener('keydown', onKey) })
onUnmounted(() => { removeEventListener('pointerdown', onDown, true); removeEventListener('keydown', onKey) })
</script>

<template>
  <Teleport to="body">
    <div ref="box" class="mp" role="dialog" aria-label="Календарь: выбрать неделю" :style="{ left: at.left + 'px', top: at.top + 'px' }">
      <div class="mh">
        <b>{{ title }}</b>
        <button class="ar" aria-label="Предыдущий месяц" @click="step(-1)"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg></button>
        <button class="ar" :disabled="!canNext" aria-label="Следующий месяц" @click="step(1)"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></button>
      </div>
      <div class="mm" :title="`${title}: заработано ${fmtMoney(money.real)} из ${fmtMoney(money.plan)}${money.lost ? `, потеряно из-за отмен ${fmtMoney(money.lost)} — ${money.pct}% от суммы` : ''}`">
        <span class="top"><b>{{ fmtMoney(money.real) }}</b><small>из {{ fmtMoney(money.plan) }}</small><em v-if="money.lost" class="lost">−{{ fmtMoney(money.lost) }} · {{ money.pct }}%</em></span>
        <span class="bar" aria-hidden="true"><i :style="{ width: money.bar + '%' }" /></span>
      </div>
      <div class="dn"><span v-for="d in DAYS" :key="d">{{ d }}</span></div>
      <div v-for="w in weeks" :key="w[0]" class="wr" :class="{ sel: w[0] === selected, no: !allowed(w[0]) }" role="button" :tabindex="allowed(w[0]) ? 0 : -1"
        :aria-label="`Неделя с ${+w[0].slice(8)} ${MONTHS[+w[0].slice(5, 7) - 1].toLowerCase()}`" @click="pick(w[0])" @keydown.enter="pick(w[0])">
        <span v-for="d in w" :key="d" class="d" :class="[dayKind(d), { out: !d.startsWith(ym), today: d === today, past: d < today }]" :title="dayTitle(d)">{{ +d.slice(8) }}</span>
      </div>
      <div class="mf">
        <button class="lk" @click="emit('pick', thisWeek)">Эта неделя</button>
        <button class="lk" @click="emit('close')">Закрыть</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mp { position: fixed; z-index: 60; width: 300px; box-sizing: border-box; padding: 14px 12px 8px; border-radius: 16px; background: var(--card); box-shadow: 0 12px 40px rgba(0, 0, 0, .22), 0 0 0 1px rgba(0, 0, 0, .04); animation: mpIn .14s ease-out; transform-origin: top left; font-variant-numeric: tabular-nums }
@keyframes mpIn { from { opacity: 0; transform: scale(.96) } }
.mh { display: flex; align-items: center; gap: 4px; padding: 0 4px 8px }
.mh b { flex: 1; font-size: 17px; font-weight: 900; color: var(--text) }
.ar { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: none; color: var(--text); cursor: pointer }
.ar:hover:not(:disabled) { background: var(--surface) } .ar:disabled { opacity: .3; cursor: default }
.ar svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
/* Деньги месяца — как плашка «ноябрь» в шапке */
.mm { display: grid; gap: 4px; margin: 0 4px 10px; padding: 8px 10px; border-radius: 12px; background: var(--surface) }
.mm .top { display: flex; align-items: baseline; gap: 5px; white-space: nowrap }
.mm b { font-size: 17px; font-weight: 900; color: #009300 } .mm small { font-size: 12px; font-weight: 800; color: var(--hint) }
.mm .lost { margin-left: auto; font-style: normal; font-size: 12px; font-weight: 800; color: var(--red-d) }
.mm .bar { height: 4px; border-radius: 2px; background: var(--border); overflow: hidden } .mm .bar i { display: block; height: 100%; border-radius: 2px; background: #009300; transition: width .4s }
html[data-theme='dark'] .mm b { color: #3fb950 } html[data-theme='dark'] .mm .bar i { background: #3fb950 } html[data-theme='dark'] .mm .lost { color: var(--red) }
.dn, .wr { display: grid; grid-template-columns: repeat(7, 1fr) }
.dn span { padding: 2px 0 6px; text-align: center; font-size: 12px; font-weight: 800; color: var(--hint) }
/* Строка — неделя: наведение подсвечивает всю неделю, выбранная — голубая полоса */
.wr { border-radius: 12px; cursor: pointer } .wr:hover { background: var(--surface) } .wr.sel { background: var(--blue-l) }
.wr.no { cursor: default; opacity: .35 } .wr.no:hover { background: none }
.d { display: grid; place-items: center; width: 34px; height: 34px; margin: 2px auto; border-radius: 50%; font-size: 14px; font-weight: 700; color: var(--text) }
.d.out { color: var(--hint-2) }
.d.plan { background: rgba(28, 176, 246, .16); color: var(--blue) }      /* есть запланированные уроки */
.d.done { background: rgba(0, 147, 0, .14); color: #007a00 }            /* все уроки дня проведены */
.d.out.plan, .d.out.done { opacity: .55 }
.d.today { background: var(--blue); color: #fff; font-weight: 900 }
html[data-theme='dark'] .d.done { color: #3fb950 }
.mf { display: flex; justify-content: space-between; padding: 8px 4px 2px }
.lk { border: 0; background: none; padding: 6px 4px; color: var(--blue); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer } .lk:hover { text-decoration: underline }
</style>

<script setup>
// «Информация» → «Доходы»: сколько заработано по месяцам (или неделям) — график и таблица, выгрузка в CSV (открывается в Excel).
// Считаем так же, как в расписании (utils/price.ts): заработано — проведённые уроки по зафиксированной цене; запланировано —
// ещё не отмеченные уроки периода; отмены — ученики, отменившие урок (по их цене). Групповой урок — где больше одного ученика.
// Данные — GET /lessons/range (все уроки за период). В демо — придуманная история.
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { apiRequest, isDemo } from '../../firebase'
import { useStudentsStore } from '../../stores/students'
import { lessonMoney, priceAt, fmtMoney, fmtMoneyK } from '../../utils/price'
import AppIcon from '../../components/AppIcon.vue'

const students = useStudentsStore()
// В демо у учеников нет цен — подставляем придуманные, чтобы были видны и отмены, и запланированное
const DEMO_PRICE = [1500, 1800, 2000, 1200, 1700, 1500, 2200]
const find = isDemo ? (id) => { const s = students.findAny(id); return s && { ...s, price: DEMO_PRICE[Number(id) % 7], priceHistory: [] } } : (id) => students.findAny(id)
const months = ref(6), by = ref('month')            // период и шаг графика
const lessons = ref(null), err = ref('')

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = ymd(new Date())
const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTH = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const range = computed(() => {
  const n = new Date(), a = new Date(n.getFullYear(), n.getMonth() - months.value + 1, 1), b = new Date(n.getFullYear(), n.getMonth() + 1, 0)
  return { from: ymd(a), to: ymd(b) }
})

async function load() {
  lessons.value = null; err.value = ''
  if (isDemo) { lessons.value = demoLessons(range.value.from, range.value.to); return }
  students.loadArchived().catch(() => {})                      // имена учеников из архива — для выгрузки
  try {
    const r = await apiRequest(`/lessons/range?from=${range.value.from}&to=${range.value.to}`)
    if (!r.ok) throw new Error(`Не удалось загрузить уроки (${r.status})`)
    lessons.value = await r.json()
  } catch (e) { err.value = e.message; lessons.value = [] }
}
onMounted(load); watch(months, load)

// ---------- Считаем по месяцам / неделям ----------
const monday = (date) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d) }
function bucketsOf(step) {
  const out = new Map()
  if (step === 'month') {
    const n = new Date()
    for (let i = months.value - 1; i >= 0; i--) { const d = new Date(n.getFullYear(), n.getMonth() - i, 1); out.set(ymd(d).slice(0, 7), { key: ymd(d).slice(0, 7), d }) }
  } else {
    let m = monday(today)
    for (let i = 0; i < 12; i++) { out.set(m, { key: m, d: new Date(m + 'T12:00:00') }); const d = new Date(m + 'T12:00:00'); d.setDate(d.getDate() - 7); m = ymd(d) }
    return new Map([...out].reverse())
  }
  return out
}
function calc(step) {
  const B = bucketsOf(step)
  for (const b of B.values()) Object.assign(b, { ind: 0, grp: 0, plan: 0, lost: 0, cancels: 0, done: 0, people: new Set() })
  for (const l of lessons.value ?? []) {
    const b = B.get(step === 'month' ? l.date.slice(0, 7) : monday(l.date)); if (!b) continue
    const m = lessonMoney(l, find), group = l.studentIds.length > 1
    if (l.done) { b[group ? 'grp' : 'ind'] += m.real; b.done++; l.studentIds.forEach(id => !l.canceled?.[id] && b.people.add(id)) }
    else b.plan += m.plan
    b.lost += m.lost; b.cancels += Object.keys(l.canceled ?? {}).length
  }
  return [...B.values()].map(b => ({ ...b, real: b.ind + b.grp, people: b.people.size, now: step === 'month' ? b.key === today.slice(0, 7) : b.key === monday(today) }))
}
const rows = computed(() => calc(by.value))                     // столбики графика
const byMonth = computed(() => (by.value === 'month' ? rows.value : calc('month')))
const table = computed(() => [...byMonth.value].reverse())       // таблица — всегда по месяцам, новые сверху
const total = computed(() => byMonth.value.reduce((a, r) => ({ real: a.real + r.real, ind: a.ind + r.ind, grp: a.grp + r.grp, lost: a.lost + r.lost, cancels: a.cancels + r.cancels, done: a.done + r.done }), { real: 0, ind: 0, grp: 0, lost: 0, cancels: 0, done: 0 }))
const label = (r, step = by.value) => (step === 'month' ? MON[r.d.getMonth()] + (r.d.getMonth() === 0 || r === rows.value[0] ? ` ${String(r.d.getFullYear()).slice(2)}` : '') : `${r.d.getDate()} ${MON[r.d.getMonth()]}`)
const monthName = (r) => `${MONTH[r.d.getMonth()]} ${r.d.getFullYear()}`

// ---------- График ----------
// Ширина графика = ширина блока в пикселях (а не растянутая картинка): на телефоне подписи остаются обычного размера
const plot = ref(null), W = ref(640)
let ro = null
onMounted(() => { if (typeof ResizeObserver === 'undefined') return; ro = new ResizeObserver(([e]) => { W.value = Math.max(280, Math.round(e.contentRect.width)) }); if (plot.value) ro.observe(plot.value) })
onUnmounted(() => ro?.disconnect())
const H = 220, PADL = 4, PADR = 46, TOP = 14, BOT = 26
const scale = computed(() => {
  const max = Math.max(1, ...rows.value.map(r => r.real + (r.now ? r.plan : 0)))
  const raw = max / 3, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw)
  return { top: step * 3, ticks: [0, step, step * 2, step * 3] }
})
const y = (v) => TOP + (H - TOP - BOT) * (1 - v / scale.value.top)
const bars = computed(() => {
  const n = rows.value.length, slot = (W.value - PADL - PADR) / n, bw = Math.min(46, slot * 0.56)
  return rows.value.map((r, i) => {
    const x = PADL + slot * i + (slot - bw) / 2
    const top = r.grp > 0 ? 'grp' : 'ind'
    return { r, x, w: bw, cx: x + bw / 2,
      ind: r.ind > 0 ? seg(x, y(r.ind), bw, y(0) - y(r.ind), top === 'ind') : '', grp: r.grp > 0 ? seg(x, y(r.ind + r.grp), bw, y(r.ind) - y(r.ind + r.grp), true) : '',
      plan: r.now && r.plan ? { y: y(r.real + r.plan), h: y(r.real) - y(r.real + r.plan) } : null }
  })
})
// Столбик: скругляем только верх верхнего куска (как в обычных графиках доходов)
function seg(x, yy, w, h, round) {
  const r = round ? Math.min(5, h, w / 2) : 0
  return `M${x},${yy + h}V${yy + r}${r ? `Q${x},${yy} ${x + r},${yy}` : ''}H${x + w - r}${r ? `Q${x + w},${yy} ${x + w},${yy + r}` : ''}V${yy + h}Z`
}
const hover = ref(null)

// ---------- Выгрузка (CSV для Excel: «;» и BOM, чтобы русские буквы открылись) ----------
function download(name, lines) {
  const csv = '﻿' + lines.map(l => l.map(v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(';')).join('\r\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
const num = (n) => String(Math.round(n * 100) / 100).replace('.', ',')
function exportMonths() {
  download(`доходы по месяцам ${range.value.from} — ${range.value.to}.csv`, [['Месяц', 'Проведено уроков', 'Учеников', 'Индивидуальные', 'Групповые', 'Заработано', 'Запланировано', 'Отмен', 'Потеряно на отменах'],
    ...table.value.map(r => [monthName(r), r.done, r.people, num(r.ind), num(r.grp), num(r.real), num(r.plan), r.cancels, num(r.lost)])])
}
const nameOf = (l, id) => find(id)?.name ?? l.names?.[id] ?? 'ученик удалён'
function exportLessons() {
  const out = [['Дата', 'Время', 'Ученики', 'Тип', 'Статус', 'Сумма', 'Отменили']]
  for (const l of lessons.value ?? []) {
    const m = lessonMoney(l, find), off = Object.keys(l.canceled ?? {})
    out.push([l.date.split('-').reverse().join('.'), `${pad(l.hour)}:${pad(l.minute ?? 0)}`, l.studentIds.map(id => nameOf(l, id)).join(', '), l.studentIds.length > 1 ? 'группа' : 'индивидуальный',
      l.done ? 'проведён' : off.length === l.studentIds.length ? 'отменён' : l.date < today ? 'не отмечен' : 'запланирован', num(l.done ? m.real : m.plan), off.map(id => nameOf(l, id)).join(', ')])
  }
  download(`уроки ${range.value.from} — ${range.value.to}.csv`, out)
}

// ---------- Демо: придуманные уроки за период ----------
function demoLessons(from, to) {
  const out = [], list = students.list, rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647 })()
  const price = (st) => priceAt(st, from, 10)
  for (let d = new Date(from + 'T12:00:00'); ymd(d) <= to; d.setDate(d.getDate() + 1)) {
    const date = ymd(d), wd = d.getDay(); if (wd === 0) continue
    const k = (d.getMonth() + 12 - new Date().getMonth()) % 12, busy = 0.35 + (k % 3) * 0.12
    for (const hour of [10, 13, 16, 18]) {
      if (rnd() > busy) continue
      const group = rnd() < 0.18, ids = group ? [list[(hour + wd) % list.length].id, list[(hour + wd + 2) % list.length].id] : [list[Math.floor(rnd() * list.length)].id]
      const l = { id: `dl-${date}-${hour}`, date, hour, studentIds: [...new Set(ids)] }
      if (rnd() < 0.07) l.canceled = { [l.studentIds[0]]: date }
      if (date < today) { l.done = true; l.prices = Object.fromEntries(l.studentIds.filter(id => !l.canceled?.[id]).map(id => [id, group ? Math.round(price(find(id)) * 0.6) : price(find(id))])) }
      out.push(l)
    }
  }
  return out
}
</script>

<template>
  <div class="page wide info">
    <h1>Информация</h1>
    <nav class="tabs"><button class="on">Доходы</button></nav>

    <div class="top">
      <div class="seg"><button :class="{ on: months === 6 }" @click="months = 6">6 месяцев</button><button :class="{ on: months === 12 }" @click="months = 12">12 месяцев</button></div>
    </div>
    <p v-if="err" class="hint bad">{{ err }}</p>

    <div class="sum">
      <span class="cap">Заработано за {{ months }} месяцев</span>
      <b class="big">{{ lessons ? fmtMoney(total.real) : '…' }}</b>
      <span v-if="lessons" class="hint">{{ total.done }} уроков проведено<template v-if="total.lost"> · −{{ fmtMoney(total.lost) }} на отменах</template></span>
    </div>

    <div class="card chart">
      <div class="ch">
        <div class="seg sm"><button :class="{ on: by === 'month' }" @click="by = 'month'">По месяцам</button><button :class="{ on: by === 'week' }" @click="by = 'week'">По неделям</button></div>
      </div>
      <div ref="plot" class="plot" @mouseleave="hover = null">
        <svg v-if="lessons" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Доходы по периодам">
          <g v-for="t in scale.ticks" :key="t"><line :x1="PADL" :x2="W - PADR + 6" :y1="y(t)" :y2="y(t)" class="grid" /><text :x="W - PADR + 12" :y="y(t) + 4" class="tk">{{ fmtMoneyK(t) }}</text></g>
          <g v-for="(b, i) in bars" :key="b.r.key" class="bar" :class="{ dim: hover != null && hover !== i }" @mouseenter="hover = i" @click="hover = hover === i ? null : i">
            <rect :x="b.x - 6" :y="TOP" :width="b.w + 12" :height="H - TOP - BOT" class="hit" />
            <rect v-if="b.plan" :x="b.x + 1" :y="b.plan.y + 1" :width="b.w - 2" :height="Math.max(0, b.plan.h - 1)" rx="5" class="plan" />
            <path v-if="b.ind" :d="b.ind" class="ind" /><path v-if="b.grp" :d="b.grp" class="grp" />
            <text :x="b.cx" :y="H - 8" class="xl" :class="{ now: b.r.now }">{{ label(b.r) }}</text>
          </g>
        </svg>
        <div v-else class="sk" />
        <div v-if="hover != null && bars[hover]" class="tip" :style="{ left: Math.min(Math.max(bars[hover].cx, 100), W - 100) + 'px' }">
          <b>{{ by === 'month' ? monthName(bars[hover].r) : 'неделя с ' + label(bars[hover].r) }}</b>
          <span><i class="d ind" />Индивидуальные <em>{{ fmtMoney(bars[hover].r.ind) }}</em></span>
          <span><i class="d grp" />Групповые <em>{{ fmtMoney(bars[hover].r.grp) }}</em></span>
          <span v-if="bars[hover].r.now && bars[hover].r.plan"><i class="d plan" />Ещё запланировано <em>{{ fmtMoney(bars[hover].r.plan) }}</em></span>
          <span v-if="bars[hover].r.lost" class="r">Отмены <em>−{{ fmtMoney(bars[hover].r.lost) }}</em></span>
        </div>
      </div>
      <div class="legend">
        <div class="lg"><span><i class="d ind" />Индивидуальные</span><b>{{ fmtMoney(total.ind) }}</b></div>
        <div class="lg"><span><i class="d grp" />Групповые</span><b>{{ fmtMoney(total.grp) }}</b></div>
        <div class="lg"><span><i class="d lost" />Отмены · {{ total.cancels }}</span><b class="r">−{{ fmtMoney(total.lost) }}</b></div>
      </div>
    </div>

    <h2>По месяцам</h2>
    <div class="card tbl">
      <table>
        <thead><tr><th>Месяц</th><th class="n">Уроков</th><th class="n">Учеников</th><th class="n">Отмены</th><th class="n">Заработано</th></tr></thead>
        <tbody v-if="lessons">
          <tr v-for="r in table" :key="r.key">
            <td><span class="mn">{{ monthName(r) }}</span><span class="ms">{{ MON[r.d.getMonth()] }} {{ String(r.d.getFullYear()).slice(2) }}</span><small v-if="r.now" class="badge">идёт</small></td>
            <td class="n">{{ r.done }}</td>
            <td class="n">{{ r.people }}</td>
            <td class="n m">{{ r.lost ? '−' + fmtMoney(r.lost) : '—' }}</td>
            <td class="n"><b>{{ fmtMoney(r.real) }}</b><small v-if="r.now && r.plan" class="pl">+ {{ fmtMoney(r.plan) }} запланировано</small></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="exp">
      <button class="ln" :disabled="!lessons?.length" @click="exportMonths"><AppIcon name="download" :size="18" /> Выгрузить по месяцам</button>
      <button class="ln" :disabled="!lessons?.length" @click="exportLessons"><AppIcon name="download" :size="18" /> Все уроки</button>
      <span class="hint">CSV — открывается в Excel и Google Таблицах</span>
    </div>
  </div>
</template>

<style scoped>
.info { gap: 12px }
h1 { margin: 6px 0 0; font-size: 30px; font-weight: 900 }
h2 { margin: 14px 0 0; font-size: 20px; font-weight: 900 }
.tabs { display: flex; gap: 22px; border-bottom: 2px solid var(--border) }
.tabs button { padding: 8px 0 10px; margin-bottom: -2px; border: 0; border-bottom: 2px solid transparent; background: none; font: inherit; font-size: 15px; font-weight: 800; color: var(--hint); cursor: pointer }
.tabs button.on { color: var(--blue); border-color: var(--blue) }
.top { display: flex; align-items: center; gap: 10px }
.seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--surface) }
.seg button { border: 0; border-radius: 9px; padding: 7px 14px; background: none; font: inherit; font-size: 14px; font-weight: 800; color: var(--hint); cursor: pointer }
.seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.seg.sm button { padding: 5px 12px; font-size: 13px }
.sum { display: grid; gap: 2px; margin-top: 4px } .cap { font-size: 15px; font-weight: 800 }
.big { font-size: 34px; font-weight: 900; letter-spacing: -.5px; color: var(--text) }
.chart { display: grid; gap: 10px; padding: 14px 16px 16px }
.ch { display: flex; justify-content: flex-end }
.plot { position: relative } svg { display: block; width: 100%; height: auto; overflow: visible }
.grid { stroke: var(--border); stroke-width: 1 } .tk { font-size: 11px; font-weight: 700; fill: var(--hint) }
.xl { font-size: 11.5px; font-weight: 700; fill: var(--hint); text-anchor: middle } .xl.now { fill: var(--text); font-weight: 900 }
.bar { cursor: pointer; transition: opacity .12s } .bar.dim { opacity: .35 } .hit { fill: transparent }
.ind { fill: #1cb0f6 } .grp { fill: #ffc800 } .plan { fill: rgba(28, 176, 246, .12); stroke: #1cb0f6; stroke-width: 1.5; stroke-dasharray: 4 3 }
.d { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px }
.d.ind { background: #1cb0f6 } .d.grp { background: #ffc800 } .d.lost { background: var(--red) } .d.plan { background: rgba(28, 176, 246, .15); box-shadow: inset 0 0 0 1.5px #1cb0f6 }
.tip { position: absolute; top: 0; transform: translateX(-50%); z-index: 2; display: grid; gap: 3px; min-width: 210px; padding: 10px 12px; border-radius: 12px; background: var(--card); box-shadow: 0 6px 24px rgba(0, 0, 0, .14), 0 0 0 1px var(--border); font-size: 13px; font-weight: 600; pointer-events: none }
.tip b { font-size: 13px; margin-bottom: 2px } .tip span { display: flex; align-items: center } .tip em { margin-left: auto; padding-left: 14px; font-style: normal; font-weight: 800 }
.tip .r em { color: var(--red-d) }
.legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px }
.lg { display: grid; gap: 4px; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 12px }
.lg span { font-size: 13px; font-weight: 700; color: var(--hint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .lg b { font-size: 17px; font-weight: 900 }
.r { color: var(--red-d) }
.sk { height: 220px; border-radius: 12px; background: var(--surface); opacity: .6 }
.tbl { padding: 6px 16px } table { width: 100%; border-collapse: collapse; font-size: 14px }
th { padding: 12px 6px; text-align: left; font-size: 13px; font-weight: 800; color: var(--hint); border-bottom: 1.5px solid var(--border) }
td { padding: 14px 6px; border-bottom: 1px solid var(--border); font-weight: 600; vertical-align: top } tr:last-child td { border-bottom: 0 }
.n { text-align: right; white-space: nowrap } td.m { color: var(--hint) }
.mn, .ms { text-transform: capitalize; font-weight: 800 } .ms { display: none }
.badge { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 6px; background: var(--blue-l); color: var(--blue); font-size: 11px; font-weight: 800; vertical-align: 1px }
.pl { display: block; margin-top: 2px; font-size: 12px; font-weight: 700; color: var(--blue) }
.exp { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; padding: 2px 4px }
.ln :deep(svg) { flex: none; width: 18px; height: 18px }
.ln { white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; font: inherit; font-size: 14px; font-weight: 800; color: var(--blue); text-decoration: underline; text-underline-offset: 3px; cursor: pointer }
.ln:disabled { opacity: .4; cursor: default } .exp .hint { font-size: 12px }
.bad { color: var(--red-d) }
@media (max-width: 600px) {
  h1 { font-size: 26px } .big { font-size: 30px }
  .legend { grid-template-columns: 1fr 1fr } .legend .lg:last-child { grid-column: 1 / -1 }
  .tbl { padding: 2px 10px } th, td { padding-left: 3px; padding-right: 3px } th:nth-child(3), td:nth-child(3) { display: none }
  .tip { min-width: 190px } .mn { display: none } .ms { display: inline } .badge { margin-left: 4px }
}
</style>

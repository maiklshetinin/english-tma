<script setup>
// Графики журнала (24.11.2026), в духе YouTube Studio: сверху три метрики-вкладки (число за период и разница с прошлым таким же
// периодом), под ними — график выбранной по дням:
//  • «Время» — сколько минут в упражнениях за день: голубая область с градиентом, дни без занятий — ноль;
//  • «Средний балл» — средний результат за день: балл ИИ, а где его нет — зачтено 100 / не зачтено 0; дни без оценок линия проходит насквозь;
//  • «Зачтено» — столбики: зачтено (зелёный) и не зачтено (красный) за день, с легендой.
// Наведение — вертикальная линия и подсказка с датой и значением. Данные — тот же журнал (utils/runlog.js exList), ничего нового с сервера.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { exWord, dur } from '../utils/runlog'

const props = defineProps({ list: { type: Array, required: true } })          // пройденные упражнения (exList)

const span = ref((() => { try { return Number(localStorage.getItem('tma.exChart.span')) || 28 } catch { return 28 } })())
const metric = ref((() => { try { return localStorage.getItem('tma.exChart.m') || 'time' } catch { return 'time' } })())
watch(span, (v) => { try { localStorage.setItem('tma.exChart.span', String(v)) } catch { /* */ } })
watch(metric, (v) => { try { localStorage.setItem('tma.exChart.m', v) } catch { /* */ } })

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const score = (e) => (e.sc != null ? e.sc : e.ok === true ? 100 : e.ok === false ? 0 : null)          // результат упражнения 0–100
/** дни отрезка [конец − n + 1 … конец], конец — сегодня минус back дней */
function daysOf(n, back = 0) {
  const by = new Map()
  for (const e of props.list) { const k = ymd(new Date(e.at)); (by.get(k) ?? by.set(k, []).get(k)).push(e) }
  const out = [], t = new Date(); t.setHours(12, 0, 0, 0)
  for (let i = n - 1 + back; i >= back; i--) {
    const d = new Date(t); d.setDate(t.getDate() - i)
    const ex = by.get(ymd(d)) ?? [], sc = ex.map(score).filter((x) => x != null)
    out.push({ d, n: ex.length, min: ex.reduce((a, e) => a + (e.sec || 0), 0) / 60, avg: sc.length ? sc.reduce((a, x) => a + x, 0) / sc.length : null, ss: sc.reduce((a, x) => a + x, 0), sn: sc.length,
      ok: ex.filter((e) => e.ok === true).length, bad: ex.filter((e) => e.ok === false).length })
  }
  return out
}
const days = computed(() => daysOf(span.value)), prev = computed(() => daysOf(span.value, span.value))
function sum(ds) {
  const ss = ds.reduce((a, x) => a + x.ss, 0), sn = ds.reduce((a, x) => a + x.sn, 0)          // средний балл — по всем упражнениям с результатом
  return { min: ds.reduce((a, x) => a + x.min, 0), n: ds.reduce((a, x) => a + x.n, 0), ok: ds.reduce((a, x) => a + x.ok, 0), graded: ds.reduce((a, x) => a + x.ok + x.bad, 0), avg: sn ? ss / sn : null }
}
const cur = computed(() => sum(days.value)), was = computed(() => sum(prev.value))
// разница с прошлым таким же периодом; прошлый почти пустой (рост больше чем в 5 раз) — не показываем: «+1483%» ничего не говорит
const delta = (a, b) => { if (a == null || b == null || !b) return null; const d = Math.round(((a - b) / b) * 100); return Math.abs(d) > 500 ? null : d }
const cards = computed(() => [
  { k: 'time', t: 'Время', v: dur(cur.value.min * 60), sub: `${cur.value.n} ${exWord(cur.value.n)}`, d: delta(cur.value.min, was.value.min) },
  { k: 'avg', t: 'Средний балл', v: cur.value.avg == null ? '—' : Math.round(cur.value.avg) + '%', sub: 'по проверенным', d: cur.value.avg != null && was.value.avg != null ? Math.round(cur.value.avg - was.value.avg) : null, pts: true },
  { k: 'ok', t: 'Зачтено', v: cur.value.graded ? `${cur.value.ok} из ${cur.value.graded}` : '—', sub: cur.value.graded ? Math.round((cur.value.ok / cur.value.graded) * 100) + '%' : 'нет оценок', d: delta(cur.value.ok, was.value.ok) },
])

// ---- геометрия ----
const H = 220, T = 14, B = 26, L = 40, R = 10
const W = ref(640), box = ref(null)
let ro = null
onMounted(() => { ro = new ResizeObserver(([e]) => { W.value = Math.max(280, Math.round(e.contentRect.width)) }); if (box.value) ro.observe(box.value) })
onUnmounted(() => ro?.disconnect())
const iw = computed(() => W.value - L - R), ih = H - T - B
const n = computed(() => days.value.length)
const xAt = (i) => L + (n.value <= 1 ? iw.value / 2 : (i / (n.value - 1)) * iw.value)
const slot = computed(() => iw.value / n.value)
const xBar = (i) => L + slot.value * i + slot.value / 2
/** «красивый» верх шкалы и деления */
function ticks(max) { if (max <= 0) return { top: 1, step: 1 }; const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p, st = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; return { top: Math.ceil(max / st) * st, step: st } }
const val = (x) => (metric.value === 'time' ? x.min : metric.value === 'avg' ? x.avg : x.ok + x.bad)
const scale = computed(() => (metric.value === 'avg' ? { top: 100, step: 25 } : ticks(Math.max(...days.value.map((x) => val(x) ?? 0)))))
const yAt = (v) => T + ih - (v / scale.value.top) * ih
const grid = computed(() => { const o = []; for (let v = 0; v <= scale.value.top + 1e-9; v += scale.value.step) o.push({ v, y: yAt(v), t: metric.value === 'avg' ? v + '%' : metric.value === 'time' ? (v >= 60 ? Math.round(v / 60 * 10) / 10 + ' ч' : Math.round(v) + ' м') : String(Math.round(v)) }); return o })
// линия и область: сглаженная (монотонная) кривая; null — разрыв
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}` }
  return d
}
const runs = computed(() => {          // куски без разрывов
  const out = []; let r = []
  days.value.forEach((x, i) => { const v = val(x); if (v != null) r.push([xAt(i), yAt(v)]) })          // дни без оценок — линия идёт насквозь, как в YouTube Studio
  if (r.length) out.push(r); return out
})
const line = computed(() => runs.value.map(smooth).join(' '))
const area = computed(() => runs.value.map((r) => (r.length < 2 ? '' : smooth(r) + ` L${r[r.length - 1][0]},${T + ih} L${r[0][0]},${T + ih} Z`)).join(' '))
const dots = computed(() => runs.value.filter((r) => r.length === 1).map((r) => r[0]))          // одиночная точка между разрывами
const bars = computed(() => {
  const bw = Math.max(3, Math.min(22, slot.value * 0.6))
  return days.value.map((x, i) => { const yOk = yAt(x.ok), yBad = yAt(x.ok + x.bad), gap = x.ok && x.bad ? 2 : 0
    return { i, x: xBar(i) - bw / 2, w: bw, ok: x.ok ? { y: yOk, h: T + ih - yOk } : null, bad: x.bad ? { y: yBad, h: yOk - yBad - gap } : null } })
})
const MD = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const dm = (d) => `${d.getDate()} ${MD[d.getMonth()]}`
const labels = computed(() => { const every = Math.max(1, Math.ceil(n.value / Math.max(2, Math.floor(iw.value / 64)))); return days.value.map((x, i) => ({ i, t: dm(x.d), x: metric.value === 'ok' ? xBar(i) : xAt(i) })).filter((l) => (n.value - 1 - l.i) % every === 0) })

// ---- наведение ----
const hov = ref(-1)
function move(e) {
  const r = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W.value
  const i = metric.value === 'ok' ? Math.floor((x - L) / slot.value) : Math.round(((x - L) / iw.value) * (n.value - 1))
  hov.value = i >= 0 && i < n.value ? i : -1
}
const tip = computed(() => {
  const i = hov.value; if (i < 0) return null
  const x = days.value[i], px = metric.value === 'ok' ? xBar(i) : xAt(i)
  const wd = x.d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
  const rows = metric.value === 'time' ? [[dur(x.min * 60), x.n ? `${x.n} ${exWord(x.n)}` : 'не занимался']]
    : metric.value === 'avg' ? [[x.avg == null ? '—' : Math.round(x.avg) + '%', x.avg == null ? 'нет оценок' : `средний балл · ${x.sn} ${exWord(x.sn)}`]]
      : [[String(x.ok), 'зачтено', 'g'], [String(x.bad), 'не зачтено', 'b']]
  const v = val(x)
  return { px, py: v == null ? null : yAt(metric.value === 'ok' ? x.ok + x.bad : v), wd, rows, left: px > W.value * 0.62 }
})
</script>

<template>
  <section class="exc">
    <div class="top">
      <div class="seg" role="radiogroup" aria-label="Период">
        <button v-for="s in [7, 28, 90]" :key="s" role="radio" :aria-checked="span === s" :class="{ on: span === s }" @click="span = s">{{ s }} дней</button>
      </div>
    </div>
    <div class="cards" role="tablist">
      <button v-for="c in cards" :key="c.k" role="tab" :aria-selected="metric === c.k" class="card" :class="{ on: metric === c.k }" @click="metric = c.k">
        <span class="ct">{{ c.t }}</span>
        <b class="cv">{{ c.v }}</b>
        <span class="cs">{{ c.sub }}<template v-if="c.d != null"><i :class="c.d > 0 ? 'up' : c.d < 0 ? 'dn' : ''">{{ c.d > 0 ? '▲' : c.d < 0 ? '▼' : '' }} {{ Math.abs(c.d) }}{{ c.pts ? ' п.' : '%' }}</i></template></span>
      </button>
    </div>
    <div ref="box" class="plot">
      <div class="lgd" :class="{ hid: metric !== 'ok' }" :aria-hidden="metric !== 'ok'"><span><i class="g" />зачтено</span><span><i class="b" />не зачтено</span></div>          <!-- место под легенду есть на всех вкладках — высота не прыгает -->
      <svg :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="cards.find(c => c.k === metric)?.t + ' по дням'" @pointermove="move" @pointerleave="hov = -1">
        <defs>
          <linearGradient id="excFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1cb0f6" stop-opacity=".32" /><stop offset="1" stop-color="#1cb0f6" stop-opacity="0" /></linearGradient>
        </defs>
        <g class="grid"><template v-for="g in grid" :key="g.v"><line :x1="L" :x2="W - R" :y1="g.y" :y2="g.y" /><text :x="L - 6" :y="g.y + 4" text-anchor="end">{{ g.t }}</text></template></g>
        <template v-if="metric !== 'ok'">
          <path :d="area" fill="url(#excFill)" />
          <path :d="line" class="ln" />
          <circle v-for="(p, k) in dots" :key="k" :cx="p[0]" :cy="p[1]" r="3.5" class="pt" />
        </template>
        <template v-else>
          <g v-for="b in bars" :key="b.i" :class="{ dim: hov >= 0 && hov !== b.i }">
            <rect v-if="b.ok" :x="b.x" :y="b.ok.y" :width="b.w" :height="Math.max(0, b.ok.h)" rx="3" class="bg" />
            <rect v-if="b.bad" :x="b.x" :y="b.bad.y" :width="b.w" :height="Math.max(0, b.bad.h)" rx="3" class="bb" />
          </g>
        </template>
        <g class="ax"><text v-for="l in labels" :key="l.i" :x="l.x" :y="H - 6" text-anchor="middle">{{ l.t }}</text></g>
        <g v-if="tip"><line :x1="tip.px" :x2="tip.px" :y1="T" :y2="T + ih" class="cross" /><circle v-if="metric !== 'ok' && tip.py != null" :cx="tip.px" :cy="tip.py" r="5" class="hp" /></g>
      </svg>
      <div v-if="tip" class="tip" :style="{ left: tip.px + 'px', transform: tip.left ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }">
        <small>{{ tip.wd }}</small>
        <div v-for="(r, k) in tip.rows" :key="k" class="tr"><i v-if="r[2]" :class="r[2]" /><b>{{ r[0] }}</b><span>{{ r[1] }}</span></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.exc { background: var(--card); border-radius: 18px; box-shadow: 0 1px 0 rgba(0, 0, 0, .04), 0 6px 22px rgba(0, 0, 0, .05); padding: 14px 16px 10px; display: grid; gap: 12px; min-width: 0 }
.top { display: flex; justify-content: flex-end }
.seg { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--surface, #f2f3f5) }
.seg button { border: 0; background: none; padding: 5px 11px; border-radius: 8px; font: inherit; font-size: 12.5px; font-weight: 800; color: var(--hint); cursor: pointer }
.seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--border) }
.card { all: unset; box-sizing: border-box; display: grid; gap: 2px; padding: 8px 12px 12px; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; min-width: 0 }
.card:hover { background: var(--surface) } .card.on { border-bottom-color: #1cb0f6 } .card:focus-visible { outline: 2px solid #1cb0f6; outline-offset: -2px }
.ct { font-size: 12.5px; font-weight: 800; color: var(--hint) } .card.on .ct { color: var(--text) }
.cv { font-size: 24px; font-weight: 900; color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cs { font-size: 12px; font-weight: 700; color: var(--hint); display: flex; gap: 6px; flex-wrap: wrap }
.cs i { font-style: normal; font-weight: 800 } .cs i.up { color: #2e8b00 } .cs i.dn { color: #d92d20 }
.plot { position: relative; min-width: 0 }
.plot svg { display: block; overflow: visible; touch-action: pan-y }
.grid line { stroke: var(--border); stroke-width: 1 } .grid text, .ax text { font-size: 11px; font-weight: 700; fill: var(--hint); font-variant-numeric: tabular-nums }
.ln { fill: none; stroke: #1cb0f6; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round }
.pt, .hp { fill: #1cb0f6; stroke: var(--card); stroke-width: 2 }
.cross { stroke: var(--hint); stroke-width: 1; stroke-dasharray: 3 3; opacity: .7 }
.bg { fill: #58cc02 } .bb { fill: #ff4b4b } .dim { opacity: .45 }
.lgd { display: flex; gap: 14px; justify-content: flex-end; font-size: 12px; font-weight: 700; color: var(--hint); margin-bottom: 4px }
.lgd.hid { visibility: hidden }
.lgd span { display: inline-flex; align-items: center; gap: 5px } .lgd i, .tr i { width: 10px; height: 10px; border-radius: 3px; display: inline-block }
i.g { background: #58cc02 } i.b { background: #ff4b4b }
.tip { position: absolute; top: 6px; pointer-events: none; background: var(--card); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 6px 20px rgba(0, 0, 0, .12); padding: 7px 10px; display: grid; gap: 3px; white-space: nowrap; z-index: 2 }
.tip small { font-size: 11.5px; font-weight: 700; color: var(--hint) }
.tr { display: flex; align-items: center; gap: 6px; font-size: 13px } .tr b { font-weight: 900; color: var(--text); font-variant-numeric: tabular-nums } .tr span { color: var(--hint); font-weight: 700 }
@media (max-width: 560px) { .exc { padding: 12px 10px 8px } .card { padding: 6px 8px 10px } .cv { font-size: 19px } }
</style>

<script setup>
// Линейный график в стиле Usage в Firebase (для панели разработчика): сетка, подписи, линии серий, пунктир лимитов, наведение с подсказкой.
//   <MiniChart :points="[{ t, req, e5 }]" :series="[{ k: 'req', t: 'Запросы', c: '#4285f4' }]" :step="60" range="hour" unit="мс" :limits="[{ v: 512, t: 'лимит 512 МБ', c: '#e8453c' }]" />
import { ref, computed } from 'vue'
const props = defineProps({
  points: { type: Array, default: () => [] },
  series: { type: Array, required: true },          // { k, t, c }
  step: { type: Number, default: 60 },              // секунд в шаге — для подсказки «с–по»
  range: { type: String, default: 'hour' },          // hour | day | month — как подписывать время
  limits: { type: Array, default: () => [] },        // { v, t, c } — пунктир
  unit: { type: String, default: '' },
  height: { type: Number, default: 150 },
})
const W = 600, L = 40, R = 8, T = 10, B = 22
const H = computed(() => props.height)
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace('.0', '') + 'K' : (Math.round(n * 10) / 10).toLocaleString('ru'))
const maxY = computed(() => {
  let m = 1
  for (const s of props.series) for (const p of props.points) m = Math.max(m, p[s.k] || 0)
  for (const l of props.limits) m = Math.max(m, l.v)
  const e = 10 ** Math.floor(Math.log10(m)), f = m / e
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e
})
const n = computed(() => props.points.length)
const x = (i) => L + (n.value < 2 ? 0 : (i / (n.value - 1)) * (W - L - R))
const y = (v) => T + (1 - v / maxY.value) * (H.value - T - B)
const path = (k) => props.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k] || 0).toFixed(1)}`).join('')
const grid = computed(() => [0, .5, 1].map(f => ({ y: y(maxY.value * f), t: fmt(maxY.value * f) })))
const tLabel = (t) => {
  const d = new Date(t)
  return props.range === 'month' ? d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}
const ticks = computed(() => {
  const k = props.range === 'hour' ? 15 : props.range === 'day' ? 6 : 7
  return props.points.map((p, i) => ({ i, t: tLabel(p.t) })).filter(({ i }) => i % k === 0 || i === n.value - 1).filter(({ i }) => i === n.value - 1 || n.value - 1 - i >= k / 2)
})
const hov = ref(-1)
function move(e) {
  const r = e.currentTarget.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * W
  hov.value = Math.max(0, Math.min(n.value - 1, Math.round(((vx - L) / (W - L - R)) * (n.value - 1))))
}
const hp = computed(() => props.points[hov.value])
const hTime = computed(() => {
  if (!hp.value) return ''
  const a = new Date(hp.value.t), b = new Date(hp.value.t + props.step * 1000)
  return props.range === 'month' ? a.toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' }) : `${tLabel(a)}–${tLabel(b)}`
})
</script>

<template>
  <div class="mc">
    <svg :viewBox="`0 0 ${W} ${H}`" @pointermove="move" @pointerleave="hov = -1">
      <g v-for="g in grid" :key="g.y">
        <line :x1="L" :x2="W - R" :y1="g.y" :y2="g.y" class="gl" />
        <text :x="L - 6" :y="g.y + 3" text-anchor="end" class="ax">{{ g.t }}</text>
      </g>
      <g v-for="l in limits" :key="l.t">
        <line :x1="L" :x2="W - R" :y1="y(l.v)" :y2="y(l.v)" class="lim" :stroke="l.c" />
        <text :x="W - R - 2" :y="y(l.v) - 4" text-anchor="end" class="lt" :fill="l.c">{{ l.t }}</text>
      </g>
      <text v-for="t in ticks" :key="t.i" :x="x(t.i)" :y="H - 5" :text-anchor="t.i === n - 1 ? 'end' : t.i === 0 ? 'start' : 'middle'" class="ax">{{ t.t }}</text>
      <path v-for="s in series" :key="s.k" :d="path(s.k)" fill="none" :stroke="s.c" stroke-width="2" stroke-linejoin="round" />
      <g v-if="hp">
        <line :x1="x(hov)" :x2="x(hov)" :y1="T" :y2="H - B" class="hl" />
        <circle v-for="s in series" :key="s.k" :cx="x(hov)" :cy="y(hp[s.k] || 0)" r="3.5" :fill="s.c" />
      </g>
    </svg>
    <div v-if="hp" class="tip" :style="{ left: (x(hov) / W) * 100 + '%' }" :class="{ flip: hov > n / 2 }">
      <small>{{ hTime }}</small>
      <span v-for="s in series" :key="s.k" :style="{ '--c': s.c }"><i />{{ s.t }} <b>{{ (hp[s.k] || 0).toLocaleString('ru') }}{{ unit && ' ' + unit }}</b></span>
    </div>
  </div>
</template>

<style scoped>
.mc { position: relative } .mc svg { display: block; width: 100%; height: auto; touch-action: none }
.gl { stroke: var(--border); stroke-width: 1 } .ax { font-size: 10px; fill: var(--hint) } .lim { stroke-width: 1.2; stroke-dasharray: 5 4 } .lt { font-size: 9px; font-weight: 700 }
.hl { stroke: var(--hint); stroke-width: 1; stroke-dasharray: 3 3 }
.tip { position: absolute; top: 2px; translate: 10px 0; display: grid; gap: 3px; padding: 7px 9px; border-radius: 8px; background: var(--card); box-shadow: 0 2px 10px rgba(0, 0, 0, .18); font-size: 12px; white-space: nowrap; pointer-events: none; z-index: 2 }
.tip.flip { translate: calc(-100% - 10px) 0 } .tip small { color: var(--hint); font-size: 11px } .tip span { display: flex; align-items: center; gap: 6px } .tip i { width: 8px; height: 8px; border-radius: 2px; background: var(--c) }
</style>

<script setup>
// Нагрузка на базу — для разработчика, в стиле графика Usage в Firebase: свой счётчик сервера (server/metrics.ts) — чтения и записи,
// которые делает наш сервер, и «откуда чтения» по запросам. Чтений из консоли Firebase тут нет (точные цифры — Firebase → Usage).
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { request } from '../stores/api'

const RANGES = [['hour', 'Час'], ['day', 'Сутки'], ['month', 'Месяц']]
const range = ref('day')
const data = ref(null), busy = ref(false), err = ref('')
const show = ref({ r: true, w: true })
const SER = [{ k: 'r', t: 'Reads', c: '#4285f4' }, { k: 'w', t: 'Writes', c: '#fa7b17' }]
const LIMITS = { r: 50000, w: 20000 }          // бесплатно в сутки (Spark): 50K чтений, 20K записей — как пунктир в Firebase

async function load() {
  busy.value = true
  try { data.value = await request('/dev/usage?range=' + range.value, undefined, 'Нагрузка на базу'); err.value = '' } catch (e) { err.value = e.message }
  busy.value = false
}
watch(range, load)
let timer = 0
onMounted(() => { load(); timer = window.setInterval(() => document.visibilityState === 'visible' && load(), 60_000) })
onBeforeUnmount(() => clearInterval(timer))

const pts = computed(() => data.value?.ours ?? [])
const total = (k) => pts.value.reduce((a, p) => a + (p[k] || 0), 0)
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace('.0', '') + 'K' : n.toLocaleString('ru'))

// график: viewBox 600×190, поля слева под подписи
const W = 600, H = 190, L = 40, R = 8, T = 10, B = 24
const limitsOn = computed(() => range.value === 'month')
const maxY = computed(() => {
  let m = 1
  for (const s of SER) if (show.value[s.k]) for (const p of pts.value) m = Math.max(m, p[s.k] || 0)
  if (limitsOn.value) for (const k in LIMITS) if (show.value[k]) m = Math.max(m, LIMITS[k])
  const e = 10 ** Math.floor(Math.log10(m)), f = m / e
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e
})
const x = (i) => L + (pts.value.length < 2 ? 0 : (i / (pts.value.length - 1)) * (W - L - R))
const y = (v) => T + (1 - v / maxY.value) * (H - T - B)
const path = (k) => pts.value.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k] || 0).toFixed(1)}`).join('')
const grid = computed(() => [0, .25, .5, .75, 1].map(f => ({ y: y(maxY.value * f), t: fmt(maxY.value * f) })))
const tLabel = (t) => {
  const d = new Date(t)
  return range.value === 'month' ? d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}
const ticks = computed(() => { const n = pts.value.length, k = range.value === 'hour' ? 10 : range.value === 'day' ? 4 : 5; return pts.value.map((p, i) => ({ i, t: tLabel(p.t) })).filter(({ i }) => i % k === 0 || i === n - 1).filter(({ i }) => i === n - 1 || n - 1 - i >= k / 2) })

// наведение: ближайшая точка
const hov = ref(-1)
function move(e) {
  const r = e.currentTarget.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * W
  hov.value = Math.max(0, Math.min(pts.value.length - 1, Math.round(((vx - L) / (W - L - R)) * (pts.value.length - 1))))
}
const hp = computed(() => pts.value[hov.value])
const hTime = computed(() => {
  if (!hp.value) return ''
  const a = new Date(hp.value.t), b = new Date(hp.value.t + data.value.step * 1000)
  const d = a.toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' })
  return range.value === 'month' ? d : `${d}, ${tLabel(a)}–${tLabel(b)}`
})

// откуда чтения: свой счётчик по запросам
const NAMES = { schedule: 'Расписание', lessons: 'Уроки', students: 'Ученики', content: 'Пути и колоды', paths: 'Пути', presets: 'Пресеты', decks: 'Колоды', courses: 'Конструктор курсов', notes: 'Заметки', groups: 'Группы', review: 'Повторение', me: 'Профиль, «был в сети»', auth: 'Вход', invites: 'Приглашения', dev: 'Панель разработчика', media: 'Медиа', courseProgress: 'Прохождение курсов' }
const nice = (label) => { if (label === 'фон') return 'Фон: старт сервера, живые правки'; const seg = label.split(' /')[1]?.split('/')[0]; return NAMES[seg] ?? seg ?? label }
const top = computed(() => data.value?.top ?? [])
const topMax = computed(() => Math.max(1, ...top.value.map(t => t.r)))
const ownTotal = computed(() => top.value.reduce((a, t) => a + t.r, 0))
const since = computed(() => data.value && new Date(data.value.since).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
</script>

<template>
  <div class="du">
    <div class="hd">
      <b>Нагрузка на базу <span class="src">наш сервер</span></b>
      <span class="seg" role="tablist">
        <button v-for="[k, t] in RANGES" :key="k" type="button" :class="{ on: range === k }" @click="range = k">{{ t }}</button>
      </span>
      <button type="button" class="rf" :class="{ spin: busy }" title="Обновить" @click="load">↻</button>
    </div>

    <div class="lg">
      <label v-for="s in SER" :key="s.k" class="li" :class="{ off: !show[s.k] }" :style="{ '--c': s.c }">
        <input v-model="show[s.k]" type="checkbox" />
        <span class="cb" />
        <span><small>{{ s.t }}</small><b>{{ fmt(total(s.k)) }}</b> всего</span>
      </label>
    </div>

    <div v-if="err" class="er">{{ err }}</div>
    <div v-else-if="data" class="ch">
      <svg :viewBox="`0 0 ${W} ${H}`" @pointermove="move" @pointerleave="hov = -1">
        <g v-for="g in grid" :key="g.y">
          <line :x1="L" :x2="W - R" :y1="g.y" :y2="g.y" class="gl" />
          <text :x="L - 6" :y="g.y + 3" text-anchor="end" class="ax">{{ g.t }}</text>
        </g>
        <template v-if="limitsOn">
          <g v-for="(v, k) in LIMITS" v-show="show[k]" :key="k">
            <line :x1="L" :x2="W - R" :y1="y(v)" :y2="y(v)" class="lim" :stroke="k === 'r' ? '#4285f4' : '#e8453c'" />
            <text :x="W - R - 2" :y="y(v) - 4" text-anchor="end" class="lt" :fill="k === 'r' ? '#4285f4' : '#e8453c'">бесплатно {{ fmt(v) }}/день</text>
          </g>
        </template>
        <text v-for="t in ticks" :key="t.i" :x="x(t.i)" :y="H - 6" :text-anchor="t.i === pts.length - 1 ? 'end' : t.i === 0 ? 'start' : 'middle'" class="ax">{{ t.t }}</text>
        <template v-for="s in SER" :key="s.k">
          <path v-if="show[s.k]" :d="path(s.k)" fill="none" :stroke="s.c" stroke-width="2" stroke-linejoin="round" />
        </template>
        <g v-if="hp">
          <line :x1="x(hov)" :x2="x(hov)" :y1="T" :y2="H - B" class="hl" />
          <template v-for="s in SER" :key="s.k"><circle v-if="show[s.k]" :cx="x(hov)" :cy="y(hp[s.k] || 0)" r="3.5" :fill="s.c" /></template>
        </g>
      </svg>
      <div v-if="hp" class="tip" :style="{ left: (x(hov) / W) * 100 + '%' }" :class="{ flip: hov > pts.length / 2 }">
        <small>{{ hTime }}</small>
        <template v-for="s in SER" :key="s.k"><span v-if="show[s.k]" :style="{ '--c': s.c }"><i />{{ s.t }} <b>{{ (hp[s.k] || 0).toLocaleString('ru') }}</b></span></template>
      </div>
    </div>
    <p v-if="data" class="nt">Чтения и записи, которые делает наш сервер, — с его запуска {{ since }}. Чтения из консоли Firebase (когда листаете базу) сюда не попадают; точные цифры для счёта — Firebase → Firestore → Usage.</p>

    <div v-if="top.length" class="tp">
      <div class="th"><b>Откуда чтения</b><small>свой счётчик сервера · {{ fmt(ownTotal) }} за период · с {{ since }}</small></div>
      <div v-for="t in top" :key="t.label" class="tr">
        <span class="tn">{{ nice(t.label) }}<small>{{ t.label }}</small></span>
        <span class="bar"><i :style="{ width: (t.r / topMax) * 100 + '%' }" /></span>
        <span class="tv"><b>{{ t.r.toLocaleString('ru') }}</b><small v-if="t.w">+{{ t.w }} зап.</small></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.du { display: grid; gap: 10px; min-width: 0 }
.hd { display: flex; align-items: center; gap: 8px } .hd > b { flex: 1; font-size: 16px; font-weight: 600 }
.seg { display: inline-flex; padding: 2px; border-radius: 10px; background: var(--surface) }
.seg button { padding: 5px 10px; border: 0; border-radius: 8px; background: none; color: var(--hint); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.rf { width: 30px; height: 30px; border: 0; border-radius: 8px; background: var(--surface); color: var(--hint); font-size: 16px; cursor: pointer } .rf.spin { animation: rf 1s linear infinite } @keyframes rf { to { rotate: 360deg } }
/* легенда как в Firebase: квадрат-флажок цвета линии, крупная сумма */
.lg { display: flex; flex-wrap: wrap; gap: 6px 18px }
.li { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none } .li input { display: none }
.cb { width: 16px; height: 16px; border-radius: 3px; background: var(--c); box-shadow: inset 0 0 0 2px var(--c); position: relative } .cb::after { content: ''; position: absolute; left: 5px; top: 2px; width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; rotate: 45deg }
.li.off .cb { background: none } .li.off .cb::after { display: none } .li.off b { color: var(--hint) }
.li > span:last-child { display: grid; font-size: 12px; color: var(--hint); line-height: 1.2 } .li small { font-size: 12px; font-weight: 600; color: var(--text) } .li b { font-size: 22px; font-weight: 500; color: var(--c) }
.ch { position: relative } .ch svg { display: block; width: 100%; height: auto; touch-action: none }
.gl { stroke: var(--border); stroke-width: 1 } .ax { font-size: 10px; fill: var(--hint) } .lim { stroke-width: 1.2; stroke-dasharray: 5 4 } .lt { font-size: 9px; font-weight: 700 }
.hl { stroke: var(--hint); stroke-width: 1; stroke-dasharray: 3 3 }
.tip { position: absolute; top: 4px; translate: 10px 0; display: grid; gap: 3px; padding: 8px 10px; border-radius: 8px; background: var(--card); box-shadow: 0 2px 10px rgba(0, 0, 0, .18); font-size: 12px; white-space: nowrap; pointer-events: none; z-index: 2 }
.tip.flip { translate: calc(-100% - 10px) 0 } .tip small { color: var(--hint); font-size: 11px } .tip span { display: flex; align-items: center; gap: 6px } .tip i { width: 8px; height: 8px; border-radius: 2px; background: var(--c) }
.src { margin-left: 6px; padding: 2px 7px; border-radius: 7px; background: var(--surface); color: var(--hint); font-size: 11px; font-weight: 700; vertical-align: 2px }
.nt { margin: 0; font-size: 11.5px; color: var(--hint) } .er { padding: 10px; border-radius: 10px; background: color-mix(in srgb, #e8453c 10%, transparent); color: #c5221f; font-size: 13px }
.tp { display: grid; gap: 6px; padding-top: 6px; border-top: 1px solid var(--border) }
.th { display: grid } .th b { font-size: 14px; font-weight: 700 } .th small { font-size: 11.5px; color: var(--hint) }
.tr { display: grid; grid-template-columns: minmax(0, 1.2fr) 1fr auto; align-items: center; gap: 10px; font-size: 13px }
.tn { display: grid; min-width: 0; font-weight: 600 } .tn small { overflow: hidden; font-size: 10.5px; font-weight: 500; color: var(--hint); text-overflow: ellipsis; white-space: nowrap }
.bar { height: 8px; border-radius: 4px; background: var(--surface); overflow: hidden } .bar i { display: block; height: 100%; border-radius: 4px; background: #4285f4 }
.tv { display: grid; justify-items: end; min-width: 54px } .tv b { font-weight: 800 } .tv small { font-size: 10.5px; color: #fa7b17; font-weight: 700 }
</style>

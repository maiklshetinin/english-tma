<script setup>
// «График запоминания»: как ученик помнит словарь во времени — все слова сразу (FSRS).
//  • Тонкие серые линии — каждое слово: после ответа его вероятность вспомнить подскакивает до 100 % («подкидывание»),
//    потом тает по кривой забывания. Слов больше 40 — вместо линий полоса «от слабых до сильных» (10–90 %).
//  • Фиолетовая жирная — память словаря в среднем; справа от «сейчас» пунктиром — что будет, если не заниматься.
//  • Синяя — выбранное слово (наведи на серую линию — подсветится, нажми — выбрать; выбранное — с точками ответов).
//  • Внизу — сколько ответов было в каждый день (зелёный — верно, красный — ошибка): видно, где «подкидывали» слова.
//  • В реальном времени: ответили в уроке — линия слова подскакивает (оранжевая вспышка), средняя меняется, сверху — строка.
//  • Наведение на график — подсказка за этот момент: в среднем, сколько слов ниже порога и какие.
// Расчёт — utils/review.ts (ts-fsrs); прошлое восстанавливается по истории ответов слова, сервер не нужен.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { rate, recallAt, stateOf } from '../utils/review'
import { useFitHeight } from '../composables/useFitHeight'

const props = defineProps({
  items: { type: Object, required: true },             // словарь { ключ: RItem }
  cfg: { type: Object, required: true },               // { retention, maxDays }
  focus: { type: String, default: '' },                // слово экрана, открытого в уроке, — выбрано само
  dock: Boolean,
  tall: Boolean,                                       // высокий (Review)
})
const emit = defineEmits(['pick'])
const DAY = 86_400_000, HOUR = 3_600_000
const now = ref(Date.now()); let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 20_000) }); onUnmounted(() => clearInterval(clock))

// «сейчас» — не раньше последнего ответа (часы тикают раз в 20 с, а ответ мог прийти только что)
const nowT = computed(() => { let m = now.value; for (const x of Object.values(props.items)) { const t = x.hist[0]?.t; if (t > m) m = t } return m })
const ZOOMS = [['day', 'Сутки', 0.6, 0.4], ['week', 'Неделя', 5, 2], ['month', 'Месяц', 21, 9]]   // [id, подпись, дней назад, дней вперёд]
const ZK = props.dock ? 'tma.memZoomDock' : 'tma.memZoom'          // сверху урока по умолчанию «Сутки» — видно каждый ответ
const zoom = ref((() => { try { return localStorage.getItem(ZK) || (props.dock ? 'day' : 'week') } catch { return props.dock ? 'day' : 'week' } })())
watch(zoom, (v) => { try { localStorage.setItem(ZK, v) } catch { /* приватный режим */ } })
const range = computed(() => { const z = ZOOMS.find(x => x[0] === zoom.value) ?? ZOOMS[1]; return [nowT.value - z[2] * DAY, nowT.value + z[3] * DAY] })

// у каждого слова — ответы по порядку и память после каждого (история хранится от новых к старым)
const words = computed(() => Object.values(props.items).map(x => {
  const ans = []; let m
  for (const h of [...x.hist].reverse()) if (h.ok !== null) { m = rate(m, h.ok, h.t, props.cfg); ans.push({ t: h.t, ok: h.ok, s: m.s }) }
  if (x.f && ans.length) ans[ans.length - 1].s = x.f.s
  return { key: x.key, text: x.text, tr: x.tr, ans }
}).filter(w => w.ans.length))
const rAt = (w, t) => { let a = null; for (const x of w.ans) { if (x.t > t) break; a = x } return a ? recallAt(a.s, (t - a.t) / DAY) : null }

// ── сетка по времени ──
const W = 640, PL = 38, PB = 40, PT = 10, BARH = 16
const N = 140
const ts = computed(() => { const [a, b] = range.value, out = []; for (let k = 0; k <= N; k++) out.push(a + (b - a) * k / N); return out })
const xOf = (t) => PL + (t - range.value[0]) / (range.value[1] - range.value[0]) * (W - PL - 10)
// высота: в Review — 330; в панели «Графики» курса на широком экране — до низа окна (было много пустого места); иначе 230
const svg = ref(null)
const H = useFitHeight(svg, W, props.tall ? 330 : 230, () => props.dock)
const plotB = computed(() => H.value - PB)
const y0 = ref(0.5)
const yOf = (r) => PT + (1 - (Math.max(y0.value, r) - y0.value) / (1 - y0.value)) * (plotB.value - PT)
const many = computed(() => words.value.length > 40)

// точки линии слова: по сетке + ступенька на каждом ответе (вертикальный подскок)
function wordPts(w) {
  const [a, b] = range.value, pts = []
  const grid = [...ts.value]; for (const x of w.ans) if (x.t > a && x.t < b) grid.push(x.t - 1, x.t)
  grid.sort((p, q) => p - q)
  for (const t of grid) { const r = rAt(w, t); if (r != null) pts.push([t, r]) }
  return pts
}
const toPath = (pts) => pts.length > 1 ? 'M' + pts.map(([t, r]) => `${xOf(t).toFixed(1)} ${yOf(r).toFixed(1)}`).join(' L') : ''
// средняя и полоса (по словам, у которых к этому моменту уже был ответ)
const stats = computed(() => ts.value.map(t => {
  const rs = []; for (const w of words.value) { const r = rAt(w, t); if (r != null) rs.push(r) }
  if (!rs.length) return { t, n: 0 }
  rs.sort((p, q) => p - q)
  return { t, n: rs.length, avg: rs.reduce((p, q) => p + q, 0) / rs.length, lo: rs[Math.floor(rs.length * 0.1)], hi: rs[Math.min(rs.length - 1, Math.floor(rs.length * 0.9))], below: rs.filter(r => r < props.cfg.retention).length }
}))
watch(stats, (st) => {                                   // ось Y — от ~минимума видимого (кривая FSRS пологая)
  let min = props.cfg.retention
  for (const s of st) if (s.n) min = Math.min(min, many.value ? s.lo : s.avg)
  if (!many.value) for (const w of words.value.slice(0, 40)) for (const t of ts.value) { const r = rAt(w, t); if (r != null) min = Math.min(min, r) }
  y0.value = Math.max(0, Math.min(Math.floor((min - 0.04) * 10) / 10, props.cfg.retention - 0.15))
}, { immediate: true })
const avgPast = computed(() => toPath(stats.value.filter(s => s.n && s.t <= nowT.value).map(s => [s.t, s.avg])))
const avgNext = computed(() => toPath(stats.value.filter(s => s.n && s.t >= nowT.value - (range.value[1] - range.value[0]) / N).map(s => [s.t, s.avg])))
const band = computed(() => {
  const st = stats.value.filter(s => s.n); if (st.length < 2) return ''
  return 'M' + st.map(s => `${xOf(s.t).toFixed(1)} ${yOf(s.hi).toFixed(1)}`).join(' L') + ' L' + [...st].reverse().map(s => `${xOf(s.t).toFixed(1)} ${yOf(s.lo).toFixed(1)}`).join(' L') + ' Z'
})
const lines = computed(() => many.value ? [] : words.value.map(w => ({ key: w.key, text: w.text, d: toPath(wordPts(w)) })))

// выбранное слово (синим): нажатое, иначе — из урока (focus), иначе — последнее отвеченное
const sel = ref(null)
watch(() => props.focus, (k) => { if (k) sel.value = k }, { immediate: true })
const selW = computed(() => words.value.find(w => w.key === sel.value) ?? [...words.value].sort((a, b) => b.ans.at(-1).t - a.ans.at(-1).t)[0] ?? null)
const selPast = computed(() => selW.value ? toPath(wordPts(selW.value).filter(([t]) => t <= nowT.value)) : '')
const selNext = computed(() => selW.value ? toPath(wordPts(selW.value).filter(([t]) => t >= nowT.value)) : '')
const selDots = computed(() => selW.value ? selW.value.ans.filter(a => a.t >= range.value[0] && a.t <= range.value[1]).map(a => ({ x: xOf(a.t), ok: a.ok })) : [])
const pick = (k) => { sel.value = k; emit('pick', k) }

// ответы по дням (по часам — на «Сутках»): сколько раз «подкидывали» слова
const bars = computed(() => {
  const [a, b] = range.value, step = zoom.value === 'day' ? HOUR : DAY
  const start = zoom.value === 'day' ? Math.floor(a / HOUR) * HOUR : (() => { const d = new Date(a); d.setHours(0, 0, 0, 0); return d.getTime() })()
  const out = []
  for (let t = start; t < b; t += step) out.push({ t, ok: 0, bad: 0 })
  for (const w of words.value) for (const x of w.ans) { const i = Math.floor((x.t - start) / step); if (i >= 0 && i < out.length) x.ok ? out[i].ok++ : out[i].bad++ }
  const max = Math.max(1, ...out.map(o => o.ok + o.bad))
  return out.map(o => { const x0 = Math.max(PL, xOf(o.t)), x1 = Math.min(W - 10, xOf(o.t + step) - 2); return { ...o, x: x0, w: Math.max(2, x1 - x0), max } }).filter(o => o.w > 2)
})
const ticks = computed(() => {
  const [a, b] = range.value, step = zoom.value === 'day' ? 4 * HOUR : zoom.value === 'week' ? DAY : 7 * DAY, out = []
  let t = zoom.value === 'day' ? Math.ceil(a / step) * step : (() => { const d = new Date(a); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.getTime() })()
  for (; t < b && out.length < 10; t += step) out.push({ x: xOf(t), t: zoom.value === 'day' ? new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) })
  return out
})
const yTicks = computed(() => [1, (1 + y0.value) / 2, y0.value].map(r => ({ y: yOf(r), t: Math.round(r * 100) + '%' })))

// цифры «сейчас»
const nowStat = computed(() => { const rs = words.value.map(w => rAt(w, nowT.value)).filter(r => r != null); return { n: rs.length, avg: rs.length ? rs.reduce((p, q) => p + q, 0) / rs.length : null, below: rs.filter(r => r < props.cfg.retention).length } })
const today = computed(() => { const d = new Date(nowT.value); d.setHours(0, 0, 0, 0); let n = 0; for (const w of words.value) for (const x of w.ans) if (x.t >= d.getTime()) n++; return n })

// ── наведение: подсказка за момент ──
const hov = ref(null)
function move(e) {
  const r = svg.value?.getBoundingClientRect(); if (!r) return
  const x = (e.clientX - r.left) / r.width * W; if (x < PL) { hov.value = null; return }
  const t = range.value[0] + (x - PL) / (W - PL - 10) * (range.value[1] - range.value[0])
  const rs = words.value.map(w => ({ w, r: rAt(w, t) })).filter(o => o.r != null)
  if (!rs.length) { hov.value = { x, t, n: 0 }; return }
  const avg = rs.reduce((p, o) => p + o.r, 0) / rs.length
  const low = rs.filter(o => o.r < props.cfg.retention).sort((a, b) => a.r - b.r)
  hov.value = { x, t, n: rs.length, avg, low: low.slice(0, 4).map(o => `${o.w.text} ${Math.round(o.r * 100)}%`), lowN: low.length }
}
const hovTxt = computed(() => { const h = hov.value; if (!h) return ''; const d = new Date(h.t); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (zoom.value !== 'month' ? ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '') })

// ── в реальном времени: слово только что ответили ──
const flash = ref(null), hot = ref(null); let ft = null
const sig = () => Object.fromEntries(Object.values(props.items).map(x => [x.key, x.hist[0]?.t ?? 0]))
let seen = sig(), lastAvg = null
watch(() => props.items, () => {
  const c = sig(), first = !Object.keys(seen).length, ch = Object.keys(c).filter(k => c[k] > (seen[k] ?? 0)); seen = c
  if (first || !ch.length) return
  const k = ch.sort((a, b) => c[b] - c[a])[0], x = props.items[k], h = x.hist[0]
  if (h.ok === null) return
  sel.value = k; hot.value = k
  const after = nowStat.value.avg, d = lastAvg != null && after != null ? Math.round((after - lastAvg) * 1000) / 10 : null; lastAvg = after
  flash.value = { text: x.text, ok: h.ok, d }
  clearTimeout(ft); ft = setTimeout(() => { flash.value = null; hot.value = null }, 3500)
}, { deep: true })
onUnmounted(() => clearTimeout(ft))
watch(() => words.value.length, () => { if (lastAvg == null) lastAvg = nowStat.value.avg }, { immediate: true })
const hotPath = computed(() => { const w = words.value.find(x => x.key === hot.value); return w ? toPath(wordPts(w)) : '' })

// «Из чего число»: слова и их процент сейчас
const showList = ref(false)
const list = computed(() => words.value.map(w => ({ key: w.key, text: w.text, r: rAt(w, nowT.value), st: stateOf(props.items[w.key], nowT.value, props.cfg) })).sort((a, b) => a.r - b.r))
const pct = (r) => Math.round(r * 100)
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов')
</script>

<template>
  <div class="mc" :class="{ dock }">
    <div class="hd">
      <b class="t">График запоминания</b>
      <div class="seg" role="tablist" aria-label="Масштаб"><button v-for="z in ZOOMS" :key="z[0]" role="tab" :aria-selected="zoom === z[0]" :class="{ on: zoom === z[0] }" @click="zoom = z[0]">{{ z[1] }}</button></div>
    </div>
    <p v-if="!words.length" class="em">Пока пусто — график появится после первого проверенного ответа в уроке.</p>
    <template v-else>
      <div class="kps">
        <div class="kp av"><small>Помнит словарь в среднем</small><b>{{ pct(nowStat.avg) }}%</b></div>
        <div class="kp" :class="{ bad: nowStat.below }"><small>Пора повторить (ниже {{ pct(cfg.retention) }}%)</small><b>{{ nowStat.below }} {{ word(nowStat.below) }}</b></div>
        <div class="kp"><small>Ответов сегодня</small><b>{{ today }}</b></div>
        <div v-if="selW" class="kp sl"><small>Выбрано</small><b>{{ selW.text }} · {{ pct(rAt(selW, nowT)) }}%</b></div>
      </div>
      <div class="fl" :class="{ on: flash }" aria-live="polite"><template v-if="flash"><i :class="flash.ok ? 'y' : 'x'" /><b>{{ flash.text }}</b> · {{ flash.ok ? 'верно' : 'ошибка' }} — слово «подкинуто» к 100 %<template v-if="flash.d != null && flash.d !== 0">, в среднем {{ flash.d > 0 ? '+' : '' }}{{ String(flash.d).replace('.', ',') }}%</template></template></div>
      <div class="pw">
        <svg ref="svg" :viewBox="`0 0 ${W} ${H}`" class="gr" role="img" :aria-label="`Память словаря: в среднем ${pct(nowStat.avg)} %, пора повторить ${nowStat.below}`" @mousemove="move" @mouseleave="hov = null">
          <g class="ax">
            <line :x1="PL" :y1="plotB" :x2="W" :y2="plotB" />
            <text v-for="(t, k) in yTicks" :key="'y' + k" :x="PL - 6" :y="t.y + 3" text-anchor="end">{{ t.t }}</text>
            <text v-for="(t, k) in ticks" :key="'x' + k" :x="t.x" :y="H - 4" text-anchor="middle">{{ t.t }}</text>
          </g>
          <!-- ответы по дням: столбики под осью -->
          <g class="bars"><g v-for="(b, k) in bars" :key="'b' + k"><rect v-if="b.ok" :x="b.x" :y="plotB + 4" :width="b.w" :height="Math.max(2, b.ok / b.max * BARH)" class="bo"><title>{{ b.ok }} верно</title></rect><rect v-if="b.bad" :x="b.x" :y="plotB + 4 + (b.ok ? Math.max(2, b.ok / b.max * BARH) : 0)" :width="b.w" :height="Math.max(2, b.bad / b.max * BARH)" class="bb"><title>{{ b.bad }} ошибок</title></rect></g></g>
          <line class="ret" :x1="PL" :y1="yOf(cfg.retention)" :x2="W" :y2="yOf(cfg.retention)" />
          <text class="rett" :x="W - 12" :y="yOf(cfg.retention) - 4" text-anchor="end">{{ pct(cfg.retention) }}% — пора повторить</text>
          <path v-if="many && band" class="band" :d="band" />
          <g v-else class="ls">
            <g v-for="l in lines" :key="l.key"><path class="wl" :d="l.d" /><path class="hit" :d="l.d" @click="pick(l.key)"><title>{{ l.text }}</title></path></g>
          </g>
          <path v-if="hotPath" class="hotl" :d="hotPath" />
          <path class="avg" :d="avgPast" /><path class="avgn" :d="avgNext" />
          <path v-if="selPast" class="sel" :d="selPast" /><path v-if="selNext" class="seln" :d="selNext" />
          <circle v-for="(d, k) in selDots" :key="'d' + k" :cx="d.x" :cy="d.ok ? yOf(1) : plotB - 4" r="4" :class="d.ok ? 'dy' : 'dx'" />
          <line class="nl" :x1="xOf(nowT)" :y1="PT" :x2="xOf(nowT)" :y2="plotB" />
          <text class="nt" :x="xOf(nowT) + 4" :y="PT + 9">сейчас</text>
          <g v-if="hov && hov.n"><line class="hl" :x1="hov.x" :y1="PT" :x2="hov.x" :y2="plotB" /><circle class="hd2" :cx="hov.x" :cy="yOf(hov.avg)" r="4.5" /></g>
        </svg>
        <div v-if="hov && hov.n" class="tip" :style="{ left: Math.min(78, Math.max(4, hov.x / W * 100 - 12)) + '%' }">
          <b>{{ hovTxt }}</b><span>в среднем <b>{{ pct(hov.avg) }}%</b> · {{ hov.n }} {{ word(hov.n) }}</span>
          <span>ниже {{ pct(cfg.retention) }}%: <b>{{ hov.lowN }}</b><template v-if="hov.low.length"> — {{ hov.low.join(', ') }}{{ hov.lowN > 4 ? '…' : '' }}</template></span>
        </div>
      </div>
      <div class="leg">
        <span><i class="la" />в среднем<template v-if="!dock"> (пунктир — если не заниматься)</template></span>
        <span v-if="many"><i class="lb" />от слабых до сильных</span><span v-else><i class="lw" />каждое слово (нажми — выбрать)</span>
        <span><i class="ls2" />выбранное</span><span><i class="lr" />ответы по дням</span>
      </div>
      <button class="more" :aria-expanded="showList" @click="showList = !showList">Из чего «{{ pct(nowStat.avg) }}%» <span>{{ showList ? '▴' : '▾' }}</span></button>
      <div v-if="showList" class="lst">
        <p class="nt2">Среднее вероятности вспомнить по всем {{ words.length }} {{ word(words.length) }} с ответами (новые не считаются). Слабые — сверху.</p>
        <button v-for="r in list" :key="r.key" class="li" :class="{ on: selW && selW.key === r.key }" @click="pick(r.key)">
          <span class="lt">{{ r.text }}</span><span class="lbar"><i :class="r.st.failed ? 'bad' : r.r < cfg.retention ? 'bad' : r.r < cfg.retention + 0.04 ? 'mid' : 'ok'" :style="{ width: pct(r.r) + '%' }" /></span><b>{{ r.st.failed ? 'ошибка' : pct(r.r) + '%' }}</b>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mc { display: grid; gap: 8px; min-width: 0; padding: 12px; border-radius: 16px; background: var(--card, #fff); box-shadow: inset 0 0 0 1px #eef0f3 }
.hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap } .t { flex: 1; font-size: 15px; font-weight: 900 }
.seg { display: flex; gap: 3px; padding: 3px; border-radius: 12px; background: #f2f3f5 } .seg button { font: inherit; font-size: 12px; font-weight: 800; border: 0; border-radius: 9px; padding: 4px 10px; background: none; color: #5f6368; cursor: pointer } .seg button.on { background: #fff; color: #1278b0; box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.kps { display: flex; flex-wrap: wrap; gap: 6px }
.kp { display: grid; padding: 6px 11px; border-radius: 12px; background: #f4f6f8; line-height: 1.15; min-width: 0 } .kp small { font-size: 11px; font-weight: 800; color: var(--hint) } .kp b { font-size: 17px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.kp.av b { color: #7a4dde } .kp.bad b { color: #e53935 } .kp.sl b { color: #1c7ef6; max-width: 220px }
.fl { height: 0; overflow: hidden; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; border-radius: 10px; background: #fff; transition: height .2s; padding: 0 10px }
.fl.on { height: 30px; box-shadow: 0 0 0 1.5px #ff9600 } .fl i { flex: none; width: 9px; height: 9px; border-radius: 50% } .fl .y { background: #58cc02 } .fl .x { background: #ff4b4b }
.pw { position: relative }
.gr { width: 100%; height: auto; display: block; font-family: inherit; border-radius: 12px; background: #fff; box-shadow: inset 0 0 0 1px #eef0f3; cursor: crosshair }
.gr text { font-size: 10px; font-weight: 700; fill: #8a8f98 } .ax line { stroke: #dfe3e8 }
.ret { stroke: #ff9600; stroke-width: 1.2; stroke-dasharray: 5 4 } .gr .rett { fill: #e08600; font-weight: 800 }
.wl { fill: none; stroke: #b9c2cc; stroke-width: 1; opacity: .6 } .hit { fill: none; stroke: transparent; stroke-width: 8; cursor: pointer; pointer-events: stroke }
.ls g:hover .wl { stroke: #1c7ef6; opacity: 1; stroke-width: 2 }
.band { fill: #9b6bff; opacity: .13 }
.avg { fill: none; stroke: #9b6bff; stroke-width: 3.2; stroke-linejoin: round } .avgn { fill: none; stroke: #9b6bff; stroke-width: 3; stroke-dasharray: 3 6; stroke-linecap: round; opacity: .8 }
.sel { fill: none; stroke: #1c7ef6; stroke-width: 2.4; stroke-linejoin: round } .seln { fill: none; stroke: #1c7ef6; stroke-width: 2.2; stroke-dasharray: 2 5; stroke-linecap: round }
.hotl { fill: none; stroke: #ff9600; stroke-width: 3.2; animation: hl 1.1s ease-in-out 3 } @keyframes hl { 50% { stroke-width: 5; opacity: .6 } }
.dy { fill: #58cc02; stroke: #fff; stroke-width: 2 } .dx { fill: #ff4b4b; stroke: #fff; stroke-width: 2 }
.bo { fill: #58cc02; opacity: .8 } .bb { fill: #ff4b4b; opacity: .8 }
.nl { stroke: #2f2f2f; stroke-width: 1 } .gr .nt { fill: #2f2f2f; font-weight: 900 }
.hl { stroke: #9b6bff; stroke-width: 1; stroke-dasharray: 2 3 } .hd2 { fill: #fff; stroke: #9b6bff; stroke-width: 2.5 }
.tip { position: absolute; top: 8px; display: grid; gap: 2px; max-width: 280px; padding: 7px 10px; border-radius: 10px; background: #2f2f2f; color: #fff; font-size: 12px; font-weight: 600; pointer-events: none; box-shadow: 0 6px 18px rgba(0, 0, 0, .18) } .tip b { font-weight: 900 }
.leg { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; font-weight: 700; color: var(--hint) } .leg span { display: inline-flex; align-items: center; gap: 5px }
.leg i { display: inline-block; width: 16px; height: 0 } .la { border-top: 3px solid #9b6bff } .lw { border-top: 1.5px solid #b9c2cc } .ls2 { border-top: 2.5px solid #1c7ef6 } .lb { height: 8px !important; background: #e9e1ff } .lr { height: 8px !important; width: 8px !important; background: #58cc02; border-radius: 2px }
.more { all: unset; cursor: pointer; justify-self: start; font-size: 13px; font-weight: 800; color: #7a4dde } .more span { font-size: 11px }
.lst { display: grid; gap: 3px; max-height: 280px; overflow: auto }
.nt2 { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: var(--hint) }
.li { display: flex; align-items: center; gap: 10px; padding: 5px 8px; border: 0; border-radius: 9px; background: none; font: inherit; text-align: left; cursor: pointer } .li:hover { background: #f4f6f8 } .li.on { background: #eaf3ff }
.lt { width: 34%; min-width: 0; font-size: 13px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.lbar { flex: 1; height: 8px; border-radius: 99px; background: #eef0f3; overflow: hidden } .lbar i { display: block; height: 100% } .lbar .ok { background: #58cc02 } .lbar .mid { background: #ff9600 } .lbar .bad { background: #ff4b4b }
.li b { width: 54px; text-align: right; font-size: 13px; font-weight: 900 }
.em { margin: 0; font-size: 13px; color: var(--hint) }
</style>

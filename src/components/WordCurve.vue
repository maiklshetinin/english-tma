<script setup>
// «Слово сейчас»: кривая памяти одного слова по FSRS — как оно забывается между ответами, где ученик сейчас и когда повтор.
//  • сплошная линия с заливкой — было: после каждого ответа вероятность вспомнить 100 %, дальше тает по кривой забывания;
//    точки — ответы (зелёная — верно, красная — ошибка);
//  • пунктир — прогноз, если не повторять; после срока повтора — бледный пунктир: как пойдёт кривая, если ответить верно;
//  • оранжевая линия — «желаемое запоминание»: ниже — пора повторить (настройка «Алгоритм повторений»);
//  • «+1 час / +1 день / +3 дня» — посмотреть, что будет; масштаб «До повтора / Неделя / Месяц / Год».
// Расчёт — utils/review.ts (ts-fsrs), данные — запись словаря (f — память, hist — ответы).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { rate, recallAt, intervalOf } from '../utils/review'

const props = defineProps({
  item: { type: Object, required: true },             // запись Review (RItem)
  cfg: { type: Object, required: true },              // { retention, maxDays }
  fill: Boolean,                                      // в панели «Графики» курса — по высоте до низа окна
})
const DAY = 86_400_000, HOUR = 3_600_000
// размер — в настоящих пикселях (viewBox = ширина блока): подписи всегда 11 px, а не растут вместе с графиком
const PADL = 40, PADR = 10, PADB = 24, PADT = 22
const cw = ref(null), W = ref(600), H = ref(220)
function size() {
  const el = cw.value; if (!el) return
  const r = el.getBoundingClientRect(); if (!r.width) return
  W.value = Math.max(260, Math.round(r.width))
  const big = props.fill && typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches
  H.value = big ? Math.round(Math.max(240, Math.min(W.value * 1.2, innerHeight - r.top - 96))) : W.value < 420 ? 190 : 220      // в панели курса — до низа окна (снизу легенда и «Посмотреть, что будет»)
}
let ro = null
onMounted(() => { size(); addEventListener('resize', size); if (typeof ResizeObserver !== 'undefined') { let w0 = 0; ro = new ResizeObserver(([e]) => { if (Math.abs(e.contentRect.width - w0) > 1) { w0 = e.contentRect.width; size() } }) } if (cw.value) ro?.observe(cw.value) })
onUnmounted(() => { removeEventListener('resize', size); ro?.disconnect() })
watch(cw, (el) => { if (el) { size(); ro?.observe(el) } })
const zoom = ref('due'), shift = ref(0)
const gid = 'wcg' + Math.random().toString(36).slice(2)              // id заливки — своё у каждого графика
const ZOOMS = [['due', 'До повтора'], ['week', '7 дн'], ['month', '30 дн'], ['year', '1 год']]
const now = computed(() => Date.now() + shift.value)

// ответы по порядку и память после каждого (история хранится от новых к старым)
const answers = computed(() => {
  const out = []; let m
  for (const h of [...props.item.hist].reverse()) if (h.ok !== null) { m = rate(m, h.ok, h.t, props.cfg); out.push({ t: h.t, ok: h.ok, s: m.s }) }
  const f = props.item.f
  if (f && out.length) out[out.length - 1].s = f.s                       // последняя память — как в записи (история могла быть обрезана)
  if (f && !out.length) out.push({ t: f.last, ok: true, s: f.s })
  return out
})
const last = computed(() => answers.value.at(-1))
const due = computed(() => last.value ? last.value.t + intervalOf(last.value.s, props.cfg) * DAY : 0)
const after = computed(() => last.value ? rate({ s: last.value.s, d: props.item.f?.d ?? 5, last: last.value.t, n: answers.value.length, l: 0, st: 2 }, true, due.value, props.cfg).s : 0)
const recallNow = computed(() => last.value ? recallAt(last.value.s, (now.value - last.value.t) / DAY) : null)

// окно по времени
const range = computed(() => {
  const n = now.value
  if (zoom.value === 'due' && last.value) {
    const a = Math.min(last.value.t, n), b = Math.max(due.value, n), span = Math.max(b - a, HOUR)
    return [a - span * 0.06, b + span * 0.35]
  }
  const span = { week: 7, month: 30, year: 365, due: 7 }[zoom.value] * DAY
  return [n - span * 0.45, n + span * 0.55]
})
const xOf = (t) => PADL + (t - range.value[0]) / (range.value[1] - range.value[0]) * (W.value - PADL - PADR)

// вероятность в момент t: по последнему ответу до t; после срока повтора — «если ответить верно»
const rAt = (t, future) => {
  const a = answers.value.filter(x => x.t <= t).at(-1); if (!a) return null
  if (future && a === last.value && t > due.value) return recallAt(after.value, (t - due.value) / DAY)
  return recallAt(a.s, (t - a.t) / DAY)
}
const N = 160
const samples = computed(() => {
  const [a, b] = range.value, pts = []
  for (let k = 0; k <= N; k++) { const t = a + (b - a) * k / N; pts.push(t) }
  for (const x of answers.value) if (x.t > a && x.t < b) pts.push(x.t - 1, x.t)            // ступенька на ответе — вертикально
  if (due.value > a && due.value < b) pts.push(due.value, due.value + 1)
  if (now.value > a && now.value < b) pts.push(now.value)
  return pts.sort((p, q) => p - q)
})
// ось Y: от ~ниже минимума до 100 % (кривая FSRS-6 пологая — на шкале 0–100 % её почти не видно)
const y0 = computed(() => {
  let min = props.cfg.retention
  for (const t of samples.value) { const r = rAt(t, true); if (r != null) min = Math.min(min, r) }
  return Math.max(0, Math.min(Math.floor((min - 0.05) * 10) / 10, props.cfg.retention - 0.1))
})
const yOf = (r) => PADT + (1 - (r - y0.value) / (1 - y0.value)) * (H.value - PADB - PADT)
const path = (from, to, future) => {
  const pts = samples.value.filter(t => t >= from && t <= to).map(t => [t, rAt(t, future)]).filter(p => p[1] != null)
  return pts.length > 1 ? 'M' + pts.map(([t, r]) => `${xOf(t).toFixed(1)} ${yOf(r).toFixed(1)}`).join(' L') : ''
}
const first = computed(() => answers.value[0]?.t ?? 0)
const pastD = computed(() => path(first.value, Math.min(now.value, range.value[1]), false))
const pastFill = computed(() => pastD.value ? `${pastD.value} L${xOf(Math.min(now.value, range.value[1])).toFixed(1)} ${H.value - PADB} L${xOf(Math.max(first.value, range.value[0])).toFixed(1)} ${H.value - PADB} Z` : '')
const progD = computed(() => path(Math.max(now.value, first.value), Math.min(due.value, range.value[1]), false))
const nextD = computed(() => due.value < range.value[1] ? path(Math.max(due.value, now.value), range.value[1], true) : '')
const dots = computed(() => answers.value.filter(x => x.t >= range.value[0] && x.t <= range.value[1]).map(x => ({ x: xOf(x.t), y: x.ok ? yOf(1) : H.value - PADB - 4, ok: x.ok })))      // ошибка — точка внизу: «не вспомнил»
const ticks = computed(() => {
  const [a, b] = range.value, span = b - a, out = []
  const step = span <= 2 * DAY ? 6 * HOUR : span <= 10 * DAY ? DAY : span <= 45 * DAY ? 7 * DAY : 30 * DAY
  const fmt = (t) => step < DAY ? new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  let t = Math.ceil(a / step) * step
  for (; t < b && out.length < Math.max(3, Math.floor(W.value / 90)); t += step) out.push({ x: xOf(t), t: fmt(t) })
  return out
})
const yTicks = computed(() => { const n = H.value > 320 ? 4 : 2; return Array.from({ length: n + 1 }, (_, i) => 1 - (1 - y0.value) * i / n).map(r => ({ y: yOf(r), t: Math.round(r * 100) + '%' })) })
const rel = (t) => {
  const d = (t - now.value) / DAY
  if (d <= 0) return 'пора'
  if (d < 1) return `через ${Math.max(1, Math.round(d * 24))} ч`
  const n = Math.round(d); return n === 1 ? 'завтра' : `через ${n} дн`
}
const ago = computed(() => {
  if (!last.value) return ''
  const d = (now.value - last.value.t) / DAY
  return d < 1 / 24 ? 'только что' : d < 1 ? `${Math.round(d * 24)} ч назад` : `${Math.round(d)} дн назад`
})
const dueTxt = computed(() => `Повтор · ${new Date(due.value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`)
const nowY = computed(() => (failNow.value ? H.value - PADB - 4 : yOf(recallNow.value)))      // только что ошибся — точка «сейчас» внизу, рядом с ошибкой
const nowTxt = computed(() => failNow.value ? 'сейчас · ошибка' : `${shift.value ? 'будет' : 'сейчас'} ${Math.round((recallNow.value ?? 0) * 100)}%`)
// только что ошибся (до часа назад): «100 %» тут сбивает — показываем «не вспомнил»; дальше — обычная вероятность по кривой
const failNow = computed(() => !shift.value && lastAns.value && !lastAns.value.ok && fresh.value)
const lblW = (t) => t.length * 6.2                                      // ширина подписи (шрифт 11 px)
const lblX = (x, t) => Math.min(W.value - PADR - lblW(t) / 2, Math.max(PADL + lblW(t) / 2, x))      // по центру над линией, не вылезая за края
// последний ответ: память до него → после (после ошибки резко падает) — «100 % сейчас» без этого вводит в заблуждение
const dn = (d) => (d == null ? 'новое' : d < 1 ? `${Math.max(1, Math.round(d * 24))} ч` : d < 10 ? `${String(Math.round(d * 10) / 10).replace('.', ',')} дн` : `${Math.round(d)} дн`)
const lastAns = computed(() => { const a = answers.value; if (!a.length) return null; const x = a.at(-1); return { ok: x.ok, s: x.s, before: a.length > 1 ? a.at(-2).s : null } })
const fresh = computed(() => last.value && now.value - last.value.t < HOUR)
const tone = (r) => (r == null ? '' : r >= props.cfg.retention + 0.03 ? 'ok' : r >= props.cfg.retention ? 'mid' : 'bad')
</script>

<template>
  <div class="wc">
    <p v-if="!last" class="nt">Слово пока без ответов — кривая появится после первого проверенного ответа в уроке.</p>
    <template v-else>
      <!-- одна строка: слово (слот head) · показатели · масштаб справа -->
      <div class="top">
        <div v-if="$slots.head" class="hd"><slot name="head" /></div>
        <div class="kp" :class="failNow ? 'bad' : tone(recallNow)" :title="failNow ? 'Ответ был неверным — слово учится заново: память короткая, повтор скоро' : ''"><small>{{ failNow ? 'Сейчас' : 'Помнит сейчас' }}</small><b>{{ failNow ? 'не вспомнил' : Math.round(recallNow * 100) + '%' }}</b></div>
        <div v-if="lastAns" class="kp" :class="lastAns.ok ? 'ok' : 'bad'" :title="failNow ? 'Ошибка — слово учится заново, кривая начинается с короткой памятью' : ''"><small>{{ lastAns.ok ? 'Верно' : 'Ошибка' }} {{ ago }} · память</small><b>{{ dn(lastAns.before) }} → {{ dn(lastAns.s) }}</b></div>
        <div class="kp due" :class="{ bad: due <= now }"><small>Повторить</small><b>{{ rel(due) }}</b></div>
        <div class="seg" role="tablist" aria-label="Масштаб"><button v-for="[k, t] in ZOOMS" :key="k" role="tab" :aria-selected="zoom === k" :class="{ on: zoom === k }" @click="zoom = k">{{ t }}</button></div>
      </div>
      <div ref="cw" class="cw">
      <svg :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" class="gr" role="img" :aria-label="`Кривая памяти «${item.text}»: помнит сейчас ${Math.round(recallNow * 100)} %, повторить ${rel(due)}`">
        <defs><linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color: var(--se); stop-opacity: .16" /><stop offset="1" style="stop-color: var(--se); stop-opacity: 0" /></linearGradient></defs>
        <g class="ax">
          <g v-for="(t, k) in yTicks" :key="'y' + k"><line class="gl" :x1="PADL" :y1="t.y" :x2="W - PADR" :y2="t.y" /><text :x="PADL - 8" :y="t.y + 4" text-anchor="end">{{ t.t }}</text></g>
          <text v-for="(t, k) in ticks" :key="'x' + k" :x="t.x" :y="H - 6" text-anchor="middle">{{ t.t }}</text></g>
        <line class="ret" :x1="PADL" :y1="yOf(cfg.retention)" :x2="W - PADR" :y2="yOf(cfg.retention)" />
        <text class="rett" :x="PADL + 6" :y="yOf(cfg.retention) - 5">порог {{ Math.round(cfg.retention * 100) }}%</text>
        <path v-if="pastFill" :d="pastFill" :fill="`url(#${gid})`" />
        <path v-if="pastD" class="past" :d="pastD" />
        <path v-if="progD" class="prog" :d="progD" />
        <path v-if="nextD" class="next" :d="nextD" />
        <circle v-for="(d, k) in dots" :key="'d' + k" :cx="d.x" :cy="d.y" r="3.5" :class="d.ok ? 'dy' : 'dx'" />
        <g v-if="due > range[0] && due < range[1]"><line class="dl" :x1="xOf(due)" :y1="PADT - 4" :x2="xOf(due)" :y2="H - PADB" /><circle class="dd" :cx="xOf(due)" :cy="yOf(cfg.retention)" r="4" />
          <text class="dt" :x="lblX(xOf(due), dueTxt)" :y="PADT - 9" text-anchor="middle">{{ dueTxt }}</text></g>
        <g v-if="now > range[0] && now < range[1]"><line class="nl" :x1="xOf(now)" :y1="PADT - 4" :x2="xOf(now)" :y2="H - PADB" /><circle class="nd" :class="{ fail: failNow }" :cx="xOf(now)" :cy="nowY" r="4.5" />
          <text class="ntx" :x="lblX(xOf(now), nowTxt)" :y="PADT - 9" text-anchor="middle">{{ nowTxt }}</text></g>
      </svg>
      </div>
      <div class="leg"><span><i class="lpa" />Было</span><span><i class="lg" />Прогноз без повтора</span><span><i class="ln" />После повтора — забывается медленнее</span><span><i class="lr" />Верно</span><span><i class="lx" />Ошибка</span></div>
      <div class="sim"><span>Посмотреть, что будет</span><div class="sg"><button @click="shift += HOUR">+1 ч</button><button @click="shift += DAY">+1 дн</button><button @click="shift += 3 * DAY">+3 дн</button></div><button class="back" :disabled="!shift" @click="shift = 0">Сейчас</button></div>
    </template>
  </div>
</template>

<style scoped>
/* строгий вид, цвета — из переменных панели «Графики» (светлая / тёмная тема); без панели — светлые значения по умолчанию */
.wc { --bg: var(--g-bg, var(--card)); --tx: var(--g-tx, var(--text)); --mu: var(--g-mu, var(--hint)); --bd: var(--g-bd, var(--border)); --gd: var(--g-grid, var(--surface)); --sg: var(--g-seg, var(--surface)); --se: var(--g-sel, #2563eb); --th: #f59e0b;
  display: grid; gap: 8px; min-width: 0; color: var(--tx); font-variant-numeric: tabular-nums }
.top { display: flex; flex-wrap: wrap; align-items: flex-end; row-gap: 8px }
.hd { display: grid; min-width: 0; max-width: 34%; padding-right: 14px; border-right: 1px solid var(--bd) } .hd + .kp { border-left: 0 }
.kp { display: grid; gap: 2px; padding: 0 12px; border-left: 1px solid var(--bd); line-height: 1.2 } .kp:first-child { padding-left: 2px; border-left: 0 }
.kp small { font-size: 10.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--mu); white-space: nowrap } .kp b { font-size: 19px; font-weight: 600; white-space: nowrap }
.kp.ok b { color: #16a34a } .kp.mid b { color: #d97706 } .kp.bad b { color: #ef4444 } .kp.due b { color: var(--se) } .kp.due.bad b { color: #ef4444 }
.sub { font-size: 12px; color: var(--mu) }
.seg { display: flex; align-self: center; margin-left: auto; border: 1px solid var(--bd); border-radius: 6px; overflow: hidden }
.seg button { font: inherit; font-size: 12px; font-weight: 600; border: 0; padding: 4px 10px; background: none; color: var(--mu); cursor: pointer } .seg button + button { border-left: 1px solid var(--bd) } .seg button:hover { color: var(--tx) } .seg button.on { background: var(--sg); color: var(--tx) }
.cw { min-width: 0 }
.gr { display: block; max-width: 100%; font-family: inherit; overflow: visible }
.gr text { font-size: 11px; font-weight: 500; fill: var(--mu) } .gl { stroke: var(--gd) }
.ret { stroke: var(--th); stroke-width: 1; stroke-dasharray: 4 4 } .gr .rett { fill: var(--th); font-weight: 600 }
.past { fill: none; stroke: var(--se); stroke-width: 2; stroke-linejoin: round }
.prog { fill: none; stroke: var(--se); stroke-width: 2; stroke-dasharray: 5 4 }
.next { fill: none; stroke: var(--se); stroke-width: 1.5; stroke-dasharray: 2 4; opacity: .55 }
.dy { fill: #22c55e; stroke: var(--bg); stroke-width: 2 } .dx { fill: #ef4444; stroke: var(--bg); stroke-width: 2 }
.dl { stroke: var(--th); stroke-width: 1 } .dd { fill: var(--th); stroke: var(--bg); stroke-width: 2 } .gr .dt { fill: var(--th); font-weight: 600 }
.nl { stroke: var(--mu); stroke-width: 1; opacity: .7 } .nd { fill: var(--bg); stroke: var(--se); stroke-width: 2.5 } .nd.fail { stroke: #ef4444 } .gr .ntx { fill: var(--tx); font-weight: 600 }
.leg { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--mu) } .leg span { display: inline-flex; align-items: center; gap: 6px }
.leg i { display: inline-block; width: 18px; height: 4px; border-radius: 2px; background: var(--se) } .leg .lg { background: repeating-linear-gradient(90deg, var(--se) 0 5px, transparent 5px 8px) } .leg .ln { background: repeating-linear-gradient(90deg, var(--se) 0 5px, transparent 5px 8px); opacity: .5 }
.leg .lr, .leg .lx { width: 9px; height: 9px; border-radius: 50%; background: #22c55e } .leg .lx { background: #ef4444 }
.sim { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--mu) }
.sg { display: flex; border: 1px solid var(--bd); border-radius: 6px; overflow: hidden }
.sim button { font: inherit; font-size: 12px; font-weight: 600; border: 0; padding: 4px 10px; background: none; color: var(--tx); cursor: pointer } .sg button + button { border-left: 1px solid var(--bd) } .sim button:hover:not(:disabled) { background: var(--sg) }
.sim .back { border: 1px solid var(--bd); border-radius: 6px; color: var(--se) } .sim .back:disabled { opacity: .45; cursor: default }
.nt { margin: 0; font-size: 13px; color: var(--mu) }
</style>

<script setup>
// «Слово сейчас»: кривая памяти одного слова по FSRS — как оно забывается между ответами, где ученик сейчас и когда повтор.
//  • сплошная линия с заливкой — было: после каждого ответа вероятность вспомнить 100 %, дальше тает по кривой забывания;
//    точки — ответы (зелёная — верно, красная — ошибка);
//  • пунктир — прогноз, если не повторять; после срока повтора — бледный пунктир: как пойдёт кривая, если ответить верно;
//  • оранжевая линия — «желаемое запоминание»: ниже — пора повторить (настройка «Алгоритм повторений»);
//  • «+1 час / +1 день / +3 дня» — посмотреть, что будет; масштаб «До повтора / Неделя / Месяц / Год».
// Расчёт — utils/review.ts (ts-fsrs), данные — запись словаря (f — память, hist — ответы).
import { ref, computed } from 'vue'
import { rate, recallAt, intervalOf } from '../utils/review'

const props = defineProps({
  item: { type: Object, required: true },             // запись Review (RItem)
  cfg: { type: Object, required: true },              // { retention, maxDays }
})
const DAY = 86_400_000, HOUR = 3_600_000
const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 520px)').matches      // телефон: уже холст — крупнее подписи
const W = narrow ? 360 : 600, H = narrow ? 200 : 210, PADL = 36, PADB = 22
const zoom = ref('due'), shift = ref(0)
const gid = 'wcg' + Math.random().toString(36).slice(2)              // id заливки — своё у каждого графика
const ZOOMS = [['due', 'До повтора'], ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']]
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
const xOf = (t) => PADL + (t - range.value[0]) / (range.value[1] - range.value[0]) * (W - PADL - 8)

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
const yOf = (r) => 8 + (1 - (r - y0.value) / (1 - y0.value)) * (H - PADB - 8)
const path = (from, to, future) => {
  const pts = samples.value.filter(t => t >= from && t <= to).map(t => [t, rAt(t, future)]).filter(p => p[1] != null)
  return pts.length > 1 ? 'M' + pts.map(([t, r]) => `${xOf(t).toFixed(1)} ${yOf(r).toFixed(1)}`).join(' L') : ''
}
const first = computed(() => answers.value[0]?.t ?? 0)
const pastD = computed(() => path(first.value, Math.min(now.value, range.value[1]), false))
const pastFill = computed(() => pastD.value ? `${pastD.value} L${xOf(Math.min(now.value, range.value[1])).toFixed(1)} ${H - PADB} L${xOf(Math.max(first.value, range.value[0])).toFixed(1)} ${H - PADB} Z` : '')
const progD = computed(() => path(Math.max(now.value, first.value), Math.min(due.value, range.value[1]), false))
const nextD = computed(() => due.value < range.value[1] ? path(Math.max(due.value, now.value), range.value[1], true) : '')
const dots = computed(() => answers.value.filter(x => x.t >= range.value[0] && x.t <= range.value[1]).map(x => ({ x: xOf(x.t), y: yOf(1), ok: x.ok })))
const ticks = computed(() => {
  const [a, b] = range.value, span = b - a, out = []
  const step = span <= 2 * DAY ? 6 * HOUR : span <= 10 * DAY ? DAY : span <= 45 * DAY ? 7 * DAY : 30 * DAY
  const fmt = (t) => step < DAY ? new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  let t = Math.ceil(a / step) * step
  for (; t < b && out.length < 9; t += step) out.push({ x: xOf(t), t: fmt(t) })
  return out
})
const yTicks = computed(() => [1, (1 + y0.value) / 2, y0.value].map(r => ({ y: yOf(r), t: Math.round(r * 100) + '%' })))
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
const nowTxt = computed(() => `${shift.value ? 'Будет' : 'Сейчас'} · ${Math.round((recallNow.value ?? 0) * 100)}%`)
const pillW = (t) => t.length * 6.1 + 16                              // ширина «таблетки» под подпись (на глаз по шрифту 10–11 px)
const pillX = (x, t) => Math.min(W - pillW(t) - 2, Math.max(PADL, x - pillW(t) / 2))
const tone = (r) => (r == null ? '' : r >= props.cfg.retention + 0.03 ? 'ok' : r >= props.cfg.retention ? 'mid' : 'bad')
</script>

<template>
  <div class="wc">
    <p v-if="!last" class="nt">Слово пока без ответов — кривая появится после первого проверенного ответа в уроке.</p>
    <template v-else>
      <div class="top">
        <div class="kp" :class="tone(recallNow)"><small>Помнит сейчас</small><b>{{ Math.round(recallNow * 100) }}%</b></div>
        <div class="kp due" :class="{ bad: due <= now }"><small>Повторить</small><b>{{ rel(due) }}</b></div>
        <span class="sub">последний ответ {{ ago }} · память ~{{ last.s < 10 ? (Math.round(last.s * 10) / 10).toString().replace('.', ',') : Math.round(last.s) }} дн</span>
      </div>
      <div class="seg" role="tablist" aria-label="Масштаб"><button v-for="[k, t] in ZOOMS" :key="k" role="tab" :aria-selected="zoom === k" :class="{ on: zoom === k }" @click="zoom = k">{{ t }}</button></div>
      <svg :viewBox="`0 0 ${W} ${H}`" class="gr" role="img" :aria-label="`Кривая памяти «${item.text}»: помнит сейчас ${Math.round(recallNow * 100)} %, повторить ${rel(due)}`">
        <defs><linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1cb0f6" stop-opacity=".28" /><stop offset="1" stop-color="#1cb0f6" stop-opacity="0" /></linearGradient></defs>
        <g class="ax"><line :x1="PADL" :y1="H - PADB" :x2="W" :y2="H - PADB" />
          <text v-for="(t, k) in yTicks" :key="'y' + k" :x="PADL - 6" :y="t.y + 3" text-anchor="end">{{ t.t }}</text>
          <g v-for="(t, k) in ticks" :key="'x' + k"><line :x1="t.x" :y1="H - PADB" :x2="t.x" :y2="H - PADB + 4" /><text :x="t.x" :y="H - 6" text-anchor="middle">{{ t.t }}</text></g></g>
        <line class="ret" :x1="PADL" :y1="yOf(cfg.retention)" :x2="W" :y2="yOf(cfg.retention)" />
        <text class="rett" :x="PADL + 4" :y="yOf(cfg.retention) - 4">ниже {{ Math.round(cfg.retention * 100) }}% — пора повторить</text>
        <path v-if="pastFill" :d="pastFill" :fill="`url(#${gid})`" />
        <path v-if="pastD" class="past" :d="pastD" />
        <path v-if="progD" class="prog" :d="progD" />
        <path v-if="nextD" class="next" :d="nextD" />
        <circle v-for="(d, k) in dots" :key="'d' + k" :cx="d.x" :cy="d.y" r="4.5" :class="d.ok ? 'dy' : 'dx'" />
        <g v-if="due > range[0] && due < range[1]"><line class="dl" :x1="xOf(due)" y1="8" :x2="xOf(due)" :y2="H - PADB" /><circle class="dd" :cx="xOf(due)" :cy="yOf(cfg.retention)" r="5" />
          <g :transform="`translate(${pillX(xOf(due), dueTxt)} 6)`"><rect class="dp" :width="pillW(dueTxt)" height="18" rx="9" /><text class="dt" :x="pillW(dueTxt) / 2" y="12.5" text-anchor="middle">{{ dueTxt }}</text></g></g>
        <g v-if="now > range[0] && now < range[1]"><line class="nl" :x1="xOf(now)" y1="26" :x2="xOf(now)" :y2="H - PADB" /><circle class="nd" :cx="xOf(now)" :cy="yOf(recallNow)" r="5.5" />
          <g :transform="`translate(${pillX(xOf(now), nowTxt)} ${Math.max(28, yOf(recallNow) - 30)})`"><rect class="np" :width="pillW(nowTxt)" height="19" rx="9.5" /><text class="ntx" :x="pillW(nowTxt) / 2" y="13" text-anchor="middle">{{ nowTxt }}</text></g></g>
      </svg>
      <div class="leg"><span><i class="lp" />было</span><span><i class="lg" />прогноз, если не повторять</span><span><i class="ln" />после повтора — забывается медленнее</span><span><i class="lr" />ответ верно</span><span><i class="lx" />ошибка</span></div>
      <div class="sim">Посмотреть, что будет:<button @click="shift += HOUR">+1 час</button><button @click="shift += DAY">+1 день</button><button @click="shift += 3 * DAY">+3 дня</button><button class="back" :disabled="!shift" @click="shift = 0">Вернуться в сейчас</button></div>
    </template>
  </div>
</template>

<style scoped>
.wc { display: grid; gap: 10px; min-width: 0 }
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px }
.kp { display: grid; padding: 6px 12px; border-radius: 12px; background: #f4f6f8; line-height: 1.15 } .kp small { font-size: 11px; font-weight: 800; color: var(--hint) } .kp b { font-size: 19px; font-weight: 900 }
.kp.ok b { color: #46a302 } .kp.mid b { color: #e08600 } .kp.bad b { color: #e53935 } .kp.due b { color: #1278b0 } .kp.due.bad b { color: #e53935 }
.sub { font-size: 12px; font-weight: 700; color: var(--hint) }
.seg { display: flex; gap: 3px; padding: 3px; border-radius: 12px; background: #f2f3f5; justify-self: start; flex-wrap: wrap }
.seg button { font: inherit; font-size: 12.5px; font-weight: 800; border: 0; border-radius: 9px; padding: 5px 11px; background: none; color: #5f6368; cursor: pointer } .seg button.on { background: #fff; color: #1278b0; box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.gr { width: 100%; height: auto; font-family: inherit; border-radius: 12px; background: #fff; box-shadow: inset 0 0 0 1px #eef0f3 }
.gr text { font-size: 10px; font-weight: 700; fill: #8a8f98 } .ax line { stroke: #dfe3e8 }
.ret { stroke: #ff9600; stroke-width: 1.2; stroke-dasharray: 5 4 } .gr .rett { fill: #e08600; font-weight: 800 }
.past { fill: none; stroke: #1c7ef6; stroke-width: 2.6; stroke-linejoin: round }
.prog { fill: none; stroke: #1c7ef6; stroke-width: 2.4; stroke-dasharray: 2 5; stroke-linecap: round }
.next { fill: none; stroke: #8cc9f7; stroke-width: 2; stroke-dasharray: 2 5; stroke-linecap: round }
.dy { fill: #58cc02; stroke: #fff; stroke-width: 2 } .dx { fill: #ff4b4b; stroke: #fff; stroke-width: 2 }
.dl { stroke: #ff9600; stroke-width: 1.2 } .dp { fill: #fff1e0; stroke: #ffd29a } .np { fill: #2f2f2f } .dd { fill: #ff9600; stroke: #fff; stroke-width: 2 } .gr .dt { fill: #e08600; font-weight: 900 }
.nl { stroke: #2f2f2f; stroke-width: 1 } .nd { fill: #fff; stroke: #1c7ef6; stroke-width: 3 } .gr .ntx { fill: #fff; font-weight: 900; font-size: 11px }
.leg { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; font-weight: 700; color: var(--hint) } .leg span { display: inline-flex; align-items: center; gap: 5px }
.leg i { display: inline-block; width: 16px; height: 0; border-top: 2.5px solid #1c7ef6 } .leg .lg { border-top-style: dotted } .leg .ln { border-top: 2.5px dotted #8cc9f7 }
.leg .lr, .leg .lx { width: 9px; height: 9px; border: 0; border-radius: 50%; background: #58cc02 } .leg .lx { background: #ff4b4b }
.sim { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 800; color: #555 }
.sim button { font: inherit; font-size: 12.5px; font-weight: 800; border: 0; border-radius: 10px; padding: 6px 11px; background: #f2f3f5; color: #2f2f2f; cursor: pointer }
.sim .back { background: #fff; color: #1278b0; box-shadow: inset 0 0 0 1.5px #1cb0f6 } .sim .back:disabled { opacity: .45; cursor: default }
.nt { margin: 0; font-size: 13px; color: var(--hint); font-weight: 600 }
</style>

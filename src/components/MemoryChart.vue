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
const ZOOMS = [['day', '24 ч', 0.6, 0.4], ['week', '7 дн', 5, 2], ['month', '30 дн', 21, 9]]   // [id, подпись, дней назад, дней вперёд]
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
// размер — в настоящих пикселях (viewBox = ширина блока): подписи всегда 11 px, как в Grafana / DevTools, а не растут с графиком
const PL = 40, PR = 12, PB = 36, PT = 14, BARH = 8
const pw = ref(null), W = ref(640), H = ref(props.tall ? 330 : 240)
function size() {
  const el = pw.value; if (!el) return
  const r = el.getBoundingClientRect(); if (!r.width) return
  W.value = Math.max(280, Math.round(r.width))
  const big = props.dock && typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches
  H.value = big ? Math.round(Math.max(240, Math.min(W.value * 1.3, innerHeight - r.top - 64)))          // панель «Графики» курса — до низа окна
    : props.tall ? 330 : W.value < 480 ? 210 : 240
}
let ro = null
onMounted(() => { size(); addEventListener('resize', size); if (typeof ResizeObserver !== 'undefined') { let w0 = 0; ro = new ResizeObserver(([e]) => { if (Math.abs(e.contentRect.width - w0) > 1) { w0 = e.contentRect.width; size() } }); pw.value && ro.observe(pw.value) } })
onUnmounted(() => { removeEventListener('resize', size); ro?.disconnect() })
watch(pw, (el) => { if (el) { size(); ro?.observe(el) } })
const N = 140
const ts = computed(() => { const [a, b] = range.value, out = []; for (let k = 0; k <= N; k++) out.push(a + (b - a) * k / N); return out })
const xOf = (t) => PL + (t - range.value[0]) / (range.value[1] - range.value[0]) * (W.value - PL - PR)
const svg = ref(null)
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
  return out.map(o => { const x0 = Math.max(PL, xOf(o.t)), x1 = Math.min(W.value - PR, xOf(o.t + step) - 1); return { ...o, x: x0, w: Math.max(2, x1 - x0), max } }).filter(o => o.w > 2)
})
const ticks = computed(() => {
  const [a, b] = range.value, step = zoom.value === 'day' ? 4 * HOUR : zoom.value === 'week' ? DAY : 7 * DAY, out = []
  let t = zoom.value === 'day' ? Math.ceil(a / step) * step : (() => { const d = new Date(a); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.getTime() })()
  for (; t < b && out.length < Math.max(3, Math.floor(W.value / 90)); t += step) out.push({ x: xOf(t), t: zoom.value === 'day' ? new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) })
  return out
})
const yTicks = computed(() => { const n = H.value > 320 ? 4 : 2; return Array.from({ length: n + 1 }, (_, i) => 1 - (1 - y0.value) * i / n).map(r => ({ y: yOf(r), t: Math.round(r * 100) + '%' })) })

// цифры «сейчас»
const nowStat = computed(() => { const rs = words.value.map(w => rAt(w, nowT.value)).filter(r => r != null); return { n: rs.length, avg: rs.length ? rs.reduce((p, q) => p + q, 0) / rs.length : null, below: rs.filter(r => r < props.cfg.retention).length } })
const today = computed(() => { const d = new Date(nowT.value); d.setHours(0, 0, 0, 0); let n = 0; for (const w of words.value) for (const x of w.ans) if (x.t >= d.getTime()) n++; return n })

// ── наведение: подсказка за момент ──
const hov = ref(null)
function move(e) {
  const r = svg.value?.getBoundingClientRect(); if (!r) return
  const x = (e.clientX - r.left) / r.width * W.value; if (x < PL || x > W.value - PR) { hov.value = null; return }
  const t = range.value[0] + (x - PL) / (W.value - PL - PR) * (range.value[1] - range.value[0])
  const rs = words.value.map(w => ({ w, r: rAt(w, t) })).filter(o => o.r != null)
  if (!rs.length) { hov.value = { x, t, n: 0 }; return }
  const avg = rs.reduce((p, o) => p + o.r, 0) / rs.length
  const low = rs.filter(o => o.r < props.cfg.retention).sort((a, b) => a.r - b.r)
  hov.value = { x, t, n: rs.length, avg, sel: selW.value ? rAt(selW.value, t) : null, low: low.slice(0, 4).map(o => `${o.w.text} ${Math.round(o.r * 100)}%`), lowN: low.length }
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
// подписи у концов линий (справа): в среднем и выбранное — чтобы не бегать глазами в легенду
const endLbl = computed(() => {
  const t = range.value[1], out = []
  const a = stats.value.filter(s => s.n).at(-1); if (a) out.push({ k: 'avg', y: yOf(a.avg), t: `в среднем ${pct(a.avg)}%` })
  if (selW.value) { const r = rAt(selW.value, t); if (r != null) out.push({ k: 'sel', y: yOf(r), t: `${selW.value.text} ${pct(r)}%` }) }
  if (out.length === 2 && Math.abs(out[0].y - out[1].y) < 14) { const up = out[0].y <= out[1].y ? 0 : 1; out[up].y -= 7; out[1 - up].y += 7 }
  return out.map(o => ({ ...o, y: Math.min(plotB.value - 4, Math.max(PT + 10, o.y - 6)) }))
})
const hotPath = computed(() => { const w = words.value.find(x => x.key === hot.value); return w ? toPath(wordPts(w)) : '' })

// «Из чего число»: слова и их процент сейчас
const showList = ref(false)
const list = computed(() => words.value.map(w => ({ key: w.key, text: w.text, r: rAt(w, nowT.value), st: stateOf(props.items[w.key], nowT.value, props.cfg) })).sort((a, b) => a.r - b.r))
const pct = (r) => Math.round(r * 100)
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов')
</script>

<template>
  <div class="mc" :class="{ dock }">
    <!-- одна строка, как у «Слово сейчас»: название · показатели · масштаб справа -->
    <div class="kps">
      <div v-if="!$slots.tabs" class="hd"><b class="t">Память словаря</b><span class="sub">вероятность вспомнить · FSRS</span></div>
      <template v-if="words.length">
        <div class="kp"><small>В среднем</small><b>{{ pct(nowStat.avg) }}%</b></div>
        <div class="kp" :class="{ bad: nowStat.below }"><small>Ниже порога {{ pct(cfg.retention) }}%</small><b>{{ nowStat.below }} {{ word(nowStat.below) }}</b></div>
        <div class="kp"><small>Ответов сегодня</small><b>{{ today }}</b></div>
        <div v-if="selW" class="kp sl"><small>Выбрано</small><b><span>{{ selW.text }}</span> {{ pct(rAt(selW, nowT)) }}%</b></div>
      </template>
      <div class="kr"><slot name="tabs" />
        <div class="seg" role="tablist" aria-label="Масштаб"><button v-for="z in ZOOMS" :key="z[0]" role="tab" :aria-selected="zoom === z[0]" :class="{ on: zoom === z[0] }" @click="zoom = z[0]">{{ z[1] }}</button></div></div>
    </div>
    <p v-if="!words.length" class="em">Пока пусто — график появится после первого проверенного ответа в уроке.</p>
    <template v-else>
      <div class="fl" :class="{ on: flash }" aria-live="polite"><template v-if="flash"><i :class="flash.ok ? 'y' : 'x'" /><b>{{ flash.text }}</b> · {{ flash.ok ? 'верно' : 'ошибка' }} — память слова обновлена<template v-if="flash.d != null && flash.d !== 0">, в среднем {{ flash.d > 0 ? '+' : '' }}{{ String(flash.d).replace('.', ',') }}%</template></template></div>
      <div ref="pw" class="pw">
        <svg ref="svg" :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" class="gr" role="img" :aria-label="`Память словаря: в среднем ${pct(nowStat.avg)} %, ниже порога ${nowStat.below}`" @mousemove="move" @mouseleave="hov = null">
          <g class="ax">
            <g v-for="(t, k) in yTicks" :key="'y' + k"><line class="gl" :x1="PL" :y1="t.y" :x2="W - PR" :y2="t.y" /><text :x="PL - 8" :y="t.y + 4" text-anchor="end">{{ t.t }}</text></g>
            <text v-for="(t, k) in ticks" :key="'x' + k" :x="t.x" :y="H - 8" text-anchor="middle">{{ t.t }}</text>
          </g>
          <!-- ответы: тонкая полоска отметок под осью (зелёный — верно, красный — ошибка) -->
          <g class="bars"><g v-for="(b, k) in bars" :key="'b' + k"><rect v-if="b.ok" :x="b.x" :y="plotB + 3" :width="b.w" :height="Math.max(2, b.ok / b.max * BARH)" class="bo"><title>{{ b.ok }} верно</title></rect><rect v-if="b.bad" :x="b.x" :y="plotB + 3 + (b.ok ? Math.max(2, b.ok / b.max * BARH) : 0)" :width="b.w" :height="Math.max(2, b.bad / b.max * BARH)" class="bb"><title>{{ b.bad }} ошибок</title></rect></g></g>
          <line class="ret" :x1="PL" :y1="yOf(cfg.retention)" :x2="W - PR" :y2="yOf(cfg.retention)" />
          <text class="rett" :x="PL + 6" :y="yOf(cfg.retention) - 5">порог {{ pct(cfg.retention) }}%</text>
          <path v-if="many && band" class="band" :d="band" />
          <g v-else class="ls">
            <g v-for="l in lines" :key="l.key"><path class="wl" :d="l.d" /><path class="hit" :d="l.d" @click="pick(l.key)"><title>{{ l.text }}</title></path></g>
          </g>
          <path v-if="hotPath" class="hotl" :d="hotPath" />
          <path class="avg" :d="avgPast" /><path class="avgn" :d="avgNext" />
          <path v-if="selPast" class="sel" :d="selPast" /><path v-if="selNext" class="seln" :d="selNext" />
          <circle v-for="(d, k) in selDots" :key="'d' + k" :cx="d.x" :cy="d.ok ? yOf(1) : plotB - 4" r="3.5" :class="d.ok ? 'dy' : 'dx'" />
          <line class="nl" :x1="xOf(nowT)" :y1="PT" :x2="xOf(nowT)" :y2="plotB" />
          <text class="nt" :x="xOf(nowT) + 5" :y="PT + 8">сейчас</text>
          <text v-for="l in endLbl" :key="l.k" class="el" :class="l.k" :x="W - PR - 2" :y="l.y" text-anchor="end">{{ l.t }}</text>
          <g v-if="hov && hov.n"><line class="hl" :x1="hov.x" :y1="PT" :x2="hov.x" :y2="plotB" /><circle class="hda" :cx="hov.x" :cy="yOf(hov.avg)" r="4" /><circle v-if="hov.sel != null" class="hds" :cx="hov.x" :cy="yOf(hov.sel)" r="4" /></g>
        </svg>
        <div v-if="hov && hov.n" class="tip" :style="hov.x > W - 230 ? { right: (W - hov.x + 12) + 'px' } : { left: (hov.x + 12) + 'px' }">
          <small>{{ hovTxt }}</small>
          <span><i class="ca" />В среднем<b>{{ pct(hov.avg) }}%</b></span>
          <span v-if="hov.sel != null"><i class="cs" />{{ selW.text }}<b>{{ pct(hov.sel) }}%</b></span>
          <span><i class="cb" />Ниже порога<b>{{ hov.lowN }} из {{ hov.n }}</b></span>
          <em v-if="hov.low.length">{{ hov.low.join(' · ') }}{{ hov.lowN > 4 ? '…' : '' }}</em>
        </div>
      </div>
      <div class="leg">
        <span><i class="la" />В среднем</span>
        <span><i class="ls2" />Выбранное слово</span>
        <span v-if="many"><i class="lb" />От слабых до сильных</span><span v-else><i class="lw" />Остальные слова — нажми, чтобы выбрать</span>
        <span><i class="lfc" />Прогноз без повтора</span>
        <button class="more" :aria-expanded="showList" @click="showList = !showList">Таблица {{ showList ? '▴' : '›' }}</button>
      </div>
      <div v-if="showList" class="lst">
        <p class="nt2">Среднее вероятности вспомнить по {{ words.length }} {{ word(words.length) }} с ответами (новые не считаются). Слабые — сверху.</p>
        <button v-for="r in list" :key="r.key" class="li" :class="{ on: selW && selW.key === r.key }" @click="pick(r.key)">
          <span class="lt">{{ r.text }}</span><span class="lbar"><i :class="r.st.failed ? 'bad' : r.r < cfg.retention ? 'bad' : r.r < cfg.retention + 0.04 ? 'mid' : 'ok'" :style="{ width: pct(r.r) + '%' }" /></span><b>{{ r.st.failed ? 'ошибка' : pct(r.r) + '%' }}</b>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* строгий вид, как в профессиональных программах; цвета — из переменных панели (светлая / тёмная тема, CourseViewer .rvd) */
.mc { --bg: var(--g-bg, var(--card)); --tx: var(--g-tx, var(--text)); --mu: var(--g-mu, var(--hint)); --bd: var(--g-bd, var(--border)); --gd: var(--g-grid, var(--surface)); --sg: var(--g-seg, var(--surface)); --su: var(--g-sub, var(--surface));
  --av: var(--g-avg, #7c3aed); --se: var(--g-sel, #2563eb); --th: #f59e0b;
  display: grid; gap: 10px; min-width: 0; padding: 12px 14px 12px; border-radius: 8px; background: var(--bg); color: var(--tx); border: 1px solid var(--bd); font-variant-numeric: tabular-nums }
/* шапка — одна строка, одинаковая с «Слово сейчас» (WordCurve): название 16 px + подпись, показатели, масштаб справа */
.hd { display: grid; min-width: 0; padding-right: 14px; border-right: 1px solid var(--bd) } .hd + .kp { border-left: 0 } .t { font-size: 16px; font-weight: 700; line-height: 1.2; white-space: nowrap } .sub { font-size: 11.5px; font-weight: 500; color: var(--mu); white-space: nowrap }
.seg { display: flex; align-self: center; margin-left: auto; border: 1px solid var(--bd); border-radius: 6px; overflow: hidden }
.seg button { font: inherit; font-size: 12px; font-weight: 600; border: 0; padding: 4px 10px; background: none; color: var(--mu); cursor: pointer } .seg button + button { border-left: 1px solid var(--bd) }
.seg button:hover { color: var(--tx) } .seg button.on { background: var(--sg); color: var(--tx) }
.kps { display: flex; flex-wrap: wrap; align-items: flex-end; row-gap: 8px }
.kr { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; align-self: center; margin-left: auto } .kr .seg { margin-left: 0 }
/* Review (в шапке — вкладки графиков): всё в одну строку; тесно — сжимается «Выбрано» */
@media (min-width: 760px) { .kps:has(.kr > :nth-child(2)) { flex-wrap: nowrap } .kps:has(.kr > :nth-child(2)) .kp { flex: none } .kps:has(.kr > :nth-child(2)) .kp.sl { flex: 0 1 auto; min-width: 0; overflow: hidden } .kps:has(.kr > :nth-child(2)) .kp.sl b { overflow: hidden; text-overflow: ellipsis } }
.kp { display: grid; gap: 2px; padding: 0 12px; border-left: 1px solid var(--bd); min-width: 0 } .kp:first-child { padding-left: 2px; border-left: 0 }
.kp small { font-size: 10.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--mu); white-space: nowrap } .kp b { font-size: 19px; font-weight: 600; line-height: 1.2; white-space: nowrap }
.kp.bad b { color: #ef4444 } .kp.sl b span { color: var(--se); display: inline-block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom }
.fl { height: 0; overflow: hidden; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; border-radius: 6px; background: var(--su); transition: height .2s; padding: 0 10px }
.fl.on { height: 26px } .fl b { font-weight: 700 } .fl i { flex: none; width: 7px; height: 7px; border-radius: 50% } .fl .y { background: #22c55e } .fl .x { background: #ef4444 }
.pw { position: relative; min-width: 0 }
.gr { display: block; max-width: 100%; font-family: inherit; cursor: crosshair; overflow: visible }
.gr text { font-size: 11px; font-weight: 500; fill: var(--mu) } .gl { stroke: var(--gd); stroke-width: 1 }
.ret { stroke: var(--th); stroke-width: 1; stroke-dasharray: 4 4 } .gr .rett { fill: var(--th); font-weight: 600 }
.wl { fill: none; stroke: var(--mu); stroke-width: 1; opacity: .3 } .hit { fill: none; stroke: transparent; stroke-width: 9; cursor: pointer; pointer-events: stroke }
.ls g:hover .wl { stroke: var(--se); opacity: 1; stroke-width: 1.5 }
.band { fill: var(--av); opacity: .12 }
.avg { fill: none; stroke: var(--av); stroke-width: 2; stroke-linejoin: round } .avgn { fill: none; stroke: var(--av); stroke-width: 2; stroke-dasharray: 5 4; opacity: .75 }
.sel { fill: none; stroke: var(--se); stroke-width: 2; stroke-linejoin: round } .seln { fill: none; stroke: var(--se); stroke-width: 2; stroke-dasharray: 5 4; opacity: .75 }
.hotl { fill: none; stroke: var(--th); stroke-width: 2; animation: hl 1.1s ease-in-out 3 } @keyframes hl { 50% { opacity: .35 } }
.dy { fill: #22c55e; stroke: var(--bg); stroke-width: 2 } .dx { fill: #ef4444; stroke: var(--bg); stroke-width: 2 }
.bo { fill: #22c55e; opacity: .7 } .bb { fill: #ef4444; opacity: .7 }
.nl { stroke: var(--mu); stroke-width: 1; opacity: .7 } .gr .nt { font-weight: 600 }
.gr .el { font-weight: 600; fill: var(--tx); paint-order: stroke; stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round }
.hl { stroke: var(--mu); stroke-width: 1; stroke-dasharray: 2 3 } .hda { fill: var(--av); stroke: var(--bg); stroke-width: 2 } .hds { fill: var(--se); stroke: var(--bg); stroke-width: 2 }
.tip { position: absolute; top: 10px; z-index: 2; display: grid; gap: 4px; width: 200px; padding: 8px 10px; border-radius: 6px; background: var(--bg); border: 1px solid var(--bd); box-shadow: 0 6px 20px rgba(0, 0, 0, .14); font-size: 12px; pointer-events: none }
.tip small { font-size: 11px; color: var(--mu) } .tip span { display: flex; align-items: center; gap: 6px } .tip span b { margin-left: auto; font-weight: 700 }
.tip i { flex: none; width: 8px; height: 8px; border-radius: 50% } .tip .ca { background: var(--av) } .tip .cs { background: var(--se) } .tip .cb { background: var(--th) }
.tip em { font-style: normal; font-size: 11px; color: var(--mu); line-height: 1.35 }
.leg { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; font-size: 12px; color: var(--mu) } .leg span { display: inline-flex; align-items: center; gap: 6px }
/* значки легенды — плотные полоски 18×4, чтобы цвет читался */
.leg i { display: inline-block; width: 18px; height: 4px; border-radius: 2px } .la { background: var(--av) } .lw { background: var(--mu); opacity: .45; height: 2px !important } .ls2 { background: var(--se) } .lfc { background: repeating-linear-gradient(90deg, var(--mu) 0 5px, transparent 5px 8px) } .lb { height: 8px !important; background: var(--av); opacity: .2 }
.more { all: unset; cursor: pointer; margin-left: auto; font-size: 12px; font-weight: 600; color: var(--se) }
.lst { display: grid; gap: 2px; max-height: 280px; overflow: auto; border-top: 1px solid var(--bd); padding-top: 8px }
.nt2 { margin: 0 0 4px; font-size: 12px; color: var(--mu) }
.li { display: flex; align-items: center; gap: 10px; padding: 5px 8px; border: 0; border-radius: 4px; background: none; font: inherit; color: var(--tx); text-align: left; cursor: pointer } .li:hover { background: var(--su) } .li.on { background: var(--sg) }
.lt { width: 34%; min-width: 0; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.lbar { flex: 1; height: 6px; border-radius: 3px; background: var(--gd); overflow: hidden } .lbar i { display: block; height: 100% } .lbar .ok { background: #22c55e } .lbar .mid { background: var(--th) } .lbar .bad { background: #ef4444 }
.li b { width: 54px; text-align: right; font-size: 12.5px; font-weight: 600 }
.em { margin: 0; font-size: 13px; color: var(--mu) }
</style>

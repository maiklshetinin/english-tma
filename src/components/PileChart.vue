<script setup>
// Общий график «где сейчас слова» — стопки карточек по времени до повтора (колоды и Review — один компонент).
//  • Каждое слово — мини-карточка (фото слова или текст), в стопке своего отрезка: «Сутки» (по часам), «Неделя», «Месяц»
//    (по дням), «Год» (по месяцам), последний столбик — «позже». Отрезки считаются от «сейчас» — со временем стопки едут влево.
//  • Наведение на столбик (на телефоне — нажатие) — подсказка поверх графика со словами; нажатый столбик держит её открытой.
//    Содержимое подсказки — слот tip (колода показывает очередь и историю), по умолчанию — список: слово, перевод, «когда».
//  • fresh — слово, которое только что получило ответ: падает в свою стопку и подсвечивается.
//  • Курсор — веник: провёл по стопкам — карточки подпрыгивают (физика), подсказка не мешает.
// Слово (items[]): { id, front, back?, image?, k — вид (цвет и порядок в стопке), at — когда придёт (мс), zero? — всегда в «сейчас»,
//   when? — подпись справа в подсказке }.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { imageSrc } from '../utils/media'

const props = defineProps({
  items: { type: Array, required: true },
  dock: Boolean,                                       // компактно (сверху сессии / урока)
  tall: Boolean,                                       // высокий (Review: шапка ужата, график главный)
  fresh: { type: String, default: null },              // id слова, которое только что «ушло»
  order: { type: Array, default: () => ['mature', 'strong', 'review', 'medium', 'learn', 'weak'] },      // снизу вверх в стопке
  noun: { type: Array, default: () => ['слово', 'слова', 'слов'] },
})
const emit = defineEmits(['pick', 'unpin'])

const now = ref(Date.now()); let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 1000) }); onUnmounted(() => clearInterval(clock))
const HOUR = 3_600_000, DAY = 86_400_000

// ── Масштаб ──
const SCALES = [
  { id: 'day', t: 'Сутки', n: 24 },        // сейчас + 23 часа по часу + «позже»
  { id: 'week', t: 'Неделя', n: 8 },       // сегодня + 7 дней + «позже»
  { id: 'month', t: 'Месяц', n: 31 },      // сегодня + 30 дней + «позже»
  { id: 'year', t: 'Год', n: 13 },         // этот месяц + 12 + «позже»
]
const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v) } catch { return null } }
const saved = store('tma.chartScale')
const scale = ref(SCALES.some(s => s.id === saved) ? saved : 'month')
const sc = computed(() => SCALES.find(s => s.id === scale.value))

const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const dayDiff = (t) => Math.round((dayStart(t) - dayStart(now.value)) / DAY)
const monthDiff = (t) => { const a = new Date(now.value), b = new Date(t); return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() }
/** В какой столбик попадает слово (0 — «сейчас», n — «позже») */
function binOf(r) {
  const n = sc.value.n
  if (scale.value === 'day') { const d = r.at - now.value; return d <= 0 ? 0 : Math.min(n, Math.floor(d / HOUR) + 1) }
  if (r.zero) return 0
  return Math.min(n, Math.max(0, scale.value === 'year' ? monthDiff(r.at) : dayDiff(r.at)))
}
const bins = computed(() => {
  const out = Array.from({ length: sc.value.n + 1 }, (_, i) => ({ i, items: [] }))
  for (const r of props.items) out[binOf(r)].items.push(r)
  for (const b of out) b.items.sort((a, z) => a.at - z.at)
  return out
})
// Стопка: каждое слово — мини-карточка 3:2, лежат друг на друге чуть вразнобой; самая высокая стопка влезает в график.
const BMAX = computed(() => wide.value ? (props.tall ? 330 : 210) : props.tall && !narrow.value ? 220 : props.dock && narrow.value ? 52 : props.dock ? 110 : 120)
const pileMax = computed(() => Math.max(1, ...bins.value.slice(0, -1).map(b => b.items.length)))      // «позже» в масштаб не берём
const mq = (q) => typeof matchMedia !== 'undefined' && matchMedia(q).matches
const wide = ref(mq('(min-width: 720px)')), narrow = ref(mq('(max-width: 520px)'))
const onSize = () => { wide.value = mq('(min-width: 720px)'); narrow.value = mq('(max-width: 520px)') }
onMounted(() => addEventListener('resize', onSize)); onUnmounted(() => removeEventListener('resize', onSize))
const plotW = ref(0); let ro = null
onMounted(() => { ro = new ResizeObserver(([e]) => { plotW.value = e.contentRect.width }); plotw.value && ro.observe(plotw.value) }); onUnmounted(() => ro?.disconnect())
const PH = computed(() => Math.max(8, Math.min(wide.value ? 40 : 26, Math.round(Math.min(wide.value ? 60 : 40, (plotW.value || 600) / bins.value.length * 0.84) * 2 / 3))))
const cardH = computed(() => Math.max(3, Math.min(Math.round(PH.value * .8), Math.floor((BMAX.value - PH.value) / Math.max(1, pileMax.value - 1)))))
const fits = computed(() => 1 + Math.floor((BMAX.value - PH.value) / cardH.value))
const ord = (k) => { const i = props.order.indexOf(k); return i < 0 ? 99 : i }
const pileOf = (b) => [...b.items].sort((a, z) => ord(a.k) - ord(z.k)).slice(0, fits.value)
const tilt = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return h }
const cardStyle = (r, i) => { const h = tilt(r.id); return { width: Math.round(PH.value * 1.5) + 'px', height: PH.value + 'px', marginBottom: i ? `${cardH.value - PH.value}px` : 0, transform: `translateX(${(h % 5) - 2}px) rotate(${((h >> 3) % 7) - 3}deg)`, backgroundImage: r.image ? `url("${imageSrc(r.image)}")` : null } }

// Подписи
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const dateAt = (i) => { const d = new Date(now.value); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i); return d }
const monthAt = (i) => { const d = new Date(now.value); d.setHours(12, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() + i); return d }
function axis(i) {
  if (i === sc.value.n) return 'позже'
  if (i === 0) return 'сейчас'
  if (i === sc.value.n - 1 && scale.value !== 'week') return ''
  if (scale.value === 'day') return i % 6 === 0 ? `+${i} ч` : ''
  if (scale.value === 'week') return i === 1 ? 'завтра' : DOW[dateAt(i).getDay()]
  if (scale.value === 'month') return i % 7 === 0 && i < 28 ? `+${i / 7} нед` : ''
  return i % 3 === 0 ? MON[monthAt(i).getMonth()] : ''
}
function title(i) {
  const n = sc.value.n
  if (i === n) return scale.value === 'day' ? 'Позже, чем через сутки' : scale.value === 'year' ? 'Позже, чем через год' : `Позже, чем через ${n - 1} дн.`
  if (scale.value === 'day') return i === 0 ? 'Сейчас — пора повторять' : i === 1 ? 'В ближайший час' : `Через ${i - 1}–${i} ч`
  if (scale.value === 'year') { const d = monthAt(i); return i === 0 ? `Этот месяц (${MONN[d.getMonth()].toLowerCase()})` : `${MONN[d.getMonth()]} ${d.getFullYear()}` }
  if (i === 0) return 'Сегодня — и всё, что уже пора'
  const d = dateAt(i), dw = DOW[d.getDay()]
  return `${i === 1 ? 'Завтра' : dw[0].toUpperCase() + dw[1]}, ${d.getDate()} ${MONG[d.getMonth()]}`
}
const word = (n) => props.noun[n % 10 === 1 && n % 100 !== 11 ? 0 : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 1 : 2]

// Открытый столбик: наведённый (на компьютере) или выбранный нажатием
const hover = ref(null), pinned = ref(null)
watch(scale, (v) => { store('tma.chartScale', v); pinned.value = null; hover.value = null; emit('unpin') })
const activeI = computed(() => hover.value ?? pinned.value)
const active = computed(() => activeI.value == null ? null : bins.value[activeI.value] ?? null)
const plotw = ref(null), tipPos = ref({ bottom: 0, maxH: 260 })
function placeTip() {
  const w = plotw.value, i = activeI.value; if (!w || i == null) return
  const bar = w.querySelectorAll('.bc')[i]?.querySelector('.bn') || w.querySelectorAll('.bc')[i]?.querySelector('.pile'); if (!bar) return
  const wr = w.getBoundingClientRect(), br = bar.getBoundingClientRect()
  tipPos.value = { bottom: Math.round(wr.bottom - br.top + 8), maxH: Math.max(140, Math.min(300, Math.round(br.top - 16))) }
}
watch([activeI, () => bins.value.map(b => b.items.length).join()], () => nextTick(placeTip))
onMounted(() => addEventListener('resize', placeTip)); onUnmounted(() => removeEventListener('resize', placeTip))
const tipLeft = computed(() => activeI.value == null ? 50 : (activeI.value + 0.5) / bins.value.length * 100)
const pin = (i) => { pinned.value = pinned.value === i ? null : i; hover.value = null; emit('unpin') }
const root = ref(null)
const outside = (e) => { if (pinned.value != null && root.value && !root.value.querySelector('.plotw')?.contains(e.target)) { pinned.value = null; emit('unpin') } }
onMounted(() => document.addEventListener('pointerdown', outside)); onUnmounted(() => document.removeEventListener('pointerdown', outside))
const MAXW = 8
/** Открыть столбик со словом (снаружи: «слово только что ушло» — показать, куда) */
function reveal(id) { const b = bins.value.find(x => x.items.some(r => r.id === id)); if (b) { pinned.value = b.i; hover.value = null } }
defineExpose({ reveal })

// ── Физика стопок: провёл курсором по стопке — карточки подпрыгивают и падают обратно ──
const phys = new Map()
let last = null, raf = 0, prevT = 0, stirUntil = 0
const sweeping = ref(false); let sweepT = 0
const enter = (i) => { if (performance.now() > stirUntil && hover.value !== i) hover.value = i }
const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
function stir(e) {
  const t = performance.now()
  if (!last || t - last.t > 120) { last = { x: e.clientX, y: e.clientY, t }; return }
  const dt = Math.max(8, t - last.t), dx = e.clientX - last.x, dy = e.clientY - last.y
  last = { x: e.clientX, y: e.clientY, t }
  const speed = Math.min(4, Math.hypot(dx, dy) / dt)
  if (speed > .6) { stirUntil = t + 350; hover.value = null; sweeping.value = true; clearTimeout(sweepT); sweepT = setTimeout(() => { sweeping.value = false }, 260) }
  if (calm || speed < 0.15) return
  for (const el of e.currentTarget.querySelectorAll('.pc')) {
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2
    const hx = Math.abs(e.clientX - cx) - b.width / 2, hy = Math.abs(e.clientY - cy)
    if (hx > 14 || hy > 70) continue
    const near = 1 - Math.max(0, hx) / 14 * .5 - hy / 70 * .6, k = speed * near * (.7 + Math.random() * .6)
    let p = phys.get(el.dataset.id); if (!p || p.el !== el) { p = { el, y: 0, vy: 0, x: 0, vx: 0, r: 0, vr: 0 }; phys.set(el.dataset.id, p) }
    p.vy = Math.min(p.vy, -Math.min(900, 260 * k))
    p.vx = Math.max(-160, Math.min(160, p.vx + Math.sign(dx || 1) * 60 * k))
    p.vr = Math.max(-300, Math.min(300, p.vr + (Math.random() < .5 ? -1 : 1) * 120 * k))
  }
  if (!raf) { prevT = t; raf = requestAnimationFrame(step) }
}
function step(t) {
  const dt = Math.max(0, Math.min(.033, (t - prevT) / 1000)); prevT = t
  let moving = false
  for (const [id, p] of phys) {
    if (!p.el.isConnected) { phys.delete(id); continue }
    p.vy += 3000 * dt; p.y += p.vy * dt
    if (p.y > 0) { p.y = 0; p.vy = Math.abs(p.vy) < 90 ? 0 : -p.vy * .35 }
    p.vx += (-140 * p.x - 9 * p.vx) * dt; p.x += p.vx * dt
    p.vr += (-160 * p.r - 10 * p.vr) * dt; p.r += p.vr * dt
    const still = !p.y && !p.vy && Math.abs(p.x) < .3 && Math.abs(p.vx) < 3 && Math.abs(p.r) < .2 && Math.abs(p.vr) < 3
    if (still) { p.el.style.translate = ''; p.el.style.rotate = ''; phys.delete(id); continue }
    moving = true
    p.el.style.translate = `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`; p.el.style.rotate = `${p.r.toFixed(1)}deg`
    p.el.style.zIndex = p.y < -4 ? 2 : ''
  }
  raf = moving ? requestAnimationFrame(step) : 0
}
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<template>
  <div ref="root" class="pch" :class="{ docked: dock, tall }">
    <div class="top">
      <div class="ttl"><slot name="top" /></div>
      <div class="seg scl" role="radiogroup" aria-label="Масштаб">
        <button v-for="s in SCALES" :key="s.id" role="radio" :aria-checked="scale === s.id" :class="{ on: scale === s.id }" @click="scale = s.id">{{ s.t }}</button>
      </div>
      <slot name="actions" />
    </div>
    <div ref="plotw" class="plotw">
      <div class="plot" :class="{ sweep: sweeping }" :style="{ '--n': bins.length }" @mouseleave="hover = null" @pointermove="stir">
        <div class="grid"><i /><i /><i /></div>
        <button v-for="b in bins" :key="b.i" class="bc" :class="{ on: activeI === b.i, pin: pinned === b.i, later: b.i === sc.n, hot: b.items.some(r => r.id === fresh) }"
          :aria-label="`${title(b.i)}: ${b.items.length} ${word(b.items.length)}`" @mouseenter="enter(b.i)" @mousemove="enter(b.i)" @click="pin(b.i)">
          <span v-if="b.items.length" class="bn">{{ b.items.length }}</span>
          <span class="pile" :class="{ empty: !b.items.length }"><i v-for="(r, i) in pileOf(b)" :key="r.id" class="pc" :data-id="r.id" :class="['k-' + r.k, { fresh: r.id === fresh, ph: r.image }]" :style="cardStyle(r, i)"><small v-if="!r.image">{{ r.front }}</small></i></span>
        </button>
      </div>
      <div class="ax" :style="{ '--n': bins.length }"><span v-for="b in bins" :key="b.i" :class="{ now: b.i === 0 }">{{ axis(b.i) }}</span></div>
      <Transition name="tipf">
        <div v-if="active && active.items.length" class="tip" :class="{ pinned: pinned === active.i }" :style="{ '--x': tipLeft + '%', '--b': tipPos.bottom + 'px', '--mh': tipPos.maxH + 'px' }">
          <div class="th"><b>{{ title(active.i) }}</b><span>{{ active.items.length }} {{ word(active.items.length) }}</span></div>
          <slot name="tip" :bin="active" :pinned="pinned === active.i" :max="MAXW">
            <div class="tl">
              <button v-for="r in active.items.slice(0, pinned === active.i ? 99 : MAXW)" :key="r.id" class="tw" :class="['k-' + r.k, { fresh: r.id === fresh }]" :disabled="pinned !== active.i" @click.stop="emit('pick', r.id)">
                <i class="dot" /><b>{{ r.front }}</b><small>{{ r.back }}</small><span class="cd">{{ r.when }}</span></button>
              <small v-if="pinned !== active.i && active.items.length > MAXW" class="more">и ещё {{ active.items.length - MAXW }}… — нажмите на столбик</small>
            </div>
          </slot>
          <small v-if="pinned !== active.i" class="hint2">нажмите на столбик — закрепить{{ $slots.tip ? ' и посмотреть историю слова' : ' и открыть слово' }}</small>
        </div>
      </Transition>
    </div>
    <slot name="bottom" />
  </div>
</template>

<style scoped>
.pch { display: grid; gap: 8px; --bmax: 120px; min-width: 0 } .pch.docked { --bmax: 110px }
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px }
.ttl { flex: 1; min-width: 180px; display: grid; gap: 2px; font-size: 12px; font-weight: 700; color: var(--hint) }
.scl { flex: none; padding: 2px } .scl button { padding: 4px 9px; font-size: 12px }
.plot { --broom: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cg transform=''%3E%3Cpath d='M30.5 1.5L15 17' stroke='%239c7a4c' stroke-width='2.4' stroke-linecap='round'/%3E%3Cpath d='M30 2L15.5 16.5' stroke='%23e2c792' stroke-width='.9' stroke-linecap='round'/%3E%3Cpath d='M16.5 15.5L13 12.5L.8 23.5L8.5 31.2z' fill='%23e8c66a' stroke='%23a8823a' stroke-width='.8' stroke-linejoin='round'/%3E%3Cpath d='M13.6 13.4L2.5 24.5M14.5 14.3L4.4 26.4M15.3 15.1L6.4 28.4M16 16L8.2 29.6' stroke='%23c9a24a' stroke-width='.5'/%3E%3Cpath d='M.8 23.5l.9 1.4-.2 1.6 1.2.7.2 1.4 1.3.4.5 1.3 1.4.2.8 1.2 1.6-.3' fill='none' stroke='%23a8823a' stroke-width='.7' stroke-linejoin='round'/%3E%3Cpath d='M10.6 14.8l5.1 4.6' stroke='%23d33a3a' stroke-width='1.1'/%3E%3Cpath d='M9.2 16.2l5.1 4.6' stroke='%232f8fd8' stroke-width='1.1'/%3E%3Cpath d='M7.8 17.6l5.1 4.6' stroke='%23d33a3a' stroke-width='1.1'/%3E%3Cpath d='M13.4 12.9l3.6 3.1M14.2 12.1l3.6 3.1' stroke='%236d6d6d' stroke-width='.9'/%3E%3C/g%3E%3C/svg%3E") 4 28, auto; --broom-go: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cg transform='rotate%28-16 5 28%29'%3E%3Cpath d='M30.5 1.5L15 17' stroke='%239c7a4c' stroke-width='2.4' stroke-linecap='round'/%3E%3Cpath d='M30 2L15.5 16.5' stroke='%23e2c792' stroke-width='.9' stroke-linecap='round'/%3E%3Cpath d='M16.5 15.5L13 12.5L.8 23.5L8.5 31.2z' fill='%23e8c66a' stroke='%23a8823a' stroke-width='.8' stroke-linejoin='round'/%3E%3Cpath d='M13.6 13.4L2.5 24.5M14.5 14.3L4.4 26.4M15.3 15.1L6.4 28.4M16 16L8.2 29.6' stroke='%23c9a24a' stroke-width='.5'/%3E%3Cpath d='M.8 23.5l.9 1.4-.2 1.6 1.2.7.2 1.4 1.3.4.5 1.3 1.4.2.8 1.2 1.6-.3' fill='none' stroke='%23a8823a' stroke-width='.7' stroke-linejoin='round'/%3E%3Cpath d='M10.6 14.8l5.1 4.6' stroke='%23d33a3a' stroke-width='1.1'/%3E%3Cpath d='M9.2 16.2l5.1 4.6' stroke='%232f8fd8' stroke-width='1.1'/%3E%3Cpath d='M7.8 17.6l5.1 4.6' stroke='%23d33a3a' stroke-width='1.1'/%3E%3Cpath d='M13.4 12.9l3.6 3.1M14.2 12.1l3.6 3.1' stroke='%236d6d6d' stroke-width='.9'/%3E%3C/g%3E%3Ccircle cx='24.5' cy='26' r='1.3' fill='%23d9cdb4'/%3E%3Ccircle cx='28' cy='29' r='.9' fill='%23e6dcc6'/%3E%3Ccircle cx='21' cy='30' r='.8' fill='%23e6dcc6'/%3E%3Cpath d='M26 21.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z' fill='%23ffd54a'/%3E%3C/svg%3E") 4 28, auto }
.plot, .plot .bc { cursor: var(--broom) } .plot.sweep, .plot.sweep .bc { cursor: var(--broom-go) }
.plot { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 3px; align-items: end; height: 165px; padding-top: 14px }
.pch.docked .plot { height: 150px }
.grid { position: absolute; inset: 14px 0 0; display: grid; grid-template-rows: repeat(3, 1fr); pointer-events: none } .grid i { border-top: 1px dashed var(--border) }
.bc { position: relative; display: grid; justify-items: center; align-content: end; gap: 2px; height: 100%; padding: 0 0 1px; border: 0; border-radius: 8px 8px 0 0; background: none; cursor: pointer; min-width: 0; font: inherit; z-index: 1 }
.bc.later { border-left: 1px dashed var(--border); border-radius: 0 8px 0 0 }
.pile { display: flex; flex-direction: column-reverse; align-items: center; width: 84%; max-width: 64px }
.pile.empty { height: 3px; border-radius: 2px; background: var(--border) }
.pc { position: relative; display: block; flex: none; width: 100%; overflow: hidden; border-radius: 4px; background: var(--c) center / cover no-repeat; box-shadow: 0 1px 3px rgba(0, 0, 0, .22); animation: drop .45s cubic-bezier(.3, 1.5, .5, 1) backwards }
.pc { --c: #e3e7ec } .pc.ph { background-color: var(--surface) }
/* карточка без фото — цветом вида: колоды (изучаю / повтор. / выучено) и Review (слабое / среднее / сильное) */
.pc.k-weak:not(.ph) { --c: #ffd9d9 } .pc.k-medium:not(.ph) { --c: #ffe6c2 } .pc.k-strong:not(.ph) { --c: #d7f5c0 }
.pc small { position: absolute; inset: 0; display: grid; place-items: center; padding: 0 2px; font-size: 8px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden }
.pc.fresh { animation: drop .6s cubic-bezier(.3, 1.6, .5, 1) backwards, glow 1.2s ease 2 }
@keyframes drop { from { opacity: 0; translate: 0 -40px } }
@keyframes glow { 50% { filter: brightness(1.3); box-shadow: 0 0 0 1px var(--card), 0 0 8px var(--orange) } }
.bn { font-size: 11px; font-weight: 900; color: var(--text); line-height: 1 }
.ax { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 3px; height: 14px; border-top: 1px solid var(--border); padding-top: 3px }
.ax span { display: flex; justify-content: center; width: 0; justify-self: center; font-size: 10px; font-weight: 800; color: var(--hint-2); white-space: nowrap } .ax span.now { color: var(--blue) }
.plotw { position: relative }
.tip { position: absolute; z-index: 20; bottom: var(--b, 100%); pointer-events: none; left: clamp(min(130px, 50%), var(--x), calc(100% - min(130px, 50%))); transform: translateX(-50%); width: min(260px, 100%); box-sizing: border-box; max-height: var(--mh, 260px); overflow-y: auto;
  display: grid; gap: 4px; padding: 8px 8px 6px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 10px 28px rgba(0, 0, 0, .16) }
.tip.pinned { pointer-events: auto }
.tipf-enter-active, .tipf-leave-active { transition: opacity .12s, transform .12s } .tipf-enter-from, .tipf-leave-to { opacity: 0; transform: translate(-50%, -4px) }
.th { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 0 4px 2px; font-size: 13px } .th span { flex: none; font-size: 12px; font-weight: 800; color: var(--hint) }
.tl { display: grid; gap: 1px }
.tw { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 5px 6px; border: 0; border-radius: 8px; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer }
.tw:disabled { cursor: default; color: var(--text); opacity: 1 } .tw:not(:disabled):hover { background: var(--surface) }
.tw .dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--hint-2) }
.tw.k-weak .dot { background: var(--red) } .tw.k-medium .dot { background: var(--orange) } .tw.k-strong .dot { background: var(--green) }
.tw b { flex: none; max-width: 45%; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .tw small { flex: 1; min-width: 0; font-size: 11px; font-weight: 600; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tw .cd { flex: none; font-size: 12px; font-weight: 800; color: var(--hint); font-variant-numeric: tabular-nums } .tw.k-weak .cd { color: var(--red-d) }
.tw.fresh { background: #fff3d6; box-shadow: inset 0 0 0 2px var(--orange) } html[data-theme='dark'] .tw.fresh { background: var(--surface) }
.more, .hint2 { padding: 0 6px; font-size: 11px; font-weight: 700; color: var(--hint) } .hint2 { color: var(--hint-2) }
@media (max-width: 520px) { .scl button { padding: 4px 7px } .plot { height: 130px } }
@media (max-width: 520px) {
  .pch.docked { --bmax: 52px } .pch.docked .ttl { min-width: 100% }
  .pch.docked .top { gap: 4px 6px } .pch.docked .scl { margin-right: auto }
  .pch.docked .plot { height: 76px; padding-top: 12px } .pch.docked .grid { inset: 12px 0 0 }
}
@media (min-width: 720px) { .pch, .pch.docked { --bmax: 210px } .plot, .pch.docked .plot { height: 250px } .pch.tall { --bmax: 330px } .pch.tall .plot { height: 370px } }
@media (min-width: 521px) and (max-width: 719px) { .pch.tall { --bmax: 220px } .pch.tall .plot { height: 260px } }
</style>

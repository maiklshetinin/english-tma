<script setup>
// Нагрузка недели — «спидометр» часов уроков и предупреждения об утомлении / выгорании.
//  • Стрелка — часы уроков выбранной недели (урок = 1 час; группа — тоже 1; отменённый всеми учениками не считается).
//  • Зоны шкалы от вашей нормы часов в неделю: до 80% нормы — «Комфортно», до 100% — «Плотно», выше — «Риск выгорания».
//    Норму меняете кнопками − / +, она запоминается на этом устройстве.
//  • Предупреждения: превышение нормы, перегруженный день, много уроков подряд без перерыва, нет выходного, поздние уроки.
//  • Столбики по дням: высота — часы дня, цвет — та же шкала по дневной нагрузке. Нажмите на день — подсказка по нему.
import { computed, onMounted, ref } from 'vue'
import { DAYS, hh } from '../store/app'
const props = defineProps({
  lessons: { type: Array, required: true },       // уроки недели (из расписания)
  dates: { type: Array, required: true },         // 7 дат недели
  activeOf: { type: Function, required: true },   // (урок) → true, если урок состоится (не отменён всеми учениками)
})

// Норма часов в неделю — личная настройка (localStorage, с защитой от приватного режима)
const NORM_KEY = 'tutor.weeklyNorm'
const readNorm = () => { try { const n = Number(localStorage.getItem(NORM_KEY)); return n >= 5 && n <= 60 ? n : 25 } catch { return 25 } }
const norm = ref(readNorm())
const setNorm = (n) => { norm.value = Math.max(5, Math.min(60, n)); try { localStorage.setItem(NORM_KEY, String(norm.value)) } catch { /* не запомним */ } }

const active = computed(() => props.lessons.filter(l => props.dates.includes(l.date) && props.activeOf(l)))
const hours = computed(() => active.value.length)
const perDay = computed(() => props.dates.map(d => active.value.filter(l => l.date === d).map(l => l.hour).sort((a, b) => a - b)))
const longestRun = (hs) => { let best = 0, cur = 0, prev = -9; for (const h of hs) { cur = h === prev + 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = h } return best }

// Шкала
const max = computed(() => Math.max(Math.ceil(norm.value * 1.6 / 5) * 5, Math.ceil((hours.value + 2) / 5) * 5))
const zone = computed(() => (hours.value > norm.value ? 'bad' : hours.value > norm.value * 0.8 ? 'warn' : 'ok'))
const ZONE = { ok: 'Комфортно', warn: 'Плотно', bad: 'Риск выгорания' }
const R = 80, CX = 100, CY = 100
const pt = (v, r = R) => { const a = Math.PI * (1 - Math.min(v, max.value) / max.value); return [CX + r * Math.cos(a), CY - r * Math.sin(a)] }
const arc = (from, to) => { const [x1, y1] = pt(from), [x2, y2] = pt(to); return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}` }
const zones = computed(() => [
  { k: 'ok', d: arc(0, norm.value * 0.8), t: `Комфортно: до ${Math.round(norm.value * 0.8)} ч` },
  { k: 'warn', d: arc(norm.value * 0.8, norm.value), t: `Плотно: ${Math.round(norm.value * 0.8)}–${norm.value} ч` },
  { k: 'bad', d: arc(norm.value, max.value), t: `Риск выгорания: больше ${norm.value} ч` },
])
const ticks = computed(() => { const step = max.value > 50 ? 10 : 5, out = []; for (let v = 0; v <= max.value; v += step) { const [x1, y1] = pt(v, R - 14), [x2, y2] = pt(v, R - 8), [tx, ty] = pt(v, R - 24); out.push({ v, x1, y1, x2, y2, tx, ty }) } return out })
// Стрелка: при появлении — от нуля, дальше плавно (CSS transition)
const shown = ref(0)
onMounted(() => requestAnimationFrame(() => { shown.value = 1 }))
const angle = computed(() => -90 + 180 * Math.min(hours.value * shown.value, max.value) / max.value)

// Предупреждения
const warnings = computed(() => {
  const w = [], days = perDay.value
  if (hours.value > norm.value) w.push({ lvl: 'bad', t: `Выше вашей нормы на ${hours.value - norm.value} ч — риск выгорания. Перенесите часть уроков на следующую неделю.` })
  else if (hours.value > norm.value * 0.8) w.push({ lvl: 'warn', t: `Плотная неделя: ${hours.value} из ${norm.value} ч. Новые уроки лучше ставить осторожно.` })
  days.forEach((hs, i) => {
    if (hs.length >= 7) w.push({ lvl: 'bad', t: `${DAYS[i]}: ${hs.length} уроков за день — к вечеру сильное утомление, голос и внимание садятся.` })
    else if (hs.length >= 5) w.push({ lvl: 'warn', t: `${DAYS[i]}: ${hs.length} уроков — тяжёлый день, запланируйте перерыв на еду.` })
    const run = longestRun(hs)
    if (run >= 4) w.push({ lvl: 'warn', t: `${DAYS[i]}: ${run} ${run < 5 ? 'урока' : 'уроков'} подряд без перерыва — оставьте хотя бы 15 минут между уроками.` })
  })
  if (days.every(hs => hs.length)) w.push({ lvl: 'bad', t: 'Нет ни одного выходного — без дня отдыха усталость накапливается.' })
  const late = days.filter(hs => hs.some(h => h >= 21)).length
  if (late >= 3) w.push({ lvl: 'warn', t: `Поздние уроки (с ${hh(21)}) в ${late} днях — сложнее выспаться и восстановиться.` })
  if (!w.length) w.push({ lvl: 'ok', t: hours.value ? 'Нагрузка в норме, есть время на отдых 👍' : 'На этой неделе уроков пока нет.' })
  return w
})
const dayLoad = (n) => (n >= 7 ? 'bad' : n >= 5 ? 'warn' : n ? 'ok' : 'none')
const dayTip = ref(null)
const tipText = computed(() => {
  if (dayTip.value == null) return ''
  const hs = perDay.value[dayTip.value]
  return hs.length ? `${DAYS[dayTip.value]}: ${hs.length} ч (${hs.map(h => hh(h)).join(', ')}), подряд до ${longestRun(hs)}` : `${DAYS[dayTip.value]}: выходной`
})
</script>

<template>
  <div class="card load" :class="zone">
    <div class="gauge">
      <svg viewBox="0 0 200 110" role="img" :aria-label="`Нагрузка недели: ${hours} ч из нормы ${norm} — ${ZONE[zone]}`">
        <path :d="arc(0, max)" class="track" />
        <path v-for="z in zones" :key="z.k" :d="z.d" class="zone" :class="z.k"><title>{{ z.t }}</title></path>
        <g v-for="t in ticks" :key="t.v"><line :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" class="tick" /><text :x="t.tx" :y="t.ty + 3" class="tl">{{ t.v }}</text></g>
        <g class="needle" :style="{ transform: `rotate(${angle}deg)` }"><path d="M100 34 L103.5 100 L96.5 100 Z" /><circle cx="100" cy="100" r="8" /></g>
      </svg>
      <div class="val"><b>{{ hours }}</b><span>ч за неделю</span></div>
      <div class="state">{{ ZONE[zone] }}</div>
    </div>
    <div class="side">
      <div class="norm"><span>Моя норма</span>
        <button aria-label="Меньше" @click="setNorm(norm - 1)">−</button><b>{{ norm }} ч</b><button aria-label="Больше" @click="setNorm(norm + 1)">+</button></div>
      <div class="days">
        <button v-for="(hs, i) in perDay" :key="i" class="dbar" :class="[dayLoad(hs.length), { on: dayTip === i }]" :title="`${DAYS[i]}: ${hs.length} ч`" @click="dayTip = dayTip === i ? null : i">
          <i :style="{ height: Math.min(100, hs.length / 8 * 100) + '%' }" /><span>{{ DAYS[i] }}</span></button>
      </div>
      <p v-if="tipText" class="tip">{{ tipText }}</p>
      <ul class="warns">
        <li v-for="(w, i) in warnings" :key="i" :class="w.lvl">{{ w.t }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.load { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: start; padding: 14px 16px }
.gauge { position: relative; display: grid; justify-items: center }
.gauge svg { width: 220px; height: auto; overflow: visible }
.track { fill: none; stroke: var(--border); stroke-width: 16 }
.zone { fill: none; stroke-width: 16; cursor: help; transition: opacity .15s } .zone:hover { opacity: .75 }
.zone.ok { stroke: var(--green) } .zone.warn { stroke: var(--orange) } .zone.bad { stroke: var(--red) }
.tick { stroke: var(--hint-2); stroke-width: 2 } .tl { font: 800 9px var(--font); fill: var(--hint-2); text-anchor: middle }
.needle { transform-origin: 100px 100px; transition: transform .9s cubic-bezier(.3, 1.5, .5, 1) }
.needle path, .needle circle { fill: var(--text) }
.val { display: flex; align-items: baseline; gap: 6px; margin-top: 2px; line-height: 1 }
.val b { font-size: 30px; font-weight: 900 } .val span { font-size: 12px; font-weight: 800; color: var(--hint) }
.state { margin-top: 4px; padding: 3px 12px; border-radius: 99px; font-size: 13px; font-weight: 900 }
.ok .state { background: var(--green-l); color: var(--green-d) } .warn .state { background: var(--orange-l); color: var(--orange-d) } .bad .state { background: var(--red-l); color: var(--red-d) }
.load.bad { border-color: var(--red) }
.side { display: grid; gap: 10px; min-width: 0 }
.norm { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; color: var(--hint) }
.norm button { width: 28px; height: 28px; border: 2px solid var(--border); border-bottom-width: 3px; border-radius: 9px; background: var(--card); color: var(--text); font: inherit; font-size: 16px; line-height: 1; cursor: pointer }
.norm b { color: var(--text); min-width: 42px; text-align: center }
.days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; height: 64px }
.dbar { display: grid; grid-template-rows: 1fr auto; justify-items: center; gap: 2px; border: 0; background: none; padding: 0; cursor: pointer; font: inherit }
.dbar i { align-self: end; width: 100%; max-width: 26px; min-height: 3px; border-radius: 6px 6px 3px 3px; background: var(--border); transition: height .4s }
.dbar.ok i { background: var(--green) } .dbar.warn i { background: var(--orange) } .dbar.bad i { background: var(--red) }
.dbar span { font-size: 11px; font-weight: 800; color: var(--hint-2) } .dbar.on span { color: var(--blue) } .dbar.on i { outline: 2px solid var(--blue); outline-offset: 1px }
.tip { margin: 0; font-size: 13px; font-weight: 700; color: var(--blue) }
.warns { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px }
.warns li { position: relative; padding: 7px 10px 7px 28px; border-radius: 10px; font-size: 13px; font-weight: 700; line-height: 1.3 }
.warns li::before { position: absolute; left: 9px; top: 6px; font-weight: 900 }
.warns .ok { background: var(--green-l); color: var(--green-d) } .warns .ok::before { content: '✓' }
.warns .warn { background: var(--orange-l); color: var(--orange-d) } .warns .warn::before { content: '!' }
.warns .bad { background: var(--red-l); color: var(--red-d) } .warns .bad::before { content: '‼'; left: 7px }
html[data-theme='dark'] .warns .ok { color: var(--green) } html[data-theme='dark'] .warns .warn { color: var(--orange) } html[data-theme='dark'] .warns .bad { color: var(--red) }
@media (max-width: 640px) { .load { grid-template-columns: 1fr } .gauge svg { width: 200px } }
</style>

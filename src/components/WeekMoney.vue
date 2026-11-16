<script setup>
// Деньги недели — две цифры: факт (проведённые уроки) и план (все уроки недели); под ними мелко красным — сколько потеряно из-за отмен учеников и какая это доля уроков недели.
// Учитель отметил «Урок проведён» — факт плавно досчитывается до новой суммы и мигает зелёным (composables/useCelebrate.js).
import { ref, watch, onUnmounted } from 'vue'
import { fmtMoney } from '../utils/price'
import { justCelebrated, reducedMotion } from '../composables/useCelebrate'
const props = defineProps({ m: { type: Object, required: true } })      // { real, plan, lost, offPct, off, all }
const shown = ref(props.m.real)
const flash = ref(0)
let raf = 0
watch(() => props.m.real, (to, from) => {
  cancelAnimationFrame(raf)
  if (!(to > from) || !justCelebrated() || reducedMotion()) { shown.value = to; return }
  const t0 = performance.now(), D = 900
  flash.value++
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3)      // быстро в начале, мягко к концу
    shown.value = Math.round(from + (to - from) * e)
    if (k < 1) raf = requestAnimationFrame(step); else shown.value = to
  }
  raf = requestAnimationFrame(step)
})
onUnmounted(() => cancelAnimationFrame(raf))
</script>
<template>
  <div v-if="m.plan || m.lost" class="wm" :title="`Факт ${fmtMoney(m.real)} из ${fmtMoney(m.plan)}${m.lost ? `, потеряно ${fmtMoney(m.lost)}` : ''}${m.off ? `, отменено ${m.off} из ${m.all} (${m.offPct}%)` : ''}`">
    <span class="top"><b :key="flash" :class="{ up: flash }">{{ fmtMoney(shown) }}</b><small>из {{ fmtMoney(m.plan) }}</small></span>
    <span v-if="m.lost || m.off" class="lost"><em>−{{ fmtMoney(m.lost) }}</em> отмены<template v-if="m.off"> · {{ m.offPct }}%</template></span>
  </div>
</template>
<style scoped>
.wm { flex: none; display: grid; justify-items: end; padding: 4px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); line-height: 1.15 }
.top { display: flex; align-items: baseline; gap: 5px }
b { font-size: 18px; font-weight: 900; color: var(--green-d); font-variant-numeric: tabular-nums } small { font-size: 13px; font-weight: 800; color: var(--hint) }
b.up { display: inline-block; transform-origin: right center; animation: wmUp 1s ease-out }
@keyframes wmUp { 0% { transform: scale(1) } 25% { transform: scale(1.18); text-shadow: 0 0 12px rgba(88, 204, 2, .55) } 100% { transform: scale(1); text-shadow: none } }
@media (prefers-reduced-motion: reduce) { b.up { animation: none } }
.lost { font-size: 11px; font-weight: 800; color: var(--red-d) } .lost em { font-style: normal }
html[data-theme='dark'] b { color: var(--green) } html[data-theme='dark'] .lost { color: var(--red) }
</style>

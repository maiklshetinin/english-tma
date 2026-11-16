<script setup>
// Деньги за период — неделя и месяц выглядят одинаково (16.11.2026, вариант «компактно»): крупно зелёным — заработано (проведённые уроки),
// рядом «из …» — прогноз (все уроки с запланированными); полоска — какая доля прогноза уже заработана;
// внизу в одну строку — период слева и отмены справа красным: сколько потеряно и какая это доля суммы (как в «Информации»).
// Учитель отметил «Урок проведён» — заработанное плавно досчитывается, мигает зелёным, полоска дорастает (composables/useCelebrate.js).
import { ref, computed, watch, onUnmounted } from 'vue'
import { fmtMoney } from '../utils/price'
import { justCelebrated, reducedMotion } from '../composables/useCelebrate'
const props = defineProps({
  m: { type: Object, required: true },      // { real, plan, lost, offPct, off, all }
  label: { type: String, default: 'неделя' },
})
const pct = computed(() => (props.m.plan ? Math.min(100, Math.round(props.m.real / props.m.plan * 100)) : 0))
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
  <div v-if="m.plan || m.lost" class="wm" :title="`${label}: заработано ${fmtMoney(m.real)} из ${fmtMoney(m.plan)} (${pct}%)${m.lost ? `, потеряно из-за отмен ${fmtMoney(m.lost)} — ${m.offPct}% от суммы` : ''}${m.off ? `, отменено мест учеников: ${m.off} из ${m.all}` : ''}`">
    <span class="top"><b :key="flash" :class="{ up: flash }">{{ fmtMoney(shown) }}</b><small>из {{ fmtMoney(m.plan) }}</small></span>
    <span class="bar" aria-hidden="true"><i :style="{ width: pct + '%' }" /></span>
    <span class="bot"><span class="per">{{ label }}</span><em v-if="m.lost" class="lost">−{{ fmtMoney(m.lost) }} · {{ m.offPct }}%</em></span>
  </div>
</template>
<style scoped>
/* Зелёный плашек денег — #009300, как на макете (спокойнее, чем салатовый --green); в тёмной теме — светлее, чтобы читался */
.wm { --mg: #009300; flex: none; display: grid; min-width: 118px; padding: 4px 12px 5px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); line-height: 1.15; white-space: nowrap }
.top { justify-self: end; display: flex; align-items: baseline; gap: 5px }
b { font-size: 18px; font-weight: 900; color: var(--mg); font-variant-numeric: tabular-nums } small { font-size: 12px; font-weight: 800; color: var(--hint) }
b.up { display: inline-block; transform-origin: right center; animation: wmUp 1s ease-out }
@keyframes wmUp { 0% { transform: scale(1) } 25% { transform: scale(1.18); text-shadow: 0 0 12px rgba(0, 147, 0, .45) } 100% { transform: scale(1); text-shadow: none } }
.bar { height: 4px; margin: 4px 0 3px; border-radius: 2px; background: var(--border); overflow: hidden }
.bar i { display: block; height: 100%; border-radius: 2px; background: var(--mg); transition: width .9s cubic-bezier(.22, 1, .36, 1) }      /* отметили «проведён» — полоска плавно дорастает */
.bot { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 800 }
.per { color: var(--hint) } .lost { font-style: normal; color: var(--red-d) }
@media (prefers-reduced-motion: reduce) { b.up { animation: none } .bar i { transition: none } }
html[data-theme='dark'] .wm { --mg: #3fb950 } html[data-theme='dark'] .lost { color: var(--red) }
</style>

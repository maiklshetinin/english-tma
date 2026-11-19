<script setup>
// Деньги недели и месяца одной плашкой в две строки (19.11.2026; выбор — меню «Вид сетки» → «Деньги», utils/gridStyle.js → moneyStyle).
// В строке: период, заработано зелёным, «/ прогноз», отмены красным; под суммой — тонкая полоска доли от прогноза.
// Те же данные, что у двух плашек WeekMoney: { real, plan, lost, offPct, off, all }. Отметили «проведён» — сумма мигает зелёным.
import { computed, ref, watch } from 'vue'
import { fmtMoney } from '../utils/price'
import { justCelebrated, reducedMotion } from '../composables/useCelebrate'
const props = defineProps({
  week: { type: Object, required: true },
  month: { type: Object, required: true },
  monthLabel: { type: String, default: 'месяц' },
})
const pct = (m) => (m.plan ? Math.min(100, Math.round(m.real / m.plan * 100)) : 0)
const tip = (label, m) => `${label}: заработано ${fmtMoney(m.real)} из ${fmtMoney(m.plan)} (${pct(m)}%)${m.lost ? `, потеряно из-за отмен ${fmtMoney(m.lost)} — ${m.offPct}% от суммы` : ''}${m.off ? `, отменено мест учеников: ${m.off} из ${m.all}` : ''}`
const rows = computed(() => [['неделя', props.week], [props.monthLabel, props.month]].map(([label, m]) => ({ label, m, pct: pct(m) })))
const flash = ref(0)
watch(() => props.week.real + props.month.real, (to, from) => { if (to > from && justCelebrated() && !reducedMotion()) flash.value++ })
</script>
<template>
  <div v-if="week.plan || week.lost || month.plan || month.lost" class="wmp" :title="rows.map((r) => tip(r.label, r.m)).join('\n')">
    <template v-for="r in rows" :key="r.label">
      <span class="per">{{ r.label }}</span>
      <span class="sum"><b :key="flash" :class="{ up: flash }">{{ fmtMoney(r.m.real) }}</b><small>/ {{ fmtMoney(r.m.plan) }}</small><span class="bar" aria-hidden="true"><i :style="{ width: r.pct + '%' }" /></span></span>
      <em class="lost">{{ r.m.lost ? `−${fmtMoney(r.m.lost)}` : '' }}</em>
    </template>
  </div>
</template>
<style scoped>
/* Цвета — как у WeekMoney: зелёный #009300, в тёмной теме светлее */
.wmp { --mg: #009300; flex: none; display: grid; grid-template-columns: auto auto auto; align-items: center; column-gap: 8px; row-gap: 2px; padding: 4px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); line-height: 1.15; white-space: nowrap; box-sizing: border-box }
.per { font-size: 11px; font-weight: 800; color: var(--hint) }
.sum { position: relative; display: flex; align-items: baseline; justify-content: flex-end; gap: 4px; padding-bottom: 3px }
b { font-size: 14px; font-weight: 900; color: var(--mg); font-variant-numeric: tabular-nums } small { font-size: 11px; font-weight: 800; color: var(--hint); font-variant-numeric: tabular-nums }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 1px; background: var(--border); overflow: hidden } .bar i { display: block; height: 100%; background: var(--mg); transition: width .9s cubic-bezier(.22, 1, .36, 1) }
.lost { font-style: normal; font-size: 11px; font-weight: 800; color: var(--red-d); text-align: right; font-variant-numeric: tabular-nums }
b.up { display: inline-block; transform-origin: right center; animation: wmpUp 1s ease-out }
@keyframes wmpUp { 0% { transform: scale(1) } 25% { transform: scale(1.15); text-shadow: 0 0 10px rgba(0, 147, 0, .45) } 100% { transform: scale(1); text-shadow: none } }
@media (prefers-reduced-motion: reduce) { b.up { animation: none } .bar i { transition: none } }
html[data-theme='dark'] .wmp { --mg: #3fb950 } html[data-theme='dark'] .lost { color: var(--red) }
</style>

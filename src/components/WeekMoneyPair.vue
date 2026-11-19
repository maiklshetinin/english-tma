<script setup>
// Деньги недели и месяца одной плашкой в две строки (19.11.2026; выбор — меню «Вид сетки» → «Деньги», utils/gridStyle.js → moneyStyle).
// Вид «6г» с холста: слева — период и под ним доля отмен («отм. 4%»), справа — заработано крупно зелёным и «/ прогноз»,
// под суммой — тонкая полоска 2px: какая доля прогноза уже заработана.
// Рубли отмен и проценты заработанного — в подсказке. Высота ровно 54px, как у двух плашек WeekMoney: переключение вида ничего не сдвигает.
// Те же данные, что у WeekMoney: { real, plan, lost, offPct, off, all }. Отметили «проведён» — сумма мигает зелёным.
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
const rows = computed(() => [['неделя', props.week], [props.monthLabel, props.month]].map(([label, m]) => ({ label, m })))
const flash = ref(0)
watch(() => props.week.real + props.month.real, (to, from) => { if (to > from && justCelebrated() && !reducedMotion()) flash.value++ })
</script>
<template>
  <div v-if="week.plan || week.lost || month.plan || month.lost" class="wmp" :title="rows.map((r) => tip(r.label, r.m)).join('\n')">
    <template v-for="r in rows" :key="r.label">
      <span class="per"><span>{{ r.label }}</span><em v-if="r.m.lost" class="off">отм. {{ r.m.offPct }}%</em></span>
      <span class="sum"><span class="am"><b :key="flash" :class="{ up: flash }">{{ fmtMoney(r.m.real) }}</b><small>/ {{ fmtMoney(r.m.plan) }}</small></span><span class="bar" aria-hidden="true"><i :style="{ width: pct(r.m) + '%' }" /></span></span>
    </template>
  </div>
</template>
<style scoped>
/* Цвета — как у WeekMoney: зелёный #009300, в тёмной теме светлее */
.wmp { --mg: #009300; flex: none; display: grid; grid-template-columns: auto auto; align-content: center; align-items: center; column-gap: 5px; row-gap: 2px; box-sizing: border-box; height: 54px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); line-height: 1.05; white-space: nowrap }
.per { display: grid; justify-items: start; gap: 1px; line-height: 1 } .per > span { font-size: 11px; font-weight: 800; color: var(--hint) }          /* подписи — как у двух плашек WeekMoney (11px) */
.off { font-style: normal; font-size: 11px; font-weight: 800; color: var(--red-d); font-variant-numeric: tabular-nums }
.sum { display: grid; gap: 2px } .am { display: flex; align-items: baseline; justify-content: flex-end; gap: 2px }
.bar { height: 2px; border-radius: 1px; background: var(--border); overflow: hidden } .bar i { display: block; height: 100%; background: var(--mg); transition: width .9s cubic-bezier(.22, 1, .36, 1) }
b { font-size: 18px; font-weight: 900; color: var(--mg); letter-spacing: -.3px; font-variant-numeric: tabular-nums }
small { font-size: 10px; font-weight: 800; color: var(--hint); letter-spacing: -.2px; font-variant-numeric: tabular-nums }
b.up { display: inline-block; transform-origin: right center; animation: wmpUp 1s ease-out }
@keyframes wmpUp { 0% { transform: scale(1) } 25% { transform: scale(1.12); text-shadow: 0 0 10px rgba(0, 147, 0, .45) } 100% { transform: scale(1); text-shadow: none } }
@media (prefers-reduced-motion: reduce) { b.up { animation: none } .bar i { transition: none } }
html[data-theme='dark'] .wmp { --mg: #3fb950 } html[data-theme='dark'] .off { color: var(--red) }
</style>

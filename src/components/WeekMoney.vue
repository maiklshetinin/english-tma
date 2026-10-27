<script setup>
// Деньги недели в шапке таблицы: «Факт» — проведённые уроки, «План» — все уроки недели; полоска — сколько плана уже заработано.
// «Потеряно» — уроки, которые отменили ученики (без оплаты).
import { computed } from 'vue'
import { fmtMoney } from '../utils/price'
const props = defineProps({ m: { type: Object, required: true } })      // { real, plan, lost }
const pct = computed(() => (props.m.plan ? Math.min(100, Math.round(props.m.real / props.m.plan * 100)) : 0))
</script>
<template>
  <div v-if="m.plan || m.lost" class="wm" :title="`Проведено на ${fmtMoney(m.real)} из запланированных ${fmtMoney(m.plan)} (${pct}%)`">
    <div class="nums"><span class="lbl">Факт</span><b class="real">{{ fmtMoney(m.real) }}</b><span class="sep">/</span><span class="lbl">План</span><b class="plan">{{ fmtMoney(m.plan) }}</b></div>
    <div v-if="m.lost" class="lost" :title="`Ученики отменили уроки на ${fmtMoney(m.lost)} — без оплаты`">Потеряно −{{ fmtMoney(m.lost) }}</div>
    <div class="bar" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: pct + '%' }" /></div>
  </div>
</template>
<style scoped>
.wm { display: grid; gap: 4px; justify-items: end; min-width: 0 }
.nums { display: flex; align-items: baseline; gap: 5px; white-space: nowrap; font-size: 12px }
.lbl { font-weight: 800; color: var(--hint-2); text-transform: uppercase; letter-spacing: .4px; font-size: 10px }
.real { font-size: 16px; font-weight: 900; color: var(--green-d) } .plan { font-size: 14px; font-weight: 900; color: var(--text) }
.sep { color: var(--hint-2); font-weight: 800 }
.lost { font-size: 12px; font-weight: 900; color: var(--red-d) } html[data-theme='dark'] .lost { color: var(--red) }
.bar { width: 100%; min-width: 120px; height: 6px; border-radius: 9px; background: var(--border); overflow: hidden }
.bar i { display: block; height: 100%; background: var(--green); border-radius: 9px; transition: width .25s }
html[data-theme='dark'] .real { color: var(--green) }
@media (max-width: 420px) { .lbl { display: none } .real { font-size: 15px } .plan { font-size: 13px } .bar { min-width: 90px } }
</style>

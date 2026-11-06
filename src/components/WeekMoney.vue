<script setup>
// Деньги недели — две цифры: факт (проведённые уроки) и план (все уроки недели); под ними мелко красным — сколько потеряно из-за отмен учеников и какая это доля уроков недели.
import { fmtMoney } from '../utils/price'
defineProps({ m: { type: Object, required: true } })      // { real, plan, lost, offPct, off, all }
</script>
<template>
  <div v-if="m.plan || m.lost" class="wm" :title="`Факт ${fmtMoney(m.real)} из ${fmtMoney(m.plan)}${m.lost ? `, потеряно ${fmtMoney(m.lost)}` : ''}${m.off ? `, отменено ${m.off} из ${m.all} (${m.offPct}%)` : ''}`">
    <span class="top"><b>{{ fmtMoney(m.real) }}</b><small>из {{ fmtMoney(m.plan) }}</small></span>
    <span v-if="m.lost || m.off" class="lost">−{{ fmtMoney(m.lost) }} отмены<template v-if="m.off"> · {{ m.offPct }}%</template></span>
  </div>
</template>
<style scoped>
.wm { flex: none; display: grid; justify-items: end; padding: 4px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); line-height: 1.15 }
.top { display: flex; align-items: baseline; gap: 5px }
b { font-size: 18px; font-weight: 900; color: var(--green-d) } small { font-size: 13px; font-weight: 800; color: var(--hint) }
.lost { font-size: 11px; font-weight: 800; color: var(--red-d) }
html[data-theme='dark'] b { color: var(--green) } html[data-theme='dark'] .lost { color: var(--red) }
</style>

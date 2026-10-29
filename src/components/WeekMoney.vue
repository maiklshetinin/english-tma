<script setup>
// Деньги недели — две цифры: факт (проведённые уроки) и план (все уроки недели); под ними мелко красным — сколько потеряно из-за отмен учеников.
import { fmtMoney } from '../utils/price'
defineProps({ m: { type: Object, required: true } })      // { real, plan, lost }
</script>
<template>
  <div v-if="m.plan || m.lost" class="wm" :title="`Факт ${fmtMoney(m.real)} из ${fmtMoney(m.plan)}${m.lost ? `, потеряно ${fmtMoney(m.lost)}` : ''}`">
    <span class="top"><b>{{ fmtMoney(m.real) }}</b><small>из {{ fmtMoney(m.plan) }}</small></span>
    <span v-if="m.lost" class="lost">−{{ fmtMoney(m.lost) }} отмены</span>
  </div>
</template>
<style scoped>
.wm { flex: none; display: grid; justify-items: end; padding: 4px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); line-height: 1.15 }
.top { display: flex; align-items: baseline; gap: 5px }
b { font-size: 18px; font-weight: 900; color: var(--green-d) } small { font-size: 13px; font-weight: 800; color: var(--hint) }
.lost { font-size: 11px; font-weight: 800; color: var(--red-d) }
html[data-theme='dark'] b { color: var(--green) } html[data-theme='dark'] .lost { color: var(--red) }
</style>

<script setup>
// Деньги недели — две цифры: факт (проведённые уроки) и план (все уроки недели). Отменённые учениками в план не входят.
import { fmtMoney, fmtMoneyShort } from '../utils/price'
defineProps({ m: { type: Object, required: true } })      // { real, plan, lost }
</script>
<template>
  <div v-if="m.plan" class="wm" :title="`Факт ${fmtMoney(m.real)} из ${fmtMoney(m.plan)}`">
    <b>{{ fmtMoneyShort(m.real) }}</b><small>из {{ fmtMoneyShort(m.plan) }}</small>
  </div>
</template>
<style scoped>
.wm { flex: none; display: flex; align-items: baseline; gap: 5px; padding: 6px 12px; border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 12px; background: var(--card) }
b { font-size: 18px; font-weight: 900; color: var(--green-d) } small { font-size: 13px; font-weight: 800; color: var(--hint) }
html[data-theme='dark'] b { color: var(--green) }
</style>

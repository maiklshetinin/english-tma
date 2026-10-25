<script setup>
import { computed } from 'vue'
import { student, state } from '../store/mock'
import { useTelegram } from '../composables/useTelegram'
import AppIcon from './AppIcon.vue'
const { openChat } = useTelegram()
const p = computed(() => student.value.payment)
const st = computed(() => ({ paid: ['Оплачено', 'ok'], due: ['Ожидает оплаты', 'warn'], overdue: ['Просрочено', 'bad'] }[p.value.status]))
</script>
<template>
  <div class="card">
    <div class="row"><h3 style="display:flex;gap:8px;align-items:center"><AppIcon name="wallet" /> Подписка</h3><span class="badge" :class="st[1]">{{ st[0] }}</span></div>
    <div class="hint">Действует до {{ p.until }}</div>
    <div class="bar"><i :style="{ width: p.lessonsLeft / p.packageSize * 100 + '%' }" /></div>
    <div class="row"><span>Осталось уроков: <b>{{ p.lessonsLeft }}</b> из {{ p.packageSize }}</span>
      <button class="btn ghost" @click="openChat(state.teacher.username)">Продлить</button></div>
  </div>
</template>
<style scoped>
.bar { height: 14px; border-radius: 9px; background: var(--border); margin: 12px 0; overflow: hidden }
.bar i { display: block; height: 100%; background: var(--green); border-radius: 9px; box-shadow: inset 0 -3px 0 rgba(0,0,0,.12) }
</style>

<script setup>
import { computed } from 'vue'
import { student } from '../store/mock'
import ProgressRing from './ProgressRing.vue'
const pay = computed(() => ({
  paid: { text: 'Оплачено', cls: 'ok' }, due: { text: 'Ожидает оплаты', cls: 'warn' }, overdue: { text: 'Просрочено', cls: 'bad' },
}[student.value.payment.status]))
</script>

<template>
  <section class="grid">
    <div class="card m"><div class="big">🔥 {{ student.streak }}</div><div class="hint">дней подряд</div></div>
    <div class="card m"><ProgressRing :value="student.progress" /><div class="hint">прогресс · {{ student.level }}</div></div>
    <div class="card m wide">
      <div><div class="hint">Оплата</div><span class="badge" :class="pay.cls">{{ pay.text }}</span></div>
      <div class="hint">до {{ student.payment.until }} · осталось уроков: {{ student.payment.lessonsLeft }}</div>
    </div>
  </section>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.m { display: grid; justify-items: center; align-content: center; gap: 6px; text-align: center; }
.big { font-size: 34px; font-weight: 800; }
.wide { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; text-align: left; }
</style>

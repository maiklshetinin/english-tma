<script setup>
import { student, progressPct } from '../store/mock'
import AppIcon from './AppIcon.vue'
import ProgressRing from './ProgressRing.vue'
</script>
<template>
  <section class="g">
    <div class="card m"><AppIcon name="flame" :size="30" style="color:#ff9500" /><b>{{ student.streak }}</b><span class="hint">дней подряд</span></div>
    <div class="card m"><AppIcon name="coin" :size="30" style="color:#ffcc00" /><b>{{ student.coins }}</b><span class="hint">монет</span></div>
    <div class="card m wide"><ProgressRing :value="progressPct" :size="72" /><div><b>Общий прогресс</b><div class="hint">Уровень {{ student.level }}</div></div></div>
  </section>
</template>
<style scoped>
.g { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.m { display: grid; justify-items: center; gap: 4px; text-align: center; } .m b { font-size: 26px; }
.wide { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-start; gap: 16px; text-align: left; }
.wide b { font-size: 18px; }
</style>

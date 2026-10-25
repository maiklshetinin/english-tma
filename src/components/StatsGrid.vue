<script setup>
import { student, progressPct } from '../store/mock'
import AppIcon from './AppIcon.vue'
import ProgressRing from './ProgressRing.vue'
import WordsRing from './WordsRing.vue'
</script>
<template>
  <section class="g">
    <div class="card m"><AppIcon name="flame" :size="30" style="color:var(--orange)" /><b>{{ student.streak }}</b><span class="hint">дней подряд</span></div>
    <div class="card m"><ProgressRing :value="progressPct" :size="76" /><span class="hint">прогресс · {{ student.level }}</span></div>
    <div class="card m w"><WordsRing :user-key="student.id" :size="76" /></div>
  </section>
</template>
<style scoped>
.g { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.m { display: grid; justify-items: center; align-content: center; gap: 4px; text-align: center; } .m b { font-size: 26px; }
.w { grid-column: 1 / -1 }
</style>

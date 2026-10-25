<script setup>
import { student, progressPct } from '../store/mock'
import ProgressRing from './ProgressRing.vue'
import WordsRing from './WordsRing.vue'
</script>
<template>
  <section class="g">
    <div class="card m"><WordsRing :user-key="student.id" :size="76" /></div>
    <div class="card m"><ProgressRing :value="progressPct" :size="76" /><span class="hint">прогресс · {{ student.level }}</span></div>
  </section>
</template>
<style scoped>
.g { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.m { display: grid; justify-items: center; align-content: start; gap: 4px; text-align: center; }
</style>

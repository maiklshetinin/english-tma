<script setup>
import { nextLesson, state } from '../store/mock'
import MetricsRow from '../components/MetricsRow.vue'
</script>
<template>
  <div class="page">
    <MetricsRow />
    <div class="card" v-if="nextLesson">
      <h3>Ближайший урок</h3>
      <div>{{ nextLesson.date }} · {{ nextLesson.time }}</div>
      <div class="hint">{{ nextLesson.topic }}</div>
      <a :href="nextLesson.link" target="_blank"><button class="btn" style="margin-top:12px">Присоединиться</button></a>
    </div>
    <div class="card" @click="state.tab = 'homework'"><h3>Домашка</h3><div class="hint">Откройте вкладку «ДЗ», чтобы увидеть активные задания</div></div>
  </div>
</template>

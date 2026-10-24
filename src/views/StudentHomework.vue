<script setup>
import { computed } from 'vue'
import { myHomework } from '../store/mock'
const active = computed(() => myHomework.value.filter(h => !h.done))
const done = computed(() => myHomework.value.filter(h => h.done))
</script>
<template>
  <div class="page">
    <h2>Активные</h2>
    <div class="card" v-for="h in active" :key="h.id">
      <div class="row"><h3>{{ h.title }}</h3><span class="badge warn">до {{ h.due }}</span></div>
      <div class="hint">{{ h.description }}</div>
      <button class="btn" style="margin-top:12px" @click="h.done = true">Отметить выполненным</button>
    </div>
    <div v-if="!active.length" class="hint">Все задания выполнены 🎉</div>
    <h2>Выполненные</h2>
    <div class="card" v-for="h in done" :key="h.id" style="opacity:.7"><h3>✅ {{ h.title }}</h3></div>
  </div>
</template>

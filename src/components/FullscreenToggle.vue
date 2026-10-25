<script setup>
// Показывается только в Telegram на компьютере (где окно мини-приложения узкое).
import { fs, toggleFullscreen } from '../composables/useFullscreen'
</script>
<template>
  <div v-if="fs.available" class="card row">
    <div><b>Полный экран</b><div class="hint">{{ fs.on ? 'Включён: широкая раскладка с таблицей и учениками' : 'Окно Telegram узкое — на весь экран удобнее' }}</div></div>
    <button class="btn ghost" @click="toggleFullscreen">{{ fs.on ? 'Свернуть' : 'Развернуть' }}</button>
  </div>
</template>

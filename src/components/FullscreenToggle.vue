<script setup>
// Показывается только в Telegram на компьютере (где окно мини-приложения узкое).
import { fs, toggleFullscreen } from '../composables/useFullscreen'
</script>
<template>
  <div v-if="fs.available" class="card row">
    <div><b>Полный экран</b><div class="hint">{{ fs.on ? 'Включён: широкая раскладка. «Свернуть» вернёт обычное окно' : 'Широкая раскладка с таблицей. Закрывает весь экран, включая панель задач' }}</div></div>
    <button class="btn ghost" @click="toggleFullscreen">{{ fs.on ? 'Свернуть' : 'Развернуть' }}</button>
  </div>
</template>

<script setup>
// Единая кнопка «назад» по всему приложению: квадратная кнопка со стрелкой «‹», без подписи — куда ведёт, видно в подсказке (title).
// <BackButton to="Колоды" @click="back" />
import AppIcon from './AppIcon.vue'
defineProps({ to: { type: String, default: '' } })      // куда вернёт: «Колоды», «Главная», «Курсы»…
</script>
<template>
  <button class="icon-btn back-btn" :title="to || 'Назад'" :aria-label="to ? `Назад: ${to}` : 'Назад'"><AppIcon name="back" :size="20" /></button>
</template>

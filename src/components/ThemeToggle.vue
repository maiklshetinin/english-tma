<script setup>
// Кнопка темы вверху справа: светлая ↔ тёмная (по умолчанию — как в Telegram / системе, выбор запоминается).
import { theme, toggleTheme } from '../composables/useTelegram'
</script>

<template>
  <button class="tt" :title="theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'" :aria-label="theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'" @click="toggleTheme">
    <svg v-if="theme === 'dark'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    <svg v-else viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
  </button>
</template>

<style scoped>
.tt { flex: none; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: var(--card); color: var(--hint); box-shadow: 0 2px 10px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04); cursor: pointer }
.tt:hover { color: var(--text) }
.tt svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
@media (max-width: 719px) { .tt { width: 30px; height: 30px } .tt svg { width: 15px; height: 15px } }
</style>

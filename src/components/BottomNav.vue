<script setup>
import { state, TABS, needsPayment } from '../store/app'
import { useTelegram } from '../composables/useTelegram'
import AppIcon from './AppIcon.vue'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const { haptic } = useTelegram()
const go = (id) => { state.tab = id; state.selectedStudentId = null; haptic('light') }
</script>

<template>
  <nav class="nav">
    <button v-for="t in TABS[auth.role]" :key="t.id" :class="{ on: state.tab === t.id }" @click="go(t.id)">
      <span class="ic"><AppIcon :name="t.icon" :size="24" /><i v-if="auth.role === 'student' && t.id === 'profile' && needsPayment" class="dot" /></span>
      <span class="lb">{{ t.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
/* Телефон: плоская нижняя панель; десктоп: плавающий левый рейл */
.nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 4px; padding: 8px 8px calc(8px + var(--safe-b)); z-index: 10;
  background: var(--card); border-top: 2px solid var(--border) }
button { flex: 1; min-width: 0; border: 2px solid transparent; background: none; border-radius: 14px; padding: 6px 2px; color: var(--hint-2);
  display: grid; justify-items: center; gap: 2px; font: inherit; cursor: pointer; transition: background .12s, color .12s }
button:hover { background: var(--surface) }
.ic { position: relative; display: grid } .lb { font-size: 11px; font-weight: 800 }
.dot { position: absolute; top: -2px; right: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--red); border: 2px solid var(--card) }
button.on { background: var(--blue-l); border-color: var(--blue); color: var(--blue) }
@media (min-width: 1024px) {
  .nav { left: 24px; right: auto; top: 50%; bottom: auto; transform: translateY(-50%); width: 92px; flex-direction: column; padding: 10px;
    border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 24px }
  button { padding: 10px 4px }
}
</style>

<script setup>
import { state, TABS, needsPayment } from '../store/mock'
import { useTelegram } from '../composables/useTelegram'
import AppIcon from './AppIcon.vue'
const { haptic } = useTelegram()
const go = (id) => { state.tab = id; haptic('light') }
</script>

<template>
  <nav class="nav">
    <button v-for="t in TABS[state.role]" :key="t.id" :class="{ on: state.tab === t.id }" @click="go(t.id)">
      <span class="ic"><AppIcon :name="t.icon" :size="24" /><i v-if="state.role === 'student' && t.id === 'profile' && needsPayment" class="dot" /></span>
      <span class="lb">{{ t.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.nav { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(12px + var(--safe-b));
  width: min(calc(100% - 32px), 440px); display: flex; padding: 8px; gap: 4px; z-index: 10;
  background: color-mix(in srgb, var(--card) 85%, transparent); backdrop-filter: blur(18px);
  border-radius: 28px; box-shadow: 0 8px 30px rgba(0,0,0,.16); }
button { flex: 1; border: 0; background: none; border-radius: 20px; padding: 8px 4px; color: var(--hint);
  display: grid; justify-items: center; gap: 2px; font: inherit; cursor: pointer; transition: .2s; }
.ic { position: relative; display: grid; } .lb { font-size: 11px; font-weight: 600; }
.dot { position: absolute; top: -2px; right: -4px; width: 9px; height: 9px; border-radius: 50%; background: var(--bad); border: 2px solid var(--card); }
button.on { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
/* Десктоп: панель превращается в левый рейл */
@media (min-width: 1024px) {
  .nav { left: 24px; top: 50%; bottom: auto; transform: translateY(-50%); width: 92px; flex-direction: column; }
  button { padding: 12px 4px; }
}
</style>

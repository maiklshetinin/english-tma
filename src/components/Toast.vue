<script setup>
import { toast, hideToast } from '../composables/useToast'
const undo = () => { toast.undo?.(); hideToast() }
</script>
<template>
  <Transition name="t">
    <div v-if="toast.open" class="toast" :class="toast.kind" role="status">
      <span>{{ toast.text }}</span><button v-if="toast.undo" @click="undo">Отменить</button>
    </div>
  </Transition>
</template>
<style scoped>
.toast { position: fixed; left: 50%; translate: -50% 0; bottom: calc(86px + var(--safe-b)); z-index: 40; display: flex; align-items: center; gap: 14px; max-width: min(92vw, 460px);
  padding: 12px 16px; border-radius: 16px; border: 1px solid var(--green); background: var(--green-l); color: var(--green-d); font-weight: 800; font-size: 15px }
.toast.bad { border-color: var(--red); background: var(--red-l); color: var(--red-d) }
.toast button { border: 0; background: none; font: inherit; font-weight: 800; font-size: 14px; color: inherit; cursor: pointer; padding: 4px; text-decoration: underline }
.t-enter-active, .t-leave-active { transition: opacity .18s, transform .18s } .t-enter-from, .t-leave-to { opacity: 0; transform: translateY(12px) }
@media (min-width: 1024px) { .toast { bottom: 28px } }
</style>

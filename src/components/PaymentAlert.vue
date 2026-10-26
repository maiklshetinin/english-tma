<script setup>
// Показывается над лентой только если оплата требует внимания; закрывается крестиком.
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { student, needsPayment } from '../store/app'
import AppIcon from './AppIcon.vue'
const closed = ref(false)
const router = useRouter()
const text = computed(() => student.value.payment.status !== 'paid' ? 'Ожидается оплата занятий' : `Осталось уроков: ${student.value.payment.lessonsLeft}`)
</script>
<template>
  <div v-if="needsPayment && !closed" class="alert card" @click="router.push({ name: 'profile' })">
    <AppIcon name="wallet" /><span>{{ text }} · <u>Подробнее</u></span>
    <button @click.stop="closed = true" aria-label="Закрыть"><AppIcon name="x" :size="18" /></button>
  </div>
</template>
<style scoped>
.alert { display: flex; align-items: center; gap: 10px; padding: 12px 16px; font-size: 15px; cursor: pointer; color: var(--warn) }
.alert span { flex: 1; color: var(--text) } .alert button { border: 0; background: none; color: var(--hint); cursor: pointer }
</style>

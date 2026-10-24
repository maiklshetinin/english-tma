<script setup>
import { auth } from '../composables/useTelegramAuth'
import { student } from '../store/mock'
import StatsGrid from '../components/StatsGrid.vue'
import PaymentCard from '../components/PaymentCard.vue'
</script>
<template>
  <div class="page">
    <div class="card row" style="justify-content:flex-start;gap:16px">
      <img v-if="auth.user?.photo_url" :src="auth.user.photo_url" width="64" height="64" style="border-radius:50%" />
      <div v-else class="av">{{ (auth.user?.first_name || student.name)[0] }}</div>
      <div><h3 style="margin:0">{{ auth.user?.first_name || student.name }}</h3>
        <div class="hint">{{ auth.user?.username ? '@' + auth.user.username : 'Ученик' }} · {{ student.level }}</div></div>
    </div>
    <StatsGrid /><PaymentCard />
  </div>
</template>
<style scoped>
.av { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: 28px; font-weight: 800; background: var(--accent); color: var(--accent-text) }
</style>

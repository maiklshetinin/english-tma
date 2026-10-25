<script setup>
import { auth } from '../composables/useTelegramAuth'
import { student } from '../store/mock'
import Avatar from '../components/Avatar.vue'
import StatsGrid from '../components/StatsGrid.vue'
import PaymentCard from '../components/PaymentCard.vue'
import DemoSwitch from '../components/DemoSwitch.vue'
import AppVersion from '../components/AppVersion.vue'
</script>
<template>
  <div class="page">
    <div class="card row" style="justify-content:flex-start;gap:16px">
      <Avatar :s="student" :size="64" />
      <div><h3 style="margin:0">{{ auth.user?.first_name || student.name }}</h3>
        <div class="hint">{{ auth.user?.username ? '@' + auth.user.username : 'Ученик' }} · {{ student.level }}</div></div>
    </div>
    <StatsGrid /><PaymentCard /><DemoSwitch />
    <AppVersion />
  </div>
</template>

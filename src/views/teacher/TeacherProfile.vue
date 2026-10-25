<script setup>
import { computed } from 'vue'
import { auth } from '../../composables/useTelegramAuth'
import { state, scheduleLessons, weekDates } from '../../store/mock'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import DemoSwitch from '../../components/DemoSwitch.vue'
const name = computed(() => auth.user?.first_name || state.teacher.name)
const me = computed(() => ({ ...state.teacher, name: name.value }))     // запись преподавателя (photo_url — из Telegram)
const weekLessons = computed(() => { const w = weekDates(0); return scheduleLessons.value.filter(l => w.includes(l.node.date)).length })
const needPay = computed(() => state.students.filter(s => s.payment.status !== 'paid' || s.payment.lessonsLeft <= 2).length)
</script>
<template>
  <div class="page">
    <div class="card row" style="justify-content:flex-start;gap:16px">
      <Avatar :s="me" :size="64" />
      <div><h3 style="margin:0">{{ name }}</h3><div class="hint">@{{ auth.user?.username || state.teacher.username }} · Преподаватель</div></div>
    </div>
    <section class="g">
      <div class="card m"><AppIcon name="users" :size="30" style="color:var(--blue)" /><b>{{ state.students.length }}</b><span class="hint">учеников</span></div>
      <div class="card m"><AppIcon name="calendar" :size="30" style="color:var(--green)" /><b>{{ weekLessons }}</b><span class="hint">уроков на неделе</span></div>
      <div class="card m wide"><AppIcon name="wallet" :size="30" style="color:var(--orange)" /><div><b>{{ needPay }}</b><div class="hint">учеников с оплатой, требующей внимания</div></div></div>
    </section>
    <DemoSwitch />
  </div>
</template>
<style scoped>
.g { display: grid; grid-template-columns: 1fr 1fr; gap: 14px } .m { display: grid; justify-items: center; gap: 4px; text-align: center } .m b { font-size: 26px }
.wide { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-start; gap: 16px; text-align: left } .wide b { font-size: 22px }
</style>

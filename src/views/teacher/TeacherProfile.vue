<script setup>
import { computed } from 'vue'
import { weekDates } from '../../store/app'
import WordsRing from '../../components/WordsRing.vue'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import DemoSwitch from '../../components/DemoSwitch.vue'
import AppVersion from '../../components/AppVersion.vue'
import LogoutButton from '../../components/LogoutButton.vue'
import PingButton from '../../components/PingButton.vue'
import { useStudentsStore } from '../../stores/students'
import { useScheduleStore } from '../../stores/schedule'
import { useAuthStore } from '../../stores/auth'
const auth = useAuthStore()
const studentStore = useStudentsStore()
const scheduleStore = useScheduleStore()
const name = computed(() => auth.user?.first_name || auth.teacher.name)
const me = computed(() => ({ ...auth.teacher, name: name.value }))     // запись преподавателя (photoUrl — из Telegram)
const weekLessons = computed(() => { const w = weekDates(0); return scheduleStore.lessons.filter(l => w.includes(l.date)).length })
const needPay = computed(() => studentStore.list.filter(s => s.payment.status !== 'paid' || s.payment.lessonsLeft <= 2).length)
</script>
<template>
  <div class="page">
    <div class="card row" style="justify-content:flex-start;gap:16px">
      <Avatar :s="me" :size="64" />
      <div><h3 style="margin:0">{{ name }}</h3><div class="hint">@{{ auth.user?.username || auth.teacher.username }} · Преподаватель</div></div>
    </div>
    <section class="g">
      <div class="card m"><AppIcon name="users" :size="30" style="color:var(--blue)" /><b>{{ studentStore.list.length }}</b><span class="hint">учеников</span></div>
      <div class="card m"><AppIcon name="calendar" :size="30" style="color:var(--green)" /><b>{{ weekLessons }}</b><span class="hint">уроков на неделе</span></div>
      <div class="card m wide"><AppIcon name="wallet" :size="30" style="color:var(--orange)" /><div><b>{{ needPay }}</b><div class="hint">учеников с оплатой, требующей внимания</div></div></div>
    </section>
    <div class="card" style="display:grid;place-items:center"><WordsRing user-key="teacher" :size="76" /></div>
    <!-- Редактор курсов (черновик): холст как в Figma, хранится только в этом браузере -->
    <RouterLink :to="{ name: 'courses' }" class="card ce-link">
      <span class="ce-ic"><AppIcon name="route" :size="24" /></span>
      <span class="ce-tx"><b>Редактор курсов</b><small>холст как в Figma · черновик</small></span>
      <span class="ce-go">›</span>
    </RouterLink>
    <DemoSwitch />
    <PingButton />
    <LogoutButton />
    <AppVersion />
  </div>
</template>
<style scoped>
.g { display: grid; grid-template-columns: 1fr 1fr; gap: 14px } .m { display: grid; justify-items: center; gap: 4px; text-align: center } .m b { font-size: 26px }
.wide { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-start; gap: 16px; text-align: left } .wide b { font-size: 22px }
.ce-link { display: flex; align-items: center; gap: 14px; padding: 14px 16px; color: var(--text); text-decoration: none }
.ce-link:hover { border-color: var(--blue) }
.ce-ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--purple); color: #fff; box-shadow: 0 4px 0 var(--purple-d) }
.ce-tx { flex: 1; display: grid } .ce-tx b { font-size: 16px } .ce-tx small { font-size: 13px; font-weight: 600; color: var(--hint) }
.ce-go { font-size: 24px; color: var(--hint-2) }
</style>

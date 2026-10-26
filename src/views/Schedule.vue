<script setup>
import { computed } from 'vue'
import { allLessons, fmtDate, relDay } from '../store/app'
import { useTelegram } from '../composables/useTelegram'
import AppIcon from '../components/AppIcon.vue'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const { openChat } = useTelegram()
const isTeacher = computed(() => auth.role === 'teacher')
const groups = computed(() => {
  const m = {}
  allLessons.value.filter(l => isTeacher.value || l.studentId === auth.currentStudentId).forEach(l => (m[l.date] ??= []).push(l))
  return Object.entries(m)
})
</script>
<template>
  <div class="page wide">
    <div v-for="[date, list] in groups" :key="date" class="grp">
      <div class="hint" style="font-weight:700;text-transform:capitalize;margin:6px 4px">{{ fmtDate(date) }} · {{ relDay(date) }}</div>
      <div class="card row" v-for="l in list" :key="l.id" :style="{ opacity: l.done ? .6 : 1 }">
        <div><b>{{ l.time }}</b> · {{ l.title }}<div class="hint" v-if="isTeacher">{{ l.studentName }}</div></div>
        <span class="badge" :class="l.done ? 'ok' : 'warn'">{{ l.done ? 'Проведён' : 'Запланирован' }}</span>
      </div>
    </div>
    <button v-if="!isTeacher" class="btn" @click="openChat(auth.teacher.username)"><AppIcon name="chat" :size="18" /> Написать учителю</button>
  </div>
</template>
<style scoped>.grp { display: grid; gap: 8px }</style>

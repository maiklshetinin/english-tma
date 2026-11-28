<script setup>
import { computed, onMounted } from 'vue'
import { useTelegram } from '../composables/useTelegram'
import AppIcon from '../components/AppIcon.vue'
import LessonsList from '../components/LessonsList.vue'
import LessonCalendar from '../components/LessonCalendar.vue'
import { useAuthStore } from '../stores/auth'
import { useScheduleStore } from '../stores/schedule'
import { load } from '../stores/lazy'
const auth = useAuthStore()
const { openChat } = useTelegram()
const isTeacher = computed(() => auth.role === 'teacher')
// Две живые недели приходят к открытию вкладки (stores/screens.ts: при входе — если ещё не читались, и когда человек вернулся в приложение).
// Ученику — ещё и вся история (календарь по месяцам); читается один раз, пока свежая (stores/lazy.ts).
onMounted(() => { if (!isTeacher.value) load('history', () => useScheduleStore().loadHistory()).catch(() => {}) })
</script>
<template>
  <div class="page wide">
    <LessonsList v-if="isTeacher" :student-id="null" />
    <LessonCalendar v-else :student-id="auth.currentStudentId" />
    <button v-if="!isTeacher" class="btn" style="width:100%;max-width:520px;justify-self:center" @click="openChat(auth.teacher.username)"><AppIcon name="chat" :size="18" /> Написать учителю</button>
  </div>
</template>

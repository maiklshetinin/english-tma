<script setup>
import { computed, onMounted } from 'vue'
import { useTelegram } from '../composables/useTelegram'
import AppIcon from '../components/AppIcon.vue'
import LessonsList from '../components/LessonsList.vue'
import { useAuthStore } from '../stores/auth'
import { useScheduleStore } from '../stores/schedule'
const auth = useAuthStore()
const { openChat } = useTelegram()
const isTeacher = computed(() => auth.role === 'teacher')
onMounted(() => { useScheduleStore().load().catch(() => {}) })      // при открытии вкладки перечитываем: преподаватель мог отметить урок проведённым
</script>
<template>
  <div class="page wide">
    <LessonsList :student-id="isTeacher ? null : auth.currentStudentId" />
    <button v-if="!isTeacher" class="btn" @click="openChat(auth.teacher.username)"><AppIcon name="chat" :size="18" /> Написать учителю</button>
  </div>
</template>

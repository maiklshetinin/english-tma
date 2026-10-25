<script setup>
import { computed, onMounted } from 'vue'
import { state, setRole } from './store/mock'
import { auth, authenticate, BOT_USERNAME } from './composables/useTelegramAuth'
import TelegramLogin from './components/TelegramLogin.vue'
import BottomNav from './components/BottomNav.vue'
import Toast from './components/Toast.vue'
import DragGhost from './components/DragGhost.vue'
import StudentPath from './views/StudentPath.vue'
import StudentCards from './views/StudentCards.vue'
import StudentProfile from './views/StudentProfile.vue'
import Schedule from './views/Schedule.vue'
import TeacherHome from './views/teacher/TeacherHome.vue'
import TeacherProfile from './views/teacher/TeacherProfile.vue'
import TeacherPath from './views/teacher/TeacherPath.vue'
import TeacherStudents from './views/teacher/TeacherStudents.vue'
import TeacherWords from './views/teacher/TeacherWords.vue'

const views = {
  student: { path: StudentPath, cards: StudentCards, lessons: Schedule, profile: StudentProfile },
  teacher: { home: TeacherHome, path: TeacherPath, students: TeacherStudents, words: TeacherWords, profile: TeacherProfile },
}
const current = computed(() => views[state.role][state.tab])
// В демо-режиме роль можно задать в URL: ?demo&role=teacher (переключатель — в «Профиле»)
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
onMounted(() => authenticate().then(() => { const r = new URLSearchParams(location.search).get('role'); if (demo && (r === 'teacher' || r === 'student')) setRole(r) }))
</script>

<template>
  <div v-if="auth.status === 'loading'" class="splash"><div class="spin" /></div>
  <div v-else-if="auth.status === 'login'" class="splash card">
    <h3>Вход</h3><p class="hint">Войдите через Telegram. Ученикам сначала нужна ссылка-приглашение от преподавателя: открыв её в Telegram, вы попадёте в приложение, и дальше можно входить здесь.</p>
    <TelegramLogin v-if="BOT_USERNAME" />
  </div>
  <div v-else-if="auth.status === 'error'" class="splash card">
    <h3>Не удалось войти</h3><p class="hint">{{ auth.error }}</p><button class="btn" @click="authenticate">Повторить</button>
  </div>
  <template v-else>
    <div class="shell">
      <main><component :is="current" :key="state.role + state.tab" /></main>
    </div>
    <BottomNav /><Toast /><DragGhost />
  </template>
</template>

<style>
.shell { padding-top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)) }
.splash { min-height: 60vh; display: grid; place-content: center; justify-items: center; gap: 12px; max-width: 360px; margin: 20vh auto 0; text-align: center }
.spin { width: 40px; height: 40px; border-radius: 50%; border: 5px solid var(--border); border-top-color: var(--green); animation: r .8s linear infinite }
@keyframes r { to { transform: rotate(360deg) } }
@media (min-width: 1024px) { .shell { padding-left: 124px } .page { padding-bottom: 40px } }
</style>

<script setup>
import { computed, onMounted } from 'vue'
import { state, setRole } from './store/mock'
import { auth, authenticate } from './composables/useTelegramAuth'
import BottomNav from './components/BottomNav.vue'
import StudentPath from './views/StudentPath.vue'
import StudentCards from './views/StudentCards.vue'
import StudentProfile from './views/StudentProfile.vue'
import Schedule from './views/Schedule.vue'
import TeacherHomework from './views/TeacherHomework.vue'
import TeacherDecks from './views/TeacherDecks.vue'
import TeacherRemind from './views/TeacherRemind.vue'

const views = {
  student: { path: StudentPath, cards: StudentCards, lessons: Schedule, profile: StudentProfile },
  teacher: { schedule: Schedule, homework: TeacherHomework, decks: TeacherDecks, remind: TeacherRemind },
}
const current = computed(() => views[state.role][state.tab])
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')   // демо-переключатель ролей
onMounted(authenticate)
</script>

<template>
  <div v-if="auth.status === 'loading'" class="splash"><div class="spin" /></div>
  <div v-else-if="auth.status === 'error'" class="splash card">
    <h3>Не удалось войти</h3><p class="hint">{{ auth.error }}</p><button class="btn" @click="authenticate">Повторить</button>
  </div>
  <template v-else>
    <div class="shell">
      <button v-if="demo" class="btn ghost demo" @click="setRole(state.role === 'student' ? 'teacher' : 'student')">
        Демо: {{ state.role === 'student' ? 'Ученик' : 'Учитель' }} ⇄
      </button>
      <main><component :is="current" :key="state.role + state.tab" /></main>
    </div>
    <BottomNav />
  </template>
</template>

<style>
.splash { min-height: 60vh; display: grid; place-content: center; justify-items: center; gap: 12px; max-width: 360px; margin: 20vh auto 0; text-align: center }
.spin { width: 40px; height: 40px; border-radius: 50%; border: 4px solid var(--bg); border-top-color: var(--accent); animation: r .8s linear infinite }
@keyframes r { to { transform: rotate(360deg) } }
.demo { position: fixed; top: calc(8px + var(--safe-b) * 0); right: 8px; z-index: 30; padding: 6px 10px; font-size: 12px }
@media (min-width: 1024px) { .shell { padding-left: 124px } .page { padding-bottom: 40px } }
</style>

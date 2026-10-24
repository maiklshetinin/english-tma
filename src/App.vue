<script setup>
import { computed } from 'vue'
import { state, setRole } from './store/mock'
import BottomNav from './components/BottomNav.vue'
import StudentHome from './views/StudentHome.vue'
import StudentHomework from './views/StudentHomework.vue'
import StudentCards from './views/StudentCards.vue'
import Schedule from './views/Schedule.vue'
import TeacherHomework from './views/TeacherHomework.vue'
import TeacherDecks from './views/TeacherDecks.vue'
import TeacherRemind from './views/TeacherRemind.vue'

const views = {
  student: { home: StudentHome, homework: StudentHomework, cards: StudentCards, schedule: Schedule },
  teacher: { schedule: Schedule, homework: TeacherHomework, decks: TeacherDecks, remind: TeacherRemind },
}
const current = computed(() => views[state.role][state.tab])
</script>

<template>
  <header class="page" style="padding-bottom:0">
    <!-- Демо-переключатель ролей: в продакшене определяйте роль по tg user id на бэкенде -->
    <div class="row">
      <strong>{{ state.role === 'student' ? '🎓 Ученик' : '👩‍🏫 Учитель' }}</strong>
      <button class="btn ghost" @click="setRole(state.role === 'student' ? 'teacher' : 'student')">Сменить роль</button>
    </div>
  </header>
  <main><component :is="current" :key="state.role + state.tab" /></main>
  <BottomNav />
</template>

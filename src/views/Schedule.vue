<script setup>
import { computed } from 'vue'
import { state, myLessons } from '../store/mock'
import { useTelegram } from '../composables/useTelegram'
const { openChat } = useTelegram()
const isTeacher = computed(() => state.role === 'teacher')
const list = computed(() => (isTeacher.value ? state.lessons : myLessons.value)
  .slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)))
const nameOf = (id) => state.students.find(s => s.id === id)?.name
</script>
<template>
  <div class="page">
    <div class="card" v-for="l in list" :key="l.id">
      <div class="row"><h3>{{ l.date }} · {{ l.time }}</h3><span v-if="isTeacher" class="badge ok">{{ nameOf(l.studentId) }}</span></div>
      <div class="hint">{{ l.topic }}</div>
    </div>
    <button v-if="!isTeacher" class="btn" @click="openChat(state.teacher.username)">💬 Написать учителю</button>
  </div>
</template>

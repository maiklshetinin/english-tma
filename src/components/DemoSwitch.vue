<script setup>
// Переключатель роли: виден в `npm run dev`, с ?demo в URL и — в Telegram — самому преподавателю (auth.teacher),
// чтобы он мог посмотреть приложение глазами ученика и вернуться обратно. Ученики его не видят.
import { state, setRole } from '../store/mock'
import { auth } from '../composables/useTelegramAuth'
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
</script>
<template>
  <div v-if="demo || auth.teacher" class="card row">
    <div><b>{{ demo ? 'Демо-режим' : 'Режим просмотра' }}</b><div class="hint">Сейчас: {{ state.role === 'student' ? 'ученик' : 'преподаватель' }}</div></div>
    <button class="btn ghost" :disabled="state.role === 'teacher' && !state.students.length" :title="state.role === 'teacher' && !state.students.length ? 'Сначала добавьте ученика' : ''" @click="setRole(state.role === 'student' ? 'teacher' : 'student')">{{ state.role === 'student' ? 'Я преподаватель' : 'Я ученик' }}</button>
  </div>
</template>

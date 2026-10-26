<script setup>
// Переключатель роли: виден в `npm run dev`, с ?demo в URL и — в Telegram — самому преподавателю (auth.isTeacher),
// чтобы он мог посмотреть приложение глазами ученика и вернуться обратно. Ученики его не видят.
import { useStudentsStore } from '../stores/students'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const studentStore = useStudentsStore()
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
</script>
<template>
  <div v-if="demo || auth.isTeacher" class="card row">
    <div><b>{{ demo ? 'Демо-режим' : 'Режим просмотра' }}</b><div class="hint">Сейчас: {{ auth.role === 'student' ? 'ученик' : 'преподаватель' }}</div></div>
    <button class="btn ghost" :disabled="auth.role === 'teacher' && !studentStore.list.length" :title="auth.role === 'teacher' && !studentStore.list.length ? 'Сначала добавьте ученика' : ''" @click="auth.setRole(auth.role === 'student' ? 'teacher' : 'student')">{{ auth.role === 'student' ? 'Я преподаватель' : 'Я ученик' }}</button>
  </div>
</template>

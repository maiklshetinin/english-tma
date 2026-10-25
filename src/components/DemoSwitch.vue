<script setup>
// Демо-переключатель ролей: виден в `npm run dev` или с ?demo в URL.
import { state, setRole } from '../store/mock'
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
</script>
<template>
  <div v-if="demo" class="card row">
    <div><b>Демо-режим</b><div class="hint">Сейчас: {{ state.role === 'student' ? 'ученик' : 'преподаватель' }}</div></div>
    <button class="btn ghost" @click="setRole(state.role === 'student' ? 'teacher' : 'student')">{{ state.role === 'student' ? 'Я преподаватель' : 'Я ученик' }}</button>
  </div>
</template>

<script setup>

import WordsApp from '../components/WordsApp.vue'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
</script>
<template><WordsApp :user-key="auth.currentStudentId" :can-manage="false" /></template>

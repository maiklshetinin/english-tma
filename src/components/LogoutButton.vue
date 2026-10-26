<script setup>
import { canLogout } from '../firebase'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
</script>
<template><button v-if="canLogout" class="btn ghost" @click="auth.logout()">Выйти</button></template>

<script setup>
import { canLogout, logout } from '../composables/useTelegramAuth'
</script>
<template><button v-if="canLogout" class="btn ghost" @click="logout">Выйти</button></template>

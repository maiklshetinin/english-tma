<script setup>
import { state } from '../store/mock'
import WordsApp from '../components/WordsApp.vue'
</script>
<template><WordsApp :user-key="state.currentStudentId" :can-manage="false" /></template>

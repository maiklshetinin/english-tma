<script setup>
// Раздел «Review» в меню: «Твой словарь» — слова и фразы из пройденных уроков курса и их сила (как Review в Busuu).
// Отдельный адрес #/review — обновление страницы оставляет здесь. Ответы пишет просмотр курса (CourseViewer → stores/review).
import ReviewPanel from '../components/ReviewPanel.vue'
import { useCourseMedia } from '../composables/useCourseMedia'
import { API, fb, isDemo } from '../firebase'

const { resolve } = useCourseMedia(!isDemo && !!API && !!fb)
</script>

<template>
  <div class="page wide review">
    <h1>Review</h1>
    <ReviewPanel :resolve="resolve" />
  </div>
</template>

<style scoped>
.review h1 { width: 100%; max-width: 760px; margin-left: auto; margin-right: auto }
</style>

<script setup>
// Раздел «Review» в меню: «Твой словарь» — слова и фразы из пройденных уроков курса и их сила (как Review в Busuu).
// Отдельный адрес #/review — обновление страницы оставляет здесь. Ответы пишет просмотр курса (CourseViewer → stores/review).
import ReviewPanel from '../components/ReviewPanel.vue'
import { useCourseMedia } from '../composables/useCourseMedia'
import { API, fb, isDemo } from '../firebase'
import { onMounted } from 'vue'
import { syncReview } from '../stores/review'
import { useAuthStore } from '../stores/auth'

const { resolve } = useCourseMedia(!isDemo && !!API && !!fb)
const auth = useAuthStore()
onMounted(() => syncReview(auth.user?.id))                 // свой словарь с сервера (и отправить, что не ушло)
</script>

<template>
  <div class="page wide review">
    <div class="hrow"><h1>Review</h1><router-link :to="{ name: 'review-algo' }" class="alg">Алгоритм повторений ›</router-link></div>
    <ReviewPanel :resolve="resolve" />
  </div>
</template>

<style scoped>
.hrow { width: 100%; max-width: 760px; margin: 0 auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap } .hrow h1 { flex: 1 }
.alg { font-size: 14px; font-weight: 800; color: #1cb0f6; text-decoration: none; white-space: nowrap }
</style>

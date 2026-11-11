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
    <!-- без большого заголовка «Review» (он уже в меню): сразу вкладки, справа — ссылка на алгоритм -->
    <ReviewPanel :resolve="resolve"><template #end><router-link :to="{ name: 'review-algo' }" class="alg">Алгоритм повторений ›</router-link></template></ReviewPanel>
  </div>
</template>

<style scoped>
.review { padding-top: 6px } .alg { font-size: 13px; font-weight: 800; color: #1cb0f6; text-decoration: none; white-space: nowrap }
</style>

<script setup>
// Карточка ученика у преподавателя → «Review»: словарь ученика — слова и фразы из уроков курса и их сила (только посмотреть).
// С сервера: GET /review?studentId=… (server/review.ts). Без сервера (демо) — пусто, с подсказкой.
import { ref, watch } from 'vue'
import { apiRequest, isDemo, API, fb } from '../firebase'
import { useCourseMedia } from '../composables/useCourseMedia'
import ReviewPanel from './ReviewPanel.vue'

const props = defineProps({ studentId: { type: [String, Number], required: true } })
const online = !isDemo && !!API && !!fb
const { resolve } = useCourseMedia(online)
const items = ref({}), err = ref(''), loading = ref(false)
async function load(id) {
  items.value = {}; err.value = ''
  if (!online) return
  loading.value = true
  try { const r = await apiRequest(`/review?studentId=${encodeURIComponent(id)}`); if (!r.ok) throw new Error(`(${r.status})`); items.value = (await r.json()).items ?? {} }
  catch (e) { err.value = e.message } finally { loading.value = false }
}
watch(() => props.studentId, load, { immediate: true })
</script>

<template>
  <p v-if="err" class="hint">Не удалось загрузить словарь ученика {{ err }}</p>
  <p v-else-if="loading" class="hint">Загрузка…</p>
  <ReviewPanel v-else :resolve="resolve" :items="items" readonly title="Словарь ученика" />
</template>

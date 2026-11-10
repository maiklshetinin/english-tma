<script setup>
// Карточка ученика у преподавателя → «Review»: словарь ученика — слова и фразы из уроков курса и их сила (только посмотреть).
// С сервера: GET /review?studentId=… (server/review.ts). Без сервера (демо) — пусто, с подсказкой.
// В реальном времени: пока карточка открыта, словарь тихо подтягивается раз в 5 с — ученик отвечает в уроке, а на графике
// сразу видно, куда ушло слово (ученик отправляет ответы пачкой примерно через 2 с).
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { apiRequest, isDemo, API, fb } from '../firebase'
import { useCourseMedia } from '../composables/useCourseMedia'
import ReviewPanel from './ReviewPanel.vue'
import { ask } from '../composables/useDialog'
import { showToast } from '../composables/useToast'

const props = defineProps({ studentId: { type: [String, Number], required: true } })
const online = !isDemo && !!API && !!fb
const { resolve } = useCourseMedia(online)
const items = ref({}), err = ref(''), loading = ref(false)
async function load(id, quiet = false) {
  if (!quiet) { items.value = {}; err.value = '' }
  if (!online) return
  if (!quiet) loading.value = true
  try {
    const r = await apiRequest(`/review?studentId=${encodeURIComponent(id)}`); if (!r.ok) throw new Error(`(${r.status})`)
    const next = (await r.json()).items ?? {}
    if (!quiet || JSON.stringify(next) !== JSON.stringify(items.value)) items.value = next            // не изменилось — не трогаем (график не мигает)
  } catch (e) { if (!quiet) err.value = e.message } finally { loading.value = false }
}
watch(() => props.studentId, (id) => load(id), { immediate: true })
let poll = null
onMounted(() => { poll = setInterval(() => { if (document.visibilityState === 'visible' && !loading.value && !err.value) load(props.studentId, true) }, 5000) })
onUnmounted(() => clearInterval(poll))
// «Сбросить прогресс»: словарь Review и прохождение всех курсов ученика — с нуля (назначения курсов остаются)
async function reset() {
  if (!(await ask('Вы уверены, что хотите удалить прогресс ученика?', { text: 'Словарь Review и прохождение всех курсов начнутся с нуля. Назначенные курсы останутся. Вернуть прогресс будет нельзя.', ok: 'Удалить прогресс', danger: true }))) return
  const r = await apiRequest(`/students/${encodeURIComponent(props.studentId)}/progress/reset`, { method: 'POST', body: JSON.stringify({ what: 'all' }) }).catch(() => null)
  if (!r?.ok) return showToast('Не удалось сбросить — попробуйте ещё раз', null, 'bad')
  showToast('Прогресс ученика сброшен'); load(props.studentId)
}
</script>

<template>
  <p v-if="err" class="hint">Не удалось загрузить словарь ученика {{ err }}</p>
  <p v-else-if="loading" class="hint">Загрузка…</p>
  <ReviewPanel v-else :resolve="resolve" :items="items" readonly title="Словарь ученика">
    <template #actions><button v-if="online" class="rst" title="Сбросить прогресс ученика: словарь и прохождение курсов" @click="reset">Очистить</button></template>
  </ReviewPanel>
</template>

<style scoped>
.rst { border: 0; border-radius: 12px; padding: 8px 14px; background: #f0f1f3; font: inherit; font-weight: 900; color: #555; cursor: pointer }          /* как «Очистить» в своём Review */
</style>

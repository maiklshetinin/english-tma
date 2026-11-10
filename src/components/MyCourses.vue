<script setup>
// «Путь» ученика: курсы, которые назначил преподаватель (server/learn.ts). Несколько — переключатель сверху.
// Курс проходится тем же рельсом, что в «Как видит ученик»; прогресс — свой, на сервере. Без сервера (демо) — ничего не показываем.
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { API, apiRequest, fb, isDemo } from '../firebase'
import CourseViewer from './CourseViewer.vue'

const online = !isDemo && !!API && !!fb
const KEY = 'tma.myCourse.v1'
const list = ref([]), sel = ref(null), err = ref('')
const route = useRoute()                 // курс из адреса (#/path?c=…) — после перезагрузки тот же
const remembered = () => { try { return localStorage.getItem(KEY) } catch { return null } }
async function load() {
  if (!online) return
  try { const r = await apiRequest('/my/courses'); if (!r.ok) throw new Error(`(${r.status})`); list.value = (await r.json()).courses; err.value = '' }
  catch (e) { err.value = e.message }
  if (!list.value.some(c => c.id === sel.value)) sel.value = list.value.find(c => c.id === route.query.c)?.id ?? list.value.find(c => c.id === remembered())?.id ?? list.value[0]?.id ?? null
}
watch(sel, (v) => { try { if (v) localStorage.setItem(KEY, v) } catch { /* приватный режим */ } })
onMounted(load)
</script>

<template>
  <p v-if="err" class="hint">Не удалось загрузить курсы {{ err }}</p>
  <template v-if="list.length">
    <div v-if="list.length > 1" class="mc">
      <button v-for="c in list" :key="c.id" :class="{ on: sel === c.id }" @click="sel = c.id">{{ c.title || 'Курс' }}<small>{{ c.done }} из {{ c.total }}</small></button>
    </div>
    <CourseViewer :id="sel" student />
  </template>
</template>

<style scoped>
.mc { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center }
.mc button { border: 0; border-radius: 12px; padding: 8px 14px; font: inherit; font-size: 14px; font-weight: 800; background: var(--card); color: var(--hint); cursor: pointer; box-shadow: 0 0 0 1px var(--border); display: grid; justify-items: center }
.mc button small { font-size: 11px; font-weight: 700 } .mc button.on { background: var(--blue-l); color: var(--blue); box-shadow: 0 0 0 2px var(--blue) }
</style>

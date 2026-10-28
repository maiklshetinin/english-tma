<script setup>
// Вкладка «Курсы» преподавателя: список курсов (общий для всех преподавателей) и «+ Новый курс».
// Нажатие на курс — редактор (холст + рельс, #/courses?id=…). Курс хранится на сервере (server/courses.ts);
// без сервера (демо) — один курс из этого браузера.
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { API, apiRequest, fb, isDemo } from '../firebase'
import { showToast } from '../composables/useToast'
import AppIcon from './AppIcon.vue'
const router = useRouter()
const online = !isDemo && !!API && !!fb
const list = ref(null), err = ref('')
const LOCAL = 'tma.courseRail.v1'
async function load() {
  if (!online) {
    try { const d = JSON.parse(localStorage.getItem(LOCAL)); list.value = d?.items ? [{ id: d.id || 'local', title: d.title, count: d.items.length }] : [] } catch { list.value = [] }
    return
  }
  try { const r = await apiRequest('/courses'); if (!r.ok) throw new Error(`(${r.status})`); list.value = (await r.json()).courses; err.value = '' }
  catch (e) { err.value = e.message; list.value ??= [] }
}
onMounted(load)
const open = (id) => router.push({ name: 'courses', query: { id } })
const ago = (t) => {
  if (!t) return ''
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'элемент' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'элемента' : 'элементов')
async function remove(c) {
  if (!confirm(`Удалить курс «${c.title}»? Кружки и фото этого курса удалятся из хранилища.`)) return
  if (!online) { localStorage.removeItem(LOCAL); return load() }
  const r = await apiRequest(`/courses/${c.id}`, { method: 'DELETE' }).catch(() => null)
  if (!r?.ok) return showToast('Не удалось удалить курс', null, 'bad')
  showToast(`Курс удалён: ${c.title}`); load()
}
</script>
<template>
  <div class="cl">
    <div class="ch"><h2>Курсы</h2><button class="btn sm" @click="open('new')"><AppIcon name="plus" :size="16" /> Новый курс</button></div>
    <p v-if="err" class="hint">Не удалось загрузить курсы {{ err }}</p>
    <div v-if="list === null" class="card sk" />
    <div v-else-if="!list.length" class="card empty">
      <b>Курсов пока нет</b><span>Курс — это путь ученика: задания по порядку на одной линии, кружки из Telegram, фото. Собирается на холсте, как во Figma.</span>
      <button class="btn" @click="open('new')">Создать первый курс</button>
    </div>
    <div v-else class="grid">
      <div v-for="c in list" :key="c.id" class="card cc" role="button" tabindex="0" @click="open(c.id)" @keydown.enter="open(c.id)">
        <span class="ic"><AppIcon name="route" :size="24" /></span>
        <span class="tx"><b>{{ c.title }}</b><small>{{ c.count }} {{ word(c.count) }}<template v-if="c.updatedAt"> · изменён {{ ago(c.updatedAt) }}</template></small></span>
        <button class="del" title="Удалить курс" @click.stop="remove(c)"><AppIcon name="trash" :size="18" /></button>
        <span class="go">›</span>
      </div>
    </div>
  </div>
</template>
<style scoped>
.cl { display: grid; gap: 10px; margin-bottom: 18px }
.ch { display: flex; align-items: center; justify-content: space-between; gap: 10px } .ch h2 { margin: 0 }
.grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) }
.cc { display: flex; align-items: center; gap: 14px; padding: 14px 16px; margin: 0; cursor: pointer; transition: border-color .1s }
.cc:hover { border-color: var(--blue) }
.ic { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--purple); color: #fff; box-shadow: 0 4px 0 var(--purple-d) }
.tx { flex: 1; display: grid; min-width: 0 } .tx b { font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .tx small { font-size: 13px; font-weight: 600; color: var(--hint) }
.del { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--hint-2); cursor: pointer; opacity: 0; transition: opacity .1s }
.cc:hover .del, .del:focus-visible { opacity: 1 } .del:hover { background: var(--red-l); color: var(--red-d) }
@media (hover: none) { .del { opacity: 1 } }
.go { font-size: 24px; color: var(--hint-2) }
.empty { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 24px } .empty span { max-width: 420px; color: var(--hint); font-size: 14px }
.sk { height: 74px; opacity: .5 }
</style>

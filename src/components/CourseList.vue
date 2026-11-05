<script setup>
// Вкладка «Курсы» преподавателя: список курсов (общий для всех преподавателей) и «+ Новый курс».
// Как в Figma: одно нажатие — выбрать курс (он показывается ниже, в «Как видит ученик»), двойное или карандаш — редактор; корзина — удалить (холст + рельс, #/courses?id=…). Курс хранится на сервере (server/courses.ts);
// без сервера (демо) — один курс из этого браузера.
import { ask } from '../composables/useDialog'
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { API, apiRequest, fb, isDemo } from '../firebase'
import { showToast } from '../composables/useToast'
import AppIcon from './AppIcon.vue'
const router = useRouter()
const props = defineProps({ selected: { type: String, default: null } })
const emit = defineEmits(['update:selected'])
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
// выбран первый курс, пока не выбрали другой
watch(list, (l) => { if (l?.length && !l.some(c => c.id === props.selected)) emit('update:selected', l[0].id) })
const open = (id) => router.push({ name: 'courses', query: { id } })
const ago = (t) => {
  if (!t) return ''
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'элемент' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'элемента' : 'элементов')
async function remove(c) {
  if (!(await ask(`Удалить курс «${c.title}»?`, { text: 'Кружки и фото этого курса удалятся из хранилища.', ok: 'Удалить', danger: true }))) return
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
      <div v-for="c in list" :key="c.id" class="card cc" :class="{ on: c.id === selected }" role="button" tabindex="0" title="Нажмите — посмотреть ниже, дважды — открыть в редакторе"
        @click="emit('update:selected', c.id)" @dblclick="open(c.id)" @keydown.enter="open(c.id)">
        <span class="ic"><AppIcon name="route" :size="24" /></span>
        <span class="tx"><b>{{ c.title }}</b><small>{{ c.count }} {{ word(c.count) }}<template v-if="c.updatedAt"> · изменён {{ ago(c.updatedAt) }}</template></small></span>
        <!-- как везде: справа карандаш (редактор) и корзина -->
        <button class="icon-btn" title="Редактировать курс" aria-label="Редактировать курс" @click.stop="open(c.id)" @dblclick.stop><AppIcon name="pencil" :size="20" /></button>
        <button class="icon-btn danger" title="Удалить курс" aria-label="Удалить курс" @click.stop="remove(c)" @dblclick.stop><AppIcon name="trash" :size="20" /></button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.cl { display: grid; gap: 10px; margin-bottom: 18px }
.ch { display: flex; align-items: center; justify-content: space-between; gap: 10px } .ch h2 { margin: 0 }
.grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) }
.cc { user-select: none; display: flex; align-items: center; gap: 10px; padding: 14px 16px; margin: 0; cursor: pointer; transition: border-color .1s }
.cc:hover { border-color: var(--blue) }
.cc .icon-btn { --ib: 40px; color: var(--hint) }
.ic { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--purple); color: #fff }
.tx { flex: 1; display: grid; min-width: 0 } .tx b { font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .tx small { font-size: 13px; font-weight: 600; color: var(--hint) }
.cc.on { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue) }
.empty { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 24px } .empty span { max-width: 420px; color: var(--hint); font-size: 14px }
.sk { height: 74px; opacity: .5 }
</style>

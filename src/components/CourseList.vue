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
    <!-- 24.11.2026: курсы — в шапке: слева плитки (вылезают к рейлу навигации, прокрутка — при наведении), справа «Новый курс»; заголовка «Курсы» нет -->
    <div class="ch">
      <div v-if="list === null" class="card sk" />
      <div v-else-if="list.length" class="grid">
        <div v-for="c in list" :key="c.id" class="card cc" :class="{ on: c.id === selected }" role="button" tabindex="0" :title="`Нажмите — посмотреть ниже, дважды — открыть в редакторе${c.updatedAt ? ' · изменён ' + ago(c.updatedAt) : ''}`"
          @click="emit('update:selected', c.id)" @dblclick="open(c.id)" @keydown.enter="open(c.id)">
          <span class="ic"><AppIcon name="route" :size="16" /></span>
          <span class="tx"><b>{{ c.title }}</b><small>{{ c.count }} {{ word(c.count) }}<template v-if="c.updatedAt"> · {{ ago(c.updatedAt) }}</template></small></span>
          <!-- как везде: справа карандаш (редактор) и корзина -->
          <button class="icon-btn" title="Редактировать курс" aria-label="Редактировать курс" @click.stop="open(c.id)" @dblclick.stop><AppIcon name="pencil" :size="13" /></button>
          <button class="icon-btn danger" title="Удалить курс" aria-label="Удалить курс" @click.stop="remove(c)" @dblclick.stop><AppIcon name="trash" :size="13" /></button>
        </div>
      </div>
      <span v-else class="sp" />
      <button class="btn sm" @click="open('new')"><AppIcon name="plus" :size="16" /> Новый курс</button>
    </div>
    <p v-if="err" class="hint">Не удалось загрузить курсы {{ err }}</p>
    <div v-if="list && !list.length" class="card empty">
      <b>Курсов пока нет</b><span>Курс — это путь ученика: задания по порядку на одной линии, кружки из Telegram, фото. Собирается на холсте, как во Figma.</span>
      <button class="btn" @click="open('new')">Создать первый курс</button>
    </div>
  </div>
</template>
<style scoped>
.cl { display: grid; gap: 6px; margin-bottom: 12px }
.ch { --bleed: max(0px, calc((100vw - 8px - 100%) / 2)); display: flex; align-items: center; gap: 10px; margin-left: calc(-1 * var(--bleed)) } .ch .btn { flex: none } .sp, .ch .sk { flex: 1 }
.grid { display: flex; gap: 8px; overflow-x: auto; overscroll-behavior-x: contain; flex: 1; min-width: 0; padding: 3px 12px 3px 12px }          /* 24.11.2026: курсы — одна строка на всю ширину экрана (вылезает за поля страницы); полоса прокрутки — только при наведении и только если не влезло */
@media (min-width: 1024px) { .ch { --bleed: max(0px, calc((100vw - 132px - 100%) / 2)) } }          /* слева — рейл навигации (124px) */
.grid::-webkit-scrollbar { height: 6px; background: transparent } .grid::-webkit-scrollbar-thumb { background: transparent }
.grid:hover::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, .28) } html[data-theme='dark'] .grid:hover::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .3) }
.grid > .cc { flex: 0 0 225px; box-sizing: border-box }          /* на четверть уже прежних 300px */
.cc { user-select: none; display: flex; align-items: center; gap: 6px; padding: 5px 8px; margin: 0; cursor: pointer; transition: border-color .1s }
.cc:hover { border-color: var(--blue) }
.cc { position: relative }
.cc .icon-btn { --ib: 22px; position: absolute; top: 3px; color: var(--hint); border-color: transparent; background: none } .cc .icon-btn:hover { background: var(--surface) }
.cc .icon-btn.danger { right: 4px } .cc .icon-btn:not(.danger) { right: 27px }          /* карандаш и корзина — мелко, в правом верхнем углу: тексту вся ширина */
.cc .tx b { padding-right: 50px }
.ic { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--purple); color: #fff }
.tx { flex: 1; display: grid; gap: 0; line-height: 1.15; min-width: 0 } .tx b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .tx small { font-size: 12px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--hint) }
.cc.on { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue) }
.empty { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 24px } .empty span { max-width: 420px; color: var(--hint); font-size: 14px }
.sk { height: 48px; opacity: .5 }
</style>

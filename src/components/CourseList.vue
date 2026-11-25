<script setup>
// Вкладка «Курсы» преподавателя: список курсов (общий для всех преподавателей) и «+ Новый курс».
// Как в Figma: одно нажатие — выбрать курс (он показывается ниже, в «Как видит ученик»), двойное или карандаш — редактор; корзина — удалить (холст + рельс, #/courses?id=…). Курс хранится на сервере (server/courses.ts);
// без сервера (демо) — один курс из этого браузера.
import { ask } from '../composables/useDialog'
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
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
// 25.11.2026 (макет «Вкладка «Курсы» — выбор курса», вариант B): курсы — ряд вкладок шириной с колонку курса (620px), все видны сразу, как плитки;
// не влезли — ряд листается вбок, правый край плавно гаснет; выбранный — тёмный; у выбранного — карандаш и корзина. «+» — новый курс
// 25.11.2026 (макет E2): все курсы одного цвета; выбранный — на сиреневой подложке; карандаш и корзина — в строке прогресса под курсами (TeacherPath)
defineExpose({ open, removeSel: () => { const c = list.value?.find((x) => x.id === props.selected); if (c) remove(c) } })
const row = ref(null), moreR = ref(false), moreL = ref(false)
function edges() { const el = row.value; if (!el) return; moreL.value = el.scrollLeft > 2; moreR.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2 }
let ro = null
onMounted(() => { ro = new ResizeObserver(edges); watch(row, (el) => { ro.disconnect(); if (el) { ro.observe(el); edges() } }, { immediate: true }) })
onBeforeUnmount(() => ro?.disconnect())
watch([list, () => props.selected], () => nextTick(() => { edges(); row.value?.querySelector('.cc.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }))
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
    <div class="ch">
      <div v-if="list === null" class="sk" />
      <div v-else-if="list.length" ref="row" class="grid" :class="{ fr: moreR, fl: moreL }" role="tablist" aria-label="Курсы" @scroll="edges">
        <div v-for="(c, i) in list" :key="c.id" class="cc" :class="{ on: c.id === selected }" role="tab" :aria-selected="c.id === selected" tabindex="0"
          :title="`${c.title} · ${c.count} ${word(c.count)}${c.updatedAt ? ' · изменён ' + ago(c.updatedAt) : ''}\nНажмите — посмотреть ниже, дважды — открыть в редакторе`"
          @click="emit('update:selected', c.id)" @dblclick="open(c.id)" @keydown.enter="open(c.id)">
          <span class="ic"><AppIcon name="route" :size="26" /></span>
          <b>{{ c.title }}</b>
        </div>
        <button class="new" type="button" title="Новый курс" aria-label="Новый курс" @click="open('new')"><span class="ic"><AppIcon name="plus" :size="22" /></span><small>Новый курс</small></button>
      </div>
      <button v-else class="new" type="button" title="Новый курс" aria-label="Новый курс" @click="open('new')"><span class="ic"><AppIcon name="plus" :size="22" /></span><small>Новый курс</small></button>
    </div>
    <p v-if="err" class="hint">Не удалось загрузить курсы {{ err }}</p>
    <div v-if="list && !list.length" class="card empty">
      <b>Курсов пока нет</b><span>Курс — это путь ученика: задания по порядку на одной линии, кружки из Telegram, фото. Собирается на холсте, как во Figma.</span>
      <button class="btn" @click="open('new')">Создать первый курс</button>
    </div>
  </div>
</template>
<style scoped>
/* 25.11.2026 (макет «Вкладка «Курсы»», вариант C): курсы — как иконки приложений на iPhone: цветной скруглённый квадрат, название под ним.
   Компьютер — все курсы видны, ряд переносится на новые строки; телефон — карусель, листается вбок (край гаснет).
   Выбранный — тёмное кольцо. Карандаш (левый угол) и корзина (правый) — при наведении, а на телефоне — у выбранного */
.cl { display: grid; gap: 6px; width: 100%; max-width: 620px; margin: 0 auto 4px }
.ch { display: flex; align-items: flex-start; min-width: 0 }
.sk { flex: 1; height: 84px; border-radius: 18px; background: var(--surface); opacity: .6 }
.grid { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 8px 4px; padding: 2px 0 }
@media (max-width: 719px) {
  .grid { flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; scroll-behavior: smooth; scroll-snap-type: x proximity; scrollbar-width: none; gap: 2px }
  .grid::-webkit-scrollbar { display: none } .grid > * { scroll-snap-align: start }
  .grid.fr { -webkit-mask-image: linear-gradient(90deg, #000 85%, transparent); mask-image: linear-gradient(90deg, #000 85%, transparent) }
  .grid.fl { -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%); mask-image: linear-gradient(90deg, transparent, #000 12%) }
  .grid.fl.fr { -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 85%, transparent); mask-image: linear-gradient(90deg, transparent, #000 12%, #000 85%, transparent) }
}
.cc, .new { flex: none; display: flex; flex-direction: column; align-items: center; gap: 7px; width: 86px; box-sizing: border-box; padding: 8px 4px; border: 0; border-radius: 18px; background: none; font: inherit; color: var(--text); cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; transition: background .15s }
.ic { position: relative; display: grid; place-items: center; width: 60px; height: 60px; box-sizing: border-box; border-radius: 14px; background: var(--purple); color: #fff; transition: transform .12s }
.cc:hover .ic { transform: translateY(-2px) } .cc:active .ic { transform: scale(.96) }
.cc.on { background: #f1e8fd } html[data-theme='dark'] .cc.on { background: rgba(165, 96, 232, .2) }          /* выбранный — мягкая подложка, без обводки */
.cc b { width: 100%; font-size: 11.5px; font-weight: 700; line-height: 1.2; text-align: center; color: var(--hint); overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.cc.on b { font-weight: 900; color: var(--text) }
.new { color: var(--hint) } .new .ic { border: 2px dashed var(--border); background: none; color: var(--hint) } .new small { font-size: 11.5px; font-weight: 700 }
.new:hover .ic { border-color: var(--blue); color: var(--blue) }
.empty { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 24px } .empty span { max-width: 420px; color: var(--hint); font-size: 14px }
</style>

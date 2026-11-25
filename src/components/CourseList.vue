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
const COLORS = ['#a560e8', '#ff9600', '#1cb0f6', '#ff4b4b', '#58cc02', '#ce82ff', '#2b70c9']
const colorOf = (i) => COLORS[i % COLORS.length]
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
          <span class="ic" :style="{ background: colorOf(i) }"><AppIcon name="route" :size="15" /></span>
          <b>{{ c.title }}</b>
          <template v-if="c.id === selected">
            <button class="cb" title="Редактировать курс" aria-label="Редактировать курс" @click.stop="open(c.id)" @dblclick.stop><AppIcon name="pencil" :size="13" /></button>
            <button class="cb" title="Удалить курс" aria-label="Удалить курс" @click.stop="remove(c)" @dblclick.stop><AppIcon name="trash" :size="13" /></button>
          </template>
        </div>
      </div>
      <span v-else class="sp" />
      <button class="new" type="button" title="Новый курс" aria-label="Новый курс" @click="open('new')"><AppIcon name="plus" :size="16" /></button>
    </div>
    <p v-if="err" class="hint">Не удалось загрузить курсы {{ err }}</p>
    <div v-if="list && !list.length" class="card empty">
      <b>Курсов пока нет</b><span>Курс — это путь ученика: задания по порядку на одной линии, кружки из Telegram, фото. Собирается на холсте, как во Figma.</span>
      <button class="btn" @click="open('new')">Создать первый курс</button>
    </div>
  </div>
</template>
<style scoped>
/* 25.11.2026: вкладки курсов — в ширину колонки «Как видит ученик» (620px), по центру; не вылезают к рейлу навигации */
.cl { display: grid; gap: 6px; width: 100%; max-width: 620px; margin: 0 auto 4px }
.ch { display: flex; align-items: center; gap: 8px; min-width: 0 }
.sp, .sk { flex: 1 } .sk { height: 44px; border-radius: 14px; background: var(--surface); opacity: .6 }
.grid { flex: 1; min-width: 0; display: flex; gap: 8px; overflow-x: auto; overscroll-behavior-x: contain; scroll-behavior: smooth; scrollbar-width: none; padding: 2px 0 }
.grid::-webkit-scrollbar { display: none }
.grid.fr { -webkit-mask-image: linear-gradient(90deg, #000 85%, transparent); mask-image: linear-gradient(90deg, #000 85%, transparent) }          /* не влезло — справа гаснет: видно, что есть ещё */
.grid.fl { -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%); mask-image: linear-gradient(90deg, transparent, #000 12%) }
.grid.fl.fr { -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 85%, transparent); mask-image: linear-gradient(90deg, transparent, #000 12%, #000 85%, transparent) }
.cc { flex: none; display: flex; align-items: center; gap: 8px; height: 44px; box-sizing: border-box; padding: 0 12px 0 6px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); color: var(--text); cursor: pointer; user-select: none; white-space: nowrap; transition: border-color .1s, background .15s }
.cc:hover { border-color: var(--blue) }
.cc b { font-size: 14px; font-weight: 800; max-width: 220px; overflow: hidden; text-overflow: ellipsis }
.cc.on { border-color: transparent; background: #1f2328; color: #fff } html[data-theme='dark'] .cc.on { background: #f1f3f5; color: #111 }
.ic { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: #fff }
.cb { flex: none; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 8px; background: rgba(255, 255, 255, .12); color: inherit; cursor: pointer } .cb:hover { background: rgba(255, 255, 255, .24) }
html[data-theme='dark'] .cb { background: rgba(0, 0, 0, .08) }
.new { flex: none; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px dashed var(--border); border-radius: 14px; background: none; color: var(--hint); cursor: pointer } .new:hover { border-color: var(--blue); color: var(--blue) }
.empty { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 24px } .empty span { max-width: 420px; color: var(--hint); font-size: 14px }
</style>

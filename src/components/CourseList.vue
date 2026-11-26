<script setup>
// Вкладка «Курсы» преподавателя: список курсов (общий для всех преподавателей) и «+ Новый курс».
// Как в Figma: одно нажатие — выбрать курс (он показывается ниже, в «Как видит ученик»), двойное или карандаш — редактор; корзина — удалить (холст + рельс, #/courses?id=…). Курс хранится на сервере (server/courses.ts);
// без сервера (демо) — один курс из этого браузера.
import { ask } from '../composables/useDialog'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
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
// Архив (26.11.2026, макет «Курсы: убрать в архив»): у каждого преподавателя свой — сервер, users/{uid}.courseArch; без сети — этот браузер.
// Курс в архиве не показывается в ряду; в конце ряда — плитка «Архив» (если там что-то есть), нажали — ряд показывает архивные, «← Все курсы» — назад
const ARCH = 'tma.courseArch.v1', arch = ref([]), archView = ref(false)
async function loadArch() {
  if (!online) { try { arch.value = JSON.parse(localStorage.getItem(ARCH)) || [] } catch { arch.value = [] } return }
  try { const r = await apiRequest('/me/course-archive'); if (r.ok) arch.value = (await r.json()).ids ?? [] } catch { /* без сети — пусто */ }
}
onMounted(loadArch)
async function setArch(id, on) {
  const was = arch.value
  arch.value = on ? [...new Set([...was, id])] : was.filter((x) => x !== id)
  if (!online) { localStorage.setItem(ARCH, JSON.stringify(arch.value)); return true }
  try { const r = await apiRequest('/me/course-archive', { method: 'POST', body: JSON.stringify({ id, on }) }); if (!r.ok) throw new Error(String(r.status)); arch.value = (await r.json()).ids ?? arch.value; return true }
  catch { arch.value = was; showToast('Не удалось ' + (on ? 'убрать курс в архив' : 'вернуть курс'), null, 'bad'); return false }
}
const archived = computed(() => (list.value ?? []).filter((c) => arch.value.includes(c.id)))
const shown = computed(() => (list.value ?? []).filter((c) => arch.value.includes(c.id) === archView.value))
watch(() => archived.value.length, (n) => { if (!n) archView.value = false })
async function archiveSel(on = true) {
  const c = list.value?.find((x) => x.id === props.selected); if (!c) return
  if (!(await setArch(c.id, on))) return
  showToast(on ? `Курс в архиве: ${c.title}` : `Курс вернулся: ${c.title}`, async () => { await setArch(c.id, !on); emit('update:selected', c.id) })
}
function toArch(on) { archView.value = on; const l = shown.value; emit('update:selected', l[0]?.id ?? null) }
// выбран первый курс, пока не выбрали другой (из показанных: обычные или архивные)
watch([list, shown], () => { const l = shown.value; if (list.value && !l.some(c => c.id === props.selected)) { const n = l[0]?.id ?? null; if (n !== props.selected) emit('update:selected', n) } })
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
defineExpose({ open, archiveSel, isArch: () => archView.value, removeSel: () => { const c = list.value?.find((x) => x.id === props.selected); if (c) remove(c) }, pickCover: () => coverIn.value?.click(), dropCover: () => setCover(props.selected, null), hasCover: (id) => !!list.value?.find((x) => x.id === id)?.cover, coverBusy: () => !!coverBusy.value })
// Картинка на иконке курса (25.11.2026, как превью плиток меню): выбрали курс → «🖼» в строке прогресса, или перетащили картинку на иконку,
// или Ctrl+V. Режется по центру в квадрат 240×240 и уходит в хранилище курса (сервер: POST /courses/:id/cover). Убрать — «Сбросить»
const coverIn = ref(null), coverBusy = ref(''), coverUrl = ref({})
async function coverUrls() {
  const keys = (list.value ?? []).map((c) => c.cover).filter((k) => k && !(k in coverUrl.value))
  if (!keys.length || !online) return
  try { const r = await apiRequest('/media/view', { method: 'POST', body: JSON.stringify({ keys }) }); if (r.ok) coverUrl.value = { ...coverUrl.value, ...(await r.json()).urls } } catch { /* без сети — позже */ }
}
watch(list, coverUrls)
async function coverCut(file) {
  const bmp = await createImageBitmap(file), s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = 240
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 240, 240)
  return new Promise((ok) => c.toBlob((b) => ok(new File([b], 'cover.webp', { type: 'image/webp' })), 'image/webp', 0.88))
}
async function sendCover(file, courseId) {
  const token = await fb?.currentUser?.getIdToken()
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest(); x.open('POST', `${API}/media/upload?courseId=${encodeURIComponent(courseId)}`)
    x.setRequestHeader('Content-Type', file.type); if (token) x.setRequestHeader('Authorization', `Bearer ${token}`)
    x.onload = () => (x.status < 300 ? ok(JSON.parse(x.responseText).key) : no(new Error(String(x.status)))); x.onerror = () => no(new Error('network')); x.send(file)
  })
}
async function setCover(id, file) {
  const c = list.value?.find((x) => x.id === id); if (!c) return
  if (!online) return showToast('Картинка курса хранится на сервере — сейчас без сети', null, 'bad')
  if (file && !/^image\//.test(file.type)) return
  coverBusy.value = id
  try {
    const key = file ? await sendCover(await coverCut(file), id) : null
    const r = await apiRequest(`/courses/${id}/cover`, { method: 'POST', body: JSON.stringify({ cover: key }) }); if (!r.ok) throw new Error(String(r.status))
    const old = c.cover; if (key) c.cover = key; else delete c.cover
    if (old && old !== key) apiRequest('/media/delete', { method: 'POST', body: JSON.stringify({ key: old }) }).catch(() => {})
    list.value = [...list.value]; showToast(key ? 'Картинка курса поставлена' : 'Картинка курса убрана')
  } catch (e) { showToast('Не удалось поставить картинку курса: ' + (e.message || e), null, 'bad') }
  finally { coverBusy.value = '' }
}
function coverFile(e) { const f = e.target.files?.[0]; e.target.value = ''; if (f && props.selected) setCover(props.selected, f) }
function coverPaste(e) { if (!props.selected || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) return; const f = [...(e.clipboardData?.files ?? [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); setCover(props.selected, f) } }
onMounted(() => addEventListener('paste', coverPaste)); onBeforeUnmount(() => removeEventListener('paste', coverPaste))
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
      <div v-else-if="list.length" ref="row" class="grid" :class="{ fr: moreR, fl: moreL, arv: archView }" role="tablist" aria-label="Курсы" @scroll="edges">
        <div v-if="archView" class="clah"><button type="button" class="clab" @click="toArch(false)">← Все курсы</button><span>Архив · {{ archived.length }}</span></div>
        <div v-for="(c, i) in shown" :key="c.id" class="cc" :class="{ on: c.id === selected }" role="tab" :aria-selected="c.id === selected" tabindex="0"
          :title="`${c.title} · ${c.count} ${word(c.count)}${c.updatedAt ? ' · изменён ' + ago(c.updatedAt) : ''}\nНажмите — посмотреть ниже, дважды — открыть в редакторе`"
          @click="emit('update:selected', c.id)" @dblclick="open(c.id)" @keydown.enter="open(c.id)" @dragover.prevent @drop.prevent="emit('update:selected', c.id); setCover(c.id, $event.dataTransfer?.files?.[0])">
          <span class="ic" :class="{ img: c.cover && coverUrl[c.cover], busy: coverBusy === c.id }"><img v-if="c.cover && coverUrl[c.cover]" :src="coverUrl[c.cover]" alt="" draggable="false" /><AppIcon v-else name="route" :size="26" /></span>
          <b>{{ c.title }}</b>
        </div>
        <button v-if="!archView" class="new" type="button" title="Новый курс" aria-label="Новый курс" @click="open('new')"><span class="ic"><AppIcon name="plus" :size="22" /></span><small>Новый курс</small></button>
        <button v-if="!archView && archived.length" class="cla" type="button" :title="`Архив курсов: ${archived.length} — убраны из ряда (видите только вы)`" @click="toArch(true)"><span class="ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" /></svg><i>{{ archived.length }}</i></span><b>Архив</b></button>
      </div>
      <button v-else class="new" type="button" title="Новый курс" aria-label="Новый курс" @click="open('new')"><span class="ic"><AppIcon name="plus" :size="22" /></span><small>Новый курс</small></button>
    </div>
    <input ref="coverIn" type="file" accept="image/*" hidden @change="coverFile" />
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
.cl { display: grid; gap: 6px; width: 100%; max-width: 620px; margin: 0 auto }
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
.ic.img { overflow: hidden; background: #eee } .ic.img img { width: 100%; height: 100%; object-fit: cover; display: block } .ic.busy { opacity: .5 }          /* своя картинка курса (25.11.2026) */
.cc.on { background: #f1e8fd } html[data-theme='dark'] .cc.on { background: rgba(165, 96, 232, .2) }          /* выбранный — мягкая подложка, без обводки */
.cc b { width: 100%; font-size: 11.5px; font-weight: 700; line-height: 1.2; text-align: center; color: var(--hint); overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.cc.on b { font-weight: 900; color: var(--text) }
.new { color: var(--hint) } .new .ic { border: 2px dashed var(--border); background: none; color: var(--hint) } .new small { font-size: 11.5px; font-weight: 700 }
.new:hover .ic { border-color: var(--blue); color: var(--blue) }
/* 25.11.2026: «Новый курс» в ряду — маленький «+» рядом с курсами, без подписи (подсказка при наведении), чтобы не уходил на новую строку */
.grid .new { width: 44px; padding: 20px 2px 0; gap: 0 } .grid .new .ic { width: 36px; height: 36px; border-radius: 11px } .grid .new small { display: none }
.cla { flex: none; display: flex; flex-direction: column; align-items: center; gap: 7px; width: 70px; box-sizing: border-box; padding: 8px 4px; border: 0; border-radius: 18px; background: none; font: inherit; cursor: pointer }          /* плитка «Архив» в конце ряда (26.11.2026) */
.cla .ic { width: 44px; height: 44px; margin: 8px 0; border-radius: 12px; background: var(--surface, #f0f0f2); color: var(--hint) } .cla:hover .ic { color: var(--purple) }
.cla .ic i { position: absolute; top: -6px; right: -8px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px; background: var(--hint); color: #fff; font-size: 11px; font-weight: 900; font-style: normal; line-height: 18px; text-align: center }
.cla b { font-size: 11.5px; font-weight: 700; color: var(--hint) }
.clah { flex: none; display: flex; align-items: center; gap: 8px; width: 100%; padding: 0 6px 4px; font-size: 13px; font-weight: 700; color: var(--hint) }
.clab { height: 26px; padding: 0 10px; border: 0; border-radius: 13px; background: #f1e8fd; color: var(--purple); font: inherit; font-weight: 800; cursor: pointer } html[data-theme='dark'] .clab { background: rgba(165, 96, 232, .2) }
.grid.arv .cc:not(.on) { opacity: .55; filter: grayscale(.6) }          /* архивные — бледные */
.empty { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 24px } .empty span { max-width: 420px; color: var(--hint); font-size: 14px }
</style>

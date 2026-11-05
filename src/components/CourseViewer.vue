<script setup>
// «Как видит ученик»: просмотрщик курсов на вкладке «Курсы». Выбрал курс — он открывается в рамке телефона (или планшета):
// юниты и задания по порядку, как путь ученика. Урок с экранами проходится прямо в рамке (LessonPlayer), кружок и фото — открываются.
// Ничего не правит: править — «Открыть в редакторе». Курсы — с сервера (без сервера — один курс из этого браузера, как в редакторе).
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { API, apiRequest, fb, isDemo } from '../firebase'
import { audSrc, imgSrc } from '../composables/useCardMedia'
import LessonPlayer from './LessonPlayer.vue'
import { INTERACTIVE, stepIssue } from '../utils/lesson'

const router = useRouter()
const online = !isDemo && !!API && !!fb
const LOCAL = 'tma.courseRail.v1'
const list = ref(null), sel = ref(null), course = ref(null), err = ref(''), loading = ref(false)
const device = ref('phone'), full = ref(false)          // full — на весь экран компьютера (Esc — выйти)
const onEsc = (e) => { if (e.key === 'Escape' && full.value) full.value = false }
onMounted(() => addEventListener('keydown', onEsc)); onUnmounted(() => removeEventListener('keydown', onEsc))

// типы заданий — как в редакторе курса
const T = {
  unit: { t: 'Юнит', c: 'var(--green)' },
  lesson: { t: 'Урок', c: 'var(--green)', ic: '<circle cx="12" cy="12" r="8"/><path d="M9 12.3l2 2 4-4"/>' },
  words: { t: 'Слова', c: 'var(--blue)', ic: '<rect x="4" y="7" width="12" height="13" rx="2.5"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16"/>' },
  hw: { t: 'Домашка', c: '#2ec4b6', ic: '<path d="M14.6 6.1l3.3 3.3"/><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z"/>' },
  test: { t: 'Тест', c: 'var(--orange)', ic: '<path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.1l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"/>' },
  tutor: { t: 'С репетитором', c: 'var(--purple)', ic: '<rect x="3.5" y="6.5" width="12" height="11" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3z"/>' },
  video: { t: 'Кружок', c: '#2aabee', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M10.3 9.2v5.6l4.6-2.8z" fill="currentColor"/>' },
  photo: { t: 'Фото', c: '#ff6fb1', ic: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8"/>' },
  reward: { t: 'Награда', c: 'var(--yellow)', ic: '<path d="M8 4.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5v.8A3.7 3.7 0 0 0 8 11M16 6.5h3.5v.8A3.7 3.7 0 0 1 16 11"/><path d="M12 14v4M8.5 20h7"/>' },
}
const UNIT_COLORS = ['var(--green)', 'var(--purple)', 'var(--blue)', 'var(--orange)']

async function loadList() {
  if (!online) {
    try { const d = JSON.parse(localStorage.getItem(LOCAL)); list.value = d?.items ? [{ id: d.id || 'local', title: d.title || 'Курс' }] : [] } catch { list.value = [] }
  } else {
    try { const r = await apiRequest('/courses'); if (!r.ok) throw new Error(`(${r.status})`); list.value = (await r.json()).courses; err.value = '' }
    catch (e) { err.value = e.message; list.value ??= [] }
  }
  if (!sel.value && list.value.length) sel.value = list.value[0].id
}
async function loadCourse(id) {
  open.value = null; course.value = null; if (!id) return
  loading.value = true
  try {
    if (!online) course.value = JSON.parse(localStorage.getItem(LOCAL))
    else { const r = await apiRequest(`/courses/${id}`); if (!r.ok) throw new Error(`(${r.status})`); course.value = await r.json() }
  } catch (e) { err.value = e.message } finally { loading.value = false }
}
onMounted(loadList)
watch(sel, loadCourse)

// путь: юниты с заданиями; прогресс курса — сколько заданий уже пройдено (как его видит ученик)
const units = computed(() => {
  const out = []; let cur = null, n = 0
  for (const x of course.value?.items ?? []) {
    if (x.type === 'unit') { cur = { ...x, c: UNIT_COLORS[out.length % UNIT_COLORS.length], tasks: [] }; out.push(cur); continue }
    if (!cur) { cur = { id: 'u0', title: course.value?.title ?? '', sub: '', c: UNIT_COLORS[0], tasks: [] }; out.push(cur) }
    cur.tasks.push({ ...x, n: n++ })
  }
  return out
})
const total = computed(() => units.value.reduce((a, u) => a + u.tasks.length, 0))
const done = computed(() => Math.min(course.value?.progress ?? 0, total.value))
const shift = (k) => [0, 1, 1.6, 1, 0, -1, -1.6, -1][k % 8] * (device.value === 'phone' && !full.value ? 46 : 80)   // зигзаг дорожки
const ready = (x) => INTERACTIVE.includes(x.type) && (x.steps ?? []).some(s => !stepIssue(s))

// открыто в рамке: урок (экраны), кружок, фото или «пусто»
const open = ref(null)
function tap(x) { open.value = x }
const steps = computed(() => (open.value?.steps ?? []).filter(s => !stepIssue(s)))

// файлы: свой ключ курса в S3 — ссылка на просмотр (пачкой), «idb:» — из этого браузера, остальное — как в карточках
const urls = reactive({}), want = new Set(); let vt = 0
function askView(key) {
  want.add(key); clearTimeout(vt)
  vt = setTimeout(async () => {
    const keys = [...want]; want.clear()
    try { const r = await apiRequest('/media/view', { method: 'POST', body: JSON.stringify({ keys }) }); if (r.ok) Object.assign(urls, (await r.json()).urls) } catch { /* без сети — позже */ }
  }, 50)
}
const idb = () => new Promise((ok, no) => { const r = indexedDB.open('tma-course-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('v'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
function local(id) {
  if (!(id in urls)) {
    urls[id] = ''
    idb().then(db => { const q = db.transaction('v').objectStore('v').get(id); q.onsuccess = () => { if (q.result) urls[id] = URL.createObjectURL(q.result) } }).catch(() => {})
  }
  return urls[id]
}
function resolve(v, kind) {
  if (!v) return ''
  if (v.startsWith('idb:')) return local(v.slice(4))
  if (/^t\//.test(v)) { if (!online) return ''; if (!(v in urls)) { urls[v] = ''; askView(v) } return urls[v] }
  return kind === 'audio' ? audSrc(v) : kind === 'image' ? imgSrc(v) : v
}
const fileOf = (x) => (x.file ? resolve(x.file) : x.media ? local(x.media) : '')
const edit = () => router.push({ name: 'courses', query: { id: sel.value } })
</script>

<template>
  <div class="cv">
    <div class="vh">
      <h3>Как видит ученик <small>пройдите курс, как на телефоне, планшете или компьютере</small></h3>
      <div class="seg dv"><button :class="{ on: device === 'phone' }" @click="device = 'phone'">Телефон</button><button :class="{ on: device === 'tablet' }" @click="device = 'tablet'">Планшет</button><button :class="{ on: device === 'pc' }" @click="device = 'pc'">Компьютер</button></div>
    </div>
    <div v-if="list?.length > 1" class="seg tabs"><button v-for="c in list" :key="c.id" :class="{ on: c.id === sel }" @click="sel = c.id">{{ c.title }}</button></div>
    <p v-if="err" class="hint">Не удалось загрузить курс {{ err }}</p>

    <div v-if="list && !list.length" class="card hint none">Курсов пока нет — создайте курс выше, и он появится здесь.</div>
    <div v-else class="stage">
      <div class="dev" :class="[device, { full }]">
        <div v-if="device === 'pc' || full" class="bar"><i /><i /><i /><span>{{ course?.title ?? '' }}</span><button v-if="full" class="fx" title="Выйти из полноэкранного (Esc)" @click="full = false">✕</button></div>
        <div class="scr">
          <!-- путь ученика -->
          <div class="top"><b>{{ course?.title ?? '…' }}</b><span class="pb"><i :style="{ width: (total ? done / total * 100 : 0) + '%' }" /></span><small>{{ done }} / {{ total }}</small></div>
          <div v-if="loading || !course" class="ld">Загрузка…</div>
          <div v-else class="path">
            <section v-for="u in units" :key="u.id">
              <div class="ub" :style="{ background: u.c }"><b>{{ u.title }}</b><small v-if="u.sub">{{ u.sub }}</small></div>
              <div v-for="(x, k) in u.tasks" :key="x.id" class="nd" :style="{ transform: `translateX(${shift(k)}px)` }">
                <span v-if="x.n === done" class="go">Старт</span>
                <button class="nb" :class="{ past: x.n < done, now: x.n === done, ready: ready(x) }" :style="{ '--c': (T[x.type] ?? T.lesson).c }" :title="(T[x.type] ?? T.lesson).t" @click="tap(x)">
                  <img v-if="x.type === 'photo' && fileOf(x)" :src="fileOf(x)" alt="" />
                  <video v-else-if="x.type === 'video' && fileOf(x)" :src="fileOf(x)" muted playsinline preload="metadata" />
                  <svg v-else viewBox="0 0 24 24" v-html="(T[x.type] ?? T.lesson).ic" />
                  <i v-if="x.n < done" class="ck">✓</i><em v-if="ready(x)" class="cnt">{{ x.steps.length }}</em>
                </button>
                <small>{{ x.title || (T[x.type] ?? T.lesson).t }}</small>
              </div>
            </section>
            <p v-if="!units.length" class="ld">В курсе пока нет заданий</p>
          </div>

          <!-- открытое задание -->
          <div v-if="open" class="ov">
            <LessonPlayer v-if="steps.length" :key="open.id" :steps="steps" :resolve="resolve" closable @close="open = null" />
            <div v-else class="sh">
              <button class="x" title="Закрыть" @click="open = null"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
              <template v-if="open.type === 'video'"><video v-if="fileOf(open)" class="kr" :src="fileOf(open)" controls autoplay playsinline /><p v-else>Кружок ещё не загружен</p><b>{{ open.title }}</b></template>
              <template v-else-if="open.type === 'photo'"><img v-if="fileOf(open)" class="ph" :src="fileOf(open)" alt="" /><p v-else>Фото ещё не загружено</p><b>{{ open.title }}</b></template>
              <template v-else>
                <span class="bi" :style="{ '--c': (T[open.type] ?? T.lesson).c }"><svg viewBox="0 0 24 24" v-html="(T[open.type] ?? T.lesson).ic" /></span>
                <b>{{ open.title || (T[open.type] ?? T.lesson).t }}</b>
                <p>{{ open.type === 'tutor' ? 'Занятие с репетитором — проходит на уроке.' : open.type === 'reward' ? 'Награда за пройденный юнит.' : 'В этом задании пока нет экранов — соберите их в редакторе («Интерактив»).' }}</p>
                <button v-if="INTERACTIVE.includes(open.type)" class="btn primary" @click="edit">Открыть в редакторе</button>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div class="side">
        <button class="btn primary" :disabled="!course" @click="full = true">⛶ Во весь экран</button>
        <button class="btn" :disabled="!sel" @click="edit">Открыть в редакторе</button>
        <p class="hint">Нажмите на урок — он откроется, как у ученика. Цифра на кружке — сколько в уроке экранов. Прогресс ученика — как в курсе (галочки — пройдено, «Старт» — следующее).</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cv { display: grid; gap: 10px; margin-bottom: 22px }
.vh { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap }
.vh h3 { margin: 0; font-size: 15px } .vh small { font-size: 12px; font-weight: 600; color: var(--hint) }
.tabs { flex-wrap: wrap; justify-self: start }
.none { text-align: center }
.stage { display: flex; gap: 22px; align-items: flex-start; flex-wrap: wrap }
.side { flex: 1; min-width: 200px; max-width: 320px; display: grid; gap: 8px; justify-items: start } .side .hint { margin: 0 }
/* рамка устройства */
.dev { flex: none; box-sizing: border-box; padding: 12px; border-radius: 44px; background: #1f1f1f; box-shadow: 0 10px 30px rgba(0, 0, 0, .18) }
.dev.phone { width: 390px; height: 780px } .dev.tablet { width: 680px; height: 880px; border-radius: 34px; padding: 18px }
.scr { position: relative; height: 100%; border-radius: 32px; overflow: hidden; background: #fff; display: flex; flex-direction: column }
.dev.tablet .scr { border-radius: 18px }
.top { flex: none; display: flex; align-items: center; gap: 10px; padding: 26px 18px 12px; border-bottom: 1px solid var(--border) }
.top b { flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px }
.top .pb { flex: 1; height: 8px; border-radius: 4px; background: #e8e8e8; overflow: hidden } .top .pb i { display: block; height: 100%; background: #1fbe78; border-radius: 4px }
.top small { font-size: 12px; font-weight: 800; color: var(--hint) }
.ld { margin: 40px 0; text-align: center; color: var(--hint); font-weight: 700 }
.path { flex: 1; overflow-y: auto; padding: 14px 16px 40px; scrollbar-width: thin }
.ub { display: grid; gap: 2px; padding: 12px 16px; margin: 6px 0 18px; border-radius: 14px; color: #fff } .ub b { font-size: 16px } .ub small { font-size: 12px; font-weight: 700; opacity: .9 }
.nd { position: relative; display: grid; justify-items: center; gap: 5px; margin-bottom: 16px }
.nd small { max-width: 140px; text-align: center; font-size: 12px; font-weight: 700; color: var(--text) }
.nb { position: relative; display: grid; place-items: center; width: 64px; height: 64px; padding: 0; border: 0; border-radius: 50%; background: var(--c); color: #fff; cursor: pointer; box-shadow: 0 5px 0 color-mix(in srgb, var(--c) 70%, #000); transition: transform .1s }
.nb:active { transform: translateY(3px); box-shadow: 0 2px 0 color-mix(in srgb, var(--c) 70%, #000) }
.nb svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
.nb img, .nb video { width: 100%; height: 100%; border-radius: 50%; object-fit: cover }
.nb.past { filter: saturate(.55) brightness(1.05) }
.nb.now { outline: 4px solid color-mix(in srgb, var(--c) 30%, transparent); outline-offset: 4px }
.ck { position: absolute; right: -4px; bottom: -2px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #1f883d; color: #fff; font-size: 12px; font-style: normal; font-weight: 900; box-shadow: 0 0 0 2px #fff }
.cnt { position: absolute; right: -6px; top: -4px; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 10px; background: #fff; color: var(--text); font-size: 11px; font-style: normal; font-weight: 900; line-height: 20px; box-shadow: 0 0 0 1px var(--border) }
.go { position: absolute; top: -30px; padding: 4px 10px; border-radius: 9px; border: 1px solid var(--border); background: #fff; font-size: 12px; font-weight: 900; color: var(--green-d); z-index: 1 }
.go::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 8px; height: 8px; margin-left: -4px; background: #fff; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); transform: rotate(45deg) }
.nd:has(.go) { margin-top: 26px }
/* открытое задание — во весь экран устройства */
.ov { position: absolute; inset: 0; z-index: 3; background: #fff; display: flex; flex-direction: column }
.ov :deep(.lp) { height: 100% }
.sh { position: relative; flex: 1; display: grid; align-content: center; justify-items: center; gap: 12px; padding: 30px 24px; text-align: center }
.sh p { margin: 0; color: var(--hint); font-weight: 600; font-size: 14px } .sh b { font-size: 17px }
.x { position: absolute; left: 14px; top: 20px; width: 32px; height: 32px; border: 0; background: none; border-radius: 8px; cursor: pointer; display: grid; place-items: center } .x:hover { background: var(--surface) }
.x svg { width: 20px; height: 20px; stroke: var(--hint); stroke-width: 2.6; stroke-linecap: round }
.kr { width: 260px; height: 260px; border-radius: 50%; object-fit: cover; background: #000 }
.ph { max-width: 100%; max-height: 60%; border-radius: 14px }
.bi { display: grid; place-items: center; width: 72px; height: 72px; border-radius: 50%; background: var(--c); color: #fff }
.bi svg { width: 34px; height: 34px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
.dev.pc { width: 100%; height: 760px; padding: 0; border-radius: 12px; background: #fff; border: 1px solid var(--border); box-shadow: 0 6px 22px rgba(0, 0, 0, .08); display: flex; flex-direction: column; overflow: hidden }
.dev.pc .scr, .dev.full .scr { flex: 1; height: auto; border-radius: 0 }
.dev.pc .path, .dev.full .path { width: 100%; max-width: 560px; margin: 0 auto; box-sizing: border-box }
.bar { flex: none; display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; background: #f1f1f1; border-bottom: 1px solid var(--border) }
.bar i { width: 11px; height: 11px; border-radius: 50%; background: #ddd } .bar i:nth-child(1) { background: #ff5f57 } .bar i:nth-child(2) { background: #febc2e } .bar i:nth-child(3) { background: #28c840 }
.bar span { flex: 1; text-align: center; font-size: 12px; font-weight: 700; color: var(--hint) }
.fx { border: 0; background: none; font-size: 16px; color: var(--hint); cursor: pointer; padding: 4px 8px; border-radius: 6px } .fx:hover { background: #e2e2e2 }
.dev.full { position: fixed; inset: 0; z-index: 1000; width: auto; height: auto; padding: 0; border-radius: 0; background: #fff; display: flex; flex-direction: column }
.stage:has(.dev.pc) { display: grid; grid-template-columns: 1fr } .stage:has(.dev.pc) .side { order: -1; max-width: none; display: flex; flex-wrap: wrap; align-items: center }
@media (max-width: 720px) { .dev.tablet { width: 100%; height: 760px } .dev.phone { width: 100%; max-width: 390px } }
</style>

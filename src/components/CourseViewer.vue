<script setup>
// «Как видит ученик»: просмотрщик курсов на вкладке «Курсы». Курс — тем же рельсом, что в редакторе (юниты с процентом,
// кружки заданий с теми же значками, «Сейчас»). Нажал урок — он запускается во весь экран, как в Busuu; кружок и фото — тоже во весь экран.
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
const props = defineProps({ id: { type: String, default: null } })          // выбранный курс (из списка курсов)
const course = ref(null), err = ref(''), loading = ref(false)
const onEsc = (e) => { if (e.key === 'Escape' && open.value) open.value = null }
onMounted(() => addEventListener('keydown', onEsc)); onUnmounted(() => removeEventListener('keydown', onEsc))

// типы заданий — как в редакторе курса
const T = {
  unit: { t: 'Юнит', c: 'var(--green)' },
  lesson: { t: 'Урок', c: 'var(--green)', d: 'var(--green-d)', ic: '<circle cx="12" cy="12" r="8"/><path d="M9 12.3l2 2 4-4"/>' },
  words: { t: 'Слова', c: 'var(--blue)', d: 'var(--blue-d)', ic: '<rect x="4" y="7" width="12" height="13" rx="2.5"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16"/>' },
  hw: { t: 'Домашка', c: '#2ec4b6', d: '#1f9e93', ic: '<path d="M14.6 6.1l3.3 3.3"/><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z"/>' },
  test: { t: 'Тест', c: 'var(--orange)', d: 'var(--orange-d)', ic: '<path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.1l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"/>' },
  tutor: { t: 'С репетитором', c: 'var(--purple)', d: 'var(--purple-d)', ic: '<rect x="3.5" y="6.5" width="12" height="11" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3z"/>' },
  video: { t: 'Кружок', c: '#2aabee', d: '#1a8bc9', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M10.3 9.2v5.6l4.6-2.8z" fill="currentColor"/>' },
  photo: { t: 'Фото', c: '#ff6fb1', d: '#e0478f', ic: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8"/>' },
  reward: { t: 'Награда', c: 'var(--yellow)', d: 'var(--yellow-d)', ic: '<path d="M8 4.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5v.8A3.7 3.7 0 0 0 8 11M16 6.5h3.5v.8A3.7 3.7 0 0 1 16 11"/><path d="M12 14v4M8.5 20h7"/>' },
}
const screens = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'экран' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'экрана' : 'экранов'}`
const state = (x) => (x.n < done.value ? 'done' : x.n === done.value ? 'current' : 'todo')

async function loadCourse(id) {
  open.value = null; course.value = null; if (!id) return
  loading.value = true
  try {
    if (!online) course.value = JSON.parse(localStorage.getItem(LOCAL))
    else { const r = await apiRequest(`/courses/${id}`); if (!r.ok) throw new Error(`(${r.status})`); course.value = await r.json() }
  } catch (e) { err.value = e.message } finally { loading.value = false }
}

// путь: юниты с заданиями; прогресс курса — сколько заданий уже пройдено (как его видит ученик)
const units = computed(() => {
  const out = []; let cur = null, n = 0
  for (const x of course.value?.items ?? []) {
    if (x.type === 'unit') { cur = { ...x, tasks: [] }; out.push(cur); continue }
    if (!cur) { cur = { id: 'u0', title: '', sub: '', tasks: [] }; out.push(cur) }
    cur.tasks.push({ ...x, n: n++ })
  }
  for (const u of out) u.pct = u.tasks.length ? Math.round(u.tasks.filter(x => x.n < done.value).length / u.tasks.length * 100) : 0
  return out
})
const total = computed(() => (course.value?.items ?? []).filter(x => x.type !== 'unit').length)
const done = computed(() => Math.min(course.value?.progress ?? 0, total.value))
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
// всё объявлено — можно грузить выбранный курс (immediate)
watch(() => props.id, loadCourse, { immediate: true })
const edit = () => router.push({ name: 'courses', query: { id: props.id } })
</script>

<template>
  <div class="cv">
    <h3 class="vh">Как видит ученик <small>нажмите на задание — урок запустится во весь экран</small></h3>
    <p v-if="err" class="hint">Не удалось загрузить курс {{ err }}</p>
    <div v-if="loading || !course" class="card hint none">{{ loading ? 'Загрузка…' : 'Выберите курс выше' }}</div>

    <!-- курс тем же рельсом, что в редакторе -->
    <!-- как в Busuu: узкая колонка по центру, название курса, плашка с прогрессом, юниты — карточками -->
    <div v-else class="cr">
      <h2 class="ctl">{{ course.title }}</h2>
      <div class="cpill"><svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg><b>{{ done }} из {{ total }}</b><span>·</span><b>{{ total ? Math.round(done / total * 100) : 0 }}%</b></div>
      <section v-for="u in units" :key="u.id" class="un" :class="{ full: u.tasks.length && u.pct === 100 }">
        <template v-if="u.title">
          <div class="uh"><b>{{ u.title }}<template v-if="u.sub">: {{ u.sub }}</template></b><svg v-if="u.tasks.length && u.pct === 100" viewBox="0 0 24 24" class="uok"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.3l3 3 6-6.5" /></svg></div>
          <div class="ubar"><i :style="{ width: u.pct + '%' }" /><em>{{ u.pct }}%</em></div>
        </template>
        <div v-for="(x, k) in u.tasks" :key="x.id" class="vrow" :class="[state(x), { first: k === 0, last: k === u.tasks.length - 1 }]">
          <button class="bead" :class="[x.type, state(x)]" :style="{ '--c': (T[x.type] ?? T.lesson).c, '--d': (T[x.type] ?? T.lesson).d }" :title="(T[x.type] ?? T.lesson).t" @click="tap(x)">
            <video v-if="x.type === 'video' && fileOf(x)" :src="fileOf(x)" class="vid" muted playsinline preload="metadata" />
            <img v-else-if="x.type === 'photo' && fileOf(x)" :src="fileOf(x)" class="vid img" alt="" />
            <svg v-else viewBox="0 0 24 24" class="ic" v-html="(T[x.type] ?? T.lesson).ic" />
            <svg v-if="state(x) === 'done'" viewBox="0 0 24 24" class="ok"><circle cx="12" cy="12" r="11" /><path d="M7 12.3l3.2 3.2 6.3-6.8" /></svg>
          </button>
          <div class="cap" role="button" tabindex="0" @click="tap(x)" @keydown.enter="tap(x)"><span v-if="state(x) === 'current'" class="start" :style="{ '--c': (T[x.type] ?? T.lesson).c }">Сейчас</span>{{ x.title || (T[x.type] ?? T.lesson).t }}<small>{{ [(T[x.type] ?? T.lesson).t, x.steps?.length ? screens(x.steps.length) : ''].filter(Boolean).join(' · ') }}</small></div>
        </div>
      </section>
      <p v-if="!units.length" class="hint none">В курсе пока нет заданий</p>
    </div>

    <!-- открытое задание — во весь экран, как в Busuu -->
    <Teleport to="body">
      <div v-if="open" class="full">
        <LessonPlayer v-if="steps.length" :key="open.id" :steps="steps" :resolve="resolve" closable close-text="К курсу" @close="open = null" />
        <div v-else class="sh">
          <button class="x" title="Вернуться к курсу (Esc)" @click="open = null"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>К курсу</button>
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
    </Teleport>
  </div>
</template>

<style scoped>
.cv { display: grid; gap: 10px; margin-bottom: 22px }
.vh { width: 100%; max-width: 620px; margin: 0 auto; font-size: 15px } .vh small { font-size: 12px; font-weight: 600; color: var(--hint) }
.tabs { flex-wrap: wrap; justify-self: start }
.none { text-align: center; margin: 0 }
/* курс — как рельс в редакторе */
.cr { display: grid; gap: 16px; width: 100%; max-width: 620px; margin: 6px auto 0 }
.ctl { margin: 0; font-size: 30px; font-weight: 900 }
.cpill { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border: 1.5px solid var(--border); border-radius: 14px; font-size: 16px }
.cpill svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round } .cpill span { color: var(--hint) }
.un { display: grid; padding: 22px 24px 14px; border: 1.5px solid var(--border); border-radius: 22px; background: #fff }
.un.full { border-color: #1fbe78; background: #f2fbf7 }
.uh { display: flex; align-items: center; gap: 8px; white-space: nowrap }
.uh b { font-size: 24px; font-weight: 900; overflow: hidden; text-overflow: ellipsis }
.uok { flex: none; width: 22px; height: 22px } .uok circle { fill: #1fbe78 } .uok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.ubar { position: relative; width: 100%; height: 10px; margin: 16px 0 12px; border-radius: 6px; background: #e6e6e6 } .ubar i { display: block; height: 100%; border-radius: 6px; background: #1fbe78 }
.ubar em { position: absolute; right: 0; top: 50%; transform: translateY(-50%); padding: 1px 7px; border-radius: 8px; background: #1fbe78; color: #fff; font-size: 11px; font-weight: 900; font-style: normal }
/* строка рельса: линия, кружок, подпись */
.vrow { position: relative; display: flex; align-items: center; gap: 22px; min-height: 130px; padding-left: 6px }
.vrow::before { content: ''; position: absolute; left: 45px; top: 0; bottom: 0; width: 4px; margin-left: -2px; background: #e6e6e6; z-index: 0 }
.vrow.done::before, .vrow.current::before { background: #1fbe78 } .vrow.current::before { bottom: 50% }
.vrow.first::before { top: 50% } .vrow.last::before { bottom: 50% } .vrow.first.last::before { display: none }
.bead { position: relative; z-index: 1; flex: none; display: grid; place-items: center; width: 68px; height: 68px; padding: 0; border: 0; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 0 0 3px #fff, 0 0 0 6px #1fbe78; cursor: pointer }
.bead:hover { filter: brightness(1.05) }
.bead.todo { background: #f1f1f1; color: #b7b7b7; box-shadow: 0 0 0 3px #fff, 0 0 0 6px #e2e2e2 }
.bead.current { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c), 0 0 0 12px color-mix(in srgb, var(--c) 18%, transparent) }
.bead.photo { border-radius: 16px }
.ic { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
.vid { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: #000 } .vid.img { border-radius: 16px }
.bead.todo .vid { filter: grayscale(1); opacity: .6 }
.ok { position: absolute; left: 50%; bottom: -12px; width: 22px; height: 22px; margin-left: -11px; pointer-events: none; z-index: 2 }
.ok circle { fill: #1fbe78; stroke: #fff; stroke-width: 2 } .ok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.cap { flex: 0 1 auto; display: grid; justify-items: start; gap: 3px; padding: 0; border: 0; background: none; font: inherit; text-align: left; font-size: 17px; font-weight: 800; color: #252a31; cursor: pointer }
.cap small { font-size: 14px; font-weight: 500; color: #4b5563 }
.start { margin-bottom: 4px; padding: 2px 8px; border-radius: 6px; background: var(--c); color: #fff; font-size: 10px; font-weight: 900; text-transform: uppercase }
/* во весь экран */
.full { position: fixed; inset: 0; z-index: 1000; background: #fff; display: flex; flex-direction: column }
.full :deep(.lp) { height: 100% }
.sh { position: relative; flex: 1; display: grid; align-content: center; justify-items: center; gap: 12px; padding: 30px 24px; text-align: center }
.sh p { margin: 0; color: var(--hint); font-weight: 600; font-size: 14px } .sh b { font-size: 18px }
.x { position: absolute; left: 18px; top: 18px; display: flex; align-items: center; gap: 4px; height: 34px; padding: 0 12px 0 6px; border: 0; border-radius: 17px; background: var(--surface); font: inherit; font-size: 14px; font-weight: 800; color: var(--text); cursor: pointer } .x:hover { background: #e9e9e9 }
.x svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
/* на компьютере меню приложения слева остаётся видно поверх урока — в любой момент можно уйти в другой раздел */
@media (min-width: 1024px) { .full { z-index: 9; padding-left: 116px } .x { left: 134px } }
.kr { width: min(360px, 80vw); height: min(360px, 80vw); border-radius: 50%; object-fit: cover; background: #000 }
.ph { max-width: min(900px, 92vw); max-height: 75vh; border-radius: 14px }
.bi { display: grid; place-items: center; width: 80px; height: 80px; border-radius: 50%; background: var(--c); color: #fff }
.bi svg { width: 38px; height: 38px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
</style>

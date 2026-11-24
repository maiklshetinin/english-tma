<script setup>
// Review → «Журнал»: пройденные упражнения по дням (24.11.2026 — раньше были заходы в уроки с попытками и «не закончен»).
// Упражнение попадает сюда, как только на него ответил, даже если урок не закончен; просто открытое — нет. Текст ответа не показываем.
// Строка: когда ответил, упражнение и вопрос, курс и урок, результат (балл ИИ, ✓ / ✗ или «без оценки»), сколько пробыл.
// Преподаватель (и разработчик) может очистить журнал — прогресс курса и словарь при этом не меняются.
// Данные — GET /progress/log (server/learn.ts → lessonLogs); пишет просмотр курса по ходу урока (utils/runlog.js). Без сервера — этот браузер.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { apiRequest, isDemo, API, fb } from '../firebase'
import { readLocal, removeLocal, saveLocal, isDone, dur, durExact, exList, exDays, exWord } from '../utils/runlog'
import { useAuthStore } from '../stores/auth'
import { ask } from '../composables/useDialog'
import { showToast } from '../composables/useToast'
import { exName } from '../utils/review'
import ExerciseCharts from './ExerciseCharts.vue'

const props = defineProps({ studentId: { type: [String, Number], default: null } })   // карточка ученика у преподавателя; нет — свой журнал
const online = !isDemo && !!API && !!fb
const runs = ref([]), err = ref(''), loading = ref(false)
let reqN = 0
async function load(quiet = false) {
  if (!online) { runs.value = readLocal(); return }
  const n = ++reqN; if (!quiet) loading.value = true
  try {
    const r = await apiRequest('/progress/log' + (props.studentId != null ? `?studentId=${encodeURIComponent(props.studentId)}` : ''))
    if (!r.ok) throw new Error(`(${r.status})`)
    const d = await r.json(); if (n !== reqN) return
    runs.value = d.runs ?? []; err.value = ''
  } catch (e) { if (n === reqN && !quiet) err.value = e.message } finally { if (n === reqN) loading.value = false }
}
watch(() => props.studentId, () => load(), { immediate: true })
// ученик сейчас в уроке — журнал тихо подтягивается раз в 10 с (заход пишется пачкой раз в несколько секунд)
let poll = null
onMounted(() => { poll = setInterval(() => { if (document.visibilityState === 'visible' && !loading.value) load(true) }, 10_000) })
onUnmounted(() => clearInterval(poll))

const auth = useAuthStore()
const canDel = computed(() => auth.role === 'teacher')
const whose = computed(() => (props.studentId != null ? 'ученика' : 'свой'))
async function drop() {
  if (!(await ask(`Очистить ${whose.value === 'свой' ? 'свой журнал' : 'журнал ученика'}?`, { text: 'Все пройденные упражнения пропадут из журнала. Прохождение курса, словарь и ошибки для чекпоинта не меняются.', ok: 'Очистить', danger: true }))) return
  if (!online) { removeLocal(); return load() }
  const r = await apiRequest('/progress/log/remove', { method: 'POST', body: JSON.stringify(props.studentId != null ? { studentId: String(props.studentId) } : {}) }).catch(() => null)
  if (!r?.ok) return showToast('Не удалось очистить — попробуйте ещё раз', null, 'bad')
  runs.value = []; showToast('Журнал очищен')
}
// удалить одну запись (одно упражнение из захода) — без подтверждения, как смахнуть строку; прогресс курса не меняется
async function dropOne(e) {
  if (!online) {
    const all = readLocal(), r = all.find((x) => x.run === e.run)
    if (r) { const steps = (r.steps ?? []).filter((x) => String(x.id) !== String(e.id)); removeLocal([e.run]); if (steps.some(isDone)) saveLocal({ ...r, steps }) }
    return load()
  }
  const r = await apiRequest('/progress/log/remove', { method: 'POST', body: JSON.stringify({ run: e.run, step: e.id, ...(props.studentId != null ? { studentId: String(props.studentId) } : {}) }) }).catch(() => null)
  if (!r?.ok) return showToast('Не удалось удалить — попробуйте ещё раз', null, 'bad')
  showToast('Запись удалена'); load(true)
}
const list = computed(() => exList(runs.value))
const days = computed(() => exDays(list.value))
const week = computed(() => { const from = Date.now() - 7 * 864e5, e = list.value.filter(x => x.at >= from), g = e.filter(x => x.ok !== null); return { n: e.length, sec: e.reduce((a, x) => a + (x.sec || 0), 0), ok: g.filter(x => x.ok).length, all: g.length } })
const dayName = (d) => {
  const t = new Date(d + 'T12:00:00'), today = new Date(), y = new Date(Date.now() - 864e5)
  const same = (a, b) => a.toDateString() === b.toDateString()
  const s = t.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
  return same(t, today) ? `Сегодня, ${s}` : same(t, y) ? `Вчера, ${s}` : s[0].toUpperCase() + s.slice(1)
}
const hm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
// результат упражнения: балл ИИ, ✓ / ✗ или «без оценки»
const res = (e) => (e.sc != null ? `${e.sc}%` : e.ok === true ? '✓' : e.ok === false ? '✗' : '•')
const resT = (e) => (e.ok === true ? (e.sc != null ? 'зачтено' : 'верно') : e.ok === false ? (e.sc != null ? 'не зачтено' : 'ошибка') : 'без оценки')
const tone = (e) => (e.ok === true ? 'g' : e.ok === false ? 'b' : 'z')
const kindName = (e) => (e.kind ? exName(e) : 'Экран')
</script>

<template>
  <div class="lg">
    <p v-if="err" class="empty">Не удалось загрузить журнал {{ err }}</p>
    <p v-else-if="loading && !runs.length" class="empty">Загрузка…</p>
    <p v-else-if="!list.length" class="empty">Журнал пуст. Каждое упражнение, на которое ответили, появится здесь сразу — даже если урок не закончен: результат и сколько времени.</p>
    <template v-else>
      <ExerciseCharts :list="list" />
      <div class="wk"><span>За 7 дней</span><b>{{ week.n }}</b> {{ exWord(week.n) }}<i>·</i><b>{{ durExact(week.sec) }}</b><template v-if="week.all"><i>·</i><b>{{ week.ok }}/{{ week.all }}</b> зачтено</template><button v-if="canDel" class="clr" @click="drop()">Очистить журнал</button></div>
      <section v-for="d in days" :key="d.day" class="day">
        <header class="dh">
          <h3>{{ dayName(d.day) }}</h3>
          <span class="ds"><b>{{ d.ex.length }}</b> {{ exWord(d.ex.length) }}<i>·</i><b>{{ durExact(d.sec) }}</b><template v-if="d.all"><i>·</i><b>{{ d.ok }}/{{ d.all }}</b> зачтено</template></span>
        </header>
        <div class="runs">
          <div v-for="e in d.ex" :key="e.key" class="run rh">
            <span class="tm">{{ hm(e.at) }}</span>
            <span class="tt"><b>{{ kindName(e) }}<template v-if="e.w"> · {{ e.w }}</template></b><small>{{ [e.courseTitle, e.title].filter(Boolean).join(' · ') }}</small></span>
            <span class="rs"><b :class="tone(e)">{{ res(e) }}</b><small>{{ resT(e) }}</small></span>
            <span class="du">{{ durExact(e.sec) }}</span>
            <button v-if="canDel" type="button" class="x1" title="Удалить запись" aria-label="Удалить запись" @click="dropOne(e)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.lg { display: grid; gap: 14px; min-width: 0 }
.empty { margin: 8px 0 0; color: var(--hint); font-weight: 600; font-size: 14px; line-height: 1.45 }
.wk { font-size: 13px; font-weight: 700; color: var(--hint); display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 5px; padding-top: 6px }
.wk span { margin-right: 4px } .wk b, .ds b { color: var(--text); font-weight: 900 } .wk i, .ds i { font-style: normal; opacity: .5; margin: 0 2px }
.clr { margin-left: auto; border: 0; border-radius: 12px; padding: 6px 12px; background: #f0f1f3; font: inherit; font-size: 12.5px; font-weight: 900; color: #555; cursor: pointer } .clr:hover { background: #fdecea; color: #d92d20 }
.rdel { padding: 0 16px 12px 70px }
.del { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 10px; padding: 6px 11px; background: none; font: inherit; font-size: 12.5px; font-weight: 800; color: #d92d20; cursor: pointer } .del:hover { background: #fdecea }
.del svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.day { background: var(--card); border-radius: 18px; box-shadow: 0 1px 0 rgba(0, 0, 0, .04), 0 6px 22px rgba(0, 0, 0, .05); overflow: hidden; min-width: 0 }
.dh { display: flex; align-items: baseline; justify-content: space-between; gap: 6px 12px; flex-wrap: wrap; padding: 14px 16px 10px }
.dh h3 { margin: 0; font-size: 16px; font-weight: 900 }
.ds { font-size: 13px; font-weight: 700; color: var(--hint); white-space: nowrap }
.runs { display: grid }
.run { border-top: 1px solid var(--border) }
.rh { box-sizing: border-box; width: 100%; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto 52px 26px; align-items: center; gap: 10px; padding: 10px 16px }
.rh:hover { background: var(--surface) }
.x1 { width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--hint); cursor: pointer; opacity: .55 } .x1:hover { opacity: 1; background: #fdecea; color: #d92d20 }
.x1 svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round }
.tm { font-size: 13px; font-weight: 800; color: var(--hint); font-variant-numeric: tabular-nums }
.tt { display: grid; min-width: 0 } .tt b { font-size: 14.5px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tt small { font-size: 12px; color: var(--hint); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.try { font-size: 11.5px; font-weight: 800; color: #1278b0; background: #e6f6fe; border-radius: 8px; padding: 2px 7px; white-space: nowrap }
.try.no { visibility: hidden }
.rs { display: grid; justify-items: end; line-height: 1.15 } .rs b { font-size: 14px; font-weight: 900; white-space: nowrap } .rs small { font-size: 11.5px; color: var(--hint); font-weight: 700; white-space: nowrap }
.g { color: #2e8b00 } .m { color: #c2590a } .b { color: #d92d20 } .z { color: var(--hint) } .ip { color: #c2590a }
.du { min-width: 44px; font-size: 13px; font-weight: 800; color: var(--hint); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums }
.ch { width: 16px; height: 16px; fill: none; stroke: var(--hint); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s } .run.on .ch { transform: rotate(90deg) }
.st { list-style: none; margin: 0; padding: 2px 16px 12px 70px; display: grid; gap: 2px }
.st li { display: grid; grid-template-columns: 20px 22px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 5px 0; border-top: 1px dashed var(--border); font-size: 13.5px }
.st li:first-child { border-top: 0 } .st li.no { opacity: .5 }
.mk { font-weight: 900; text-align: center } .mk.no { color: var(--hint) }
.sn { font-size: 12px; color: var(--hint); font-weight: 700; font-variant-numeric: tabular-nums }
.sw { min-width: 0; overflow-wrap: anywhere } .sw b { font-weight: 800 } .sw small { display: block; font-size: 12px; color: var(--hint); font-weight: 600; margin-top: 1px }
.sm { font-size: 12px; color: var(--hint); font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums }
@media (max-width: 560px) {
  .rh { grid-template-columns: 40px minmax(0, 1fr) auto 44px 26px; gap: 8px; padding: 10px 12px }
  .dh { padding: 12px 12px 8px } .st { padding: 2px 12px 10px 12px } .rdel { padding: 0 12px 10px } .tt b { white-space: normal; line-height: 1.2 }
}
</style>

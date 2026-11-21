<script setup>
// Review → «Журнал» (21.11.2026): каждый заход в урок по дням, в том числе незаконченный.
// День: сколько уроков, сколько минут, сколько ответов верно. Заход: урок, какая попытка, время, результат или «не закончен · 7 из 12».
// Нажал заход — по каждому упражнению: ✓ верно / ✗ ошибка / • без оценки / — не дошёл, сколько секунд, с какой попытки, что ответил.
// Данные — GET /progress/log (server/learn.ts → lessonLogs); пишет просмотр курса по ходу урока (utils/runlog.js). Без сервера — этот браузер.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { apiRequest, isDemo, API, fb } from '../firebase'
import { readLocal, byDay, dur, seen } from '../utils/runlog'
import { exName } from '../utils/review'

const props = defineProps({ studentId: { type: [String, Number], default: null } })   // карточка ученика у преподавателя; нет — свой журнал
const online = !isDemo && !!API && !!fb
const runs = ref([]), err = ref(''), loading = ref(false), openRun = ref(null)
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
watch(() => props.studentId, () => { openRun.value = null; load() }, { immediate: true })
// ученик сейчас в уроке — журнал тихо подтягивается раз в 10 с (заход пишется пачкой раз в несколько секунд)
let poll = null
onMounted(() => { poll = setInterval(() => { if (document.visibilityState === 'visible' && !loading.value) load(true) }, 10_000) })
onUnmounted(() => clearInterval(poll))

const days = computed(() => byDay(runs.value))
const week = computed(() => { const from = Date.now() - 7 * 864e5, r = runs.value.filter(x => x.at >= from); return { n: new Set(r.map(x => `${x.course}/${x.item}`)).size, runs: r.length, sec: r.reduce((a, x) => a + (x.sec || 0), 0) } })
const dayName = (d) => {
  const t = new Date(d + 'T12:00:00'), today = new Date(), y = new Date(Date.now() - 864e5)
  const same = (a, b) => a.toDateString() === b.toDateString()
  const s = t.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
  return same(t, today) ? `Сегодня, ${s}` : same(t, y) ? `Вчера, ${s}` : s[0].toUpperCase() + s.slice(1)
}
const hm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const pct = (r) => (r.all ? Math.round(r.ok / r.all * 100) : null)
const tone = (r) => { const p = pct(r); return p == null ? 'z' : p >= 80 ? 'g' : p >= 50 ? 'm' : 'b' }
const lessonsWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'урок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'урока' : 'уроков')
const mark = (s) => (s.ok === true ? '✓' : s.ok === false ? '✗' : s.ok === null ? '•' : '—')
const mcl = (s) => (s.ok === true ? 'g' : s.ok === false ? 'b' : s.ok === null ? 'z' : 'no')
const kindName = (s) => (s.kind ? exName(s) : 'Экран')
</script>

<template>
  <div class="lg">
    <p v-if="err" class="empty">Не удалось загрузить журнал {{ err }}</p>
    <p v-else-if="loading && !runs.length" class="empty">Загрузка…</p>
    <p v-else-if="!runs.length" class="empty">Журнал пуст. Каждый заход в урок появится здесь сразу, даже если урок не закончен: какие упражнения пройдены, верно или нет, сколько времени.</p>
    <template v-else>
      <div class="wk"><span>За 7 дней</span><b>{{ week.n }}</b> {{ lessonsWord(week.n) }}<i>·</i><b>{{ dur(week.sec) }}</b><i>·</i>{{ week.runs }} заход{{ week.runs % 10 === 1 && week.runs % 100 !== 11 ? '' : week.runs % 10 >= 2 && week.runs % 10 <= 4 && (week.runs % 100 < 10 || week.runs % 100 >= 20) ? 'а' : 'ов' }}</div>
      <section v-for="d in days" :key="d.day" class="day">
        <header class="dh">
          <h3>{{ dayName(d.day) }}</h3>
          <span class="ds"><b>{{ d.lessons }}</b> {{ lessonsWord(d.lessons) }}<i>·</i><b>{{ dur(d.sec) }}</b><template v-if="d.all"><i>·</i><b>{{ d.ok }}/{{ d.all }}</b> верно</template></span>
        </header>
        <div class="runs">
          <div v-for="r in d.runs" :key="r.run" class="run" :class="{ on: openRun === r.run }">
            <button class="rh" :aria-expanded="openRun === r.run" @click="openRun = openRun === r.run ? null : r.run">
              <span class="tm">{{ hm(r.at) }}</span>
              <span class="tt"><b>{{ r.title || 'Урок' }}</b><small>{{ [r.courseTitle, r.unit].filter(Boolean).join(' · ') }}</small></span>
              <span v-if="r.try > 1" class="try" :title="'Этот урок открывали ' + r.try + '-й раз'">{{ r.try }}-я попытка</span>
              <span class="rs">
                <template v-if="r.fin"><b :class="tone(r)">{{ r.all ? `${r.ok}/${r.all}` : '✓' }}</b><small>{{ r.all ? pct(r) + '%' : 'без оценки' }}</small></template>
                <template v-else><b class="ip">не закончен</b><small>{{ seen(r) }} из {{ r.n || r.steps.length }} упр.</small></template>
              </span>
              <span class="du">{{ dur(r.sec) }}</span>
              <svg class="ch" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <ol v-if="openRun === r.run" class="st">
              <li v-for="(s, k) in r.steps" :key="s.id" :class="{ no: mcl(s) === 'no' }">
                <span class="mk" :class="mcl(s)">{{ mark(s) }}</span>
                <span class="sn">{{ k + 1 }}</span>
                <span class="sw"><b>{{ kindName(s) }}</b><template v-if="s.w"> · {{ s.w }}</template>
                  <small v-if="s.x">ответ: «{{ s.x }}»<template v-if="s.sc != null"> · ИИ {{ s.sc }}%</template></small>
                  <small v-else-if="s.ok === undefined && s.sec == null">не дошёл</small></span>
                <span class="sm"><template v-if="s.t > 1">{{ s.t }} попытки · </template><template v-if="s.sec != null">{{ dur(s.sec) }}</template></span>
              </li>
            </ol>
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
.day { background: var(--card); border-radius: 18px; box-shadow: 0 1px 0 rgba(0, 0, 0, .04), 0 6px 22px rgba(0, 0, 0, .05); overflow: hidden; min-width: 0 }
.dh { display: flex; align-items: baseline; justify-content: space-between; gap: 6px 12px; flex-wrap: wrap; padding: 14px 16px 10px }
.dh h3 { margin: 0; font-size: 16px; font-weight: 900 }
.ds { font-size: 13px; font-weight: 700; color: var(--hint); white-space: nowrap }
.runs { display: grid }
.run { border-top: 1px solid var(--border) }
.rh { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto auto 52px 16px; align-items: center; gap: 10px; padding: 10px 16px }
.rh:hover { background: var(--surface) } .rh:focus-visible { outline: 2px solid #1cb0f6; outline-offset: -2px }
.tm { font-size: 13px; font-weight: 800; color: var(--hint); font-variant-numeric: tabular-nums }
.tt { display: grid; min-width: 0 } .tt b { font-size: 14.5px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tt small { font-size: 12px; color: var(--hint); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.try { font-size: 11.5px; font-weight: 800; color: #1278b0; background: #e6f6fe; border-radius: 8px; padding: 2px 7px; white-space: nowrap }
.rs { display: grid; justify-items: end; line-height: 1.15 } .rs b { font-size: 14px; font-weight: 900; white-space: nowrap } .rs small { font-size: 11.5px; color: var(--hint); font-weight: 700; white-space: nowrap }
.g { color: #2e8b00 } .m { color: #c2590a } .b { color: #d92d20 } .z { color: var(--hint) } .ip { color: #c2590a }
.du { font-size: 13px; font-weight: 800; color: var(--hint); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums }
.ch { width: 16px; height: 16px; fill: none; stroke: var(--hint); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s } .run.on .ch { transform: rotate(90deg) }
.st { list-style: none; margin: 0; padding: 2px 16px 12px 70px; display: grid; gap: 2px }
.st li { display: grid; grid-template-columns: 20px 22px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 5px 0; border-top: 1px dashed var(--border); font-size: 13.5px }
.st li:first-child { border-top: 0 } .st li.no { opacity: .5 }
.mk { font-weight: 900; text-align: center } .mk.no { color: var(--hint) }
.sn { font-size: 12px; color: var(--hint); font-weight: 700; font-variant-numeric: tabular-nums }
.sw { min-width: 0; overflow-wrap: anywhere } .sw b { font-weight: 800 } .sw small { display: block; font-size: 12px; color: var(--hint); font-weight: 600; margin-top: 1px }
.sm { font-size: 12px; color: var(--hint); font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums }
@media (max-width: 560px) {
  .rh { grid-template-columns: 40px minmax(0, 1fr) auto 44px 14px; gap: 8px; padding: 10px 12px } .try { display: none }
  .dh { padding: 12px 12px 8px } .st { padding: 2px 12px 10px 12px } .tt b { white-space: normal; line-height: 1.2 }
}
</style>

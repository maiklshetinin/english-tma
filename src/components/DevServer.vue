<script setup>
// Сервер — для разработчика: запросы и ошибки, время ответа, память и CPU по минутам (server/devops.ts), самые тяжёлые запросы,
// пересборка и перезапуск с прогрессом — DevDeploy.vue.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { request } from '../stores/api'
import MiniChart from './MiniChart.vue'
import DevDeploy from './DevDeploy.vue'

const range = ref('hour')
const data = ref(null), err = ref(''), busy = ref(false)
async function load() {
  busy.value = true
  try { data.value = await request('/dev/server?range=' + range.value, undefined, 'Сервер'); err.value = '' } catch (e) { err.value = e.message }
  busy.value = false
}
watch(range, load)
let timer = 0
onMounted(() => { load(); timer = window.setInterval(() => document.visibilityState === 'visible' && load(), 30_000) })
onBeforeUnmount(() => clearInterval(timer))

const pts = computed(() => data.value?.points ?? [])
// графики — вкладками (один на экране, без прокрутки); выбранная запоминается
const CHARTS = [['req', 'Запросы'], ['ms', 'Время ответа'], ['mem', 'Память'], ['cpu', 'Процессор']]
const chart = ref((() => { try { const v = localStorage.getItem('tma.devServerChart'); return CHARTS.some(([k]) => k === v) ? v : 'req' } catch { return 'req' } })())
watch(chart, (v) => { try { localStorage.setItem('tma.devServerChart', v) } catch { /* приватный режим */ } })
const sum = (k) => pts.value.reduce((a, p) => a + (p[k] || 0), 0)
const uptime = computed(() => {
  if (!data.value) return ''
  const m = Math.floor((Date.now() - data.value.startedAt) / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d} д ${h} ч` : h ? `${h} ч ${m % 60} мин` : `${m} мин`
})
const MEM_LIMIT = 512          // бесплатный Render
const memPct = computed(() => data.value ? Math.round((data.value.now.rss / MEM_LIMIT) * 100) : 0)
const avgMs = computed(() => { const r = sum('req'); return r ? Math.round(pts.value.reduce((a, p) => a + p.avg * p.req, 0) / r) : 0 })

const NAMES = { schedule: 'Расписание', lessons: 'Уроки', students: 'Ученики', content: 'Пути и колоды', courses: 'Конструктор курсов', notes: 'Заметки', groups: 'Группы', review: 'Повторение', me: 'Профиль', auth: 'Вход', invites: 'Приглашения', dev: 'Панель разработчика', media: 'Медиа', srs: 'Слова', paths: 'Пути', decks: 'Колоды', presets: 'Пресеты', ping: 'Пинг' }
const nice = (label) => NAMES[label.split(' /')[1]?.split('/')[0]] ?? label
</script>

<template>
  <div class="ds">
    <div class="hd">
      <b>Сервер</b>
      <span class="seg"><button v-for="[k, t] in [['hour', 'Час'], ['day', 'Сутки']]" :key="k" type="button" :class="{ on: range === k }" @click="range = k">{{ t }}</button></span>
      <button type="button" class="rf" :class="{ spin: busy }" title="Обновить" @click="load">↻</button>
    </div>
    <div v-if="err" class="er">{{ err }}</div>
    <template v-else-if="data">
      <div class="kp">
        <span><small>работает</small><b>{{ uptime }}</b></span>
        <span><small>память</small><b :class="{ warn: memPct >= 75 }">{{ Math.round(data.now.rss) }} МБ</b><i>{{ memPct }}% из {{ MEM_LIMIT }}</i></span>
        <span><small>запросов</small><b>{{ sum('req').toLocaleString('ru') }}</b><i :class="{ bad: sum('e5') }">{{ sum('e5') }} ошибок 5xx</i></span>
        <span><small>ответ в среднем</small><b :class="{ warn: avgMs > 500 }">{{ avgMs }} мс</b></span>
        <span><small>на связи</small><b>{{ data.conns }}</b></span>
      </div>
      <p class="meta">коммит <code>{{ data.commit || '—' }}</code> · Node {{ data.node }} · с {{ new Date(data.startedAt).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</p>

      <div class="cg">
        <div class="ctabs" role="tablist"><button v-for="[k, t] in CHARTS" :key="k" type="button" role="tab" :aria-selected="chart === k" :class="{ on: chart === k }" @click="chart = k">{{ t }}</button></div>
        <MiniChart v-if="chart === 'req'" :height="150" :points="pts" :step="data.step" :range="range" :series="[{ k: 'req', t: 'Запросы', c: '#4285f4' }, { k: 'e4', t: 'Ошибки 4xx', c: '#fa7b17' }, { k: 'e5', t: 'Ошибки 5xx', c: '#e8453c' }]" />
        <MiniChart v-else-if="chart === 'ms'" :height="150" :points="pts" :step="data.step" :range="range" unit="мс" :series="[{ k: 'avg', t: 'Среднее', c: '#4285f4' }, { k: 'max', t: 'Самый долгий', c: '#fa7b17' }]" />
        <MiniChart v-else-if="chart === 'mem'" :height="150" :points="pts" :step="data.step" :range="range" unit="МБ" :limits="[{ v: MEM_LIMIT, t: 'лимит Render 512 МБ', c: '#e8453c' }]" :series="[{ k: 'rss', t: 'Всего (RSS)', c: '#9747ff' }, { k: 'heap', t: 'Куча JS', c: '#14ae5c' }]" />
        <MiniChart v-else :height="150" :points="pts" :step="data.step" :range="range" unit="%" :series="[{ k: 'cpu', t: 'CPU', c: '#00b5ce' }]" />
      </div>

      <div v-if="data.routes.length" class="tp">
        <div class="th"><b>Самые тяжёлые запросы</b><small>по суммарному времени за период</small></div>
        <div class="tr th2"><span>Запрос</span><span>раз</span><span>среднее</span><span>худшее</span></div>
        <div v-for="r in data.routes" :key="r.label" class="tr">
          <span class="tn">{{ nice(r.label) }}<small>{{ r.label }}<em v-if="r.e"> · {{ r.e }} ошиб.</em></small></span>
          <span>{{ r.n }}</span>
          <span :class="{ warn: r.avg > 500 }">{{ r.avg }} мс</span>
          <span :class="{ warn: r.max > 1500 }">{{ r.max }} мс</span>
        </div>
      </div>

      <!-- пересборка и перезапуск с прогрессом, история сборок и их логи -->
      <DevDeploy />
    </template>
  </div>
</template>

<style scoped>
.ds { display: grid; gap: 10px; min-width: 0 }
.hd { display: flex; align-items: center; gap: 8px } .hd > b { flex: 1; font-size: 16px; font-weight: 600 }
.seg { display: inline-flex; padding: 2px; border-radius: 10px; background: var(--surface) }
.seg button { padding: 5px 10px; border: 0; border-radius: 8px; background: none; color: var(--hint); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.rf { width: 30px; height: 30px; border: 0; border-radius: 8px; background: var(--surface); color: var(--hint); font-size: 16px; cursor: pointer } .rf.spin { animation: rf 1s linear infinite } @keyframes rf { to { rotate: 360deg } }
.er { padding: 10px; border-radius: 10px; background: color-mix(in srgb, #e8453c 10%, transparent); color: #c5221f; font-size: 13px }
.kp { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 6px }
.kp span { display: grid; gap: 1px; padding: 7px 9px; border-radius: 10px; background: var(--surface) } .kp small { font-size: 11px; font-weight: 600; color: var(--hint) } .kp b { font-size: 17px; font-weight: 800 } .kp i { font-size: 10.5px; font-style: normal; font-weight: 600; color: var(--hint) }
.warn { color: #e37400 !important } .bad { color: #d93025 !important }
.meta { margin: 0; font-size: 11.5px; color: var(--hint) } .meta code { padding: 1px 5px; border-radius: 5px; background: var(--surface); color: var(--text); font-size: 11px; font-weight: 700 }
.cg { display: grid; gap: 6px }
/* вкладки графиков — как в DevTools: плоская полоса, активная подчёркнута */
.ctabs { display: flex; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--border) }
.ctabs button { flex: none; margin-bottom: -1px; padding: 6px 10px 5px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--hint); font: inherit; font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer }
.ctabs button:hover { color: var(--text) } .ctabs button.on { color: #1a73e8; border-bottom-color: #1a73e8 }
.tp { display: grid; gap: 4px; padding-top: 6px; border-top: 1px solid var(--border) }
.th { display: grid; margin-bottom: 2px } .th b { font-size: 14px; font-weight: 700 } .th small { font-size: 11.5px; color: var(--hint) }
.tr { display: grid; grid-template-columns: minmax(0, 1fr) 44px 70px 70px; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; text-align: right }
.th2 { font-size: 10.5px; font-weight: 700; color: var(--hint); text-transform: uppercase } .th2 span:first-child { text-align: left }
.tn { display: grid; min-width: 0; text-align: left } .tn small { overflow: hidden; font-size: 10.5px; font-weight: 500; color: var(--hint); text-overflow: ellipsis; white-space: nowrap } .tn em { color: #d93025; font-style: normal }
</style>

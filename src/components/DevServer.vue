<script setup>
// Сервер — для разработчика: запросы и ошибки, время ответа, память и CPU по минутам (server/devops.ts), самые тяжёлые запросы,
// кнопки «Перезапустить» (тот же код, ~30–60 с) и «Пересобрать» (свежий коммит с GitHub, через Deploy Hook на Render).
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { request, post } from '../stores/api'
import { ask, say } from '../composables/useDialog'
import { showToast } from '../composables/useToast'
import MiniChart from './MiniChart.vue'

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
const sum = (k) => pts.value.reduce((a, p) => a + (p[k] || 0), 0)
const uptime = computed(() => {
  if (!data.value) return ''
  const m = Math.floor((Date.now() - data.value.startedAt) / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d} д ${h} ч` : h ? `${h} ч ${m % 60} мин` : `${m} мин`
})
const MEM_LIMIT = 512          // бесплатный Render
const memPct = computed(() => data.value ? Math.round((data.value.now.rss / MEM_LIMIT) * 100) : 0)
const avgMs = computed(() => { const r = sum('req'); return r ? Math.round(pts.value.reduce((a, p) => a + p.avg * p.req, 0) / r) : 0 })

async function restart() {
  if (!(await ask('Перезапустить сервер?', { text: 'Тот же код, чистый старт: ~30–60 секунд приложение будет без сервера, у всех оборвётся живое соединение и переподключится само. Кэш базы обнулится.', ok: 'Перезапустить', danger: true }))) return
  try { await post('/dev/restart', {}, 'Перезапуск'); showToast('Сервер перезапускается — через минуту обновите') } catch (e) { showToast(e.message) }
}
async function deploy() {
  if (!data.value?.deployHook) return say('Нет Deploy Hook', { text: 'Render → сервис → Settings → Deploy Hook: скопируйте ссылку и добавьте её в Environment переменной RENDER_DEPLOY_HOOK. После этого кнопка заработает.' })
  if (!(await ask('Пересобрать сервер с последнего коммита?', { text: 'Render скачает свежий код с GitHub и соберёт его — пара минут. Пока идёт сборка, работает старый сервер, потом Render переключит на новый (живое соединение у всех на секунду оборвётся).', ok: 'Пересобрать' }))) return
  try {
    const r = await post('/dev/deploy', {}, 'Пересборка')
    showToast(r.ok ? 'Сборка запущена — следите в консоли ниже' : r.error)
  } catch (e) { showToast(e.message) }
}
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
        <div><h4>Запросы</h4><MiniChart :height="120" :points="pts" :step="data.step" :range="range" :series="[{ k: 'req', t: 'Запросы', c: '#4285f4' }, { k: 'e4', t: 'Ошибки 4xx', c: '#fa7b17' }, { k: 'e5', t: 'Ошибки 5xx', c: '#e8453c' }]" /></div>
        <div><h4>Время ответа</h4><MiniChart :height="120" :points="pts" :step="data.step" :range="range" unit="мс" :series="[{ k: 'avg', t: 'Среднее', c: '#4285f4' }, { k: 'max', t: 'Самый долгий', c: '#fa7b17' }]" /></div>
        <div><h4>Память</h4><MiniChart :height="120" :points="pts" :step="data.step" :range="range" unit="МБ" :limits="[{ v: MEM_LIMIT, t: 'лимит Render 512 МБ', c: '#e8453c' }]" :series="[{ k: 'rss', t: 'Всего (RSS)', c: '#9747ff' }, { k: 'heap', t: 'Куча JS', c: '#14ae5c' }]" /></div>
        <div><h4>Процессор</h4><MiniChart :height="120" :points="pts" :step="data.step" :range="range" unit="%" :series="[{ k: 'cpu', t: 'CPU', c: '#00b5ce' }]" /></div>
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

      <div class="bt">
        <button type="button" class="b1" @click="restart">⟳ Перезапустить</button>
        <button type="button" class="b2" :class="{ off: !data.deployHook }" @click="deploy">⤓ Пересобрать с последнего коммита</button>
      </div>
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
.cg { display: grid; gap: 4px } .cg h4 { margin: 6px 0 0; font-size: 12.5px; font-weight: 700 }
.tp { display: grid; gap: 4px; padding-top: 6px; border-top: 1px solid var(--border) }
.th { display: grid; margin-bottom: 2px } .th b { font-size: 14px; font-weight: 700 } .th small { font-size: 11.5px; color: var(--hint) }
.tr { display: grid; grid-template-columns: minmax(0, 1fr) 44px 70px 70px; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; text-align: right }
.th2 { font-size: 10.5px; font-weight: 700; color: var(--hint); text-transform: uppercase } .th2 span:first-child { text-align: left }
.tn { display: grid; min-width: 0; text-align: left } .tn small { overflow: hidden; font-size: 10.5px; font-weight: 500; color: var(--hint); text-overflow: ellipsis; white-space: nowrap } .tn em { color: #d93025; font-style: normal }
.bt { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 4px }
.bt button { padding: 9px 14px; border: 0; border-radius: 10px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer }
.b1 { background: color-mix(in srgb, #e8453c 12%, transparent); color: #c5221f } .b2 { background: color-mix(in srgb, #4285f4 12%, transparent); color: #1a5fd0 } .b2.off { opacity: .55 }
</style>

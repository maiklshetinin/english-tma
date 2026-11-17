<script setup>
// Пересборка и перезапуск сервера из «Профиля» — с прогрессом (server/render.ts):
//  • с ключом Render API — точные стадии сборки от Render, логи сборки (npm install, tsc) и история последних сборок;
//  • без ключа — Deploy Hook и завершение процесса: «готово» понимаем по тому, что сервер вернулся с новым временем старта.
// Карточка прогресса появляется и когда сборку запустили не отсюда (из Render или автодеплоем) — по статусу последней сборки.
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { request, post } from '../stores/api'
import { ask } from '../composables/useDialog'
import { showToast } from '../composables/useToast'

const info = ref(null)          // { via: 'api' | 'hook' | '', deploys, commit, startedAt }
const op = ref(null)            // что запустили отсюда: { kind: 'deploy' | 'restart', t0, start0, down, done, fail, commit }
const now = ref(Date.now())
const logs = ref([]), logsFor = ref(''), showLogs = ref(true), box = ref(null)

const RUN = ['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']
const FAIL = ['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled']
const ST = { created: 'создана', queued: 'в очереди', build_in_progress: 'собирается', pre_deploy_in_progress: 'подготовка', update_in_progress: 'запускается', live: 'работает', deactivated: 'заменена', build_failed: 'ошибка сборки', update_failed: 'ошибка запуска', pre_deploy_failed: 'ошибка подготовки', canceled: 'отменена' }
const TRIG = { new_commit: 'коммит', manual: 'вручную', api: 'из приложения', deploy_hook: 'хук', blueprint_sync: 'blueprint', rollback: 'откат' }

const last = computed(() => info.value?.deploys?.[0])
const running = computed(() => !!last.value && RUN.includes(last.value.status))

async function loadInfo() {
  try {
    const r = await request('/dev/deploys', undefined, 'Сборки сервера')
    if (op.value?.down && !op.value.done) op.value.back = true
    info.value = r
    checkOp()
  } catch { if (op.value && !op.value.done) op.value.down = true }          // сервер выключен — это ожидаемо посреди перезапуска
}
async function loadLogs() {
  const d = sel.value
  if (info.value?.via !== 'api' || !d) return
  if (logsFor.value !== d.id) { logs.value = []; logsFor.value = d.id }
  try {
    const since = logs.value.length ? new Date(logs.value.at(-1).t).toISOString() : ''
    const r = await request(`/dev/deploys/${d.id}/logs${since ? '?since=' + encodeURIComponent(since) : ''}`, undefined, 'Логи сборки')
    if (r.lines.length) { logs.value = [...logs.value, ...r.lines].slice(-800); nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight }) }
  } catch { /* сборка ещё не дала логов или сервер переключается */ }
}
// готово? — по Render (с ключом) или по новому времени старта сервера
function checkOp() {
  const o = op.value, i = info.value
  if (!o || o.done || !i) return
  const fresh = i.startedAt > o.start0
  if (o.kind === 'deploy' && i.via === 'api') {
    const d = i.deploys.find(x => x.id === o.id) ?? last.value
    if (d && FAIL.includes(d.status)) Object.assign(o, { done: true, end: Date.now(), fail: ST[d.status] })
    else if (d?.status === 'live' && fresh) Object.assign(o, { done: true, end: Date.now(), commit: i.commit })
  } else if (fresh) Object.assign(o, { done: true, end: Date.now(), commit: i.commit })
  else if (now.value - o.t0 > 10 * 60_000) Object.assign(o, { done: true, end: Date.now(), fail: 'сервер так и не вернулся за 10 минут — посмотрите в Render' })
}

// стадии для полоски
const steps = computed(() => {
  const o = op.value, d = o?.kind === 'deploy' ? (info.value?.deploys.find(x => x.id === o.id) ?? last.value) : (!o ? last.value : null)
  if (o?.kind === 'restart') return { names: ['Выключение', 'Запуск', 'Работает'], at: o.done ? 2 : o.down || o.back ? 1 : 0 }
  if (info.value?.via === 'api' && d) {
    const s = d.status, at = s === 'live' && (!o || o.done) ? 3 : s === 'update_in_progress' || s === 'live' ? 2 : s === 'build_in_progress' || s === 'pre_deploy_in_progress' ? 1 : s === 'update_failed' ? 2 : s === 'build_failed' || s === 'pre_deploy_failed' ? 1 : 0
    return { names: ['В очереди', 'Сборка', 'Запуск', 'Готово'], at }
  }
  return { names: ['Сборка на Render', 'Переключение', 'Готово'], at: o?.done ? 2 : o?.down || o?.back ? 1 : 0 }
})
const shown = computed(() => !!op.value || running.value)
const failed = computed(() => op.value?.fail || (!op.value && last.value && FAIL.includes(last.value.status) ? ST[last.value.status] : ''))
const t0 = computed(() => op.value?.t0 ?? (last.value ? Date.parse(last.value.createdAt) : now.value))
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const title = computed(() => {
  const o = op.value
  if (o?.done) return o.fail ? '⚠ Не удалось: ' + o.fail : `✓ Готово за ${mmss((o.end ?? now.value) - o.t0)}${o.commit ? ' · коммит ' + o.commit : ''}`
  if (o?.kind === 'restart') return 'Перезапуск сервера…'
  return 'Пересборка сервера…'
})

// выбранная сборка для логов: идущая / запущенная отсюда / нажатая в истории
const picked = ref('')
const sel = computed(() => info.value?.deploys.find(d => d.id === (picked.value || op.value?.id)) ?? last.value)

let fast = 0, slow = 0, tick = 0
function pump() { loadInfo().then(() => (showLogs.value || running.value) && loadLogs()) }
onMounted(() => {
  pump()
  slow = window.setInterval(() => !shown.value && document.visibilityState === 'visible' && loadInfo(), 30_000)
  fast = window.setInterval(() => shown.value && pump(), 3000)                                   // пока идёт — раз в 3 с
  tick = window.setInterval(() => { now.value = Date.now(); checkOp() }, 1000)
})
onBeforeUnmount(() => { clearInterval(fast); clearInterval(slow); clearInterval(tick) })

async function deploy() {
  if (!info.value?.via) return showToast('Нет RENDER_API_KEY на Render — см. подсказку ниже')
  if (!(await ask('Пересобрать сервер с последнего коммита?', { text: 'Render скачает свежий код с GitHub и соберёт его — пара минут. Пока идёт сборка, работает старый сервер; потом Render переключит на новый (живое соединение у всех на секунду оборвётся).', ok: 'Пересобрать' }))) return
  try {
    const r = await post('/dev/deploy', {}, 'Пересборка')
    op.value = { kind: 'deploy', id: r.id, t0: Date.now(), start0: info.value.startedAt }; picked.value = ''; showLogs.value = true; pump()
  } catch (e) { showToast(e.message) }
}
async function restart() {
  if (!(await ask('Перезапустить сервер?', { text: 'Тот же код, чистый старт: ~30–60 секунд приложение будет без сервера, у всех оборвётся живое соединение и переподключится само. Кэш базы обнулится.', ok: 'Перезапустить', danger: true }))) return
  try {
    await post('/dev/restart', {}, 'Перезапуск')
    op.value = { kind: 'restart', t0: Date.now(), start0: info.value?.startedAt ?? Date.now() }
  } catch (e) { showToast(e.message) }
}
const when = (iso) => iso ? new Date(iso).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const took = (d) => (d.finishedAt && d.createdAt ? mmss(Date.parse(d.finishedAt) - Date.parse(d.createdAt)) : '')
const tone = (s) => (s === 'live' ? 'ok' : FAIL.includes(s) ? 'bad' : RUN.includes(s) ? 'run' : '')
</script>

<template>
  <div class="dd">
    <!-- прогресс: стадии, таймер, логи сборки -->
    <div v-if="shown" class="pg" :class="{ ok: op?.done && !op.fail, bad: failed }">
      <div class="pt"><b>{{ failed && !op ? '⚠ Последняя сборка: ' + failed : title }}</b><span class="tm">{{ op?.done ? '' : mmss(now - t0) }}</span><button v-if="op?.done" type="button" class="x" @click="op = null">✕</button></div>
      <div class="st">
        <span v-for="(n, i) in steps.names" :key="n" class="sp" :class="{ done: i < steps.at || (i === steps.at && op?.done && !op.fail), cur: i === steps.at && !(op?.done), fail: failed && i === steps.at }"><i />{{ n }}</span>
      </div>
      <small v-if="info?.via !== 'api' && !op?.done" class="hn">{{ op?.kind === 'restart' ? 'Ждём, пока сервер вернётся с новым временем старта.' : 'Без ключа Render стадий сборки не видно — ждём, пока сервер вернётся с новым коммитом.' }}</small>
    </div>

    <div class="bt">
      <button type="button" class="b2" :disabled="running || (op && !op.done)" @click="deploy">⤓ Пересобрать с последнего коммита</button>
      <button type="button" class="b1" :disabled="running || (op && !op.done)" @click="restart">⟳ Перезапустить</button>
    </div>
    <small v-if="info && !info.via" class="hn">Пересборка из приложения: добавьте на Render в Environment переменную RENDER_API_KEY (Account Settings → API Keys).</small>

    <!-- история сборок (с ключом) -->
    <div v-if="info?.via === 'api' && info.deploys.length" class="hs">
      <div class="hh"><b>Сборки</b><button type="button" class="lk" @click="showLogs = !showLogs">{{ showLogs ? 'скрыть логи' : 'логи сборки' }}</button></div>
      <button v-for="d in info.deploys" :key="d.id" type="button" class="dr" :class="{ sel: sel?.id === d.id && showLogs }" @click="picked = d.id; showLogs = true; loadLogs()">
        <span class="ch" :class="tone(d.status)">{{ ST[d.status] || d.status }}</span>
        <span class="dm"><span><code>{{ d.commit || '—' }}</code> {{ d.message }}</span><small>{{ when(d.createdAt) }} · {{ TRIG[d.trigger] || d.trigger }}{{ took(d) && ' · ' + took(d) }}{{ d.commit === info.commit && d.status === 'live' ? ' · сейчас работает' : '' }}</small></span>
      </button>
      <div v-if="showLogs" ref="box" class="term">
        <div v-for="(l, i) in logs" :key="i" class="ln" :class="{ e: /error|failed|ERR!/i.test(l.msg) }"><span class="tm2">{{ new Date(l.t).toLocaleTimeString('ru') }}</span><span>{{ l.msg }}</span></div>
        <div v-if="!logs.length" class="em">{{ sel && RUN.includes(sel.status) ? 'ждём первые строки сборки…' : 'логов сборки нет (Render хранит их ограниченное время)' }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd { display: grid; gap: 8px }
.pg { display: grid; gap: 8px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, #4285f4 9%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, #4285f4 25%, transparent) }
.pg.ok { background: color-mix(in srgb, #34a853 10%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, #34a853 30%, transparent) }
.pg.bad { background: color-mix(in srgb, #e8453c 9%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, #e8453c 30%, transparent) }
.pt { display: flex; align-items: center; gap: 8px } .pt b { flex: 1; font-size: 14px; font-weight: 700 } .tm { font: 700 13px ui-monospace, Menlo, Consolas, monospace; color: var(--hint) }
.x { width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--hint); cursor: pointer }
.st { display: flex; flex-wrap: wrap; gap: 4px 14px }
.sp { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--hint) }
.sp i { width: 10px; height: 10px; border-radius: 50%; background: var(--border) }
.sp.done { color: var(--text) } .sp.done i { background: #34a853 }
.sp.cur { color: var(--text) } .sp.cur i { background: #4285f4; box-shadow: 0 0 0 0 #4285f4; animation: pl 1.2s ease-out infinite }
.sp.fail { color: #c5221f } .sp.fail i { background: #e8453c; animation: none }
@keyframes pl { to { box-shadow: 0 0 0 7px transparent } }
.hn { font-size: 11.5px; color: var(--hint) }
.bt { display: flex; flex-wrap: wrap; gap: 8px }
.bt button { padding: 9px 14px; border: 0; border-radius: 10px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer } .bt button:disabled { opacity: .45; cursor: default }
.b1 { background: color-mix(in srgb, #e8453c 12%, transparent); color: #c5221f } .b2 { background: color-mix(in srgb, #4285f4 12%, transparent); color: #1a5fd0 }
.hs { display: grid; gap: 4px; padding-top: 6px; border-top: 1px solid var(--border) }
.hh { display: flex; align-items: center; justify-content: space-between } .hh b { font-size: 14px; font-weight: 700 }
.lk { border: 0; background: none; color: #1a73e8; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer }
.dr { display: flex; align-items: flex-start; gap: 8px; padding: 6px 6px; border: 0; border-radius: 8px; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer } .dr:hover, .dr.sel { background: var(--surface) }
.ch { flex: none; min-width: 92px; padding: 2px 8px; border-radius: 8px; background: var(--surface); font-size: 11.5px; font-weight: 800; text-align: center; color: var(--hint) }
.ch.ok { background: color-mix(in srgb, #34a853 15%, transparent); color: #188038 } .ch.bad { background: color-mix(in srgb, #e8453c 14%, transparent); color: #c5221f } .ch.run { background: color-mix(in srgb, #4285f4 14%, transparent); color: #1a5fd0 }
.dm { display: grid; min-width: 0; font-size: 13px; font-weight: 600 } .dm code { padding: 0 5px; border-radius: 5px; background: var(--surface); font-size: 11.5px } .dm small { font-size: 11px; font-weight: 500; color: var(--hint) }
.term { max-height: 240px; overflow: auto; padding: 8px 0; border-radius: 12px; background: #1e1f22; color: #d4d4d4; font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overscroll-behavior: contain }
.ln { display: flex; gap: 10px; padding: 0 12px; white-space: pre-wrap; word-break: break-word } .ln.e { color: #f28b82 } .tm2 { flex: none; color: #6f737a }
.em { padding: 14px 12px; color: #6f737a; text-align: center }
</style>

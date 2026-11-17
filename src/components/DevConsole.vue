<script setup>
// Консоль сервера — для разработчика: те же строки, что в логах Render (server/devops.ts), новые приходят сразу по живому соединению.
// Фильтры «все / ошибки / медленные», поиск, пауза (новые копятся и не двигают список), «копировать» видимое — скинуть кусок лога.
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { request } from '../stores/api'
import { liveSend, onLive, live } from '../composables/useLive'
import { showToast } from '../composables/useToast'

const MAX = 1500
const lines = ref([]), paused = ref(false), held = ref([]), mode = ref('all'), q = ref(''), err = ref('')
const box = ref(null)
let stick = true

const REQ = /^(GET|POST|PUT|PATCH|DELETE) (\S+) (\d{3}) (\d+)ms$/
function parse(l) {
  const m = REQ.exec(l.msg)
  return m ? { ...l, req: { method: m[1], path: m[2], code: +m[3], ms: +m[4] } } : l
}
function add(arr) {
  if (!arr.length) return
  const have = new Set(lines.value.map(l => l.id))
  const next = [...lines.value, ...arr.filter(l => !have.has(l.id)).map(parse)]
  lines.value = next.length > MAX ? next.slice(-MAX) : next
  if (stick) nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
}
async function load() {
  try { const r = await request('/dev/logs?after=' + (lines.value.at(-1)?.id ?? 0), undefined, 'Консоль сервера'); add(r.lines); err.value = '' } catch (e) { err.value = e.message }
}
const subscribe = () => liveSend({ t: 'logs', on: true })
const offs = []
onMounted(() => {
  load(); subscribe()
  offs.push(onLive('log', (m) => (paused.value ? held.value.push(m.line) : add([m.line]))))
  offs.push(onLive('hello', () => { subscribe(); load() }))          // переподключились (сервер перезапустился) — снова подписаться и дочитать
})
onBeforeUnmount(() => { liveSend({ t: 'logs', on: false }); offs.forEach(f => f()) })

function togglePause() { paused.value = !paused.value; if (!paused.value) { add(held.value); held.value = [] } }
const onScroll = () => { const b = box.value; stick = b.scrollTop + b.clientHeight >= b.scrollHeight - 30 }

const kind = (l) => (l.lv === 'error' || l.req?.code >= 500 ? 'e' : l.lv === 'warn' ? 'w' : l.req?.code >= 400 ? 'f' : l.req?.ms >= 1000 ? 's' : '')
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return lines.value.filter(l => (mode.value === 'all' || (mode.value === 'err' ? ['e', 'f', 'w'].includes(kind(l)) : l.req?.ms >= 1000)) && (!s || l.msg.toLowerCase().includes(s)))
})
const time = (t) => new Date(t).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
async function copy() {
  const text = shown.value.map(l => `${time(l.t)} ${l.msg}`).join('\n')
  try { await navigator.clipboard.writeText(text); showToast(`Скопировано строк: ${shown.value.length}`) } catch { showToast('Не удалось скопировать') }
}
</script>

<template>
  <div class="dc">
    <div class="hd">
      <b>Консоль сервера</b>
      <i class="dot" :class="{ on: live.on }" :title="live.on ? 'новые строки приходят сразу' : 'нет живого соединения'" />
      <span class="seg"><button v-for="[k, t] in [['all', 'Все'], ['err', 'Ошибки'], ['slow', 'Медленные']]" :key="k" type="button" :class="{ on: mode === k }" @click="mode = k">{{ t }}</button></span>
    </div>
    <div class="tb">
      <input v-model="q" type="search" placeholder="Поиск по тексту…" />
      <button type="button" :class="{ on: paused }" @click="togglePause">{{ paused ? `▶ Дальше${held.length ? ' (' + held.length + ')' : ''}` : '❚❚ Пауза' }}</button>
      <button type="button" @click="copy">Копировать</button>
      <button type="button" title="Очистить вид (на сервере строки останутся)" @click="lines = []">✕</button>
    </div>
    <div v-if="err" class="er">{{ err }}</div>
    <div ref="box" class="term" @scroll="onScroll">
      <div v-for="l in shown" :key="l.id" class="ln" :class="kind(l)">
        <span class="tm">{{ time(l.t) }}</span>
        <span v-if="l.req" class="tx"><b class="mt">{{ l.req.method }}</b> {{ l.req.path }} <b class="cd">{{ l.req.code }}</b> <span class="ms">{{ l.req.ms }}ms</span></span>
        <span v-else class="tx">{{ l.msg }}</span>
      </div>
      <div v-if="!shown.length" class="em">{{ lines.length ? 'ничего не подходит под фильтр' : 'пока пусто — строки появятся, как только сервер что-то напишет' }}</div>
    </div>
    <small class="nt">Последние {{ MAX }} строк с запуска сервера; полная история — в логах Render.</small>
  </div>
</template>

<style scoped>
.dc { display: grid; gap: 8px; min-width: 0 }
.hd { display: flex; align-items: center; gap: 8px } .hd > b { font-size: 16px; font-weight: 600 } .hd .seg { margin-left: auto }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #9aa0a6 } .dot.on { background: #34a853; box-shadow: 0 0 0 3px color-mix(in srgb, #34a853 25%, transparent) }
.seg { display: inline-flex; padding: 2px; border-radius: 10px; background: var(--surface) }
.seg button { padding: 5px 10px; border: 0; border-radius: 8px; background: none; color: var(--hint); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.tb { display: flex; gap: 6px } .tb input { flex: 1; min-width: 0; width: auto; padding: 7px 10px; border-radius: 10px; font-size: 13px }
.tb button { flex: none; padding: 7px 10px; border: 0; border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .tb button.on { background: #fbbc04; color: #202124 }
.er { padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, #e8453c 10%, transparent); color: #c5221f; font-size: 13px }
/* тёмный «терминал» */
.term { height: 320px; overflow: auto; padding: 8px 0; border-radius: 12px; background: #1e1f22; color: #d4d4d4; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overscroll-behavior: contain }
.ln { display: flex; gap: 10px; padding: 0 12px; white-space: pre-wrap; word-break: break-word } .ln:hover { background: #2b2d31 }
.tm { flex: none; color: #6f737a } .tx { min-width: 0 }
.mt { color: #8ab4f8; font-weight: 700 } .cd { color: #81c995; font-weight: 700 } .ms { color: #9aa0a6 }
.ln.f .cd { color: #fdae4b } .ln.s .ms { color: #fdd663; font-weight: 700 } .ln.w .tx { color: #fdd663 }
.ln.e { background: color-mix(in srgb, #e8453c 14%, transparent) } .ln.e .tx, .ln.e .cd { color: #f28b82 }
.em { padding: 20px 12px; color: #6f737a; text-align: center }
.nt { font-size: 11.5px; color: var(--hint) }
</style>

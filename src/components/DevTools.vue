<script setup>
// Панель разработчика — как DevTools в Chrome, только у разработчика (App.vue: auth.isDev). Открыть: жучок в углу или Ctrl + `.
// Пристыкована справа (на узком экране — снизу); край тянется мышкой, приложение при этом сужается, а не перекрывается:
// #app на время панели становится своим «окном» (position: fixed + transform — фиксированные элементы приложения живут внутри него).
// Вкладки: Сеть (запросы с чтениями базы — useNetLog.js), Консоль сервера, Нагрузка на базу, Сервер. Ширина, высота, вкладка — запоминаются.
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { netlog, clearNet, page, devtools } from '../composables/useNetLog'
import DevConsole from './DevConsole.vue'
import DevUsage from './DevUsage.vue'
import DevServer from './DevServer.vue'

const st = devtools
const wide = ref(window.innerWidth >= 760)
const onResize = () => { wide.value = window.innerWidth >= 760; clamp() }
function clamp() { st.w = Math.max(300, Math.min(window.innerWidth - 320, st.w)); st.h = Math.max(160, Math.min(window.innerHeight - 140, st.h)) }

// приложение сужается под панель
function dock() {
  const app = document.getElementById('app'), root = document.documentElement
  if (!app) return
  app.classList.toggle('dt-docked', st.open && wide.value)
  app.classList.toggle('dt-docked-b', st.open && !wide.value)
  root.style.setProperty('--dt-w', st.w + 'px'); root.style.setProperty('--dt-h', st.h + 'px')
}
watch(() => [st.open, st.w, st.h, wide.value], dock)
watch(() => st.open, (o) => { netlog.capture = o }, { immediate: true })          // тела ответов — только пока панель открыта

// тянуть край
const drag = ref(false)
function grip(e) {
  e.preventDefault(); drag.value = true
  const move = (m) => { if (wide.value) st.w = Math.round(window.innerWidth - m.clientX); else st.h = Math.round(window.innerHeight - m.clientY); clamp() }
  const up = () => { drag.value = false; removeEventListener('pointermove', move); removeEventListener('pointerup', up) }
  addEventListener('pointermove', move); addEventListener('pointerup', up)
}
const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.code === 'Backquote') { e.preventDefault(); st.open = !st.open } }
onMounted(() => { clamp(); dock(); addEventListener('resize', onResize); addEventListener('keydown', onKey) })
onBeforeUnmount(() => { st.open && document.getElementById('app')?.classList.remove('dt-docked', 'dt-docked-b'); removeEventListener('resize', onResize); removeEventListener('keydown', onKey) })

const TABS = [['net', 'Сеть'], ['console', 'Консоль'], ['usage', 'Нагрузка'], ['server', 'Сервер']]

// ── Сеть ──────────────────────────────────────────────────────────────────────────────────────
const route = useRoute()
const cur = ref(page())
watch(() => route.fullPath, () => { cur.value = page() })
const onlyPage = ref(true), mode = ref('all'), q = ref(''), selId = ref(0), dtab = ref('head')
const HEAVY = 20, VERY = 60
const heavy = (e) => (e.reads ?? 0) >= HEAVY || e.ms >= 1000
const bad = (e) => !!e.err || e.status >= 400
const rows = computed(() => {
  const s = q.value.trim().toLowerCase()
  return netlog.list.filter(e => (!onlyPage.value || e.page === cur.value) && (mode.value === 'all' || (mode.value === 'heavy' ? heavy(e) : bad(e))) && (!s || (e.method + ' ' + e.path).toLowerCase().includes(s)))
})
const sel = computed(() => netlog.list.find(e => e.id === selId.value))
const maxMs = computed(() => Math.max(300, ...rows.value.map(e => e.ms)))
const sum = (list) => list.reduce((a, e) => ({ n: a.n + 1, r: a.r + (e.reads ?? 0), c: a.c + (e.cached ?? 0), ms: a.ms + e.ms, b: a.b + e.size }), { n: 0, r: 0, c: 0, ms: 0, b: 0 })
const pageSum = computed(() => sum(netlog.list.filter(e => e.page === cur.value)))
const kb = (b) => (b >= 1024 * 1024 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B')
const sec = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1).replace('.', ',') + ' с' : ms + ' мс')
const pathOnly = (p) => p.split('?')[0]
const pretty = (t) => { if (!t) return ''; try { return JSON.stringify(JSON.parse(t), null, 2).slice(0, 20000) } catch { return t } }
const rcls = (e) => ((e.reads ?? 0) >= VERY ? 'vh' : (e.reads ?? 0) >= HEAVY ? 'hv' : '')
function copySummary() {
  const e = sel.value; if (!e) return
  navigator.clipboard?.writeText(`${e.method} ${e.path}\n${e.status} · ${e.ms} мс · ${kb(e.size)} · чтений ${e.reads ?? '—'} · записей ${e.writes ?? '—'} · из кэша ${e.cached ?? '—'}${e.res ? '\n\n' + e.res.slice(0, 4000) : ''}`)
}
</script>

<template>
  <Teleport to="body">
    <button v-if="!st.open" type="button" class="dt-fab" title="Панель разработчика (Ctrl + `)" @click="st.open = true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9V8a3 3 0 0 1 6 0v1" /><path d="M8 9h8a6 6 0 0 1 1 3v3a5 5 0 0 1-10 0v-3a6 6 0 0 1 1-3" /><path d="M3 13h4M17 13h4M12 20v-6M4 19l3.35-2M20 19l-3.35-2M4 7l3.75 2.4M20 7l-3.75 2.4" /></svg>
    </button>
    <aside v-else class="dvt" :class="wide ? 'r' : 'b'" :style="wide ? { width: st.w + 'px' } : { height: st.h + 'px' }">
      <div class="grip" :class="{ on: drag }" @pointerdown="grip" />
      <div v-if="drag" class="shield" />
      <header class="tabs">
        <button v-for="[k, t] in TABS" :key="k" type="button" class="tab" :class="{ on: st.tab === k }" @click="st.tab = k">{{ t }}<i v-if="k === 'net' && netlog.list.some(e => e.status >= 500 || e.err)" class="dotr" /></button>
        <span class="sp" />
        <button type="button" class="ib" title="Закрыть (Ctrl + `)" @click="st.open = false">✕</button>
      </header>

      <!-- Сеть -->
      <section v-if="st.tab === 'net'" class="net">
        <div class="tb">
          <button type="button" class="ib rec" :class="{ on: netlog.recording }" :title="netlog.recording ? 'Остановить запись' : 'Записывать'" @click="netlog.recording = !netlog.recording"><i /></button>
          <button type="button" class="ib" title="Очистить" @click="clearNet(); selId = 0">⦸</button>
          <input v-model="q" type="search" class="flt" placeholder="Фильтр" />
          <label class="ck"><input v-model="onlyPage" type="checkbox" />этот экран</label>
          <span class="seg"><button v-for="[k, t] in [['all', 'Все'], ['heavy', 'Тяжёлые'], ['err', 'Ошибки']]" :key="k" type="button" :class="{ on: mode === k }" @click="mode = k">{{ t }}</button></span>
        </div>
        <div class="grid" :class="{ split: sel }">
          <div class="tbl">
            <div class="row hd"><span class="nm">Запрос</span><span>Код</span><span title="Чтений базы">Чтен.</span><span title="Отдано из кэша сервера">Кэш</span><span>Время</span><span>Размер</span></div>
            <div v-for="e in rows" :key="e.id" class="row" :class="{ sel: e.id === selId, bad: bad(e), pend: !e.done }" @click="selId = e.id === selId ? 0 : e.id">
              <span class="nm" :title="e.method + ' ' + e.path"><b :class="'m-' + e.method">{{ e.method }}</b> {{ pathOnly(e.path) }}</span>
              <span>{{ e.err ? 'ошибка' : e.done ? e.status : '…' }}</span>
              <span :class="rcls(e)">{{ e.reads ?? '—' }}</span>
              <span class="mut">{{ e.cached || '' }}</span>
              <span class="tm"><i :style="{ width: Math.min(100, (e.ms / maxMs) * 100) + '%' }" :class="{ slow: e.ms >= 1000 }" /><em>{{ e.done ? sec(e.ms) : '…' }}</em></span>
              <span class="mut">{{ e.size ? kb(e.size) : '' }}</span>
            </div>
            <div v-if="!rows.length" class="empty">{{ netlog.list.length ? 'ничего не подходит под фильтр' : 'Запросов пока нет — пользуйтесь приложением, они появятся здесь' }}</div>
          </div>
          <div v-if="sel" class="det">
            <div class="dtabs">
              <button v-for="[k, t] in [['head', 'Заголовки'], ['res', 'Ответ'], ['req', 'Запрос']]" :key="k" type="button" :class="{ on: dtab === k }" @click="dtab = k">{{ t }}</button>
              <span class="sp" /><button type="button" class="ib" title="Скопировать сводку и ответ" @click="copySummary">⧉</button><button type="button" class="ib" @click="selId = 0">✕</button>
            </div>
            <div v-if="dtab === 'head'" class="kv">
              <span>Запрос</span><b>{{ sel.method }} {{ sel.path }}</b>
              <span>Код</span><b :class="{ red: bad(sel) }">{{ sel.err || sel.status }}</b>
              <span>Время</span><b>{{ sec(sel.ms) }}<small v-if="sel.serverMs != null"> · на сервере {{ sec(sel.serverMs) }}, сеть и очередь {{ sec(Math.max(0, sel.ms - sel.serverMs)) }}</small></b>
              <span>Чтений базы</span><b :class="rcls(sel)">{{ sel.reads ?? '— (старый сервер без счёта)' }}</b>
              <span>Записей</span><b>{{ sel.writes ?? '—' }}</b>
              <span>Из кэша</span><b>{{ sel.cached ?? '—' }}<small v-if="sel.cached"> документов — без чтения базы</small></b>
              <span>Размер</span><b>{{ kb(sel.size) }}</b>
              <span>Экран</span><b>{{ sel.page }}</b>
              <span>Когда</span><b>{{ new Date(sel.t).toLocaleTimeString('ru') }}</b>
            </div>
            <pre v-else-if="dtab === 'res'" class="code">{{ sel.res ? pretty(sel.res) : 'Тело ответа сохраняется, только пока панель открыта.' }}</pre>
            <pre v-else class="code">{{ sel.req ? pretty(sel.req) : 'Без тела запроса.' }}</pre>
          </div>
        </div>
        <footer class="sum">
          <span><b>{{ pageSum.n }}</b> запросов</span><span><b :class="{ hv: pageSum.r >= 100 }">{{ pageSum.r }}</b> чтений</span><span><b>{{ pageSum.c }}</b> из кэша</span><span><b>{{ sec(pageSum.ms) }}</b></span><span><b>{{ kb(pageSum.b) }}</b></span>
          <span class="sp" /><span class="mut" :title="cur">экран {{ cur }}</span>
        </footer>
      </section>

      <section v-else-if="st.tab === 'console'" class="pane fill"><DevConsole fill /></section>
      <section v-else-if="st.tab === 'usage'" class="pane"><DevUsage /></section>
      <section v-else class="pane"><DevServer /></section>
    </aside>
  </Teleport>
</template>

<style>
/* приложение сужается под панель: #app — своё «окно», фиксированные элементы приложения остаются внутри него */
#app.dt-docked { position: fixed; top: 0; left: 0; bottom: 0; right: var(--dt-w); overflow: auto; transform: translateZ(0) }
#app.dt-docked-b { position: fixed; top: 0; left: 0; right: 0; bottom: var(--dt-h); overflow: auto; transform: translateZ(0) }
</style>
<style scoped>
.dt-fab { position: fixed; right: 14px; bottom: calc(96px + var(--tg-safe-area-inset-bottom, 0px)); z-index: 9990; width: 38px; height: 38px; display: grid; place-items: center; border: 0; border-radius: 50%; background: #202124; color: #fff; box-shadow: 0 3px 12px rgba(0, 0, 0, .25); cursor: pointer; opacity: .75 } .dt-fab:hover { opacity: 1 }
.dvt { position: fixed; z-index: 9995; display: flex; flex-direction: column; background: var(--card); color: var(--text); font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 0 0 1px var(--border) }
.dvt.r { top: 0; right: 0; bottom: 0 } .dvt.b { left: 0; right: 0; bottom: 0 }
.grip { position: absolute; z-index: 3; background: transparent } .grip:hover, .grip.on { background: #1a73e8 }
.r .grip { left: -2px; top: 0; bottom: 0; width: 5px; cursor: col-resize } .b .grip { top: -2px; left: 0; right: 0; height: 5px; cursor: row-resize }
.shield { position: fixed; inset: 0; z-index: 2 }          /* пока тянут — мышь не уходит в приложение */
.tabs { display: flex; align-items: stretch; height: 30px; flex: none; border-bottom: 1px solid var(--border); background: var(--surface) }
.tab { position: relative; padding: 0 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--hint); font: inherit; cursor: pointer } .tab:hover { color: var(--text); background: var(--card) }
.tab.on { color: var(--text); border-bottom-color: #1a73e8; background: var(--card) }
.dotr { position: absolute; top: 7px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: #d93025 }
.sp { flex: 1 }
.ib { min-width: 26px; height: 26px; align-self: center; padding: 0 5px; border: 0; border-radius: 4px; background: none; color: var(--hint); font: inherit; font-size: 13px; cursor: pointer } .ib:hover { background: var(--surface); color: var(--text) }
.rec i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--hint) } .rec.on i { border-color: #d93025; background: #d93025 }
/* Сеть */
.net { flex: 1; min-height: 0; display: flex; flex-direction: column }
.tb { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-bottom: 1px solid var(--border); flex: none }
.flt { flex: 1; min-width: 60px; width: auto; height: 22px; padding: 0 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--card); font: inherit; font-size: 12px; font-weight: 400 }
.ck { display: flex; align-items: center; gap: 4px; color: var(--hint); white-space: nowrap; cursor: pointer } .ck input { width: auto; margin: 0 }
.seg { display: inline-flex; gap: 1px } .seg button { padding: 2px 7px; border: 0; border-radius: 4px; background: none; color: var(--hint); font: inherit; cursor: pointer } .seg button.on { background: color-mix(in srgb, #1a73e8 14%, transparent); color: #1a5fd0 }
.grid { flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) } .grid.split { grid-template-rows: minmax(80px, 1fr) minmax(120px, 45%) }
.tbl { overflow: auto; font: 11.5px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace }
.row { display: grid; grid-template-columns: minmax(0, 1fr) 46px 44px 38px 76px 54px; gap: 6px; align-items: center; height: 22px; padding: 0 6px; border-bottom: 1px solid var(--border); white-space: nowrap; cursor: default }
.row > span { overflow: hidden; text-overflow: ellipsis } .row > span:not(.nm) { text-align: right }
.row.hd { position: sticky; top: 0; z-index: 1; background: var(--surface); color: var(--hint); font: 11px system-ui, sans-serif }
.row:not(.hd):hover { background: color-mix(in srgb, #1a73e8 6%, transparent) } .row.sel { background: color-mix(in srgb, #1a73e8 14%, transparent) }
.row.bad .nm, .row.bad > span:nth-child(2) { color: #d93025 } .row.pend { color: var(--hint) }
.nm b { font-weight: 700; font-size: 10.5px; color: var(--hint) } .nm b.m-POST, .nm b.m-PUT, .nm b.m-PATCH { color: #e37400 } .nm b.m-DELETE { color: #d93025 }
.hv { color: #e37400; font-weight: 700 } .vh { color: #d93025; font-weight: 700 } .mut { color: var(--hint) } .red { color: #d93025 }
.tm { position: relative } .tm i { position: absolute; left: 0; top: 4px; bottom: 4px; border-radius: 2px; background: color-mix(in srgb, #1a73e8 22%, transparent) } .tm i.slow { background: color-mix(in srgb, #e37400 30%, transparent) } .tm em { position: relative; font-style: normal }
.empty { padding: 24px 12px; color: var(--hint); font: 12px system-ui, sans-serif; text-align: center }
.det { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--border) }
.dtabs { display: flex; align-items: center; height: 26px; flex: none; padding: 0 4px; border-bottom: 1px solid var(--border); background: var(--surface) }
.dtabs > button:not(.ib) { height: 26px; padding: 0 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--hint); font: inherit; cursor: pointer } .dtabs > button.on { color: var(--text); border-bottom-color: #1a73e8 }
.kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; padding: 8px 10px; overflow: auto } .kv > span { color: var(--hint) } .kv b { font-weight: 600; word-break: break-all } .kv small { color: var(--hint); font-weight: 400 }
.code { flex: 1; margin: 0; padding: 8px 10px; overflow: auto; font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word }
.sum { display: flex; align-items: center; gap: 12px; height: 24px; flex: none; padding: 0 8px; border-top: 1px solid var(--border); background: var(--surface); color: var(--hint); white-space: nowrap; overflow: hidden } .sum b { color: var(--text); font-weight: 600 } .sum .mut { overflow: hidden; text-overflow: ellipsis }
/* остальные вкладки */
.pane { flex: 1; min-height: 0; overflow: auto; padding: 12px } .pane.fill { display: flex; flex-direction: column; overflow: hidden }
</style>

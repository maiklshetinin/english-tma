<script setup>
// Панель разработчика — как DevTools в Chrome, только у разработчика (App.vue: auth.isDev). Открыть: жучок в углу или Ctrl + `.
// Пристыкована справа (на узком экране — снизу); край тянется мышкой, приложение при этом сужается, а не перекрывается:
// #app на время панели становится своим «окном» (position: fixed + transform — фиксированные элементы приложения живут внутри него).
// Вкладки: Консоль сервера, Нагрузка на базу, Сервер, Логи (журнал заходов: кто, когда, с чего), ИИ (ключи Gemini для «Ответа по смыслу», 19.11.2026) и Активность (учёт по людям, 19.11.2026; вкладку «Сеть» убрали 18.11.2026 — дубль Network в Chrome DevTools). Ширина, высота, вкладка — запоминаются.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { devtools } from '../composables/useNetLog'
import DevConsole from './DevConsole.vue'
import DevUsage from './DevUsage.vue'
import DevServer from './DevServer.vue'
import DevActivity from './DevActivity.vue'
import DevVisits from './DevVisits.vue'
import DevAi from './DevAi.vue'
import { theme } from '../composables/useTelegram'
// Вид — как панель «Графики» в уроке (CourseViewer.vue): перегородка с «ручкой», размер «ширина × высота» пока тянешь,
// вкладки как в DevTools и свой выключатель «Тёмная» (общий с «Графиками»: tma.graphsTheme; не трогали — как у приложения)
const gStored = ref((() => { try { const v = localStorage.getItem('tma.graphsTheme'); return v === 'dark' || v === 'light' ? v : null } catch { return null } })())
const gDark = computed({
  get: () => (gStored.value ?? theme.value) === 'dark',
  set: (v) => { gStored.value = v ? 'dark' : 'light'; try { localStorage.setItem('tma.graphsTheme', gStored.value) } catch { /* приватный режим */ } },
})
const winW = ref(window.innerWidth), winH = ref(window.innerHeight)
const sizeTip = ref(false)
let tipT = 0

const st = devtools
const wide = ref(window.innerWidth >= 760)
const onResize = () => { wide.value = window.innerWidth >= 760; winW.value = window.innerWidth; winH.value = window.innerHeight; clamp() }
function clamp() { st.w = Math.max(360, Math.min(window.innerWidth - 320, st.w)); st.h = Math.max(160, Math.min(window.innerHeight - 140, st.h)) }

// приложение сужается под панель
function dock() {
  const app = document.getElementById('app'), root = document.documentElement
  if (!app) return
  app.classList.toggle('dt-docked', st.open && wide.value)
  app.classList.toggle('dt-docked-b', st.open && !wide.value)
  root.style.setProperty('--dt-w', st.w + 'px'); root.style.setProperty('--dt-h', st.h + 'px')
}
watch(() => [st.open, st.w, st.h, wide.value], dock)

// тянуть край
const drag = ref(false)
function grip(e) {
  if (e.button !== 0 || drag.value) return
  e.preventDefault(); e.stopPropagation(); drag.value = true
  document.body.style.cursor = wide.value ? 'col-resize' : 'row-resize'; document.body.style.userSelect = 'none'
  clearTimeout(tipT); sizeTip.value = true
  const x0 = e.clientX, y0 = e.clientY, w0 = st.w, h0 = st.h          // тянем от места, где схватили, — перегородка идёт ровно за курсором
  const move = (m) => { if (wide.value) st.w = Math.round(w0 + x0 - m.clientX); else st.h = Math.round(h0 + y0 - m.clientY); clamp() }
  const up = () => { drag.value = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; tipT = setTimeout(() => { sizeTip.value = false }, 1200); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up) }
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up)
}
// Ловим нажатие на край ещё на уровне окна (фаза захвата): обработчики приложения (выделение в сетке недели, перетаскивание, заметки)
// могут остановить событие раньше, чем оно дойдёт до самого края — тогда панель «не тянется»
const onDownCapture = (e) => { if (e.target instanceof Element && e.target.closest('.dvt .grip')) grip(e) }
const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.code === 'Backquote') { e.preventDefault(); st.open = !st.open } }
onMounted(() => { clamp(); dock(); addEventListener('resize', onResize); addEventListener('keydown', onKey); addEventListener('pointerdown', onDownCapture, true) })
onBeforeUnmount(() => { st.open && document.getElementById('app')?.classList.remove('dt-docked', 'dt-docked-b'); removeEventListener('resize', onResize); removeEventListener('keydown', onKey); removeEventListener('pointerdown', onDownCapture, true) })

const TABS = [['console', 'Консоль'], ['usage', 'Нагрузка'], ['server', 'Сервер'], ['visits', 'Логи'], ['activity', 'Активность'], ['ai', 'ИИ']]

</script>

<template>
  <Teleport to="body">
    <button v-if="!st.open" type="button" class="dt-fab" title="Панель разработчика (Ctrl + `)" @click="st.open = true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9V8a3 3 0 0 1 6 0v1" /><path d="M8 9h8a6 6 0 0 1 1 3v3a5 5 0 0 1-10 0v-3a6 6 0 0 1 1-3" /><path d="M3 13h4M17 13h4M12 20v-6M4 19l3.35-2M20 19l-3.35-2M4 7l3.75 2.4M20 7l-3.75 2.4" /></svg>
    </button>
    <div v-if="st.open && sizeTip" class="szt" :style="wide ? { right: st.w + 18 + 'px' } : { bottom: st.h + 12 + 'px' }">{{ wide ? winW - st.w : winW }} × {{ wide ? winH : winH - st.h }}</div>
    <aside v-if="st.open" class="dvt" :class="[wide ? 'r' : 'b', { dark: gDark }]" :style="wide ? { width: st.w + 'px' } : { height: st.h + 'px' }">
      <div class="grip" :class="{ on: drag }" title="Потяните, чтобы изменить ширину приложения" />
      <div v-if="drag" class="shield" />
      <header class="tabs" role="tablist">
        <label class="gth" title="Тёмная тема панели"><span>Тёмная</span><input v-model="gDark" type="checkbox" role="switch" :aria-checked="gDark" /><i aria-hidden="true" /></label>
        <button v-for="[k, t] in TABS" :key="k" type="button" role="tab" class="tab" :class="{ on: st.tab === k }" :aria-selected="st.tab === k" @click="st.tab = k">{{ t }}</button>
        <span class="sp" />
        <button type="button" class="ib" title="Закрыть (Ctrl + `)" @click="st.open = false">✕</button>
      </header>

      <section v-if="st.tab === 'console'" class="pane fill"><DevConsole fill /></section>
      <section v-else-if="st.tab === 'usage'" class="pane"><DevUsage /></section>
      <section v-else-if="st.tab === 'visits'" class="pane"><DevVisits /></section>
      <section v-else-if="st.tab === 'activity'" class="pane"><DevActivity /></section>
      <section v-else-if="st.tab === 'ai'" class="pane"><DevAi /></section>
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
/* цвета — как у панели «Графики» в уроке: светлая — как приложение, тёмная — свои оттенки */
.dvt { position: fixed; z-index: 9995; display: flex; flex-direction: column; box-sizing: border-box; color: var(--g-tx); background: var(--g-page); font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --g-page: var(--card); --g-bg: var(--card); --g-tx: var(--text); --g-mu: var(--hint); --g-bd: var(--border); --g-bar: var(--surface); --g-hov: var(--border); --g-acc: #1a73e8 }
.dvt.dark { --g-page: #17191c; --g-bg: #1e2023; --g-tx: #e8eaed; --g-mu: #9aa0a6; --g-bd: #33373d; --g-bar: #202225; --g-hov: #2a2d31; --g-acc: #8ab4f8; color-scheme: dark;
  --card: #1e2023; --surface: #26292d; --border: #33373d; --text: #e8eaed; --hint: #9aa0a6 }
.dvt.r { top: 0; right: 0; bottom: 0; padding-left: 10px } .dvt.b { left: 0; right: 0; bottom: 0; padding-top: 10px }
/* перегородка — как между уроком и «Графиками»: серая полоса 10px с «ручкой» посередине */
.grip { position: absolute; z-index: 3; background: var(--border); touch-action: none } .grip::after { content: ''; position: absolute; border-radius: 2px; background: #b5bac1 }
.grip:hover, .grip.on { background: #d6ecfb } .dark .grip { background: #2a2d31 } .dark .grip:hover, .dark .grip.on { background: #263447 }
.r .grip { left: 0; top: 0; bottom: 0; width: 10px; cursor: col-resize } .r .grip::after { left: 3.5px; top: 50%; width: 3px; height: 40px; margin-top: -20px }
.b .grip { top: 0; left: 0; right: 0; height: 10px; cursor: row-resize } .b .grip::after { top: 3.5px; left: 50%; height: 3px; width: 40px; margin-left: -20px }
.szt { position: fixed; top: 8px; z-index: 9996; padding: 3px 8px; border-radius: 6px; background: rgba(32, 33, 36, .88); color: #fff; font: 700 12px system-ui, sans-serif; font-variant-numeric: tabular-nums; pointer-events: none }
.b ~ .szt, .szt[style*='bottom'] { top: auto; left: 50%; translate: -50% 0 }
.shield { position: fixed; inset: 0; z-index: 2; cursor: inherit }
.dvt:has(.grip.on) .shield { cursor: col-resize } .dvt.b:has(.grip.on) .shield { cursor: row-resize }          /* пока тянут — мышь не уходит в приложение */
/* вкладки — как у «Графиков»: плоская полоса, активная подчёркнута; первым — выключатель «Тёмная» (как в iPhone) */
.tabs { display: flex; align-items: stretch; flex: none; padding: 0 4px 0 8px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--g-bd); background: var(--g-bar) }
.tab { position: relative; flex: none; margin-bottom: -1px; padding: 8px 11px 7px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--g-mu); font: inherit; font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer }
.tab:hover { background: var(--g-hov); color: var(--g-tx) } .tab.on { color: var(--g-acc); border-bottom-color: var(--g-acc) }
.gth { flex: none; display: inline-flex; align-items: center; gap: 7px; margin-right: 10px; padding-right: 10px; border-right: 1px solid var(--g-bd); font-size: 12px; font-weight: 600; color: var(--g-mu); cursor: pointer; user-select: none }
.gth input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none }
.gth i { position: relative; width: 30px; height: 18px; border-radius: 9px; background: var(--g-hov); transition: background .2s } .gth i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .3); transition: transform .2s }
.gth input:checked + i { background: #34c759 } .gth input:checked + i::after { transform: translateX(12px) }
.sp { flex: 1 }
.ib { min-width: 26px; height: 26px; align-self: center; padding: 0 5px; border: 0; border-radius: 4px; background: none; color: var(--hint); font: inherit; font-size: 13px; cursor: pointer } .ib:hover { background: var(--surface); color: var(--text) }
/* остальные вкладки */
.pane { flex: 1; min-height: 0; overflow: auto; padding: 12px } .pane.fill { display: flex; flex-direction: column; overflow: hidden }
</style>

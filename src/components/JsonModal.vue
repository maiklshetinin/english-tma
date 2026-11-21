<script setup>
// Окно правки JSON — большое, «как в VS Code» (21.11.2026): вместо маленького поля в карточке.
// Номера строк, подсветка, проверка на лету (строка с ошибкой — красным, клик по ошибке — к строке), «Форматировать» (Shift+Alt+F),
// перенос строк вкл/выкл (Alt+Z), справа — «Как собирается» (что уйдёт в чат и в модели) — обновляется, пока печатаете.
// Ctrl+Enter / Ctrl+S — применить, Esc — закрыть (если меняли — спросит). В <body> через Teleport: холст с масштабом не мешает.
// how — { parts: [{ to, text }], warn: [], own?: [] } или null (нет панели); note — строка над сборкой; error — ошибка от родителя.
import { computed, nextTick, onMounted, ref } from 'vue'
import JsonEdit from './JsonEdit.vue'
import { jsonTheme, flipJsonTheme } from '../utils/jsonTheme.js'

const props = defineProps({
  modelValue: { type: String, default: '' }, title: { type: String, default: 'JSON' }, sub: { type: String, default: '' },
  how: { type: Object, default: null }, note: { type: String, default: '' }, error: { type: String, default: '' },
  applyText: { type: String, default: 'Применить' }, hint: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'apply', 'close'])
const ed = ref(null), start = props.modelValue
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1' } catch { return d } }
const keep = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* приватный режим */ } }
const wrap = ref(read('tma.jsonWrap', true)), howOn = ref(read('tma.jsonHow', false))
const pos = ref({ line: 1, col: 1 })
const text = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })

// Проверка на лету: где ошибка — строка и столбец (Chrome: «position N (line L column C)», Firefox: «at line L column C»)
const parsed = computed(() => {
  try { JSON.parse(text.value); return { ok: true } } catch (e) {
    const m = String(e.message), lc = m.match(/line (\d+) column (\d+)/)
    let line = lc ? +lc[1] : 0, col = lc ? +lc[2] : 0
    const p = m.match(/position (\d+)/)
    if (!line && p) { const b = text.value.slice(0, +p[1]); line = b.split('\n').length; col = +p[1] - b.lastIndexOf('\n') }
    if (!line && /end of (JSON )?(data|input)/i.test(m)) line = text.value.split('\n').length
    return { ok: false, line, col, msg: m.replace(/^JSON\.parse: /, '').replace(/ in JSON at position \d+.*$/, '') }
  }
})
// понятные причины по-русски (текст ошибки браузера — запасной)
const RU = [[/after property value/, 'после значения нужна запятая или }'], [/after array element/, 'после элемента нужна запятая или ]'],
  [/double-quoted property name/, 'ключ — в двойных кавычках (или лишняя запятая перед })'], [/property name or '\}'/, 'ожидался ключ в кавычках или }'],
  [/end of (JSON )?(data|input)/i, 'JSON обрывается — не хватает } или ]'], [/control character/i, 'внутри строки перенос строки — пишите \\n'],
  [/[Uu]nterminated string/, 'строка не закрыта кавычкой'], [/after JSON/, 'лишний текст после JSON'], [/[Uu]nexpected token|unexpected character/, 'лишний или неверный символ']]
const ruMsg = (m) => RU.find(([r]) => r.test(m))?.[1] ?? m
const dirty = computed(() => text.value !== start)

function fmt() { if (!parsed.value.ok) { if (parsed.value.line) ed.value?.goLine(parsed.value.line); return } text.value = JSON.stringify(JSON.parse(text.value), null, 2) }
function flipWrap() { wrap.value = !wrap.value; keep('tma.jsonWrap', wrap.value) }
function flipHow() { howOn.value = !howOn.value; keep('tma.jsonHow', howOn.value) }
function close() { if (dirty.value && !window.confirm('Закрыть без сохранения? Изменения в JSON пропадут.')) return; emit('close') }
function key(e) {
  const k = e.key.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && (k === 'enter' || k === 's')) { e.preventDefault(); emit('apply') }
  else if (e.shiftKey && e.altKey && (k === 'f' || e.code === 'KeyF')) { e.preventDefault(); fmt() }
  else if (e.altKey && !e.shiftKey && (k === 'z' || e.code === 'KeyZ')) { e.preventDefault(); flipWrap() }
  else if (k === 'escape') { e.preventDefault(); close() }
}
onMounted(() => nextTick(() => ed.value?.focus()))
</script>

<template>
  <Teleport to="body">
    <div class="jm-bg" @pointerdown.self="close" @keydown.stop="key" @keyup.stop @paste.stop @copy.stop @cut.stop @wheel.stop>
      <div class="jm" :class="jsonTheme" role="dialog" aria-modal="true" :aria-label="title">
        <header>
          <div class="jm-t"><b>{{ title }}</b><small v-if="sub">{{ sub }}</small></div>
          <span class="sp" />
          <button class="jb ic" :title="jsonTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'" @click="flipJsonTheme">
            <svg v-if="jsonTheme === 'dark'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
          </button>
          <button class="jb ic x" title="Закрыть (Esc)" @click="close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </header>
        <div class="jm-bar">
          <button class="jb" title="Расставить отступы (Shift+Alt+F)" @click="fmt">Форматировать</button>
          <button class="jb" :class="{ on: wrap }" title="Переносить длинные строки (Alt+Z)" @click="flipWrap">Перенос строк</button>
          <button v-if="how" class="jb" :class="{ on: howOn }" title="Что из этого JSON уйдёт в чат и в модели — обновляется, пока печатаете" @click="flipHow">Как собирается</button>
          <slot name="actions" />
        </div>
        <div class="jm-body" :class="{ split: how && howOn }">
          <JsonEdit ref="ed" v-model="text" box="jm-ed" :theme="jsonTheme" :wrap="wrap" :bad="parsed.ok ? 0 : parsed.line" aria-label="JSON" @caret="pos = $event" />
          <aside v-if="how && howOn" class="jm-how">
            <p v-for="w in how.warn" :key="w" class="w">⚠ {{ w }}</p>
            <p v-if="note" class="n">{{ note }}</p>
            <section v-for="pt in how.parts" :key="pt.to"><b>{{ pt.to }}</b><pre>{{ pt.text || '‹пусто›' }}</pre></section>
          </aside>
        </div>
        <footer>
          <button v-if="!parsed.ok" class="st bad" title="Перейти к строке с ошибкой" @click="parsed.line && ed?.goLine(parsed.line)">✕ {{ parsed.line ? 'Строка ' + parsed.line + (parsed.col ? ', столбец ' + parsed.col : '') + ': ' : '' }}{{ ruMsg(parsed.msg) }}</button>
          <span v-else class="st ok">✓ JSON в порядке</span>
          <small v-if="error" class="err">{{ error }}</small>
          <span class="sp" />
          <small class="pos">Стр {{ pos.line }}, стлб {{ pos.col }}</small>
        </footer>
        <div class="jm-end">
          <small>{{ hint || 'Ctrl+Enter или Ctrl+S — применить · Esc — закрыть · Tab — отступ · Shift+Alt+F — форматировать' }}</small>
          <span class="sp" />
          <button class="jb" @click="close">Отмена</button>
          <button class="jb ap" :disabled="!parsed.ok" @click="emit('apply')">{{ applyText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.jm-bg { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; padding: 20px; background: rgba(15, 18, 24, .45); backdrop-filter: blur(2px) }
.jm { width: min(1320px, 100%); height: min(920px, calc(100vh - 40px)); display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; border-radius: 18px; background: #fff; color: #222; box-shadow: 0 24px 80px rgba(0, 0, 0, .35); font-family: inherit; text-align: left }
.jm.dark { background: #252526; color: #ddd }
header { display: flex; align-items: center; gap: 8px } .jm-t { display: grid; gap: 2px; min-width: 0 }
.jm-t b { font-size: 17px; font-weight: 900 } .jm-t small { font-size: 12.5px; color: #8a8f98; font-weight: 600 }
.sp { flex: 1 }
.jm-bar, footer, .jm-end { display: flex; align-items: center; gap: 6px; flex-wrap: wrap }
.jb { flex: none; width: auto; height: auto; border: 0; border-radius: 10px; padding: 7px 12px; background: #f0f1f3; color: #4b4b4b; font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer; white-space: nowrap }
.jb:hover { background: #e6e8eb } .jb.on, .jb.ap { background: #1cb0f6; color: #fff } .jb.ap:hover { background: #0ea0e6 } .jb:disabled { opacity: .45; cursor: default }
.jm.dark .jb { background: #3a3d41; color: #ddd } .jm.dark .jb:hover { background: #45494e } .jm.dark .jb.on, .jm.dark .jb.ap { background: #0e639c; color: #fff }
.jb.ic { display: grid; place-items: center; width: 34px; height: 34px; padding: 0 } .jb.ic svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round }
.jm-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; gap: 10px }
.jm-body.split { grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr) }
.jm-body :deep(.jm-ed) { min-height: 0; height: 100% }
.jm-how { min-height: 0; overflow: auto; display: grid; align-content: start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: #f7f8fa; font-size: 12px }
.jm.dark .jm-how { background: #1e1e1e }
.jm-how section { display: grid; gap: 3px } .jm-how b { font-size: 11.5px; font-weight: 900; color: #777 }
.jm-how pre { margin: 0; padding: 7px 9px; border-radius: 8px; background: #fff; border: 1px solid #eceef1; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; color: inherit }
.jm.dark .jm-how pre { background: #2a2a2a; border-color: #333 }
.jm-how .w { margin: 0; padding: 5px 8px; border-radius: 8px; background: #fff4dc; color: #b45309; font-weight: 800 }
.jm-how .n { margin: 0; color: #8a8f98; font-weight: 600 }
footer { font-size: 12px; min-height: 22px }
.st { border: 0; background: none; padding: 0; font: inherit; font-weight: 800; text-align: left } .st.ok { color: #3b8a11 } .st.bad { color: #d92d20; cursor: pointer } .st.bad:hover { text-decoration: underline }
.err { color: #d92d20; font-weight: 800 } .pos { color: #8a8f98; font-variant-numeric: tabular-nums }
.jm-end small { font-size: 12px; color: #8a8f98; font-weight: 600 }
@media (max-width: 720px) {
  .jm-bg { padding: 0 } .jm { height: 100%; border-radius: 0; padding: 12px }
  .jm-body.split { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1.3fr) minmax(0, 1fr) }
  .jm-end small, .pos { display: none }
}
</style>

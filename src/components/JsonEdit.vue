<script setup>
// Поле правки JSON с подсветкой (21.11.2026): прозрачный textarea поверх подсвеченного <pre> — тот же шрифт, отступы и прокрутка.
// Пишем в textarea как обычно (курсор, выделение, Ctrl+Z — родные), а цвета рисует <pre> под ним. Подсветка: ключи, строки,
// числа, true / false / null; плейсхолдеры {question}, {answer}… внутри строк — отдельным цветом.
// Как в VS Code: номера строк (у переносов — номер только у первой части), строка с ошибкой — красным (bad),
// Tab / Shift+Tab — отступ, Enter — с отступом прошлой строки (после { или [ — на шаг глубже).
// wrap — переносить длинные строки (Alt+Z в окне); без переноса — прокрутка вбок.
// Все атрибуты и события (@keydown, aria-label…) уходят на textarea. theme: light | dark
import { computed, ref } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: String, default: '' }, theme: { type: String, default: 'light' }, box: { type: String, default: '' },          // box — класс самой рамки (размеры задаёт родитель)
  wrap: { type: Boolean, default: true }, bad: { type: Number, default: 0 },          // bad — номер строки с ошибкой (0 — нет)
})
const emit = defineEmits(['update:modelValue', 'caret'])
const pre = ref(null), ta = ref(null)
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ph = (t) => t.replace(/\{(question|reference|answer|score|missed|id|lang|context|transcript)\}/g, '<span class="jp">{$1}</span>')
// строка в JSON не бывает многострочной — [^"\\\n]: незакрытая кавычка не красит весь остальной текст
const paint = (t) => esc(t).replace(/("(?:\\.|[^"\\\n])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g,
  (m, str, colon, num, lit) => (str ? (colon ? `<span class="jk">${str}</span>${colon}` : `<span class="js">${ph(str)}</span>`) : num ? `<span class="jn">${num}</span>` : `<span class="jl">${lit}</span>`))
const html = computed(() => props.modelValue.split('\n').map((l, i) => `<span class="ln${i + 1 === props.bad ? ' bad' : ''}" data-n="${i + 1}">${paint(l) || ' '}</span>`).join(''))
const gut = computed(() => String(props.modelValue.split('\n').length).length * 8 + 26 + 'px')          // ширина колонки номеров — по числу цифр
function sync(e) { if (pre.value) { pre.value.scrollTop = e.target.scrollTop; pre.value.scrollLeft = e.target.scrollLeft } }

// Вставка через execCommand — так остаётся родной Ctrl+Z; где не умеет — setRangeText
function put(el, text, a = el.selectionStart, b = el.selectionEnd) {
  el.setSelectionRange(a, b)
  let ok = false
  try { ok = document.execCommand('insertText', false, text) } catch { ok = false }
  if (!ok) { el.setRangeText(text, a, b, 'end'); emit('update:modelValue', el.value) }
}
function key(e) {
  if (e.target.readOnly) return
  const el = e.target, v = el.value, s = el.selectionStart, en = el.selectionEnd
  if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault()
    const ls = v.lastIndexOf('\n', s - 1) + 1
    if (s === en && !e.shiftKey) { put(el, '  '); return }
    // несколько строк (или Shift+Tab) — сдвинуть все выделенные строки
    const le = en > s && v[en - 1] === '\n' ? en - 1 : (v.indexOf('\n', en) < 0 ? v.length : v.indexOf('\n', en)), block = v.slice(ls, le), lines = block.split('\n')
    const out = lines.map(l => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n')
    if (out === block) return
    put(el, out, ls, le)
    el.setSelectionRange(ls, ls + out.length)
    return
  }
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !e.isComposing) {
    e.preventDefault()
    const ls = v.lastIndexOf('\n', s - 1) + 1, ind = v.slice(ls, s).match(/^ */)[0]
    const prev = v.slice(ls, s).trimEnd().slice(-1), open = prev === '{' || prev === '['
    if (open && /^[ \t]*[}\]]/.test(v.slice(en))) {          // {|} → { ⏎ ··| ⏎ }
      put(el, '\n' + ind + '  ' + '\n' + ind); const at = s + ind.length + 3; el.setSelectionRange(at, at); return
    }
    put(el, '\n' + ind + (open ? '  ' : ''))
  }
}
function caret(e) { const el = e.target, b = el.value.slice(0, el.selectionStart); emit('caret', { line: b.split('\n').length, col: el.selectionStart - b.lastIndexOf('\n') }) }
function focus() { ta.value?.focus() }
function goLine(n) {
  const el = ta.value; if (!el) return
  const ls = el.value.split('\n'), at = ls.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0)
  el.focus(); el.setSelectionRange(at, at + (ls[n - 1]?.length ?? 0))
  const row = pre.value?.children[n - 1]; if (row) el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight / 3)
}
defineExpose({ focus, goLine })
</script>

<template>
  <div class="jx" :class="[theme, box, { nowrap: !wrap }]" :style="{ '--gut': gut }">
    <pre ref="pre" aria-hidden="true" v-html="html" />
    <textarea ref="ta" v-bind="$attrs" :value="modelValue" spellcheck="false" autocapitalize="off" autocomplete="off" :wrap="wrap ? 'soft' : 'off'" @input="emit('update:modelValue', $event.target.value); caret($event)" @scroll="sync" @keydown="key" @keyup="caret" @click="caret" />
  </div>
</template>

<style scoped>
/* колонка номеров — фоном рамки (полоса слева), сами номера — ::before у строк подсветки, в левом отступе */
.jx { position: relative; display: grid; min-height: 0; border: 1px solid #d6dbe1; border-radius: 12px; background: linear-gradient(90deg, #f4f5f7 var(--gut), #fff var(--gut)); overflow: hidden }
.jx.dark { background: #1e1e1e; border-color: #333 }
.jx pre, .jx textarea { grid-area: 1 / 1; margin: 0; padding: 12px 14px 12px calc(var(--gut) + 12px); box-sizing: border-box; width: 100%; height: 100%; border: 0; font: 13px/1.6 ui-monospace, SFMono-Regular, Consolas, 'Cascadia Code', monospace; letter-spacing: 0; tab-size: 2; white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal; overflow: auto; scrollbar-gutter: stable }          /* gutter — одинаковая ширина строк у текста и подсветки */
.jx.nowrap pre, .jx.nowrap textarea { white-space: pre; overflow-wrap: normal }
.jx pre { pointer-events: none; color: #3c3c3c; background: none; overflow: hidden }
.jx textarea { resize: none; background: transparent; color: transparent; caret-color: #111; outline: none }
.jx.dark pre { color: #d4d4d4 } .jx.dark textarea { caret-color: #aeafad }
.jx textarea::selection { background: rgba(28, 176, 246, .28); color: transparent }
.jx.dark textarea::selection { background: rgba(38, 79, 120, .85) }
.jx:focus-within { border-color: #8cc8ff; box-shadow: 0 0 0 3px rgba(28, 176, 246, .14) }
.jx.dark:focus-within { border-color: #3a6ea5; box-shadow: none }
.jx :deep(.ln) { display: block; position: relative }
.jx :deep(.ln)::before { content: attr(data-n); position: absolute; left: calc(-1 * var(--gut) - 12px); width: calc(var(--gut) - 8px); text-align: right; color: #a3a8b0; font-size: 12px }
.jx.dark :deep(.ln)::before { color: #6e7681 }
.jx :deep(.ln.bad) { background: rgba(217, 45, 32, .1); text-decoration: underline wavy rgba(217, 45, 32, .55); text-underline-offset: 3px }
.jx :deep(.ln.bad)::before { color: #d92d20; font-weight: 800 }
.jx :deep(.jk) { color: #185fa5 } .jx :deep(.js) { color: #3b6d11 } .jx :deep(.jn) { color: #ba7517 } .jx :deep(.jl) { color: #9747ff }
.jx :deep(.jp) { color: #c2410c; font-weight: 700 }
.jx.vs { background: linear-gradient(90deg, #f3ecd8 var(--gut), #fdf6e3 var(--gut)); border-color: #e6dfc8 } .jx.vs pre { color: #657b83 } .jx.vs textarea { caret-color: #073642 }          /* «Как VS Code» — Solarized Light (26.11.2026) */
.jx.vs textarea::selection { background: rgba(147, 161, 161, .3) } .jx.vs :deep(.ln)::before { color: #b8b0a0 } .jx.vs:focus-within { border-color: #93c5fd }
.jx.vs :deep(.jk) { color: #268bd2 } .jx.vs :deep(.js) { color: #2aa198 } .jx.vs :deep(.jn) { color: #d33682 } .jx.vs :deep(.jl) { color: #cb4b16 } .jx.vs :deep(.jp) { color: #b58900 }
.jx.dark :deep(.jk) { color: #9cdcfe } .jx.dark :deep(.js) { color: #ce9178 } .jx.dark :deep(.jn) { color: #b5cea8 } .jx.dark :deep(.jl) { color: #569cd6 } .jx.dark :deep(.jp) { color: #ffcb6b }
</style>

<script setup>
// Текст с жирным (правило «Подсказки»): в данных — **жирный**, на экране — жирным.
// В правке — то же место и шрифт, правится прямо в тексте; выделили слово — сверху «B» (жирный) и «убрать».
// Пока в поле курсор, его не перерисовываем — иначе курсор прыгает.
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { usePlay, useEdit } from '../ctx'
const props = defineProps({ modelValue: { type: String, default: '' }, tag: { type: String, default: 'p' }, ph: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
const p = usePlay(), ed = useEdit()
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const parts = (t) => (t ?? '').split(/\*\*(.+?)\*\*/g).map((x, i) => ({ x, b: i % 2 === 1 })).filter(q => q.x)
const toHtml = (t) => esc(t ?? '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
function toMd(el) {
  let out = ''
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) out += c.nodeValue
    else if (c.nodeName === 'BR') out += '\n'
    else if (c.nodeName === 'B' || c.nodeName === 'STRONG' || (c.style && +c.style.fontWeight >= 600)) { const was = out; out = ''; walk(c); const inner = out; out = was + (inner.trim() ? '**' + inner + '**' : inner) }
    else { if ((c.nodeName === 'DIV' || c.nodeName === 'P') && out && !out.endsWith('\n')) out += '\n'; walk(c) }
  })
  walk(el)
  return out.replace(/\*\*\*\*/g, '').replace(/ /g, ' ')
}
const el = ref(null), bar = ref(false)
function paint() { const e = el.value; if (e && document.activeElement !== e && e.dataset.v !== (props.modelValue ?? '')) { e.innerHTML = toHtml(props.modelValue); e.dataset.v = props.modelValue ?? '' } }
watch(() => [props.modelValue, el.value], paint, { flush: 'post' })
function input(e) { const v = toMd(e.target); e.target.dataset.v = v; emit('update:modelValue', v); ed.changed() }
function paste(e) { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')) }
const cmd = (c) => document.execCommand(c)
function onSel() { const sel = getSelection(), n = sel?.anchorNode, at = n?.nodeType === 3 ? n.parentElement : n; bar.value = !!el.value && !!at && el.value.contains(at) && !sel.isCollapsed }
onMounted(() => document.addEventListener('selectionchange', onSel))
onUnmounted(() => document.removeEventListener('selectionchange', onSel))
</script>

<template>
  <component :is="tag" v-if="!p.edit"><template v-for="(x, k) in parts(modelValue)" :key="k"><b v-if="x.b">{{ x.x }}</b><template v-else>{{ x.x }}</template></template></component>
  <div v-else class="rw">
    <component :is="tag" ref="el" class="exf rt" contenteditable="true" spellcheck="false" :data-ph="ph" @input="input" @paste="paste" @pointerdown.stop />
    <div v-if="bar" class="bb"><button type="button" title="Жирный (Ctrl+B)" @mousedown.prevent="cmd('bold')"><b>B</b></button><button type="button" title="Убрать оформление" @mousedown.prevent="cmd('removeFormat')">убрать</button></div>
  </div>
</template>

<style scoped>
.rw { position: relative }
.rt { min-height: 1.5em; white-space: pre-wrap; cursor: text; user-select: text; -webkit-user-select: text }
.rt :deep(b), .rt :deep(strong) { font-weight: 800 }
.rt:empty::before { content: attr(data-ph); color: var(--hint-2) }
.bb { position: absolute; right: 0; top: -30px; z-index: 5; display: flex; gap: 2px; padding: 3px; border-radius: 8px; background: #2c2c2a; box-shadow: 0 2px 8px rgba(0, 0, 0, .2) }
.bb button { border: 0; border-radius: 5px; padding: 3px 9px; background: none; color: #fff; font: inherit; font-size: 12px; cursor: pointer } .bb button:hover { background: #444 }
</style>

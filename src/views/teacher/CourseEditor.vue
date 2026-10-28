<script setup>
// ЧЕРНОВИК. Редактор курсов — холст как в Figma на Vue Flow (https://vueflow.dev): поле в точку, масштаб,
// выделение рамкой, перетаскивание нескольких сразу, связи тянутся от кружка на узле. Внизу — инструменты.
// Элементы — как путь в Duolingo: баннер юнита, круглые уроки (урок / слова / тест / награда), занятие с репетитором,
// плюс стикер и текст для заметок. Хранится только в этом браузере (localStorage), с сервером и остальным
// приложением не связан; Vue Flow попадает только в этот экран (маршрут грузится отдельно).
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { VueFlow, Handle, Position, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { NodeResizer } from '@vue-flow/node-resizer'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'

const router = useRouter()
const goBack = () => (history.length > 1 ? router.back() : router.push({ name: 'profile' }))
const KEY = 'tma.courseDraft.v2', OLD_KEY = 'tma.courseDraft.v1'

// Курс: { title, nodes: [{ id, type: 'item', position, data: { kind, title, sub?, color? }, style? }], edges: [{ id, source, target }] }
const box = (w, h) => ({ width: w + 'px', height: h + 'px' })
const mk = (id, kind, x, y, title, extra = {}) => ({ id, type: 'item', position: { x, y }, data: { kind, title, ...extra.data }, ...(extra.style ? { style: extra.style } : {}) })
const edge = (a, b) => ({ id: `e-${a}-${b}`, source: a, target: b })
const seed = () => ({
  title: 'Базовый курс A1',
  nodes: [
    mk('u1', 'unit', -150, -300, 'Юнит 1', { data: { sub: 'Present Simple', color: 'green' }, style: box(300, 74) }),
    mk('n1', 'lesson', -36, -180, 'Глаголы to be'), mk('n2', 'words', 44, -50, 'Слова: семья'), mk('n3', 'lesson', -36, 80, 'Отрицания'),
    mk('n4', 'tutor', -118, 210, 'Разговор с репетитором'), mk('n5', 'test', -36, 340, 'Тест юнита'), mk('n6', 'reward', -36, 470, 'Награда'),
    mk('u2', 'unit', 380, -300, 'Юнит 2', { data: { sub: 'Past Simple', color: 'purple' }, style: box(300, 74) }),
    mk('m1', 'lesson', 494, -180, 'Правильные глаголы'), mk('m2', 'words', 574, -50, 'Слова: путешествия'), mk('m3', 'lesson', 494, 80, 'Неправильные глаголы'),
    mk('s1', 'sticky', -470, -150, 'Добавить аудирование после 2-го урока', { data: { color: 'yellow' }, style: box(190, 130) }),
    mk('t1', 'text', -470, -300, 'Черновик курса'),
  ],
  edges: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n5'], ['n5', 'n6'], ['m1', 'm2'], ['m2', 'm3']].map(([a, b]) => edge(a, b)),
})
// Черновик первой версии (до Vue Flow) — переносим, чтобы ничего не потерялось
const fromV1 = (o) => ({
  title: o.title,
  nodes: o.items.map(i => mk(i.id, i.kind, i.x, i.y, i.title, { data: { sub: i.sub, color: i.color }, style: i.w ? box(i.w, i.h) : undefined })),
  edges: (o.links || []).map(([a, b]) => edge(a, b)),
})
function load() {
  try { const v2 = JSON.parse(localStorage.getItem(KEY)); if (v2?.nodes) return v2 } catch { /* битый — ниже */ }
  try { const v1 = JSON.parse(localStorage.getItem(OLD_KEY)); if (v1?.items) return fromV1(v1) } catch { /* нет */ }
  return seed()
}
const start = load()
const title = ref(start.title)
const nodes = ref(start.nodes), edges = ref(start.edges)

const { screenToFlowCoordinate, addNodes, addEdges, removeNodes, removeEdges, findNode, getSelectedNodes, getSelectedEdges, addSelectedNodes,
  removeSelectedElements, fitView, zoomIn, zoomOut, zoomTo, viewport, onConnect, onNodeClick, onPaneClick, onNodesInitialized, toObject } = useVueFlow('course-editor')

// Сохранение: после каждого изменения, не чаще раза в 300 мс
let t = 0
function save() {
  clearTimeout(t)
  t = setTimeout(() => {
    const o = toObject()
    const data = { title: title.value, nodes: o.nodes.map(({ id, type, position, data, style }) => ({ id, type, position: { x: Math.round(position.x), y: Math.round(position.y) }, data, ...(style && Object.keys(style).length ? { style } : {}) })),
      edges: o.edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle })) }
    try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* приватный режим */ }
  }, 300)
}
onUnmounted(() => clearTimeout(t))

// Инструменты (нижняя панель, как в Figma)
const TOOLS = [
  { id: 'select', t: 'Выбор', k: 'V' }, { id: 'hand', t: 'Рука', k: 'H' }, { sep: true },
  { id: 'unit', t: 'Юнит', k: 'U' }, { id: 'lesson', t: 'Урок', k: 'L' }, { id: 'words', t: 'Слова', k: 'W' }, { id: 'test', t: 'Тест', k: 'T' },
  { id: 'tutor', t: 'С репетитором', k: 'R' }, { id: 'reward', t: 'Награда', k: 'G' }, { sep: true },
  { id: 'link', t: 'Связь', k: 'C' }, { id: 'sticky', t: 'Стикер', k: 'S' }, { id: 'text', t: 'Текст', k: 'X' },
]
const tool = ref('select'), linkFrom = ref(null)
const setTool = (id) => { tool.value = id; linkFrom.value = null }
const KIND = { unit: 'Юнит', lesson: 'Урок', words: 'Слова', test: 'Тест', tutor: 'Занятие с репетитором', reward: 'Награда', sticky: 'Стикер', text: 'Текст' }
const PATH = ['unit', 'lesson', 'words', 'test', 'tutor', 'reward']             // у этих есть кружки для связей
const SIZE = { unit: [300, 74], sticky: [180, 130], tutor: [76, 76], text: [160, 34] }
const sz = (k) => SIZE[k] ?? [72, 72]

// Телефон / планшет: один палец двигает поле (как в Figma на iPad), рамкой — на компьютере
const touch = matchMedia('(pointer: coarse)').matches
const placing = computed(() => !['select', 'hand', 'link'].includes(tool.value))

let seq = Date.now() % 100000
async function add(kind, at) {
  const [w, h] = sz(kind), id = 'i' + (++seq)
  const data = { kind, title: kind === 'unit' ? 'Новый юнит' : kind === 'sticky' ? 'Заметка' : kind === 'text' ? 'Текст' : KIND[kind] }
  if (kind === 'unit') Object.assign(data, { sub: 'Тема юнита', color: 'blue' })
  if (kind === 'sticky') data.color = 'yellow'
  addNodes({ id, type: 'item', position: { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2) }, data, ...(kind === 'unit' || kind === 'sticky' ? { style: box(w, h) } : {}) })
  setTool('select')
  await nextTick(); removeSelectedElements(); const n = findNode(id); if (n) addSelectedNodes([n])
  save()
}
onPaneClick((e) => { if (placing.value) add(tool.value, screenToFlowCoordinate({ x: e.clientX, y: e.clientY })); else linkFrom.value = null })
onNodeClick(({ node, event }) => {
  if (placing.value) return add(tool.value, screenToFlowCoordinate({ x: event.clientX, y: event.clientY }))
  if (tool.value !== 'link') return
  if (!linkFrom.value) { linkFrom.value = node.id; return }
  if (linkFrom.value !== node.id) link(linkFrom.value, node.id)
  setTool('select')
})
function link(a, b, extra = {}) {
  if (edges.value.some(e => e.source === a && e.target === b)) return
  addEdges({ ...extra, id: `e-${a}-${b}-${++seq}`, source: a, target: b }); save()
}
onConnect((c) => link(c.source, c.target, { sourceHandle: c.sourceHandle, targetHandle: c.targetHandle }))
let fitted = false     // «показать всё» при открытии — когда узлы уже измерены
onNodesInitialized(() => { if (!fitted) { fitted = true; fitView({ padding: touch ? 0.3 : 0.4 }) } })

// Выбранное: одно — панель свойств; несколько — счётчик и «Удалить»
const selNodes = computed(() => getSelectedNodes.value)
const selected = computed(() => (selNodes.value.length === 1 ? selNodes.value[0] : null))
const selCount = computed(() => selNodes.value.length + getSelectedEdges.value.length)
function remove() { removeEdges(getSelectedEdges.value); removeNodes(selNodes.value); save() }
const setData = (k, v) => { if (selected.value) { selected.value.data = { ...selected.value.data, [k]: v }; save() } }

// Горячие клавиши инструментов (Delete / Backspace, Shift, пробел — у Vue Flow)
function key(e) {
  if (/INPUT|TEXTAREA/.test(e.target?.tagName) || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'Escape') { removeSelectedElements(); setTool('select'); return }
  const x = TOOLS.find(t => t.k && t.k.toLowerCase() === e.key.toLowerCase()); if (x) setTool(x.id)
}
onMounted(() => addEventListener('keydown', key))
onUnmounted(() => removeEventListener('keydown', key))

function exportJson() {
  save(); const o = toObject()
  const data = { title: title.value, nodes: o.nodes.map(({ id, position, data, style }) => ({ id, position, data, style })), edges: o.edges.map(({ source, target }) => ({ source, target })) }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'course.json'; a.click()
}
async function reset() {
  if (!confirm('Вернуть пример курса? Текущий черновик удалится.')) return
  const s = seed(); title.value = s.title; nodes.value = s.nodes; edges.value = s.edges
  await nextTick(); fitView({ padding: touch ? 0.3 : 0.4 }); save()
}
const zoomPct = computed(() => Math.round(viewport.value.zoom * 100))

// Значки инструментов и узлов (SVG 24×24)
const IC = {
  select: '<path d="M5 3l14 8-6 2-2 6z"/>', hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L8 13"/>',
  unit: '<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M7 12h6"/>', lesson: '<circle cx="12" cy="12" r="8"/><path d="M9 12.5l2 2 4-4"/>',
  words: '<rect x="3" y="6" width="14" height="14" rx="3"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>', test: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  tutor: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3z"/>', reward: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4"/><path d="M12 14v4M8 21h8"/>',
  link: '<path d="M5 19C5 11 19 13 19 5"/><path d="M15 5h4v4"/>', sticky: '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>', text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
}
</script>

<template>
  <div class="ce" :class="[`t-${tool}`, { placing }]">
    <VueFlow id="course-editor" v-model:nodes="nodes" v-model:edges="edges" class="board"
      :min-zoom="0.2" :max-zoom="3" :pan-on-scroll="!touch" :zoom-on-double-click="false"
      :pan-on-drag="tool === 'hand' || touch ? true : [1, 2]" :selection-key-code="tool === 'select' && !touch ? true : null"
      multi-selection-key-code="Shift" :delete-key-code="['Delete', 'Backspace']" :nodes-draggable="tool !== 'hand'" :elements-selectable="tool !== 'hand'"
      connection-mode="loose" :connection-radius="28" :default-edge-options="{ type: 'default' }"
      @nodes-change="save" @edges-change="save">
      <Background variant="dots" :gap="20" :size="1.6" color="#bdbdbd" />
      <template #node-item="{ id, data, selected: on, dimensions }">
        <div class="it" :class="[data.kind, data.color, { on, from: linkFrom === id }]">
          <NodeResizer v-if="data.kind === 'unit' || data.kind === 'sticky'" :is-visible="on" :min-width="data.kind === 'unit' ? 160 : 110" :min-height="data.kind === 'unit' ? 56 : 70" @resize-end="save" />
          <template v-if="data.kind === 'unit'"><b>{{ data.title }}</b><span>{{ data.sub }}</span></template>
          <template v-else-if="data.kind === 'sticky' || data.kind === 'text'">{{ data.title }}</template>
          <template v-else><svg viewBox="0 0 24 24" class="ni" v-html="IC[data.kind]" /><em class="cap">{{ data.title }}</em></template>
          <!-- Выделение как в Figma: рамка, ручки по углам (у юнита и стикера — настоящие, ими меняют размер), подпись -->
          <template v-if="on && data.kind !== 'unit' && data.kind !== 'sticky'"><i class="h tl" /><i class="h tr" /><i class="h bl" /><i class="h br" /></template>
          <span v-if="on && selNodes.length === 1" class="tag">{{ KIND[data.kind] }} · {{ Math.round(dimensions.width) }}×{{ Math.round(dimensions.height) }}</span>
          <template v-if="PATH.includes(data.kind)">
            <Handle id="t" type="target" :position="Position.Top" /><Handle id="b" type="source" :position="Position.Bottom" />
          </template>
        </div>
      </template>
    </VueFlow>

    <!-- Слева сверху: курс -->
    <div class="fl tl-panel">
      <button class="ib" title="Назад" @click="goBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <input v-model="title" class="ttl" aria-label="Название курса" @input="save" />
      <span class="badge-local" title="Хранится только в этом браузере">черновик<span class="wide"> · только в этом браузере</span></span>
    </div>
    <!-- Справа сверху: показать всё, экспорт, сброс -->
    <div class="fl tr-panel">
      <button class="pill" @click="fitView({ padding: touch ? 0.3 : 0.4, duration: 250 })">Показать всё</button>
      <button class="pill" @click="exportJson">Экспорт</button>
      <button class="pill grey" @click="reset">Сброс</button>
    </div>

    <!-- Справа: свойства выбранного -->
    <aside v-if="selected" class="fl props">
      <div class="ph">{{ KIND[selected.data.kind] }}</div>
      <label class="f"><span>Название</span><input :value="selected.data.title" @input="setData('title', $event.target.value)" /></label>
      <label v-if="selected.data.kind === 'unit'" class="f"><span>Тема</span><input :value="selected.data.sub" @input="setData('sub', $event.target.value)" /></label>
      <div v-if="selected.data.kind === 'unit' || selected.data.kind === 'sticky'" class="f"><span>Цвет</span>
        <div class="cols"><button v-for="c in (selected.data.kind === 'unit' ? ['green', 'purple', 'blue', 'orange'] : ['yellow', 'pink', 'blue', 'green'])" :key="c" class="cl" :class="[c, { on: selected.data.color === c }]" @click="setData('color', c)" /></div></div>
      <div class="f xy"><span>X</span><b>{{ Math.round(selected.position.x) }}</b><span>Y</span><b>{{ Math.round(selected.position.y) }}</b></div>
      <button class="del" @click="remove">Удалить</button>
    </aside>
    <div v-else-if="selCount > 1" class="fl props multi"><div class="ph">Выбрано: {{ selCount }}</div><button class="del" @click="remove">Удалить</button></div>

    <!-- Снизу: инструменты (как в Figma) -->
    <div class="fl tools" role="toolbar">
      <template v-for="(x, i) in TOOLS" :key="i">
        <i v-if="x.sep" class="sep" />
        <button v-else class="tb" :class="[x.id, { on: tool === x.id }]" :title="`${x.t} (${x.k})`" @click="setTool(x.id)">
          <svg viewBox="0 0 24 24" v-html="IC[x.id]" /><span class="tip">{{ x.t }} <kbd>{{ x.k }}</kbd></span></button>
      </template>
    </div>
    <!-- Справа снизу: масштаб -->
    <div class="fl zoom"><button @click="zoomOut({ duration: 150 })">−</button><b title="100%" @click="zoomTo(1, { duration: 150 })">{{ zoomPct }}%</b><button @click="zoomIn({ duration: 150 })">+</button></div>
    <div v-if="tool !== 'select' && tool !== 'hand'" class="fl hintbar">{{ tool === 'link' ? (linkFrom ? 'Теперь нажмите на второй элемент' : 'Нажмите на первый элемент, потом на второй') : `Нажмите на поле — появится «${TOOLS.find(x => x.id === tool).t}»` }}</div>
  </div>
</template>

<style scoped>
.ce { position: fixed; inset: 0; z-index: 30; background: #f4f4f4; overflow: hidden; user-select: none; -webkit-user-select: none; font-family: var(--font) }
.board { position: absolute; inset: 0 }
.ce.placing :deep(.vue-flow__pane) { cursor: copy } .ce.t-link :deep(.vue-flow__node) { cursor: crosshair }
.ce.t-hand :deep(.vue-flow__pane), .ce.t-hand :deep(.vue-flow__node) { cursor: grab }

/* Связи — пунктир, как путь в Duolingo; выбранная — синяя; тянущаяся — синий штрих */
.ce :deep(.vue-flow__edge-path) { stroke: #c4c4c4; stroke-width: 4; stroke-dasharray: 2 10; stroke-linecap: round }
.ce :deep(.vue-flow__edge.selected .vue-flow__edge-path), .ce :deep(.vue-flow__edge:hover .vue-flow__edge-path) { stroke: #0d99ff }
.ce :deep(.vue-flow__connection-path) { stroke: #0d99ff; stroke-width: 2; stroke-dasharray: 6 6 }
/* Рамка выделения и общий прямоугольник выбранных — как в Figma */
.ce :deep(.vue-flow__selection) { background: rgba(13, 153, 255, .08); border: 1px solid #0d99ff }
.ce :deep(.vue-flow__nodesselection-rect) { background: rgba(13, 153, 255, .04); border: 1px solid #0d99ff; cursor: move }
/* Кружки для связей: видны при наведении на узел и пока тянем связь */
.ce :deep(.vue-flow__handle) { width: 12px; height: 12px; background: #fff; border: 2px solid #0d99ff; opacity: 0; transition: opacity .1s }
.ce :deep(.vue-flow__node:hover .vue-flow__handle), .ce :deep(.vue-flow__node.selected .vue-flow__handle), .ce :deep(.vue-flow.connecting .vue-flow__handle) { opacity: 1 }
.ce :deep(.vue-flow__handle-top) { top: -14px } .ce :deep(.vue-flow__handle-bottom) { bottom: -14px }
@media (pointer: coarse) { .ce :deep(.vue-flow__handle) { width: 18px; height: 18px } }
/* Ручки изменения размера (юнит, стикер) — квадратики Figma */
.ce :deep(.vue-flow__resize-control.handle) { width: 9px; height: 9px; background: #fff; border: 2px solid #0d99ff; border-radius: 2px }
.ce :deep(.vue-flow__resize-control.line) { border-color: transparent }

/* Элементы */
.it { position: relative; display: grid; place-items: center; box-sizing: border-box; width: 100%; height: 100% }
.it.on { outline: 2px solid #0d99ff; outline-offset: 4px } .it.from { outline: 2px dashed var(--blue); outline-offset: 4px }
.ce :deep(.vue-flow__node:hover) .it:not(.on) { outline: 2px solid #0d99ff80; outline-offset: 4px }
.h { position: absolute; width: 9px; height: 9px; background: #fff; border: 2px solid #0d99ff; border-radius: 2px; z-index: 3; box-sizing: border-box }
.h.tl { left: -10px; top: -10px } .h.tr { right: -10px; top: -10px } .h.bl { left: -10px; bottom: -10px } .h.br { right: -10px; bottom: -10px }
.tag { position: absolute; left: 50%; bottom: -36px; transform: translateX(-50%); padding: 2px 7px; border-radius: 5px; background: #0d99ff; color: #fff; font-size: 11px; font-weight: 700; white-space: nowrap; pointer-events: none }
.it.lesson .tag, .it.words .tag, .it.test .tag, .it.reward .tag, .it.tutor .tag { bottom: -40px }
/* Юнит — баннер как в Duolingo */
.it.unit { place-items: start; align-content: center; padding: 0 18px; border-radius: 16px; color: #fff; background: var(--c); box-shadow: 0 5px 0 var(--cd) }
.it.unit b { font-size: 19px; line-height: 1.2 } .it.unit span { font-size: 14px; opacity: .85 }
.green { --c: var(--green); --cd: var(--green-d) } .purple { --c: var(--purple); --cd: var(--purple-d) } .blue { --c: var(--blue); --cd: var(--blue-d) } .orange { --c: var(--orange); --cd: var(--orange-d) }
/* Узлы — круглые кнопки как в Duolingo */
.it.lesson, .it.words, .it.test, .it.reward { width: 72px; height: 72px; border-radius: 50%; color: #fff; background: var(--c); box-shadow: 0 7px 0 var(--cd) }
.it.lesson { --c: var(--green); --cd: var(--green-d) } .it.words { --c: var(--blue); --cd: var(--blue-d) } .it.test { --c: var(--orange); --cd: var(--orange-d) } .it.reward { --c: var(--yellow); --cd: var(--yellow-d) }
.it.tutor { width: 76px; height: 76px; border-radius: 24px; color: #fff; background: var(--purple); box-shadow: 0 7px 0 var(--purple-d) }
.ni { width: 34px; height: 34px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
.cap { position: absolute; top: calc(100% + 12px); left: 50%; transform: translateX(-50%); font-style: normal; font-size: 13px; font-weight: 800; color: var(--text); white-space: nowrap; pointer-events: none }
.it.on .cap { display: none }
/* Стикер и текст */
.it.sticky { place-items: start; padding: 14px; font-size: 14px; font-weight: 700; line-height: 1.3; color: #3c3c3c; background: #fff3b0; box-shadow: 0 6px 14px rgba(0, 0, 0, .12); border-radius: 4px; overflow: visible }
.it.sticky.pink { background: #ffd6e7 } .it.sticky.blue { background: #cfe9ff } .it.sticky.green { background: #d7f7c2 }
.it.text { place-items: center start; height: 34px; padding: 0 2px; font-size: 24px; font-weight: 900; color: var(--text); white-space: nowrap }
.props.multi { width: auto }

/* Плавающие панели */
.fl { position: absolute; z-index: 5; background: #fff; border-radius: 14px; box-shadow: 0 2px 10px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .05) }
.tl-panel { left: 14px; top: 14px; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px }
.ttl { width: 220px; margin: 0; padding: 6px 8px; border: 0; background: none; font-size: 15px; font-weight: 800 } .ttl:focus { background: var(--surface) }
.badge-local { font-size: 11px; font-weight: 700; color: var(--purple-d); background: #f1e6ff; border-radius: 6px; padding: 2px 7px; white-space: nowrap }
.ib { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 10px; background: none; cursor: pointer } .ib:hover { background: var(--surface) }
.ib svg { width: 20px; height: 20px; fill: none; stroke: var(--text); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
.tr-panel { right: 14px; top: 14px; display: flex; gap: 4px; padding: 6px }
.pill { border: 0; border-radius: 9px; padding: 7px 12px; background: var(--blue); color: #fff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer } .pill.grey { background: var(--surface); color: var(--hint) }
.pill:first-child { background: var(--surface); color: var(--text) }
/* Нижняя панель инструментов */
.tools { left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; padding: 6px }
.tb { position: relative; display: grid; place-items: center; width: 42px; height: 42px; border: 0; border-radius: 10px; background: none; color: var(--text); cursor: pointer }
.tb svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.tb:hover { background: var(--surface) } .tb.on { background: #0d99ff; color: #fff }
.tb.lesson:not(.on) { color: var(--green-d) } .tb.words:not(.on) { color: var(--blue) } .tb.test:not(.on) { color: var(--orange-d) } .tb.tutor:not(.on) { color: var(--purple) } .tb.reward:not(.on) { color: var(--yellow-d) }
.tip { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); padding: 4px 8px; border-radius: 6px; background: #1e1e1e; color: #fff; font-size: 12px; font-weight: 700; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .1s }
.tip kbd { margin-left: 4px; color: #aaa; font: inherit } .tb:hover .tip { opacity: 1 }
.sep { width: 1px; height: 26px; margin: 0 6px; background: var(--border) }
.zoom { right: 14px; bottom: 18px; display: flex; align-items: center; padding: 4px } .zoom button { width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 18px; cursor: pointer } .zoom button:hover { background: var(--surface) }
.zoom b { min-width: 48px; text-align: center; font-size: 13px; cursor: pointer }
.hintbar { left: 50%; bottom: 82px; transform: translateX(-50%); padding: 7px 14px; background: #1e1e1e; color: #fff; font-size: 13px; font-weight: 700; border-radius: 10px }
/* Свойства */
.props { right: 14px; top: 64px; width: 230px; display: grid; gap: 10px; padding: 12px }
.ph { font-size: 12px; font-weight: 900; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.f { display: grid; gap: 4px } .f > span { font-size: 11px; font-weight: 800; color: var(--hint) } .f input { margin: 0; padding: 7px 9px; font-size: 14px; border-width: 1px; border-radius: 8px }
.cols { display: flex; gap: 6px } .cl { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; background: var(--c) } .cl.on { border-color: #0d99ff; box-shadow: 0 0 0 2px #fff inset }
.cl.yellow { background: #ffe97a } .cl.pink { background: #ffb3d1 } .props .cl.blue { --c: var(--blue) }
.xy { grid-template-columns: auto 1fr auto 1fr; align-items: center; gap: 6px } .xy b { font-size: 13px }
.del { border: 0; border-radius: 9px; padding: 8px; background: var(--red-l); color: var(--red-d); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
/* Телефон: шапка в две строки, инструменты — над масштабом, без наложений */
@media (max-width: 719px) {
  .tl-panel { left: 8px; right: 8px; top: 8px; padding: 4px 8px 4px 4px } .ttl { flex: 1; width: auto; min-width: 0 }
  .wide { display: none }
  .tr-panel { left: 8px; right: auto; top: 58px; padding: 4px } .pill { padding: 6px 10px; font-size: 12px }
  .tools { left: 8px; right: 8px; bottom: 62px; transform: none; justify-content: space-between; gap: 0; padding: 4px; overflow-x: auto; scrollbar-width: none }
  .tb { flex: none; width: 36px; height: 36px } .tb svg { width: 20px; height: 20px } .sep { margin: 0 2px } .tip { display: none }
  .zoom { right: 8px; bottom: 12px } .hintbar { bottom: 116px; max-width: calc(100% - 32px); text-align: center }
  .props { left: 8px; right: 8px; top: auto; bottom: 116px; width: auto; gap: 8px; padding: 10px } .props .xy { display: none }
}
</style>

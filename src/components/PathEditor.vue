<script setup>
// Конструктор пути (для ученика и для пресета): «Просмотр / Правка», юниты и кружки добавляются, переименовываются, переставляются и удаляются.
// preset — режим пресета: без дат и выполнения, без открытия кружков.
import { ref } from 'vue'
import { addNode, moveNode, removeNode, addUnit, moveUnit, removeUnit, sortAll, completeNode } from '../store/mock'
import { showToast } from '../composables/useToast'
import TaskPath from './TaskPath.vue'
import TaskSheet from './TaskSheet.vue'
import NodeEditor from './NodeEditor.vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({ units: { type: Array, required: true }, studentId: { type: [String, Number], default: 0 }, preset: Boolean })
const edit = ref(false), pos = ref(null), sel = ref(null)

const add = ({ ui, type }) => { addNode(props.units, ui, type, !props.preset); pos.value = { ui, i: props.units[ui].nodes.length - 1 } }   // сразу открываем правку нового кружка
const move = (dir) => { const { ui, i } = pos.value; moveNode(props.units, ui, i, dir); pos.value = { ui, i: Math.max(0, Math.min(props.units[ui].nodes.length - 1, i + dir)) } }
const remove = () => { removeAt(pos.value); pos.value = null }
function removeAt({ ui, i }) {
  const nodes = props.units[ui].nodes, [n] = removeNode(props.units, ui, i)
  showToast(`Кружок удалён: ${n.title}`, () => nodes.splice(Math.min(i, nodes.length), 0, n))
}
function removeUnitAt(ui) {
  const u = removeUnit(props.units, ui)
  showToast(`Юнит удалён: ${u.title}`, () => props.units.splice(Math.min(ui, props.units.length), 0, u))
}
const open = (n) => { if (!props.preset) sel.value = n }
</script>
<template>
  <div>
    <div class="row">
      <div class="seg"><button :class="{ on: !edit }" @click="edit = false">Просмотр</button><button :class="{ on: edit }" @click="edit = true">Правка</button></div>
      <div v-if="edit" class="row2">
        <button class="btn ghost" @click="addUnit(units)"><AppIcon name="plus" :size="16" /> Юнит</button>
        <button v-if="!preset" class="btn ghost" @click="sortAll(units)"><AppIcon name="calendar" :size="16" /> По датам</button>
      </div>
    </div>
    <TaskPath :units="units" :editable="edit" :plain="preset" @open="open" @edit="pos = $event" @move="e => moveNode(units, e.ui, e.i, e.dir)"
      @add="add" @remove="removeAt" @add-unit="addUnit(units)" @move-unit="e => moveUnit(units, e.ui, e.dir)" @remove-unit="removeUnitAt" />
    <NodeEditor v-if="pos" :units="units" :pos="pos" :preset="preset" @close="pos = null" @move="move" @remove="remove" />
    <TaskSheet v-if="sel" :node="sel" @close="sel = null" @complete="n => { completeNode(n, studentId); sel = null }" />
  </div>
</template>

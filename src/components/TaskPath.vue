<script setup>
// Путь из «кружков» по юнитам. В режиме правки: переименование и перемещение/удаление юнитов и кружков, добавление кружка нужного типа.
// plain — для пресетов: без замков и «Начать», все кружки равнозначны.
import { computed } from 'vue'
import { currentIdOf, fmtDate, relDay, NODE_TYPES } from '../store/app'
import AppIcon from './AppIcon.vue'
const props = defineProps({ units: { type: Array, required: true }, editable: Boolean, plain: Boolean })
defineEmits(['open', 'edit', 'move', 'add', 'remove', 'add-unit', 'move-unit', 'remove-unit'])
const ICON = { tutor: 'video', lesson: 'book', cards: 'cards', hw: 'pencil', combo: 'layers', audio: 'headphones', test: 'trophy' }
const ADD = [['hw', 'ДЗ', 'pencil'], ['cards', 'Слова', 'cards'], ['combo', 'Слова + ДЗ', 'layers']]
const K = [0, .6, 1, .6, 0, -.6, -1, -.6]
const cur = computed(() => currentIdOf(props.units))
const st = (n) => (n.done ? 'done' : props.plain ? 'todo' : n.id === cur.value ? 'current' : 'locked')
const icon = (n) => ({ done: 'check', todo: ICON[n.type] || 'book', locked: n.type === 'tutor' ? 'video' : 'lock', current: ICON[n.type] || 'book' }[st(n)])
const typeName = (n) => (n.type === 'tutor' ? 'Урок' : NODE_TYPES[n.type] || n.type)
</script>
<template>
  <section v-for="(u, ui) in units" :key="u.id">
    <div class="unit" :class="'u' + (ui % 2)">
      <template v-if="editable">
        <div class="uh"><input v-model="u.title" class="ut" aria-label="Название юнита" />
          <span class="ua">
            <button aria-label="Юнит выше" :disabled="!ui" @click="$emit('move-unit', { ui, dir: -1 })"><AppIcon name="up" :size="16" /></button>
            <button aria-label="Юнит ниже" :disabled="ui === units.length - 1" @click="$emit('move-unit', { ui, dir: 1 })"><AppIcon name="down" :size="16" /></button>
            <button aria-label="Удалить юнит" @click="$emit('remove-unit', ui)"><AppIcon name="trash" :size="16" /></button>
          </span></div>
        <input v-model="u.sub" class="us" placeholder="Подзаголовок" aria-label="Подзаголовок юнита" />
      </template>
      <template v-else><b>{{ u.title }}</b><span>{{ u.sub }}</span></template>
    </div>
    <div class="path">
      <template v-for="(n, i) in u.nodes" :key="n.id">
        <div v-if="n.date && (!i || n.date !== u.nodes[i - 1].date)" class="date">{{ fmtDate(n.date) }}</div>
        <div class="slot" :style="{ '--k': K[i % 8] }">
          <button class="node" :class="[st(n), n.type]" :disabled="!editable && st(n) === 'locked' && n.type !== 'tutor'"
            :aria-label="n.title" @click="editable ? $emit('edit', { ui, i }) : $emit('open', n)">
            <AppIcon :name="icon(n)" :size="32" />
            <span v-if="st(n) === 'current'" class="start">Начать</span>
            <span v-if="editable" class="pen"><AppIcon name="pencil" :size="14" /></span>
          </button>
          <button v-if="editable" class="del" aria-label="Удалить кружок" title="Удалить кружок" @click="$emit('remove', { ui, i })"><AppIcon name="x" :size="14" /></button>
          <div class="lbl">{{ n.title }}<small v-if="n.type === 'tutor'">{{ n.time }} · {{ relDay(n.date) }}</small><small v-else-if="editable">{{ typeName(n) }}</small></div>
          <div v-if="editable" class="mv">
            <button aria-label="Выше" @click="$emit('move', { ui, i, dir: -1 })"><AppIcon name="up" :size="16" /></button>
            <button aria-label="Ниже" @click="$emit('move', { ui, i, dir: 1 })"><AppIcon name="down" :size="16" /></button>
          </div>
        </div>
      </template>
      <div v-if="editable" class="add"><span class="hint">Добавить кружок:</span>
        <button v-for="a in ADD" :key="a[0]" class="btn ghost sm" @click="$emit('add', { ui, type: a[0] })"><AppIcon :name="a[2]" :size="16" /> {{ a[1] }}</button></div>
    </div>
  </section>
  <p v-if="editable && !units.length" class="hint" style="text-align:center">Пока пусто — добавьте первый юнит.</p>
  <button v-if="editable" class="btn ghost addu" @click="$emit('add-unit')"><AppIcon name="plus" :size="16" /> Юнит</button>
</template>
<style scoped>
.unit { margin: 18px 0 6px; border-radius: 16px; padding: 14px 18px; color: #fff; background: var(--green); box-shadow: 0 4px 0 var(--green-d) }
.unit.u1 { background: var(--purple); box-shadow: 0 4px 0 var(--purple-d) } .unit b { display: block; font-size: 19px } .unit span { opacity: .85; font-size: 14px }
.unit input { background: #ffffff26; color: #fff; margin: 0 0 6px; font-weight: 700; border-color: #ffffff40 } .unit input::placeholder { color: #ffffffaa }
.unit input:focus { background: #ffffff33; border-color: #fff }
.uh { display: flex; gap: 8px; align-items: flex-start } .uh .ut { flex: 1; min-width: 0 }
.unit .ua { display: flex; gap: 4px; opacity: 1 } .ua button { border: 2px solid #ffffff55; background: #ffffff26; color: #fff; border-radius: 10px; padding: 7px 8px; cursor: pointer; display: grid }
.ua button:disabled { opacity: .35; cursor: default }
.path { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 12px 0; --amp: 46px }
.date { font-size: 13px; font-weight: 800; color: var(--hint); background: var(--card); padding: 3px 12px; border: 2px solid var(--border); border-radius: 99px; text-transform: capitalize }
.slot:has(.node.current) { margin-top: 30px }
.slot { position: relative; display: grid; justify-items: center; gap: 8px; transform: translateX(calc(var(--amp) * var(--k))) }
.node { position: relative; width: 78px; height: 78px; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer;
  color: #fff; background: var(--green); box-shadow: 0 7px 0 var(--green-d); transition: transform .1s }
.node.tutor { border-radius: 26px; background: var(--purple); box-shadow: 0 7px 0 var(--purple-d) } .node:active { transform: translateY(5px) }
.node.cards:not(.done):not(.locked) { background: var(--blue); box-shadow: 0 7px 0 var(--blue-d) }
.node.combo:not(.done):not(.locked) { background: var(--orange); box-shadow: 0 7px 0 var(--orange-d) }
.node.done { background: var(--yellow); box-shadow: 0 7px 0 var(--yellow-d) }
.node.locked { background: var(--border); color: var(--hint-2); box-shadow: 0 7px 0 color-mix(in srgb, var(--hint-2) 55%, transparent) }
.node:disabled { cursor: default } .node.current { animation: pulse 1.6s infinite }
@keyframes pulse { 0% { outline: 0 solid #58cc0255 } 70% { outline: 14px solid #58cc0200 } 100% { outline: 0 solid #58cc0200 } }
.start { position: absolute; top: -38px; background: var(--card); color: var(--green); font-size: 13px; font-weight: 900; letter-spacing: .6px; text-transform: uppercase; padding: 4px 10px; border: 2px solid var(--border); border-radius: 12px }
.pen { position: absolute; right: -4px; bottom: -4px; background: var(--card); color: var(--blue); border: 2px solid var(--border); border-radius: 50%; padding: 4px; display: grid }
.del { position: absolute; top: -6px; left: calc(50% - 46px); width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--red); background: var(--card); color: var(--red); display: grid; place-items: center; padding: 0; cursor: pointer; z-index: 1 }
.del:hover { background: var(--red); color: #fff }
.lbl { font-size: 13px; font-weight: 800; text-align: center; max-width: 150px } .lbl small { display: block; color: var(--hint); font-weight: 500 }
.mv { display: flex; gap: 6px } .mv button { border: 2px solid var(--border); background: var(--card); color: var(--hint); border-radius: 10px; padding: 3px 7px; cursor: pointer }
.add { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 4px } .add .btn { display: inline-flex; align-items: center; gap: 6px }
.addu { display: flex; align-items: center; gap: 6px; margin: 8px auto 0 }
@media (min-width: 768px) { .path { --amp: 90px; gap: 20px } .node { width: 88px; height: 88px } .del { left: calc(50% - 52px) } }
@media (min-width: 1200px) { .path { --amp: 110px } }
</style>

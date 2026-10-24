<script setup>
import { state, currentNodeId, fmtDate, relDay } from '../store/mock'
import AppIcon from './AppIcon.vue'
defineEmits(['open'])
const ICON = { tutor: 'video', lesson: 'book', cards: 'cards', hw: 'pencil', audio: 'headphones', test: 'trophy' }
const K = [0, .6, 1, .6, 0, -.6, -1, -.6]            // зигзаг; амплитуда --amp задаётся адаптивно
const st = (n) => (n.done ? 'done' : n.id === currentNodeId.value ? 'current' : 'locked')
const icon = (n) => ({ done: 'check', locked: n.type === 'tutor' ? 'video' : 'lock', current: ICON[n.type] }[st(n)])
</script>
<template>
  <section v-for="(u, ui) in state.path" :key="u.title">
    <div class="unit" :class="'u' + (ui % 2)"><b>{{ u.title }}</b><span>{{ u.sub }}</span></div>
    <div class="path">
      <template v-for="(n, i) in u.nodes" :key="n.id">
        <div v-if="!i || n.date !== u.nodes[i - 1].date" class="date">{{ fmtDate(n.date) }}</div>
        <div class="slot" :style="{ '--k': K[i % 8] }">
          <button class="node" :class="[st(n), n.type]" :disabled="st(n) === 'locked' && n.type !== 'tutor'" @click="$emit('open', n)">
            <AppIcon :name="icon(n)" :size="32" />
            <span v-if="st(n) === 'current'" class="start">Начать</span>
          </button>
          <div class="lbl">{{ n.title }}<small v-if="n.type === 'tutor'">{{ n.time }} · {{ relDay(n.date) }}</small></div>
        </div>
      </template>
    </div>
  </section>
</template>
<style scoped>
.unit { margin: 18px 0 6px; border-radius: 20px; padding: 14px 18px; color: #fff; background: var(--accent); }
.unit.u1 { background: #a259e6 } .unit b { display: block; font-size: 19px } .unit span { opacity: .85; font-size: 14px }
.path { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 12px 0; --amp: 46px }
.date { align-self: center; font-size: 13px; font-weight: 700; color: var(--hint); background: var(--card); padding: 4px 12px; border-radius: 99px; box-shadow: var(--shadow); text-transform: capitalize }
.slot { display: grid; justify-items: center; gap: 8px; transform: translateX(calc(var(--amp) * var(--k))) }
.node { position: relative; width: 78px; height: 78px; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer;
  color: #fff; background: var(--accent); box-shadow: 0 7px 0 color-mix(in srgb, var(--accent) 70%, #000); transition: transform .1s }
.node.tutor { border-radius: 26px; background: #a259e6; box-shadow: 0 7px 0 #7b3fb8 }
.node:active { transform: translateY(5px) }
.node.done { background: var(--ok); box-shadow: 0 7px 0 #248a3d }
.node.locked { background: var(--bg); color: var(--hint); box-shadow: 0 7px 0 color-mix(in srgb, var(--hint) 35%, transparent); border: 2px dashed var(--hint) }
.node:disabled { cursor: default }
.node.current { animation: pulse 1.6s infinite }
@keyframes pulse { 0% { outline: 0 solid #2481cc55 } 70% { outline: 14px solid #2481cc00 } 100% { outline: 0 solid #2481cc00 } }
.start { position: absolute; top: -34px; background: var(--card); color: var(--accent); font-size: 13px; font-weight: 800; padding: 4px 10px; border-radius: 10px; box-shadow: var(--shadow) }
.lbl { font-size: 13px; font-weight: 600; text-align: center; max-width: 150px } .lbl small { display: block; color: var(--hint); font-weight: 500 }
@media (min-width: 768px) { .path { --amp: 90px; gap: 20px } .node { width: 88px; height: 88px } }
@media (min-width: 1200px) { .path { --amp: 110px } }
</style>

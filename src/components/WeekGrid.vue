<script setup>
// Одна неделя: время × дни. Ячейка — цель для drop, урок — «чип» (аватарка ученика), который можно тащить дальше.
import { HOURS, DAYS, hh, slotKey, lessonMap, isPastSlot, ymd, state } from '../store/mock'
import { dnd, pressStart } from '../composables/useDnd'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
defineProps({ dates: { type: Array, required: true } })
const emit = defineEmits(['cell', 'lesson'])
const today = ymd(new Date())
const stu = (id) => state.students.find(s => s.id === id)
const at = (d, h) => lessonMap.value.get(slotKey(d, h)) ?? []

function dropState(d, h) {                       // подсветка ячейки под курсором: ok / swap / bad
  const o = dnd.over
  if (!dnd.active || o?.kind !== 'cell' || o.date !== d || o.hour !== h) return ''
  if (isPastSlot(d, h)) return 'bad'
  const occ = at(d, h)[0], p = dnd.payload
  if (p.kind === 'lesson') return occ?.node.id === p.node.id ? '' : occ ? (occ.node.done ? 'bad' : 'swap') : 'ok'
  return occ ? 'bad' : 'ok'
}
const lifted = (l) => dnd.active && dnd.payload?.kind === 'lesson' && dnd.payload.node.id === l.node.id
const down = (e, l) => { if (!l.node.done) pressStart(e, { kind: 'lesson', node: l.node, studentId: l.studentId }) }
const clickCell = (d, h) => { if (!at(d, h).length && !isPastSlot(d, h)) emit('cell', { date: d, hour: h }) }
</script>

<template>
  <div class="card wk">
    <div class="g head">
      <span class="corner" />
      <span v-for="(d, i) in dates" :key="d" class="dh" :class="{ we: i > 4, today: d === today }"><b>{{ DAYS[i] }}</b><small>{{ +d.slice(8) }}</small></span>
    </div>
    <div v-for="h in HOURS" :key="h" class="g">
      <span class="tm">{{ hh(h) }}</span>
      <div v-for="d in dates" :key="d" class="cell" :class="[dropState(d, h), { past: isPastSlot(d, h), free: !at(d, h).length && !isPastSlot(d, h) }]"
        data-drop="cell" :data-date="d" :data-hour="h" @click="clickCell(d, h)">
        <template v-for="l in at(d, h).slice(0, 1)" :key="l.node.id">
          <button class="chip" :class="{ done: l.node.done, lifted: lifted(l) }" :title="`${stu(l.studentId).name}, ${l.node.time}`" :aria-label="`${stu(l.studentId).name}, ${l.node.time}`"
            @pointerdown="down($event, l)" @click.stop="emit('lesson', l)" @dragstart.prevent>
            <Avatar :s="stu(l.studentId)" :size="20" />
            <AppIcon v-if="l.node.done" name="check" :size="12" class="ok" />
            <i v-if="at(d, h).length > 1" class="more">+{{ at(d, h).length - 1 }}</i>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Узкая таблица: ячейка 46px (на телефоне — по ширине экрана), в ячейке только аватарка; имя — в подсказке и в шторке урока */
.wk { padding: 8px; display: grid; gap: 3px; overflow: hidden }
.g { display: grid; grid-template-columns: 34px repeat(7, minmax(0, 1fr)); gap: 3px; align-items: stretch }
.head { margin-bottom: 2px }
.tm { display: grid; place-items: center; font-size: 10px; font-weight: 800; color: var(--hint-2) }
.dh { display: grid; justify-items: center; padding: 3px 0; border-radius: 10px; font-size: 12px; color: var(--hint) }
.dh small { font-weight: 800; font-size: 11px; color: var(--hint-2) } .dh.we b { color: var(--purple-d) }
.dh.today { background: var(--blue); color: #fff; box-shadow: 0 3px 0 var(--blue-d) } .dh.today b, .dh.today small { color: #fff }
.cell { position: relative; height: 34px; border-radius: 9px; background: var(--surface); transition: background .1s, box-shadow .1s }
.cell.free { cursor: pointer } .cell.free:hover { background: var(--blue-l) }
.cell.past { background: transparent; box-shadow: inset 0 0 0 2px var(--surface) }
.cell.ok { background: var(--green-l); box-shadow: inset 0 0 0 2px var(--green) }
.cell.swap { background: var(--orange-l); box-shadow: inset 0 0 0 2px var(--orange) }
.cell.bad { background: var(--red-l); box-shadow: inset 0 0 0 2px var(--red) }
.chip { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0; min-width: 0;
  border: 2px solid var(--blue); border-bottom-width: 4px; border-radius: 9px; background: var(--blue-l); color: var(--blue-d);
  font: inherit; cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; transition: opacity .1s }
.chip:active { cursor: grabbing } .chip.lifted { opacity: .3 }
.chip.done { border-color: var(--green); background: var(--green-l); color: var(--green-d); cursor: pointer }
.chip :deep(.av) { width: 20px !important; height: 20px !important; font-size: 10px !important }
.chip .ok { position: absolute; right: -2px; bottom: -3px; background: var(--green); color: #fff; border-radius: 50%; padding: 1px }
.more { position: absolute; top: -6px; right: -4px; font-style: normal; font-size: 10px; font-weight: 900; background: var(--orange); color: #fff; border-radius: 99px; padding: 1px 5px }
@media (min-width: 720px) { .wk { width: max-content; max-width: 100% } .g { grid-template-columns: 40px repeat(7, 46px) } .tm { font-size: 11px } }
@media (max-width: 420px) { .wk { padding: 6px } .g { gap: 2px; grid-template-columns: 30px repeat(7, minmax(0, 1fr)) } .cell { height: 32px } }
</style>

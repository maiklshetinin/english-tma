<script setup>
// Одна неделя: время × дни. Ячейка — цель для drop, урок — «чип» (аватарка ученика), который можно тащить дальше.
import { computed } from 'vue'
import { HOURS, DAYS, hh, slotKey, lessonMap, nowTick, ymd, state } from '../store/mock'
import { dnd, pressStart } from '../composables/useDnd'
import Avatar from './Avatar.vue'
const props = defineProps({ dates: { type: Array, required: true } })
const emit = defineEmits(['cell', 'lesson'])
// «Сейчас»: сегодняшний день и текущий час (обновляется раз в минуту). Подсвечивается только в той таблице, где есть сегодняшний день.
const now = computed(() => { const d = new Date(nowTick.value); return { date: ymd(d), hour: d.getHours() } })
const hasToday = computed(() => props.dates.includes(now.value.date))
const rowNow = (h) => hasToday.value && h === now.value.hour
const cellNow = (d, h) => d === now.value.date && h === now.value.hour
const stu = (id) => state.students.find(s => s.id === id)
const at = (d, h) => lessonMap.value.get(slotKey(d, h)) ?? []

function dropState(d, h) {                       // подсветка ячейки под курсором: ok / swap / bad (в обеих таблицах одинаково)
  const o = dnd.over
  if (!dnd.active || o?.kind !== 'cell' || o.date !== d || o.hour !== h) return ''
  const occ = at(d, h)[0], p = dnd.payload
  if (p.kind === 'lesson') return occ?.id === p.lesson.id ? '' : occ ? 'swap' : 'ok'
  return occ ? 'bad' : 'ok'
}
const lifted = (l) => dnd.active && dnd.payload?.kind === 'lesson' && dnd.payload.lesson.id === l.id
const down = (e, l) => pressStart(e, { kind: 'lesson', lesson: l })
// Подпись урока: ученик (у группы — первый, остальные «+N»). Ученика могли архивировать — тогда подписи нет, и ячейка просто пустая
const first = (l) => stu(l.studentIds[0])
const label = (l) => `${first(l)?.name ?? ''}${l.studentIds.length > 1 ? ` +${l.studentIds.length - 1}` : ''}, ${hh(l.hour)}`
const clickCell = (d, h) => { if (!at(d, h).length) emit('cell', { date: d, hour: h }) }
</script>

<template>
  <div class="card wk">
    <div class="g head">
      <span class="corner" />
      <span v-for="(d, i) in dates" :key="d" class="dh" :class="{ we: i > 4, today: d === now.date }"><b>{{ DAYS[i] }}</b><small>{{ +d.slice(8) }}</small></span>
    </div>
    <div v-for="h in HOURS" :key="h" class="g">
      <span class="tm" :class="{ now: rowNow(h) }">{{ hh(h) }}</span>
      <div v-for="d in dates" :key="d" class="cell" :class="[dropState(d, h), { free: !at(d, h).length, now: cellNow(d, h) }]"
        data-drop="cell" :data-date="d" :data-hour="h" @click="clickCell(d, h)">
        <template v-for="l in at(d, h).slice(0, 1)" :key="l.id">
          <button v-if="first(l)" class="chip" :class="{ lifted: lifted(l) }" :title="label(l)" :aria-label="label(l)"
            @pointerdown="down($event, l)" @click.stop="emit('lesson', l)" @dragstart.prevent>
            <Avatar :s="first(l)" :size="20" /><span class="nm">{{ first(l).name }}</span>
            <i v-if="l.studentIds.length > 1 || at(d, h).length > 1" class="more">+{{ l.studentIds.length - 1 + at(d, h).length - 1 }}</i>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ячейки на всю ширину колонки; на телефоне в ячейке только аватарка, на широком экране — аватарка и имя */
.wk { padding: 10px; display: grid; gap: 4px; overflow: hidden }
.g { display: grid; grid-template-columns: 34px repeat(7, minmax(0, 1fr)); gap: 4px; align-items: stretch }
.head { margin-bottom: 2px }
.tm { display: grid; place-items: center; font-size: 11px; font-weight: 800; color: var(--hint-2) }
.dh { display: grid; justify-items: center; padding: 4px 0; border-radius: 12px; font-size: 13px; color: var(--hint) }
.dh small { font-weight: 800; font-size: 12px; color: var(--hint-2) } .dh.we b { color: var(--purple-d) }
/* «Сейчас» — красным и полупрозрачным (синий занят чипами уроков): день, время и ячейка на пересечении */
.dh.today { background: rgba(255, 75, 75, .16); box-shadow: inset 0 0 0 2px rgba(255, 75, 75, .55), 0 3px 0 rgba(234, 43, 43, .45) } .dh.today b, .dh.today small { color: var(--red-d) }
.cell { position: relative; height: 36px; border-radius: 10px; background: var(--surface); transition: background .1s, box-shadow .1s }
.cell.free { cursor: pointer } .cell.free:hover { background: var(--blue-l) }
/* Текущий час: время, день недели (.dh.today) и ячейка на пересечении — один красный полупрозрачный цвет */
.tm.now { background: rgba(255, 75, 75, .16); color: var(--red-d); border: 2px solid rgba(255, 75, 75, .55); border-bottom-width: 4px; border-radius: 10px; font-weight: 900 }
.cell.now { background: rgba(255, 75, 75, .16) }
.cell.now::after { content: ''; position: absolute; inset: -3px; border: 2px solid rgba(255, 75, 75, .6); border-radius: 12px; pointer-events: none }
.cell.ok { background: var(--green-l); box-shadow: inset 0 0 0 2px var(--green) }
.cell.swap { background: var(--orange-l); box-shadow: inset 0 0 0 2px var(--orange) }
.cell.bad { background: var(--red-l); box-shadow: inset 0 0 0 2px var(--red) }
.chip { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 0 4px; min-width: 0;
  border: 2px solid var(--blue); border-bottom-width: 4px; border-radius: 10px; background: var(--blue-l); color: var(--blue-d);
  font: inherit; font-size: 12px; font-weight: 800; cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; transition: opacity .1s }
.chip:active { cursor: grabbing } .chip.lifted { opacity: .3 }
.chip :deep(.av) { width: 20px !important; height: 20px !important; font-size: 10px !important }
.chip .nm { display: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.more { position: absolute; top: -6px; right: -4px; font-style: normal; font-size: 10px; font-weight: 900; background: var(--orange); color: #fff; border-radius: 99px; padding: 1px 5px }
@media (min-width: 720px) { .chip .nm { display: block } .chip { justify-content: flex-start; padding: 0 6px } .cell { height: 40px } .g { grid-template-columns: 52px repeat(7, minmax(0, 1fr)) } }
@media (max-width: 420px) { .wk { padding: 6px } .g { gap: 3px; grid-template-columns: 30px repeat(7, minmax(0, 1fr)) } .chip { padding: 0 } .cell { height: 34px } }
</style>

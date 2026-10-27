<script setup>
// Одна неделя: время × дни. Ячейка — цель для drop, урок — «чип» (аватарка ученика), который можно тащить дальше.
import { computed } from 'vue'
import { HOURS, DAYS, hh, slotKey, nowTick, ymd } from '../store/app'
import { dnd, pressStart } from '../composables/useDnd'
import Avatar from './Avatar.vue'
import { sumMoney, fmtMoney, fmtMoneyShort, fmtMoneyK } from '../utils/price'
import AvatarStack from './AvatarStack.vue'
import { useStudentsStore } from '../stores/students'
import { useScheduleStore } from '../stores/schedule'
const studentStore = useStudentsStore()
const scheduleStore = useScheduleStore()
const props = defineProps({ dates: { type: Array, required: true } })
const emit = defineEmits(['cell', 'lesson'])
// «Сейчас»: сегодняшний день и текущий час (обновляется раз в минуту). Подсвечивается только в той таблице, где есть сегодняшний день.
const now = computed(() => { const d = new Date(nowTick.value); return { date: ymd(d), hour: d.getHours() } })
const hasToday = computed(() => props.dates.includes(now.value.date))
const rowNow = (h) => hasToday.value && h === now.value.hour
const cellNow = (d, h) => d === now.value.date && h === now.value.hour
const stu = (id) => studentStore.list.find(s => s.id === id)
const at = (d, h) => scheduleStore.lessonMap.get(slotKey(d, h)) ?? []
// Деньги дня: факт — проведённые уроки (зафиксированные цены), план — все уроки дня (utils/price.ts)
const moneyByDay = computed(() => Object.fromEntries(props.dates.map(d => [d, sumMoney(scheduleStore.lessons.filter(l => l.date === d), studentStore.byId)])))
const money = (d) => moneyByDay.value[d]

function dropState(d, h) {                       // подсветка ячейки под курсором: ok / swap / bad (в обеих таблицах одинаково)
  const o = dnd.over
  if (!dnd.active || o?.kind !== 'cell' || o.date !== d || o.hour !== h) return ''
  const occ = at(d, h)[0], p = dnd.payload
  if (p.kind === 'lesson') return occ?.id === p.lesson.id ? '' : occ ? 'swap' : 'ok'
  if (!occ) return 'ok'
  return occ.done || occ.studentIds.includes(p.id) || group(occ).length >= 12 ? 'bad' : 'join'      // ученик на урок — добавится в группу
}
// Ученики урока, которые есть в списке. Ученика могли удалить из базы или архивировать — его id остаётся в уроке, но показывать некого.
const group = (l) => l.studentIds.map(stu).filter(Boolean)                 // участники группы — аватарки внахлёст (AvatarStack)
const isGroup = (l) => group(l).length > 1
const orphan = (l) => !group(l).length                                      // урок, в котором не осталось известных учеников: показываем серым «?», чтобы его можно было убрать
const goneName = (l) => Object.values(l.names ?? {})[0] ?? ''             // имя удалённого навсегда (у проведённых уроков)
const lifted = (l) => dnd.active && dnd.payload?.kind === 'lesson' && dnd.payload.lesson.id === l.id
const down = (e, l) => { if (!l.done && !orphan(l)) pressStart(e, { kind: 'lesson', lesson: l }) }      // проведённый (и «пустой») урок не перетаскиваем
// Подпись урока: ученик или участники группы; у «пустого» урока — подсказка, что его ученика больше нет
const first = (l) => group(l)[0]
const label = (l) => orphan(l) ? (goneName(l) ? `${goneName(l)} (удалён), ${hh(l.hour)}` : `Урок без ученика (удалён или в архиве), ${hh(l.hour)} — нажмите, чтобы убрать`) : isGroup(l) ? `Группа: ${group(l).map(s => s.name).join(', ')}, ${hh(l.hour)}` : `${first(l).name}, ${hh(l.hour)}`
const clickCell = (d, h) => { if (!at(d, h).length) emit('cell', { date: d, hour: h }) }
</script>

<template>
  <div class="card wk">
    <div class="g head">
      <span class="corner" />
      <span v-for="(d, i) in dates" :key="d" class="dh" :class="{ we: i > 4, today: d === now.date }"><b>{{ DAYS[i] }}</b><small>{{ +d.slice(8) }}</small>
        <span v-if="money(d).plan" class="money" :title="`Факт ${fmtMoney(money(d).real)} из плана ${fmtMoney(money(d).plan)}`">
          <i class="real" :class="{ zero: !money(d).real }"><span class="w">{{ fmtMoneyShort(money(d).real) }}</span><span class="n">{{ fmtMoneyK(money(d).real) }}</span></i>
          <i v-if="money(d).plan !== money(d).real" class="plan"><span class="w">из {{ fmtMoneyShort(money(d).plan) }}</span><span class="n">/{{ fmtMoneyK(money(d).plan) }}</span></i></span></span>
    </div>
    <div v-for="h in HOURS" :key="h" class="g">
      <span class="tm" :class="{ now: rowNow(h) }">{{ hh(h) }}</span>
      <div v-for="d in dates" :key="d" class="cell" :class="[dropState(d, h), { free: !at(d, h).length, now: cellNow(d, h) }]"
        data-drop="cell" :data-date="d" :data-hour="h" @click="clickCell(d, h)">
        <template v-for="l in at(d, h).slice(0, 1)" :key="l.id">
          <button class="chip" :class="{ lifted: lifted(l), done: l.done, group: isGroup(l), orphan: orphan(l) }" :title="label(l)" :aria-label="label(l)"
            @pointerdown="down($event, l)" @click.stop="emit('lesson', l)" @dragstart.prevent>
            <template v-if="isGroup(l)">
              <AvatarStack class="st-lg" :students="group(l)" :size="20" :max="4" ring="var(--purple-l)" /><AvatarStack class="st-sm" :students="group(l)" :size="20" :max="2" ring="var(--purple-l)" />
              <span v-if="l.done" class="tick">✓</span>
            </template>
            <template v-else-if="orphan(l)"><span class="q">?</span><span class="nm">{{ goneName(l) || 'Нет ученика' }}</span></template>
            <template v-else><Avatar :s="first(l)" :size="20" /><span v-if="l.done" class="tick">✓</span><span class="nm">{{ first(l).name }}</span></template>
            <i v-if="at(d, h).length > 1" class="more">+{{ at(d, h).length - 1 }}</i>
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
/* Деньги дня под датой: зелёным — факт (проведённые), серым — «из» плана; на узком экране суммы короткие (12,5к) */
.head { align-items: start } .head .dh { align-content: start }
.money .n { display: none } @media (max-width: 719px) { .money .w { display: none } .money .n { display: inline } }
.money { display: grid; justify-items: center; margin-top: 2px; line-height: 1.15; font-style: normal; max-width: 100%; overflow: hidden }
.money i { font-style: normal; white-space: nowrap }
.money .real { font-size: 12px; font-weight: 900; color: var(--green-d) } .money .real.zero { color: var(--hint-2) }
.money .plan { font-size: 10px; font-weight: 800; color: var(--hint-2) }
html[data-theme='dark'] .money .real { color: var(--green) }
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
.chip.done { border-color: var(--green); background: var(--green-l); color: var(--green-d); cursor: pointer } .chip .tick { font-weight: 900 }
/* Групповой урок — фиолетовый (и в шторке урока LessonSheet.vue); проведённая группа остаётся фиолетовой, с зелёной ✓ */
.chip.group { border-color: var(--purple); background: var(--purple-l); color: var(--purple-d) }
.chip.group .tick { color: var(--green-d) }
/* Группа: аватарки внахлёст без подписи — на телефоне две (вторая может быть «+N»), на широком экране до четырёх */
.chip .st-lg { display: none } .chip .st-sm { display: inline-flex }
@media (min-width: 720px) { .chip .st-lg { display: inline-flex } .chip .st-sm { display: none } }
.cell.join .chip.group :deep(.it) { box-shadow: 0 0 0 1.5px var(--purple-l) }
html[data-theme='dark'] .chip.group { color: var(--purple) }
.cell.join { box-shadow: inset 0 0 0 2px var(--purple) } .cell.join .chip { border-color: var(--purple); background: var(--purple-l) }
/* Урок, ученика которого больше нет (удалён из базы / архив): серый пунктир с «?» — нажать и убрать */
.chip.orphan { border-style: dashed; border-color: var(--hint-2); background: var(--surface); color: var(--hint); cursor: pointer }
.chip .q { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--hint-2); color: #fff; font-weight: 900; font-size: 12px; flex: none }
.chip:active { cursor: grabbing } .chip.lifted { opacity: .3 }
.chip :deep(.av) { width: 20px !important; height: 20px !important; font-size: 10px !important }
.chip .nm { display: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.more { position: absolute; top: -6px; right: -4px; font-style: normal; font-size: 10px; font-weight: 900; background: var(--orange); color: #fff; border-radius: 99px; padding: 1px 5px }
@media (min-width: 720px) { .chip .nm { display: block } .chip { justify-content: flex-start; padding: 0 6px } .cell { height: 40px } .g { grid-template-columns: 52px repeat(7, minmax(0, 1fr)) } }
@media (max-width: 420px) { .wk { padding: 6px } .g { gap: 3px; grid-template-columns: 30px repeat(7, minmax(0, 1fr)) } .chip { padding: 0 } .cell { height: 34px } }
</style>

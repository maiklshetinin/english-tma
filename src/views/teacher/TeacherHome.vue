<script setup>
// Главная преподавателя: две недели расписания + список учеников справа. Ученика тянем в ячейку — создаётся урок в его пути.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { state, weekDates, weekRange, weekTitle, lessonMap, slotKey, isPastSlot, hourOf, fmtSlot,
  scheduleLesson, relocateLesson, swapLessons, removeLesson, restoreLesson } from '../../store/mock'
import { setDropHandler } from '../../composables/useDnd'
import { showToast } from '../../composables/useToast'
import { useTelegram } from '../../composables/useTelegram'
import WeekGrid from '../../components/WeekGrid.vue'
import StudentsPanel from '../../components/StudentsPanel.vue'
import LessonSheet from '../../components/LessonSheet.vue'
import AppIcon from '../../components/AppIcon.vue'
import StudentDetail from './StudentDetail.vue'
const { haptic } = useTelegram()

const wk = ref(0)                                   // сдвиг окна «эта + следующая» в неделях (стрелки — в шапке первой таблицы)
const w1 = computed(() => weekDates(wk.value)), w2 = computed(() => weekDates(wk.value + 1))
const sheet = ref(null)                             // { lesson } | { slot }
const name = (id) => state.students.find(s => s.id === id)?.name
const occupant = (d, h) => lessonMap.value.get(slotKey(d, h))?.[0]

function assign(sid, date, hour) {
  const node = scheduleLesson(sid, date, hour); haptic('light')
  showToast(`Урок назначен: ${name(sid)} · ${fmtSlot(date, hour)}`, () => removeLesson(sid, node.id))
}
function unassign(l) {
  const node = removeLesson(l.studentId, l.node.id); sheet.value = null; haptic('light')
  showToast(`Урок снят: ${name(l.studentId)}`, () => restoreLesson(l.studentId, node))
}
function onDrop(p, t) {
  if (t.kind === 'panel') return p.kind === 'lesson' ? unassign({ studentId: p.studentId, node: p.node }) : undefined
  if (t.kind !== 'cell') return
  if (isPastSlot(t.date, t.hour)) return showToast('Нельзя назначить урок в прошедшее время', null, 'bad')
  const occ = occupant(t.date, t.hour)
  if (p.kind === 'student') {
    if (occ) return showToast('Это время уже занято', null, 'bad')
    return assign(p.id, t.date, t.hour)
  }
  if (occ?.node.id === p.node.id) return
  const from = { date: p.node.date, hour: hourOf(p.node) }
  if (occ) {                                         // занято — меняем уроки местами
    if (occ.node.done) return showToast('Это время уже занято', null, 'bad')
    const a = { studentId: p.studentId, node: p.node }, b = { studentId: occ.studentId, node: occ.node }
    swapLessons(a, b); haptic('light')
    return showToast(`Уроки поменялись местами: ${name(a.studentId)} ⇄ ${name(b.studentId)}`, () => swapLessons(a, b))
  }
  relocateLesson(p.studentId, p.node.id, t.date, t.hour); haptic('light')
  showToast(`Урок перенесён: ${name(p.studentId)} · ${fmtSlot(t.date, t.hour)}`, () => relocateLesson(p.studentId, p.node.id, from.date, from.hour))
}
const pick = (sid) => { const { date, hour } = sheet.value.slot; sheet.value = null; if (!occupant(date, hour)) assign(sid, date, hour) }
const openStudent = (id) => { sheet.value = null; state.selectedStudentId = id }

onMounted(() => setDropHandler(onDrop))
onUnmounted(() => setDropHandler(null))
</script>

<template>
  <StudentDetail v-if="state.selectedStudentId" :id="state.selectedStudentId" back-label="Главная" @back="state.selectedStudentId = null" />
  <div v-else class="home">
    <div class="side"><StudentsPanel /></div>
    <section class="main">
      <div class="weeks">
        <div class="wcol">
          <div class="wh">
            <div><b>{{ weekTitle(wk) }}</b><span>{{ weekRange(w1) }}</span></div>
            <div class="nav2">
              <button class="btn ghost sm" aria-label="Назад на неделю" @click="wk--"><AppIcon name="back" :size="18" /></button>
              <button class="btn ghost sm" :disabled="wk === 0" @click="wk = 0">Сегодня</button>
              <button class="btn ghost sm" aria-label="Вперёд на неделю" @click="wk++"><AppIcon name="next" :size="18" /></button>
            </div>
          </div>
          <WeekGrid :dates="w1" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" />
        </div>
        <div class="wcol">
          <div class="wh"><div><b>{{ weekTitle(wk + 1) }}</b><span>{{ weekRange(w2) }}</span></div></div>
          <WeekGrid :dates="w2" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" />
        </div>
      </div>
    </section>
    <LessonSheet v-if="sheet" :lesson="sheet.lesson" :slot="sheet.slot" @close="sheet = null" @remove="unassign" @open="openStudent" @pick="pick" />
  </div>
</template>

<style scoped>
.home { max-width: 1320px; margin: 0 auto; display: grid; gap: 12px; padding: 0 12px calc(100px + var(--safe-b)); grid-template-areas: 'side' 'main' }
.side { grid-area: side; position: sticky; top: 0; z-index: 8; padding: 10px 0 6px; background: var(--bg) }
.main { grid-area: main; min-width: 0 }
/* Две узкие таблицы стоят рядом, если помещаются, иначе друг под другом; таблица — с самого верха страницы */
.weeks { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start }
.wcol { display: grid; gap: 6px; flex: 1 1 100%; min-width: 0 }
.nav2 { display: flex; gap: 6px }
.wh { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 36px; padding: 0 4px; font-size: 14px; color: var(--hint) }
.wh b { display: block; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; line-height: 1.2 } .wh span { font-size: 13px; font-weight: 700 }
@media (min-width: 720px) { .wcol { flex: 0 1 auto } }
@media (min-width: 1024px) {
  .home { grid-template-columns: minmax(0, 1fr) 272px; grid-template-areas: 'main side'; gap: 24px; padding: 12px 0 40px }
  .side { position: sticky; top: 12px; height: calc(100vh - 24px); padding: 0; background: none; z-index: 1 }
}
</style>

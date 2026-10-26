<script setup>
// Главная преподавателя: две недели расписания + список учеников справа. Ученика тянем в ячейку — создаётся урок (сохраняется на сервере).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { nowTick, weekDates, weekRange, weekTitle, slotKey, fmtSlot } from '../../store/app'
import { goUp } from '../../router'
import { setDropHandler } from '../../composables/useDnd'
import { showToast } from '../../composables/useToast'
import { useTelegram } from '../../composables/useTelegram'
import WeekGrid from '../../components/WeekGrid.vue'
import StudentsPanel from '../../components/StudentsPanel.vue'
import LessonSheet from '../../components/LessonSheet.vue'
import StudentDetail from './StudentDetail.vue'
import { useStudentsStore } from '../../stores/students'
import { useScheduleStore } from '../../stores/schedule'
const studentStore = useStudentsStore()
const route = useRoute(), router = useRouter()
const scheduleStore = useScheduleStore()
const { haptic } = useTelegram()

// Без листания: сверху всегда текущая неделя, под ней следующая; даты подставляются сами (и обновляются при смене недели)
const w1 = computed(() => (nowTick.value, weekDates(0))), w2 = computed(() => (nowTick.value, weekDates(1)))
const sheet = ref(null)                             // { lesson } | { slot }
const name = (id) => studentStore.list.find(s => s.id === id)?.name
const names = (l) => l.studentIds.map(name).filter(Boolean).join(', ')
const occupant = (d, h) => scheduleStore.lessonMap.get(slotKey(d, h))?.[0]

function assign(sid, date, hour) {
  const lesson = scheduleStore.create([sid], date, hour); haptic('light')
  showToast(`Урок назначен: ${name(sid)} · ${fmtSlot(date, hour)}`, () => scheduleStore.remove(lesson))
}
function unassign(lesson) {
  if (lesson.done) return showToast('Урок проведён — сначала снимите отметку', null, 'bad')
  const copy = { studentIds: [...lesson.studentIds], date: lesson.date, hour: lesson.hour }
  scheduleStore.remove(lesson); sheet.value = null; haptic('light')
  showToast(`Урок снят: ${names(copy)}`, () => scheduleStore.create(copy.studentIds, copy.date, copy.hour))
}
function onDrop(p, t) {
  if (t.kind === 'panel') return p.kind === 'lesson' ? unassign(p.lesson) : undefined
  if (t.kind !== 'cell') return
  const occ = occupant(t.date, t.hour)
  if (p.kind === 'student') {
    if (occ) return showToast('Это время уже занято', null, 'bad')
    return assign(p.id, t.date, t.hour)
  }
  const a = p.lesson
  if (occ?.id === a.id) return
  if (a.done || occ?.done) return showToast('Проведённый урок нельзя переносить — сначала снимите отметку', null, 'bad')
  const from = { date: a.date, hour: a.hour }
  if (occ) {                                         // занято — меняем уроки местами
    scheduleStore.swap(a, occ); haptic('light')
    return showToast(`Уроки поменялись местами: ${names(a)} ⇄ ${names(occ)}`, () => scheduleStore.swap(a, occ))
  }
  scheduleStore.move(a, t.date, t.hour); haptic('light')
  showToast(`Урок перенесён: ${names(a)} · ${fmtSlot(t.date, t.hour)}`, () => scheduleStore.move(a, from.date, from.hour))
}
function toggleDone(lesson) {
  const was = !!lesson.done
  scheduleStore.setDone(lesson, !was); sheet.value = null; haptic('light')
  showToast(was ? 'Отметка «проведён» снята' : `Урок проведён: ${names(lesson)}`, () => scheduleStore.setDone(lesson, was))
}
const pick = (sid) => { const { date, hour } = sheet.value.slot; sheet.value = null; if (!occupant(date, hour)) assign(sid, date, hour) }
const openStudent = (id) => { sheet.value = null; router.push({ name: 'home', params: { id } }) }

onMounted(() => { setDropHandler(onDrop); scheduleStore.load().catch(() => {}) })      // при открытии вкладки перечитываем расписание
onUnmounted(() => setDropHandler(null))
watch(() => w1.value[0], () => scheduleStore.load().catch(() => {}))                    // наступила новая неделя: «следующая» стала «текущей», подгружаем новую «следующую»
</script>

<template>
  <StudentDetail v-if="route.params.id" :id="route.params.id" back-label="Главная" @back="goUp(router)" />
  <div v-else class="home">
    <div class="side"><StudentsPanel /></div>
    <section class="main">
      <div class="weeks">
        <div class="wcol">
          <div class="wh"><div><b>{{ weekTitle(0) }}</b><span>{{ weekRange(w1) }}</span></div></div>
          <WeekGrid :dates="w1" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" />
        </div>
        <div class="wcol">
          <div class="wh"><div><b>{{ weekTitle(1) }}</b><span>{{ weekRange(w2) }}</span></div></div>
          <WeekGrid :dates="w2" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" />
        </div>
      </div>
    </section>
    <LessonSheet v-if="sheet" :lesson="sheet.lesson" :slot="sheet.slot" @close="sheet = null" @remove="unassign" @done="toggleDone" @open="openStudent" @pick="pick" />
  </div>
</template>

<style scoped>
.home { max-width: 1140px; margin: 0 auto; display: grid; gap: 12px; padding: 0 12px calc(100px + var(--safe-b)); grid-template-areas: 'side' 'main' }
.side { grid-area: side; position: sticky; top: 0; z-index: 8; padding: 10px 0 6px; background: var(--bg) }
.main { grid-area: main; min-width: 0 }
/* Две таблицы друг под другом: сверху «Эта неделя», ниже «Следующая неделя» */
.weeks { display: grid; gap: 14px }
.wcol { display: grid; gap: 6px; min-width: 0 }
.wh { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 4px; font-size: 14px; color: var(--hint) }
.wh b { display: block; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; line-height: 1.2 } .wh span { font-size: 13px; font-weight: 700 }
@media (min-width: 1024px) {
  .home { grid-template-columns: minmax(0, 1fr) 272px; grid-template-areas: 'main side'; gap: 24px; padding: 12px 0 40px }
  .side { position: sticky; top: 12px; height: calc(100vh - 24px); padding: 0; background: none; z-index: 1 }
}
</style>

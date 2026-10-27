<script setup>
// Главная преподавателя: две недели расписания + список учеников справа. Ученика тянем в ячейку — создаётся урок (сохраняется на сервере).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { nowTick, weekDates, weekRange, weekTitle, slotKey, fmtSlot, hh } from '../../store/app'
import { goUp } from '../../router'
import { setDropHandler } from '../../composables/useDnd'
import { showToast } from '../../composables/useToast'
import { useTelegram } from '../../composables/useTelegram'
import WeekGrid from '../../components/WeekGrid.vue'
import StudentsPanel from '../../components/StudentsPanel.vue'
import LessonSheet from '../../components/LessonSheet.vue'
import WeekMoney from '../../components/WeekMoney.vue'
import { sumMoney } from '../../utils/price'
import StudentDetail from './StudentDetail.vue'
import { useStudentsStore } from '../../stores/students'
import { useScheduleStore } from '../../stores/schedule'
const studentStore = useStudentsStore()
const route = useRoute(), router = useRouter()
const scheduleStore = useScheduleStore()
const { haptic } = useTelegram()
const MAX_GROUP = 12                                // как на сервере (server/schedule.ts)

// Без листания: сверху всегда текущая неделя, под ней следующая; даты подставляются сами (и обновляются при смене недели)
const w1 = computed(() => (nowTick.value, weekDates(0))), w2 = computed(() => (nowTick.value, weekDates(1)))
// Деньги недели: факт (проведённые) и план (все уроки) — utils/price.ts; меняются сразу при отметке «проведён»
const weekMoney = (dates) => sumMoney(scheduleStore.lessons.filter(l => dates.includes(l.date)), studentStore.byId)
const m1 = computed(() => weekMoney(w1.value)), m2 = computed(() => weekMoney(w2.value))
const sheet = ref(null)                             // { lesson } | { slot }
const name = (id) => studentStore.findAny(id)?.name
const names = (l) => l.studentIds.map(name).filter(Boolean).join(', ')
const known = (l) => l.studentIds.filter(id => studentStore.byId(id))      // без удалённых / архивных: их id сервер не примет
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
// Состав урока (группа): добавить / убрать учеников. Тост с «Отменить» возвращает прежний состав.
function setStudents(lesson, ids) {
  if (lesson.done) return showToast('Урок проведён — сначала снимите отметку', null, 'bad')
  if (!ids.length) return
  const was = known(lesson)
  const added = ids.filter(id => !was.includes(id)), removed = was.filter(id => !ids.includes(id))
  scheduleStore.setStudents(lesson, ids); haptic('light')
  const msg = added.length ? `Добавлен в урок: ${added.map(name).join(', ')}` : `Убран из урока: ${removed.map(name).join(', ')}`
  showToast(msg, () => scheduleStore.setStudents(lesson, was))
}
function onDrop(p, t) {
  if (t.kind === 'panel') return p.kind === 'lesson' ? unassign(p.lesson) : undefined
  if (t.kind !== 'cell') return
  const occ = occupant(t.date, t.hour)
  if (p.kind === 'student') {
    if (!occ) return assign(p.id, t.date, t.hour)
    if (occ.studentIds.includes(p.id)) return showToast(`${name(p.id)} уже в этом уроке`, null, 'bad')
    if (known(occ).length >= MAX_GROUP) return showToast(`В группе не больше ${MAX_GROUP} учеников`, null, 'bad')
    return setStudents(occ, [...known(occ), p.id])      // ученик на занятую ячейку — добавляется в урок (группа)
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
// «Отменил ученик» (без оплаты) / вернуть — с «Отменить» в тосте
function setCanceled(lesson, sid, on) {
  if (lesson.done) return showToast('Урок проведён — сначала снимите отметку', null, 'bad')
  scheduleStore.setCanceled(lesson, sid, on); haptic('light')
  showToast(on ? `${name(sid)} отменил(а) урок — без оплаты` : `${name(sid)} снова в уроке`, () => scheduleStore.setCanceled(lesson, sid, !on))
}
// Начало внутри часа и заметка: минута — сразу (с «Отменить»), заметка — тихо, коротким тостом
function setDetails(lesson, d) {
  const was = { minute: lesson.minute || 0, note: lesson.note || '' }
  scheduleStore.setDetails(lesson, d); haptic('light')
  if (d.minute !== undefined) showToast(`Начало урока: ${hh(lesson.hour, d.minute)}`, () => scheduleStore.setDetails(lesson, { minute: was.minute }))
  else showToast(d.note.trim() ? 'Заметка сохранена' : 'Заметка удалена', () => scheduleStore.setDetails(lesson, { note: was.note }))
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
          <div class="wh"><div><b>{{ weekTitle(0) }}</b><span>{{ weekRange(w1) }}</span></div><WeekMoney :m="m1" /></div>
          <WeekGrid :dates="w1" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" />
        </div>
        <div class="wcol">
          <div class="wh"><div><b>{{ weekTitle(1) }}</b><span>{{ weekRange(w2) }}</span></div><WeekMoney :m="m2" /></div>
          <WeekGrid :dates="w2" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" />
        </div>
      </div>
    </section>
    <LessonSheet v-if="sheet" :lesson="sheet.lesson" :slot="sheet.slot" @close="sheet = null" @remove="unassign" @done="toggleDone" @open="openStudent" @pick="pick" @students="setStudents" @cancel="setCanceled" @details="setDetails" />
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

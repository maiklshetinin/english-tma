<script setup>
// Главная преподавателя: две недели расписания + список учеников справа. Ученика тянем в ячейку — создаётся урок (сохраняется на сервере).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { nowTick, weekDates, weekRange, slotKey, fmtSlot, hh } from '../../store/app'
import { goUp } from '../../router'
import { setDropHandler } from '../../composables/useDnd'
import { showToast } from '../../composables/useToast'
import { useTelegram } from '../../composables/useTelegram'
import GridStyleButton from '../../components/GridStyleButton.vue'
import WeekGrid from '../../components/WeekGrid.vue'
import StudentsPanel from '../../components/StudentsPanel.vue'
import LessonSheet from '../../components/LessonSheet.vue'
import WeekMoney from '../../components/WeekMoney.vue'
import WeekLoad from '../../components/WeekLoad.vue'
import { sumMoney } from '../../utils/price'
import StudentDetail from './StudentDetail.vue'
import { useStudentsStore } from '../../stores/students'
import { useScheduleStore } from '../../stores/schedule'
const studentStore = useStudentsStore()
const route = useRoute(), router = useRouter()
const scheduleStore = useScheduleStore()
const { haptic } = useTelegram()

// Без листания: сверху всегда текущая неделя, под ней следующая; даты подставляются сами (и обновляются при смене недели)
const w1 = computed(() => (nowTick.value, weekDates(0))), w2 = computed(() => (nowTick.value, weekDates(1)))
// Деньги недели: факт (проведённые) и план (все уроки) — utils/price.ts; меняются сразу при отметке «проведён»
const weekMoney = (dates) => sumMoney(scheduleStore.lessons.filter(l => dates.includes(l.date)), studentStore.byId)
const m1 = computed(() => weekMoney(w1.value)), m2 = computed(() => weekMoney(w2.value))
// Одна таблица: «Эта неделя» или «Следующая» (переключатель над таблицей)
const week = ref(0)
// Урок состоится, если не все его ученики отменили (для спидометра нагрузки)
const activeOf = (l) => !l.studentIds.length || !l.studentIds.every(id => l.canceled?.[id])
const sheet = ref(null)                             // { lesson } | { slot }
const name = (id) => studentStore.findAny(id)?.name
const names = (l) => l.studentIds.map(name).filter(Boolean).join(', ')
const known = (l) => l.studentIds.filter(id => studentStore.byId(id))      // без удалённых / архивных: их id сервер не примет
const occupant = (d, h) => scheduleStore.lessonMap.get(slotKey(d, h))?.[0]

function assign(sid, date, hour) {                  // sid — ученик или список (группа из окна «Кого назначить?»)
  const ids = [].concat(sid)
  const lesson = scheduleStore.create(ids, date, hour); haptic('light')
  showToast(`Урок назначен: ${ids.map(name).join(', ')} · ${fmtSlot(date, hour)}`, () => scheduleStore.remove(lesson))
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
  if (p.kind === 'student') {                         // ученик или группа из панели (ids): только на свободную ячейку
    const ids = p.ids ?? [p.id]
    if (!occ) return assign(ids, t.date, t.hour)
    return showToast('Время занято. Добавить ученика только в этот урок — откройте урок и нажмите «Добавить ученика». В группу — через меню группы в панели', null, 'bad')      // из урока группу не собираем
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
const pick = (sid) => { const { date, hour } = sheet.value.slot; sheet.value = null; if (!occupant(date, hour)) assign(sid, date, hour) }      // sid — id ученика или список (группа)
const openStudent = (id) => { sheet.value = null; router.push({ name: 'home', params: { id } }) }

onMounted(() => { setDropHandler(onDrop); scheduleStore.load().catch(() => {}) })      // при открытии вкладки перечитываем расписание
onUnmounted(() => setDropHandler(null))
watch(() => w1.value[0], () => scheduleStore.load().catch(() => {}))                    // наступила новая неделя: «следующая» стала «текущей», подгружаем новую «следующую»
</script>

<template>
  <StudentDetail v-if="route.params.id" :id="route.params.id" back-label="Главная" @back="goUp(router)" />
  <div v-else class="home">
    <div class="side stick-bg"><StudentsPanel /></div>
    <section class="main">
      <div class="weeks">
        <div class="wcol">
          <div class="wh">
            <div class="seg wk-sw" role="tablist" aria-label="Неделя">
              <button v-for="o in [0, 1]" :key="o" role="tab" :aria-selected="week === o" :class="{ on: week === o }" @click="week = o"><b>{{ o ? 'Следующая' : 'Эта' }}<span class="wfull"> неделя</span></b><small>{{ weekRange(o ? w2 : w1) }}</small></button>
            </div>
            <WeekLoad :lessons="scheduleStore.lessons" :dates="week ? w2 : w1" :active-of="activeOf" />
            <GridStyleButton />
            <WeekMoney class="money" :m="week ? m2 : m1" />
          </div>
          <WeekGrid :dates="week ? w2 : w1" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" />
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
/* Одна таблица; над ней: переключатель недель, спидометр нагрузки, деньги недели */
.weeks { display: grid; gap: 14px; max-width: 900px; margin: 0 auto; width: 100% }
.wk-sw { display: inline-grid; grid-template-columns: 1fr 1fr } .wk-sw button { display: grid; justify-items: start; padding: 5px 12px; line-height: 1.2 }
.wk-sw button b { font-size: 13px; font-weight: 800 } .wk-sw button small { font-size: 11px; font-weight: 700; color: var(--hint-2) }
.wk-sw button.on small { color: var(--blue) }
@media (max-width: 480px) { .wfull { display: none } }
.wcol { display: grid; gap: 6px; min-width: 0 }
.wh { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 0 4px; font-size: 14px; color: var(--hint) }
.wh .money { margin-left: auto }
.wh b { display: block; font-weight: 800; line-height: 1.2 } .wh span { font-size: 13px; font-weight: 700 }
@media (min-width: 1024px) {
  /* Сверху — место под будущую панель (высота шапки, --top-gap); таблица и ученики начинаются на одной линии */
  .home { --top-gap: 72px; grid-template-columns: minmax(0, 1fr) 272px; grid-template-areas: 'main side'; gap: 24px; padding: var(--top-gap) 0 40px; align-items: start }
  .side { position: sticky; top: 12px; max-height: calc(100vh - var(--top-gap) - 16px); padding: 0; background: none; z-index: 1; display: grid; grid-template-rows: minmax(0, 1fr) }
}
</style>

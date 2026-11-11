<script setup>
// Главная преподавателя: две недели расписания + список учеников справа. Ученика тянем в ячейку — создаётся урок (сохраняется на сервере).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { nowTick, weekDates, weekRange, slotKey, fmtSlot, hh, slotPast, nowIn, tz } from '../../store/app'
import { goUp } from '../../router'
import { setDropHandler, pressStart, dnd } from '../../composables/useDnd'
import { STICKERS, lastSticker } from '../../utils/sticker'
import { showToast } from '../../composables/useToast'
import { useTelegram } from '../../composables/useTelegram'
import GridStyleButton from '../../components/GridStyleButton.vue'
import WeekGrid from '../../components/WeekGrid.vue'
import StudentsPanel from '../../components/StudentsPanel.vue'
import LessonSheet from '../../components/LessonSheet.vue'
import WeekMoney from '../../components/WeekMoney.vue'
import WeekLoad from '../../components/WeekLoad.vue'
import { sumMoney, fmtMoney } from '../../utils/price'
import { ask } from '../../composables/useDialog'
import { apiRequest, isDemo } from '../../firebase'
import AppIcon from '../../components/AppIcon.vue'
import BackButton from '../../components/BackButton.vue'
import StudentDetail from './StudentDetail.vue'
import { useStudentsStore } from '../../stores/students'
import { useScheduleStore, needsStatus } from '../../stores/schedule'
const studentStore = useStudentsStore()
const route = useRoute(), router = useRouter()
const scheduleStore = useScheduleStore()
const { haptic } = useTelegram()

// Текущая и следующая недели — «живые» (их отдаёт scheduleStore.load); даты подставляются сами (и обновляются при смене недели)
const w1 = computed(() => (nowTick.value, weekDates(0))), w2 = computed(() => (nowTick.value, weekDates(1)))
// Деньги недели: факт (проведённые) и план (все уроки) — utils/price.ts; меняются сразу при отметке «проведён»
// Деньги недели + доля отмен: сколько мест учеников на уроках недели отменено (в группе — по каждому ученику), в процентах
const weekMoney = (dates) => {
  const ls = scheduleStore.lessons.filter(l => dates.includes(l.date))
  let all = 0, off = 0
  for (const l of ls) for (const id of l.studentIds) { all++; if (l.canceled?.[id]) off++ }
  return { ...sumMoney(ls, studentStore.byId), offPct: all ? Math.round(off / all * 100) : 0, off, all }
}
// Одна таблица и одна плашка недели между «‹» и «›»: стрелки листают по неделе. Назад — сколько угодно, вперёд — до недели,
// в которую попадает последний день текущего месяца (но не меньше чем до следующей); на последней «›» гаснет, но остаётся на месте — шапка не прыгает.
// Плашка голубая только на этой неделе; нажатие на серую возвращает к текущей. Уроки остальных недель подгружаются (scheduleStore.loadWeek).
const week = ref(0)
const shift = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const today = computed(() => nowIn(tz.value, nowTick.value).date)
const monthStart = computed(() => today.value.slice(0, 8) + '01')
const monthEnd = computed(() => today.value.slice(0, 8) + new Date(Date.UTC(+today.value.slice(0, 4), +today.value.slice(5, 7), 0)).getUTCDate())
const monthWeek = computed(() => Math.floor((Date.parse(monthEnd.value) - Date.parse(w1.value[0])) / (7 * 864e5)))      // неделя с последним днём месяца; w1[0] — понедельник этой недели
const maxWeek = computed(() => Math.max(1, monthWeek.value))
const dates = computed(() => week.value === 0 ? w1.value : week.value === 1 ? w2.value : (nowTick.value, weekDates(week.value)))
const weekName = computed(() => { const w = week.value; return w === 0 ? 'Эта неделя' : w === 1 ? 'Следующая' : w === -1 ? 'Прошлая' : w > 1 ? `Через ${w} нед.` : `${-w} нед. назад` })
watch(() => dates.value[0], () => { if (week.value < 0 || week.value > 1) scheduleStore.loadWeek(dates.value[0]).catch(() => {}) })
// Недели после следующей подгружаем заранее: по ним считается «план на месяц» и видно, какие ячейки свободны для автоподстановки
const loadAhead = () => Promise.all(Array.from({ length: Math.max(0, maxWeek.value - 1) }, (_, i) => scheduleStore.loadWeek(shift(w1.value[0], 7 * (i + 2)))))

// «Призраки» следующей недели: уроки этой недели в те же дни и часы, пока на следующей там пусто. В базе их нет —
// нажал на призрака → урок создан; «Подтвердить все» → вся неделя; × → эту подсказку больше не показываем (запоминается на устройстве).
const skipMem = new Map(), skipTick = ref(0)                 // убранные подсказки по неделям: «понедельник» → Set ключей
const skippedOf = (ws) => {
  skipTick.value
  if (!skipMem.has(ws)) { try { skipMem.set(ws, new Set(JSON.parse(localStorage.getItem(`tma.ghostSkip.${ws}`) || '[]'))) } catch { skipMem.set(ws, new Set()) } }
  return skipMem.get(ws)
}
const setSkip = (g, on) => {
  const s = new Set(skippedOf(g.ws)); on ? s.add(g.key) : s.delete(g.key); skipMem.set(g.ws, s); skipTick.value++
  try { localStorage.setItem(`tma.ghostSkip.${g.ws}`, JSON.stringify([...s])) } catch { /* приватный режим */ }
}
// Копии уроков этой недели на неделю k вперёд — только в свободные ячейки.
function copiesOf(k) {
  const ws = shift(w1.value[0], 7 * k), skipped = skippedOf(ws), out = []
  for (const l of scheduleStore.lessons) {
    if (!w1.value.includes(l.date)) continue
    const ids = known(l); if (!ids.length) continue
    const date = shift(l.date, 7 * k), key = `${date}_${l.hour}`
    if (skipped.has(key) || occupant(date, l.hour)) continue
    out.push({ key, ws, date, hour: l.hour, minute: l.minute || 0, studentIds: ids })
  }
  return out
}
const ghosts = computed(() => week.value === 1 ? copiesOf(1) : [])
// «Автоподстановка» (выключатель в шапке, подпись — «авто · до 6 дек»; ТЕСТ, запоминается на устройстве): уроки этой недели сами ставятся
// настоящими уроками на все следующие недели по ту, в которую попадает последний день месяца, — целиком, вместе с её днями следующего месяца
// (в деньги каждый урок идёт по своей дате). Только в свободные ячейки; уроки, которые отменили все ученики, и стикеры не копируются.
// Срабатывает при включении, при открытии «Главной» и когда началась новая неделя. Каждая ячейка подставляется один раз (AUTO_DONE):
// снятый потом урок сам не вернётся. Правки этой недели на уже поставленные уроки не переносятся. Ученики видят эти уроки.
const MON_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const spreadEnd = computed(() => shift(w1.value[0], 7 * monthWeek.value + 6))        // воскресенье последней недели месяца
const spreadTo = computed(() => `до ${+spreadEnd.value.slice(8)} ${MON_GEN[+spreadEnd.value.slice(5, 7) - 1]}`)
const AUTO_KEY = 'tma.autoFill', AUTO_DONE = 'tma.autoFill.done'
const autoFill = ref((() => { try { return localStorage.getItem(AUTO_KEY) === '1' } catch { return false } })())
const setAuto = (on) => { autoFill.value = on; try { localStorage.setItem(AUTO_KEY, on ? '1' : '0') } catch { /* приватный режим — просто не запомним */ } }
let doneMem = null
const doneTick = ref(0)
const doneSet = () => { if (!doneMem) { try { doneMem = new Set(JSON.parse(localStorage.getItem(AUTO_DONE) || '[]')) } catch { doneMem = new Set() } } return doneMem }
const saveDone = (set) => {                                  // прошедшие даты забываем, чтобы список не рос
  doneMem = new Set([...set].filter(k => k.slice(0, 10) >= today.value)); doneTick.value++
  try { localStorage.setItem(AUTO_DONE, JSON.stringify([...doneMem])) } catch { /* приватный режим */ }
}
// all — все ячейки, куда смотрит автоподстановка (и занятые: их тоже помечаем, чтобы потом не подставить заново); todo — что поставить сейчас
const autoPlan = computed(() => {
  doneTick.value
  const done = doneSet(), all = [], todo = []
  for (let k = 1; k <= monthWeek.value; k++) {
    const ws = shift(w1.value[0], 7 * k), skipped = skippedOf(ws)
    for (const l of scheduleStore.lessons) {
      if (!w1.value.includes(l.date)) continue
      const ids = known(l); if (!ids.length || ids.every(id => l.canceled?.[id])) continue
      const date = shift(l.date, 7 * k), key = `${date}_${l.hour}`
      all.push(key)
      if (done.has(key) || skipped.has(key) || occupant(date, l.hour)) continue
      todo.push({ key, ws, date, hour: l.hour, minute: l.minute || 0, studentIds: ids })
    }
  }
  return { all, todo }
})
const ready = ref(false)                                     // расписание и недели впереди загружены — можно подставлять
function runAuto() {
  if (!autoFill.value || !ready.value) return
  const { all, todo } = autoPlan.value
  if (all.some(k => !doneSet().has(k))) saveDone(new Set([...doneSet(), ...all]))
  if (!todo.length) return
  const made = todo.map(g => confirmGhost(g, true)); haptic('light')
  showToast(`Автоподстановка: поставлено уроков — ${made.length}`, () => {      // «Отменить» — снять поставленное и выключить автоподстановку
    made.forEach(l => scheduleStore.remove(l)); const d = new Set(doneSet()); all.forEach(k => d.delete(k)); saveDone(d); setAuto(false)
  })
}
async function toggleAuto() {
  if (autoFill.value) { setAuto(false); haptic('light'); return showToast('Автоподстановка выключена — поставленные уроки остались') }
  const n = autoPlan.value.todo.length, till = `${+spreadEnd.value.slice(8)} ${MONTHS_GEN[+spreadEnd.value.slice(5, 7) - 1]}`
  if (!(await ask('Включить автоподстановку расписания?', { text: `Уроки этой недели будут сами ставиться на следующие недели до конца месяца (сейчас — до ${till}), только в свободное время. ${n ? `Сразу будет поставлено уроков — ${n}. ` : ''}Ученики увидят их в своём расписании.`, ok: 'Включить' }))) return
  setAuto(true); runAuto()
}
const money = computed(() => weekMoney(dates.value))
// «План на месяц»: проведённые (факт) + запланированные уроки текущего месяца.
// Уроки месяца до этой недели — отдельным запросом (GET /lessons/range), остальное — из стора (там свежие правки).
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const monthName = computed(() => MONTHS[+today.value.slice(5, 7) - 1])
const monthPast = ref([])
async function loadMonthPast() {
  const from = monthStart.value, to = shift(w1.value[0], -1)
  if (isDemo || to < from) { monthPast.value = []; return }
  const r = await apiRequest(`/lessons/range?from=${from}&to=${to}`)
  if (r.ok) monthPast.value = await r.json()
}
const monthMoney = computed(() => {
  const m = new Map()
  for (const l of monthPast.value) m.set(l.id, l)
  for (const l of scheduleStore.lessons) if (l.date >= monthStart.value && l.date <= monthEnd.value) m.set(l.id, l)
  return sumMoney([...m.values()], studentStore.byId)
})
function confirmGhost(g, quiet = false) {
  const lesson = scheduleStore.create(g.studentIds, g.date, g.hour)
  if (g.minute) scheduleStore.setDetails(lesson, { minute: g.minute })
  if (!quiet) { haptic('light'); showToast(`Урок поставлен: ${g.studentIds.map(name).join(', ')} · ${fmtSlot(g.date, g.hour)}`, () => scheduleStore.remove(lesson)) }
  return lesson
}
function confirmAll() {
  const made = ghosts.value.map(g => confirmGhost(g, true)); haptic('light')
  showToast(`Поставлено уроков: ${made.length}`, () => made.forEach(l => scheduleStore.remove(l)))
}
function skipGhost(g) { setSkip(g, true); showToast('Подсказка убрана', () => setSkip(g, false)) }
// Урок состоится, если не все его ученики отменили (для спидометра нагрузки)
const activeOf = (l) => !l.studentIds.length || !l.studentIds.every(id => l.canceled?.[id])
const sheet = ref(null)                             // { lesson } | { slot }
const name = (id) => studentStore.findAny(id)?.name
const names = (l) => (l.trial && !l.studentIds.length ? 'Стикер' : l.studentIds.map(name).filter(Boolean).join(', '))
const known = (l) => l.studentIds.filter(id => studentStore.byId(id))      // без удалённых / архивных: их id сервер не примет
const occupant = (d, h) => scheduleStore.lessonMap.get(slotKey(d, h))?.[0]

function assign(sid, date, hour) {                  // sid — ученик или список (группа из окна «Кого назначить?»)
  const ids = [].concat(sid)
  const lesson = scheduleStore.create(ids, date, hour); haptic('light')
  showToast(`Урок назначен: ${ids.map(name).join(', ')} · ${fmtSlot(date, hour)}`, () => scheduleStore.remove(lesson))
}
// Стикер-закладка (в базе — trial): тащим пачку закладок над таблицей в свободную ячейку → приклеивается стикер последнего цвета и сразу открыт для текста
const freshTrial = ref(null)
const grabTrial = (e) => pressStart(e, { kind: 'trial' })
const pack = computed(() => [...STICKERS.filter((s) => s.id !== lastSticker.value).slice(0, 2), STICKERS.find((s) => s.id === lastSticker.value)])      // последний цвет — сверху
function addTrial(date, hour) {
  const l = scheduleStore.createTrial(date, hour, '', lastSticker.value); haptic('light')
  freshTrial.value = l.id
  showToast(`Стикер · ${fmtSlot(date, hour)}`, () => scheduleStore.remove(l))
}
function saveTrial(l, patch) { scheduleStore.setDetails(l, patch) }      // { note?, color? }
function removeTrial(l) {
  const copy = { date: l.date, hour: l.hour, minute: l.minute, note: l.note || '', color: l.color }
  scheduleStore.remove(l); haptic('light')
  showToast('Стикер убран', () => { const n = scheduleStore.createTrial(copy.date, copy.hour, copy.note, copy.color); if (copy.minute) scheduleStore.setDetails(n, { minute: copy.minute }) })
}
function unassign(lesson) {
  if (lesson.trial && !lesson.studentIds.length) return removeTrial(lesson)
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
  if (t.kind === 'panel' || t.kind === 'out') return p.kind === 'lesson' ? unassign(p.lesson) : undefined      // на панель учеников или просто за таблицу — урок снят
  if (t.kind !== 'cell') return
  const occ = occupant(t.date, t.hour)
  if (p.kind === 'trial') {                           // стикер — только на свободное время, не в прошлое
    if (occ) return showToast('Это время занято — приклейте стикер в свободную ячейку', null, 'bad')
    if (slotPast(t.date, t.hour)) return showToast('Это время уже прошло', null, 'bad')
    return addTrial(t.date, t.hour)
  }
  if (p.kind === 'student') {                         // ученик или группа из панели (ids): только на свободную ячейку
    const ids = p.ids ?? [p.id]
    if (!occ) return assign(ids, t.date, t.hour)
    return showToast('Время занято. Добавить ученика только в этот урок — откройте урок и нажмите «Добавить ученика». В группу — через меню группы в панели', null, 'bad')      // из урока группу не собираем
  }
  const a = p.lesson
  if (occ?.id === a.id) return
  if (a.done || occ?.done) return showToast('Проведённый урок нельзя переносить — сначала снимите отметку', null, 'bad')
  const off = (l) => l.studentIds.length > 0 && l.studentIds.every(id => l.canceled?.[id])       // все отменили
  if (off(a) || (occ && off(occ))) return showToast('Отменённый урок нельзя переносить — сначала верните ученика в урок', null, 'bad')
  if (slotPast(t.date, t.hour)) return showToast('Это время уже прошло — урок туда не перенести', null, 'bad')
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
// Уроки, которые прошли, а статуса нет (не «проведён» и не отменён): над таблицей — «Укажите статус · N».
// Нажатие — открыть самый ранний (если он на другой неделе — перейти на неё).
const noStatus = computed(() => { const n = nowIn(tz.value, nowTick.value); return scheduleStore.lessons.filter(l => known(l).length && needsStatus(l, n)).sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour) })
function askStatus() {
  const l = noStatus.value[0]; if (!l) return
  if (!dates.value.includes(l.date)) week.value = Math.floor((Date.parse(l.date) - Date.parse(w1.value[0])) / (7 * 864e5))      // w1[0] — понедельник этой недели
  sheet.value = { lesson: l }
}
const pick = (sid) => { const { date, hour } = sheet.value.slot; sheet.value = null; if (!occupant(date, hour)) assign(sid, date, hour) }      // sid — id ученика или список (группа)
const openStudent = (id) => { sheet.value = null; router.push({ name: 'home', params: { id } }) }

// Расписание и недели впереди; когда всё пришло — автоподстановка (если включена). Не загрузилось — не подставляем: неизвестно, что занято.
const loadAll = () => { ready.value = false; loadMonthPast().catch(() => {}); return Promise.all([scheduleStore.load(), loadAhead()]).then(() => { ready.value = true; runAuto() }).catch(() => {}) }
onMounted(() => { setDropHandler(onDrop); loadAll() })      // при открытии вкладки перечитываем расписание
onUnmounted(() => setDropHandler(null))
watch(week, (w, was) => { if (was < 0) loadMonthPast().catch(() => {}) })                 // вернулись из прошлых недель — там могли править уроки месяца
watch(() => w1.value[0] + monthEnd.value, loadAll)                                      // новая неделя или новый месяц — перечитать и подставить                    // наступила новая неделя: «следующая» стала «текущей», подгружаем новую «следующую»
</script>

<template>
  <StudentDetail v-if="route.params.id" :id="route.params.id" back-label="Главная" @back="goUp(router)" />
  <div v-else class="home">
    <div class="side stick-bg"><StudentsPanel /></div>
    <section class="main">
      <div class="weeks">
        <div class="wcol">
          <div class="wh">
            <BackButton class="wk-back" to="Предыдущая неделя" @click="week--" />
            <button class="wk-now" :class="{ on: week === 0 }" :title="week === 0 ? 'Эта неделя' : 'Вернуться к этой неделе'" @click="week = 0"><b>{{ weekName }}</b><small>{{ weekRange(dates) }}</small></button>
            <button class="icon-btn wk-next" :disabled="week >= maxWeek" :title="week >= maxWeek ? 'Дальше — следующий месяц' : 'Следующая неделя'" aria-label="Следующая неделя" @click="week++"><AppIcon name="back" :size="20" /></button>
            <WeekLoad class="wload" :lessons="scheduleStore.lessons" :dates="dates" :active-of="activeOf" />
            <i class="brk" aria-hidden="true" /><i class="brk b2" aria-hidden="true" />
            <GridStyleButton />
            <button class="trial-pad" :class="{ held: dnd.active && dnd.payload?.kind === 'trial' }" title="Стикер: перетащите в свободную ячейку" aria-label="Стикер: перетащите в ячейку" @pointerdown="grabTrial" @dragstart.prevent><i v-for="(s, k) in pack" :key="s.id" :style="{ '--c': s.c, '--bg': s.bg, left: 8 + k * 6 + 'px', transform: `rotate(${k * 5 - 6}deg)` }" /></button>
            <button class="af-sw" role="switch" :aria-checked="autoFill" :aria-label="`Автоподстановка расписания: ${autoFill ? 'включена' : 'выключена'}`" :title="`Автоподстановка (тест): уроки этой недели сами ставятся на следующие недели до конца месяца (сейчас — ${spreadTo}) — настоящими уроками, только в свободное время. Ученики их видят`" @click="toggleAuto"><i :class="{ on: autoFill }" aria-hidden="true" /><span><b>авто</b><small>{{ spreadTo }}</small></span></button>
            <button v-if="ghosts.length" class="icon-btn gall" :title="`Как на этой неделе: поставить все уроки (${ghosts.length})`" :aria-label="`Поставить все уроки, как на этой неделе: ${ghosts.length}`" @click="confirmAll"><AppIcon name="copy" :size="18" /><i>{{ ghosts.length }}</i></button>
            <button v-if="noStatus.length" class="btn sm ask" title="Эти уроки уже прошли — отметьте: проведён или отменён" @click="askStatus"><i>?</i>Статус · {{ noStatus.length }}</button>
            <WeekMoney class="money" :m="money" />
            <div class="mplan" :title="`План на ${monthName}: проведено ${fmtMoney(monthMoney.real)}, всего с запланированными ${fmtMoney(monthMoney.plan)}`"><b>{{ fmtMoney(monthMoney.plan) }}</b><small>за {{ monthName }}</small></div>
          </div>
          <WeekGrid class="wgrid" :dates="dates" :ghosts="ghosts" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" @ghost="confirmGhost" @ghost-skip="skipGhost"
            :fresh-trial="freshTrial" @trial-edited="freshTrial = null" @trial-save="saveTrial" @trial-remove="removeTrial" />
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
/* Плашка недели между «‹» и «›» — всегда одной ширины (подписи короткие: «Эта неделя», «Следующая», «Через 2 нед.», «2 нед. назад»): ничего не прыгает.
   Голубая — только текущая неделя; серая — вы на другой неделе, нажатие вернёт. «›» — та же стрелка «назад», повёрнутая. */
.wk-back { border-color: var(--border) }
.wk-next { border-color: var(--border) } .wk-next :deep(svg) { transform: rotate(180deg) }
.wk-now { flex: none; width: 116px; height: 40px; display: grid; align-content: center; justify-items: center; padding: 0 6px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); font: inherit; line-height: 1.2; white-space: nowrap; cursor: pointer }
.wk-now b { font-size: 13px; font-weight: 800 } .wk-now small { font-size: 11px; font-weight: 700; color: var(--hint) }
.wk-now.on { background: var(--blue-l); border-color: var(--blue-l); cursor: default } .wk-now.on b, .wk-now.on small { color: var(--blue) }
/* «План на месяц» — в пару к деньгам недели; «авто · до 6 дек» — выключатель автоподстановки расписания (как в iPhone) */
.mplan { flex: none; display: grid; justify-items: end; padding: 4px 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); line-height: 1.15; white-space: nowrap }
.wh .mplan b { font-size: 18px; font-weight: 900; color: var(--text) } .mplan small { font-size: 11px; font-weight: 800; color: var(--hint) }
.af-sw { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 9px 0 7px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: var(--text); font: inherit; line-height: 1.1; white-space: nowrap; cursor: pointer }
.af-sw i { position: relative; flex: none; width: 30px; height: 18px; border-radius: 99px; background: var(--hint-2); transition: background .15s }
.af-sw i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s }
.af-sw i.on { background: var(--blue) } .af-sw i.on::after { transform: translateX(12px) }
.wh .af-sw span { display: grid; justify-items: start } .wh .af-sw b { font-size: 12px; font-weight: 800 } .af-sw small { font-size: 10px; font-weight: 800; color: var(--hint) }
.wcol { display: grid; gap: 6px; min-width: 0 }
.wh { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 0 4px; font-size: 14px; color: var(--hint) }
.wh .money { margin-left: auto }
/* Пачка закладок 40×40 (как «решётка»): три закладки веером, сверху — последний выбранный цвет; тащим её в ячейку */
.trial-pad { position: relative; width: 40px; height: 40px; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--card); font: inherit; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none }
.trial-pad i { position: absolute; top: 7px; width: 12px; height: 25px; border-radius: 2px 2px 3px 3px; background: var(--bg); box-shadow: inset 0 6px 0 var(--c), 0 1px 3px rgba(0, 0, 0, .2); transform-origin: 50% 100% }
.trial-pad:hover { border-color: var(--hint-2) } .trial-pad.held { opacity: .55 }
@media (min-width: 1024px) { .wh > * { flex: none } .af-sw small { display: none } .wh .mplan { margin-left: auto } .wh .money + .mplan { margin-left: 0 } }      /* в одну строку, пока помещается; с «Укажите статус» деньги уходят на вторую — ничего не обрезается */
/* «Как на этой неделе» — маленькая кнопка со значком копирования, число призраков — в уголке */
.gall { position: relative; border-color: var(--border); color: var(--blue) } .gall i { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: var(--blue); color: #fff; font-style: normal; font-size: 11px; font-weight: 900; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px var(--card) }
.ask { display: inline-flex; align-items: center; gap: 6px; background: var(--orange-l); color: var(--orange-d) } .ask i { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--orange); color: #fff; font-style: normal; font-size: 11px; font-weight: 900 }
.wh b { display: block; font-weight: 800; line-height: 1.2 } .wh span { font-size: 13px; font-weight: 700 }
/* Телефон (вариант «Д»): 1-я строка — ‹, недели (кто здесь и заметки — строкой над страницей, PresenceBar); 2-я — приборы-квадраты: часометр, деньги, отмены, вид сетки;
   ниже — ученики (без подписей, компактно); потом таблица */
.brk { display: none }
@media (max-width: 719px) {
  .home { grid-template-areas: 'head' 'side' 'grid'; gap: 0 }
  .main, .weeks, .wcol { display: contents }
  .wh { grid-area: head; padding: 10px 0 2px; gap: 8px 6px }
  .wgrid { grid-area: grid; margin-top: 4px }
  .side { grid-area: side; padding: 4px 0 6px }
  .side :deep(.nm) { display: none }
  .wk-back { order: 1 } .wk-now { order: 2; flex: 1; width: auto; min-width: 0 } .wk-next { order: 3 }
  .brk { display: block; order: 4; flex-basis: 100%; height: 0 } .brk.b2 { order: 7 }
  .wload { order: 5 }
  /* вторая строка: спидометр и три плашки денег (факт недели, отмены, план месяца) — поровну на всю ширину; .money «растворяется», её плашки встают в общий ряд */
  .wh .money { display: contents }
  .wh .money :deep(.top), .wh .money :deep(.lost) { order: 6; flex: 1 0 auto; height: 54px; box-sizing: border-box; display: grid; align-content: center; justify-items: start; padding: 0 10px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); line-height: 1.15; white-space: nowrap }
  .wh .money :deep(b), .wh .money :deep(.lost em) { font-size: 15px; font-weight: 900 } .wh .money :deep(small), .wh .money :deep(.lost) { font-size: 11px }
  .mplan { order: 6; flex: 1 0 auto; height: 54px; box-sizing: border-box; align-content: center; justify-items: start; padding: 0 10px; border-radius: 14px } .wh .mplan b { font-size: 15px }
  /* третья строка: слева «авто» и «Статус», справа — вид таблицы и стикеры */
  .af-sw { order: 8; height: 40px } .ask { order: 9 } .gall { order: 10 } .wh :deep(.gsb) { order: 11; margin-left: auto } .trial-pad { order: 12 }          /* GridStyleButton — без одного корня, поэтому :deep */
}
@media (min-width: 1024px) {
  /* Сверху — место под будущую панель (высота шапки, --top-gap); таблица и ученики начинаются на одной линии */
  .home { --top-gap: 72px; grid-template-columns: minmax(0, 1fr) 272px; grid-template-areas: 'main side'; gap: 24px; padding: var(--top-gap) 0 40px; align-items: start }
  .side { position: sticky; top: 12px; max-height: calc(100vh - var(--top-gap) - 16px); padding: 0; background: none; z-index: 1; display: grid; grid-template-rows: minmax(0, 1fr) }
}
</style>

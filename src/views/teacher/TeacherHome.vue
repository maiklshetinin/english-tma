<script setup>
// Главная преподавателя: две недели расписания + список учеников справа. Ученика тянем в ячейку — создаётся урок (сохраняется на сервере).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { nowTick, weekDates, weekRange, slotKey, fmtSlot, hh, slotPast, nowIn, tz } from '../../store/app'
import { goUp } from '../../router'
import { setDropHandler, pressStart, dnd } from '../../composables/useDnd'
import { STICKERS, lastSticker } from '../../utils/sticker'
import { showToast } from '../../composables/useToast'
import { celebrateDone } from '../../composables/useCelebrate'
import { pushUndo, undo } from '../../composables/useScheduleUndo'
import { useTelegram } from '../../composables/useTelegram'
import GridStyleButton from '../../components/GridStyleButton.vue'
import GhostIcon from '../../components/GhostIcon.vue'
import { ghostIcon, moneyStyle } from '../../utils/gridStyle'
import WeekGrid from '../../components/WeekGrid.vue'
import StudentsPanel from '../../components/StudentsPanel.vue'
import LessonSheet from '../../components/LessonSheet.vue'
import WeekMoney from '../../components/WeekMoney.vue'
import WeekMoneyPair from '../../components/WeekMoneyPair.vue'
import MonthPicker from '../../components/MonthPicker.vue'
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
// Деньги уроков + отмены — одинаково для недели и месяца. Процент отмен — от суммы, как в «Информации» (TeacherInfo → lostPct):
// потеряно / (все уроки + потерянное). off / all — сколько мест учеников отменено (для подсказки).
const moneyOf = (ls) => {
  let all = 0, off = 0
  for (const l of ls) for (const id of l.studentIds) { all++; if (l.canceled?.[id]) off++ }
  const m = sumMoney(ls, studentStore.byId), sum = m.plan + m.lost
  return { ...m, offPct: sum ? Math.round(m.lost / sum * 100) : 0, off, all }
}
const weekMoney = (dates) => moneyOf(scheduleStore.lessons.filter(l => dates.includes(l.date)))
// Одна таблица и одна плашка недели между «‹» и «›»: стрелки листают по неделе. Назад — сколько угодно, вперёд — до недели,
// в которую попадает последний день текущего месяца (но не меньше чем до следующей); на последней «›» гаснет, но остаётся на месте — шапка не прыгает.
// Плашка голубая только на этой неделе; нажатие на серую возвращает к текущей. Уроки остальных недель подгружаются (scheduleStore.loadWeek).
const week = ref(0)
// Календарь месяца (как в Telegram) — по нажатию на плашку недели: выбрать любую неделю, видно заработок за месяц (components/MonthPicker.vue)
const picker = ref(false)
const togglePicker = () => { picker.value = !picker.value }      // попап по центру, с затемнением
function pickWeek(mon) { week.value = Math.round((Date.parse(mon) - Date.parse(w1.value[0])) / (7 * 864e5)); picker.value = false }
const shift = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const today = computed(() => nowIn(tz.value, nowTick.value).date)
const monthStart = computed(() => today.value.slice(0, 8) + '01')
const monthEnd = computed(() => today.value.slice(0, 8) + new Date(Date.UTC(+today.value.slice(0, 4), +today.value.slice(5, 7), 0)).getUTCDate())
const monthWeek = computed(() => Math.floor((Date.parse(monthEnd.value) - Date.parse(w1.value[0])) / (7 * 864e5)))      // неделя с последним днём месяца; w1[0] — понедельник этой недели
// Вперёд планируем на 4 недели (AHEAD): автоподстановка, подсказки, листание. Загружаем и листаем — не меньше, чем до недели с концом месяца:
// по ней считаются деньги месяца (каждый урок идёт в свой месяц по дате)
const AHEAD = 4
const maxWeek = computed(() => Math.max(AHEAD, monthWeek.value))
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
function copiesOf(k, withSkipped = false) {      // withSkipped — и убранные подсказки (для «Вернуть подсказки»)
  const ws = shift(w1.value[0], 7 * k), skipped = skippedOf(ws), out = []
  for (const l of scheduleStore.lessons) {
    if (!w1.value.includes(l.date)) continue
    const ids = known(l); if (!ids.length) continue
    const date = shift(l.date, 7 * k), key = `${date}_${l.hour}`
    if ((!withSkipped && skipped.has(key)) || occupant(date, l.hour)) continue
    out.push({ key, ws, date, hour: l.hour, minute: l.minute || 0, studentIds: ids })
  }
  return out
}
// Подсказки — на всех неделях вперёд, на 4 недели (не только на следующей): пустая неделя сразу видна бледными уроками «как на этой неделе»
const ghostWeek = computed(() => (week.value >= 1 && week.value <= AHEAD ? week.value : 0))
const ghosts = computed(() => ghostWeek.value ? copiesOf(ghostWeek.value) : [])
// Кнопка-привидение в шапке (следующая неделя): видна, когда хоть один урок этой недели не повторён на следующей; число — сколько таких.
// Есть убранные подсказки — нажатие возвращает их все; все видны — прячет (выключатель «показать / скрыть подсказки»). Ctrl+Z — обратно.
const allGhosts = computed(() => ghostWeek.value ? copiesOf(ghostWeek.value, true) : [])
const hiddenGhosts = computed(() => allGhosts.value.filter(g => skippedOf(g.ws).has(g.key)))
function toggleGhosts() {
  const hidden = hiddenGhosts.value, show = hidden.length > 0, gs = show ? hidden : allGhosts.value
  if (!gs.length) return
  const on = () => gs.forEach(g => setSkip(g, !show)), off = () => gs.forEach(g => setSkip(g, show))
  on(); pushUndo({ undo: off, redo: on }); haptic('light')
  showToast(show ? (gs.length > 1 ? `Подсказки возвращены: ${gs.length}` : 'Подсказка возвращена') : `Подсказки скрыты: ${gs.length}`, () => undo())
}
// «Автоподстановка» (выключатель в шапке, подпись — «авто · до 6 дек»; ТЕСТ, запоминается на устройстве): уроки этой недели сами ставятся
// настоящими уроками на все следующие недели по ту, в которую попадает последний день месяца, — целиком, вместе с её днями следующего месяца
// (в деньги каждый урок идёт по своей дате). Только в свободные ячейки; уроки, которые отменили все ученики, и стикеры не копируются.
// Срабатывает при включении, при открытии «Главной» и когда началась новая неделя. Каждая ячейка подставляется один раз (AUTO_DONE):
// снятый потом урок сам не вернётся. Правки этой недели на уже поставленные уроки не переносятся. Ученики видят эти уроки.
const MON_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const spreadEnd = computed(() => shift(w1.value[0], 7 * AHEAD + 6))        // воскресенье 4-й недели вперёд
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
  for (let k = 1; k <= AHEAD; k++) {
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
  // Включаем заново — заполняем все свободные ячейки на 4 недели вперёд, забыв прежние отметки «уже подставляли» (иначе удалённые раньше уроки не вернулись бы)
  { const all = new Set(autoPlan.value.all); saveDone(new Set([...doneSet()].filter(k => !all.has(k)))) }
  const n = autoPlan.value.todo.length, till = `${+spreadEnd.value.slice(8)} ${MONTHS_GEN[+spreadEnd.value.slice(5, 7) - 1]}`
  if (!(await ask('Включить автоподстановку расписания?', { text: `Уроки этой недели будут сами ставиться на 4 недели вперёд (сейчас — до ${till}), только в свободное время. Деньги считаются по месяцам — по дате каждого урока. ${n ? `Сразу будет поставлено уроков — ${n}. ` : ''}Ученики увидят их в своём расписании.`, ok: 'Включить' }))) return
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
  return moneyOf([...m.values()])      // заработано, прогноз и отмены за месяц — в том же виде, что у недели (WeekMoney)
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
// Удалить выделенное в таблице (выделение рамкой / Shift, как в Figma): запланированные уроки снимаются, призраки убираются.
// Отмена — Ctrl+Z, пункт меню или «Отменить» в тосте (один стек, composables/useScheduleUndo.js): уроки встают на те же места, с минутами и заметкой.
function removeMany({ lessons, ghosts }) {
  let live = lessons.filter(l => !l.done)
  const copies = live.map(l => ({ studentIds: [...l.studentIds], date: l.date, hour: l.hour, minute: l.minute, note: l.note }))
  const drop = () => { for (const l of live) if (!l.done && scheduleStore.lessons.includes(l)) scheduleStore.remove(l); for (const g of ghosts) setSkip(g, true) }
  const back = () => {
    live = []
    for (const c of copies) {
      if (occupant(c.date, c.hour)) continue      // место уже заняли — туда не возвращаем
      const l = scheduleStore.create(c.studentIds, c.date, c.hour)
      if (c.minute || c.note) scheduleStore.setDetails(l, { ...(c.minute ? { minute: c.minute } : {}), ...(c.note ? { note: c.note } : {}) })
      live.push(l)
    }
    for (const g of ghosts) setSkip(g, false)
  }
  drop(); pushUndo({ undo: back, redo: drop }); haptic('light')
  const n = copies.length, m = ghosts.length
  const text = n && m ? `Удалено: уроков ${n}, подсказок ${m}` : n ? (n > 1 ? `Сняты уроки: ${n}` : `Урок снят: ${names(copies[0])}`) : (m > 1 ? `Подсказки убраны: ${m}` : 'Подсказка убрана')
  showToast(text, () => undo())
}
// Перенести выделенное разом (тянули за голубую маску выделения): сдвиг по дням и часам уже проверен в таблице (WeekGrid).
// Уроки переносятся (порядок — чтобы урок не вставал на ещё занятое место); призрак на новом месте становится уроком, его подсказка убирается.
// Ctrl+Z / «Отменить» в тосте — всё обратно: созданные из призраков уроки снимаются, подсказки возвращаются, уроки — на прежние места.
function moveMany({ moves, ghosts = [] }) {
  const was = moves.map(m => ({ lesson: m.lesson, date: m.lesson.date, hour: m.lesson.hour }))
  let made = []
  const go = () => {
    for (const m of moves) scheduleStore.move(m.lesson, m.date, m.hour)
    made = ghosts.map(({ ghost: g, date, hour }) => {
      const l = scheduleStore.create(g.studentIds, date, hour)
      if (g.minute) scheduleStore.setDetails(l, { minute: g.minute })
      setSkip(g, true); return l
    })
  }
  const back = () => {
    for (const l of made) if (scheduleStore.lessons.includes(l) && !l.done) scheduleStore.remove(l)
    for (const { ghost: g } of ghosts) setSkip(g, false)
    for (const m of [...was].reverse()) scheduleStore.move(m.lesson, m.date, m.hour)
  }
  go(); pushUndo({ undo: back, redo: go }); haptic('light')
  const n = moves.length + ghosts.length, one = moves[0] ?? ghosts[0]
  showToast(n > 1 ? `Перенесено: ${n}` : `${moves.length ? 'Урок перенесён' : 'Урок поставлен'}: ${names(one.lesson ?? one.ghost)} · ${fmtSlot(one.date, one.hour)}`, () => undo())
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
  scheduleStore.setDone(lesson, !was); sheet.value = null; haptic(was ? 'light' : 'medium')
  if (!was) celebrateDone(lesson)      // карточка подпрыгивает, «+сумма», деньги досчитываются (composables/useCelebrate.js)
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
// Шапка недели на компьютере (18.11.2026): сама меряет, влезает ли в строку, и сжимается по шагам — без угадывания ширин.
// 0 — всё как есть; 1 — без подписей «авто» и «Статус»; 2 — деньги коротко (без «из …» и потерь, они в подсказке); 3 — деньги второй строкой, обе рядом
const whEl = ref(null), whLv = ref(0)
let whRaf = 0, whRo = null, whMo = null
function fitWh() {
  whRaf = 0; const el = whEl.value; if (!el) return
  if (innerWidth < 1024) { whLv.value = 0; delete el.dataset.lv; return }
  let lv = 0
  for (; lv < 3; lv++) { if (lv) el.dataset.lv = lv; else delete el.dataset.lv; if (el.scrollWidth <= el.clientWidth + 1) break }
  el.dataset.lv = lv; whLv.value = lv
}
const refitWh = () => { if (!whRaf) whRaf = requestAnimationFrame(fitWh) }
onMounted(() => {
  if (!whEl.value) return
  whRo = new ResizeObserver(refitWh); whRo.observe(whEl.value)
  whMo = new MutationObserver(refitWh); whMo.observe(whEl.value, { childList: true, subtree: true, characterData: true })          // появились «Как на этой неделе», привидение, «Статус»
  refitWh()
})
onUnmounted(() => { whRo?.disconnect(); whMo?.disconnect(); cancelAnimationFrame(whRaf) })
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
          <div ref="whEl" class="wh" :data-lv="whLv || null">
            <BackButton class="wk-back" to="Предыдущая неделя" @click="week--" />
            <button class="wk-now" :class="{ on: week === 0, open: !!picker }" :aria-expanded="!!picker" title="Календарь: выбрать неделю, заработок за месяц" @click="togglePicker"><b>{{ weekName }}</b><small>{{ weekRange(dates) }}</small></button>
            <MonthPicker v-if="picker" :selected="dates[0]" :this-week="w1[0]" :max-monday="shift(w1[0], 7 * maxWeek)" :today="today" @pick="pickWeek" @close="picker = false" />
            <button class="icon-btn wk-next" :disabled="week >= maxWeek" :title="week >= maxWeek ? 'Дальше пока не планируем' : 'Следующая неделя'" aria-label="Следующая неделя" @click="week++"><AppIcon name="back" :size="20" /></button>
            <WeekLoad class="wload" :lessons="scheduleStore.lessons" :dates="dates" :active-of="activeOf" />
            <i class="brk" aria-hidden="true" /><i class="brk b2" aria-hidden="true" />
            <GridStyleButton :auto="autoFill" :auto-to="spreadTo" :week="money" :month="monthMoney" :month-label="monthName" @auto="toggleAuto" />      <!-- в меню решётки — и «Автоподстановка» (19.11.2026: убрали кнопку «авто» из шапки) -->
            <button class="trial-pad" :class="{ held: dnd.active && dnd.payload?.kind === 'trial' }" title="Стикер: перетащите в свободную ячейку" aria-label="Стикер: перетащите в ячейку" @pointerdown="grabTrial" @dragstart.prevent><i v-for="(s, k) in pack" :key="s.id" :style="{ '--c': s.c, '--bg': s.bg, left: 8 + k * 6 + 'px', transform: `rotate(${k * 5 - 6}deg)` }" /></button>
            <button v-if="ghosts.length" class="icon-btn gall" :title="`Как на этой неделе: поставить все уроки (${ghosts.length})`" :aria-label="`Поставить все уроки, как на этой неделе: ${ghosts.length}`" @click="confirmAll"><AppIcon name="copy" :size="18" /><i>{{ ghosts.length }}</i></button>
            <button v-if="allGhosts.length" class="icon-btn gall gback" :class="{ on: !hiddenGhosts.length }" :aria-pressed="!hiddenGhosts.length"
              :title="hiddenGhosts.length ? `Вернуть подсказки (${hiddenGhosts.length}) — бледные уроки «как на этой неделе»` : `Скрыть подсказки (${allGhosts.length})`" :aria-label="hiddenGhosts.length ? `Вернуть подсказки: ${hiddenGhosts.length}` : `Скрыть подсказки: ${allGhosts.length}`" @click="toggleGhosts">
              <GhostIcon :variant="ghostIcon" :size="28" /><i>{{ hiddenGhosts.length || allGhosts.length }}</i></button>
            <button v-if="noStatus.length" class="btn sm ask" title="Эти уроки уже прошли — отметьте: проведён или отменён" @click="askStatus"><i>?</i><span class="askt">Статус · </span>{{ noStatus.length }}</button>
            <i class="whbr" aria-hidden="true" />
            <WeekMoneyPair v-if="moneyStyle === 'one'" class="money" :week="money" :month="monthMoney" :month-label="monthName" />      <!-- «Вид сетки» → «Деньги»: одна плашка -->
            <template v-else><WeekMoney class="money" :m="money" /><WeekMoney class="money" :m="monthMoney" :label="monthName" /></template>
          </div>
          <WeekGrid class="wgrid" :dates="dates" :ghosts="ghosts" @cell="sheet = { slot: $event }" @lesson="sheet = { lesson: $event }" @ghost="confirmGhost" @ghost-skip="skipGhost" @remove-many="removeMany" @move-many="moveMany"
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
.weeks { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; max-width: 900px; margin: 0 auto; width: 100% }
/* Плашка недели между «‹» и «›» — всегда одной ширины (подписи короткие: «Эта неделя», «Следующая», «Через 2 нед.», «2 нед. назад»): ничего не прыгает.
   Голубая — только текущая неделя; серая — вы на другой неделе, нажатие вернёт. «›» — та же стрелка «назад», повёрнутая. */
.wk-back { border-color: var(--border) }
.wk-next { border-color: var(--border) } .wk-next :deep(svg) { transform: rotate(180deg) }
.wk-now { flex: none; width: 116px; height: 40px; display: grid; align-content: center; justify-items: center; padding: 0 6px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); font: inherit; line-height: 1.2; white-space: nowrap; cursor: pointer }
.wk-now b { font-size: 13px; font-weight: 800 } .wk-now small { font-size: 11px; font-weight: 700; color: var(--hint) }
.wk-now.on { background: var(--blue-l); border-color: var(--blue-l) } .wk-now:hover, .wk-now.open { border-color: var(--blue) }      /* нажатие — календарь месяца */ .wk-now.on b, .wk-now.on small { color: var(--blue) }
/* Деньги недели и месяца — WeekMoney, одинаковые плашки. Выключатель автоподстановки — в меню решётки (GridStyleButton) */
.wcol { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-width: 0 }
/* 19.11.2026: колонка не шире своего места. Раньше появлялись «Как на этой неделе» / привидение — шапка в одну строку становилась шире,
   общая колонка расширялась под неё, и таблица прыгала вправо, к ученикам (а сжатие шапки fitWh не срабатывало: колонка росла вместе с ней) */
.wh { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; min-width: 0; padding: 0 4px; font-size: 14px; color: var(--hint) }
.wh .money { margin-left: auto } .wh .money + .money { margin-left: 0 }
/* Пачка закладок 40×40 (как «решётка»): три закладки веером, сверху — последний выбранный цвет; тащим её в ячейку */
.trial-pad { position: relative; width: 40px; height: 40px; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--card); font: inherit; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none }
.trial-pad i { position: absolute; top: 7px; width: 12px; height: 25px; border-radius: 2px 2px 3px 3px; background: var(--bg); box-shadow: inset 0 6px 0 var(--c), 0 1px 3px rgba(0, 0, 0, .2); transform-origin: 50% 100% }
.trial-pad:hover { border-color: var(--hint-2) } .trial-pad.held { opacity: .55 }
@media (min-width: 1024px) { .wh { flex-wrap: nowrap; gap: 8px } .wh > * { flex: none } .wh .wk-now { flex: 0 1 116px; min-width: 96px } }      /* на компьютере шапка всегда в одну строку: если тесно, сжимается плашка недели */
/* 18.11.2026: с «Как на этой неделе», привидением и «Статус» шапка не влезала и уезжала под учеников. Тесно — прячем подписи «авто» и «Статус» (остаются выключатель и «?1»); совсем тесно — деньги переходят на вторую строку, а не наезжают */
.wh .whbr { display: none }
@media (min-width: 1024px) {
  .wh[data-lv] .askt { display: none }
  .wh[data-lv="2"] .money :deep(small), .wh[data-lv="2"] .money :deep(.lost), .wh[data-lv="3"] .money :deep(.lost) { display: none }
  .wh[data-lv="3"] { flex-wrap: wrap; row-gap: 8px } .wh[data-lv="3"] .whbr { display: block; flex: 0 0 100%; height: 0 }
  .wh[data-lv="3"] .money { flex: 1 1 0; min-width: 0; margin-left: 0 }          /* вторая строка — обе суммы рядом, поровну */
}
/* «Как на этой неделе» — маленькая кнопка со значком копирования, число призраков — в уголке */
.gall { position: relative; border-color: var(--border); color: var(--blue) }
/* Кнопка-привидение (подсказки следующей недели): тёмная простыня со светлыми глазами; подсказки видны — голубая подложка; часть убрана — серый счётчик */
.gback { display: grid; place-items: center; --gi-bg: var(--card) }      /* значок — components/GhostIcon.vue, вариант выбирается в меню «Вид сетки» */
.gback i { background: var(--hint-2) } .gback.on { background: var(--blue-l); border-color: var(--blue-l) } .gback.on i { background: var(--blue) } .gback.on { --gi-bg: var(--blue-l) } .gall i { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: var(--blue); color: #fff; font-style: normal; font-size: 11px; font-weight: 900; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px var(--card) }
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
  /* 21.11.2026: шапка на телефоне в две строки вместо трёх, всё по 40–42px — до таблицы почти вдвое меньше места.
     1-я строка: ‹ неделя › · «? 23» · «Как на этой неделе» · вид таблицы · стикеры; 2-я — спидометр и деньги недели и месяца */
  .ask { order: 4; height: 40px; padding: 0 10px } .ask .askt { display: none }
  .gall { order: 5 } .wh :deep(.gsb) { order: 6 } .trial-pad { order: 6 }          /* GridStyleButton — без одного корня, поэтому :deep */
  .brk { display: block; order: 7; flex-basis: 100%; height: 0 } .brk.b2 { display: none }
  .wload { order: 8 } .wload :deep(.g) { width: 44px; height: 42px; padding: 2px; border-radius: 12px } .wload :deep(.g svg) { width: 34px; height: 18px } .wload :deep(.v b) { font-size: 13px }
  .wh .money { order: 9; flex: 1 1 0; min-width: 0; height: 42px; min-height: 0; box-sizing: border-box; align-content: center; padding: 2px 9px; border-radius: 12px }
  .wh .money :deep(.top) { justify-self: start; gap: 4px } .wh .money :deep(b) { font-size: 14px } .wh .money :deep(small) { font-size: 10.5px }
  .wh .money :deep(.bar) { height: 3px; margin: 2px 0 } .wh .money :deep(.bot) { font-size: 10px }
}
@media (min-width: 1024px) {
  /* Сверху — место под будущую панель (высота шапки, --top-gap); таблица и ученики начинаются на одной линии */
  .home { --top-gap: 8px; grid-template-columns: minmax(0, 1fr) 272px; grid-template-areas: 'main side'; gap: 24px; padding: var(--top-gap) 0 40px; align-items: start }
  .weeks { margin: 0 0 0 auto }          /* 18.11.2026: таблица прижата к ученикам — расстояние всегда 24px; по центру оно «прыгало», когда менялась ширина (появилась прокрутка / уведомление «Отменить») */
  .side { position: sticky; top: 12px; max-height: calc(100vh - var(--top-gap) - 16px); padding: 0; background: none; z-index: 1; display: grid; grid-template-rows: minmax(0, 1fr) }
}
</style>

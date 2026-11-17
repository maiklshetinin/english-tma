<script setup>
// Одна неделя: время × дни. Ячейка — цель для drop, урок — «чип» (аватарка ученика), который можно тащить дальше.
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { undo, redo, undoN, redoN, ctrlKey } from '../composables/useScheduleUndo'
import { HOURS, DAYS, hh, slotKey, nowTick, nowIn, tz, setTz, tzShort, TIMEZONES, slotPast } from '../store/app'
import { dnd, pressStart, outOfTable } from '../composables/useDnd'
import { gridStyle, gridFrame, lessonStyle, pastShade } from '../utils/gridStyle'
import TrialSticker from './TrialSticker.vue'
import Avatar from './Avatar.vue'
import { sumMoney, fmtMoney, lessonMoney } from '../utils/price'
import { doneBurst, reducedMotion } from '../composables/useCelebrate'
// На телефоне суммы дня короче: 2 200 → «2,2к», 950 → «950»
const kShort = (n) => (n >= 1000 ? String(Math.round(n / 100) / 10).replace('.', ',') + 'к' : String(n || 0))
import AvatarStack from './AvatarStack.vue'
import { useStudentsStore } from '../stores/students'
import { useScheduleStore, needsStatus } from '../stores/schedule'
const studentStore = useStudentsStore()
const scheduleStore = useScheduleStore()
// freshTrial — id только что приклеенного стикера: он сразу открывается для текста
const props = defineProps({ dates: { type: Array, required: true }, ghosts: { type: Array, default: () => [] }, freshTrial: { type: String, default: null } })
const emit = defineEmits(['cell', 'lesson', 'ghost', 'ghost-skip', 'remove-many', 'move-many', 'trial-save', 'trial-remove', 'trial-edited'])
// «Призраки» на следующей неделе — уроки этой недели в тех же днях и часах, пока не подтверждены (в базе их нет)
const ghostMap = computed(() => new Map(props.ghosts.map(g => [slotKey(g.date, g.hour), g])))
const ghostAt = (d, h) => (at(d, h).length ? null : ghostMap.value.get(slotKey(d, h)))
const ghostStu = (g) => g.studentIds.map(stu).filter(Boolean)
// «Сейчас»: сегодняшний день и текущий час (обновляется раз в минуту). Подсвечивается только в той таблице, где есть сегодняшний день.
// «Сейчас» — по выбранному поясу (уголок таблицы), а не по часам компьютера; минуты идут в метке текущего часа и линией в ячейке
const now = computed(() => nowIn(tz.value, nowTick.value))
const hasToday = computed(() => props.dates.includes(now.value.date))
const rowNow = (h) => hasToday.value && h === now.value.hour
const cellNow = (d, h) => d === now.value.date && h === now.value.hour
const stu = (id) => studentStore.findAny(id)                               // и архивные: в проведённых уроках они остаются (серые, «в архиве»)
const at = (d, h) => scheduleStore.lessonMap.get(slotKey(d, h)) ?? []
// Деньги дня: факт — проведённые уроки (зафиксированные цены), план — все уроки дня (utils/price.ts)
const moneyByDay = computed(() => Object.fromEntries(props.dates.map(d => [d, sumMoney(scheduleStore.lessons.filter(l => l.date === d), studentStore.byId)])))
const money = (d) => moneyByDay.value[d]

function dropState(d, h) {                       // подсветка ячейки под призраком: ok / swap / bad (в обеих таблицах одинаково)
  const o = dnd.over
  if (!dnd.active || o?.kind !== 'cell' || o.date !== d || o.hour !== h) return ''
  const occ = at(d, h)[0], p = dnd.payload
  if (p.kind === 'lesson') return occ?.id === p.lesson.id ? '' : slotPast(d, h, now.value) || occ?.done || (occ && allOff(occ)) ? 'bad' : occ ? 'swap' : 'ok'      // в прошлое не переносим
  if (p.kind === 'trial') return occ || slotPast(d, h, now.value) ? 'bad' : 'ok'      // стикер — на свободное будущее время
  if (!occ) return 'ok'
  return 'bad'      // ученик / группа — только на свободную ячейку: из урока группу не собираем
}
// Ученики урока, которые есть в списке. Ученика могли удалить из базы или архивировать — его id остаётся в уроке, но показывать некого.
const group = (l) => l.studentIds.map(stu).filter(Boolean)                 // участники группы — аватарки внахлёст (AvatarStack)
const isGroup = (l) => group(l).length > 1
const ringOf = () => 'var(--card)'                 // кольцо стопки аватарок — цвет фона под уроком
const orphan = (l) => !l.trial && !group(l).length                                      // урок, в котором не осталось известных учеников: показываем серым «?», чтобы его можно было убрать
// «Отменил ученик»: все отменили — карточка красная и зачёркнутая; в группе часть — красный значок «✕N»
const offCount = (l) => group(l).filter(s => l.canceled?.[s.id]).length
const allOff = (l) => !l.trial && !orphan(l) && offCount(l) === group(l).length
const goneName = (l) => Object.values(l.names ?? {})[0] ?? ''             // имя удалённого навсегда (у проведённых уроков)
const lifted = (l) => dnd.active && dnd.payload?.kind === 'lesson' && dnd.payload.lesson.id === l.id
const down = (e, l) => { if (!l.done && !allOff(l) && !orphan(l)) pressStart(e, { kind: 'lesson', lesson: l }) }      // проведённый, отменённый (и «пустой») урок не перетаскиваем
// Подпись урока: ученик или участники группы; у «пустого» урока — подсказка, что его ученика больше нет
const first = (l) => group(l)[0]
const label = (l) => allOff(l) ? `Отменил ученик: ${group(l).map(s => s.name).join(', ')}, ${hh(l.hour, l.minute)} — без оплаты` : orphan(l) ? (goneName(l) ? `${goneName(l)} (удалён), ${hh(l.hour, l.minute)}` : `Урок без ученика (удалён или в архиве), ${hh(l.hour, l.minute)} — нажмите, чтобы убрать`) : isGroup(l) ? `Группа: ${group(l).map(s => s.name).join(', ')}, ${hh(l.hour, l.minute)}` : `${first(l).name}, ${hh(l.hour, l.minute)}`
const clickCell = (d, h) => { if (skipClick) { skipClick = false; return } clearSel(); if (!at(d, h).length) emit('cell', { date: d, hour: h }) }
// Урок закончился, а статуса нет — оранжевый «?» в углу (stores/schedule → needsStatus)
const unknown = (l) => !orphan(l) && needsStatus(l, now.value)
// «Урок проведён»: карточка подпрыгивает, над ней всплывает «+сумма», сумма дня мигает зелёным (composables/useCelebrate.js)
const burst = ref(null)
let burstT
watch(doneBurst, (b) => {
  if (!b || !props.dates.includes(b.date) || reducedMotion()) return
  const l = scheduleStore.lessons.find(x => x.id === b.id)
  const m = money(b.date)      // последний урок дня закрыт — весь день оплачен: сумма дня зеленеет, подпрыгивает и по ней пробегает блеск
  burst.value = { ...b, amount: l ? lessonMoney(l, studentStore.byId).real : 0, full: m.plan > 0 && m.real === m.plan }
  clearTimeout(burstT); burstT = setTimeout(() => { burst.value = null }, 1900)
})
const popping = (l) => burst.value?.id === l.id
// Как в Figma: выделение (16.11.2026). Выделяются только запланированные уроки (голубые) и призраки — их можно разом удалить.
// Нажатие — выделить урок (синяя рамка), двойное — открыть карточку. Shift / Ctrl / ⌘ + нажатие — добавить или убрать из выделения.
// Мышью от пустого места — тянется рамка, всё, что она задела, выделяется (с Shift / Ctrl / ⌘ — добавляется к выделенному).
// Delete / Backspace — удалить выделенное (уроки сняты, призраки убраны; в тосте «Отменить»). Правая кнопка — меню. Enter — открыть, Esc — снять.
const sel = ref([])      // id уроков и 'g:<ключ>' призраков
const selSet = computed(() => new Set(sel.value))
const pickable = (l) => !l.trial && !l.done && !allOff(l) && !orphan(l)      // запланированный: проведённые, отменённые, «пустые» и стикеры не выделяются
const gk = (g) => 'g:' + g.key
const isSel = (l) => selSet.value.has(l.id)
const isSelG = (g) => selSet.value.has(gk(g))
const clearSel = () => { if (sel.value.length) sel.value = [] }
const toggle = (k) => { sel.value = selSet.value.has(k) ? sel.value.filter(x => x !== k) : [...sel.value, k] }
const multi = (e) => e && (e.shiftKey || e.ctrlKey || e.metaKey)
watch(() => props.dates.join(), () => { clearSel(); menu.value = null })      // другая неделя — выделение снимаем
// Что выделено сейчас (уроки могли удалить или отметить проведёнными — такие отпадают)
function picked() {
  const ls = scheduleStore.lessons.filter(l => selSet.value.has(l.id) && pickable(l))
  const gs = props.ghosts.filter(g => selSet.value.has(gk(g)))
  return { lessons: ls, ghosts: gs }
}
function removeSel() {
  const p = picked(); menu.value = null
  if (!p.lessons.length && !p.ghosts.length) return
  sel.value = []; emit('remove-many', p)
}
let last = { id: null, t: 0 }
function tapLesson(l, e) {
  if (orphan(l)) { emit('lesson', l); return }      // «пустой» урок — сразу открыть, чтобы убрать
  if (multi(e)) { if (pickable(l)) toggle(l.id); return }
  const t = Date.now()
  if (last.id === l.id && t - last.t < 450) { last = { id: null, t: 0 }; clearSel(); emit('lesson', l); return }
  last = { id: l.id, t }; sel.value = pickable(l) ? [l.id] : []
}
// Призрак: обычное нажатие — как раньше, поставить урок; с Shift / Ctrl / ⌘ — выделить
function tapGhost(g, e) { if (multi(e)) { toggle(gk(g)); return } clearSel(); emit('ghost', g) }
// ── Рамка выделения (только мышь: на телефоне палец листает страницу) ──
const wk = ref(null)
const box = ref(null)      // { x, y, w, h } — в координатах таблицы
let mq = null, skipClick = false
function mqDown(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || dnd.active) return
  if (e.target.closest?.('.chip, .corner, .gx, .selbox, button, select, input, textarea, [contenteditable]')) return
  const cell = e.target.closest?.('.cell'); if (cell && !cell.classList.contains('free')) return      // со стикера / из занятой ячейки рамку не тянем
  e.preventDefault()      // не выделять текст при протягивании
  mq = { x: e.clientX, y: e.clientY, base: multi(e) ? [...sel.value] : [], on: false }
  addEventListener('pointermove', mqMove); addEventListener('pointerup', mqUp, { once: true })
}
function mqMove(e) {
  if (!mq) return
  if (!mq.on && Math.hypot(e.clientX - mq.x, e.clientY - mq.y) < 5) return
  mq.on = true; e.preventDefault()
  const r = wk.value.getBoundingClientRect()
  const x1 = Math.min(mq.x, e.clientX), x2 = Math.max(mq.x, e.clientX), y1 = Math.min(mq.y, e.clientY), y2 = Math.max(mq.y, e.clientY)
  box.value = { x: x1 - r.left, y: y1 - r.top, w: x2 - x1, h: y2 - y1 }
  const hit = []
  for (const el of wk.value.querySelectorAll('[data-pick]')) {
    const b = el.getBoundingClientRect()
    if (b.right > x1 && b.left < x2 && b.bottom > y1 && b.top < y2) hit.push(el.dataset.pick)
  }
  sel.value = [...new Set([...mq.base, ...hit])]
}
function mqUp() {
  removeEventListener('pointermove', mqMove)
  if (mq?.on) { skipClick = true; setTimeout(() => { skipClick = false }, 0) }      // отпустили над ячейкой — не создавать урок
  mq = null; box.value = null
}
// ── Контекстное меню (правая кнопка) ──
const menu = ref(null)      // { x, y, lesson?, ghost? }
function ctx(e, l, g) {
  if (e.pointerType === 'touch') return
  e.preventDefault()
  const k = l ? (pickable(l) ? l.id : null) : gk(g)
  if (k && !selSet.value.has(k)) sel.value = [k]
  if (!k && l) sel.value = []
  menu.value = { x: Math.min(e.clientX, innerWidth - 270), y: Math.min(e.clientY, innerHeight - 220), lesson: l, ghost: g }
}
function ctxBg(e) { if (e.pointerType === 'touch') return; e.preventDefault(); menu.value = { x: Math.min(e.clientX, innerWidth - 270), y: Math.min(e.clientY, innerHeight - 220) } }
const selCount = computed(() => { const p = picked(); return p.lessons.length + p.ghosts.length })
const delLabel = computed(() => (selCount.value > 1 ? `Удалить · ${selCount.value}` : 'Удалить'))
const cmDo = (f) => { menu.value = null; f() }
const menuUndo = () => { undo(); sel.value = [] }, menuRedo = () => { redo(); sel.value = [] }
const menuOpen = () => { const m = menu.value; menu.value = null; clearSel(); if (m?.ghost) emit('ghost', m.ghost); else if (m?.lesson) emit('lesson', m.lesson) }
const offChip = (e) => {
  if (menu.value && !e.target.closest?.('.cmenu')) menu.value = null
  if (sel.value.length && !multi(e) && e.button !== 2 && !e.target.closest?.('.chip, .cmenu, .selbox')) sel.value = []      // правая кнопка — выделение остаётся (для меню)
}
const onKey = (e) => {
  if (menu.value && e.key === 'Escape') { menu.value = null; return }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !document.querySelector('.sheet-bg')) {      // Ctrl+Z / Ctrl+Shift+Z (и Ctrl+Y) — история удалений
    if (e.shiftKey ? redo() : undo()) { e.preventDefault(); sel.value = [] } return
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY' && !document.querySelector('.sheet-bg')) { if (redo()) { e.preventDefault(); sel.value = [] } return }
  if (!sel.value.length) return
  if (e.key === 'Escape') sel.value = []
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel() }
  else if (e.key === 'Enter' && sel.value.length === 1) { const l = scheduleStore.lessons.find(x => x.id === sel.value[0]); if (l) { e.preventDefault(); sel.value = []; emit('lesson', l) } }
}
const closeMenu = () => { menu.value = null }
// ── Тянуть выделенное за маску (как в конструкторе курсов): всё выделенное едет вместе, со сдвигом по дням и часам ──
// Уроки переносятся; призрак на новом месте становится настоящим уроком (а подсказка со старого места убирается).
// Нельзя: за пределы недели / часов, в прошлое, на места, занятые невыделенными уроками — рамка краснеет. За таблицу — удалить.
// Быстро: клетки меряем один раз в начале, при движении двигаем только картинку (CSS-переменные, раз в кадр) — таблица не перерисовывается.
const dragging = ref(false)      // один раз в начале и в конце: класс .gdrag (уроки не обрезаются, выделенные едут)
const gstate = ref('')           // '' | 'bad' | 'out' — меняется только при смене состояния
let gs = null, graf = 0
function maskDown(e) {
  if (e.button !== 0) return
  e.preventDefault(); e.stopPropagation(); menu.value = null
  const cells = [...wk.value.querySelectorAll('[data-drop="cell"]')].map(el => ({ b: el.getBoundingClientRect(), date: el.dataset.date, hour: +el.dataset.hour }))
  const hit = (x, y) => cells.find(c => x >= c.b.left && x < c.b.right && y >= c.b.top && y < c.b.bottom) ?? null
  const p = picked()
  gs = { x: e.clientX, y: e.clientY, hit, c: hit(e.clientX, e.clientY), on: false, plan: null, out: false, ls: p.lessons, gh: p.ghosts, ids: new Set(p.lessons.map(l => l.id)), key: '' }
  addEventListener('pointermove', maskMove); addEventListener('pointerup', maskUp, { once: true })
}
function planMove(c) {
  const D = props.dates, di = D.indexOf(c.date) - D.indexOf(gs.c.date), hi = HOURS.indexOf(c.hour) - HOURS.indexOf(gs.c.hour)
  const to = (x) => ({ date: D[D.indexOf(x.date) + di], hour: HOURS[HOURS.indexOf(x.hour) + hi] })
  const moves = gs.ls.map(l => ({ lesson: l, ...to(l) })), ghosts = gs.gh.map(g => ({ ghost: g, ...to(g) }))
  const free = (m) => m.date && m.hour != null && !slotPast(m.date, m.hour, now.value) && at(m.date, m.hour).every(o => gs.ids.has(o.id))
  const ok = !!(di || hi) && moves.length + ghosts.length > 0 && moves.every(free) && ghosts.every(free)
  const k = (m) => D.indexOf(m.date) * 100 + HOURS.indexOf(m.hour)
  moves.sort((a, b) => (di * 100 + hi > 0 ? k(b) - k(a) : k(a) - k(b)))      // по порядку, чтобы урок не вставал на место, которое ещё не освободилось
  return { moves, ghosts, ok }
}
// Уроки едут за курсором плавно (--gdx/--gdy), а рамка выделения прыгает по клеткам — показывает, куда встанут (--gtx/--gty)
function setG(dx, dy, st, tx = dx, ty = dy) {
  const el = wk.value; if (!el) return
  el.style.setProperty('--gdx', dx + 'px'); el.style.setProperty('--gdy', dy + 'px')
  el.style.setProperty('--gtx', tx + 'px'); el.style.setProperty('--gty', ty + 'px')
  if (gstate.value !== st) gstate.value = st
}
function maskMove(e) {
  if (!gs) return
  if (!gs.on && Math.hypot(e.clientX - gs.x, e.clientY - gs.y) < 5) return
  if (!gs.on) { gs.on = true; dragging.value = true }
  gs.ex = e.clientX; gs.ey = e.clientY
  if (!graf) graf = requestAnimationFrame(frame)
}
function frame() {
  graf = 0; if (!gs) return
  const x = gs.ex, y = gs.ey, fx = x - gs.x, fy = y - gs.y
  if (outOfTable(x, y)) { gs.plan = null; gs.out = true; gs.key = ''; return setG(fx, fy, 'out') }      // за таблицей — отпустить = удалить
  gs.out = false
  const c = gs.c && gs.hit(x, y)
  if (!c) { gs.plan = null; gs.key = ''; return setG(fx, fy, 'bad') }      // над шапкой / часами — едут за курсором, сюда нельзя
  const key = c.date + '|' + c.hour
  if (key !== gs.key) { gs.key = key; gs.plan = planMove(c) }      // план пересчитываем только при смене клетки
  setG(fx, fy, c === gs.c || gs.plan.ok ? '' : 'bad', c.b.left - gs.c.b.left, c.b.top - gs.c.b.top)
}
function maskUp(e) {
  removeEventListener('pointermove', maskMove); cancelAnimationFrame(graf); graf = 0
  const g = gs; gs = null; dragging.value = false; gstate.value = ''
  for (const v of ['--gdx', '--gdy', '--gtx', '--gty']) wk.value?.style.removeProperty(v)
  if (!g) return
  if (g.on) { if (g.out) removeSel(); else if (g.plan?.ok) emit('move-many', { moves: g.plan.moves, ghosts: g.plan.ghosts }); return }      // выбросили за таблицу — удалить (Ctrl+Z вернёт)
  // просто нажали — как в Figma: выбрать урок под курсором (дважды — открыть), мимо уроков — снять выделение
  const el = [...wk.value.querySelectorAll('[data-pick]')].find(x => { const b = x.getBoundingClientRect(); return e.clientX >= b.left && e.clientX < b.right && e.clientY >= b.top && e.clientY < b.bottom })
  if (!el) { clearSel(); return }
  const l = scheduleStore.lessons.find(x => x.id === el.dataset.pick)
  if (l) tapLesson(l, e); else if (multi(e)) toggle(el.dataset.pick); else sel.value = [el.dataset.pick]
}
function maskCtx(e) { menu.value = { x: Math.min(e.clientX, innerWidth - 270), y: Math.min(e.clientY, innerHeight - 220) } }
// Рамка вокруг выделенного, как в конструкторе курсов: синяя линия 2px и квадратики по углам (считаем по экрану, в координатах таблицы)
const selRect = ref(null)
function placeSel() {
  if (!wk.value || !sel.value.length) { selRect.value = null; return }
  const r = wk.value.getBoundingClientRect(), bs = [...wk.value.querySelectorAll('[data-pick]')].filter(el => selSet.value.has(el.dataset.pick)).map(el => el.getBoundingClientRect())
  if (!bs.length) { selRect.value = null; return }
  const p = 4, x0 = Math.min(...bs.map(b => b.left)) - p, y0 = Math.min(...bs.map(b => b.top)) - p, x1 = Math.max(...bs.map(b => b.right)) + p, y1 = Math.max(...bs.map(b => b.bottom)) + p
  selRect.value = { left: Math.round(x0 - r.left) + 'px', top: Math.round(y0 - r.top) + 'px', width: Math.round(x1 - x0) + 'px', height: Math.round(y1 - y0) + 'px' }
}
watch([sel, () => scheduleStore.lessons.map(l => `${l.id}${l.date}${l.hour}${l.minute ?? ''}`).join(), () => props.ghosts.length], () => nextTick(placeSel))
onMounted(() => addEventListener('resize', placeSel)); onUnmounted(() => removeEventListener('resize', placeSel))
onMounted(() => { addEventListener('pointerdown', offChip, true); addEventListener('keydown', onKey); addEventListener('scroll', closeMenu, true); addEventListener('resize', closeMenu) })
onUnmounted(() => { cancelAnimationFrame(graf); removeEventListener('pointermove', maskMove); removeEventListener('pointerdown', offChip, true); removeEventListener('keydown', onKey); removeEventListener('scroll', closeMenu, true); removeEventListener('resize', closeMenu); removeEventListener('pointermove', mqMove) })
</script>

<template>
  <div ref="wk" class="card wk" :class="[`gs-${gridStyle}`, `ls-${lessonStyle}`, { noframe: !gridFrame, shade: pastShade, 'td-first': dates[0] === now.date, 'td-last': dates[dates.length - 1] === now.date, 'tm-first': rowNow(HOURS[0]), 'tm-last': rowNow(HOURS[HOURS.length - 1]), boxing: !!box, many: sel.length > 1, gdrag: dragging }]" @pointerdown="mqDown" @contextmenu="ctxBg">
    <div v-if="selRect && !box" class="selbox" :class="{ bad: !!gstate, out: gstate === 'out' }" :style="selRect" aria-hidden="true"><em v-if="gstate === 'out'" class="seldel">Отпустите — удалить</em><b class="selmask" title="Тяните — выделенные уроки поедут вместе. Нажмите — выбрать урок, дважды — открыть" @pointerdown="maskDown" @contextmenu.stop.prevent="maskCtx" /><i /><i /><i /><i /></div>
    <i v-if="box" class="mq" :style="{ left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' }" aria-hidden="true" />
    <div class="g head">
      <label class="corner" :title="`Часовой пояс расписания: ${TIMEZONES.find(z => z.id === tz)?.label ?? tz}`">
        <span>{{ tzShort(tz) }}</span>
        <select :value="tz" aria-label="Часовой пояс расписания" @change="setTz($event.target.value)"><option v-for="z in TIMEZONES" :key="z.id" :value="z.id">{{ z.label }}</option></select>
      </label>
      <span v-for="(d, i) in dates" :key="d" class="dh" :class="{ we: i > 4, today: d === now.date }"><span class="dn"><b>{{ DAYS[i] }}</b><small>{{ +d.slice(8) }}</small></span>
        <span :key="burst?.date === d ? burst.t : 0" class="dsum" :class="{ bump: burst?.date === d && !burst.full, shine: burst?.date === d && burst.full, ok: money(d).plan && money(d).real === money(d).plan, zero: !money(d).plan }" :title="money(d).plan ? `Факт ${fmtMoney(money(d).real)} из ${fmtMoney(money(d).plan)}` : 'Уроков нет'"><i class="full">{{ money(d).plan ? fmtMoney(money(d).plan) : 0 }}</i><i class="kk">{{ kShort(money(d).plan) }}</i></span>
        <span v-if="money(d).lost" class="dlost" :title="`Потеряно из-за отмен: ${fmtMoney(money(d).lost)}`">−<i class="full">{{ fmtMoney(money(d).lost) }}</i><i class="kk">{{ kShort(money(d).lost) }}</i></span></span>
    </div>
    <div v-for="h in HOURS" :key="h" class="g" :class="{ nowrow: rowNow(h) }">
      <span class="tm" :class="{ now: rowNow(h) }">{{ rowNow(h) ? hh(h, now.minute) : hh(h) }}</span>
      <div v-for="d in dates" :key="d" class="cell" :class="[dropState(d, h), { free: !at(d, h).length, now: cellNow(d, h), past: slotPast(d, h, now), tcol: d === now.date }]" :style="cellNow(d, h) ? { '--fill': (now.minute / 60 * 100) + '%' } : null"
        data-drop="cell" :data-date="d" :data-hour="h" @click="clickCell(d, h)">
        <i v-if="cellNow(d, h)" class="nowline" :style="{ top: (now.minute / 60 * 100) + '%' }" aria-hidden="true" />
        <template v-for="l in at(d, h).slice(0, 1)" :key="l.id">
          <TrialSticker v-if="l.trial" :lesson="l" :auto-edit="freshTrial === l.id" @save="emit('trial-save', l, $event)" @remove="emit('trial-remove', l)" @edited="emit('trial-edited')" />
          <button v-else class="chip" :class="{ hasmin: l.minute, lifted: lifted(l), done: l.done, group: isGroup(l), orphan: orphan(l), canceled: allOff(l), pop: popping(l), up: !l.done && !allOff(l) && !orphan(l), sel: isSel(l) }" :data-pick="pickable(l) ? l.id : null" :title="`${label(l)}${unknown(l) ? ' — укажите статус' : ''} · дважды нажмите, чтобы открыть`" :aria-label="label(l)" :aria-pressed="isSel(l)"
            @pointerdown="down($event, l)" @click.stop="tapLesson(l, $event)" @contextmenu.stop="ctx($event, l)" @dragstart.prevent>
            <template v-if="isGroup(l)">
              <AvatarStack class="st-lg" :students="group(l)" :size="39" :max="3" :ring="ringOf(l)" /><AvatarStack class="st-sm" :students="group(l)" :size="26" :max="2" :ring="ringOf(l)" />
              <span v-if="l.done" class="tick" title="Проведён"><svg viewBox="0 0 16 16"><path d="M4.5 8.2l2.3 2.3 4.7-4.9" /></svg></span>
            </template>
            <template v-else-if="orphan(l)"><span class="q">?</span><span class="nm">{{ goneName(l) || 'Нет ученика' }}</span></template>
            <template v-else><Avatar :s="first(l)" :size="39" /><span class="nm">{{ first(l).name }}</span><span v-if="l.done" class="tick" title="Проведён"><svg viewBox="0 0 16 16"><path d="M4.5 8.2l2.3 2.3 4.7-4.9" /></svg></span></template>
            <span v-if="unknown(l)" class="tick q" title="Урок прошёл — укажите статус: проведён или отменён">?</span>
            <span v-if="allOff(l)" class="tick x" title="Отменён"><svg viewBox="0 0 16 16"><path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" /></svg></span><i v-else-if="offCount(l)" class="off" :title="`Отменили: ${offCount(l)}`">✕{{ offCount(l) }}</i>
            <i v-if="l.minute" class="min" :title="`Начало в ${hh(l.hour, l.minute)}`">:{{ String(l.minute).padStart(2, '0') }}</i>
            <i v-if="l.note" class="note" :title="l.note" aria-label="Есть заметка" />
            <i v-if="popping(l) && burst.amount" :key="burst.t" class="plus" aria-hidden="true">+{{ fmtMoney(burst.amount) }}</i>
            <i v-if="at(d, h).length > 1" class="more">+{{ at(d, h).length - 1 }}</i>
          </button>
        </template>
        <!-- Призрак: бледный урок с прошлой недели. Нажать — урок создан; × — убрать подсказку -->
        <button v-for="g in [ghostAt(d, h)].filter(Boolean)" :key="g.key" class="chip ghost up" :class="{ hasmin: g.minute, group: ghostStu(g).length > 1, sel: isSelG(g) }" :data-pick="gk(g)" :title="`Как на этой неделе: ${ghostStu(g).map(s => s.name).join(', ')} — нажмите, чтобы поставить урок`" @click.stop="tapGhost(g, $event)" @contextmenu.stop="ctx($event, null, g)">
          <AvatarStack v-if="ghostStu(g).length > 1" class="st-lg" :students="ghostStu(g)" :size="39" :max="3" ring="var(--card)" /><AvatarStack v-if="ghostStu(g).length > 1" class="st-sm" :students="ghostStu(g)" :size="26" :max="2" ring="var(--card)" />
          <template v-else><Avatar :s="ghostStu(g)[0]" :size="39" /><span class="nm">{{ ghostStu(g)[0].name }}</span></template>
          <i v-if="g.minute" class="min">:{{ String(g.minute).padStart(2, '0') }}</i>
          <span class="gx" title="Убрать — урока на этой неделе не будет" @click.stop="emit('ghost-skip', g)">×</span>
        </button>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="menu" class="cmenu" role="menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @pointerdown.stop @contextmenu.prevent>
        <template v-if="(menu.ghost || menu.lesson) && selCount <= 1">
          <button v-if="menu.ghost" role="menuitem" @click="menuOpen">Поставить урок</button>
          <button v-else role="menuitem" @click="menuOpen">Открыть урок<kbd>Enter</kbd></button>
          <i />
        </template>
        <button role="menuitem" :disabled="!selCount" :title="selCount ? '' : 'Выделите запланированные уроки или подсказки — проведённые не удаляются'" @click="removeSel">{{ delLabel }}<kbd>Delete</kbd></button>
        <i />
        <button role="menuitem" :disabled="!undoN" @click="cmDo(menuUndo)">Отменить<kbd>{{ ctrlKey }}+Z</kbd></button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Ячейки на всю ширину колонки; на телефоне в ячейке только аватарка, на широком экране — аватарка и имя */
.wk { padding: 10px; display: grid; gap: 4px; overflow: hidden }
.g { display: grid; grid-template-columns: 34px repeat(7, minmax(0, 1fr)); gap: 4px; align-items: stretch }
.head { margin-bottom: 2px }
/* Уголок: часовой пояс расписания (по умолчанию МСК). Видна аббревиатура, поверх — прозрачный select */
.corner { position: relative; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); font-size: 10px; font-weight: 900; color: var(--hint); cursor: pointer; min-height: 30px; align-self: center }
.corner:hover { border-color: var(--blue); color: var(--blue) }
.corner select { position: absolute; inset: 0; opacity: 0; margin: 0; padding: 0; cursor: pointer; width: 100% }
/* Линия «сейчас» внутри текущей ячейки: высота = минуты часа */
/* Как в Google Календаре, только зелёным (как «задеплоено» в GitHub): тонкая линия с точкой, без рамок и плашек */
.nowline { position: absolute; left: -2px; right: -2px; height: 2px; margin-top: -1px; background: var(--green-d); z-index: 6; pointer-events: none; border-radius: 2px }
.nowline::before { content: ''; position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--green-d); box-shadow: 0 0 0 2px var(--card) }
.tm { display: grid; place-items: center; font-size: 11px; font-weight: 800; color: var(--hint-2) }
.dh { display: grid; justify-items: center; padding: 4px 0; border-radius: 12px; font-size: 13px; color: var(--hint) }
.dn { display: grid; justify-items: center }
.dh small { font-weight: 800; font-size: 12px; color: var(--hint-2) }      /* дни без цвета — не спорят с суммой под датой */
/* Деньги дня — одна цифра под датой: сумма уроков дня; зелёная, когда все проведены */
.dsum { margin-top: 2px; line-height: 1.25; font-size: 12px; font-weight: 900; color: var(--hint-2); white-space: nowrap } .dsum.ok { color: var(--green-d) }
html[data-theme='dark'] .dsum.ok { color: var(--green) }
.dsum.zero { opacity: .45 }
.dsum i, .dlost i { font-style: normal } .kk { display: none }
@media (max-width: 719px) { .dsum .full, .dlost .full { display: none } .dsum .kk, .dlost .kk { display: inline } }      /* место под доход есть всегда (0) — шапка не меняет высоту, когда появляется первый урок */
.dh { position: relative }
.dlost { position: absolute; left: 50%; top: calc(100% - 7px); transform: translateX(-50%); z-index: 2; padding: 0 4px; border-radius: 6px; background: var(--card); font-size: 10px; font-weight: 800; color: var(--red-d); line-height: 14px; white-space: nowrap; pointer-events: none }      /* потеряно из-за отмен — мелко красным под суммой, поверх зазора: шапка не прыгает */
@media (min-width: 720px) { .dn { display: flex; align-items: baseline; gap: 5px } .dn small { font-size: 13px } .dh { padding: 6px 8px } .dsum { font-size: 13px } }
/* «Сегодня» — серая шапка дня во всю ширину колонки (края совпадают с линиями таблицы), скруглена только сверху и стоит прямо на таблице */
.dh.today { background: var(--surface) }      /* тот же серый, что у закрашенного прошедшего времени — одна шкала времени */ .dh.today b, .dh.today small { color: var(--text) }
.wk.gs-cells .dh.today { margin: 0; border-radius: 12px 12px 0 0; box-shadow: inset 1px 1px 0 var(--border), inset -1px 0 0 var(--border) }      /* обведена, как таблица: «язычок» колонки, торчит вверх */
/* Сегодня понедельник / воскресенье — угол таблицы под шапкой дня прямой, иначе в углу остаётся белый «треугольничек» */
.wk.gs-cells.td-first .g.head + .g > .cell:nth-child(2) { border-top-left-radius: 0 }
.wk.gs-cells.td-last .g.head + .g > .cell:last-child { border-top-right-radius: 0 }
.cell { position: relative; height: 38px; border-radius: 10px; background: var(--card); box-shadow: inset 0 0 0 1px var(--border); transition: background .1s, box-shadow .1s }      /* белые ячейки с тонкой рамкой */
.cell.free { cursor: pointer } .cell.free:hover { background: var(--blue-l) }
.tm.now { background: var(--surface); border-radius: 10px; color: var(--text); font-weight: 900 }
/* Текущий час — как «сегодня» в шапке: серая подсветка во всю высоту строки, скруглена только слева и прилегает к таблице */
.wk.gs-cells .tm.now { margin-right: 0; border-radius: 10px 0 0 10px; box-shadow: inset 1px 1px 0 var(--border), inset 0 -1px 0 var(--border) }      /* обведено, как таблица: «язычок» строки, торчит влево */
.wk.gs-cells.tm-first .g.head + .g > .cell:nth-child(2) { border-top-left-radius: 0 }      /* первый / последний час — угол таблицы прямой, без белого уголка */
.wk.gs-cells.tm-last .g:last-child > .cell:nth-child(2) { border-bottom-left-radius: 0 }
.cell.ok { background: var(--green-l); box-shadow: inset 0 0 0 2px var(--green) }
.cell.swap { background: var(--orange-l); box-shadow: inset 0 0 0 2px var(--orange) }
.cell.bad { background: var(--red-l); box-shadow: inset 0 0 0 2px var(--red) }
.chip { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 0 4px; min-width: 0;
  border: 0; border-radius: 10px; background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 1px #d0d7de;      /* предстоящий — серая плашка с серой окантовкой */
  font: inherit; font-size: 12px; font-weight: 800; cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; transition: opacity .1s }
/* Выделенный урок (одно нажатие) — синяя рамка, как выделение в Figma */
.chip.sel { outline: 3px solid #0d99ff; outline-offset: 1px; z-index: 3 }      /* синий как выделение в Figma, линия 3px */
.chip.done { box-shadow: none; background: transparent; color: var(--hint); cursor: pointer }      /* проведённый — серый, только зелёная галочка */ .chip .tick { font-weight: 900 }
/* Цвета карточек: запланирован — серый, проведён — зелёный, отменён учеником — красный. Группу видно по стопке аватарок. */
/* Группа: аватарки внахлёст без подписи — на телефоне две (вторая может быть «+N»), на широком экране до четырёх */
.chip .st-lg { display: none } .chip .st-sm { display: inline-flex }
@media (min-width: 720px) { .chip .st-lg { display: inline-flex } .chip .st-sm { display: none } }
.cell.join { box-shadow: inset 0 0 0 2px var(--green) }
/* Урок, ученика которого больше нет (удалён из базы / архив): серый пунктир с «?» — нажать и убрать */
.chip.orphan { border: 2px dashed var(--hint-2); background: var(--surface); color: var(--hint); cursor: pointer }
.chip .q { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--hint-2); color: #fff; font-weight: 900; font-size: 12px; flex: none }
/* Отменил ученик (без оплаты): красная карточка, имя зачёркнуто; значок ✕ — в углу слева */
.chip.canceled { box-shadow: none; background: transparent; color: var(--hint) }      /* отменён — серый, зачёркнут, красный кружок с крестиком (как упавшая сборка в GitHub) */
.chip.canceled .nm { text-decoration: line-through } .chip.canceled :deep(.av), .chip.canceled :deep(.stack) { opacity: .45 }
.chip.done .nm, .chip.canceled .nm { color: var(--hint-2); opacity: 1 }      /* имя у прошедших — тоже бледное */      /* прошедший урок — бледнее, как отменённый (статус видно по кружку) */
.off { position: absolute; top: -6px; right: -4px; font-style: normal; font-size: 10px; font-weight: 900; background: var(--red); color: #fff; border-radius: 99px; padding: 1px 5px; line-height: 1.3 }
/* Начало внутри часа — бирка «:30» в правом нижнем углу; заметка — жёлтая точка в правом верхнем */
@media (min-width: 720px) { .chip.hasmin { padding-right: 36px } }      /* имя не заезжает под «:30» */
/* Начало не с ровного часа («:30») — справа по центру урока: сразу видно, что урок с середины часа */
.min { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); font-style: normal; font-size: 11px; font-weight: 900; line-height: 1.3; padding: 0 5px; border-radius: 99px; background: var(--blue); color: #fff; box-shadow: 0 0 0 2px var(--card); z-index: 2 }
.note { position: absolute; right: -3px; top: -3px; width: 9px; height: 9px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 2px var(--card); z-index: 2 }
.chip:active { cursor: grabbing } .chip.lifted { opacity: .3 }
/* Кружок ученика — почти во всю высоту карточки, как аватарка в списке чатов Telegram */
.chip :deep(.av) { width: 39px !important; height: 39px !important; font-size: 17px !important }      /* на компьютере — 39px, влезает в ячейку таблицы */
@media (max-width: 719px) { .chip :deep(.av) { width: 31px !important; height: 31px !important; font-size: 13px !important } }
@media (max-width: 420px) { .chip :deep(.av) { width: 29px !important; height: 29px !important } }
.chip .nm { display: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; opacity: .85 }
/* Галочка «проведён» — как в GitHub: белая галочка в зелёном кружке */
.chip .tick { flex: none; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: #1f883d } .chip .tick.x { background: #cf222e } .chip .tick.q { background: var(--orange); color: #fff; font-size: 11px; font-weight: 900; line-height: 1 } .chip .tick svg { width: 12px; height: 12px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }  /* время в ячейке не пишем — только бирка «:30», если урок не с начала часа */
.more { position: absolute; top: -6px; right: -4px; font-style: normal; font-size: 10px; font-weight: 900; background: var(--orange); color: #fff; border-radius: 99px; padding: 1px 5px }
@media (min-width: 720px) { .chip .nm { display: block } .chip { justify-content: flex-start; padding: 0 6px 0 1px; gap: 7px; font-size: 13px } .cell { height: 46px } .g { grid-template-columns: 52px repeat(7, minmax(0, 1fr)) } }
@media (max-width: 420px) { .dsum, .dlost { font-size: 10px; letter-spacing: -.2px } .wk { padding: 6px } .g { gap: 3px; grid-template-columns: 30px repeat(7, minmax(0, 1fr)) } .chip { padding: 0 } .cell { height: 36px } }

/* На телефоне галочку «проведён» не показываем — кружок крупный, проведённый урок и так зелёный */
/* Статус — в левом верхнем углу урока (на аватарке), на всех экранах */
.chip .tick { position: absolute; top: -5px; left: -4px; z-index: 2; box-shadow: 0 0 0 2px var(--card) }
@media (max-width: 719px) { .chip .tick { width: 14px; height: 14px } .chip .tick svg { width: 10px; height: 10px } }
/* Прошедшее время (настройка): прошлые часы — серые, текущий час закрашивается сверху по минутам */
.wk.shade .cell.past:not(.ok):not(.bad):not(.swap) { background: var(--surface) }
.wk.shade .cell.now:not(.ok):not(.bad):not(.swap) { background: linear-gradient(var(--surface) var(--fill), var(--card) var(--fill)) }
/* Призрак урока (следующая неделя, не подтверждён): в том же виде, что и урок (голубая капсула, жёлтая группа, стикер — как выбрано
   в настройке «Урок»), только бледный; при наведении — ярче и крестик «убрать» */
.chip.ghost { opacity: .38; cursor: pointer; transition: opacity .12s }
.chip.ghost:hover { opacity: .85 }
.gx { position: absolute; top: -6px; right: -6px; z-index: 3; display: none; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--card); box-shadow: 0 1px 4px rgba(0, 0, 0, .25); color: var(--hint); font-size: 13px; font-weight: 900; line-height: 1 }
.chip.ghost:hover .gx { display: grid } .gx:hover { color: var(--red-d) }
@media (hover: none) { .gx { display: grid } }
/* Вид будущего урока (настройка «Урок»): только у запланированных — у прошедших подложки нет */
.wk .chip.up { isolation: isolate }
@media (min-width: 720px) {
  /* Капсула (серая или голубая) — кружок ученика слева, как аватарка в списке чатов Telegram */
  .wk.ls-blue .chip.up, .wk.ls-gray .chip.up { padding-left: 3px; border-radius: 999px }      /* сильнее, чем скругление клеток (.wk.gs-cells .chip) */
  .wk.ls-blue .chip.up :deep(.av), .wk.ls-gray .chip.up :deep(.av) { width: 34px !important; height: 34px !important; font-size: 15px !important }      /* кружок внутри капсулы, с отступом от края */
  .wk.ls-blue .chip.up { box-shadow: 0 2px 5px rgba(28, 120, 200, .18) } .wk.ls-blue .chip.up .nm { color: #1a5b8a }
  .wk.ls-gray .chip.up { box-shadow: 0 2px 5px rgba(0, 0, 0, .1) }
}
.wk.ls-blue .chip.up { background: var(--blue-l) } .wk.ls-gray .chip.up { background: var(--group) }
/* Группа — жёлтая плашка (как в панели учеников и в «Информации»); у прошедших подложки нет */
.wk .chip.up.group { background: var(--grp); box-shadow: inset 0 0 0 1px var(--grp-line) }
@media (min-width: 720px) {
  .wk .chip.up.group { background: var(--grp); box-shadow: none }
}
/* Вид сетки (utils/gridStyle.js, кнопка с решёткой над таблицей): клетки — по умолчанию (выше) */
/* «Клетки» — простая таблица: прямые ячейки без промежутков, тонкие линии 1px; скруглены только внешние углы таблицы */
.wk.gs-cells { gap: 0 } .wk.gs-cells .g { gap: 0 } .wk.gs-cells .g.head { margin-bottom: 0 } .wk.gs-cells .dh { margin: 0 2px }
.wk.gs-cells .cell { border-radius: 0; box-shadow: inset -1px -1px 0 var(--border) }
.wk.gs-cells .g > .cell:nth-child(2) { box-shadow: inset 1px 0 0 var(--border), inset -1px -1px 0 var(--border) }
.wk.gs-cells .g.head + .g > .cell { box-shadow: inset 0 1px 0 var(--border), inset -1px -1px 0 var(--border) }
.wk.gs-cells .g.head + .g > .cell:nth-child(2) { box-shadow: inset 1px 1px 0 var(--border), inset -1px -1px 0 var(--border); border-top-left-radius: 10px }
.wk.gs-cells .g.head + .g > .cell:last-child { border-top-right-radius: 10px }
/* Подсветка «сегодня» и текущего часа переходит в таблицу без черты: под шапкой дня нет верхней линии, справа от текущего часа — левой */
.wk.gs-cells .g.head + .g > .cell.tcol:not(.ok):not(.bad):not(.swap):not(.join) { box-shadow: inset -1px -1px 0 var(--border) }
.wk.gs-cells .g.head + .g > .cell.tcol:nth-child(2):not(.ok):not(.bad):not(.swap):not(.join) { box-shadow: inset 1px 0 0 var(--border), inset -1px -1px 0 var(--border) }
.wk.gs-cells .g.nowrow > .cell:nth-child(2):not(.ok):not(.bad):not(.swap):not(.join) { box-shadow: inset -1px -1px 0 var(--border) }
.wk.gs-cells .g.head + .g.nowrow > .cell:nth-child(2):not(.ok):not(.bad):not(.swap):not(.join) { box-shadow: inset 0 1px 0 var(--border), inset -1px -1px 0 var(--border) }
.wk.gs-cells .g.head + .g.nowrow > .cell.tcol:nth-child(2):not(.ok):not(.bad):not(.swap):not(.join) { box-shadow: inset -1px -1px 0 var(--border) }
.wk.gs-cells .g:last-child > .cell:nth-child(2) { border-bottom-left-radius: 10px }
.wk.gs-cells .g:last-child > .cell:last-child { border-bottom-right-radius: 10px }
@media (min-width: 720px) { .wk.gs-cells .tm, .wk.gs-cells .corner { margin-right: 8px } }      /* «мск» — той же ширины, что колонка часов, с зазором до таблицы */
.wk.gs-cells .chip { inset: 3px; border-radius: 7px }
@media (max-width: 420px) { .wk.gs-cells .g { grid-template-columns: 36px repeat(7, minmax(0, 1fr)) } .wk.gs-cells .tm { font-size: 10px; margin-right: 3px } .wk.gs-cells .corner { margin-right: 3px } }
@media (max-width: 719px) { .wk.gs-cells .chip { inset: 2px } }
@media (max-width: 420px) { .wk.gs-cells .tm.now { font-size: 9px; letter-spacing: -.3px; justify-items: start; padding-left: 3px } }      /* «13:24» влезает в узкий столбик и не прячется под точкой линии «сейчас» */
.wk.noframe { border-color: transparent; box-shadow: none }      /* без внешней рамки (кнопка с решёткой → «Рамка») */
@media (max-width: 719px) { .min { top: auto; bottom: -5px; right: -4px; transform: none; font-size: 10px; padding: 0 3px } }      /* на телефоне — в правом нижнем углу, чтобы не закрывать кружок */
/* «Урок проведён» — маленький праздник: карточка подпрыгивает с зелёной волной, галочка «выстреливает», над уроком всплывает «+сумма» */
.chip.pop { z-index: 5; animation: chipPop .55s cubic-bezier(.34, 1.56, .64, 1) }
.chip.pop::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; animation: chipWave .8s ease-out forwards }
.chip.pop .tick { animation: tickPop .5s .12s cubic-bezier(.34, 1.8, .64, 1) both }
@keyframes chipPop { 0% { transform: scale(1) } 35% { transform: scale(1.12) } 100% { transform: scale(1) } }
@keyframes chipWave { from { box-shadow: 0 0 0 0 rgba(88, 204, 2, .55) } to { box-shadow: 0 0 0 14px rgba(88, 204, 2, 0) } }
@keyframes tickPop { from { transform: scale(0) rotate(-40deg) } to { transform: scale(1) rotate(0) } }
.plus { position: absolute; left: 50%; bottom: 100%; z-index: 7; padding: 2px 8px; border-radius: 99px; background: var(--green); color: #fff; font-style: normal; font-size: 13px; font-weight: 900; white-space: nowrap; pointer-events: none; box-shadow: 0 3px 10px rgba(88, 167, 0, .35); animation: plusUp 1.5s ease-out forwards }
@keyframes plusUp { 0% { opacity: 0; transform: translate(-50%, 12px) scale(.6) } 18% { opacity: 1; transform: translate(-50%, -2px) scale(1.08) } 30% { transform: translate(-50%, -4px) scale(1) } 75% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -26px) } }
/* Сумма дня в шапке — короткая зелёная вспышка */
.dsum.bump { animation: sumBump .9s .25s ease-out both }
@keyframes sumBump { 0% { transform: scale(1) } 30% { transform: scale(1.25); color: var(--green-d) } 100% { transform: scale(1) } }
/* Последний урок дня закрыт: сумма дня — в зелёной плашке, подпрыгивает, по ней пробегает блеск */
.dsum.shine { position: relative; overflow: hidden; border-radius: 6px; animation: sumDone 1.4s .25s ease-out both }
.dsum.shine::after { content: ''; position: absolute; top: 0; bottom: 0; left: -70%; width: 55%; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, .95), transparent); transform: skewX(-20deg); animation: sumShine .8s .6s ease-in-out both; pointer-events: none }
@keyframes sumDone { 0% { transform: scale(1); background: transparent; box-shadow: 0 0 0 0 transparent } 22% { transform: scale(1.3); color: var(--green-d); background: var(--green-l); box-shadow: 0 0 0 3px var(--green-l) } 75% { transform: scale(1.1); background: var(--green-l); box-shadow: 0 0 0 3px var(--green-l) } 100% { transform: scale(1); background: transparent; box-shadow: 0 0 0 0 transparent } }
@keyframes sumShine { from { left: -70% } to { left: 120% } }
html[data-theme='dark'] .dsum.shine::after { background: linear-gradient(100deg, transparent, rgba(255, 255, 255, .35), transparent) }
@media (prefers-reduced-motion: reduce) { .chip.pop, .chip.pop::after, .chip.pop .tick, .plus, .dsum.bump, .dsum.shine, .dsum.shine::after { animation: none } }
/* Выделение как в Figma: синяя рамка у выделенных (и у призраков — они при этом ярче), голубая рамка-область при протягивании мышью */
.wk { position: relative }
.wk.boxing { user-select: none; -webkit-user-select: none } .wk.boxing .cell.free:hover { background: var(--card) }
.mq { position: absolute; z-index: 8; border: 1.5px solid #0d99ff; background: rgba(13, 153, 255, .12); pointer-events: none }      /* как в конструкторе курсов */
.selbox { position: absolute; z-index: 7; border: 3px solid #0d99ff; pointer-events: none }      /* линия потолще, чем в конструкторе: таблица мельче холста */
.selmask { position: absolute; inset: 0; pointer-events: auto; cursor: grab; background: rgba(13, 153, 255, .06); touch-action: none } .selmask:active { cursor: grabbing }      /* лёгкая голубая маска: за неё тянется всё выделенное */
.wk.gdrag .chip.sel { transform: translate(var(--gdx, 0), var(--gdy, 0)); will-change: transform } .wk.gdrag .selbox { transform: translate(var(--gtx, 0), var(--gty, 0)); transition: transform .08s ease-out; will-change: transform } .wk.gdrag .chip.sel { z-index: 6; opacity: .85; transition: none }      /* уроки (и призраки) плавно едут за курсором, рамка — по клеткам: куда встанут */
.wk.gdrag .cell.free:hover { background: var(--card) }      /* пока тянем — клетки под курсором не мигают */
.wk.gdrag { overflow: visible }      /* пока тянем — уроки не обрезаются краем таблицы */
.seldel { position: absolute; left: 50%; top: -30px; translate: -50% 0; padding: 3px 10px; border-radius: 99px; background: var(--red); color: #fff; font-style: normal; font-size: 12px; font-weight: 800; white-space: nowrap }
.selbox.out { border-style: dashed } .selbox.out i { display: none }
.selbox.bad, .selbox.bad i { border-color: var(--red) } .selbox.bad .selmask { background: rgba(255, 75, 75, .08); cursor: not-allowed }      /* сюда нельзя — рамка красная */
.selbox i { position: absolute; width: 14px; height: 14px; box-sizing: border-box; border: 3px solid #0d99ff; border-radius: 4px; background: var(--card) }
.selbox i:nth-of-type(1) { left: -8.5px; top: -8.5px } .selbox i:nth-of-type(2) { right: -8.5px; top: -8.5px } .selbox i:nth-of-type(3) { left: -8.5px; bottom: -8.5px } .selbox i:nth-of-type(4) { right: -8.5px; bottom: -8.5px }
.wk .chip.sel { outline: none } .wk.many .chip.sel { outline: 2px solid #0d99ff; outline-offset: 1px }      /* один урок — только рамка с квадратиками; несколько — ещё и тонкая обводка у каждого */
.chip.ghost.sel { opacity: .85 }
</style>
<style>
/* Правое меню таблицы — чёрное, как в конструкторе курсов (CourseEditor → .cmenu); в body (Teleport), поэтому без scoped */
.cmenu { position: fixed; z-index: 70; display: grid; min-width: 250px; padding: 8px; border-radius: 14px; background: #1e1e1e; box-shadow: 0 10px 30px rgba(0, 0, 0, .3); color: #fff }
.cmenu button { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 7px 12px; border: 0; border-radius: 7px; background: none; color: #fff; font: inherit; font-size: 14px; font-weight: 600; text-align: left; cursor: pointer }
.cmenu button:hover:not(:disabled) { background: #0d99ff } .cmenu button:disabled { color: #6f6f6f; cursor: default }
.cmenu kbd { font: inherit; font-size: 13px; font-weight: 600; color: #bdbdbd } .cmenu button:hover:not(:disabled) kbd { color: #fff } .cmenu button:disabled kbd { color: #5a5a5a }
.cmenu i { height: 1px; margin: 6px 4px; background: #383838 }
</style>

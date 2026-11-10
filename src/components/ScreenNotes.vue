<script setup>
// 09.11.2026: вместо заметок-булавок — ОДИН общий чат справа (кнопка-чат у «Сейчас здесь»). Булавки, правый клик и клавиша C выключены;
// старые заметки остаются в базе, но не показываются. Реакции, правка, «печатает…», «Прочитано», колокольчик и парашют — как были.
// Было: заметки на общем экране — мини-чат преподавателей (логика: composables/useNotes.js, сервер: server/notes.ts).
//  • Правый клик (или клавиша C) → «Оставить заметку здесь»: булавка приклеивается к месту на странице, у коллег — сразу.
//  • Свои сообщения можно исправить (карандаш у сообщения) — у коллег пометка «изм.».
//  • Булавку можно перетащить на другое место — у коллег она переедет сразу.
//  • Нажал на булавку — карточка: сообщения, реакции, «печатает…», «Прочитано», поле ответа. Корзина — удалить заметку у всех.
//  • Колокольчик у кнопки «Отправить» — уведомлением: у коллеги всплывает плашка и висит, пока не закроет крестиком.
//  • Посылка: собираешь её (чем доставить — парашют / кран / птица, во что упаковать, какие эмодзи внутрь), нажимаешь на экран — куда сбросить;
//    у всех она опускается вниз экрана стопкой (ParachuteDrop.vue).
//  • На телефоне карточка — снизу во всю ширину; новую заметку ставят из списка у «Сейчас здесь» («Новая заметка» → нажать на экран).
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import ParachuteDrop from './ParachuteDrop.vue'
import ParcelArt from './ParcelArt.vue'
import { showToast } from '../composables/useToast'
import { live, WHERE } from '../composables/useLive'
import { notesState as S, noteById, REACTIONS, unread, createNote, reply, react, removeNote, removeMsg, typing, openNote, closePopup, wireNotes, moveNote, editMsg, CARGO, CHAT_PATH, VIAS, PARCEL_EMOJI, PARCEL_EMOJI_MAX } from '../composables/useNotes'
import { anchorAt, placeOf } from '../utils/anchor'
import { ask } from '../composables/useDialog'

wireNotes()
const route = useRoute(), router = useRouter()
const tick = ref(0), now = ref(Date.now())
const re = () => { tick.value++ }
const whereOf = () => WHERE[route.meta.tab] || (route.meta.tab === 'info' ? 'Инфо' : '')

// --- булавки на этой странице ---
const pins = computed(() => {
  void tick.value
  return []          // булавок больше нет — один общий чат (было: заметки этой страницы)
})
// --- перенос булавки: потянул (больше 5 px) — едет за пальцем/мышью, отпустил — приклеилась на новое место (у всех) ---
const drag = ref(null)          // { id, x, y }
function pinDown(e, n) {
  if (e.button > 0) return
  const sx = e.clientX, sy = e.clientY, pin = e.currentTarget
  const at = placeOf(n), dx = sx - at.x, dy = sy - at.y        // за какое место булавки взяли — так и держим, булавка не прыгает к курсору
  let moved = false
  const mv = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
    moved = true; drag.value = { id: n.id, x: ev.clientX - dx, y: ev.clientY - dy }
  }
  const up = (ev) => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up)
    if (!moved) return
    pin.style.visibility = 'hidden'                               // чтобы под пальцем нашёлся элемент страницы, а не сама булавка
    const at = anchorAt(ev.clientX - dx, ev.clientY - dy)
    pin.style.visibility = ''
    drag.value = null; justDragged = true; setTimeout(() => { justDragged = false }, 0)
    moveNote(n.id, at); re()
  }
  addEventListener('pointermove', mv); addEventListener('pointerup', up)
}
let justDragged = false
const pinClick = (n) => { if (justDragged) return; S.open === n.id ? close() : openNote(n.id) }
const pinAt = (p) => (drag.value?.id === p.n.id ? drag.value : p.at)

// --- открытая заметка или черновик новой ---
const note = computed(() => (S.open ? noteById(S.open) : null))
const anchor = computed(() => ((note.value || S.draft) ? { x: 0, y: 0 } : null))          // чат прикреплён к правому краю, не к месту на странице
const mobile = ref(innerWidth < 720)
const cardPos = computed(() => null)          // чат — справа, в половину высоты экрана (класс dock), на телефоне — снизу
const close = () => { S.open = null; S.draft = null }
// Удалить заметку целиком — у всех; спрашиваем, как обычно
async function del(n) {
  if (!(await ask('Удалить заметку?', { text: n.msgs.length > 1 ? `Вместе с ответами (${n.msgs.length - 1}) — у всех.` : 'Она пропадёт у всех.', ok: 'Удалить', danger: true }))) return
  removeNote(n.id); close()
}

// --- имена: кто прочитал, кто печатает ---
const nameOf = (uid) => live.users.find((u) => u.uid === uid)?.name || note.value?.msgs.find((m) => m.uid === uid)?.name || 'коллега'
const lastMine = computed(() => { const ms = note.value?.msgs || []; for (let i = ms.length - 1; i >= 0; i--) if (ms[i].uid === S.me) return ms[i]; return null })
const readers = computed(() => {
  const m = lastMine.value, n = note.value; if (!m || !n) return []
  return Object.entries(n.seen || {}).filter(([u, at]) => u !== S.me && at >= m.at).map(([u]) => nameOf(u))
})
const typer = computed(() => { void now.value; const t = S.typing[S.open || 'new']; return t && t.until > now.value && t.uid !== S.me ? t : null })
const time = (at) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const ini = (s) => (s || '?').trim()[0]?.toUpperCase() || '?'

// --- поле ответа ---
// mode: '' — обычное сообщение, 'bell' — всплывающим уведомлением, id посылки — спустить на парашюте (меню «Что доставить»)
const text = ref(''), mode = ref(''), ta = ref(null), picker = ref(''), cargoMenu = ref(false)
const cargoOf = computed(() => CARGO.find((c) => c.id === mode.value))
// выбор реакции — тоже position: fixed над кнопкой: список сообщений прокручивается и обрезает всплывашку у верхнего сообщения
const pickAt = ref({})
function togglePick(e, id) {
  if (picker.value === id) { picker.value = ''; return }
  const r = e.currentTarget.getBoundingClientRect(), W = 6 * 32 + 8
  pickAt.value = { left: Math.max(8, Math.min(innerWidth - W - 8, r.right - W)) + 'px', bottom: innerHeight - r.top + 4 + 'px' }
  picker.value = id
}
// Окно «Посылка»: открывается над кнопкой, целиком в пределах экрана; за шапку его можно перетащить — место запоминается
const win = ref(null), pos = ref({ x: 8, y: 8 })
let winMoved = false, lastCargo = 'chest'
function clampPos(x, y) {
  const w = win.value?.offsetWidth || 340, h = win.value?.offsetHeight || 520
  return { x: Math.max(8, Math.min(innerWidth - w - 8, x)), y: Math.max(8, Math.min(innerHeight - h - 8, y)) }
}
function toggleCargo(e) {
  if (cargoMenu.value) { cargoMenu.value = false; return }
  if (!cargoOf.value) mode.value = lastCargo
  const r = e.currentTarget.getBoundingClientRect()
  cargoMenu.value = true
  nextTick(() => { pos.value = winMoved ? clampPos(pos.value.x, pos.value.y) : clampPos(r.right + 40 - (win.value?.offsetWidth || 340), r.top - 8 - (win.value?.offsetHeight || 520)) })
}
function dragWin(e) {
  if (e.target.closest('button')) return
  e.preventDefault()
  const dx = e.clientX - pos.value.x, dy = e.clientY - pos.value.y
  const move = (ev) => { winMoved = true; pos.value = clampPos(ev.clientX - dx, ev.clientY - dy) }
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up) }
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up)
}
const onWinResize = () => { if (cargoMenu.value) pos.value = clampPos(pos.value.x, pos.value.y) }
onMounted(() => addEventListener('resize', onWinResize)); onUnmounted(() => removeEventListener('resize', onWinResize))
// подпись под сценой: «Аист принесёт записку — текст видно сразу»
// аист ведёт себя по-разному с разным грузом: настроение и след (перья 'f' или эмодзи) — как в ParachuteDrop.vue
const MOOD = { chest: 'hard', cake: 'hard', poo: 'shut' }, TRAIL = { chest: 'f', heart: '❤️', flowers: '🌸' }
const WHO = { chute: 'На парашюте спустится', crane: 'Кран привезёт', bird: 'Аист принесёт' }
const WHAT = { chest: 'сундук с письмом', mail: 'конверт с письмом', note: 'записку — текст видно сразу' }
const caption = computed(() => `${WHO[via.value]} ${WHAT[mode.value] || (cargoOf.value?.title || '').toLowerCase() + ' с письмом'}`)
const mainCargo = CARGO.filter((c) => ['chest', 'gift', 'mail', 'note'].includes(c.id)), moreCargo = CARGO.filter((c) => !mainCargo.includes(c))
// «Выбрать, куда сбросить»: текст уже набран — к выбору места; нет — закрыть окно и ждать текст в поле чата
function goAim() {
  if (text.value.trim()) return send()
  cargoMenu.value = false; ta.value?.focus(); showToast('Напишите сообщение — и Enter')
}
function pickCargo(id) { mode.value = id; lastCargo = id }
// Посылка: чем доставить и какие эмодзи положить внутрь (при открытии вылетают фонтаном). Эмодзи без груза не бывает — берём сундук.
const via = ref('bird'), emo = ref([]), emoText = ref('')
function toggleEmo(e) {
  if (emo.value.includes(e)) emo.value = emo.value.filter((x) => x !== e)
  else if (emo.value.length < PARCEL_EMOJI_MAX) emo.value = [...emo.value, e]
  if (emo.value.length && !cargoOf.value) mode.value = 'chest'
}
// любые эмодзи с клавиатуры: из набранного берём только сами эмодзи
function onEmoInput() {
  const parts = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter().segment(emoText.value)].map((x) => x.segment) : [...emoText.value]
  for (const g of parts) if (/\p{Extended_Pictographic}/u.test(g) && !emo.value.includes(g)) toggleEmo(g)
  emoText.value = ''
}
watch(() => S.open || S.draft, (v) => { if (!v) cargoMenu.value = false })          // чат закрыли — окно посылки тоже
const resetParcel = () => { mode.value = ''; cargoMenu.value = false; emo.value = [] }
function send() {
  const t = text.value.trim(); if (!t) return
  if (cargoOf.value) { S.aim = { text: t, mode: mode.value, note: S.open, draft: S.draft, pack: { via: via.value, emoji: [...emo.value] } }; text.value = ''; resetParcel(); return }      // посылка: сначала выбрать, куда сбросить
  if (S.draft) createNote(t, mode.value); else if (S.open) reply(S.open, t, mode.value)
  text.value = ''; resetParcel()
}
function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  else if (e.key === 'Escape') close()
  else typing(S.open)
}
watch(() => S.open || (S.draft && 'new'), (v) => { picker.value = ''; if (v) nextTick(() => ta.value?.focus()) })
const mine = (m) => m.uid === S.me
// чат: открыли или пришло новое сообщение — прокрутить вниз, к последнему
const box = ref(null)
watch(() => [S.open, note.value?.msgs.length], () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight }), { immediate: true })
// Исправить своё сообщение: карандаш у сообщения → поле на месте текста; Enter — сохранить, Esc — отмена
const editing = ref(''), editText = ref('')
function startEdit(m) { editing.value = m.id; editText.value = m.text; nextTick(() => document.querySelector('.sn-card .ed')?.focus()) }
function saveEdit() { if (editing.value && editText.value.trim()) editMsg(S.open, editing.value, editText.value); editing.value = '' }
function onEditKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } else if (e.key === 'Escape') { e.stopPropagation(); editing.value = '' } }
// Удалить своё сообщение — с подтверждением, пропадает у всех
async function dropMsg(m) { if (await ask('Удалить сообщение?', { text: 'Оно пропадёт у всех.', ok: 'Удалить', danger: true })) removeMsg(S.open, m.id) }
const reacts = (m) => Object.entries(m.react || {}).map(([e, who]) => ({ e, n: who.length, me: who.includes(S.me) }))

// --- правый клик → «Оставить заметку здесь» ---
const menu = ref(null)
const editable = (el) => el?.closest?.('input, textarea, select, [contenteditable="true"]')
function onContext(e) {
  return          // правый клик «Оставить заметку здесь» выключен — теперь один общий чат (ниже — как было)
  // eslint-disable-next-line no-unreachable
  if (!live.on || editable(e.target) || e.target.closest?.('.sn-card, .sn-pin, .sn-menu')) return
  e.preventDefault()
  menu.value = { x: e.clientX, y: e.clientY }
}
function startAt(cx, cy) {
  menu.value = null; S.placing = false; S.open = null
  S.draft = { path: route.fullPath, where: whereOf(), ...anchorAt(cx, cy) }
  text.value = ''; re()
}
let lastX = innerWidth / 2, lastY = innerHeight / 2
const onMove = (e) => { lastX = e.clientX; lastY = e.clientY; if (S.aim) aimX.value = e.clientX }
function onKeyGlobal(e) {
  if (!live.on || editable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'Escape') { close(); menu.value = null; S.placing = false; S.aim = null }
}
function onPlace(e) {
  if (S.aim && !e.target.closest?.('.sn-aim .msg')) {        // посылка: нажатие выбирает, куда сбросить (по горизонтали)
    e.preventDefault(); e.stopPropagation()
    const a = S.aim, x = e.clientX / innerWidth; S.aim = null
    if (a.note) reply(a.note, a.text, a.mode, x, a.pack)
    else if (a.draft) { S.draft = a.draft; createNote(a.text, a.mode, x, a.pack) }
    return
  }
  if (S.placing) { e.preventDefault(); e.stopPropagation(); startAt(e.clientX, e.clientY) }
}
const aimX = ref(0)

// --- всплывающие уведомления ---
const popups = computed(() => S.popups.map((p) => { const n = noteById(p.id); return n && { ...p, n, m: n.msgs.find((x) => x.id === p.mid) || n.msgs.at(-1) } }).filter(Boolean))
function openPopup(p) {
  closePopup(p.id, true)
  if (p.n.path !== CHAT_PATH && p.n.path !== route.fullPath) router.push(p.n.path)
}

let clock = 0
const onResize = () => { mobile.value = innerWidth < 720; re() }
onMounted(() => {
  addEventListener('contextmenu', onContext); addEventListener('keydown', onKeyGlobal); addEventListener('pointermove', onMove, { passive: true })
  addEventListener('pointerdown', onPlace, true)
  addEventListener('scroll', re, { passive: true, capture: true }); addEventListener('resize', onResize)
  clock = setInterval(() => { now.value = Date.now(); re() }, 1000)
})
onUnmounted(() => {
  removeEventListener('contextmenu', onContext); removeEventListener('keydown', onKeyGlobal); removeEventListener('pointermove', onMove)
  removeEventListener('pointerdown', onPlace, true)
  removeEventListener('scroll', re, { capture: true }); removeEventListener('resize', onResize); clearInterval(clock)
})
watch(() => route.fullPath, () => { menu.value = null; re() })          // чат при переходе по вкладкам остаётся открытым
</script>

<template>
  <!-- булавки -->
  <button v-for="p in pins" :key="p.n.id" class="sn-pin" :class="{ on: S.open === p.n.id, unread: p.unread, dragging: drag?.id === p.n.id }" :style="{ transform: `translate(${pinAt(p).x}px, ${pinAt(p).y}px)`, '--c': p.n.msgs[0].color }"
    :aria-label="`Заметка: ${p.n.msgs[0].text}`" :title="p.n.msgs[0].text" @pointerdown="pinDown($event, p.n)" @click.stop="pinClick(p.n)" @dragstart.prevent>
    <img v-if="p.n.msgs[0].photo" :src="p.n.msgs[0].photo" alt="" referrerpolicy="no-referrer" /><b v-else>{{ ini(p.n.msgs[0].name) }}</b>
    <em v-if="p.n.msgs.length > 1">{{ p.n.msgs.length }}</em>
  </button>
  <!-- черновик новой заметки: булавка-«+» -->
  <span v-if="S.draft && anchor" class="sn-pin new" :style="{ transform: `translate(${anchor.x}px, ${anchor.y}px)` }"><AppIcon name="plus" :size="16" /></span>

  <!-- карточка -->
  <div v-if="(note || S.draft) && anchor" class="sn-card dock" :class="{ sheet: mobile }" :style="cardPos" role="dialog" :aria-label="note ? 'Заметка' : 'Новая заметка'" @pointerdown.stop>
    <div class="hd">
      <span>Чат<small v-if="note" class="cnt"> · {{ note.msgs.length }}</small></span>
      <button v-if="note && note.path !== CHAT_PATH" class="ib del" type="button" title="Удалить заметку" aria-label="Удалить заметку" @click="del(note)"><AppIcon name="trash" :size="15" /></button>
      <button class="ib" type="button" aria-label="Закрыть" @click="close"><AppIcon name="x" :size="14" /></button>
    </div>
    <div v-if="note" ref="box" class="msgs" @scroll="picker = ''">
      <div v-for="m in note.msgs" :key="m.id" class="m">
        <span class="av" :style="{ '--c': m.color }"><img v-if="m.photo" :src="m.photo" alt="" referrerpolicy="no-referrer" /><b v-else>{{ ini(m.name) }}</b></span>
        <span class="mb">
          <span class="mh">{{ mine(m) ? 'Вы' : m.name }}<small>{{ time(m.at) }}</small>
            <button v-if="mine(m) && editing !== m.id" class="r add pen" type="button" title="Исправить" aria-label="Исправить сообщение" @click="startEdit(m)"><AppIcon name="pencil" :size="12" /></button>
            <button v-if="mine(m) && editing !== m.id" class="r add pen" type="button" title="Удалить" aria-label="Удалить сообщение" @click="dropMsg(m)"><AppIcon name="trash" :size="12" /></button>
            <button class="r add" type="button" :aria-expanded="picker === m.id" title="Реакция" aria-label="Реакция" @click="togglePick($event, m.id)">+ 🙂</button>
            <span v-if="picker === m.id" class="pick" :style="pickAt"><button v-for="e in REACTIONS" :key="e" type="button" @click="react(note.id, m.id, e); picker = ''">{{ e }}</button></span></span>
          <textarea v-if="editing === m.id" v-model="editText" class="ed" rows="2" maxlength="1000" @keydown="onEditKey" @blur="saveEdit" />
          <span v-else class="mt">{{ m.text }}<small v-if="m.edited" class="edd"> (изм.)</small></span>
          <span v-if="reacts(m).length" class="re">
            <button v-for="r in reacts(m)" :key="r.e" class="r" :class="{ me: r.me }" type="button" @click="react(note.id, m.id, r.e)">{{ r.e }} {{ r.n }}</button>
          </span>
        </span>
      </div>
      <div v-if="lastMine" class="rd" :class="{ ok: readers.length }">{{ readers.length ? `✓✓ Прочитано · ${readers.join(', ')}` : '✓ Отправлено' }}</div>
    </div>
    <div v-if="typer" class="typ" :style="{ '--c': typer.color }"><span class="dots"><i /><i /><i /></span>{{ typer.name }} печатает…</div>
    <div class="in">
      <textarea ref="ta" v-model="text" rows="1" :placeholder="'Сообщение — увидят все, кто в приложении'" maxlength="1000" @keydown="onKey" />
      <button class="bell" :class="{ on: mode === 'bell' }" type="button" :aria-pressed="mode === 'bell'" :title="mode === 'bell' ? 'Отправится уведомлением: у коллег всплывёт плашка' : 'Отправить уведомлением — у коллег всплывёт плашка, пока не закроют'" @click="mode = mode === 'bell' ? '' : 'bell'; cargoMenu = false"><AppIcon name="bell" :size="16" /></button>
      <span class="cw">
        <button class="bell chute" :class="{ on: cargoOf }" type="button" :aria-pressed="!!cargoOf" :aria-expanded="cargoMenu" :title="cargoOf ? `Отправится посылкой: ${cargoOf.title}` : 'Отправить посылкой — аист, кран или парашют'" @click="toggleCargo">
          <template v-if="cargoOf"><ParcelArt v-if="!cargoOf.em" class="mc" :kind="cargoOf.id" /><span v-else class="ce">{{ cargoOf.em }}</span></template>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 0 1 18 0Z" /><path d="M3 11l8 8M21 11l-8 8M12 11v8" /><rect x="10" y="18" width="4" height="4" rx="1" /></svg>
        </button>
      </span>
      <button class="go" type="button" :disabled="!text.trim()" aria-label="Отправить" @click="send"><AppIcon name="send" :size="16" /></button>
    </div>
  </div>

  <!-- окно «Посылка»: сцена с мини-доставкой, кто несёт, что несёт, эмодзи; двигается за шапку -->
  <Teleport to="body">
    <div v-if="cargoMenu && cargoOf" ref="win" class="cmenu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" role="dialog" aria-label="Посылка" @pointerdown.stop @keydown.esc.stop="cargoMenu = false">
      <div class="chead" title="Потяните, чтобы передвинуть окно" @pointerdown="dragWin"><i class="grip" aria-hidden="true" />Посылка<button class="cx" type="button" title="Не посылкой — обычным сообщением" aria-label="Отменить посылку" @click="resetParcel"><AppIcon name="x" :size="14" /></button></div>
      <div class="pv" aria-hidden="true"><div :key="via + mode" class="pvi" :class="'k-' + mode">
        <span v-if="via === 'chute'" class="pv-chute"><ParcelArt kind="chute" class="pv-sway" /></span>
        <template v-else-if="via === 'crane'">
          <i class="pv-rail" />
          <span class="pv-cx"><i class="pv-tr" /><span class="pv-cy"><svg viewBox="0 0 36 36"><path d="M18 2 L18 18 Q30 18 30 26 Q30 34 20 34 Q11 34 10 26" fill="none" stroke="#e0b13a" stroke-width="5" stroke-linecap="round" /></svg></span></span>
        </template>
        <template v-else>
          <i v-for="n in (TRAIL[mode] ? 3 : 0)" :key="n" class="pv-t" :class="['n' + n, { rise: mode === 'heart' }]"><svg v-if="TRAIL[mode] === 'f'" viewBox="0 0 30 12"><path d="M1 6 Q10 -2 29 6 Q10 14 1 6 Z" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="1.5" /></svg><template v-else>{{ TRAIL[mode] }}</template></i>
          <span class="pv-bird"><i class="pv-rope" /><ParcelArt kind="bird" flap :mood="MOOD[mode] || 'happy'" /></span>
        </template>
        <span class="pv-box" :class="'by-' + via"><ParcelArt v-if="!cargoOf.em" :class="'pc-' + mode" :kind="mode" :text="mode === 'note' ? text.trim() || 'Ку-ку!' : ''" /><span v-else class="pv-em">{{ cargoOf.em }}</span></span>
      </div></div>
      <p class="ccap">{{ caption }}</p>
      <b>Кто несёт</b>
      <div class="ctiles c3"><button v-for="v in VIAS" :key="v.id" class="ct" :class="{ on: via === v.id }" type="button" :aria-pressed="via === v.id" @click="via = v.id"><ParcelArt :kind="v.id" />{{ v.title }}</button></div>
      <b>Что несёт</b>
      <div class="ctiles c4"><button v-for="c in mainCargo" :key="c.id" class="ct" :class="{ on: mode === c.id }" type="button" :aria-pressed="mode === c.id" @click="pickCargo(c.id)"><ParcelArt v-if="!c.em" :kind="c.id" /><span v-else class="ce">{{ c.em }}</span>{{ c.title }}</button></div>
      <div class="cmore"><button v-for="c in moreCargo" :key="c.id" type="button" :class="{ on: mode === c.id }" :title="c.title" :aria-label="c.title" :aria-pressed="mode === c.id" @click="pickCargo(c.id)">{{ c.em }}</button></div>
      <b>Эмодзи внутрь — вылетят при открытии<small v-if="emo.length"> · {{ emo.length }} из {{ PARCEL_EMOJI_MAX }}</small></b>
      <div class="cemo"><button v-for="e in [...PARCEL_EMOJI, ...emo.filter((x) => !PARCEL_EMOJI.includes(x))]" :key="e" type="button" :class="{ on: emo.includes(e) }" :aria-pressed="emo.includes(e)" @click="toggleEmo(e)">{{ e }}</button></div>
      <input v-model="emoText" class="cin" type="text" placeholder="Или любые — с клавиатуры" maxlength="40" aria-label="Свои эмодзи" @input="onEmoInput" />
      <button class="cok" type="button" @click="goAim">Выбрать, куда сбросить</button>
    </div>
  </Teleport>

  <!-- правый клик -->
  <div v-if="menu" class="sn-bg" @pointerdown="menu = null" @contextmenu.prevent="menu = null" />
  <div v-if="menu" class="sn-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" role="menu">
    <button type="button" role="menuitem" @click="startAt(menu.x, menu.y)"><AppIcon name="chat" :size="16" />Оставить заметку здесь<kbd>C</kbd></button>
  </div>
  <!-- «Новая заметка» из списка: нажмите на экран -->
  <div v-if="S.placing" class="sn-place">Нажмите на экран, где оставить заметку <button type="button" @click="S.placing = false">Отмена</button></div>

  <!-- всплывающие уведомления: висят, пока не закроют крестиком -->
  <ParachuteDrop v-if="live.on" />
  <!-- посылка: куда сбросить — линия за курсором, нажатие отправляет -->
  <div v-if="S.aim" class="sn-aim"><span class="ln" :style="{ left: aimX + 'px' }" /><span class="msg">Нажмите, куда сбросить посылку <button type="button" @click.stop="S.aim = null">Отмена</button></span></div>
  <div v-if="popups.length" class="sn-pops">
    <div v-for="p in popups" :key="p.id + p.at" class="pop" role="alert">
      <button class="x" type="button" aria-label="Закрыть — прочитано" @click="closePopup(p.id)"><AppIcon name="x" :size="13" /></button>
      <span class="av" :style="{ '--c': p.from.color }"><img v-if="p.from.photo" :src="p.from.photo" alt="" referrerpolicy="no-referrer" /><b v-else>{{ ini(p.from.name) }}</b></span>
      <span class="pb"><b>{{ p.from.name }}</b><span>{{ p.m?.text }}</span><button type="button" @click="openPopup(p)">Открыть и ответить</button></span>
    </div>
  </div>
</template>

<style scoped>
/* Булавка: кружок с фото автора, «хвостик» снизу слева указывает на место */
.sn-pin { position: fixed; left: 0; top: 0; z-index: 30; display: grid; place-items: center; width: 34px; height: 34px; margin: -34px 0 0 0; padding: 0; border: 0; border-radius: 50% 50% 50% 4px; background: var(--card); box-shadow: 0 3px 10px rgba(0, 0, 0, .25); cursor: pointer; transition: transform .08s linear }
.sn-pin > img, .sn-pin > b { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; display: grid; place-items: center; background: var(--c); color: #fff; font-size: 12px; font-weight: 900 }
.sn-pin em { position: absolute; right: -5px; top: -5px; min-width: 16px; height: 16px; padding: 0 3px; box-sizing: border-box; border-radius: 99px; background: var(--hint); color: #fff; font-style: normal; font-size: 10px; font-weight: 900; line-height: 16px; text-align: center; box-shadow: 0 0 0 2px var(--card) }
.sn-pin.unread em, .sn-pin.unread::after { background: var(--blue) }
.sn-pin.unread:not(:has(em))::after { content: ''; position: absolute; right: -2px; top: -2px; width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 2px var(--card) }
.sn-pin { touch-action: none; cursor: grab } .sn-pin.dragging { transition: none; cursor: grabbing; box-shadow: 0 8px 22px rgba(0, 0, 0, .3) }
.sn-pin.on { box-shadow: 0 0 0 2px var(--blue), 0 3px 10px rgba(0, 0, 0, .25) }
.sn-pin.new { pointer-events: none; color: var(--blue); box-shadow: 0 0 0 2px var(--blue), 0 3px 10px rgba(0, 0, 0, .25) }
/* Карточка */
.sn-card.dock:not(.sheet) { left: auto !important; top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px) + 60px); right: 14px; bottom: auto; width: 340px; height: calc((100vh - 76px) / 2); min-height: min(340px, calc(100vh - 76px)); max-height: none }          /* общий чат — справа, в половину высоты экрана */
.hd .cnt { font-weight: 700; color: var(--hint) }
.sn-card { position: fixed; z-index: 60; width: 320px; max-height: 440px; display: flex; flex-direction: column; border-radius: 16px; background: var(--card); box-shadow: 0 14px 40px rgba(0, 0, 0, .2), 0 0 0 1px var(--border); overflow: hidden; animation: snp .14s ease-out }
@keyframes snp { from { opacity: 0; transform: scale(.96) } }
.sn-card.sheet { left: 0; right: 0; bottom: 0; top: auto; width: auto; max-height: 70vh; border-radius: 20px 20px 0 0; padding-bottom: var(--safe-b) }
.hd { display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 14px; background: var(--surface); border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 900; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.hd > span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.ib { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--hint); display: grid; place-items: center; cursor: pointer } .ib:hover { background: var(--border); color: var(--text) } .ib.del:hover { background: var(--red-l); color: var(--red) }
.msgs { flex: 1; overflow: auto; padding: 4px 0 }
.m { display: flex; gap: 10px; padding: 8px 14px }
.av { flex: none; width: 28px; height: 28px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: var(--c); color: #fff; font-size: 12px; font-weight: 900 }
.av img { width: 100%; height: 100%; object-fit: cover }
.mb { flex: 1; min-width: 0; display: grid; gap: 2px }
.mh { position: relative; display: flex; align-items: center; font-size: 12px; font-weight: 900; color: var(--text) } .mh .pen { margin-left: auto; display: inline-grid; place-items: center } .mh .pen + .add { margin-left: 4px } .mh .add:not(.pen):first-of-type { margin-left: auto }
.ed { width: 100%; box-sizing: border-box; margin: 2px 0; padding: 6px 10px; border: 0; border-radius: 10px; background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--blue); font: inherit; font-size: 14px; font-weight: 700; line-height: 1.35; color: var(--text); resize: none; field-sizing: content } .ed:focus { outline: none }
.edd { font-size: 11px; font-weight: 700; color: var(--hint-2) }
.mh .add { height: 22px; padding: 0 7px; font-size: 11px } .mh small { margin-left: 6px; font-weight: 700; color: var(--hint-2) }
.mt { font-size: 14px; font-weight: 700; line-height: 1.35; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere }
.re { position: relative; display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px }
.r { height: 24px; padding: 0 8px; border: 0; border-radius: 99px; background: var(--surface); font: inherit; font-size: 12.5px; font-weight: 800; color: var(--hint); cursor: pointer }
.r.me { background: var(--blue-l); color: var(--blue-d, #1278b0); box-shadow: inset 0 0 0 1px var(--blue) }
.r.add { opacity: 0; transition: opacity .1s } .m:hover .r.add, .r.add[aria-expanded='true'], .sheet .r.add { opacity: 1 }
.pick { position: fixed; z-index: 70; display: flex; gap: 2px; padding: 4px; border-radius: 99px; background: var(--card); box-shadow: 0 6px 18px rgba(0, 0, 0, .18), 0 0 0 1px var(--border) }
.pick button { width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: none; font-size: 17px; cursor: pointer } .pick button:hover { background: var(--surface) }
.rd { padding: 0 14px 6px 52px; font-size: 11px; font-weight: 800; color: var(--hint-2) } .rd.ok { color: var(--blue) }
.typ { display: flex; align-items: center; gap: 8px; padding: 0 14px 8px; font-size: 12px; font-weight: 800; color: var(--c) }
.dots { display: inline-flex; gap: 3px; padding: 6px 8px; border-radius: 99px; background: var(--surface) }
.dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--hint); animation: dt 1s infinite } .dots i:nth-child(2) { animation-delay: .15s } .dots i:nth-child(3) { animation-delay: .3s }
@keyframes dt { 0%, 60%, 100% { opacity: .3 } 30% { opacity: 1 } }
.in { display: flex; align-items: flex-end; gap: 6px; padding: 8px 8px 8px 12px; border-top: 1px solid var(--border) }
.in textarea { flex: 1; min-height: 34px; max-height: 120px; margin: 0; padding: 7px 12px; box-sizing: border-box; border: 0; border-radius: 17px; background: var(--surface); font: inherit; font-size: 14px; font-weight: 700; line-height: 20px; color: var(--text); resize: none; field-sizing: content }
.in textarea:focus { outline: none; box-shadow: inset 0 0 0 1.5px var(--blue) }
.bell, .go { flex: none; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer }
.bell { background: none; color: var(--hint) } .bell:hover { background: var(--surface) } .bell.on { background: var(--orange-l); color: var(--orange-d) }
.cw { position: relative; display: grid } .chute .ce { font-size: 18px; line-height: 1 } .chute .mc { width: 22px; height: 19px; font-size: 0 } .bell.chute.on { background: #ffe6e6; color: #e5484d }
/* окно «Посылка» (в body, поверх всего; двигается за шапку) */
.cmenu { position: fixed; z-index: 70; width: min(340px, calc(100vw - 16px)); max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); overflow: auto; box-sizing: border-box; padding: 0 12px 12px; border-radius: 16px; background: var(--card); color: var(--text); box-shadow: 0 12px 34px rgba(0, 0, 0, .2), 0 0 0 1px var(--border); font: 700 14px/1.3 var(--font) }
.chead { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; height: 40px; margin: 0 -12px; padding: 0 6px 0 12px; background: var(--card); font-size: 14px; font-weight: 800; cursor: grab; touch-action: none; user-select: none }
.chead:active { cursor: grabbing }
.grip { width: 10px; height: 14px; opacity: .45; background: radial-gradient(circle, currentColor 1.2px, transparent 1.6px) 0 0 / 5px 5px }
.cx { margin-left: auto; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--hint); display: grid; place-items: center; cursor: pointer } .cx:hover { background: var(--surface) }
.cmenu > b { display: block; margin: 10px 0 6px; font-size: 12px; font-weight: 900; color: var(--hint) }
.cmenu > b small { font: inherit; color: var(--hint-2) }
.ccap { margin: 8px 0 0; min-height: 18px; text-align: center; font-size: 13px; font-weight: 800 }
.ctiles { display: grid; gap: 6px } .c3 { grid-template-columns: repeat(3, 1fr) } .c4 { grid-template-columns: repeat(4, 1fr) }
.ct { height: 68px; padding: 0; border: 0; border-radius: 12px; background: var(--surface); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font: inherit; font-size: 12px; font-weight: 800; color: var(--text); cursor: pointer }
.ct > svg { width: 50px; height: 35px } .ct .ce { font-size: 28px; line-height: 35px } .ct.on { background: var(--blue-l) }
.cmore { display: flex; gap: 4px; margin-top: 6px } .cmore button { width: 36px; height: 34px; padding: 0; border: 0; border-radius: 10px; background: none; font-size: 20px; line-height: 1; cursor: pointer }
.cmore button:hover { background: var(--surface) } .cmore button.on { background: var(--blue-l) }
.cemo { display: grid; grid-template-columns: repeat(9, 1fr); gap: 2px }
.cemo button { height: 32px; padding: 0; border: 0; border-radius: 8px; background: none; font-size: 19px; line-height: 1; cursor: pointer }
.cemo button:hover { background: var(--surface) } .cemo button.on { background: var(--blue-l) }
.cin { width: 100%; height: 34px; margin-top: 6px; padding: 0 10px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); font: inherit; font-size: 13px; font-weight: 700 }
.cok { width: 100%; height: 44px; margin-top: 10px; border: 0; border-radius: 12px; background: var(--blue); color: #fff; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer }
/* сцена: мини-доставка по кругу (координаты — в макете 372×140, целиком ужата под ширину окна) */
.pv { position: relative; height: 118px; border-radius: 12px; background: var(--surface); overflow: hidden }
.pvi { position: absolute; left: 50%; top: 20px; width: 372px; height: 140px; margin-left: -186px; transform: scale(.7); transform-origin: 50% 0 }      /* 20px сверху — запас высоты для полёта */
.pvi > *, .pv-bird > *, .pv-cx > * { position: absolute }
.pv-chute { left: 131px; top: 0; width: 110px; height: 82px; transform-origin: 50% 100%; animation: pv-chute 4.5s ease-in-out infinite }
.pv-sway { width: 110px; height: 82px; transform-origin: 50% 100%; animation: pv-sway 1.3s ease-in-out infinite }
.pv-rail { left: -80px; right: -80px; top: -29px; height: 8px; background: #f2c94c; border-bottom: 2px solid #a8841f }
.pv-cx { left: 160px; top: -29px; width: 52px; height: 149px; animation: pv-cx 4.5s ease-in-out infinite }
.pv-tr { left: 0; top: 4px; width: 52px; height: 16px; border-radius: 4px; background: #4b4b4b }
.pv-cy { left: 24px; top: 20px; width: 4px; height: 33px; background: #4b4b4b; animation: pv-cy 4.5s ease-in-out infinite }
.pv-cy svg { position: absolute; left: -13px; bottom: -28px; width: 30px; height: 30px }
.pv-bird { left: 120px; top: 2px; width: 132px; height: 90px; transform-origin: 70px 40px; animation: pv-bird 4.5s ease-in-out infinite }
.pv-bird > svg { left: 0; top: 0; width: 132px; height: 84px } .pv-rope { left: 123px; top: 28px; width: 2px; height: 52px; background: #8a6a4a }
.pv-box { left: 156px; top: 80px; width: 60px; height: 56px; display: grid; place-items: center; transform-origin: 50% 100% }
.pv-box.by-chute { animation: pv-fall 4.5s ease-in-out infinite } .pv-box.by-crane { animation: pv-cbox 4.5s ease-in-out infinite } .pv-box.by-bird { left: 214px; animation: pv-bbox 4.5s ease-in-out infinite }
.pv-box > svg { width: 60px; height: 50px } .pv-box > .pc-note { width: 60px; height: 54px } .pv-em { font-size: 44px; line-height: 1 }
/* характер аиста по грузу — те же сценки, что при настоящей доставке (ParachuteDrop.vue), в миниатюре */
.k-chest .pv-bird { animation-name: pv-birdH } .k-chest .pv-box.by-bird { animation-name: pv-bboxH }
@keyframes pv-birdH { 0% { transform: translate(-320px, -18px) } 15% { transform: translate(-210px, 2px) } 30% { transform: translate(-105px, -16px) } 45% { transform: translate(0, 4px) rotate(6deg) } 50% { transform: translate(4px, -34px) rotate(-14deg) } 56% { transform: translate(20px, -20px) } 82%, 100% { transform: translate(330px, -70px) rotate(-6deg) } }
@keyframes pv-bboxH { 0% { transform: translate(-320px, -18px); opacity: 1 } 15% { transform: translate(-210px, 2px) } 30% { transform: translate(-105px, -16px) } 45% { transform: translate(0, 4px) } 48% { transform: translate(0, 4px) scale(1.14, .82) } 52% { transform: translate(0, 4px) } 93% { transform: translate(0, 4px); opacity: 1 } 100% { transform: translate(0, 4px); opacity: 0 } }
.k-gift .pv-bird, .k-cake .pv-bird { animation-name: pv-birdG } .k-gift .pv-box.by-bird, .k-cake .pv-box.by-bird { animation-name: pv-bboxG }
@keyframes pv-birdG { 0% { transform: translate(-320px, -26px) rotate(0deg) } 32% { transform: translate(0, -26px) rotate(0deg) } 48% { transform: translate(0, 4px) rotate(0deg) } 56% { transform: translate(0, -20px) rotate(0deg) } 90%, 100% { transform: translate(330px, -80px) rotate(-360deg) } }
@keyframes pv-bboxG { 0% { transform: translate(-320px, -26px); opacity: 1 } 32% { transform: translate(0, -26px) } 48% { transform: translate(0, 4px) } 93% { transform: translate(0, 4px); opacity: 1 } 100% { transform: translate(0, 4px); opacity: 0 } }
.k-mail .pv-bird { animation-name: pv-birdM; animation-timing-function: linear } .k-mail .pv-box.by-bird { animation-name: pv-bboxM; animation-timing-function: linear }
@keyframes pv-birdM { 0% { transform: translate(-320px, -30px) } 34% { transform: translate(0, -30px) } 70%, 100% { transform: translate(330px, -44px) } }
@keyframes pv-bboxM { 0% { transform: translate(-320px, -30px) rotate(0deg); opacity: 1 } 29% { transform: translate(-47px, -30px) rotate(0deg) } 34% { transform: translate(-20px, -18px) rotate(-150deg) } 39% { transform: translate(0, 4px) rotate(-360deg) } 42% { transform: translate(0, 4px) rotate(-360deg) scale(1.1, .86) } 46% { transform: translate(0, 4px) rotate(-360deg) } 93% { transform: translate(0, 4px) rotate(-360deg); opacity: 1 } 100% { transform: translate(0, 4px) rotate(-360deg); opacity: 0 } }
.k-note .pv-bird { animation-name: pv-birdN } .k-note .pv-box.by-bird { animation-name: pv-bboxN }
@keyframes pv-birdN { 0% { transform: translate(-320px, -28px) } 15% { transform: translate(-210px, -16px) } 30% { transform: translate(-105px, -28px) } 45% { transform: translate(0, -24px) rotate(3deg) } 50% { transform: translate(4px, -44px) rotate(-10deg) } 56% { transform: translate(20px, -36px) } 82%, 100% { transform: translate(330px, -90px) rotate(-6deg) } }
@keyframes pv-bboxN { 0% { transform: translate(-320px, -28px); opacity: 1 } 15% { transform: translate(-210px, -16px) } 30% { transform: translate(-105px, -28px) } 45% { transform: translate(0, -24px) rotate(0deg) } 52% { transform: translate(-12px, -14px) rotate(-12deg) } 59% { transform: translate(10px, -4px) rotate(10deg) } 66% { transform: translate(0, 4px) rotate(0deg) } 93% { transform: translate(0, 4px); opacity: 1 } 100% { transform: translate(0, 4px); opacity: 0 } }
.k-poo .pv-bird { animation-name: pv-birdP }
@keyframes pv-birdP { 0% { transform: translate(-320px, -6px) } 15% { transform: translate(-210px, 8px) } 30% { transform: translate(-105px, -6px) } 45% { transform: translate(0, 0) rotate(3deg) } 50% { transform: translate(4px, -22px) rotate(-10deg) } 66%, 100% { transform: translate(330px, -70px) rotate(-8deg) } }
.pv-t { top: 46px; font-style: normal; font-size: 14px; line-height: 1; opacity: 0; animation: pv-tfall 4.5s linear infinite } .pv-t svg { display: block; width: 18px; height: 8px }
.pv-t.n1 { left: 75px; animation-delay: 1.35s } .pv-t.n2 { left: 130px; animation-delay: 1.7s } .pv-t.n3 { left: 180px; animation-delay: 2s }
.pv-t.rise { animation-name: pv-trise }
@keyframes pv-tfall { 0% { opacity: 0; transform: none } 3% { opacity: 1 } 22% { opacity: 0; transform: translate(-8px, 70px) rotate(60deg) } 100% { opacity: 0 } }
@keyframes pv-trise { 0% { opacity: 0; transform: scale(.5) } 3% { opacity: 1; transform: scale(1) } 22% { opacity: 0; transform: translateY(-40px) scale(1.2) } 100% { opacity: 0 } }
@keyframes pv-fall { 0% { transform: translateY(-175px); opacity: 1 } 22% { transform: translateY(-110px) } 42% { transform: translateY(-45px) } 58% { transform: translateY(0) } 61% { transform: scale(1.12, .84) } 65% { transform: none } 93% { opacity: 1 } 100% { opacity: 0 } }
@keyframes pv-chute { 0% { transform: translateY(-175px); opacity: 1 } 22% { transform: translateY(-110px) } 42% { transform: translateY(-45px) } 58% { transform: translateY(0); opacity: 1 } 66%, 100% { transform: translateY(8px) scaleY(.3); opacity: 0 } }
@keyframes pv-sway { 0%, 100% { transform: rotate(-5deg) } 50% { transform: rotate(5deg) } }
@keyframes pv-cx { 0% { transform: translateX(-280px) } 28%, 72% { transform: translateX(0) } 95%, 100% { transform: translateX(280px) } }
@keyframes pv-cy { 0%, 28% { height: 33px } 52%, 58% { height: 63px } 70%, 100% { height: 33px } }
@keyframes pv-cbox { 0% { transform: translate(-280px, -30px); opacity: 1 } 28% { transform: translate(0, -30px) } 52% { transform: translate(0, 0) } 55% { transform: scale(1.1, .86) } 59% { transform: none } 93% { opacity: 1 } 100% { opacity: 0 } }
@keyframes pv-bird { 0% { transform: translate(-320px, -6px) } 15% { transform: translate(-210px, 8px) } 30% { transform: translate(-105px, -6px) } 45% { transform: translate(0, 0) rotate(3deg) } 50% { transform: translate(4px, -22px) rotate(-10deg) } 56% { transform: translate(20px, -14px) } 82%, 100% { transform: translate(330px, -70px) rotate(-6deg) } }
@keyframes pv-bbox { 0% { transform: translate(-320px, -6px); opacity: 1 } 15% { transform: translate(-210px, 8px) } 30% { transform: translate(-105px, -6px) } 45% { transform: translate(0, 0) } 48% { transform: translate(0, 4px) scale(1.1, .86) } 52% { transform: translate(0, 4px) } 93% { transform: translate(0, 4px); opacity: 1 } 100% { transform: translate(0, 4px); opacity: 0 } }
.go { background: var(--blue); color: #fff } .go:disabled { background: var(--border); color: var(--hint-2); cursor: default }
/* Правый клик */
.sn-bg { position: fixed; inset: 0; z-index: 70 }
.sn-menu { position: fixed; z-index: 71; min-width: 240px; padding: 4px; border-radius: 12px; background: var(--card); box-shadow: 0 12px 34px rgba(0, 0, 0, .2), 0 0 0 1px var(--border) }
.sn-menu button { display: flex; align-items: center; gap: 10px; width: 100%; height: 38px; padding: 0 10px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 14px; font-weight: 800; color: var(--text); cursor: pointer }
.sn-menu button:hover { background: var(--blue-l) } .sn-menu kbd { margin-left: auto; font-family: inherit; font-size: 11px; color: var(--hint) }
.sn-aim { position: fixed; inset: 0; z-index: 69; cursor: crosshair; background: rgba(28, 176, 246, .04) }
.sn-aim .ln { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed var(--blue) }
.sn-aim .msg { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-radius: 99px; background: var(--text); color: var(--card); font-size: 13px; font-weight: 800; box-shadow: 0 8px 24px rgba(0, 0, 0, .25) }
.sn-aim .msg button { height: 28px; padding: 0 10px; border: 0; border-radius: 99px; background: rgba(255, 255, 255, .2); color: inherit; font: inherit; cursor: pointer }
.sn-place { position: fixed; z-index: 70; left: 50%; top: 12px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-radius: 99px; background: var(--text); color: var(--card); font-size: 13px; font-weight: 800; box-shadow: 0 8px 24px rgba(0, 0, 0, .25) }
.sn-place button { height: 28px; padding: 0 10px; border: 0; border-radius: 99px; background: rgba(255, 255, 255, .2); color: inherit; font: inherit; cursor: pointer }
/* Всплывающие уведомления — справа сверху, под «Сейчас здесь»; висят, пока не закроют */
.sn-pops { position: fixed; z-index: 80; right: 14px; top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px) + 60px); display: grid; gap: 8px; width: 340px }
.pop { position: relative; display: flex; gap: 12px; padding: 12px 14px; border-radius: 16px; background: var(--card); box-shadow: 0 14px 40px rgba(0, 0, 0, .22), 0 0 0 2px var(--orange); animation: pin .25s cubic-bezier(.3, 1.4, .5, 1) }
@keyframes pin { from { opacity: 0; transform: translateY(-14px) scale(.96) } }
.pop .av { width: 40px; height: 40px; font-size: 16px; box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--c) }
.pb { flex: 1; min-width: 0; display: grid; gap: 3px } .pb b { font-size: 13px; font-weight: 900 } .pb > span { font-size: 15px; font-weight: 800; color: var(--text); line-height: 1.3; overflow-wrap: anywhere }
.pb button { justify-self: start; margin-top: 4px; height: 30px; padding: 0 12px; border: 0; border-radius: 9px; background: var(--blue); color: #fff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.pop .x { position: absolute; right: 8px; top: 8px; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; background: var(--surface); color: var(--hint); display: grid; place-items: center; cursor: pointer }
@media (max-width: 719px) { .sn-pops { left: 10px; right: 10px; width: auto; top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px) + 10px) } }
</style>

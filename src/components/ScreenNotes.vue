<script setup>
// Заметки на общем экране — мини-чат преподавателей (логика: composables/useNotes.js, сервер: server/notes.ts).
//  • Правый клик (или клавиша C) → «Оставить заметку здесь»: булавка приклеивается к месту на странице, у коллег — сразу.
//  • Свои сообщения можно исправить (карандаш у сообщения) — у коллег пометка «изм.».
//  • Булавку можно перетащить на другое место — у коллег она переедет сразу.
//  • Нажал на булавку — карточка: сообщения, реакции, «печатает…», «Прочитано», поле ответа. «Готово» — заметка решена.
//  • Колокольчик у кнопки «Отправить» — уведомлением: у коллеги всплывает плашка и висит, пока не закроет крестиком.
//  • На телефоне карточка — снизу во всю ширину; новую заметку ставят из списка у «Сейчас здесь» («Новая заметка» → нажать на экран).
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { live, WHERE } from '../composables/useLive'
import { notesState as S, noteById, REACTIONS, unread, createNote, reply, react, setDone, removeNote, typing, openNote, closePopup, wireNotes, moveNote, editMsg } from '../composables/useNotes'
import { anchorAt, placeOf } from '../utils/anchor'

wireNotes()
const route = useRoute(), router = useRouter()
const tick = ref(0), now = ref(Date.now())
const re = () => { tick.value++ }
const whereOf = () => WHERE[route.meta.tab] || (route.meta.tab === 'info' ? 'Инфо' : '')

// --- булавки на этой странице ---
const pins = computed(() => {
  void tick.value
  return S.list.filter((n) => n.path === route.fullPath && (!n.done || S.open === n.id)).map((n) => ({ n, at: placeOf(n), unread: unread(n) }))
})
// --- перенос булавки: потянул (больше 5 px) — едет за пальцем/мышью, отпустил — приклеилась на новое место (у всех) ---
const drag = ref(null)          // { id, x, y }
function pinDown(e, n) {
  if (e.button > 0) return
  const sx = e.clientX, sy = e.clientY, pin = e.currentTarget
  let moved = false
  const mv = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
    moved = true; drag.value = { id: n.id, x: ev.clientX, y: ev.clientY }
  }
  const up = (ev) => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up)
    if (!moved) return
    pin.style.visibility = 'hidden'                               // чтобы под пальцем нашёлся элемент страницы, а не сама булавка
    const at = anchorAt(ev.clientX, ev.clientY)
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
const anchor = computed(() => { void tick.value; return drag.value && drag.value.id === S.open ? drag.value : note.value ? placeOf(note.value) : S.draft ? placeOf(S.draft) : null })
const mobile = ref(innerWidth < 720)
const cardPos = computed(() => {
  const a = anchor.value; if (!a || mobile.value) return null
  const W = 320, H = note.value ? 440 : 130
  const left = a.x + 26 + W > innerWidth - 8 ? a.x - 26 - W : a.x + 26
  return { left: Math.max(8, left) + 'px', top: Math.max(8, Math.min(a.y - 18, innerHeight - H - 8)) + 'px' }
})
const close = () => { S.open = null; S.draft = null }

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
const text = ref(''), loud = ref(false), ta = ref(null), picker = ref('')
function send() {
  const t = text.value.trim(); if (!t) return
  if (S.draft) createNote(t, loud.value); else if (S.open) reply(S.open, t, loud.value)
  text.value = ''; loud.value = false
}
function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  else if (e.key === 'Escape') close()
  else typing(S.open)
}
watch(() => S.open || (S.draft && 'new'), (v) => { picker.value = ''; if (v) nextTick(() => ta.value?.focus()) })
const mine = (m) => m.uid === S.me
// Исправить своё сообщение: карандаш у сообщения → поле на месте текста; Enter — сохранить, Esc — отмена
const editing = ref(''), editText = ref('')
function startEdit(m) { editing.value = m.id; editText.value = m.text; nextTick(() => document.querySelector('.sn-card .ed')?.focus()) }
function saveEdit() { if (editing.value && editText.value.trim()) editMsg(S.open, editing.value, editText.value); editing.value = '' }
function onEditKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } else if (e.key === 'Escape') { e.stopPropagation(); editing.value = '' } }
const reacts = (m) => Object.entries(m.react || {}).map(([e, who]) => ({ e, n: who.length, me: who.includes(S.me) }))

// --- правый клик → «Оставить заметку здесь» ---
const menu = ref(null)
const editable = (el) => el?.closest?.('input, textarea, select, [contenteditable="true"]')
function onContext(e) {
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
const onMove = (e) => { lastX = e.clientX; lastY = e.clientY }
function onKeyGlobal(e) {
  if (!live.on || editable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'c' || e.key === 'с' || e.key === 'C' || e.key === 'С') { e.preventDefault(); startAt(lastX, lastY) }
  else if (e.key === 'Escape') { close(); menu.value = null; S.placing = false }
}
function onPlace(e) { if (S.placing) { e.preventDefault(); e.stopPropagation(); startAt(e.clientX, e.clientY) } }

// --- всплывающие уведомления ---
const popups = computed(() => S.popups.map((p) => { const n = noteById(p.id); return n && { ...p, n, m: n.msgs.find((x) => x.id === p.mid) || n.msgs.at(-1) } }).filter(Boolean))
function openPopup(p) {
  closePopup(p.id, true)
  if (p.n.path !== route.fullPath) router.push(p.n.path)
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
watch(() => route.fullPath, () => { menu.value = null; S.draft = null; re() })
</script>

<template>
  <!-- булавки -->
  <button v-for="p in pins" :key="p.n.id" class="sn-pin" :class="{ on: S.open === p.n.id, unread: p.unread, done: p.n.done, dragging: drag?.id === p.n.id }" :style="{ transform: `translate(${pinAt(p).x}px, ${pinAt(p).y}px)`, '--c': p.n.msgs[0].color }"
    :aria-label="`Заметка: ${p.n.msgs[0].text}`" :title="p.n.msgs[0].text" @pointerdown="pinDown($event, p.n)" @click.stop="pinClick(p.n)" @dragstart.prevent>
    <img v-if="p.n.msgs[0].photo" :src="p.n.msgs[0].photo" alt="" referrerpolicy="no-referrer" /><b v-else>{{ ini(p.n.msgs[0].name) }}</b>
    <em v-if="p.n.msgs.length > 1">{{ p.n.msgs.length }}</em>
  </button>
  <!-- черновик новой заметки: булавка-«+» -->
  <span v-if="S.draft && anchor" class="sn-pin new" :style="{ transform: `translate(${anchor.x}px, ${anchor.y}px)` }"><AppIcon name="plus" :size="16" /></span>

  <!-- карточка -->
  <div v-if="(note || S.draft) && anchor" class="sn-card" :class="{ sheet: mobile }" :style="cardPos" role="dialog" :aria-label="note ? 'Заметка' : 'Новая заметка'" @pointerdown.stop>
    <div class="hd">
      <span>{{ note ? `Заметка${note.where ? ' · ' + note.where : ''}` : 'Новая заметка' }}</span>
      <button v-if="note && note.by === S.me" class="ib" type="button" title="Удалить заметку" aria-label="Удалить заметку" @click="removeNote(note.id)"><AppIcon name="trash" :size="14" /></button>
      <button v-if="note" class="done" :class="{ on: note.done }" type="button" @click="setDone(note.id, !note.done); !note.done && close()"><AppIcon name="check" :size="13" />{{ note.done ? 'Решено' : 'Готово' }}</button>
      <button class="ib" type="button" aria-label="Закрыть" @click="close"><AppIcon name="x" :size="14" /></button>
    </div>
    <div v-if="note" class="msgs">
      <div v-for="m in note.msgs" :key="m.id" class="m">
        <span class="av" :style="{ '--c': m.color }"><img v-if="m.photo" :src="m.photo" alt="" referrerpolicy="no-referrer" /><b v-else>{{ ini(m.name) }}</b></span>
        <span class="mb">
          <span class="mh">{{ mine(m) ? 'Вы' : m.name }}<small>{{ time(m.at) }}</small>
            <button v-if="mine(m) && editing !== m.id" class="r add pen" type="button" title="Исправить" aria-label="Исправить сообщение" @click="startEdit(m)"><AppIcon name="pencil" :size="12" /></button>
            <button class="r add" type="button" :aria-expanded="picker === m.id" title="Реакция" aria-label="Реакция" @click="picker = picker === m.id ? '' : m.id">+ 🙂</button>
            <span v-if="picker === m.id" class="pick"><button v-for="e in REACTIONS" :key="e" type="button" @click="react(note.id, m.id, e); picker = ''">{{ e }}</button></span></span>
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
      <textarea ref="ta" v-model="text" rows="1" :placeholder="note ? 'Ответить…' : 'Напишите — увидят все, кто в приложении'" maxlength="1000" @keydown="onKey" />
      <button class="bell" :class="{ on: loud }" type="button" :aria-pressed="loud" :title="loud ? 'Отправится уведомлением: у коллег всплывёт плашка' : 'Отправить уведомлением — у коллег всплывёт плашка, пока не закроют'" @click="loud = !loud"><AppIcon name="bell" :size="16" /></button>
      <button class="go" type="button" :disabled="!text.trim()" aria-label="Отправить" @click="send"><AppIcon name="send" :size="16" /></button>
    </div>
  </div>

  <!-- правый клик -->
  <div v-if="menu" class="sn-bg" @pointerdown="menu = null" @contextmenu.prevent="menu = null" />
  <div v-if="menu" class="sn-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" role="menu">
    <button type="button" role="menuitem" @click="startAt(menu.x, menu.y)"><AppIcon name="chat" :size="16" />Оставить заметку здесь<kbd>C</kbd></button>
  </div>
  <!-- «Новая заметка» из списка: нажмите на экран -->
  <div v-if="S.placing" class="sn-place">Нажмите на экран, где оставить заметку <button type="button" @click="S.placing = false">Отмена</button></div>

  <!-- всплывающие уведомления: висят, пока не закроют крестиком -->
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
.sn-pin.on { box-shadow: 0 0 0 2px var(--blue), 0 3px 10px rgba(0, 0, 0, .25) } .sn-pin.done { opacity: .6 }
.sn-pin.new { pointer-events: none; color: var(--blue); box-shadow: 0 0 0 2px var(--blue), 0 3px 10px rgba(0, 0, 0, .25) }
/* Карточка */
.sn-card { position: fixed; z-index: 60; width: 320px; max-height: 440px; display: flex; flex-direction: column; border-radius: 16px; background: var(--card); box-shadow: 0 14px 40px rgba(0, 0, 0, .2), 0 0 0 1px var(--border); overflow: hidden; animation: snp .14s ease-out }
@keyframes snp { from { opacity: 0; transform: scale(.96) } }
.sn-card.sheet { left: 0; right: 0; bottom: 0; top: auto; width: auto; max-height: 70vh; border-radius: 20px 20px 0 0; padding-bottom: var(--safe-b) }
.hd { display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 14px; background: var(--surface); border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 900; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.hd > span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.ib { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--hint); display: grid; place-items: center; cursor: pointer } .ib:hover { background: var(--border); color: var(--text) }
.done { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 9px; border: 0; border-radius: 8px; background: var(--card); box-shadow: inset 0 0 0 1px var(--border); font: inherit; font-size: 11px; color: var(--green-d); text-transform: none; letter-spacing: 0; cursor: pointer }
.done.on { background: var(--green-l) }
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
.pick { position: absolute; right: 0; bottom: calc(100% + 4px); z-index: 2; display: flex; gap: 2px; padding: 4px; border-radius: 99px; background: var(--card); box-shadow: 0 6px 18px rgba(0, 0, 0, .18), 0 0 0 1px var(--border) }
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
.go { background: var(--blue); color: #fff } .go:disabled { background: var(--border); color: var(--hint-2); cursor: default }
/* Правый клик */
.sn-bg { position: fixed; inset: 0; z-index: 70 }
.sn-menu { position: fixed; z-index: 71; min-width: 240px; padding: 4px; border-radius: 12px; background: var(--card); box-shadow: 0 12px 34px rgba(0, 0, 0, .2), 0 0 0 1px var(--border) }
.sn-menu button { display: flex; align-items: center; gap: 10px; width: 100%; height: 38px; padding: 0 10px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 14px; font-weight: 800; color: var(--text); cursor: pointer }
.sn-menu button:hover { background: var(--blue-l) } .sn-menu kbd { margin-left: auto; font-family: inherit; font-size: 11px; color: var(--hint) }
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

<script setup>
// Стикер-закладка в ячейке расписания (пробный урок, звонок, что угодно): без учеников и денег — только текст и цвет.
// Выглядит как клейкая закладка: полупрозрачный цветной пластик с плотным кончиком слева (5 цветов, utils/sticker.js).
// Нажал — рядом окошко: пишем текст и выбираем цвет. В базе это урок с trial: true, пустым списком учеников и color.
// Стикер можно тащить как обычный урок (в другую ячейку или за таблицу — убрать). Сохраняется по «Готово», Esc или нажатию мимо.
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { pressStart, dnd } from '../composables/useDnd'
import { hh, fmtDate } from '../utils/dates'
import { STICKERS, stickerVars, setLastSticker } from '../utils/sticker'

const props = defineProps({
  lesson: { type: Object, required: true },
  autoEdit: { type: Boolean, default: false },      // только что приклеили — сразу печатать
})
const emit = defineEmits(['save', 'remove', 'edited'])

const MAX = 300
const el = ref(null), ta = ref(null)
const open = ref(null)                               // позиция окошка { left, top, width } — пока редактируем
const text = ref(''), color = ref('yellow')
const time = computed(() => hh(props.lesson.hour, props.lesson.minute))
const when = computed(() => `${fmtDate(props.lesson.date)} · ${time.value}`)
const vars = computed(() => stickerVars(props.lesson.color))
const lifted = computed(() => dnd.active && dnd.payload?.kind === 'lesson' && dnd.payload.lesson.id === props.lesson.id)

function edit() {
  if (open.value || !el.value) return
  text.value = props.lesson.note || ''
  color.value = props.lesson.color || 'yellow'
  const r = el.value.getBoundingClientRect(), W = 264, H = 250
  const left = Math.min(Math.max(8, r.left + r.width / 2 - W / 2), innerWidth - W - 8)
  const top = r.bottom + 8 + H > innerHeight ? r.top - 8 - H : r.bottom + 8      // под стикером, а если не влезает — над ним
  open.value = { left: left + 'px', top: Math.max(8, top) + 'px', width: W + 'px' }
  nextTick(() => { ta.value?.focus(); const n = text.value.length; ta.value?.setSelectionRange?.(n, n) })
}
function pick(id) { color.value = id; setLastSticker(id) }
function done() {
  if (!open.value) return
  open.value = null
  const t = text.value.trim().slice(0, MAX), patch = {}
  if (t !== (props.lesson.note || '')) patch.note = t
  if (color.value !== (props.lesson.color || 'yellow')) patch.color = color.value
  if (Object.keys(patch).length) emit('save', patch)
}
function drop() { open.value = null; emit('remove') }
const onKey = (e) => {
  if (e.key === 'Escape') { e.stopPropagation(); done() }
  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) done()
}
const down = (e) => { if (!open.value) pressStart(e, { kind: 'lesson', lesson: props.lesson }) }

watch(() => props.autoEdit, (on) => { if (on) nextTick(() => { edit(); emit('edited') }) }, { immediate: true })
// таблицу пролистали / окно поменялось — окошко закрываем с сохранением, чтобы не висело не там
const close = () => done()
watch(open, (o) => { if (o) { addEventListener('resize', close); addEventListener('scroll', close, true) } else { removeEventListener('resize', close); removeEventListener('scroll', close, true) } })
onUnmounted(() => { removeEventListener('resize', close); removeEventListener('scroll', close, true) })
</script>

<template>
  <button ref="el" class="flag" :class="{ lifted, editing: open, empty: !lesson.note }" :style="vars" :title="lesson.note ? `Стикер, ${time}: ${lesson.note}` : `Стикер, ${time} — нажмите, чтобы написать`"
    :aria-label="`Стикер, ${time}${lesson.note ? ': ' + lesson.note : ''}`" @pointerdown="down" @click.stop="edit" @dragstart.prevent>
    <span class="tx">{{ lesson.note || 'Стикер' }}</span>
  </button>
  <Teleport to="body">
    <div v-if="open" class="st-bg" @pointerdown.self="done">
      <div class="st-pop" :style="open" role="dialog" aria-label="Стикер">
        <div class="st-h"><b>Стикер</b><span>{{ when }}</span></div>
        <div class="st-ta" :style="stickerVars(color)">
          <textarea ref="ta" v-model="text" :maxlength="MAX" rows="3" placeholder="Например: пробный урок, Аня" @keydown="onKey" />
        </div>
        <div class="st-sw" role="radiogroup" aria-label="Цвет стикера">
          <button v-for="s in STICKERS" :key="s.id" type="button" class="sw" :class="{ on: color === s.id }" :style="{ '--c': s.c }" role="radio" :aria-checked="color === s.id" :aria-label="s.title" @click="pick(s.id)" />
        </div>
        <div class="st-f">
          <button class="st-rm" type="button" @click="drop">Убрать</button>
          <small>{{ text.length }}/{{ MAX }}</small>
          <button class="st-ok" type="button" @click="done">Готово</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Закладка: пластик (--bg) с плотным кончиком (--c) слева и бликом сверху */
.flag { position: absolute; left: 3px; right: 3px; top: 5px; bottom: 5px; z-index: 2; display: flex; align-items: center; min-width: 0; padding: 0 6px 0 12px; border: 0; border-radius: 2px 5px 5px 2px; background: var(--bg); box-shadow: 0 1px 2px rgba(0, 0, 0, .14); font: inherit; color: #2b2b2b; text-align: left; cursor: grab; touch-action: manipulation; overflow: hidden }
.flag::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--c) }
.flag::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255, 255, 255, .45), rgba(255, 255, 255, 0) 55%); pointer-events: none }
.flag:hover { box-shadow: 0 2px 6px rgba(0, 0, 0, .2) }
.flag.lifted { opacity: .3 } .flag.editing { box-shadow: 0 0 0 2px var(--blue) }
.tx { position: relative; z-index: 1; min-width: 0; font-size: 12px; font-weight: 800; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere }
.flag.empty .tx { opacity: .5 }
@media (max-width: 719px) { .flag { left: 2px; right: 2px; top: 3px; bottom: 3px; padding: 0 2px 0 7px } .flag::before { width: 4px } .tx { font-size: 10px } }
/* Окошко: текст на «пластике» выбранного цвета, кружки цветов, «Убрать» / «Готово» */
.st-bg { position: fixed; inset: 0; z-index: 70 }
.st-pop { position: fixed; box-sizing: border-box; display: grid; gap: 10px; padding: 12px 14px 10px; border-radius: 14px; background: var(--card); box-shadow: 0 12px 34px rgba(0, 0, 0, .2), 0 0 0 1px var(--border); animation: stp .15s ease-out }
@keyframes stp { from { opacity: 0; transform: scale(.94) } }
.st-h { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: .4px; text-transform: uppercase; color: var(--hint) }
.st-ta { position: relative; border-radius: 8px; background: var(--bg); overflow: hidden }
.st-ta::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 7px; background: var(--c) }
.st-pop textarea { display: block; width: 100%; box-sizing: border-box; min-height: 76px; margin: 0; padding: 8px 10px 8px 17px; border: 0 !important; border-radius: 0; outline: 0; box-shadow: none !important; resize: none; background-color: transparent !important; color: #2b2b2b; font: inherit; font-size: 15px; font-weight: 700; line-height: 22px }
.st-pop textarea::placeholder { color: rgba(0, 0, 0, .35) }
.st-sw { display: flex; gap: 10px }
.sw { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: var(--c); box-shadow: inset 0 0 0 2px rgba(0, 0, 0, .06); cursor: pointer }
.sw.on { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--c) }
.st-f { display: flex; align-items: center; gap: 8px } .st-f small { flex: 1; text-align: right; font-size: 11px; font-weight: 700; color: var(--hint) }
.st-f button { height: 32px; padding: 0 12px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.st-ok { background: var(--blue); color: #fff }
.st-rm { background: transparent; color: var(--red) } .st-rm:hover { background: rgba(229, 57, 53, .1) }
</style>

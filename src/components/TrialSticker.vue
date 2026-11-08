<script setup>
// Пробный урок — жёлтый стикер в ячейке расписания (без учеников, только текст: кто, откуда, контакт…).
// Два вида (меню с решёткой → «Пробный урок»):
//  • «листок» — жёлтая бумажка с загнутым уголком; нажал — бумажка увеличивается прямо на месте, печатаем в ней;
//  • «капсула» — жёлтая капсула с первой строкой текста; нажал — рядом открывается листок в линейку.
// Стикер можно тащить как обычный урок (в другую ячейку или за таблицу — убрать). Текст сохраняется по «Готово», Esc или нажатию мимо.
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { pressStart, dnd } from '../composables/useDnd'
import { hh } from '../store/app'

const props = defineProps({
  lesson: { type: Object, required: true },
  look: { type: String, default: 'note' },          // 'note' | 'capsule'
  autoEdit: { type: Boolean, default: false },      // только что приклеили — сразу печатать
})
const emit = defineEmits(['save', 'remove', 'edited'])

const MAX = 300
const el = ref(null), ta = ref(null)
const open = ref(null)                               // позиция листка { left, top, width } — пока редактируем
const text = ref('')
const time = computed(() => hh(props.lesson.hour, props.lesson.minute))
const firstLine = computed(() => (props.lesson.note || '').split('\n')[0].trim())
const lifted = computed(() => dnd.active && dnd.payload?.kind === 'lesson' && dnd.payload.lesson.id === props.lesson.id)

function edit() {
  if (open.value || !el.value) return
  text.value = props.lesson.note || ''
  const r = el.value.getBoundingClientRect()
  const W = props.look === 'note' ? Math.max(220, r.width + 40) : 260
  const left = Math.min(Math.max(8, props.look === 'note' ? r.left - 6 : r.left + r.width / 2 - W / 2), innerWidth - W - 8)
  const below = props.look === 'note' ? r.top - 6 : r.bottom + 8
  const top = Math.min(below, innerHeight - 230)
  open.value = { left: left + 'px', top: Math.max(8, top) + 'px', width: W + 'px' }
  nextTick(() => { ta.value?.focus(); const n = text.value.length; ta.value?.setSelectionRange?.(n, n) })
}
function done() {
  if (!open.value) return
  open.value = null
  const t = text.value.trim().slice(0, MAX)
  if (t !== (props.lesson.note || '')) emit('save', t)
}
function drop() { open.value = null; emit('remove') }
const onKey = (e) => {
  if (e.key === 'Escape') { e.stopPropagation(); done() }
  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) done()
}
const down = (e) => { if (!open.value) pressStart(e, { kind: 'lesson', lesson: props.lesson }) }

watch(() => props.autoEdit, (on) => { if (on) nextTick(() => { edit(); emit('edited') }) }, { immediate: true })
// таблицу пролистали / окно поменялось — листок закрываем с сохранением, чтобы не висел не там
const close = () => done()
watch(open, (o) => { if (o) { addEventListener('resize', close); addEventListener('scroll', close, true) } else { removeEventListener('resize', close); removeEventListener('scroll', close, true) } })
onUnmounted(() => { removeEventListener('resize', close); removeEventListener('scroll', close, true) })
</script>

<template>
  <button ref="el" class="trial" :class="[look, { lifted, editing: open, empty: !lesson.note }]" :title="lesson.note ? `Пробный урок, ${time}: ${lesson.note}` : `Пробный урок, ${time} — нажмите, чтобы написать`"
    :aria-label="`Пробный урок, ${time}${lesson.note ? ': ' + lesson.note : ''}`" @pointerdown="down" @click.stop="edit" @dragstart.prevent>
    <template v-if="look === 'note'"><span class="tag">Пробный</span><span class="tx">{{ lesson.note || 'Напишите…' }}</span></template>
    <template v-else><i class="dot" /><span class="tx">{{ firstLine || 'Пробный' }}</span></template>
  </button>
  <Teleport to="body">
    <div v-if="open" class="tr-bg" @pointerdown.self="done">
      <div class="tr-pop" :class="look" :style="open" role="dialog" aria-label="Пробный урок">
        <div class="tr-h"><b>Пробный урок</b><span>{{ time }}</span></div>
        <textarea ref="ta" v-model="text" :maxlength="MAX" rows="4" placeholder="Кто придёт, откуда узнал, контакт…" @keydown="onKey" />
        <div class="tr-f">
          <button class="tr-rm" type="button" @click="drop">Убрать</button>
          <small>{{ text.length }}/{{ MAX }}</small>
          <button class="tr-ok" type="button" @click="done">Готово</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.trial { position: absolute; inset: 3px; display: flex; min-width: 0; padding: 0; border: 0; font: inherit; color: #5c4a00; text-align: left; cursor: grab; touch-action: manipulation; z-index: 2 }
.trial.lifted { opacity: .3 }
.trial.editing { visibility: hidden }
/* Листок: жёлтая бумажка, чуть повёрнута, загнутый уголок */
.trial.note { flex-direction: column; gap: 1px; padding: 3px 7px 4px; border-radius: 3px; background: #fff3a8; box-shadow: 0 2px 5px rgba(120, 90, 0, .22); transform: rotate(-1.2deg) }
.trial.note::after { content: ''; position: absolute; right: 0; bottom: 0; border: 5px solid transparent; border-right-color: #ecd47a; border-bottom-color: #ecd47a; border-radius: 0 0 3px 0 }
.trial.note:hover { box-shadow: 0 4px 10px rgba(120, 90, 0, .3) }
.trial.note .tag { font-size: 9px; font-weight: 900; letter-spacing: .4px; text-transform: uppercase; color: #a07c00 }
.trial.note .tx { min-width: 0; font-size: 12px; font-weight: 700; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.trial.note.empty .tx { color: #b9a14a; font-weight: 600 }
/* Капсула: как урок, только жёлтая, с точкой вместо кружка ученика */
.trial.capsule { align-items: center; gap: 6px; padding: 0 10px 0 6px; border-radius: 99px; background: #ffe58a; box-shadow: inset 0 0 0 1px #e9cf6a, 0 1px 3px rgba(120, 90, 0, .18) }
.trial.capsule:hover { background: #ffdd66 }
.trial.capsule .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: #e0a800; box-shadow: 0 0 0 3px #fff3c2 }
.trial.capsule .tx { min-width: 0; font-size: 13px; font-weight: 800; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
@media (max-width: 719px) {
  .trial { inset: 2px }
  .trial.note { padding: 2px 4px } .trial.note .tag { font-size: 8px; letter-spacing: 0 } .trial.note .tx { font-size: 10px }
  .trial.capsule { justify-content: center; padding: 0 } .trial.capsule .tx { display: none }
}
/* Листок для текста */
.tr-bg { position: fixed; inset: 0; z-index: 70 }
.tr-pop { position: fixed; display: grid; gap: 8px; padding: 12px 14px 10px; color: #4a3b00; animation: trp .16s ease-out; transform-origin: top left }
@keyframes trp { from { opacity: 0; transform: scale(.9) } }
.tr-pop.note { border-radius: 4px; background: #fff3a8; box-shadow: 0 0 0 2px var(--blue), 0 14px 34px rgba(80, 60, 0, .3) }
.tr-pop.capsule { border-radius: 14px; background: #fffbe0; box-shadow: 0 12px 34px rgba(0, 0, 0, .22), 0 0 0 1px #eedb8a; transform-origin: top center }
.tr-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: .4px; text-transform: uppercase; color: #a07c00 }
.tr-h span { font-size: 12px; letter-spacing: 0 }
.tr-pop textarea { display: block; width: 100%; min-height: 96px; margin: 0; padding: 0; border: 0 !important; border-radius: 0; outline: 0; box-shadow: none !important; resize: none; background-color: transparent !important; color: inherit; font: inherit; font-size: 15px; font-weight: 600; line-height: 24px }
.tr-pop.capsule textarea { background-image: repeating-linear-gradient(transparent 0 23px, #efe0a0 23px 24px); background-attachment: local }
.tr-pop textarea::placeholder { color: #bba65a }
.tr-f { display: flex; align-items: center; gap: 8px } .tr-f small { flex: 1; text-align: right; font-size: 11px; font-weight: 700; color: #b39b4a }
.tr-f button { height: 32px; padding: 0 12px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.tr-ok { background: var(--blue); color: #fff }
.tr-rm { background: transparent; color: var(--red) } .tr-rm:hover { background: rgba(229, 57, 53, .1) }
</style>

<script setup>
// Окно правки карточки — одно на всё приложение (таблица карточек, карточка во время учёбы, просмотр колоды).
// Как карточка у ученика: всё правится прямо на ней; фото и звук — перетащить на карточку (или на своё место) или нажать.
// Листать — большие стрелки по бокам или ← → (если открыто из списка), Esc — закрыть.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'
import AudioWave from './AudioWave.vue'
import { showToast } from '../composables/useToast'
import { useCardMedia, isImg, isAud, isLink, audSrc, imgSrc, removeCard } from '../composables/useCardMedia'
const props = defineProps({
  deck: { type: Object, required: true },
  modelValue: { type: String, default: '' },            // id открытой карточки
  list: { type: Array, default: null },                 // по каким карточкам листать (по умолчанию — вся колода)
})
const emit = defineEmits(['update:modelValue'])
const list = computed(() => props.list ?? props.deck.cards)
const ec = computed(() => props.deck.cards.find(c => c.id === props.modelValue))
const eIdx = computed(() => list.value.findIndex(c => c.id === props.modelValue))
const close = () => emit('update:modelValue', '')
const step = (d) => { const n = list.value[eIdx.value + d]; if (n) emit('update:modelValue', n.id) }
const del = () => { if (removeCard(props.deck, ec.value)) close() }
const FIELDS = [null, null, null, null, { k: 'image', kind: 'image' }, { k: 'audio', kind: 'audio' }, { k: 'exampleAudio', kind: 'audio' }]
const { busy, attach, clearField } = useCardMedia(() => props.deck)
// Выбрать файл кнопкой
const pick = ref(null); let pickTo = null
function choose(c, f) { pickTo = { c, k: f.k }; pick.value.accept = f.kind === 'image' ? 'image/*' : 'audio/*'; pick.value.value = ''; pick.value.click() }
async function picked(e) { const file = e.target.files?.[0]; if (file && pickTo) await attach(pickTo.c, pickTo.k, file) }
const ceOver = ref(false), ceZone = ref('')       // над какой частью карточки держат файл: фото / звук слова / звук примера
async function zoneDrop(e, k) {
  e.preventDefault(); ceOver.value = false; ceZone.value = ''
  const f = [...(e.dataTransfer?.files ?? [])].find(x => (k === 'image' ? isImg(x) : isAud(x)))
  if (f) await attach(ec.value, k, f); else showToast(k === 'image' ? 'Сюда — фото (JPG, PNG, WebP)' : 'Сюда — звук (MP3, M4A, OGG, WAV)', null, 'bad')
}
async function ceDrop(e) {
  e.preventDefault(); ceOver.value = false; ceZone.value = ''
  for (const f of [...(e.dataTransfer?.files ?? [])].slice(0, 3)) { if (isImg(f)) await attach(ec.value, 'image', f); else if (isAud(f)) await attach(ec.value, ec.value.audio && !ec.value.exampleAudio && ec.value.example ? 'exampleAudio' : 'audio', f) }
}
function ceKey(e) {
  if (!ec.value) return
  if (e.key === 'Escape') { close(); return }
  if (/INPUT|TEXTAREA/.test(e.target.tagName)) return
  if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1)
}
onMounted(() => addEventListener('keydown', ceKey)); onUnmounted(() => removeEventListener('keydown', ceKey))
</script>

<template>
  <Teleport to="body">
    <input ref="pick" type="file" hidden @change="picked" />
    <div v-if="ec" class="ce-bg" @click.self="close">
      <button v-if="list.length > 1" class="side l" :disabled="eIdx <= 0" title="Предыдущая (←)" @click="step(-1)"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <div class="ce" :class="{ over: ceOver, off: ec.suspended }" @dragover.prevent="ceOver = true; ceZone = ''" @dragleave="ceOver = false; ceZone = ''" @drop="ceDrop">
        <div class="ceh"><small v-if="list.length > 1">{{ eIdx + 1 }} из {{ list.length }}</small><span class="sp" />
          <button class="hb" :class="{ on: ec.suspended }" :title="ec.suspended ? 'Скрыта от учеников — вернуть' : 'Скрыть от учеников'" @click="ec.suspended ? delete ec.suspended : (ec.suspended = true)">
            <svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /><path v-if="ec.suspended" d="M4 4l16 16" /></svg></button>
          <button class="hb red" title="Удалить карточку" @click="del"><AppIcon name="trash" :size="22" /></button>
          <button class="hb" title="Закрыть (Esc)" @click="close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
        <div class="wrow"><input v-model.trim="ec.front" data-k="front" class="cw" placeholder="слово" :class="{ miss: !ec.front }" />
          <span class="spk2" :class="{ zon: ceZone === 'audio' }" @dragover.prevent.stop="ceZone = 'audio'; ceOver = true" @drop.stop="zoneDrop($event, 'audio')">
            <span v-if="busy[ec.id + 'audio'] != null" class="up"><i :style="{ '--p': busy[ec.id + 'audio'] }" /></span>
            <template v-else-if="ec.audio"><AudioWave :src="audSrc(ec.audio)" :meta="ec.audioMeta || ''" small @meta="ec.audioMeta = $event" /><i v-if="isLink(ec.audio)" class="lk" title="Звук по ссылке"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i><button class="xx" title="Убрать звук" @click="clearField(ec, 'audio')">✕</button></template>
            <button v-else class="addsnd2" title="Добавить звук — выбрать файл или перетащить сюда" @click="choose(ec, FIELDS[5])"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/></svg><b>+</b></button>
          </span></div>
        <input v-model.trim="ec.back" data-k="back" class="ct" placeholder="перевод" :class="{ miss: !ec.back }" />
        <div class="cph" :class="{ empty: !ec.image, zon: ceZone === 'image' }" @dragover.prevent.stop="ceZone = 'image'; ceOver = true" @drop.stop="zoneDrop($event, 'image')" @click="!ec.image && busy[ec.id + 'image'] == null && choose(ec, FIELDS[4])">
          <span v-if="busy[ec.id + 'image'] != null" class="up"><i :style="{ '--p': busy[ec.id + 'image'] }" />{{ busy[ec.id + 'image'] }}%</span>
          <template v-else-if="ec.image"><img :src="imgSrc(ec.image)" alt="" /><i v-if="isLink(ec.image)" class="lk big" title="Фото по ссылке"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i>
            <span class="ctl"><button @click.stop="choose(ec, FIELDS[4])">Заменить</button><button class="red" @click.stop="clearField(ec, 'image')">Убрать</button></span></template>
          <span v-else class="addph"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 15l-5-5-8 9" /></svg>Перетащите фото или нажмите</span>
        </div>
        <div class="wrow"><textarea v-model.trim="ec.example" data-k="example" class="ce1" rows="2" placeholder="пример" />
          <span class="spk2" :class="{ zon: ceZone === 'exampleAudio' }" @dragover.prevent.stop="ceZone = 'exampleAudio'; ceOver = true" @drop.stop="zoneDrop($event, 'exampleAudio')">
            <span v-if="busy[ec.id + 'exampleAudio'] != null" class="up"><i :style="{ '--p': busy[ec.id + 'exampleAudio'] }" /></span>
            <template v-else-if="ec.exampleAudio"><AudioWave :src="audSrc(ec.exampleAudio)" :meta="ec.exampleAudioMeta || ''" small @meta="ec.exampleAudioMeta = $event" /><i v-if="isLink(ec.exampleAudio)" class="lk" title="Звук по ссылке"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i><button class="xx" title="Убрать звук" @click="clearField(ec, 'exampleAudio')">✕</button></template>
            <button v-else class="addsnd2" title="Добавить звук — выбрать файл или перетащить сюда" @click="choose(ec, FIELDS[6])"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/></svg><b>+</b></button>
          </span></div>
        <textarea v-model.trim="ec.exampleTr" data-k="exampleTr" class="ce2" rows="1" placeholder="перевод примера" />
        <div v-if="ceOver && !ceZone" class="ceov">Отпустите — фото или звук в эту карточку</div>
      </div>
      <button v-if="list.length > 1" class="side r" :disabled="eIdx >= list.length - 1" title="Следующая (→)" @click="step(1)"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>
  </Teleport>
</template>

<style scoped>
/* Карточка для правки */
.ce-bg { position: fixed; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; gap: 18px; padding: 16px; background: rgba(17, 24, 39, .45); backdrop-filter: blur(2px) }
.ce { position: relative; width: min(400px, 100%); max-height: 100%; overflow: auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 10px 16px 18px; border-radius: 24px; background: var(--card); box-shadow: 0 24px 60px rgba(0, 0, 0, .28) }
.ce.over { box-shadow: 0 0 0 3px var(--blue), 0 24px 60px rgba(0, 0, 0, .28) } .ce.off { opacity: .85 }
.side { flex: none; display: grid; place-items: center; width: 52px; height: 52px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .95); color: var(--text); cursor: pointer; box-shadow: 0 6px 20px rgba(0, 0, 0, .2); transition: transform .1s, opacity .1s }
.side svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.side:hover:not(:disabled) { transform: scale(1.06); color: var(--blue) } .side:disabled { opacity: 0; pointer-events: none }
.ceh { display: flex; align-items: center; gap: 4px; margin: 0 -6px 4px 0 } .ceh .sp { flex: 1 } .ceh small { font-size: 13px; font-weight: 800; color: var(--hint-2) }
.hb { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 12px; background: none; color: var(--hint); cursor: pointer }
.hb svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.hb:hover { background: var(--surface); color: var(--text) } .hb.red:hover { background: var(--red-l); color: var(--red-d) } .hb.on { color: var(--orange-d); background: #fff4d6 }
.ce input, .ce textarea { margin: 0; width: 100%; border: 0; border-radius: 12px; background: none; text-align: center; padding: 4px 8px; resize: none; font-family: inherit; line-height: 1.3; outline: none; transition: background .1s }
.ce input:hover, .ce textarea:hover { background: var(--surface) } .ce input:focus, .ce textarea:focus { background: var(--blue-l) }
.ce input::placeholder, .ce textarea::placeholder { color: var(--hint-2); font-weight: 600 }
.cw { font-size: 28px; font-weight: 900 } .ct { font-size: 19px; font-weight: 800; color: var(--blue) } .ce .miss { background: #fff1f1 }
.ce1 { font-size: 16px; font-weight: 700 } .ce2 { font-size: 14px; font-weight: 600; color: var(--hint) }
.wrow { display: flex; align-items: center; gap: 6px } .wrow > :first-child { flex: 1; min-width: 0 }
.spk2 { position: relative; flex: none; display: inline-flex; align-items: center; gap: 4px; max-width: 150px; border-radius: 12px; padding: 2px }
.spk2 .aw { width: 116px } .spk2 .lk { position: static }
.addsnd2 { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border: 2px dashed var(--border); border-radius: 50%; background: none; color: var(--hint-2); cursor: pointer }
.addsnd2 b { position: absolute; right: -4px; bottom: -4px; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--card); font-size: 14px; line-height: 1 }
.addsnd2:hover { border-color: var(--blue); color: var(--blue) }
.xx { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--hint-2); font-size: 11px; cursor: pointer; opacity: 0 } .spk2:hover .xx { opacity: 1 } .xx:hover { color: var(--red-d) }
.cph { position: relative; aspect-ratio: 3 / 2; border-radius: 16px; overflow: hidden; background: var(--surface); display: grid; place-items: center; margin: 8px 0 }
.cph.empty { border: 2px dashed var(--border); background: none; cursor: pointer } .cph.empty:hover { border-color: var(--blue); background: var(--blue-l) }
.cph img { width: 100%; height: 100%; object-fit: contain }
.addph { display: grid; justify-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: var(--hint-2) } .cph.empty:hover .addph { color: var(--blue) }
.ctl { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 8px; padding: 18px 10px 10px; background: linear-gradient(transparent, rgba(0, 0, 0, .35)); opacity: 0; transition: opacity .15s } .cph:hover .ctl { opacity: 1 }
@media (hover: none) { .ctl, .xx { opacity: 1 } }
.ctl button { border: 0; border-radius: 10px; padding: 8px 14px; background: rgba(255, 255, 255, .95); font: inherit; font-size: 13px; font-weight: 800; color: var(--text); cursor: pointer } .ctl .red { color: var(--red-d) }
.lk { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--card); color: var(--blue); box-shadow: 0 1px 4px rgba(0, 0, 0, .25); font-style: normal; flex: none }
.lk.big { position: absolute; left: 10px; top: 10px; width: 26px; height: 26px }
.cph.zon, .spk2.zon { outline: 3px solid var(--blue); outline-offset: 2px; background: var(--blue-l) }
.ceov { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; border-radius: 24px; background: rgba(221, 244, 255, .88); color: var(--blue); font-size: 17px; font-weight: 900; text-align: center; pointer-events: none }
@media (max-width: 560px) { .side { position: fixed; bottom: 18px; z-index: 2 } .side.l { left: 18px } .side.r { right: 18px } }
.up { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: var(--blue) }
.up i { width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(var(--blue) calc(var(--p) * 1%), var(--surface) 0) }
</style>

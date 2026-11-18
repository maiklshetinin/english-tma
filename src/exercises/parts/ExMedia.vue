<script setup>
// Видео или фото экрана (16:9), звук — синей плашкой поверх (если не видео).
// В правке — то же окно: пусто — голубая подложка «＋ Видео или фото» (нажать или перетащить файл), есть — «Заменить» и ✕ поверх.
//  kinds — что можно положить (video, image); joined — снизу продолжается блоком (слово у «Нового слова») — нижние углы прямые;
//  xm — отступ снизу (подсказка); ph — надпись пустого окна в правке (нет — пустого окна в правке нет, как у ученика);
//  audio — звук поверх: { src, auto, add } для ExAudio или true; autoplay — видео само (у ученика).
//  controls — кнопки у видео (у «Повтори» их нет: нажал на видео — заново); vref — получить сам <video> (для «Ещё раз»)
//  slot — своё поверх (закладка «В избранное», подпись-фраза)
import { computed } from 'vue'
import ExAudio from './ExAudio.vue'
import { usePlay, useEdit } from '../ctx'
const props = defineProps({ step: { type: Object, required: true }, kinds: { type: Array, default: () => ['video', 'image'] }, joined: Boolean, xm: Boolean,
  ph: { type: String, default: '' }, hint: { type: String, default: '16:9, лучше от 1280×720 — нажмите или перетащите' }, audio: { type: [Boolean, Object], default: false }, autoplay: Boolean,
  controls: { type: Boolean, default: true }, vref: { type: Function, default: null } })
const emit = defineEmits(['vclick'])
const p = usePlay(), ed = useEdit()
const video = computed(() => (props.kinds.includes('video') && props.step.video) || '')
const image = computed(() => (props.kinds.includes('image') && props.step.image) || '')
const has = computed(() => !!(video.value || image.value))
const au = computed(() => (props.audio === true ? {} : props.audio || null))
const pc = computed(() => props.kinds.map(k => ed.pct(props.step, k)).find(v => v != null) ?? null)
const what = computed(() => (props.kinds.length > 1 ? 'Видео или фото' : props.kinds[0] === 'video' ? 'Видео' : 'Фото'))
</script>

<template>
  <div v-if="!p.edit && has" class="media" :class="{ joined, xm }">
    <video v-if="video" :ref="vref" :src="p.src(video, 'video')" :controls="controls" playsinline :autoplay="autoplay" @click="emit('vclick')" />
    <img v-else :src="p.src(image, 'image')" alt="" />
    <ExAudio v-if="au && !video" :step="step" v-bind="au" at="over" />
    <slot />
  </div>
  <div v-else-if="p.edit && (has || ph)" class="media" :class="{ joined, xm, empty: !has }" @click="!has && ed.pick(step, kinds)" @dragover.prevent.stop @drop.prevent.stop="ed.drop($event, step, kinds)">
    <video v-if="video" :src="p.src(video, 'video')" controls playsinline preload="metadata" />
    <img v-else-if="image" :src="p.src(image, 'image')" alt="" draggable="false" />
    <span v-else class="ph" :class="{ pa: au && !video }">＋ {{ ph }}<small>{{ hint }}</small></span>
    <template v-if="has">
      <button type="button" class="ex-x mx" title="Убрать" @click.stop="ed.clear(step, video ? 'video' : 'image')">✕</button>
      <button type="button" class="ex-chip rp" @click.stop="ed.pick(step, kinds)">Заменить {{ video ? 'видео' : 'фото' }}</button>
    </template>
    <em v-if="pc != null" class="up">{{ pc }}%</em>
    <ExAudio v-if="au && !video" :step="step" v-bind="au" at="over" @click.stop />
    <slot />
  </div>
</template>

<style scoped>
.media { position: relative; flex: none; border-radius: 12px; overflow: hidden; background: #000; aspect-ratio: 16 / 9 }
.media video, .media img { display: block; width: 100%; height: 100%; object-fit: cover }
.media video { cursor: pointer }
.media.joined { border-radius: 12px 12px 0 0 }
.media.xm { margin-bottom: 10px }
.lp.book .media { border-radius: 4px; box-shadow: 0 0 0 1px #d3d1c7 }
/* правка */
.media.empty { background: rgba(13, 153, 255, .06); cursor: pointer } .media.empty:hover { background: var(--blue-l) }
.ph { display: grid; place-items: center; align-content: center; height: 100%; gap: 2px; color: var(--blue-d); font-size: 13px; font-weight: 800 }
.ph.pa { padding-bottom: 36px; box-sizing: border-box }
.ph small { color: var(--hint); font-size: 10px; font-weight: 600 }
.mx { position: absolute; right: 5px; top: 5px; z-index: 3 }
.rp { position: absolute; left: 6px; top: 6px; z-index: 3; opacity: 0; transition: opacity .12s } .media:hover .rp { opacity: 1 }
@media (hover: none) { .rp { opacity: 1 } }
.up { position: absolute; left: 50%; top: 50%; translate: -50% -50%; z-index: 3; padding: 3px 9px; border-radius: 10px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 12px; font-weight: 800; font-style: normal }
</style>

<script setup>
// Звук экрана — синяя плашка (AudioPill), как в Busuu. Класс снаружи решает, где она: .over — поверх фото, .qa — отдельной строкой.
// В правке — та же плашка той же высоты, на ней кнопки «Заменить» / «✕»; нет звука — «＋ Аудио» на её месте.
//  at — где: over (поверх фото), row (отдельной строкой, как вопрос на слух), plain (в колонке под словом).
//  field — какое поле экрана (audio, exAudio…); src — что играть, если это не само поле (у «Выбери ответ» без своего звука
//  играет звук верного ответа — тогда auto: кнопки «Свой» / «Авто»); media — готовый <video>, плашка управляет им.
import { computed } from 'vue'
import AudioPill from '../../components/AudioPill.vue'
import { usePlay, useEdit } from '../ctx'
const props = defineProps({ step: { type: Object, required: true }, field: { type: String, default: 'audio' }, src: { type: String, default: null },
  auto: Boolean, add: { type: String, default: '＋ Аудио — нажмите или перетащите' }, media: { type: Object, default: null }, at: { type: String, default: 'row' } })
const p = usePlay(), ed = useEdit()
const ref_ = computed(() => (props.src != null ? props.src : props.step[props.field]) || '')
const own = computed(() => !!props.step[props.field])
const pc = computed(() => ed.pct(props.step, props.field))
</script>

<template>
  <AudioPill v-if="!p.edit && (ref_ || media)" :key="ref_" :class="'xa-' + at" :src="media ? '' : p.src(ref_, 'audio')" :media="media" />
  <div v-else-if="p.edit" class="xa" :class="'xa-' + at" @dragover.prevent.stop @drop.prevent.stop="ed.drop($event, step, ['audio'], null, field)">
    <template v-if="ref_">
      <AudioPill :key="ref_" :src="p.src(ref_, 'audio')" class="xp" />
      <span class="xc">
        <button type="button" class="ex-chip" :title="auto && !own ? 'Сейчас звук верного ответа — загрузить свой' : 'Заменить звук'" @click.stop="ed.pick(step, ['audio'], null, field)">{{ auto && !own ? 'Свой' : 'Заменить' }}{{ pc != null ? ' ' + pc + '%' : '' }}</button>
        <button v-if="auto && own" type="button" class="ex-chip" title="Убрать свой звук — будет звук верного ответа" @click.stop="ed.clear(step, field)">Авто</button>
        <button v-else-if="!auto" type="button" class="ex-chip" title="Убрать звук" @click.stop="ed.clear(step, field)">✕</button>
      </span>
    </template>
    <button v-else type="button" class="xe" @click.stop="ed.pick(step, ['audio'], null, field)">{{ add }}{{ pc != null ? ' ' + pc + '%' : '' }}</button>
  </div>
</template>

<style scoped>
.xa { position: relative; height: 30px }
.xa > .xp { height: 100% }
.xa-row { width: 100%; max-width: 420px; align-self: center; height: 34px; border-radius: 17px; margin: 6px 0 10px; box-sizing: border-box }
.xa-over { position: absolute; left: 8%; right: 8%; bottom: 10px; z-index: 2 }
@media (min-width: 900px) {
  .lp:not(.embedded):not(.single) .xa-row { max-width: 700px; height: 42px }
  .lp:not(.embedded):not(.single) .xa-over { left: 9%; right: 9%; bottom: 16px }
}
.xc { position: absolute; right: 40px; top: 50%; translate: 0 -50%; display: flex; gap: 4px }
.xe { width: 100%; height: 100%; border: 0; border-radius: 17px; background: rgba(13, 153, 255, .1); color: var(--blue-d); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.xe:hover { background: rgba(13, 153, 255, .16) }
</style>

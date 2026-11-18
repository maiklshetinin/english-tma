<script setup>
// «Новое слово» — как в Busuu: фото или видео со звуком поверх, под ним голубой блок со словом и переводом; ниже — пример.
// Один шаблон и для ученика, и для правки (p.edit): поля правятся на месте, окно того же размера.
// part: body — экран, fb — строка в подвале после ответа (тут нет), tools — кнопки в подвале правки.
import ExHead from '../parts/ExHead.vue'
import ExMedia from '../parts/ExMedia.vue'
import ExAudio from '../parts/ExAudio.vue'
import ExText from '../parts/ExText.vue'
import ExSay from '../parts/ExSay.vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit } from '../ctx'
import J from './intro.json'
defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const BMK = 'M7 4h10v16l-5-3.5L7 20z'
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <div class="nw">
      <ExMedia :step="step" joined :audio="true" :autoplay="!p.single" ph="Видео или фото">
        <button v-if="p.favKey && !p.edit" class="bmk" :class="{ on: p.favOn }" :aria-pressed="p.favOn" :title="p.favOn ? 'В избранном — убрать' : 'В избранное: слово будет в словаре в «Избранном»'" @click="p.favToggle"><svg viewBox="0 0 24 24"><path :d="BMK" /></svg></button>
      </ExMedia>
      <ExAudio v-if="!p.edit && !step.video && !step.image" :step="step" at="plain" />
      <div v-if="p.edit || step.word || step.tr" class="word" :class="{ joined: p.edit || step.video || step.image }">
        <ExText v-model="step.word" tag="b" ph="слово" />
        <ExText v-model="step.tr" tag="span" ph="перевод" />
        <button v-if="p.favKey && !p.edit && !step.video && !step.image" class="bmk in" :class="{ on: p.favOn }" :aria-pressed="p.favOn" :title="p.favOn ? 'В избранном — убрать' : 'В избранное'" @click="p.favToggle"><svg viewBox="0 0 24 24"><path :d="BMK" /></svg></button>
      </div>
    </div>
    <div v-if="p.edit || step.ex" class="ex"><small>Пример</small>
      <ExText v-model="step.ex" tag="p" ph="He said it’s fine." multi><template #before><ExSay :step="step" field="exAudio" /></template><ExSay :step="step" field="exAudio" />{{ step.ex }}</ExText>
      <ExText v-model="step.exTr" tag="span" ph="перевод примера" multi />
    </div>
    <p v-if="!p.edit && !step.word && !step.video && !step.image" class="empty">Добавьте слово, видео или фото — или возьмите карточку</p>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool deck @click="ed.cards(step, 'intro')">{{ ed.canUndo(step) ? 'Другая карточка' : 'Взять из карточек' }}</ExTool>
    <ExTool v-if="ed.canUndo(step)" un title="Вернуть, как было до карточки" @click="ed.undoCard(step)">↺</ExTool>
  </template>
</template>

<style scoped>
.nw { width: 100%; max-width: 380px; align-self: center; display: grid }
.word { position: relative; display: grid; justify-items: center; gap: 4px; padding: 12px; border-radius: 12px; background: #f1f6ff; text-align: center }
.word.joined { border-radius: 0 0 12px 12px }
.word > b { font-size: 16px; font-weight: 800 } .word > span { font-size: 12px; color: var(--hint); font-weight: 600 }
.word .ext { width: 70% } .word span.ext { width: 50% }
.ex { display: grid; gap: 3px; width: 100%; max-width: 380px; align-self: center; padding: 0 2px; box-sizing: border-box }
.ex small { font-size: 10px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .4px }
.ex p { position: relative; display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 15px; font-weight: 600 }
.ex > span { font-size: 12px; color: var(--hint); font-weight: 600 }
.lp.book .word { background: #f1efe8 }
.empty { margin: 6px 0; padding: 18px; border: 1px dashed var(--border); border-radius: 12px; text-align: center; color: var(--hint); font-size: 14px; font-weight: 700 }
.bmk { position: absolute; top: 10px; right: 10px; z-index: 2; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 2px solid #1cb0f6; border-radius: 50%; background: #fff; color: #1cb0f6; cursor: pointer }
.bmk svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linejoin: round } .bmk.on { background: #1cb0f6; color: #fff } .bmk.on svg { fill: currentColor }
.bmk.in { top: 50%; translate: 0 -50% }
@media (min-width: 900px) {
  .lp:not(.embedded):not(.single) .nw, .lp:not(.embedded):not(.single) .ex { max-width: 700px }
  .lp:not(.embedded):not(.single) .word { padding: 18px } .lp:not(.embedded):not(.single) .word b { font-size: 20px } .lp:not(.embedded):not(.single) .word > span { font-size: 15px }
  .lp:not(.embedded):not(.single) .ex small { font-size: 12px } .lp:not(.embedded):not(.single) .ex p { font-size: 19px } .lp:not(.embedded):not(.single) .ex > span { font-size: 15px }
}
</style>

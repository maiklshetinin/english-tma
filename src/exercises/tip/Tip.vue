<script setup>
// «Подсказка»: мини-правило (жирный — **так**) и табличка фраз: фраза с озвучкой — перевод.
// Фото / видео / звук — для своих упражнений из конструктора. Один шаблон и для ученика, и для правки (p.edit).
// part: body — экран, tools — кнопки в подвале правки.
import ExHead from '../parts/ExHead.vue'
import ExMedia from '../parts/ExMedia.vue'
import ExAudio from '../parts/ExAudio.vue'
import ExRich from '../parts/ExRich.vue'
import ExText from '../parts/ExText.vue'
import ExSay from '../parts/ExSay.vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit } from '../ctx'
import J from './tip.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
function addRow() { if ((props.step.opts ??= []).length < J.limits.opts) { props.step.opts.push({ w: '', t: '' }); ed.changed() } }
function delRow(k) { const o = props.step.opts[k]; ed.dropFiles([o.audio].filter(f => f && !f.startsWith('https://'))); props.step.opts.splice(k, 1); ed.changed() }
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <ExMedia :step="step" xm />
    <ExAudio v-if="step.audio" :step="step" at="row" />
    <ExRich v-model="step.text" class="tip" ph="Правило. Выделите слово — «B» сделает жирным" />
    <div v-if="step.opts?.length" class="tt">
      <div v-for="(o, k) in step.opts" :key="k" class="tr">
        <ExText v-model="o.w" ph="See you later!" multi><template #before><ExSay :step="step" :obj="o" :opt="k" /></template><ExSay :step="step" :obj="o" :opt="k" />{{ o.w }}</ExText>
        <ExText v-model="o.t" ph="Увидимся!" multi />
        <button v-if="p.edit" type="button" class="rx" title="Убрать строку" @click="delRow(k)">✕</button>
      </div>
    </div>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool v-if="(step.opts?.length ?? 0) < J.limits.opts" @click="addRow">＋ Строка</ExTool>
  </template>
</template>

<style scoped>
.tip { margin: 0; font-size: 15px; font-weight: 500; line-height: 1.5 } .tip :deep(b) { font-weight: 800 }
.tt { border: 1px solid var(--border); border-radius: 12px }
.tr { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 11px 12px; font-size: 14px; font-weight: 600 } .tr + .tr { border-top: 1px solid var(--border) }
.tr > :first-child { position: relative; display: flex; align-items: center; gap: 6px } .tr > :nth-child(2) { color: var(--hint) }
.rx { position: absolute; right: -9px; top: 50%; translate: 0 -50%; width: 18px; height: 18px; padding: 0; border: 1px solid var(--border); border-radius: 50%; background: var(--card); color: var(--hint); font-size: 9px; cursor: pointer; opacity: 0 } .tr:hover .rx { opacity: 1 }
@media (hover: none) { .rx { opacity: 1 } }
@media (min-width: 900px) { .lp:not(.embedded):not(.single) .tip { font-size: 18px } .lp:not(.embedded):not(.single) .tr { font-size: 16px; padding: 14px 16px } }
</style>

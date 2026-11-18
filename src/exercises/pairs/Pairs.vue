<script setup>
// «Пары»: слева слова, справа переводы вразброс — нажать слово, потом перевод. Сошлось — пара зеленеет, нет — мигает красным.
// Один шаблон и для ученика, и для правки (p.edit): в правке те же плашки по парам (слева слово, справа перевод), правятся на месте, ✕ — убрать пару.
// part: body — экран, tools — кнопки в подвале правки.
import { computed } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExMedia from '../parts/ExMedia.vue'
import ExAudio from '../parts/ExAudio.vue'
import ExText from '../parts/ExText.vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit } from '../ctx'
import J from './pairs.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const full = computed(() => (props.step.pairs ?? []).filter(x => x.a?.trim() && x.b?.trim()))          // у ученика — только заполненные пары
function addPair() { if ((props.step.pairs ??= []).length < J.limits.pairs) { props.step.pairs.push({ a: '', b: '' }); ed.changed() } }
function delPair(k) { props.step.pairs.splice(k, 1); ed.changed() }
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <ExMedia :step="step" xm />
    <ExAudio v-if="step.audio" :step="step" at="row" />
    <template v-if="!p.edit">
      <div v-if="full.length < 2" class="empty">Нужно хотя бы 2 пары</div>
      <div v-else class="pairs">
        <div class="col"><button v-for="k in p.st.L" :key="'l' + k" class="pr" :class="{ sel: p.st.left === k, ok: p.st.matched.includes(k), no: p.st.bad[0] === k }" :disabled="p.st.matched.includes(k)" @click="p.tap('left', k)">{{ full[k]?.a }}</button></div>
        <div class="col"><button v-for="k in p.st.R" :key="'r' + k" class="pr" :class="{ sel: p.st.right === k, ok: p.st.matched.includes(k), no: p.st.bad[1] === 'r' + k }" :disabled="p.st.matched.includes(k)" @click="p.tap('right', k)">{{ full[k]?.b }}</button></div>
      </div>
    </template>
    <div v-else class="pairs">
      <div class="col"><div v-for="(x, k) in step.pairs" :key="'l' + k" class="pr ed"><ExText v-model="x.a" ph="I approve" /><button type="button" class="ex-x px" title="Убрать пару" @click="delPair(k)">✕</button></div></div>
      <div class="col"><div v-for="(x, k) in step.pairs" :key="'r' + k" class="pr ed"><ExText v-model="x.b" ph="одобряю" /></div></div>
    </div>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool v-if="(step.pairs?.length ?? 0) < J.limits.pairs" title="Добавить пару" @click="addPair">＋</ExTool>
    <ExTool deck @click="ed.cards(step, 'pairs')">Из карточек</ExTool>
  </template>
</template>

<style scoped>
.empty { margin: 6px 0; padding: 18px; border: 1px dashed var(--border); border-radius: 12px; text-align: center; color: var(--hint); font-size: 14px; font-weight: 700 }
.pairs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px } .col { display: grid; gap: 10px; align-content: start }
.pr { min-height: 48px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); font: inherit; font-size: 14px; font-weight: 700; color: var(--text); cursor: pointer; box-sizing: border-box }
.pr.sel { border-color: var(--blue); background: var(--blue-l) } .pr.ok { background: #8ff0c8; border-color: #8ff0c8; cursor: default } .pr.no { background: var(--red-l); border-color: var(--red); animation: shake .3s }
@keyframes shake { 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
/* правка: плашка той же высоты, текст правится на месте */
.pr.ed { position: relative; display: grid; align-items: center; text-align: center; cursor: default }
.px { position: absolute; left: -11px; top: 50%; translate: 0 -50%; width: 20px; height: 20px; font-size: 10px; opacity: 0 } .pr.ed:hover .px { opacity: 1 }
@media (hover: none) { .px { opacity: 1 } }
@media (min-width: 900px) { .lp:not(.embedded):not(.single) .pr { min-height: 60px; font-size: 17px } }
</style>

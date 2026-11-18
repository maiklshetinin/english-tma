<script setup>
// «Выбери ответ» и «Аудиотест». Выбери ответ: звук вопроса синей плашкой + варианты картинками.
// Аудиотест: фото со звуком поверх + варианты строками. Без своего звука вопроса играет звук верного варианта.
// Один шаблон и для ученика, и для правки (p.edit): в правке кружок — верный ответ, ✕ — убрать вариант, фото — нажать или перетащить.
// part: body — экран, fb — строка в подвале после ответа, tools — кнопки в подвале правки.
import { computed } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExMedia from '../parts/ExMedia.vue'
import ExAudio from '../parts/ExAudio.vue'
import ExText from '../parts/ExText.vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit } from '../ctx'
import J from './choice.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const s = computed(() => props.step)
const ans = computed(() => s.value.ans ?? 0)
const qAudio = computed(() => s.value.audio || s.value.opts?.[ans.value]?.audio || '')
const au = computed(() => ({ src: qAudio.value, auto: true, add: s.value.show === 'text' ? '＋ Звук вопроса' : '＋ Звук вопроса — нажмите или перетащите' }))
// звук: поверх фото (Аудиотест), отдельной плашкой (Выбери ответ) или вопрос переводом (старые экраны)
const over = computed(() => (p.edit ? s.value.show === 'text' && s.value.ask !== 'tr' : !!s.value.image && s.value.ask === 'audio'))
const row = computed(() => (p.edit ? s.value.show !== 'text' && s.value.ask !== 'tr' : !s.value.image && s.value.ask === 'audio'))
const pics = computed(() => s.value.show === 'pics')          // варианты картинками (Выбери ответ), иначе строками
const q = computed(() => (p.edit ? s.value.ask === 'tr' : s.value.ask !== 'audio'))
const order = computed(() => (p.edit ? (s.value.opts ?? []).map((_, k) => k) : p.st.order ?? []))
const cls = (k) => (p.edit ? { right: ans.value === k } : { ok: p.st.done && k === ans.value, no: p.st.done && k === p.st.picked && k !== ans.value, dim: p.st.done && k !== p.st.picked && k !== ans.value })
function setAns(k) { s.value.ans = k; ed.changed() }
function addOpt() { if ((s.value.opts ??= []).length < J.limits.opts) { s.value.opts.push({ w: '' }); ed.changed() } }
function delOpt(k) {
  const o = s.value.opts[k]; ed.dropFiles([o.image, o.audio].filter(f => f && !f.startsWith('https://')))
  s.value.opts.splice(k, 1); if (s.value.ans >= s.value.opts.length || s.value.ans === k) s.value.ans = 0; else if (s.value.ans > k) s.value.ans--
  ed.changed()
}
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <div v-if="step.image || (p.edit && step.show === 'text')" class="nw"><ExMedia :step="step" :kinds="['image']" :ph="step.show === 'text' ? 'Фото к вопросу' : ''" :audio="over ? au : false" /></div>
    <ExAudio v-if="row && (p.edit || qAudio)" :step="step" v-bind="au" at="row" />
    <p v-else-if="row && step.show !== 'text'" class="empty">Нет звука для вопроса</p>
    <div v-if="q" class="q">{{ step.opts?.[ans]?.t || (p.edit ? 'перевод верного ответа' : '…') }}</div>
    <div v-if="!p.edit && !step.opts?.length" class="empty">Добавьте варианты — из карточек или свои</div>
    <div v-else :class="pics ? 'pics' : 'rows'">
      <component :is="p.edit ? 'div' : 'button'" v-for="k in order" :key="k" class="op" :class="cls(k)" @click="!p.edit && p.pick(k)">
        <span v-if="pics" class="ph" :class="{ ed: p.edit }" @click="p.edit && ed.pick(step, ['image'], k)" @dragover.prevent.stop @drop.prevent.stop="p.edit && ed.drop($event, step, ['image'], k)">
          <img v-if="step.opts[k].image" :src="p.src(step.opts[k].image, 'image')" alt="" draggable="false" /><i v-else>{{ p.edit ? '＋ фото' : 'нет фото' }}</i>
          <span v-if="p.edit && step.opts[k].image" class="rep">Заменить</span>
        </span>
        <ExText v-model="step.opts[k].w" class="ow" ph="слово" empty="…" />
        <template v-if="p.edit">
          <button type="button" class="rad" :title="ans === k ? 'Верный ответ' : 'Кружок — верный ответ: нажмите, чтобы сделать этот верным'" @click.stop="setAns(k)" />
          <button type="button" class="ex-x cx" title="Убрать вариант" @click.stop="delOpt(k)">✕</button>
        </template>
      </component>
    </div>
  </template>
  <template v-else-if="part === 'fb' && p.st.done">
    <b>{{ p.right ? 'Верно!' : 'Правильный ответ:' }}</b><span v-if="!p.right">{{ p.answer?.w }}</span><small v-if="p.later" class="lt">Вернёмся к этому в конце урока</small>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool v-if="(step.opts?.length ?? 0) < J.limits.opts" title="Добавить вариант" @click="addOpt">＋</ExTool>
    <ExTool deck @click="ed.cards(step, 'opts')">Из карточек</ExTool>
  </template>
</template>

<style scoped>
.nw { width: 100%; max-width: 380px; align-self: center; display: grid }
.q { padding: 14px; border-radius: 14px; background: #f1f6ff; text-align: center; font-size: 20px; font-weight: 900 }
.empty { margin: 6px 0; padding: 18px; border: 1px dashed var(--border); border-radius: 12px; text-align: center; color: var(--hint); font-size: 14px; font-weight: 700 }
.pics { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 10px }
.rows { display: grid; gap: 8px }
.op { position: relative; display: grid; gap: 0; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--card); font: inherit; color: var(--text); cursor: pointer; overflow: hidden; transition: background .12s, border-color .12s, opacity .12s }
.op:hover { border-color: #c9c9c9 }
.ph { display: block; aspect-ratio: 3 / 2; background: var(--surface) } .ph img { display: block; width: 100%; height: 100%; object-fit: cover }
.ph i { display: grid; place-items: center; height: 100%; font-size: 12px; color: var(--hint-2); font-style: normal }
.ow { padding: 9px 10px; font-size: 14px; font-weight: 800; text-align: center }
.rows .ow { padding: 13px 12px; font-weight: 600 }
.op.ok { background: #8ff0c8; border-color: #8ff0c8 } .op.no { background: var(--red-l); border-color: var(--red); animation: shake .3s } .op.dim { opacity: .55 }
@keyframes shake { 0%, 100% { translate: 0 } 25% { translate: -5px } 75% { translate: 5px } }
/* правка: кружок — верный ответ, ✕ — убрать, фото — нажать или перетащить */
div.op { cursor: default }
.op.right { border: 2px solid #1fbe78; margin: -1px }
.ph.ed { position: relative; cursor: pointer } .ph.ed i { color: var(--blue-d); font-weight: 800 } .ph.ed:hover i { background: var(--blue-l) }
.rep { position: absolute; left: 50%; bottom: 6px; translate: -50% 0; padding: 2px 8px; border-radius: 8px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 10px; font-weight: 800; white-space: nowrap; opacity: 0; transition: opacity .12s } .ph.ed:hover .rep { opacity: 1 }
.rad { position: absolute; left: 6px; top: 6px; z-index: 2; width: 18px; height: 18px; padding: 0; border: 2px solid #fff; border-radius: 50%; background: rgba(0, 0, 0, .25); box-shadow: 0 0 0 1px rgba(0, 0, 0, .15); cursor: pointer }
.op.right .rad { background: #1fbe78; box-shadow: 0 0 0 1px #1fbe78, inset 0 0 0 3px #fff }
.cx { position: absolute; right: 6px; top: 6px; z-index: 2; width: 20px; height: 20px; font-size: 10px; opacity: 0 } .op:hover .cx { opacity: 1 }
.rows .rad { top: 50%; translate: 0 -50%; border-color: #cfcfcf; background: var(--card); box-shadow: none }
.rows .op.right .rad { border-color: #1fbe78; background: #1fbe78; box-shadow: inset 0 0 0 3px #fff }
.rows .cx { top: 50%; translate: 0 -50%; background: var(--surface); color: var(--hint) }
.rows .ow.ext { padding-left: 30px; padding-right: 30px }
@media (hover: none) { .cx, .rep { opacity: 1 } }
@media (min-width: 900px) {
  .lp:not(.embedded):not(.single) .nw { max-width: 700px }
  .lp:not(.embedded):not(.single) .q { font-size: 24px; padding: 20px }
  .lp:not(.embedded):not(.single) .pics { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px }
  .lp:not(.embedded):not(.single) .ow { font-size: 17px; padding: 12px } .lp:not(.embedded):not(.single) .rows .ow { padding: 18px 16px; font-size: 17px }
}
</style>

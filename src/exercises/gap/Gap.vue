<script setup>
// «Заполни пропуск» / «Закончи предложение» и книжные варианты (Настины и «Как в учебнике»):
//  • с вариантами — фраза с пропуском и банк слов (тап); «Как в учебнике» Underline (bkpick + page) — варианты прямо в предложении;
//  • без вариантов — вписать (до 2 пропусков, в каждом несколько верных через «/»: [isn't/is not]); подсказка в скобках — (make).
// В данных фраза с [пропуском]. Один шаблон и для ученика, и для правки (p.edit):
//  в правке фраза правится прямо в строке (выделили слово — «→ пропуск»), варианты — плашками; Underline — кусками, точка над словом — верный.
// part: body / fb / tools (Тап ↔ Письмо, фото или звук, «Ответы» — также засчитывать — и перевод).
import { computed, ref, onMounted, onUnmounted } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExMedia from '../parts/ExMedia.vue'
import ExAudio from '../parts/ExAudio.vue'
import ExTool from '../parts/ExTool.vue'
import ExPop from '../parts/ExPop.vue'
import { usePlay, useEdit } from '../ctx'
import { gapParts, gapList, gapAlts, gapOk as gapRight, gapFull, hintParts, tplOf, GAPS_MAX, GAP_OPTS_MAX } from '../../utils/lesson'
import { say as alertSay } from '../../composables/useDialog'
import J from './gap.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const s = computed(() => props.step)
const page = computed(() => !!s.value.bk && s.value.bs === 'page')
const underline = computed(() => page.value && s.value.bk === 'bkpick')          // Т5 «Underline the correct word»
const gp = computed(() => gapParts(s.value.phrase))
const gl = computed(() => gapList(s.value.phrase))
const optCh = computed(() => Math.min(30, Math.max(...(s.value.opts ?? []).map(o => (o.w || '').length), 3) + 3))
const okOpt = (o) => !!o.w && gapRight(o.w, gp.value.gap)

// ---- правка: фраза как у ученика, пропуск — синим на пунктире; выделили слово — «→ пропуск» ----
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// в пропуске на экране — первый верный ответ; остальные («Также засчитывать») — в data-alt; ширина — как поле у ученика
const gapHtml = (t, opts) => gapList(t).map(x => {
  if (x.g == null) return hintParts(x.t).map(h => (h.h ? '<span class="brh">' + esc(h.x) + '</span>' : esc(h.x))).join('')
  const [a, ...rest] = gapAlts(x.g)
  const ch = Math.min(30, (opts?.length ? Math.max(...opts.map(o => (o.w || '').length), 3) : Math.max(...gapAlts(x.g).map(v => v.length), 1)) + 3)
  return '<span class="slot" data-alt="' + esc(rest.join('/')) + '" style="min-width:' + ch + 'ch">' + esc(a ?? '') + '</span>'
}).join('')
const sentEl = ref(null), bar = ref(false)
function paint() { const el = sentEl.value, key = (s.value.phrase ?? '') + '|' + (s.value.opts ?? []).map(o => o.w).join('|'); if (el && document.activeElement !== el && el.dataset.k !== key) { el.innerHTML = gapHtml(s.value.phrase, s.value.opts); el.dataset.k = key } }
const bindSent = (el) => { sentEl.value = el; paint() }
function sentText(el) { let out = ''; el.childNodes.forEach((c) => { out += c.nodeType === 1 && c.classList?.contains('slot') ? '[' + c.textContent + (c.dataset.alt ? '/' + c.dataset.alt : '') + ']' : c.textContent }); return out.replace(/ /g, ' ').replace(/\n/g, ' ') }
function sentInput(e) { s.value.phrase = sentText(e.target); ed.changed() }
function paste(e) { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')) }
function onSel() { const sel = getSelection(), n = sel?.anchorNode, at = n?.nodeType === 3 ? n.parentElement : n; bar.value = !!sentEl.value && !!at && sentEl.value.contains(at) && !sel.isCollapsed && !!sel.toString().trim() }
onMounted(() => document.addEventListener('selectionchange', onSel))
onUnmounted(() => document.removeEventListener('selectionchange', onSel))
// позиция в тексте фразы со [скобками] (у пропусков на экране скобок нет — добавляем по 1 с каждой стороны)
function rawPos(el, node, off) {
  let acc = 0
  for (const c of el.childNodes) {
    const slot = c.nodeType === 1 && c.classList?.contains('slot')
    if (c === node || c.contains?.(node)) return acc + (slot ? 1 : 0) + (node.nodeType === 3 ? off : 0)
    acc += c.textContent.length + (slot ? 2 + (c.dataset.alt ? c.dataset.alt.length + 1 : 0) : 0)
  }
  return acc
}
function makeGap() {
  const sel = getSelection(), el = sentEl.value; if (!sel.rangeCount || !el) return
  const r = sel.getRangeAt(0); if ([r.startContainer, r.endContainer].some(n => (n.nodeType === 3 ? n.parentElement : n).closest('.slot'))) return alertSay('Это уже пропуск')
  let t = sentText(el), a = rawPos(el, r.startContainer, r.startOffset), b = rawPos(el, r.endContainer, r.endOffset)
  const w = t.slice(a, b).trim(); if (!w || /[\[\]]/.test(w)) return
  if (s.value.opts?.length) { const cut = (t.slice(0, a).match(/[\[\]]/g) ?? []).length; t = t.replace(/[\[\]]/g, ''); a -= cut; b -= cut }          // с вариантами — один пропуск: старый убираем
  else if (gapList(t).filter(x => x.g != null).length >= GAPS_MAX) return alertSay('Не больше 2 пропусков', { text: 'Уберите лишний: удалите слово из пропуска или поставьте курсор и сотрите его.' })
  s.value.phrase = t.slice(0, a) + '[' + w + ']' + t.slice(b); el.blur(); el.dataset.k = ''; paint(); bar.value = false; ed.changed()
}
// «Как в учебнике» Underline: фраза = до + [верный] + после; правим кусками, как видит ученик
function pkSet(part, v) { const g = gapParts(s.value.phrase); g[part] = v; s.value.phrase = `${g.a}[${g.gap}]${g.b}`; ed.changed() }
function pkOpt(k, v) { const was = s.value.opts[k].w; s.value.opts[k].w = v; if (was && was === gapParts(s.value.phrase).gap) pkSet('gap', v); else ed.changed() }
function delOpt(k) { s.value.opts.splice(k, 1); ed.changed() }
function addOpt() { (s.value.opts ??= []).push({ w: '' }); ed.changed() }
// «Также засчитывать» (как на макете Насти): другие верные ответы пропуска — плашками; в данных — [has lost/’s lost]
const altRows = computed(() => gapList(s.value.phrase).filter(x => x.g != null).map(x => ({ i: x.i, first: gapAlts(x.g)[0] ?? '', rest: gapAlts(x.g).slice(1) })))
function setAlts(gi, arr) { let n = -1; s.value.phrase = (s.value.phrase ?? '').replace(/\[([^\]]+)\]/g, (m) => (++n === gi ? '[' + arr.filter(Boolean).join('/') + ']' : m)); ed.changed() }
const altNew = ref({})
function addAlt(r) { const v = (altNew.value[r.i] ?? '').trim(); if (!v) return; setAlts(r.i, [r.first, ...r.rest, v]); altNew.value[r.i] = '' }
function tapWrite() { s.value.opts = s.value.opts?.length ? [] : [{ w: gapAlts(gp.value.gap)[0] || '' }, { w: '' }]; ed.changed() }
const pcm = () => ['video', 'image', 'audio'].map(k => ed.pct(s.value, k)).find(v => v != null) ?? null
const media = computed(() => !!(s.value.video || s.value.image))
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <div v-if="media" class="nw"><ExMedia :step="step" :controls="false" vpill :autoplay="!p.single && !p.embedded" :vref="p.setVid" :audio="step.video ? false : { add: '＋ Аудио' }" @vclick="p.again" /></div>
    <ExAudio v-else-if="step.audio" :step="step" at="row" />
    <template v-if="!p.edit">
      <div v-if="!gp.gap" class="empty">Отметьте пропуск: слово в [квадратных скобках]</div>
      <!-- Т5 «Underline the correct word»: варианты прямо в предложении, тап — подчёркивает, как ручкой -->
      <p v-else-if="underline && step.opts?.length" class="sent bko">{{ gp.a }}<template v-for="(o, k) in step.opts" :key="k"><b class="uo" :class="{ on: p.st.picked === k, ok: p.st.done && okOpt(o), no: p.st.done && k === p.st.picked && !p.st.res }" @click="p.fill(k)">{{ o.w }}</b><template v-if="k < step.opts.length - 1"> / </template></template>{{ gp.b }}</p>
      <p v-else-if="step.opts?.length" class="sent">{{ gp.a }}<span class="slot" :style="{ minWidth: optCh + 'ch' }" :class="{ ok: p.st.done && p.st.res, no: p.st.done && !p.st.res }">{{ p.st.typed || ' ' }}</span>{{ gp.b }}</p>
      <p v-else class="sent"><template v-for="(x, n) in gl" :key="n"><template v-if="x.g == null"><template v-for="(h, j) in hintParts(x.t)" :key="j"><span v-if="h.h" class="brh">{{ h.x }}</span><template v-else>{{ h.x }}</template></template></template><input v-else v-model="p.st.tys[x.i]" class="slot in" :style="{ width: Math.min(30, Math.max(...gapAlts(x.g).map(a => a.length)) + 3) + 'ch' }" :placeholder="gl.length === 1 ? 'Напечатай здесь' : ''" :class="{ ok: p.st.done && p.gapOkAt(x), no: p.st.done && !p.gapOkAt(x) }" :readonly="p.st.done" autocomplete="off" autocapitalize="off" spellcheck="false" @keydown.enter.stop="p.check" /></template></p>
      <div v-if="step.opts?.length && !underline" class="pool">
        <button v-for="k in p.st.order" :key="k" class="chip" :class="{ ok: p.st.done && okOpt(step.opts[k]), no: p.st.done && k === p.st.picked && !p.st.res }" @click="p.fill(k)">{{ step.opts[k].w }}</button>
      </div>
    </template>
    <template v-else>
      <!-- Underline: как у ученика — варианты прямо в предложении; точка над словом — верный вариант -->
      <p v-if="underline" class="vbko vbkp"><input class="exf vpa" :value="gp.a" placeholder="Pat usually cooks dinner" @input="pkSet('a', $event.target.value)" /><template v-for="(o, k) in step.opts" :key="k"><span class="vpo" :class="{ on: !!o.w && o.w === gp.gap }"><button type="button" class="vcr" :title="o.w === gp.gap ? 'Верный вариант' : 'Сделать верным'" @click="pkSet('gap', o.w)" /><input class="exf" :value="o.w" placeholder="вариант" @input="pkOpt(k, $event.target.value)" /><button v-if="step.opts.length > 2" type="button" class="ex-x cx" title="Убрать вариант" @click="delOpt(k)">✕</button></span><template v-if="k < step.opts.length - 1"> / </template></template><input class="exf vpa" :value="gp.b" placeholder="." @input="pkSet('b', $event.target.value)" /></p>
      <div v-else class="vsw">
        <p :ref="bindSent" class="vsent exf" contenteditable="true" spellcheck="false" data-ph="And [you]? — выделите слово → пропуск" title="Выделите слово — «→ пропуск». Несколько верных — через /: [isn't/is not]. Подсказка — просто в скобках: (make). Без вариантов — до 2 пропусков" @input="sentInput" @paste="paste" @keydown.enter.prevent @pointerdown.stop />
        <div v-if="bar" class="bbar"><button type="button" title="Выделенное станет пропуском" @mousedown.prevent="makeGap">→ пропуск</button></div>
      </div>
      <div v-if="(step.opts?.length || tplOf(step) === 'fill') && !underline" class="vpool">
        <span v-for="(o, k) in step.opts" :key="k" class="vchip" :class="{ vok: okOpt(o) }"><input v-model="o.w" class="exf" :size="Math.max(3, (o.w || '').length)" placeholder="слово" @input="ed.changed()" /><button type="button" class="xx" title="Убрать" @click="delOpt(k)">✕</button></span>
        <button v-if="(step.opts?.length ?? 0) < GAP_OPTS_MAX" type="button" class="vchip vplus" title="Добавить вариант" @click="addOpt">＋</button>
      </div>
    </template>
  </template>
  <template v-else-if="part === 'fb' && p.st.done">
    <b>{{ p.right ? 'Верно!' : 'Правильный ответ:' }}</b><span class="fs">{{ gapFull(step.phrase) }}</span><small>{{ step.tr }}</small><small v-if="p.later" class="lt">Вернёмся к этому в конце урока</small>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool v-if="step.bk && step.bk !== 'bkpick' && step.bk !== 'bkpic'" on :title="step.opts?.length ? 'Сейчас — тап: ученик выбирает из банка слов. Нажмите — будет вписывать' : 'Сейчас — письмо: ученик вписывает. Нажмите — будет выбирать тапом из банка слов'" @click="tapWrite">{{ step.opts?.length ? 'Тап' : 'Письмо' }}</ExTool>
    <ExTool v-if="!media" :title="step.audio ? 'Видео или фото к вопросу (16:9)' : 'Фото, видео или звук'" @click="ed.pick(step, step.audio ? ['video', 'image'] : ['video', 'image', 'audio'])">＋{{ step.bk ? '' : step.audio ? ' Фото' : ' Медиа' }}{{ pcm() != null ? ' ' + pcm() + '%' : '' }}</ExTool>
    <ExPop v-model="step.tr" :label="step.opts?.length ? 'Перевод' : 'Ответы'" :done="!!(step.tr || altRows.some(r => r.rest.length))" hint="Перевод фразы — ученик увидит после ответа" ph="Хорошо, спасибо. А ты?">
      <template v-if="!step.opts?.length && altRows.length">
        <div v-for="r in altRows" :key="r.i" class="valr"><small>Также засчитывать<template v-if="altRows.length > 1"> ({{ r.first || '…' }})</template>:</small>
          <span v-for="(a, k) in r.rest" :key="k" class="valc">{{ a }}<button type="button" title="Убрать вариант" @click="setAlts(r.i, [r.first, ...r.rest.filter((_, j) => j !== k)])">✕</button></span>
          <input v-model="altNew[r.i]" class="valn" placeholder="＋ Добавить вариант" @keydown.enter.prevent="addAlt(r)" @blur="addAlt(r)" />
        </div>
      </template>
    </ExPop>
  </template>
</template>

<style scoped>
.nw { width: 100%; max-width: 380px; align-self: center; display: grid }
.empty { margin: 6px 0; padding: 18px; border: 1px dashed var(--border); border-radius: 12px; text-align: center; color: var(--hint); font-size: 14px; font-weight: 700 }
.pool { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding-top: 4px }
.chip { padding: 9px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); font: inherit; font-size: 15px; font-weight: 600; color: var(--text); cursor: pointer }
.chip:hover { border-color: #1a73e8 } .chip.ok { background: #8ff0c8; border-color: #8ff0c8 } .chip.no { background: var(--red-l); border-color: var(--red); animation: shake .3s }
@keyframes shake { 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
.sent { margin: 6px 0; text-align: center; font-size: 18px; font-weight: 600; line-height: 1.6 }
.slot { display: inline-block; min-width: 80px; margin: 0 3px; padding: 0 4px; border-bottom: 2px dotted #1a73e8; color: #1a73e8; text-align: center }
.slot.in { min-width: 0; border: 0; border-bottom: 2px dotted #1a73e8; background: none; font: inherit; outline: none; border-radius: 0 }
.slot.ok { color: #128a55; border-bottom-color: #1fbe78 } .slot.no { color: var(--red-d); border-bottom-color: var(--red) }
.brh { color: #1a73e8 }          /* подсказка в скобках — «(lose)», как в учебнике */
@media (min-width: 900px) {
  .lp:not(.embedded):not(.single) .nw { max-width: 700px }
  .lp:not(.embedded):not(.single) .chip { font-size: 18px; padding: 11px 18px } .lp:not(.embedded):not(.single) .sent { font-size: 22px }
}
/* книжные (Настины): бумага учебника */
.lp.book .sent { text-align: left; font-size: 17px; font-weight: 400; line-height: 2 }
.lp.book .slot { border-bottom: 1.5px dotted #2c2c2a; background: none; color: #185fa5; font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; font-weight: 400 }
.lp.book input.slot.in { border-radius: 0; box-shadow: none; outline: 0 } .lp.book input.slot.in::placeholder { color: #b4b2a9; font-family: Arial, sans-serif }
.lp.book .slot.ok { color: #0f6e56; border-bottom-color: #0f6e56 } .lp.book .slot.no { color: #a32d2d; text-decoration: line-through; border-bottom-color: #a32d2d }
.lp.book .brh { color: inherit; font-weight: 700 }
.lp.book .pool { justify-content: flex-start; gap: 4px 16px; padding: 7px 12px; border-radius: 6px; background: #f1efe8 }
.lp.book .pool .chip { padding: 3px 0; border: 0; border-radius: 0; background: none; box-shadow: none; color: #2c2c2a; font-size: 15px; font-weight: 700 }
.lp.book .pool .chip:hover { color: #185fa5 } .lp.book .pool .chip.ok { color: #0f6e56; text-decoration: underline 2px } .lp.book .pool .chip.no { color: #a32d2d; text-decoration: line-through }
/* «Как в учебнике» */
.lp.book.bkpg .sent { line-height: 2.1 }
.lp.book.bkpg .bko b { font-weight: 700; cursor: pointer; border-radius: 12px; transition: background .12s } .lp.book.bkpg .bko b:hover { background: #eef4ff }
.lp.book.bkpg .bko .uo.on { text-decoration: underline 2px #1f5fbf; text-underline-offset: 4px; color: #1f5fbf }
.lp.book.bkpg .bko .uo.ok { text-decoration: underline 2px #0f6e56; text-underline-offset: 4px; color: #0f6e56 } .bko .uo.no { text-decoration: line-through 2px #a32d2d; color: #a32d2d }
.lp.book.bkpg.bkqa .sent input.slot.in { display: block; width: 100% !important; margin: 4px 0 0; text-align: left }

/* ---- правка: фраза правится прямо в строке, пропуск — синим на пунктире ---- */
.vsw { position: relative }
.vsent { margin: 6px 0; text-align: center; font-size: 18px; font-weight: 600; line-height: 1.6; white-space: pre-wrap; cursor: text; user-select: text; -webkit-user-select: text }
.vsent:empty::before { content: attr(data-ph); color: var(--hint-2) }
.vsent :deep(.slot) { display: inline-block; box-sizing: border-box; min-width: 80px; margin: 0 3px; padding: 0 4px; border-bottom: 2px dotted #1a73e8; color: #1a73e8; text-align: center }
.vsent :deep(.brh) { color: #1a73e8 }
.bbar { position: absolute; right: 0; top: -30px; z-index: 5; display: flex; gap: 2px; padding: 3px; border-radius: 8px; background: #2c2c2a; box-shadow: 0 2px 8px rgba(0, 0, 0, .2) }
.bbar button { border: 0; border-radius: 5px; padding: 3px 9px; background: none; color: #fff; font: inherit; font-size: 12px; cursor: pointer } .bbar button:hover { background: #444 }
.vpool { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; padding-top: 4px }
.vchip { position: relative; flex: none; display: inline-flex; padding: 9px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); font-size: 15px; font-weight: 600 }
.vchip input { width: auto; field-sizing: content; text-align: center; min-width: 2ch; background: transparent; box-shadow: none; font-size: 15px; font-weight: 600; line-height: normal } .vchip input:focus { background: #fff }
.vchip.vok { background: #8ff0c8; border-color: #8ff0c8 }
.vchip.vplus { border-color: transparent; background: rgba(13, 153, 255, .08); color: var(--blue-d); font: inherit; font-size: 15px; font-weight: 800; cursor: pointer }
.xx { position: absolute; right: -7px; top: -7px; width: 18px; height: 18px; padding: 0; border: 1px solid var(--border); border-radius: 50%; background: var(--card); color: var(--hint); font-size: 9px; cursor: pointer; opacity: 0 } .vchip:hover .xx { opacity: 1 }
@media (hover: none) { .xx { opacity: 1 } }
.lp.book .vsent { text-align: left; font-size: 17px; font-weight: 400; line-height: 2 }
.lp.book .vsent :deep(.slot) { border-bottom: 1.5px dotted #2c2c2a; color: #185fa5; font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive }
.lp.book .vsent :deep(.brh) { color: inherit; font-weight: 700 }
.lp.book .vpool { justify-content: flex-start; gap: 4px 16px; padding: 7px 12px; border-radius: 6px; background: #f1efe8 }
.lp.book .vpool .vchip { height: 27px; box-sizing: border-box; padding: 3px 4px; margin: 0 -4px; border: 0; background: none; font-weight: 700 }
.lp.book .vchip.vok { background: none; color: #0f6e56; text-decoration: underline 2px } .lp.book .vchip input { font-weight: 700 } .lp.book .vchip.vplus { background: rgba(13, 153, 255, .1) }
.lp.book.bkpg .vsent { line-height: 2.1 }
.lp.book.bkpg.bkqa .vsent :deep(.slot) { display: block; width: 100%; margin: 4px 0 0; text-align: left }
/* Underline в правке: куски фразы и варианты — полями в строке */
.vbko { margin: 0; font-size: 17px; line-height: 2.2; text-align: left }
.lp.book.bkpg .vbko { margin: 6px 0; font-size: 17px; line-height: 2.1 }
.vbkp .exf { display: inline-block; width: auto; min-width: 1ch; field-sizing: content; font-size: 17px; line-height: normal; vertical-align: baseline; border-radius: 4px }
.vbkp .vpa { font-weight: 400; text-align: left } .vbkp .vpa:first-child { margin-right: .28em } .vbkp .vpa:last-child { margin-left: .1em }
.vpo { position: relative; display: inline-block } .vpo .exf { font-weight: 700; text-align: center }
.vpo.on .exf { text-decoration: underline 2px #1f5fbf; text-underline-offset: 4px; color: #1f5fbf }
.vcr { position: absolute; left: 50%; top: -6px; translate: -50% 0; width: 10px; height: 10px; padding: 0; border: 1.5px solid #9db6e6; border-radius: 50%; background: #fff; cursor: pointer; opacity: 0 }
.vpo:hover .vcr { opacity: 1 } .vpo.on .vcr { background: #1f5fbf; border-color: #1f5fbf; opacity: 1 }
.cx { position: absolute; top: -8px; right: -10px; width: 18px; height: 18px; font-size: 9px; opacity: 0 } .vpo:hover .cx { opacity: 1 }
@media (hover: none) { .cx, .vcr { opacity: 1 } }
/* «Ответы»: также засчитывать — плашками */
.valr { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-bottom: 6px } .valr small { font-size: 11px; font-weight: 700; color: var(--hint) }
.valc { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border-radius: 10px; background: #d9f2df; color: #1f5c33; font-size: 12px; font-weight: 700 }
.valc button { border: 0; padding: 0 3px; background: none; color: inherit; opacity: .6; font-size: 10px; cursor: pointer } .valc button:hover { opacity: 1 }
.valn { width: 140px; margin: 0; padding: 3px 8px; border: 0; border-radius: 10px; background: rgba(13, 153, 255, .08); color: var(--blue-d); font: inherit; font-size: 12px; font-weight: 700 }
.valn::placeholder { color: var(--blue-d) } .valn:focus { outline: 0; background: #fff; box-shadow: 0 0 0 2px #0d99ff } .valn:focus::placeholder { color: var(--hint-2) }
</style>

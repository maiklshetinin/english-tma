<script setup>
// «Найди лишнее» (книжный): цветные плитки — ученик выбирает лишнее и «Проверить».
// «Как в учебнике» (Т7 «Circle the …»): группа слов строкой, тап — обводит кружком.
// Один шаблон и для ученика, и для правки (p.edit): те же плитки, слово правится на месте;
// кружок слева — лишнее, точка справа — цвет плитки (по кругу), ✕ — убрать. part: body / fb / tools.
import { computed } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExTool from '../parts/ExTool.vue'
import ExPop from '../parts/ExPop.vue'
import { usePlay, useEdit } from '../ctx'
import { TILE, TILE_K, tileK } from '../../utils/lesson'
import J from './odd.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const s = computed(() => props.step)
const page = computed(() => !!s.value.bk && s.value.bs === 'page')
const ans = computed(() => s.value.ans ?? 0)
const tile = (k, i) => TILE[tileK(k, i)]
const nextTile = (k, i) => tile(TILE_K[(TILE_K.indexOf(tileK(k, i)) + 1) % TILE_K.length], 0)
function nextK(o, i) { o.k = TILE_K[(TILE_K.indexOf(tileK(o.k, i)) + 1) % TILE_K.length]; ed.changed() }
function setAns(k) { s.value.ans = k; ed.changed() }
function delOpt(k) { s.value.opts.splice(k, 1); if (s.value.ans >= s.value.opts.length || s.value.ans === k) s.value.ans = 0; else if (s.value.ans > k) s.value.ans--; ed.changed() }
function addOpt() { (s.value.opts ??= []).push({ w: '', k: TILE_K[s.value.opts.length % 5] }); ed.changed() }
function flip(k) { if (s.value[k] === false) delete s.value[k]; else s.value[k] = false; ed.changed() }
const cls = (k) => ({ ok: p.st.done && k === ans.value, no: p.st.done && k === p.st.picked && k !== ans.value })
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <template v-if="!p.edit">
      <p v-if="page" class="sent bko"><template v-for="(k, n) in p.st.order" :key="k"><b class="co" :class="{ on: p.st.picked === k && !p.st.done, ...cls(k) }" @click="!p.st.done && (p.st.picked = k)">{{ step.opts[k].w }}</b><template v-if="n < p.st.order.length - 1"> / </template></template></p>
      <div v-else class="oddg"><button v-for="k in p.st.order" :key="k" class="ot" :class="{ sel: p.st.picked === k && !p.st.done, ...cls(k) }" :style="{ background: tile(step.opts[k].k, k).bg, color: tile(step.opts[k].k, k).fg }" @click="!p.st.done && (p.st.picked = k)">{{ step.opts[k].w }}</button></div>
    </template>
    <template v-else>
      <!-- как в учебнике: группа слов строкой; лишнее — обведено (кружок над словом — отметить лишнее) -->
      <p v-if="page" class="vbko"><template v-for="(o, k) in step.opts" :key="k"><span class="vco" :class="{ on: ans === k }"><button type="button" class="vcr" :title="ans === k ? 'Это лишнее (обведено)' : 'Сделать лишним'" @click="setAns(k)" /><input v-model="o.w" class="exf" :size="Math.max(3, (o.w || '').length)" placeholder="слово" @input="ed.changed()" /><button type="button" class="ex-x cx" title="Убрать слово" @click="delOpt(k)">✕</button></span><template v-if="k < step.opts.length - 1"> / </template></template></p>
      <div v-else class="oddg">
        <div v-for="(o, k) in step.opts" :key="k" class="ot ed" :class="{ right: ans === k }" :style="{ background: tile(o.k, k).bg, color: tile(o.k, k).fg }">
          <button type="button" class="rad" :title="ans === k ? 'Это лишнее' : 'Кружок — лишнее слово: нажмите, чтобы отметить'" @click="setAns(k)" />
          <input v-model="o.w" class="exf" placeholder="слово" @input="ed.changed()" />
          <button type="button" class="kdot" title="Цвет плитки" :style="{ background: nextTile(o.k, k).bg }" @click="nextK(o, k)" />
          <button type="button" class="ex-x cx" title="Убрать слово" @click="delOpt(k)">✕</button>
        </div>
      </div>
    </template>
  </template>
  <template v-else-if="part === 'fb' && p.st.done">
    <b>{{ p.right ? 'Верно!' : 'Лишнее:' }}</b><span v-if="!p.right" class="fs">{{ step.opts?.[ans]?.w }}</span><small v-if="step.note">{{ step.note }}</small>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool v-if="(step.opts?.length ?? 0) < J.limits.opts" title="Добавить слово" @click="addOpt">＋</ExTool>
    <ExPop v-model="step.note" label="Пояснение" hint="Пояснение после ответа (необязательно)" ph="Coffee — напиток, остальное — еда." multi />
    <ExTool :on="step.mix !== false" :title="step.mix !== false ? 'Слова перемешиваются у ученика — нажмите, чтобы не мешать' : 'Слова в этом порядке — нажмите, чтобы перемешивать'" @click="flip('mix')">⤮</ExTool>
  </template>
</template>

<style scoped>
.oddg { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100% }
.ot { min-height: 64px; padding: 12px; border: 2px solid transparent; border-radius: 14px; font: inherit; font-size: 17px; font-weight: 700; cursor: pointer; transition: border-color .12s, transform .12s }
.ot:hover { transform: translateY(-1px) } .ot.sel { border-color: #1a73e8 } .ot.ok { border-color: #1fbe78; box-shadow: 0 0 0 2px #8ff0c8 } .ot.no { border-color: var(--red); animation: shake .3s }
@keyframes shake { 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
.sent { margin: 6px 0; text-align: center; font-size: 18px; font-weight: 600; line-height: 1.6 }
.lp.book .sent { text-align: left; font-size: 17px; font-weight: 400; line-height: 2 } .lp.book.bkpg .sent { line-height: 2.1 }
.lp.book.bkpg .bko b { font-weight: 700; cursor: pointer; border-radius: 12px; transition: background .12s } .lp.book.bkpg .bko b:hover { background: #eef4ff }
.lp.book.bkpg .bko .co { padding: 1px 7px; border: 2px solid transparent; border-radius: 50% }
.bko .co.on { border-color: #1f5fbf; color: #1f5fbf } .bko .co.ok { border-color: #0f6e56; color: #0f6e56 } .bko .co.no { border-color: #a32d2d; color: #a32d2d; text-decoration: line-through }
@media (min-width: 900px) { .lp:not(.embedded):not(.single) .sent { font-size: 22px } }
/* правка: те же плитки; кружок — лишнее, точка — цвет, ✕ — убрать */
.ot.ed { position: relative; display: grid; place-items: center; box-sizing: border-box; cursor: default } .ot.ed:hover { transform: none }
.ot.right { border-color: #1fbe78 }
.ot.ed .exf { background: rgba(255, 255, 255, .35); box-shadow: none; text-align: center; font-size: 17px; font-weight: 700; color: inherit; line-height: normal } .ot.ed .exf:focus { background: #fff }
.rad { position: absolute; left: 7px; top: 7px; width: 18px; height: 18px; padding: 0; border: 2px solid #fff; border-radius: 50%; background: rgba(0, 0, 0, .25); box-shadow: 0 0 0 1px rgba(0, 0, 0, .15); cursor: pointer }
.ot.right .rad { background: #1fbe78; box-shadow: 0 0 0 1px #1fbe78, inset 0 0 0 3px #fff }
.kdot { position: absolute; right: 8px; top: 8px; width: 14px; height: 14px; padding: 0; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0, 0, 0, .15); cursor: pointer }
.cx { position: absolute; width: 18px; height: 18px; font-size: 9px; opacity: 0 }
.ot .cx { right: 26px; top: 5px } .ot:hover .cx { opacity: 1 }
.vbko { margin: 0; font-size: 17px; line-height: 2.2; text-align: left } .lp.book.bkpg .vbko { margin: 6px 0; font-size: 17px; line-height: 2.1 }
.vco { position: relative; display: inline-flex; align-items: center; padding: 0 6px; border: 2px solid transparent; border-radius: 50% } .vco.on { border-color: #1f5fbf }
.vco .exf { width: auto; min-width: 2ch; background: rgba(13, 153, 255, .07); box-shadow: none; text-align: center; font-weight: 700; font-size: 17px; line-height: 1.3 }
.lp.book.bkpg .vco { padding: 1px 7px } .lp.book.bkpg .vco .exf { field-sizing: content; width: auto; min-width: 2ch; padding: 0; line-height: normal; border-radius: 4px }
.vcr { position: absolute; left: 50%; top: -6px; translate: -50% 0; width: 10px; height: 10px; padding: 0; border: 1.5px solid #9db6e6; border-radius: 50%; background: #fff; cursor: pointer; opacity: 0 }
.vco:hover .vcr { opacity: 1 } .vco.on .vcr { background: #1f5fbf; border-color: #1f5fbf; opacity: 1 }
.vco .cx { top: -8px; right: -8px } .vco:hover .cx { opacity: 1 }
@media (hover: none) { .cx, .vcr { opacity: 1 } }
</style>

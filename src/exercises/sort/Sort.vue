<script setup>
// «Распредели по колонкам» (книжный): нажать фразу, потом колонку; «Проверить» — ошибки красные.
// «Заполни таблицу» (Настя, tw): слова сверху, образцы зачёркнуты и уже вписаны; ученик вписывает форму в колонку (порядок не важен).
// Один шаблон и для ученика, и для правки (p.edit): в правке фразы стоят в своих (верных) колонках, карандаш — цвет, перенести, удалить;
// у таблицы клетка = ответ (bags) и слово для банка (bag), нажать слово в банке — образец. part: body / fb / tools.
import { computed, ref, nextTick } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExAudio from '../parts/ExAudio.vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit } from '../ctx'
import { TILE, TILE_K, tileK, twLayout, SORT_MAX, SORT_COLS_MAX, TW_ROWS_MAX } from '../../utils/lesson'
import J from './sort.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const s = computed(() => props.step)
const tile = (k, i) => TILE[tileK(k, i)]
const twL = computed(() => (s.value.tw ? twLayout(s.value) : null))
const grid = computed(() => ({ gridTemplateColumns: `repeat(${s.value.cols?.length || 2}, minmax(0, 1fr))` }))
const left = computed(() => (s.value.tw ? p.st.tw.flat().filter(v => !v.trim()).length : p.st.order.filter(k => p.st.place[k] == null).length))
// ---- правка ----
const menu = ref(null)          // открыто меню фразы (карандаш) — как на макете Насти
const flip = (k) => { if (s.value[k] === false) delete s.value[k]; else s.value[k] = false; ed.changed() }
const flag = (o, k) => { if (o[k]) delete o[k]; else o[k] = true; ed.changed() }
const setCols = (n) => { s.value.cols ??= []; while (s.value.cols.length < n) s.value.cols.push({ t: '' }); s.value.cols.length = n; (s.value.items ?? []).forEach(x => { if (x.c >= n) x.c = n - 1 }); ed.changed() }
const addItem = (c) => { if ((s.value.items ??= []).length < SORT_MAX) { s.value.items.push({ w: '', c, k: TILE_K[s.value.items.length % TILE_K.length] }); ed.changed() } }
const delItem = (it) => { s.value.items.splice(s.value.items.indexOf(it), 1); menu.value = null; ed.changed() }
const moveTo = (it, j) => { it.c = j; menu.value = null; ed.changed() }
const setTile = (it, k) => { it.k = k; ed.changed() }
// таблица: клетка = ответ и слово для банка; строки — сколько нужно, но не меньше s.rows
const twCol = (ci) => (s.value.items ?? []).filter(x => x.c === ci)
const twRows = computed(() => Math.max(s.value.rows ?? 0, 1, ...(s.value.cols ?? []).map((_, ci) => twCol(ci).length)))
const tblEl = ref(null)
async function twNew(ci) {
  if ((s.value.items ??= []).length >= SORT_MAX) return
  const r = twCol(ci).length; s.value.items.push({ w: '', a: '', c: ci }); ed.changed(); await nextTick()
  tblEl.value?.querySelector(`[data-tw="${ci}:${r}"] .etwa`)?.focus()
}
const twDel = (it) => { s.value.items.splice(s.value.items.indexOf(it), 1); ed.changed() }
const twAddRow = () => { s.value.rows = Math.min(TW_ROWS_MAX, twRows.value + 1); ed.changed() }
const twAddCol = () => { if ((s.value.cols?.length ?? 0) < SORT_COLS_MAX) { s.value.cols.push({ t: '' }); ed.changed() } }
const twDelCol = (ci) => { s.value.cols.splice(ci, 1); s.value.items = (s.value.items ?? []).filter(x => x.c !== ci).map(x => (x.c > ci ? { ...x, c: x.c - 1 } : x)); ed.changed() }
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="step.tw ? 'Complete the table' : J.head" />
    <ExAudio v-if="step.audio" :step="step" at="row" />          <!-- «Listen and check» — звук необязателен; нет — «＋ Звук» в подвале правки -->
    <!-- Заполни таблицу -->
    <template v-if="step.tw && !p.edit">
      <div class="twb"><span v-for="(x, k) in twL.bank" :key="k" :class="{ twe: x.ex && !step.noEx }">{{ x.w }}</span></div>
      <div class="twt" :style="grid">
        <b v-for="(c, ci) in step.cols" :key="'h' + ci" class="twh">{{ c.t }}</b>
        <template v-for="r in twL.rows" :key="'r' + r">
          <span v-for="(c, ci) in twL.cols" :key="ci" class="twc">
            <i v-if="r - 1 < c.ex.length" class="twx">{{ c.ex[r - 1].a.split('/')[0] }}</i>
            <input v-else-if="r - 1 - c.ex.length < c.need" v-model="p.st.tw[ci][r - 1 - c.ex.length]" class="twi" :class="{ ok: p.st.done && p.st.twr?.ok[ci]?.[r - 1 - c.ex.length] === true, no: p.st.done && p.st.twr?.ok[ci]?.[r - 1 - c.ex.length] !== true }" :readonly="p.st.done" autocomplete="off" autocapitalize="off" spellcheck="false" />
          </span>
        </template>
      </div>
    </template>
    <template v-else-if="step.tw">
      <div class="etwb" title="Слова для ученика — из нижней строки клеток. Нажмите слово — станет образцом (зачёркнуто, ответ уже вписан)"><button v-for="(x, k) in (step.items ?? []).filter(x => x.w?.trim())" :key="k" type="button" :class="{ ex: x.ex && !step.noEx }" @click="flag(x, 'ex')">{{ x.w }}</button><small v-if="!(step.items ?? []).some(x => x.w?.trim())">слова появятся из клеток</small></div>
      <div ref="tblEl" class="etwt" :style="grid">
        <span v-for="(c, ci) in step.cols" :key="'h' + ci" class="etwh"><input v-model="c.t" class="exf" :placeholder="'кол. ' + (ci + 1)" @input="ed.changed()" /><button v-if="step.cols.length > 2" type="button" class="etwd" title="Убрать колонку" @click="twDelCol(ci)">✕</button></span>
        <template v-for="r in twRows" :key="'r' + r">
          <span v-for="(c, ci) in step.cols" :key="ci" class="etwc" :data-tw="ci + ':' + (r - 1)">
            <template v-if="twCol(ci)[r - 1]">
              <input v-model="twCol(ci)[r - 1].a" class="exf etwa" :class="{ ex: twCol(ci)[r - 1].ex && !step.noEx }" placeholder="ответ" @input="ed.changed()" />
              <input v-model="twCol(ci)[r - 1].w" class="exf etww" placeholder="слово" @input="ed.changed()" />
              <button type="button" class="etwd" title="Убрать клетку" @click="twDel(twCol(ci)[r - 1])">✕</button>
            </template>
            <button v-else-if="(step.items?.length ?? 0) < SORT_MAX" type="button" class="etwn" title="Добавить ответ в эту колонку" @click="twNew(ci)">＋</button>
          </span>
        </template>
        <span class="etwk" title="Добавить строку или колонку таблицы"><ExTool :disabled="twRows >= TW_ROWS_MAX" @click="twAddRow">＋ Строка</ExTool><ExTool :disabled="(step.cols?.length ?? 0) >= SORT_COLS_MAX" @click="twAddCol">＋ Колонка</ExTool></span>
      </div>
    </template>
    <!-- Распредели по колонкам -->
    <template v-else-if="!p.edit">
      <p v-if="step.hint !== false" class="sub">Нажмите фразу, затем колонку</p>
      <div class="spool"><button v-for="k in p.st.order.filter(k => p.st.place[k] == null)" :key="k" class="sw" :class="{ sel: p.st.sel === k }" :style="{ background: tile(step.items[k].k, k).bg, color: tile(step.items[k].k, k).fg }" @click="p.sortPick(k)">{{ step.items[k].w }}</button></div>
      <div class="scols" :style="grid">
        <div v-for="(c, ci) in step.cols" :key="ci" class="scol">
          <div class="sch">{{ c.t || '…' }}</div>
          <div class="sbox" :class="{ hot: p.st.sel != null }" @click="p.sortPut(ci)">
            <span v-for="k in p.st.order.filter(k => p.st.place[k] === ci)" :key="k" class="sw in" :class="{ ok: p.st.done && p.sortOkAt(k), no: p.st.done && !p.sortOkAt(k) }" :style="p.st.done ? null : { background: tile(step.items[k].k, k).bg, color: tile(step.items[k].k, k).fg }">{{ step.items[k].w }}<button v-if="!p.st.done" class="sx" title="Убрать обратно" @click.stop="p.sortBack(k)">✕</button></span>
            <span v-if="p.st.sel != null" class="sadd">Нажмите, чтобы добавить сюда</span>
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <p v-if="step.hint !== false" class="sub">Нажмите фразу, затем колонку</p>
      <div class="scols ed" :style="grid">
        <div v-for="(c, ci) in step.cols" :key="ci" class="scol">
          <input v-model="c.t" class="sch exf" :placeholder="'Колонка ' + (ci + 1)" @input="ed.changed()" />
          <div class="sbox">
            <span v-for="it in (step.items ?? []).filter(x => x.c === ci)" :key="step.items.indexOf(it)" class="sw" :style="{ background: tile(it.k, step.items.indexOf(it)).bg, color: tile(it.k, step.items.indexOf(it)).fg }">
              <textarea v-model="it.w" class="exf" rows="1" placeholder="фраза" @input="ed.changed()" />
              <button type="button" class="pen" title="Цвет, перенести, удалить" @click="menu = menu === it ? null : it">✎</button>
              <span v-if="menu === it" class="smenu" @pointerdown.stop>
                <small>Цвет фразы</small>
                <span class="sdots"><button v-for="k in TILE_K" :key="k" type="button" :class="{ on: tileK(it.k, step.items.indexOf(it)) === k }" :style="{ background: TILE[k].bg }" @click="setTile(it, k)" /></span>
                <button v-for="(c2, j) in step.cols" v-show="j !== it.c" :key="j" type="button" class="smi" @click="moveTo(it, j)">Переместить в «{{ c2.t || 'Колонка ' + (j + 1) }}» →</button>
                <button type="button" class="smi del" @click="delItem(it)">Удалить</button>
              </span>
            </span>
            <button v-if="(step.items?.length ?? 0) < SORT_MAX" type="button" class="sadd" @click="addItem(ci)">＋ Фраза</button>
          </div>
        </div>
      </div>
    </template>
  </template>
  <template v-else-if="part === 'fb' && p.st.done">
    <b>{{ p.right ? 'Верно!' : step.tw ? 'Правильно:' : 'Есть ошибки — они красные' }}</b><span v-if="step.tw && !p.right && p.st.twr?.miss.length" class="fs">{{ p.st.twr.miss.join(', ') }}</span><small v-if="step.note">{{ step.note }}</small>
  </template>
  <template v-else-if="part === 'fb'">
    <small class="left">{{ step.tw ? 'Осталось клеток' : 'Осталось фраз' }}: {{ left }}</small>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool v-if="!step.audio" title="Звук «Listen and check» (необязательно)" @click="ed.pick(step, ['audio'])">＋ Звук{{ ed.pct(step, 'audio') != null ? ' ' + ed.pct(step, 'audio') + '%' : '' }}</ExTool>
    <template v-if="step.tw">
      <ExTool :on="!step.noEx" :title="step.noEx ? 'Без образцов — ученик вписывает всё' : 'Образцы (зачёркнутые слова) уже вписаны — нажмите слово в банке, чтобы сделать образцом'" @click="flag(step, 'noEx')">Образец</ExTool>
      <ExTool :on="!step.cs" :title="step.cs ? 'Регистр важен: Bags ≠ bags' : 'Без учёта регистра: Bags = bags'" @click="flag(step, 'cs')">a = A</ExTool>
    </template>
    <template v-else>
      <ExTool title="Сколько колонок — от 2 до 5 (нажимайте по кругу)" @click="setCols((step.cols?.length || 2) >= SORT_COLS_MAX ? 2 : (step.cols?.length || 2) + 1)">{{ step.cols?.length || 2 }} кол.</ExTool>
      <ExTool :on="step.hint !== false" :title="step.hint !== false ? 'Подсказка «Нажмите фразу, затем колонку» — есть' : 'Подсказки нет'" @click="flip('hint')">?</ExTool>
      <ExTool :on="step.mix !== false" :title="step.mix !== false ? 'Фразы перемешиваются у ученика' : 'Фразы в этом порядке'" @click="flip('mix')">⤮</ExTool>
    </template>
  </template>
</template>

<style scoped>
.sub { margin: -8px 0 0; text-align: center; font-size: 12px; font-weight: 600; color: var(--hint) }
.spool { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; min-height: 36px }
.sw { position: relative; padding: 7px 12px; border: 2px solid transparent; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; text-align: left }
.sw.sel { border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26, 115, 232, .18) }
.sw.in { display: flex; align-items: center; justify-content: space-between; gap: 6px; cursor: default } .sw.ok { background: #e3fbef; color: #128a55; border-color: #8ff0c8 } .sw.no { background: var(--red-l); color: var(--red-d); border-color: var(--red) }
.sx { flex: none; border: 0; padding: 0 2px; background: none; color: inherit; opacity: .6; font-size: 11px; cursor: pointer } .sx:hover { opacity: 1 }
.scols { display: grid; gap: 10px; width: 100% }
.scol { display: grid; gap: 8px; align-content: start; min-width: 0 }
.sch { padding: 8px; border: 1px solid var(--border); border-radius: 10px; text-align: center; font-size: 13px; font-weight: 800 }
.sbox { display: grid; gap: 6px; align-content: start; min-height: 120px; padding: 8px; border: 1.5px dashed #c9dcfb; border-radius: 12px; background: #f6faff; cursor: pointer; transition: background .12s, border-color .12s }
.sbox.hot { border-color: #1a73e8; background: #eaf3ff }
.sadd { padding: 8px; border: 1px dashed #1a73e8; border-radius: 8px; color: #1a73e8; text-align: center; font-size: 11px; font-weight: 700 }
.scols .sch { padding: 6px 4px; font-size: 12px } .scols .sw { padding: 6px 8px; font-size: 12px }          /* до 5 колонок — компактнее */
.lp.book.bkpg .spool { justify-content: flex-start; gap: 4px 14px; padding: 7px 12px; background: #f4f4f2; border-radius: 0 }
.lp.book.bkpg .spool .sw { padding: 2px 0; border: 0; border-radius: 0; background: none !important; color: #231f20 !important; font-size: 14px; font-weight: 700 } .lp.book.bkpg .spool .sw.sel { color: #1f5fbf !important; text-decoration: underline 2px; box-shadow: none }
.lp.book.bkpg .scols { gap: 0; border-bottom: 1.5px solid #2d5bb8 }
.lp.book.bkpg .scol { gap: 0; border-right: 1px solid #2d5bb8 } .lp.book.bkpg .scol:last-child { border-right: 0 }
.lp.book.bkpg .scol .sch { border: 0; border-radius: 0; background: #2d5bb8; color: #fff; padding: 6px 2px; font-size: 13px; font-weight: 700 }
.lp.book.bkpg .sbox { min-height: 96px; border: 0; border-radius: 0; background: repeating-linear-gradient(transparent 0 23px, #9db6e6 23px 24px); padding: 0 4px; gap: 0 }
.lp.book.bkpg .sbox.hot { background-color: #eef4ff }
.lp.book.bkpg .sbox .sw.in { padding: 0 2px; height: 24px; border: 0; border-radius: 0; background: none !important; color: #1f5fbf !important; font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; font-size: 13px; font-weight: 400 }
.lp.book.bkpg .sbox .sw.ok { color: #0f6e56 !important } .lp.book.bkpg .sbox .sw.no { color: #a32d2d !important; text-decoration: line-through }
.lp.book.bkpg .sadd { border: 0; padding: 0 2px; height: 24px; line-height: 24px; text-align: left; font-size: 10.5px; color: #1f5fbf; background: none }
.lp.book.bkpg .sub { color: #888 }
/* Заполни таблицу */
.twb { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; width: 100%; max-width: 420px; align-self: center; font-size: 13px; font-weight: 600; color: var(--text) }
.twb .twe { text-decoration: line-through; color: var(--hint) }
.twt { display: grid; width: 100%; max-width: 420px; align-self: center; border: 1px solid #2d5bb8; border-radius: 8px; overflow: hidden; background: #fff }
.twh { display: flex; align-items: center; justify-content: center; height: 30px; box-sizing: border-box; min-width: 0; padding: 0 2px; background: #2d5bb8; color: #fff; font-size: 12px; font-weight: 700; text-align: center; border-right: 1px solid rgba(255, 255, 255, .35) }
.twc { display: flex; align-items: center; justify-content: center; min-width: 0; height: 44px; box-sizing: border-box; border-right: 1px solid #c9d6ef; border-top: 1px solid #c9d6ef }
.twx { font-family: 'Comic Sans MS', 'Segoe Print', cursive; font-size: 13px; color: #3d6fd1 }
.twi { width: 100%; height: 100%; min-width: 0; margin: 0; padding: 0 4px; box-sizing: border-box; border: 0; border-radius: 0; background: none; font: inherit; font-size: 13px; font-weight: 600; text-align: center; color: #1f3f86; outline: none }
.twi:focus { background: #eef3fd } .twi.ok { background: #d7f7e8; color: #0b7a4b } .twi.no { background: var(--red-l, #fde2e2); color: var(--red, #d33) }
.lp.book.bkpg .twt { border-radius: 0; border-width: 1.5px } .lp.book.bkpg .twb { padding: 7px 12px; background: #f4f4f2; color: #231f20; box-sizing: border-box }

/* ---- правка: Распредели — фразы в своих колонках, карандаш — меню ---- */
.scols.ed .sch { width: 100%; box-sizing: border-box; min-width: 0; background: var(--card); box-shadow: none; line-height: normal } .scols.ed .sch:focus { box-shadow: 0 0 0 2px #0d99ff }
.scols.ed .sbox { cursor: default }
.scols.ed .sw { display: flex; align-items: flex-start; gap: 4px; padding: 6px 24px 6px 8px; cursor: default }
.scols.ed .sw .exf { flex: 1; background: transparent; box-shadow: none; font-size: 12px; font-weight: 700; color: inherit; line-height: 1.3 } .scols.ed .sw .exf:focus { background: rgba(255, 255, 255, .8) }
.pen { position: absolute; right: 3px; top: 3px; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; background: rgba(255, 255, 255, .7); color: inherit; font-size: 12px; font-weight: 800; cursor: pointer; opacity: 0; transition: opacity .12s }
.sw:hover .pen, .sw:focus-within .pen { opacity: 1 }
@media (hover: none) { .pen { opacity: 1 } }
.scols.ed .sadd { padding: 7px; border: 0; border-radius: 8px; background: rgba(13, 153, 255, .08); color: var(--blue-d); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer } .scols.ed .sadd:hover { background: rgba(13, 153, 255, .14) }
.smenu { position: absolute; left: 0; top: calc(100% + 4px); z-index: 8; display: grid; gap: 2px; min-width: 190px; padding: 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); box-shadow: 0 8px 24px rgba(0, 0, 0, .14); font-family: var(--font) }
.smenu small { font-size: 11px; font-weight: 700; color: var(--hint) }
.sdots { display: flex; gap: 6px; margin: 2px 0 6px }
.sdots button { width: 22px; height: 22px; padding: 0; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0, 0, 0, .12); cursor: pointer } .sdots button.on { box-shadow: 0 0 0 2px #0d99ff }
.smi { border: 0; border-radius: 6px; padding: 6px 8px; background: none; color: var(--text); font: inherit; font-size: 12.5px; font-weight: 600; text-align: left; cursor: pointer } .smi:hover { background: var(--surface) } .smi.del { color: #d32f2f }
.lp.book.bkpg .scols.ed .scol .sch { border: 0; border-radius: 0; background: #2d5bb8; color: #fff; padding: 6px 2px; font-size: 13px; font-weight: 700 } .lp.book.bkpg .scols.ed .sch::placeholder { color: rgba(255, 255, 255, .7) }
.lp.book.bkpg .scols.ed .sbox .sw { padding: 0 20px 0 2px; min-height: 24px; border-radius: 0; background: none !important; color: #1f5fbf !important; font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; font-weight: 400 }
.lp.book.bkpg .scols.ed .sbox .sw .exf { font-family: inherit; color: inherit; font-weight: 400; line-height: 24px }
.lp.book.bkpg .scols.ed .sadd { height: 24px; padding: 0 2px; border-radius: 0; background: none; text-align: left; font-size: 10.5px }

/* ---- правка: Заполни таблицу — клетка: ответ и слово для банка; ＋ — новая клетка ---- */
.etwb { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; width: 100%; max-width: 420px; align-self: center; box-sizing: border-box }
.etwb button { padding: 0 2px; margin: 0 -2px; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 600; line-height: inherit; color: var(--text); cursor: pointer; border-radius: 4px } .etwb button:hover { background: #eef3fd }
.etwb button.ex { text-decoration: line-through; color: var(--hint) } .etwb small { font-size: 11px; color: var(--hint) }
.lp.book.bkpg .etwb { padding: 7px 12px; background: #f4f4f2 }
.etwt { position: relative; display: grid; width: 100%; max-width: 420px; align-self: center; border: 1px solid #2d5bb8; border-radius: 8px; overflow: visible; background: #fff }
.etwt > :first-child { border-top-left-radius: 7px }
.lp.book.bkpg .etwt { border-radius: 0; border-width: 1.5px }
.etwh { position: relative; display: flex; align-items: center; height: 30px; min-width: 0; background: #2d5bb8; border-right: 1px solid rgba(255, 255, 255, .35) }
.etwh .exf { width: calc(100% - 8px); margin: 0 4px; padding: 2px; box-sizing: border-box; border: 0; background: rgba(255, 255, 255, .16); box-shadow: 0 0 0 2px rgba(255, 255, 255, .16); color: #fff; font: inherit; font-size: 12px !important; font-weight: 700; text-align: center }
.etwh .exf:hover { background: rgba(255, 255, 255, .26) } .etwh .exf:focus { background: #fff; color: #2d5bb8 } .etwh .exf::placeholder { color: rgba(255, 255, 255, .6) }
.etwc { position: relative; display: grid; align-content: center; min-width: 0; height: 44px; box-sizing: border-box; border-right: 1px solid #c9d6ef; border-top: 1px solid #c9d6ef }
.etwc .exf { width: calc(100% - 8px); min-width: 0; margin: 2px 4px; padding: 1px 3px; box-sizing: border-box; border: 0; text-align: center; font: inherit }
.etwc .etwa { font-size: 13px; font-weight: 600; color: #1f3f86 } .etwc .etwa.ex { font-style: italic; font-family: 'Comic Sans MS', 'Segoe Print', cursive; font-weight: 400; color: #3d6fd1 }
.etwc .etww { font-size: 11px; color: var(--hint) }
.etwd { position: absolute; top: 1px; right: 1px; width: 14px; height: 14px; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .12); color: #fff; font-size: 8px; line-height: 14px; cursor: pointer; opacity: 0 }
.etwh:hover .etwd, .etwc:hover .etwd { opacity: 1 }
@media (hover: none) { .etwd { opacity: 1 } }
.etwn { width: 100%; height: 100%; min-height: 40px; border: 0; background: none; color: #b8c6e3; font-size: 14px; cursor: pointer } .etwn:hover { background: #eef3fd; color: #2d5bb8 }
.etwk { position: absolute; left: 0; right: 0; top: 100%; z-index: 2; display: flex; justify-content: center; gap: 6px; margin-top: 3px }
.etwk :deep(.ext) { height: 20px; padding: 0 8px }
</style>

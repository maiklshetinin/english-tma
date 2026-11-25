<script setup>
// «Красный Мерфи» (25.11.2026): упражнения как в English Grammar in Use — красный номер «17.1», задание с маркером,
// ответы ученика рукописным красным, пунктирная строка; на планшете — в две колонки (two). Один шаблон и для ученика, и для правки (p.edit):
// в правке на месте поля — верный ответ (тот же шрифт и размер, окно не прыгает). Виды — step.mode, поля — exercises/mf/data.ts.
// mode 'info' — объяснение: шапка Unit, разделы A, B, C… (фото из книги + текст), один кружок преподавателя (step.video) справа поверх.
import { ref, computed, onMounted } from 'vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit } from '../ctx'
import { mfFields, mfRich, mfWords, mfFirst, MF_ROWS, MF_OPTS } from './data'
import { gapList } from '../../utils/lesson'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()

onMounted(() => {          // рукописный шрифт ответов — один раз на страницу
  if (typeof document === 'undefined' || document.getElementById('mf-fonts')) return
  const l = document.createElement('link'); l.id = 'mf-fonts'; l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap'
  document.head.appendChild(l)
})

const s = computed(() => props.step)
const mode = computed(() => s.value.mode || 'write')
const rows = computed(() => s.value.rows ?? [])
const A = computed(() => p.st.mf ?? {})          // вписанное: ключ поля → текст
const done = computed(() => !!p.st.done && !p.edit)
const res = computed(() => p.st.mfr?.ok ?? {})
const foc = ref(null)
const fields = computed(() => mfFields(s.value))
const letters = computed(() => (s.value.opts ?? []).map((_, k) => String.fromCharCode(65 + k)))
const pics = computed(() => mode.value !== 'info' && mode.value !== 'match' && (s.value.opts?.length ?? 0) > 0)
const plain = (t) => mfRich(t).map((x) => x.x).join('')

function setA(k, v) { if (p.edit || done.value) return; p.st.mf = { ...A.value, [k]: v } }
/** плашка (подсказка, слово из рамки, слово из скобок) → в поле в фокусе; в пропуск — целиком */
function ins(w, k = foc.value) {
  if (p.edit || done.value) return
  if (k == null) k = fields.value.find((f) => !(A.value[f.k] ?? '').trim())?.k
  if (k == null) return
  if (mode.value === 'gaps') return setA(k, w)
  const v = A.value[k] ?? ''
  setA(k, (v && !/\s$/.test(v) ? v + ' ' : v) + w)
  foc.value = k
  requestAnimationFrame(() => document.getElementById(fid(k))?.focus())
}
const fid = (k) => 'mf-' + s.value.id + '-' + String(k).replace('.', '_')
/** слово уже в ответах — плашка бледнеет пунктиром */
const usedW = (w, k) => { const lw = w.toLowerCase(); return (k != null ? [A.value[k] ?? ''] : Object.values(A.value)).some((v) => (' ' + v.toLowerCase() + ' ').includes(' ' + lw + ' ') || v.toLowerCase().includes(lw)) }
const st = (k) => (done.value ? (res.value[k] ? 'ok' : 'bad') : '')
// «?» в конце (25.11.2026, замечания Стаси): не плашкой и не у края строки, а сразу за последним словом; у «Порядка слов» — сам, если в скобках был «?»
const postOf = (r) => s.value.post || (mode.value === 'order' && /\?\s*\)?\s*$/.test(r.q ?? '') ? '?' : '')
const tail = (v, r) => { const t = postOf(r); return t && (v ?? '').trim() && !(v ?? '').trim().endsWith(t) ? t : '' }
const blurLater = () => setTimeout(() => { if (!document.activeElement?.closest?.('.mf')) foc.value = null }, 120)

// правка: строки и разделы
function addRow() {
  if (mode.value === 'info') { if ((s.value.opts ??= []).length < MF_OPTS) { s.value.opts.push({ w: String.fromCharCode(65 + s.value.opts.length), t: '' }); ed.changed() } return }
  if ((s.value.rows ??= []).length < MF_ROWS) { s.value.rows.push({ q: '', a: '' }); ed.changed() }
}
function delRow(r) { s.value.rows.splice(r, 1); ed.changed() }
function delSec(k) { const o = s.value.opts[k]; ed.dropFiles([o.image].filter((f) => f && !f.startsWith('https://'))); s.value.opts.splice(k, 1); ed.changed() }
function setS(o, k, v) { if (v.trim()) o[k] = v; else delete o[k]; ed.changed() }
function setHead(v) { setS(s.value, 'head', v) }

// кружок преподавателя (объяснение): нажал — играет со звуком, ещё раз — пауза
const vid = ref(null), playing = ref(false)
function vTap() { const v = vid.value; if (!v) return; if (v.paused) { v.muted = false; v.play().catch(() => {}); playing.value = true } else { v.pause(); playing.value = false } }
const right = computed(() => { const f = fields.value; return f.filter((x) => res.value[x.k]).length })
</script>

<template>
  <template v-if="part === 'body'">
    <!-- ============ Объяснение: Unit, разделы A, B, C, D ============ -->
    <div v-if="mode === 'info'" class="mf mfi-wrap">
      <div class="mfu">
        <div class="mfun"><small>Unit</small><input v-if="p.edit" class="exf" :value="step.no ?? ''" placeholder="7" maxlength="8" @input="setS(step, 'no', $event.target.value)" /><b v-else>{{ step.no }}</b></div>
        <h3 class="mfut"><textarea v-if="p.edit" class="exf" rows="1" :value="step.head ?? ''" placeholder="Do you … ? (present simple questions)" @input="setHead($event.target.value)" @keydown.enter.prevent /><template v-else>{{ step.head }}</template></h3>
      </div>
      <div v-for="(o, k) in step.opts ?? []" :key="k" class="mfs">
        <div class="mfsl"><input v-if="p.edit" class="exf" :value="o.w" maxlength="2" @input="setS(o, 'w', $event.target.value)" /><b v-else>{{ o.w }}</b></div>
        <div class="mfsb">
          <div v-if="o.t || p.edit" class="mfst">
            <textarea v-if="p.edit" class="exf" rows="2" :value="o.t ?? ''" placeholder="Текст раздела: **жирный**, ==маркер==, !!красный!!; новая строка — абзац" @input="setS(o, 't', $event.target.value)" />
            <p v-for="(ln, n) in (o.t ?? '').split('\n')" v-else :key="n"><span v-for="(x, j) in mfRich(ln)" :key="j" :class="x.c">{{ x.x }}</span></p>
          </div>
          <div v-if="o.image" class="mfsi"><img :src="p.src(o.image, 'image')" alt="" draggable="false" @click="p.edit && ed.pick(step, ['image'], k)" /><button v-if="p.edit" type="button" class="ex-x mfsx" title="Убрать фото" @click="ed.clear(o, 'image')">✕</button></div>
          <button v-else-if="p.edit" type="button" class="mfsadd" @click="ed.pick(step, ['image'], k)" @dragover.prevent @drop.prevent="ed.drop($event, step, ['image'], k)">{{ ed.pct(step, 'image', k) != null ? `Загрузка ${ed.pct(step, 'image', k)}%` : '＋ Фото раздела из книги (или перетащите)' }}</button>
        </div>
        <button v-if="p.edit" type="button" class="mfdel" title="Убрать раздел" @click="delSec(k)">✕</button>
      </div>
      <!-- один кружок преподавателя на весь экран: справа поверх -->
      <div v-if="step.video" class="mfv" :class="{ on: playing }">
        <video ref="vid" :src="p.src(step.video, 'video')" playsinline preload="metadata" @click="vTap" @ended="playing = false" />
        <span v-if="!playing" class="mfvp" @click="vTap"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg></span>
        <button v-if="p.edit" type="button" class="ex-x mfvx" title="Убрать кружок" @click="ed.clear(step, 'video')">✕</button>
      </div>
      <button v-else-if="p.edit" type="button" class="mfv mfvadd" title="Кружок преподавателя — видео с объяснением" @click="ed.pick(step, ['video'])" @dragover.prevent @drop.prevent="ed.drop($event, step, ['video'])">{{ ed.pct(step, 'video') != null ? ed.pct(step, 'video') + '%' : '＋ Кружок' }}</button>
    </div>

    <!-- ============ Упражнение ============ -->
    <div v-else class="mf" :class="['m-' + mode, { two: step.two, inl: step.inl, dn: done, ed: p.edit }]">
      <div class="mfc">
        <div class="mfh">
          <span class="mfn"><input v-if="p.edit" class="exf" :value="step.no ?? ''" placeholder="1.1" maxlength="8" @input="setS(step, 'no', $event.target.value)" /><template v-else>{{ step.no }}</template></span>
          <p class="mft"><textarea v-if="p.edit" class="exf" rows="1" :value="step.head ?? ''" placeholder="Задание: **жирный**, ==маркер==, !!красный!!" @input="setHead($event.target.value)" /><template v-else><span v-for="(x, j) in mfRich(step.head)" :key="j" :class="x.c">{{ x.x }}</span></template></p>
          <span v-if="step.who" class="mfw"><i><img v-if="step.image" :src="p.src(step.image, 'image')" alt="" @click="p.edit && ed.pick(step, ['image'])" /><b v-else @click="p.edit && ed.pick(step, ['image'])">{{ step.who[0] }}</b></i><small>{{ step.who }}</small></span>
        </div>
        <p v-if="step.note || (p.edit && step.note != null)" class="mfnote"><textarea v-if="p.edit" class="exf" rows="1" :value="step.note ?? ''" @input="setS(step, 'note', $event.target.value)" /><template v-else>{{ step.note }}</template></p>

        <!-- рамки слов -->
        <div v-if="step.banks?.length" class="mfbs">
          <div v-for="(b, n) in step.banks" :key="n" class="mfbw"><small v-if="b.t">{{ b.t }}</small>
            <div class="mfb" :class="{ flat: !b.t }"><button v-for="w in b.w" :key="w" type="button" class="mfch" :class="{ cr: b.x?.includes(w), us: !b.x?.includes(w) && usedW(w) }" :disabled="b.x?.includes(w) || done" @pointerdown.prevent @click="ins(w)">{{ w }}</button></div>
          </div>
        </div>

        <div class="mfbody" :class="{ pics }">
          <!-- картинки 1, 2, 3… -->
          <div v-if="pics" class="mfp">
            <div v-for="(o, k) in step.opts" :key="k" class="mfpi" :class="'g' + (k % 6)" @click="p.edit && ed.pick(step, ['image'], k)" @dragover.prevent @drop.prevent="p.edit && ed.drop($event, step, ['image'], k)">
              <img v-if="o.image" :src="p.src(o.image, 'image')" alt="" draggable="false" /><svg v-else viewBox="0 0 24 24" class="ph"><rect x="5" y="5" width="14" height="14" rx="1.5" /></svg>
              <em>{{ k + 1 }}</em>
            </div>
          </div>
          <!-- сопоставить: два списка -->
          <div v-if="mode === 'match'" class="mfm">
            <ol class="mfml"><li v-for="(r, n) in rows" :key="n"><b>{{ n + 1 }}</b><textarea v-if="p.edit" class="exf" rows="1" :value="r.q" @input="r.q = $event.target.value; ed.changed()" /><span v-else>{{ r.q }}</span></li></ol>
            <ol class="mfml"><li v-for="(o, k) in step.opts ?? []" :key="k"><b>{{ letters[k] }}</b><textarea v-if="p.edit" class="exf" rows="1" :value="o.w" @input="o.w = $event.target.value; ed.changed()" /><span v-else>{{ o.w }}</span></li></ol>
          </div>

          <div class="mfrows">
            <div v-for="(r, n) in rows" :key="n" class="mfr" :class="{ ex: r.ex }">
              <span class="mfi">{{ n + 1 }}</span>
              <!-- задание строки -->
              <div v-if="mode !== 'gaps' && mode !== 'match' && (r.q || p.edit) && !pics" class="mfq">
                <textarea v-if="p.edit" class="exf" rows="1" :value="r.q" placeholder="(be / London?)" @input="r.q = $event.target.value; ed.changed()" />
                <template v-else-if="mode === 'order' && !step.below">(<template v-for="(w, j) in mfWords(r.q)" :key="j"><button type="button" class="mfch sm" :class="{ us: r.ex || usedW(w, String(n)) }" :disabled="r.ex || done" @pointerdown.prevent @click="ins(w, String(n))">{{ w }}</button><i v-if="j < mfWords(r.q).length - 1" class="sl">/</i></template>)</template>
                <span v-else><span v-for="(x, j) in mfRich(r.q)" :key="j" :class="x.c">{{ x.x }}</span></span>
                <span v-if="r.r" class="mfrep">{{ r.r }}</span>
              </div>

              <!-- предложение с пропусками -->
              <p v-if="mode === 'gaps'" class="mfg">
                <textarea v-if="p.edit" class="exf" rows="1" :value="r.q" placeholder="It’s [easy] to [make friends]." @input="r.q = $event.target.value; ed.changed()" />
                <template v-else v-for="(x, j) in gapList(r.q)" :key="j">
                  <template v-if="x.t != null"><span v-for="(y, m) in mfRich(x.t)" :key="m" :class="y.c">{{ y.x }}</span></template>
                  <span v-else-if="r.ex" class="mfx in">{{ mfFirst(x.g) }}</span>
                  <span v-else class="mfgw" :class="st(n + '.' + x.i)"><input :id="fid(n + '.' + x.i)" class="mff in" :style="{ width: Math.max(5, mfFirst(x.g).length + 2) + 'ch' }" :value="A[n + '.' + x.i] ?? ''" :readonly="done" autocomplete="off" spellcheck="false" autocapitalize="off" @focus="foc = n + '.' + x.i" @blur="blurLater" @input="setA(n + '.' + x.i, $event.target.value)" /><em v-if="st(n + '.' + x.i) === 'bad'" class="mfok">{{ mfFirst(x.g) }}</em></span>
                </template>
              </p>

              <!-- строка ответа -->
              <div v-else class="mfl" :class="{ foc: foc === String(n) && !done }">
                <b v-if="r.pre" class="mfpre">{{ r.pre }}</b>
                <textarea v-if="p.edit" class="exf mff" rows="1" :value="r.a ?? ''" placeholder="ответ (варианты через /)" @input="r.a = $event.target.value; ed.changed()" />
                <span v-else-if="r.ex" class="mfx">{{ mfFirst(r.a) }}{{ tail(mfFirst(r.a), r) }}</span>
                <template v-else>
                  <span class="mfiw"><input :id="fid(n)" class="mff" :class="st(String(n))" :value="A[n] ?? ''" :readonly="done || mode === 'match'" autocomplete="off" spellcheck="false" autocapitalize="off" @focus="foc = String(n)" @blur="blurLater" @input="setA(String(n), $event.target.value)" /><span v-if="tail(A[n], r)" class="mfpg" :class="st(String(n))" aria-hidden="true"><i>{{ (A[n] ?? '').replace(/\s+$/, '') }}</i>{{ tail(A[n], r) }}</span></span>
                  <span v-if="!done && foc === String(n)" class="mfk">
                    <button v-if="step.copy && !(A[n] ?? '').trim()" type="button" class="mfhint" @pointerdown.prevent @click="setA(String(n), plain(r.q))"><svg viewBox="0 0 24 24"><rect x="5" y="5" width="11" height="11" rx="1.5" /></svg>Скопировать</button>
                    <button v-for="h in step.hints ?? []" v-show="!usedW(h, String(n))" :key="h" type="button" class="mfhint" @pointerdown.prevent @click="ins(h, String(n))">{{ h }}</button>
                  </span>
                </template>
                <small v-if="r.h" class="mfhr">{{ r.h }}</small>
                <em v-if="!r.ex && st(String(n)) === 'bad'" class="mfok">{{ mfFirst(r.a) }}{{ tail(mfFirst(r.a), r) }}</em>
              </div>
              <!-- буквы для сопоставления -->
              <div v-if="mode === 'match' && !p.edit" class="mflt"><button v-for="l in letters" :key="l" type="button" class="mfltr" :class="{ on: (r.ex ? r.a : A[n]) === l }" :disabled="r.ex || done" @click="setA(String(n), l)">{{ l }}</button></div>
              <!-- слова плашками под полем (5.1) -->
              <div v-if="mode === 'order' && step.below && foc === String(n) && !done && !p.edit" class="mfbl"><button v-for="w in mfWords(r.q)" :key="w" type="button" class="mfch sm" :class="{ us: usedW(w, String(n)) }" @pointerdown.prevent @click="ins(w, String(n))">{{ w }}</button></div>
              <button v-if="p.edit" type="button" class="mfdel" title="Убрать строку" @click="delRow(n)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  <template v-else-if="part === 'fb' && p.st.done && mode !== 'info'">
    <b>{{ p.right ? 'Верно!' : `Верно ${right} из ${fields.length}` }}</b><span v-if="!p.right" class="fs"> — правильные ответы зелёным</span><small v-if="p.later" class="lt">Вернёмся к этому в конце урока</small>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool @click="addRow">{{ mode === 'info' ? '＋ Раздел' : '＋ Строка' }}</ExTool>
    <ExTool @click="ed.json(step)">JSON</ExTool>
  </template>
</template>

<style scoped>
.mf { --mr: #c8232c; --mo: #ef9a3c; --hw: #d0202a; --fl: #d3e3f8; --fb: #2a73d8; position: relative; container-type: inline-size; width: 100%; font-size: 15px; color: var(--text) }
.mfc { padding: 14px 14px 18px; border-radius: 18px; background: var(--surface, #f7f7f5) }
/* шапка: красный номер, задание, собеседник */
.mfh { display: flex; align-items: flex-start; gap: 10px }
.mfn { flex: none; min-width: 34px; padding: 4px 9px; border-radius: 9px; background: var(--mr); color: #fff; font-weight: 800; font-size: 14px; text-align: center; line-height: 1.35 }
.mfn .exf { width: 4ch; color: #fff; text-align: center; background: rgba(255, 255, 255, .18) }
.mft { flex: 1; margin: 0; padding-top: 3px; line-height: 1.4; font-weight: 500 }
.mfw { flex: none; display: grid; justify-items: center; gap: 2px } .mfw i { width: 40px; height: 40px; border-radius: 50%; overflow: hidden; background: linear-gradient(135deg, #f6a77a, #e9805a); display: grid; place-items: center }
.mfw img { width: 100%; height: 100%; object-fit: cover } .mfw b { color: #fff; font-size: 17px } .mfw small { font-size: 11px; color: var(--hint) }
.mfnote { margin: 8px 0 0; font-size: 13px; color: var(--hint) }
.b { font-weight: 800 } .rd { color: var(--mr); font-weight: 800 } .mk { background: #ffe36e; border-radius: 4px; padding: 0 4px; font-weight: 700; box-decoration-break: clone; -webkit-box-decoration-break: clone }
.wv { text-decoration: underline wavy var(--mr); text-underline-offset: 4px; text-decoration-thickness: 1px }
/* рамки слов */
.mfbs { display: grid; gap: 8px; margin-top: 12px }
.mfbw small { display: block; margin: 0 0 3px 4px; font-size: 12px; color: var(--hint) }
.mfb { display: flex; flex-wrap: wrap; gap: 6px; padding: 9px; border: 2px solid var(--mo); border-radius: 14px }
.mfch { padding: 4px 11px; border: 1.5px solid #f3c48f; border-radius: 16px; background: var(--card); color: var(--text); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap }
.mfch.sm { padding: 3px 10px; font-size: 14px } .mfch:hover:not(:disabled) { border-color: var(--mo) }
.mfch.us { border-style: dashed; border-color: #cfcfcf; color: #b0b0b0 } .mfch.cr { border-style: dashed; border-color: #cfcfcf; color: #b0b0b0; text-decoration: line-through; text-decoration-color: var(--mr); cursor: default }
.mfb.flat { justify-content: space-around }
/* картинки */
.mfp { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; border: 2px solid #f4a7ae; border-radius: 16px; margin-bottom: 10px }
.mfpi { position: relative; aspect-ratio: 16 / 10; border-radius: 12px; overflow: hidden; display: grid; place-items: center; background: linear-gradient(135deg, #d9d58e, #86cfcf) }
.mfpi.g1 { background: linear-gradient(135deg, #3c4a8c, #6a80c8) } .mfpi.g2 { background: linear-gradient(135deg, #dcc050, #8fae5c) } .mfpi.g3 { background: linear-gradient(135deg, #a88c62, #cbb184) } .mfpi.g4 { background: linear-gradient(135deg, #8a94a4, #b7bfca) } .mfpi.g5 { background: linear-gradient(135deg, #3f6f72, #8db9b5) }
.mfpi img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover } .mfpi .ph { width: 26px; height: 26px; fill: none; stroke: rgba(255, 255, 255, .85); stroke-width: 1.6 }
.mfpi em { position: absolute; left: 6px; top: 6px; min-width: 18px; height: 18px; padding: 0 3px; border: 1.5px solid var(--mr); border-radius: 6px; background: #fff; color: var(--mr); font-style: normal; font-size: 11px; font-weight: 800; display: grid; place-items: center; box-sizing: border-box }
.ed .mfpi { cursor: pointer }
/* сопоставить */
.mfm { display: grid; gap: 10px; margin: 12px 0 6px }
.mfml { margin: 0; padding: 10px 14px; list-style: none; border: 2px solid var(--mo); border-radius: 16px; display: grid; gap: 7px; background: var(--card) }
.mfml li { display: grid; grid-template-columns: 22px 1fr; gap: 6px; font-size: 14px }
/* строки */
.mfrows { display: grid; gap: 14px; margin-top: 14px }
.mfr { position: relative; display: grid; grid-template-columns: 22px minmax(0, 1fr); column-gap: 6px; row-gap: 4px; align-items: start }
.mfr > :not(.mfi):not(.mfdel) { grid-column: 2 }
.mfi { grid-column: 1; grid-row: 1; padding-top: 2px; color: var(--hint); font-size: 14px; text-align: center }
.mfq { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-weight: 500; line-height: 1.5 } .mfq > span:first-child, .mfq > .exf { flex: 1 1 auto }
.mfq .sl { font-style: normal; color: var(--hint) }
.mfrep { margin-left: auto; padding: 2px 10px; border: 1.5px solid #cfcfcf; border-radius: 14px; font-size: 13px; color: var(--hint); white-space: nowrap; background: var(--card) }
/* строка ответа: рукописный красный, пунктир; в фокусе — голубая подложка */
.mfl { position: relative; display: flex; align-items: flex-end; gap: 6px; min-height: 36px; border-bottom: 1.5px dotted #9a9a9a }
.mfl.foc { background: var(--fl); border-bottom: 2px solid var(--fb); border-radius: 4px 4px 0 0 }
.mff, .mfx { flex: 1; min-width: 0; padding: 4px 2px 2px; border: 0; background: transparent; font-family: Kalam, 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; font-size: 18px; color: var(--hw); outline: 0; line-height: 1.35 }
.mfx { padding-left: 2px } .mf .exf.mff { color: var(--hw); background: rgba(13, 153, 255, .07) }
.mfiw { position: relative; flex: 1; min-width: 0; display: flex } .mfiw .mff { width: 100% }
.mfpg { position: absolute; left: 0; bottom: 0; max-width: 100%; overflow: hidden; padding: 4px 2px 2px; font-family: Kalam, 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; font-size: 18px; line-height: 1.35; white-space: pre; color: var(--hw); pointer-events: none }
.mfpg i { font-style: normal; visibility: hidden } .mfpg.ok { color: #1a9a5c } .mfpg.bad { opacity: .75 }
.mfl { flex-wrap: wrap } .mfl > .mfok { flex: 1 1 100%; align-self: auto; padding: 0 2px 2px }
.mff.ok { color: #1a9a5c } .mff.bad { color: var(--hw); text-decoration: line-through; opacity: .75 }
.mfok { flex: none; align-self: center; font-style: normal; font-family: Kalam, 'Segoe Print', cursive; font-size: 17px; color: #1a9a5c }
.mfpre { flex: none; align-self: center; font-weight: 600 } .mfpost { flex: none; align-self: center; font-weight: 800 }
.mfhr { flex: none; align-self: center; font-size: 13px; color: var(--hint) }
.mfk { position: absolute; right: 4px; top: 50%; translate: 0 -50%; display: flex; gap: 5px }
.mfhint { display: inline-flex; align-items: center; gap: 5px; padding: 3px 11px; border: 1.5px solid var(--fb); border-radius: 15px; background: #fff; color: #1d58b0; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap }
.mfhint svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2 }
/* пропуски в предложении */
.mfg { margin: 0; line-height: 2.1 }
.mfgw { display: inline-flex; align-items: baseline; gap: 4px }
.mff.in, .mfx.in { display: inline-block; flex: none; padding: 0 4px; border-bottom: 1.5px dotted #9a9a9a; border-radius: 4px 4px 0 0 }
.mff.in:focus { background: var(--fl); border-bottom: 2px solid var(--fb) } .mfgw.ok .mff { color: #1a9a5c } .mfgw.bad .mff { text-decoration: line-through; opacity: .75 }
/* буквы A–E */
.mflt { display: flex; flex-wrap: wrap; gap: 5px }
.mfltr { width: 30px; height: 30px; padding: 0; border: 1.5px solid var(--mo); border-radius: 50%; background: var(--card); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer }
.mfltr.on { border-color: var(--hw); background: #fde0e0; color: var(--hw) } .mfltr:disabled { cursor: default }
.m-match .mfl { min-height: 32px } .m-match .mff, .m-match .mfx { text-align: center }
.mfbl { display: flex; flex-wrap: wrap; gap: 6px }
/* правка */
.mfdel { position: absolute; right: -8px; top: 0; width: 18px; height: 18px; padding: 0; border: 1px solid var(--border); border-radius: 50%; background: var(--card); color: var(--hint); font-size: 9px; cursor: pointer; opacity: 0 }
.mfr:hover > .mfdel, .mfs:hover > .mfdel { opacity: 1 } @media (hover: none) { .mfdel { opacity: 1 } }

/* ===== планшет и шире: крупнее, в две колонки ===== */
@container (min-width: 700px) {
  .mfc { padding: 24px 30px 28px; font-size: 19px }
  .mfn { padding: 6px 14px; font-size: 19px; border-radius: 11px } .mft { font-size: 21px; padding-top: 4px } .mfnote { font-size: 15px }
  .mfw i { width: 52px; height: 52px } .mfw small { font-size: 14px }
  .mfbs { grid-auto-flow: column; grid-auto-columns: 1fr }
  .mfch { font-size: 17px; padding: 5px 14px } .mfch.sm { font-size: 16px }
  .mfi { font-size: 18px } .mfq { font-size: 19px } .mfrep { font-size: 16px } .mfhr { font-size: 17px }
  .mff, .mfx { font-size: 24px } .mfok { font-size: 21px } .mfhint { font-size: 16px }
  .two .mfrows { display: block; columns: 2; column-gap: 60px } .two .mfr { break-inside: avoid; margin-bottom: 14px }
  .inl .mfr { grid-template-columns: 26px minmax(0, 1fr) minmax(0, 1.25fr); align-items: end; column-gap: 12px }
  .inl .mfr > .mfq { grid-column: 2; grid-row: 1 } .inl .mfr > .mfl { grid-column: 3; grid-row: 1 }
  .inl .mfr > .mfi { padding-bottom: 6px; align-self: end }
  .mfbody.pics { display: grid; grid-template-columns: 1.1fr 1fr; gap: 30px; align-items: start; margin-top: 12px } .mfbody.pics .mfp { margin: 0 } .mfbody.pics .mfrows { margin-top: 0 }
  .mfm { grid-template-columns: 1fr 1fr; gap: 20px } .mfml li { font-size: 18px }
  .m-match .mfrows { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); column-gap: 18px }
  .mfltr { width: 32px; height: 32px; font-size: 15px }
  .m-gaps .mfrows { gap: 6px } .mfg { font-size: 19px } .m-gaps .mff.in, .m-gaps .mfx.in { font-size: 24px }
}

/* ===== объяснение: страница Unit, разделы ===== */
.mfi-wrap { display: grid; gap: 12px; padding-bottom: 8px }
.mfu { display: flex; align-items: stretch; border-radius: 14px; overflow: hidden; background: var(--mr) }
.mfun { flex: none; width: 58px; display: grid; place-content: center; text-align: center; background: #e0703a; color: #fff; line-height: 1 }
.mfun small { font-size: 11px; opacity: .9 } .mfun b { font-size: 26px; font-weight: 600 } .mfun .exf { width: 3ch; font-size: 22px; color: #fff; text-align: center; background: rgba(255, 255, 255, .2) }
.mfut { flex: 1; margin: 0; padding: 12px 14px; color: #fff; font-size: 18px; font-weight: 700; line-height: 1.3 } .mfut .exf { color: #fff; background: rgba(255, 255, 255, .15) }
.mfs { position: relative; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 10px; padding: 10px 10px 12px 0; border-radius: 14px; background: var(--surface, #faf6f0); overflow: hidden }
.mfsl { background: linear-gradient(#ef9a3c, #e07f2a); display: flex; justify-content: center; padding-top: 10px }
.mfsl b, .mfsl .exf { width: 22px; height: 22px; border-radius: 6px; background: var(--mr); color: #fff; font-size: 13px; font-weight: 800; display: grid; place-items: center; text-align: center }
.mfsb { display: grid; gap: 8px; min-width: 0 }
.mfst p { margin: 0 0 4px; line-height: 1.5 } .mfst .exf { font-size: 15px }
.mfsi { position: relative } .mfsi img { display: block; width: 100%; height: auto; border-radius: 10px; border: 1px solid #eadfcf; background: #fff }
.mfsx { position: absolute; right: 6px; top: 6px }
.mfsadd { padding: 18px 10px; border: 0; border-radius: 10px; background: rgba(13, 153, 255, .07); color: var(--blue-d); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer }
/* кружок преподавателя — справа поверх, как в Telegram */
.mfv { position: sticky; bottom: 6px; justify-self: end; z-index: 3; width: 104px; height: 104px; margin-top: -116px; border-radius: 50%; overflow: hidden; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(0, 0, 0, .22); background: #222; cursor: pointer }
.mfv video { width: 100%; height: 100%; object-fit: cover; display: block }
.mfvp { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, .18) } .mfvp svg { width: 30px; height: 30px; fill: #fff }
.mfv.on { box-shadow: 0 0 0 4px var(--mr), 0 6px 18px rgba(0, 0, 0, .22) }
.mfvx { position: absolute; right: 8px; top: 8px }
.mfvadd { display: grid; place-items: center; background: rgba(13, 153, 255, .1); color: var(--blue-d); font: inherit; font-size: 12px; font-weight: 800; border: 2px dashed #9cc7f2; box-shadow: none }
@container (min-width: 700px) {
  .mfun { width: 84px } .mfun b { font-size: 38px } .mfut { font-size: 26px; padding: 16px 20px }
  .mfs { grid-template-columns: 44px minmax(0, 1fr); padding-right: 16px } .mfsl b { width: 28px; height: 28px; font-size: 16px }
  .mfst { font-size: 17px } .mfv { width: 150px; height: 150px; margin-top: -162px }
}
/* экран Мёрфи шире обычного: на планшете и компьютере — как страница книги */
:global(.lp .body.x-mf) { max-width: 1040px }
</style>

<script setup>
// Пакетная озвучка (20.11.2026): табличка «что озвучить» (карточки колоды: слово и пример; потом — экраны уроков),
// галочками отмечаешь, выбираешь голос, модель и размер пачки — «Озвучить»: фразы идут пачками (одна пачка = один запрос TTS,
// у бесплатного проекта 10 в сутки на модель), между пачками пауза (3 запроса в минуту). Звук пачки режется на куски
// (utils/ttssplit.js — как в «Gemini TTS Studio»); кусок сразу в своей строке — послушать; съехала граница — потянуть ползунок
// на волне пачки или переозвучить одну строку (↻). «Сохранить» — готовые куски в карточки (родитель: @save).
//   items: [{ key, id, field, label, kind, text, has, by }]
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { VOICES, getVoice, setVoice, speak, getModel, setModel, ttsModels, knownModels, modelName, pcmToWav } from '../utils/tts'
import { batchText, splitPcm, rangesOf, peaks } from '../utils/ttssplit'
import { ai } from '../utils/gemini'
import VoicePicker from './VoicePicker.vue'
import KeyTable from './KeyTable.vue'
import { aiIcon } from '../utils/ai'

const props = defineProps({ title: { type: String, default: 'Озвучить' }, items: { type: Array, required: true } })
const emit = defineEmits(['close', 'save'])
const icon = aiIcon('Gemini')
const voice = ref(getVoice()), model = ref(getModel()), models = ref(knownModels()), size = ref(10), onlyNew = ref(true)
onMounted(async () => { if (ai.keys[0]) { const l = await ttsModels(ai.keys[0].key); if (l.length) { models.value = l; if (!l.includes(model.value)) { model.value = l[0]; setModel(l[0]) } } } })

// строки
const items = props.items.map((x) => ({ ...x }))          // снимок на момент открытия окна
const row = reactive(Object.fromEntries(items.map((it) => [it.key, { sel: !it.has, st: 'idle', url: '', blob: null, sec: 0, batch: -1, err: '', pk: [] }])))
const list = computed(() => items.filter((it) => !onlyNew.value || !it.has || row[it.key].st !== 'idle'))
const picked = computed(() => list.value.filter((it) => row[it.key].sel && it.text?.trim() && row[it.key].st !== 'busy'))
const ready = computed(() => items.filter((it) => row[it.key].st === 'done'))
const allOn = computed(() => list.value.length > 0 && list.value.every((it) => row[it.key].sel))
function toggleAll() { setAll(!allOn.value) }
function setAll(v) { for (const it of list.value) if (it.text?.trim() && row[it.key].st !== 'busy') row[it.key].sel = v }
const nReq = computed(() => Math.ceil(picked.value.length / size.value))

// пачки
const batches = ref([])            // { keys, pcm, rate, info, cuts, pk, model, voice, open }
let stopReq = false
const run = reactive({ on: false, wait: 0, note: '', err: '', key: '', sec: 0 })
// журнал (20.11.2026): что отправлено, каким ключом, чем кончилось — чтобы зависание или ошибку было видно, а не гадать
const LIMIT = 180          // пачка — длинный звук, Google озвучивает её дольше одной фразы; дольше 3 минут — обрываем, ошибка в журнал
const log = ref([])
const hms = () => new Date().toLocaleTimeString('ru-RU')
const say = (txt, kind = '') => { log.value.push({ t: hms(), txt, kind }); if (log.value.length > 60) log.value.shift() }
let ac = null, tick = 0
function ask(text, what) {          // один запрос speak с секундомером, текущим ключом и записью в журнал
  ac = new AbortController(); run.sec = 0; run.key = ''
  clearInterval(tick); tick = setInterval(() => { run.sec++ }, 1000)
  const t0 = Date.now()
  return speak(text, voice.value, { model: model.value, signal: ac.signal, wait: LIMIT * 1000,
    onStep: (x) => {
      if (x.fail) say(`${what}: ключ ${x.key} — ${x.status ? x.status + ' · ' : ''}${x.fail}${x.status === 429 && x.i + 1 < x.n ? ' → следующий ключ' : ''}`, 'bad')
      else { run.key = x.key; run.sec = Math.round((Date.now() - t0) / 1000); say(`${what}: отправлено · ключ ${x.key}${x.n > 1 ? ` (${x.i + 1} из ${x.n})` : ''} · ${modelName(model.value)} · ${voice.value}`) }
    } })
    .then((r) => { say(`${what}: готово за ${Math.round((Date.now() - t0) / 1000)} с · ${fmt(r.pcm.length / r.rate)} звука`, 'ok'); return r })
    .catch((e) => { if (e.cancel) say(`${what}: остановлено`); else if (!e.status || e.quota || e.nokeys) say(`${what}: ${e.message}`, 'bad'); throw e })
    .finally(() => { clearInterval(tick); run.key = ''; ac = null })
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
function setPiece(it, pcm, rate, b) {
  const r = row[it.key]; if (r.url) URL.revokeObjectURL(r.url)
  r.pk = peaks(pcm, 44); r.blob = pcmToWav(pcm, rate); r.url = URL.createObjectURL(r.blob); r.sec = pcm.length / rate; r.st = 'done'; r.batch = b; r.err = ''
}
function cutBatch(bi, first = false) {          // first — только что пришла: куски всем её строкам; потом — только тем, кого не переозвучили (↻)
  const B = batches.value[bi], rg = (B.rg = rangesOf(B.info, B.cuts))
  B.keys.forEach((k, i) => { const it = items.find((x) => x.key === k); if (it && (first || row[k].batch === bi)) setPiece(it, B.pcm.slice(rg[i][0], rg[i][1]), B.rate, bi) })
}
async function start() {
  if (run.on || !picked.value.length) return
  run.on = true; run.err = ''; stopReq = false
  const queue = picked.value.slice()
  for (const it of queue) row[it.key].st = 'queue'
  for (let i = 0; i < queue.length && !stopReq; i += size.value) {
    const part = queue.slice(i, i + size.value), texts = part.map((it) => it.text.trim())
    part.forEach((it) => { row[it.key].st = 'busy' })
    run.note = `пачка ${i / size.value + 1} из ${Math.ceil(queue.length / size.value)} · ${part.length} фраз`
    try {
      const r = await ask(texts.length > 1 ? batchText(texts) : texts[0], `Пачка ${i / size.value + 1}`)
      let sp
      try { sp = splitPcm(r.pcm, r.rate, texts) } catch (e) { throw new Error('звук пришёл, но не нарезался: ' + (e?.message || e)) }
      batches.value.forEach((x) => { x.open = false })
      batches.value.push({ keys: part.map((it) => it.key), pcm: r.pcm, rate: r.rate, info: sp.info, cuts: sp.cuts, pk: peaks(r.pcm, 320), rg: [], head: -1, drag: -1, model: r.model, voice: voice.value, open: true, guessed: !!sp.guessed,
        url: URL.createObjectURL(pcmToWav(r.pcm, r.rate)), sec: r.pcm.length / r.rate })
      cutBatch(batches.value.length - 1, true)
      say(`Пачка ${i / size.value + 1}: нарезано на ${part.length} · ${sp.guessed ? 'паузы не нашлись — по длине текста, проверьте границы' : 'по паузам'}`, sp.guessed ? 'bad' : 'ok')
    } catch (e) {
      if (e.cancel) { part.forEach((it) => { row[it.key].st = 'idle' }); break }
      part.forEach((it) => { row[it.key].st = 'err'; row[it.key].err = e.message })
      run.err = e.message
      if (e.quota || e.nokeys || e.status === 400 || e.status === 403) break          // лимит или ключ — дальше без толку
    }
    if (i + size.value < queue.length && !stopReq) for (run.wait = 21; run.wait > 0 && !stopReq; run.wait--) await sleep(1000)          // 3 запроса в минуту
  }
  for (const it of queue) if (row[it.key].st === 'queue') row[it.key].st = 'idle'
  for (const it of queue) if (row[it.key].st === 'busy') { row[it.key].st = 'err'; row[it.key].err = 'кусок звука не получен' }          // страховка: «озвучивается» навсегда не остаётся
  run.on = false; run.wait = 0; run.note = ''
}
function stop() { stopReq = true; ac?.abort() }
async function redo(it) {          // переозвучить одну строку отдельным запросом
  if (run.on || row[it.key].st === 'busy') return
  row[it.key].st = 'busy'
  try { const r = await ask(it.text.trim(), `«${it.text.trim().slice(0, 24)}»`); setPiece(it, r.pcm, r.rate, -1); row[it.key].by = `${r.model}|${voice.value}` }
  catch (e) { row[it.key].st = e.cancel ? 'idle' : 'err'; row[it.key].err = e.message }
}
// плеер строки / части пачки / всей пачки. head — бегунок на плане пачки (доля 0..1), как в «Gemini TTS Studio»
let au = null
const playing = ref(''), prog = ref(0)          // prog — сколько проиграно у строки playing (0..1), для мини-волны
function play(k, url = row[k]?.url, { at = 0, bi = -1, i = -1 } = {}) {          // k — ключ строки или 'b<номер>' — вся пачка
  if (playing.value === k && !at) { au?.pause(); return }
  au?.pause(); au = new Audio(url); playing.value = k
  const B = batches.value[bi] ?? null
  const whole = i < 0 && k === 'b' + bi
  prog.value = at
  const draw = () => {
    if (!B) { prog.value = Math.min(1, au.currentTime / (isFinite(au.duration) && au.duration > 0 ? au.duration : 1)); return }
    const d = isFinite(au.duration) && au.duration > 0 ? au.duration : 1, f = Math.min(1, au.currentTime / d)
    prog.value = f
    if (whole) B.head = f
    else if (i >= 0 && B.rg?.[i]) { const [a, b] = B.rg[i]; B.head = (a + f * (b - a)) / B.pcm.length }
  }
  au.ontimeupdate = draw
  au.onended = au.onpause = () => { if (playing.value === k) playing.value = ''; if (B) B.head = -1 }
  if (at) au.onloadedmetadata = () => { au.currentTime = at * au.duration }
  au.play().catch(() => { playing.value = '' })
}
function playRow(it, at = 0) { const pp = partOf(it.key); if (pp) playPart(pp.bi, pp.i, at); else play(it.key, row[it.key].url, { at }) }
function scrubRow(e, it) { const r = e.currentTarget.getBoundingClientRect(); playRow(it, Math.max(0.0001, Math.min(0.999, (e.clientX - r.left) / r.width))) }
function playPart(bi, i, at = 0) {          // часть пачки: её кусок в строке таблицы (если строку не переозвучили отдельно)
  const B = batches.value[bi], k = B.keys[i]
  if (!row[k]?.url || row[k].batch !== bi) return
  play(k, row[k].url, { at, bi, i })
}
// план пачки: клик / протяжка — играть с этого места (часть под курсором)
function scrubPlan(e, bi) {
  const B = batches.value[bi], el = e.currentTarget, at = (ev) => { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) }
  const go = (f) => { const pos = f * B.pcm.length, i = B.rg.findIndex(([a, b]) => pos >= a && pos < b); if (i >= 0) playPart(bi, i, Math.max(0.0001, (pos - B.rg[i][0]) / (B.rg[i][1] - B.rg[i][0]))) }
  go(at(e))
}
// граница на плане: тянуть мышью / пальцем; стрелки ← → — точнее (20 мс, с Shift — 100 мс)
const GAP = 20
function setCut(B, ci, f) {
  const lo = (ci ? B.cuts[ci - 1] : 0) + GAP, hi = (ci < B.cuts.length - 1 ? B.cuts[ci + 1] : B.info.nf) - GAP
  B.cuts[ci] = Math.round(Math.min(hi, Math.max(lo, f))); B.rg = rangesOf(B.info, B.cuts)
}
function dragCut(e, bi, ci) {
  const B = batches.value[bi], el = e.currentTarget.parentElement, rect = el.getBoundingClientRect()
  B.drag = ci; au?.pause()
  const move = (ev) => setCut(B, ci, Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) * B.info.nf)
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); B.drag = -1; cutBatch(bi) }
  addEventListener('pointermove', move); addEventListener('pointerup', up)
}
let keyTm = 0
function keyCut(e, bi, ci) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault(); const B = batches.value[bi]
  setCut(B, ci, B.cuts[ci] + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 2))
  clearTimeout(keyTm); keyTm = setTimeout(() => cutBatch(bi), 350)
}
const segOf = (B, k) => { const pos = ((k + 0.5) / B.pk.length) * B.pcm.length; return B.rg.findIndex(([a, b]) => pos >= a && pos < b) }
const mmss = (x) => Math.floor(Math.round(x) / 60) + ':' + String(Math.round(x) % 60).padStart(2, '0')
const partOf = (k) => { const bi = row[k]?.batch; if (bi == null || bi < 0) return null; const B = batches.value[bi]; const i = B?.keys.indexOf(k); return i >= 0 ? { bi, i } : null }
const COL = ['#4b8df8', '#e0603a', '#2fa36b', '#a855d6', '#d99a1e', '#d6457f', '#1fa3b8', '#7d8f1f']

// сохранить
const saving = ref(false)
async function save() {
  if (saving.value || !ready.value.length) return
  saving.value = true
  const out = ready.value.map((it) => {
    const r = row[it.key], B = batches.value[r.batch]
    return { key: it.key, id: it.id, field: it.field, file: new File([r.blob], `tts_${it.field}_${Date.now().toString(36)}.wav`, { type: 'audio/wav' }), by: r.by || `${B?.model || model.value}|${B?.voice || voice.value}` }
  })
  try { await new Promise((ok) => emit('save', out, ok)); out.forEach((o) => { row[o.key].st = 'saved' }) } finally { saving.value = false }
}
const fmt = (s) => (s ? s.toFixed(1).replace('.', ',') + ' с' : '')
const busyClose = computed(() => run.on || saving.value)
const anyBusy = computed(() => items.some((it) => row[it.key].st === 'busy'))
const logOpen = ref(true)
const onKey = (e) => { if (e.key === 'Escape' && !busyClose.value) { e.stopPropagation(); emit('close') } }
onMounted(() => addEventListener('keydown', onKey, true))
onBeforeUnmount(() => { removeEventListener('keydown', onKey, true); stopReq = true; ac?.abort(); clearInterval(tick); au?.pause(); for (const k in row) if (row[k].url) URL.revokeObjectURL(row[k].url); batches.value.forEach((b) => b.url && URL.revokeObjectURL(b.url)) })
</script>

<template>
  <Teleport to="body">
    <div class="tb-bg" @pointerdown.self="!busyClose && emit('close')" @keydown.stop @paste.stop @wheel.stop>
      <div class="tb" role="dialog" aria-modal="true" :aria-label="title">
        <header><img v-if="icon" :src="icon" alt="" /><b>{{ title }}</b><span class="sp" /><button type="button" class="x" :disabled="busyClose" title="Закрыть" @click="emit('close')">✕</button></header>

        <VoicePicker :model-value="voice" :model="model" :text="items[0]?.text || ''" :disabled="run.on" @update:model-value="(v) => { voice = v; setVoice(v) }" />
        <div class="ctl">
          <label>Модель <select v-model="model" :disabled="run.on" @change="setModel(model)"><option v-for="m in (models.includes(model) ? models : [model, ...models])" :key="m" :value="m">{{ modelName(m) }}{{ /pro/i.test(m) ? ' — нет в бесплатном' : '' }}</option></select></label>
          <label>Пачка <select v-model.number="size" :disabled="run.on"><option v-for="n in [5, 10, 15]" :key="n" :value="n">по {{ n }}</option></select></label>
          <label class="chk"><input v-model="onlyNew" type="checkbox" class="sw" />только без звука</label>
        </div>
        <KeyTable :model="model" :cur="run.key" :sec="run.sec" :busy="run.on || anyBusy" />
        <div class="sel"><button type="button" class="chip" :disabled="run.on" @click="setAll(true)">Выбрать все</button><button type="button" class="chip" :disabled="run.on" @click="setAll(false)">Снять выделение</button><span class="sp" /></div>
        <p class="hint">Одна пачка — один запрос (у модели 10 в сутки, 3 в минуту). Отмечено {{ picked.length }} → {{ nReq }} {{ nReq === 1 ? 'запрос' : nReq < 5 ? 'запроса' : 'запросов' }}.</p>

        <div class="tbl">
          <div class="tr th"><label class="c0"><input type="checkbox" :checked="allOn" @change="toggleAll" /></label><span>Карточка</span><span>Что</span><span>Текст</span><span class="cr">Звук</span></div>
          <div v-for="it in list" :key="it.key" class="tr" :class="[row[it.key].st, { part: partOf(it.key), sel: row[it.key].sel }]" :style="partOf(it.key) ? { '--c': COL[partOf(it.key).i % COL.length] } : null">
            <label class="c0" :title="row[it.key].sel ? 'Снять' : 'Отметить'"><input v-model="row[it.key].sel" type="checkbox" :disabled="!it.text?.trim()" /></label>
            <span class="lb"><b v-if="partOf(it.key)" class="nb" :style="{ background: COL[partOf(it.key).i % COL.length] }" :title="'Пачка ' + (partOf(it.key).bi + 1) + ', часть ' + (partOf(it.key).i + 1)">{{ partOf(it.key).i + 1 }}</b>{{ it.label }}</span>
            <span class="kd">{{ it.kind }}</span>
            <span class="tx" :title="it.text">{{ it.text }}</span>
            <span class="cr">
              <template v-if="row[it.key].st === 'busy'"><i class="spin" />озвучивается</template>
              <template v-else-if="row[it.key].st === 'queue'">в очереди</template>
              <template v-else-if="row[it.key].st === 'err'"><em class="er" :title="row[it.key].err">ошибка</em><button type="button" class="ib" title="Озвучить одну эту" @click="redo(it)">↻</button></template>
              <template v-else-if="row[it.key].url">
                <button type="button" class="pl" :class="{ on: playing === it.key }" :title="playing === it.key ? 'Пауза' : 'Послушать'" @click="playing === it.key ? play(it.key) : playRow(it)"><svg viewBox="0 0 24 24"><path v-if="playing !== it.key" d="M8 5.5v13l10.5-6.5z" /><path v-else d="M7 5.5h3.6v13H7zM13.4 5.5H17v13h-3.6z" /></svg></button>
                <span class="mw" title="Клик — играть с этого места" @pointerdown.prevent="scrubRow($event, it)"><s v-for="(v, k) in row[it.key].pk" :key="k" :class="{ p: playing === it.key && k < prog * row[it.key].pk.length }" :style="{ height: Math.max(14, v * 100) + '%' }" /></span>
                <small class="tm">{{ fmt(row[it.key].sec) }}<template v-if="row[it.key].st === 'saved'"> · ✓</template></small>
                <button v-if="row[it.key].st !== 'saved'" type="button" class="ib" title="Переозвучить одну эту фразу (1 запрос)" @click="redo(it)">↻</button>
              </template>
              <template v-else-if="it.has"><small class="mute">есть звук</small></template>
            </span>
          </div>
          <p v-if="!list.length" class="empty">{{ onlyNew ? 'Всё уже озвучено — снимите «только без звука», чтобы переозвучить' : 'Нечего озвучивать' }}</p>
        </div>

        <div v-if="batches.length" class="bs">
          <div v-for="(B, bi) in batches" :key="bi" class="bb">
            <div class="bhr"><button type="button" class="pl" :class="{ on: playing === 'b' + bi }" :title="'Послушать всю пачку · ' + fmt(B.sec)" @click="play('b' + bi, B.url, { bi })"><svg viewBox="0 0 24 24"><path v-if="playing === 'b' + bi" d="M7 5h4v14H7zM13 5h4v14h-4z" /><path v-else d="M8 5v14l11-7z" /></svg></button>
            <button type="button" class="bh" @click="B.open = !B.open">{{ B.open ? '▾' : '▸' }} Пачка {{ bi + 1 }} · {{ B.keys.length }} фраз · {{ modelName(B.model) }} · {{ B.voice }}<em v-if="B.guessed"> · паузы не нашлись — нарезано по длине текста, проверьте границы</em></button></div>
            <div v-if="B.open" class="plan">
              <div class="ph"><b>План разрезки</b><span>{{ B.keys.length }} {{ B.keys.length < 5 ? 'части' : 'частей' }} · {{ mmss(B.sec) }}</span></div>
              <div class="pw" @pointerdown="scrubPlan($event, bi)">
                <i v-if="B.head >= 0" class="hd" :style="{ left: B.head * 100 + '%' }" />
                <s v-for="(v, k) in B.pk" :key="k" :style="{ height: Math.max(8, v * 100) + '%', background: segOf(B, k) < 0 ? '' : COL[segOf(B, k) % COL.length] }" />
                <i v-for="(c, ci) in B.cuts" :key="'c' + ci" class="cut" :class="{ drag: B.drag === ci }" tabindex="0" :style="{ left: (c / B.info.nf) * 100 + '%' }" title="Потяни, чтобы сдвинуть границу (← → — точнее, с Shift — крупнее)" @pointerdown.prevent.stop="dragCut($event, bi, ci)" @keydown="keyCut($event, bi, ci)" />
              </div>
              <div class="pn"><button v-for="(k, i) in B.keys" :key="k" type="button" :style="{ left: B.rg[i] ? ((B.rg[i][0] + B.rg[i][1]) / 2 / B.pcm.length) * 100 + '%' : '0', color: COL[i % COL.length] }" :title="items.find((x) => x.key === k)?.text" @click="playPart(bi, i)">{{ i + 1 }}</button></div>
              <p class="hint">Разрезано неточно? Потяни границу (ползунок на плане) мышью или пальцем, для точной подстройки — стрелки ← →. Клик по волне — играть с этого места; номер — играть часть.</p>
            </div>
          </div>
        </div>

        <p v-if="run.err" class="er">{{ run.err }}</p>
        <details v-if="log.length" class="lg" :open="logOpen" @toggle="logOpen = $event.target.open">
          <summary>Журнал · {{ log.length }} <em v-if="log.some((l) => l.kind === 'bad')">· есть ошибки</em></summary>
          <ol><li v-for="(l, k) in log.slice().reverse()" :key="log.length - k" :class="l.kind"><time>{{ l.t }}</time>{{ l.txt }}</li></ol>
        </details>
        <footer>
          <small v-if="run.on">{{ run.note }}<template v-if="run.wait"> · пауза {{ run.wait }} с</template><template v-else-if="run.key"> · ключ {{ run.key }} · ждём ответа {{ run.sec }} из {{ LIMIT }} с</template></small>
          <span class="sp" />
          <button v-if="run.on" type="button" class="ghost" @click="stop">Стоп</button>
          <button v-else type="button" class="pri" :disabled="!picked.length || !ai.keys.length" @click="start">Озвучить выбранные ({{ picked.length }})</button>
          <button type="button" class="pri g" :disabled="!ready.length || saving" @click="save">{{ saving ? 'Сохраняю…' : `Сохранить в карточки (${ready.length})` }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tb-bg { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 16px; background: rgba(10, 14, 20, .5); backdrop-filter: blur(2px) }
.tb { width: min(920px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; box-sizing: border-box; padding: 16px 18px 14px; border-radius: 18px; background: var(--card, #fff); color: var(--text, #1a1a1a); box-shadow: 0 20px 60px rgba(0, 0, 0, .3); font-family: var(--font, system-ui) }
header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px } header img { width: 22px; height: 22px } header b { font-size: 17px } .sp { flex: 1 }
.x { border: 0; background: none; color: var(--hint, #888); font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 8px }
.ctl { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center } .ctl label { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--hint, #777) }
.ctl select { height: 32px; padding: 0 6px; border: 1px solid var(--border, #e3e3e3); border-radius: 8px; background: var(--bg, #fff); color: var(--text); font: inherit; font-size: 13px; max-width: 220px } .chk { color: var(--text) !important }
.hint { margin: 6px 0 8px; font-size: 12px; color: var(--hint, #888) }
.tbl { flex: 1; min-height: 120px; overflow: auto; overflow-anchor: none; border: 1px solid var(--border, #e6e6e6); border-radius: 12px; font-size: 13px }
.tr { --c: #b7c2d0; display: grid; grid-template-columns: 38px minmax(0, 1fr) 64px minmax(0, 1.8fr) 290px; align-items: center; gap: 8px; height: 44px; box-sizing: border-box; padding: 0 8px; border-top: 1px solid var(--border, #eee) }
.tr:first-child { border-top: 0 } .th { position: sticky; top: 0; z-index: 3; height: 32px; min-height: 30px; background: var(--surface, #f6f6f6); font-size: 11px; font-weight: 800; color: var(--hint, #888); text-transform: uppercase; letter-spacing: .04em }
.c0 { display: grid; place-items: center; align-self: stretch; cursor: pointer } .c0 input { width: 18px; height: 18px; margin: 0; cursor: pointer; accent-color: #2fa36b }
.tr.part { background: color-mix(in srgb, var(--c) 10%, transparent); box-shadow: inset 4px 0 0 var(--c) }
.mw { flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px; height: 26px; cursor: pointer; touch-action: none } .mw s { flex: 1; min-width: 1px; border-radius: 2px; background: #b7c2d0; text-decoration: none } .mw s.p { background: var(--c) }
.tm { flex: none; font-variant-numeric: tabular-nums; color: var(--hint, #777) }
.sel { display: flex; gap: 6px; margin: 8px 0 0 } .chip { height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--surface, #f1f1f1); color: inherit; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer } .chip:hover:not(:disabled) { background: #e7e7e7 } .chip:disabled { opacity: .45 } .lb { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .kd { font-size: 12px; color: var(--hint, #888) }
.tx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .cr { display: flex; align-items: center; gap: 6px; font-size: 12px }
.tr.busy { background: rgba(75, 141, 248, .07) } .tr.done:not(.part) { background: rgba(47, 163, 107, .06) } .tr.saved .cr small { color: #1f7a4f } .tr.err { background: rgba(224, 70, 70, .05) }
.tr .pl { background: var(--c) } .tr:not(.part) .pl { background: #4b8df8 }
.pl { flex: none; width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: #4b8df8; color: #fff; cursor: pointer } .pl svg { width: 14px; height: 14px; fill: currentColor } .pl.on { background: #2f6fe0 }
.ib { width: 26px; height: 26px; border: 0; border-radius: 8px; background: none; color: var(--hint, #888); font-size: 15px; cursor: pointer } .ib:hover { background: var(--surface, #f0f0f0); color: var(--text) }
.mute { color: var(--hint, #999) } .er { color: #c53030; font-style: normal; font-weight: 700 } p.er { margin: 8px 0 0; font-size: 13px }
.empty { margin: 16px; text-align: center; color: var(--hint, #888) }
.spin { width: 11px; height: 11px; border: 2px solid #4b8df8; border-right-color: transparent; border-radius: 50%; animation: s .7s linear infinite } @keyframes s { to { transform: rotate(360deg) } }
.bs { display: grid; gap: 6px; margin-top: 10px; max-height: 46vh; overflow: auto }
.bhr { display: flex; align-items: center; gap: 6px } .bh { flex: 1; width: 100%; text-align: left; border: 0; background: var(--surface, #f4f4f4); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--text); cursor: pointer } .bh em { color: #b45309; font-style: normal; font-weight: 600 }

.plan { padding: 8px 4px 2px } .ph { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px } .ph span { color: var(--hint, #888) }
.pw { position: relative; display: flex; align-items: center; gap: 1px; height: 110px; cursor: pointer; touch-action: none; user-select: none }
.pw s { flex: 1; min-width: 1px; border-radius: 2px; background: #b7c2d0; text-decoration: none }
.pw .hd { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--text, #222); border-radius: 1px; pointer-events: none; z-index: 1 }
.cut { position: absolute; top: -6px; bottom: -6px; width: 28px; margin-left: -14px; cursor: ew-resize; z-index: 2; outline: none }
.cut::before { content: ''; position: absolute; left: 13px; top: 0; bottom: 0; width: 2px; border-radius: 1px; background: var(--text, #222); opacity: .5 }
.cut::after { content: ''; position: absolute; left: 8px; top: 50%; margin-top: -16px; width: 12px; height: 32px; border-radius: 6px; background: var(--text, #222); opacity: .75; box-shadow: 0 0 0 2px var(--card, #fff) }
.cut:hover::before, .cut:hover::after, .cut.drag::before, .cut.drag::after, .cut:focus-visible::before, .cut:focus-visible::after { opacity: 1 }
.pn { position: relative; height: 22px; margin-top: 4px } .pn button { position: absolute; transform: translateX(-50%); border: 0; background: none; padding: 0 4px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer }
.plan .hint { margin: 4px 0 0 }
.nb { display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-right: 6px; padding: 0 4px; border-radius: 9px; color: #fff; font-size: 11px; vertical-align: 1px }
.lg { margin-top: 8px; font-size: 12px } .lg summary { cursor: pointer; font-weight: 800; color: var(--hint, #777) } .lg summary em { color: #c53030; font-style: normal }
.lg ol { list-style: none; margin: 4px 0 0; padding: 6px 8px; max-height: 110px; overflow: auto; border-radius: 8px; background: var(--surface, #f6f6f6); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11.5px; line-height: 1.5 }
.lg li.bad { color: #c53030 } .lg li.ok { color: #1f8a4c } .lg time { color: var(--hint, #999); margin-right: 8px }
footer { display: flex; align-items: center; gap: 8px; margin-top: 12px } footer small { font-size: 12.5px; color: #2f6fe0; font-weight: 700 }
.pri, .ghost { height: 40px; padding: 0 16px; border: 0; border-radius: 12px; font: inherit; font-weight: 800; cursor: pointer } .pri { background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff } .pri.g { background: #2fa36b } .ghost { background: var(--surface, #f1f1f1); color: inherit }
.pri:disabled { opacity: .45; cursor: not-allowed }
@media (max-width: 640px) { .tr { grid-template-columns: 34px minmax(0, 1fr) minmax(0, 1.2fr) 170px } .kd { display: none } .th span:nth-child(3) { display: none } }
</style>

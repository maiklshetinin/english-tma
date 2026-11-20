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
import { aiIcon } from '../utils/ai'

const props = defineProps({ title: { type: String, default: 'Озвучить' }, items: { type: Array, required: true } })
const emit = defineEmits(['close', 'save'])
const icon = aiIcon('Gemini')
const voice = ref(getVoice()), model = ref(getModel()), models = ref(knownModels()), size = ref(10), onlyNew = ref(true)
onMounted(async () => { if (ai.keys[0]) { const l = await ttsModels(ai.keys[0].key); if (l.length) { models.value = l; if (!l.includes(model.value)) { model.value = l[0]; setModel(l[0]) } } } })

// строки
const items = props.items.map((x) => ({ ...x }))          // снимок на момент открытия окна
const row = reactive(Object.fromEntries(items.map((it) => [it.key, { sel: !it.has, st: 'idle', url: '', blob: null, sec: 0, batch: -1, err: '' }])))
const list = computed(() => items.filter((it) => !onlyNew.value || !it.has || row[it.key].st !== 'idle'))
const picked = computed(() => list.value.filter((it) => row[it.key].sel && it.text?.trim() && row[it.key].st !== 'busy'))
const ready = computed(() => items.filter((it) => row[it.key].st === 'done'))
const allOn = computed(() => list.value.length > 0 && list.value.every((it) => row[it.key].sel))
function toggleAll() { const v = !allOn.value; for (const it of list.value) row[it.key].sel = v }
const nReq = computed(() => Math.ceil(picked.value.length / size.value))

// пачки
const batches = ref([])            // { keys, pcm, rate, info, cuts, pk, model, voice, open }
let stopReq = false
const run = reactive({ on: false, wait: 0, note: '', err: '' })
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
function setPiece(it, pcm, rate, b) {
  const r = row[it.key]; if (r.url) URL.revokeObjectURL(r.url)
  r.blob = pcmToWav(pcm, rate); r.url = URL.createObjectURL(r.blob); r.sec = pcm.length / rate; r.st = 'done'; r.batch = b; r.err = ''
}
function cutBatch(bi) {
  const B = batches.value[bi], rg = rangesOf(B.info, B.cuts)
  B.keys.forEach((k, i) => { const it = items.find((x) => x.key === k); if (it && row[k].batch === bi) setPiece(it, B.pcm.slice(rg[i][0], rg[i][1]), B.rate, bi) })
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
      const r = await speak(texts.length > 1 ? batchText(texts) : texts[0], voice.value, { model: model.value })
      const sp = splitPcm(r.pcm, r.rate, texts)
      batches.value.push({ keys: part.map((it) => it.key), pcm: r.pcm, rate: r.rate, info: sp.info, cuts: sp.cuts, pk: peaks(r.pcm, 240), model: r.model, voice: voice.value, open: !!sp.guessed, guessed: !!sp.guessed })
      cutBatch(batches.value.length - 1)
    } catch (e) {
      part.forEach((it) => { row[it.key].st = 'err'; row[it.key].err = e.message })
      run.err = e.message
      if (e.quota || e.nokeys || e.status === 400 || e.status === 403) break          // лимит или ключ — дальше без толку
    }
    if (i + size.value < queue.length && !stopReq) for (run.wait = 21; run.wait > 0 && !stopReq; run.wait--) await sleep(1000)          // 3 запроса в минуту
  }
  for (const it of queue) if (row[it.key].st === 'queue') row[it.key].st = 'idle'
  run.on = false; run.wait = 0; run.note = ''
}
function stop() { stopReq = true }
async function redo(it) {          // переозвучить одну строку отдельным запросом
  if (run.on || row[it.key].st === 'busy') return
  row[it.key].st = 'busy'
  try { const r = await speak(it.text.trim(), voice.value, { model: model.value }); setPiece(it, r.pcm, r.rate, -1); row[it.key].by = `${r.model}|${voice.value}` }
  catch (e) { row[it.key].st = 'err'; row[it.key].err = e.message }
}
// плеер строки
let au = null
const playing = ref('')
function play(k) {
  if (playing.value === k) { au?.pause(); return }
  au?.pause(); au = new Audio(row[k].url); playing.value = k
  au.onended = au.onpause = () => { if (playing.value === k) playing.value = '' }
  au.play().catch(() => { playing.value = '' })
}
// граница на волне пачки: тянуть мышью / пальцем
function dragCut(e, bi, ci) {
  const B = batches.value[bi], el = e.currentTarget.parentElement, rect = el.getBoundingClientRect(), GAP = 20
  e.currentTarget.setPointerCapture?.(e.pointerId)
  const move = (ev) => {
    const f = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) * B.info.nf
    const lo = (ci ? B.cuts[ci - 1] : 0) + GAP, hi = (ci < B.cuts.length - 1 ? B.cuts[ci + 1] : B.info.nf) - GAP
    B.cuts[ci] = Math.round(Math.min(hi, Math.max(lo, f)))
  }
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); cutBatch(bi) }
  addEventListener('pointermove', move); addEventListener('pointerup', up)
}
const segOf = (B, k) => { const pos = ((k + 0.5) / B.pk.length) * B.info.nf; let i = 0; while (i < B.cuts.length && pos > B.cuts[i]) i++; return i }
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
const onKey = (e) => { if (e.key === 'Escape' && !busyClose.value) { e.stopPropagation(); emit('close') } }
onMounted(() => addEventListener('keydown', onKey, true))
onBeforeUnmount(() => { removeEventListener('keydown', onKey, true); stopReq = true; au?.pause(); for (const k in row) if (row[k].url) URL.revokeObjectURL(row[k].url) })
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
        <p class="hint">Одна пачка — один запрос (у модели 10 в сутки, 3 в минуту). Отмечено {{ picked.length }} → {{ nReq }} {{ nReq === 1 ? 'запрос' : nReq < 5 ? 'запроса' : 'запросов' }}.</p>

        <div class="tbl">
          <div class="tr th"><label class="c0"><input type="checkbox" :checked="allOn" @change="toggleAll" /></label><span>Карточка</span><span>Что</span><span>Текст</span><span class="cr">Звук</span></div>
          <div v-for="it in list" :key="it.key" class="tr" :class="row[it.key].st">
            <label class="c0"><input v-model="row[it.key].sel" type="checkbox" :disabled="!it.text?.trim()" /></label>
            <span class="lb">{{ it.label }}</span>
            <span class="kd">{{ it.kind }}</span>
            <span class="tx" :title="it.text">{{ it.text }}</span>
            <span class="cr">
              <template v-if="row[it.key].st === 'busy'"><i class="spin" />озвучивается</template>
              <template v-else-if="row[it.key].st === 'queue'">в очереди</template>
              <template v-else-if="row[it.key].st === 'err'"><em class="er" :title="row[it.key].err">ошибка</em><button type="button" class="ib" title="Озвучить одну эту" @click="redo(it)">↻</button></template>
              <template v-else-if="row[it.key].url">
                <button type="button" class="pl" :class="{ on: playing === it.key }" :title="playing === it.key ? 'Пауза' : 'Послушать'" @click="play(it.key)"><svg viewBox="0 0 24 24"><path v-if="playing !== it.key" d="M8 5.5v13l10.5-6.5z" /><path v-else d="M7 5.5h3.6v13H7zM13.4 5.5H17v13h-3.6z" /></svg></button>
                <small>{{ fmt(row[it.key].sec) }}<template v-if="row[it.key].st === 'saved'"> · сохранено</template></small>
                <button v-if="row[it.key].st !== 'saved'" type="button" class="ib" title="Переозвучить одну эту фразу (1 запрос)" @click="redo(it)">↻</button>
              </template>
              <template v-else-if="it.has"><small class="mute">есть звук</small></template>
            </span>
          </div>
          <p v-if="!list.length" class="empty">{{ onlyNew ? 'Всё уже озвучено — снимите «только без звука», чтобы переозвучить' : 'Нечего озвучивать' }}</p>
        </div>

        <div v-if="batches.length" class="bs">
          <div v-for="(B, bi) in batches" :key="bi" class="bb">
            <button type="button" class="bh" @click="B.open = !B.open">{{ B.open ? '▾' : '▸' }} Пачка {{ bi + 1 }} · {{ B.keys.length }} фраз · {{ modelName(B.model) }} · {{ B.voice }}<em v-if="B.guessed"> · паузы не нашлись — нарезано по длине текста, проверьте границы</em></button>
            <div v-if="B.open" class="wv">
              <s v-for="(v, k) in B.pk" :key="k" :style="{ height: Math.max(6, v * 100) + '%', background: COL[segOf(B, k) % COL.length] }" />
              <i v-for="(c, ci) in B.cuts" :key="ci" class="cut" :style="{ left: (c / B.info.nf) * 100 + '%' }" title="Потяните, чтобы сдвинуть границу" @pointerdown.prevent.stop="dragCut($event, bi, ci)" />
            </div>
            <p v-if="B.open" class="bn"><span v-for="(k, i) in B.keys" :key="k" :style="{ color: COL[i % COL.length] }">{{ i + 1 }}. {{ items.find((x) => x.key === k)?.text?.slice(0, 28) }} </span></p>
          </div>
        </div>

        <p v-if="run.err" class="er">{{ run.err }}</p>
        <footer>
          <small v-if="run.on">{{ run.note }}<template v-if="run.wait"> · пауза {{ run.wait }} с</template></small>
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
.tbl { flex: 1; min-height: 120px; overflow: auto; border: 1px solid var(--border, #e6e6e6); border-radius: 12px; font-size: 13px }
.tr { display: grid; grid-template-columns: 30px minmax(0, 1fr) 70px minmax(0, 2.2fr) 180px; align-items: center; gap: 8px; min-height: 36px; padding: 0 8px; border-top: 1px solid var(--border, #eee) }
.tr:first-child { border-top: 0 } .th { position: sticky; top: 0; z-index: 1; min-height: 30px; background: var(--surface, #f6f6f6); font-size: 11px; font-weight: 800; color: var(--hint, #888); text-transform: uppercase; letter-spacing: .04em }
.c0 { display: grid; place-items: center } .lb { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .kd { font-size: 12px; color: var(--hint, #888) }
.tx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .cr { display: flex; align-items: center; gap: 6px; font-size: 12px }
.tr.busy { background: rgba(75, 141, 248, .07) } .tr.done { background: rgba(47, 163, 107, .06) } .tr.saved .cr small { color: #1f7a4f } .tr.err { background: rgba(224, 70, 70, .05) }
.pl { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: #4b8df8; color: #fff; cursor: pointer } .pl svg { width: 14px; height: 14px; fill: currentColor } .pl.on { background: #2f6fe0 }
.ib { width: 26px; height: 26px; border: 0; border-radius: 8px; background: none; color: var(--hint, #888); font-size: 15px; cursor: pointer } .ib:hover { background: var(--surface, #f0f0f0); color: var(--text) }
.mute { color: var(--hint, #999) } .er { color: #c53030; font-style: normal; font-weight: 700 } p.er { margin: 8px 0 0; font-size: 13px }
.empty { margin: 16px; text-align: center; color: var(--hint, #888) }
.spin { width: 11px; height: 11px; border: 2px solid #4b8df8; border-right-color: transparent; border-radius: 50%; animation: s .7s linear infinite } @keyframes s { to { transform: rotate(360deg) } }
.bs { display: grid; gap: 6px; margin-top: 10px; max-height: 30vh; overflow: auto }
.bh { width: 100%; text-align: left; border: 0; background: var(--surface, #f4f4f4); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--text); cursor: pointer } .bh em { color: #b45309; font-style: normal; font-weight: 600 }
.wv { position: relative; display: flex; align-items: center; gap: 1px; height: 70px; margin: 6px 4px 0; touch-action: none }
.wv s { flex: 1; min-width: 1px; border-radius: 2px; text-decoration: none; opacity: .85 }
.cut { position: absolute; top: -4px; bottom: -4px; width: 22px; margin-left: -11px; cursor: ew-resize; z-index: 2 }
.cut::before { content: ''; position: absolute; left: 10px; top: 0; bottom: 0; width: 2px; background: var(--text, #222); opacity: .6 } .cut::after { content: ''; position: absolute; left: 6px; top: 50%; margin-top: -12px; width: 10px; height: 24px; border-radius: 5px; background: var(--text, #222); opacity: .8 }
.bn { margin: 4px 4px 0; font-size: 11.5px; font-weight: 700 }
footer { display: flex; align-items: center; gap: 8px; margin-top: 12px } footer small { font-size: 12.5px; color: #2f6fe0; font-weight: 700 }
.pri, .ghost { height: 40px; padding: 0 16px; border: 0; border-radius: 12px; font: inherit; font-weight: 800; cursor: pointer } .pri { background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff } .pri.g { background: #2fa36b } .ghost { background: var(--surface, #f1f1f1); color: inherit }
.pri:disabled { opacity: .45; cursor: not-allowed }
@media (max-width: 640px) { .tr { grid-template-columns: 26px minmax(0, 1fr) minmax(0, 1.4fr) 120px } .kd { display: none } .th span:nth-child(3) { display: none } }
</style>

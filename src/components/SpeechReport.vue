<script setup>
// «Тест речи» (20.11.2026, эксперимент) — отдельный компонент: кнопка «Оценить речь» и отчёт (уровень CEFR, понятность,
// критерии, ошибки с исправлениями, произношение, сильные стороны, советы). Встраивается куда угодно:
//   <SpeechReport :chunks="записанные куски Int16Array 16 кГц" :transcript="текст" lang="pl-PL" />
import { ref, computed, onMounted } from 'vue'
import { assessSpeech, wavOf, CRIT, MIN_SEC, LANG_NAME, getSpeechPick, setSpeechPick, checkName } from '../utils/speech'
import { checkModels, limitOf } from '../utils/kpcheck'
import { ai } from '../utils/gemini'
const props = defineProps({ chunks: { type: Array, default: () => [] }, transcript: { type: String, default: '' }, lang: { type: String, default: 'pl-PL' }, report: { type: Object, default: null }, bare: Boolean })          // report — готовый отчёт (оценка шла в фоне); bare — без кнопки и выбора модели
const st = ref('idle'), err = ref(''), own = ref(null), models = ref([]), pick = ref(getSpeechPick())
const sec = computed(() => props.chunks.reduce((a, c) => a + c.length, 0) / 16000)
onMounted(async () => { if (ai.keys[0]) models.value = await checkModels(ai.keys[0].key) })
function setPick(v) { pick.value = v; setSpeechPick(v) }
async function run() {
  if (st.value === 'busy') return
  st.value = 'busy'; err.value = ''
  try { const { blob, sec: s } = wavOf(props.chunks); own.value = await assessSpeech({ blob, sec: s, transcript: props.transcript, lang: props.lang }); st.value = 'done' }
  catch (e) { err.value = e.message; st.value = own.value ? 'done' : 'idle' }
}
const rep = computed(() => own.value || props.report)
const tone = (v) => (v >= 75 ? 'ok' : v >= 50 ? 'mid' : 'low')
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
</script>

<template>
  <div class="sr" @pointerdown.stop>
    <div v-if="!bare" class="srh">
      <small v-if="!rep" class="hint">Для оценки разговорного уровня — говорите своими словами, не читайте текст.</small>
      <button type="button" class="srb" :disabled="st === 'busy' || !chunks.length" @click="run">{{ st === 'busy' ? 'Gemini слушает запись…' : rep ? 'Оценить ещё раз' : 'Оценить речь' }}</button>
      <select class="srm" :value="pick" title="Модель оценки — запоминается в этом браузере" :disabled="st === 'busy'" @change="setPick($event.target.value)">
        <option value="">авто{{ models[0] ? ' · ' + checkName(models[0]) : '' }}</option><option v-for="m in models" :key="m" :value="m">{{ checkName(m) }}{{ limitOf(m) ? ' · ' + limitOf(m) : '' }}</option></select>
      <small>запись {{ fmt(sec) }} · {{ LANG_NAME[lang] }}<template v-if="sec < MIN_SEC"> · нужно от {{ MIN_SEC }} с</template></small>
    </div>
    <p v-if="err && !bare" class="sre">{{ err }}</p>

    <div v-if="rep" class="srr">
      <div class="srtop">
        <div class="lvl"><b>{{ rep.level }}{{ rep.plus ? '+' : '' }}</b><small>{{ rep.read ? 'уровень текста' : 'уровень' }} · уверенность {{ rep.confidence }}%</small></div>
        <div class="intl" :class="tone(rep.intelligibility)"><div class="ih"><span>Понятность речи</span><b>{{ rep.intelligibility }}%</b></div><i><s :style="{ width: rep.intelligibility + '%' }" /></i></div>
      </div>
      <div v-if="rep.read" class="rd"><b>Похоже на чтение или заученный текст</b> — уровень показывает сложность текста, а не разговорную речь. Для оценки разговора расскажите своими словами, не читая.<small v-if="rep.readWhy">Признаки: {{ rep.readWhy }}</small></div>
      <p v-if="rep.summary" class="sum">{{ rep.summary }}</p>
      <div class="crit"><div v-for="(t, k) in CRIT" :key="k" class="cr" :class="tone(rep.scores[k])"><span>{{ t }}</span><i><s :style="{ width: rep.scores[k] + '%' }" /></i><b>{{ rep.scores[k] }}</b></div></div>
      <div v-if="rep.mistakes.length" class="blk"><h4>Ошибки</h4>
        <div v-for="(m, i) in rep.mistakes" :key="i" class="ms"><span class="q">{{ m.quote }}</span><span class="ar">→</span><span class="fx">{{ m.fix }}</span><small>{{ m.why }}</small></div></div>
      <div v-if="rep.pron.length" class="blk"><h4>Произношение</h4><ul><li v-for="(x, i) in rep.pron" :key="i">{{ x }}</li></ul></div>
      <div class="two">
        <div v-if="rep.strengths.length" class="blk"><h4>Получается</h4><ul><li v-for="(x, i) in rep.strengths" :key="i">{{ x }}</li></ul></div>
        <div v-if="rep.tips.length" class="blk"><h4>Что подтянуть</h4><ul><li v-for="(x, i) in rep.tips" :key="i">{{ x }}</li></ul></div>
      </div>
      <small class="by">оценил Gemini · {{ checkName(rep.model) }} · {{ (rep.ms / 1000).toFixed(1).replace('.', ',') }} с<template v-if="rep.dropped > 0"> · выдуманных цитат отброшено: {{ rep.dropped }}</template> · это ориентир, а не сертификат</small>
    </div>
  </div>
</template>

<style scoped>
.sr { display: grid; gap: 10px }
.srh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap } .srh .hint { flex-basis: 100%; order: -1 }
.srh small { font-size: 12px; color: var(--hint) }
.srb { height: 38px; padding: 0 16px; border: 0; border-radius: 12px; background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer } .srb:disabled { opacity: .5; cursor: default }
.srm { height: 32px; max-width: 230px; padding: 0 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; font-size: 12px }
.sre { margin: 0; font-size: 13px; font-weight: 700; color: var(--red-d) }
.srr { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--card) }
.srtop { display: flex; gap: 14px; align-items: center }
.lvl { flex: none; display: grid; place-items: center; width: 92px; height: 78px; border-radius: 16px; background: linear-gradient(135deg, #4b8df8, #a35cf0); color: #fff; text-align: center }
.lvl b { font-size: 30px; line-height: 1 } .lvl small { font-size: 10px; font-weight: 700; opacity: .9; padding: 0 4px }
.intl { flex: 1; display: grid; gap: 6px } .ih { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700 } .ih b { font-size: 18px }
i { display: block; height: 8px; border-radius: 4px; background: var(--surface); overflow: hidden } i s { display: block; height: 100%; border-radius: 4px; background: #ff9600; text-decoration: none }
.ok i s { background: #58cc02 } .low i s { background: #ff4b4b }
.rd { padding: 10px 12px; border-radius: 12px; background: #fff4d6; color: #6b4a00; font-size: 13.5px; line-height: 1.45 } .rd b { font-weight: 800 } .rd small { display: block; margin-top: 4px; font-size: 12px; opacity: .85 }
.sum { margin: 0; font-size: 14px; line-height: 1.45 }
.crit { display: grid; gap: 6px } .cr { display: grid; grid-template-columns: 110px 1fr 30px; align-items: center; gap: 8px; font-size: 13px } .cr b { text-align: right; font-variant-numeric: tabular-nums }
.blk h4 { margin: 0 0 6px; font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .04em }
.blk ul { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.45 }
.ms { display: grid; grid-template-columns: auto auto 1fr; gap: 2px 8px; align-items: baseline; padding: 6px 0; border-top: 1px solid var(--border); font-size: 14px }
.ms:first-of-type { border-top: 0 } .ms .q { color: #b3261e; text-decoration: line-through; text-decoration-thickness: 1px } .ms .fx { color: #1f7a4f; font-weight: 700 } .ms small { grid-column: 1 / -1; font-size: 12px; color: var(--hint) }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px } @media (max-width: 520px) { .two { grid-template-columns: 1fr } }
.by { font-size: 11.5px; color: var(--hint) }
</style>

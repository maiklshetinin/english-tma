<script setup>
// «Разговор с Gemini» (20.11.2026, эксперимент): живой голосовой диалог на компьютере — Live API, ключи из профиля (utils/live.js).
// По умолчанию — собеседование на Карту поляка: Gemini — консул, спрашивает по-польски, ученик отвечает голосом.
// В правке: что делает ученик (text), роль Gemini (prompt — видит только ИИ), голос и модель. Ход разговора — расшифровка пузырями.
// Без оценки: «Продолжить» доступна сразу (как у «Подсказки»).
// Язык — из JSON экрана (lang: pl-PL, en-US, en-GB; 21.11.2026). Всё, что уходит в Live-модель (роль, замок языка, первая реплика, пауза, чувствительность, температура, шумодав), — в JSON экрана
// (кнопка «{ }»), умолчания — defaults.ts (talkCfg); в экране хранятся только отличия (20.11.2026).
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExText from '../parts/ExText.vue'
import { usePlay, useEdit, inEditor } from '../ctx'
import { startTalk, startTranscribe, sttModel, liveModels, liveName, firstKey } from '../../utils/live'
import { ai } from '../../utils/gemini'
import { aiIcon } from '../../utils/ai'
import { VOICES } from '../../utils/tts'
import SpeechReport from '../../components/SpeechReport.vue'
import TalkAvatar from './TalkAvatar.vue'
import { assessSpeech, wavOf } from '../../utils/speech'
import J from './talk.json'
import { LANGS, talkCfg, talkSystem } from './defaults'
import { tp, setPick, setVoice as setVPick, setEval, loadModels } from './prefs'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const icon = aiIcon('Gemini')

// модели и голос — в правке; модели — из ключа
const cfg = computed(() => talkCfg(props.step))          // действующие настройки: свои поля экрана поверх умолчаний
const models = computed(() => tp.models), voice = computed(() => cfg.value.voice)
const lessonModel = computed(() => (cfg.value.model === 'auto' ? '' : cfg.value.model))          // 'auto' — самая свежая Live-модель ключа
onMounted(() => { loadModels() })
// модель и голос перед разговором (20.11.2026): свой выбор ученика (запоминается в браузере), по умолчанию — из правки или самая свежая.
// 21.11.2026: выбираются в подвале (part="fb"), «Оценивать речь» — вверху экрана; состояние общее — prefs.js
// голос и модель — из JSON экрана; в редакторе пилюля меняет сам экран, у ученика — только это открытие (prefs.js)
const editor = inEditor()
const pick = computed(() => (editor ? '' : tp.pick)), vpick = computed(() => (editor ? '' : tp.voice))
const vSel = computed(() => vpick.value || voice.value)
// в редакторе: совпало с умолчанием (код ← настройки курса) — поле экрана убрать, иначе записать
const base = () => talkCfg({ ptt: props.step.ptt, avatar: props.step.avatar, busuu: props.step.busuu, lang: props.step.lang })
function onVoice(v) { if (editor) setF('voice', v === base().voice ? '' : v); else setVPick(v === voice.value ? '' : v) }
function onModel(v) { if (editor) setF('model', (v || 'auto') === base().model ? '' : v || 'auto'); else setPick(v === lessonModel.value ? '' : v) }
// надписи на «таблетках» подвала — коротко (список под ними — полный)
const pickName = computed(() => liveName(pick.value || lessonModel.value || models.value[0] || ''))
const vShort = computed(() => { const n = vpick.value || voice.value, v = VOICES.find((x) => x[0] === n); return v ? `${n} ${v[1] === 'женский' ? '♀' : '♂'}` : n })
const vName = (n) => { const v = VOICES.find((x) => x[0] === n); return v ? `${v[0]} · ${v[1] === 'женский' ? '♀' : '♂'} ${v[2]}` : n }
const think = (m) => /think/i.test(m)
// язык разговора — польский: расшифровка и голос закреплены, перед ролью — «замок» (lock): иначе Live-модель сама угадывает язык
// и с акцентом «слышит» русский (20.11.2026)
// 21.11.2026: язык — из JSON экрана (lang: "pl-PL" | "en-US" | "en-GB"), по нему же умолчания роли, замок PL / EN и подсказки
const lang = computed(() => cfg.value.lang)          // в модель — явно (startTalk → languageCode)
const L = computed(() => LANGS[lang.value])
const defPrompt = computed(() => talkCfg({ lang: lang.value }).prompt)
function setF(k, v) { if (v) props.step[k] = v; else delete props.step[k]; ed.changed() }

// разговор
const used = ref(''), usedV = ref(''), st = ref('idle'), err = ref(''), note = ref(''), lines = ref([]), level = ref(0), muted = ref(false), t0 = ref(0), now = ref(0)
let sess = null, clock = 0
const busy = computed(() => st.value === 'live' || st.value === 'connecting')
watch(busy, (v) => { if (v) tp.busy[props.step.id] = true; else delete tp.busy[props.step.id] })          // подвал: пока идёт разговор, модель и голос не меняются
const box = ref(null)
const sec = computed(() => { const s = Math.max(0, Math.round((now.value - t0.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
function push(role, chunk) {
  const last = lines.value.at(-1)
  if (last && last.role === role && !last.closed) last.t += chunk; else lines.value.push({ role, t: chunk.replace(/^\s+/, ''), closed: false })
  if (atEnd.value) nextTick(() => toEnd(false))          // как в Telegram: внизу — новые реплики прокручивают чат сами; отмотали вверх — не дёргаем, есть «↓»
}
// чат как в Telegram (21.11.2026): тонкая полоска прокрутки — только пока мышь над чатом или его крутят (гаснет через секунду),
// верх растворяется; отмотали вверх — круглая «↓» внизу справа
const atEnd = ref(true), scrolling = ref(false)
let scT = 0
function onScroll() {
  const b = box.value; if (!b) return
  atEnd.value = b.scrollHeight - b.scrollTop - b.clientHeight < 40
  scrolling.value = true; clearTimeout(scT); scT = setTimeout(() => { scrolling.value = false }, 1000)
}
function toEnd(smooth = true) { const b = box.value; if (b) { b.scrollTo({ top: b.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); atEnd.value = true } }
async function start() {
  if (st.value === 'connecting' || st.value === 'live') return
  err.value = ''; note.value = ''; lines.value = []; atEnd.value = true; resetEval()
  const key = firstKey()
  if (!key) { err.value = 'Нужен ключ Gemini — добавьте его в профиле, раздел «Ключи Gemini»'; return }
  let m = pick.value || lessonModel.value
  if (!m) { const l = await liveModels(key); m = l[0] }
  used.value = m
  if (!m) { err.value = 'Google не дал этому ключу ни одной Live-модели'; return }
  usedV.value = vpick.value || voice.value
  const c = cfg.value
  if (ptt.value) startTr(key)
  sess = startTalk({ key, model: m, voice: usedV.value, lang: lang.value, system: talkSystem(c), opener: c.opener, manual: ptt.value,
    silenceMs: c.silenceMs, endSens: c.endSens, temperature: c.temperature, noiseSuppression: c.noiseSuppression, rec: evalOn.value ? onRec : null, on: {
    state: (s, info) => {
      if (s === 'live' && info) { note.value = info; return }
      st.value = s === 'error' ? 'ended' : s
      if (s === 'error') err.value = info
      if (s === 'live') { t0.value = now.value = Date.now(); clearInterval(clock); clock = setInterval(() => { now.value = Date.now() }, 500) }
      if (s === 'ended' || s === 'error') { clearInterval(clock); level.value = 0; sess = null; stopTr(); if (evalOn.value && speechSec.value - sentAt >= 8) sendEval(true) }          // хвост речи — последней оценкой
    },
    text: (role, t) => { if (ptt.value && role === 'me') return; push(role, t); if (ptt.value && role === 'ai') aiGuard() },          // рация: свою речь пишет Transcribe
    turn: () => { const l = lines.value.at(-1); if (l && !l.draft) l.closed = true; if (ptt.value && pt.value === 'wait') pt.value = 'idle' },
    level: (v) => { if (!ptt.value) level.value = level.value * 0.6 + v * 0.4 },
  } })
  st.value = 'connecting'
}
function stop() { if (pt.value === 'talk') pttEnd(); sess?.stop() }
// «Разговор · рация» (21.11.2026, тест; step.ptt): нажал — говоришь сколько нужно, нажал ещё раз — реплика уходит, Gemini отвечает.
// Две модели: свою речь пишет Gemini Transcribe Live (точнее распознаёт, язык закреплён настройкой), отвечает Gemini Live —
// она слышит тот же голос (manual: activityStart / activityEnd — «договорил» решает кнопка, а не пауза). Нажатие, пока Gemini
// говорит, — перебить. Язык: реплика с кириллицей — подсказка «по-польски»; Gemini ответила не по-польски — просим по-польски
const ptt = computed(() => !!props.step.ptt)
const pt = ref('idle')          // idle — можно говорить; talk — говорю; wait — отправил, жду ответ
let tr = null, trAcc = '', trDraft = '', trLine = null, flushT = 0, aiWarned = null
const CYR = /[\u0400-\u04FF]/
function startTr(key) {
  sttModel(key).then((model) => {
    if (!sess) return
    tr = startTranscribe({ key, model, lang: lang.value, on: {
      state: (s, info) => { if (s === 'error') note.value = 'расшифровка: ' + info },
      interim: (t) => { trDraft = t; trShow() },
      final: (t) => { trAcc = (trAcc + ' ' + t).trim(); trDraft = ''; trShow() },
      level: (v) => { level.value = level.value * 0.6 + v * 0.4 },
    } })
    tr.hold(true)
  })
}
function stopTr() { tr?.stop(); tr = null; clearTimeout(flushT); pt.value = 'idle'; if (trLine) { trCommit() } }
function trShow() { if (trLine) trLine.t = (trAcc + ' ' + trDraft).trim() }
function pttStart() {
  if (!sess || st.value !== 'live') return
  if (pt.value === 'talk') return pttEnd()
  clearTimeout(flushT); if (trLine) trCommit()
  trAcc = ''; trDraft = ''
  lines.value.push({ role: 'me', t: '', closed: false, draft: true }); trLine = lines.value.at(-1)
  if (atEnd.value) nextTick(() => toEnd(false))
  sess.talkStart(); tr?.hold(false); pt.value = 'talk'
}
function pttEnd() {
  if (pt.value !== 'talk') return
  sess?.talkEnd(); tr?.flush(); tr?.hold(true); pt.value = 'wait'; level.value = 0
  clearTimeout(flushT); flushT = setTimeout(trCommit, 1500)          // хвост расшифровки приходит после «отправить»
}
function trCommit() {
  const l = trLine; trLine = null; if (!l) return
  l.t = (trAcc + ' ' + trDraft).trim() || l.t; l.draft = false; l.closed = true
  if (!l.t) l.t = '…'
  if (CYR.test(l.t)) l.warn = 'похоже, по-русски — говорите ' + L.value.how
}
/** Gemini ответила не по-польски — один раз за реплику просим по-польски и помечаем пузырь */
function aiGuard() {
  const l = lines.value.at(-1); if (!l || l.role !== 'ai' || aiWarned === l) return
  if (CYR.test(l.t) || (l.t.match(L.value.alien) || []).length >= 2) { aiWarned = l; l.warn = `Gemini ответила не ${L.value.how}` + (cfg.value.guard ? ` — попросили ${L.value.how}` : ''); if (cfg.value.guard) sess?.send(cfg.value.guard) }          // просьба вернуться к языку — из JSON экрана (guard)
}
const outLevel = () => sess?.outLevel?.() ?? 0          // громкость голоса Gemini — для персонажа (step.avatar)

// «Оценивать речь» во время разговора (20.11.2026): копится только свой голос (пока Gemini молчит); набралось ещё 20 с речи —
// в фоне оценка (Flash Lite, вся своя речь с начала, до последних 3 минут) — уровень уточняется; занято — следующая ждёт.
// После «Завершить» — полный отчёт последней оценки, ничего ждать не надо
const STEP = 20, MAX_SEC = 180
const evalOn = computed(() => tp.eval)
const recA = [], segs = ref([]), speechSec = ref(0)
let sentAt = 0, evBusy = false
const lastRep = computed(() => [...segs.value].reverse().find((x) => x.rep)?.rep ?? null)
function onRec(pcm, rms) {
  recA.push(pcm); if (rms > 0.015) speechSec.value += pcm.length / 16000
  if (speechSec.value - sentAt >= STEP) sendEval()
}
async function sendEval(final = false) {
  if (evBusy || !recA.length || (!final && speechSec.value - sentAt < STEP)) return
  evBusy = true; sentAt = speechSec.value
  const keep = recA.slice(-Math.round(MAX_SEC * 10)), { blob, sec: s2 } = wavOf(keep)
  const me = lines.value.filter((l) => l.role === 'me').map((l) => l.t).join(' '), them = lines.value.filter((l) => l.role === 'ai').map((l) => l.t).join('\n')
  const seg = { n: segs.value.length + 1, at: Math.round(speechSec.value), st: 'sent', rep: null, err: '' }
  segs.value.push(seg); const S = segs.value.at(-1)
  try { S.rep = await assessSpeech({ blob, sec: Math.max(s2, 20), transcript: me, context: them, lang: lang.value, prompt: cfg.value.evalPrompt, ask: cfg.value.evalAsk }); S.st = 'done' }          // промпт и сообщение оценки — из JSON экрана (evalPrompt, evalAsk)
  catch (e) { S.st = 'err'; S.err = e.message }
  finally { evBusy = false; if (speechSec.value - sentAt >= STEP) sendEval() }
}
function resetEval() { recA.length = 0; segs.value = []; speechSec.value = 0; sentAt = 0 }
function mute() { muted.value = !muted.value; sess?.mute(muted.value) }
onBeforeUnmount(() => { sess?.stop(); clearInterval(clock); clearTimeout(scT); delete tp.busy[props.step.id] })
const hasKeys = computed(() => ai.keys.length > 0)
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <ExText v-model="step.text" tag="p" class="tk" ph="Собеседование на Карту поляка: консул задаёт вопросы — отвечайте по-польски" multi>{{ step.text || 'Собеседование на Карту поляка: консул задаёт вопросы — отвечайте по-польски' }}</ExText>
    <div v-if="!p.edit" class="thd" @pointerdown.stop>          <!-- вверху (21.11.2026): голос и «Оценивать речь»; пока идёт разговор — не меняются -->
      <label class="ev" :class="{ off: busy }"><input type="checkbox" class="sw" :checked="evalOn" :disabled="busy" @change="setEval($event.target.checked)" />📊 Оценивать речь</label>
      <span v-if="ptt" class="lk" :title="`Язык закреплён: ${L.ru} — и для распознавания (Transcribe Live), и для ответа Gemini (lang в JSON экрана)`"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>{{ L.code }}</span>
      <label class="pill" :class="{ off: busy }" :title="editor ? 'Голос Gemini — пишется в экран (voice в JSON)' : 'Голос Gemini — из урока; выбор здесь — только на этот раз'">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></svg><span class="pv">{{ vShort }}</span>
        <select :value="vSel" :disabled="busy" aria-label="Голос" @change="onVoice($event.target.value)">
          <option v-if="!VOICES.some((x) => x[0] === voice)" :value="voice">{{ voice }} · из урока</option>
          <optgroup label="Женские"><option v-for="v in VOICES.filter((x) => x[1] === 'женский')" :key="v[0]" :value="v[0]">{{ vName(v[0]) }}{{ !editor && v[0] === voice ? ' · из урока' : '' }}</option></optgroup>
          <optgroup label="Мужские"><option v-for="v in VOICES.filter((x) => x[1] === 'мужской')" :key="v[0]" :value="v[0]">{{ vName(v[0]) }}{{ !editor && v[0] === voice ? ' · из урока' : '' }}</option></optgroup></select></label>
    </div>

    <template v-if="p.edit">
      <label class="tl">Роль Gemini <small>видит только ИИ · пусто — консул на Карту поляка</small></label>
      <textarea class="tp" :value="step.prompt || ''" :placeholder="defPrompt" rows="6" spellcheck="false" @pointerdown.stop @keydown.stop @input="setF('prompt', $event.target.value)" />
      <div class="trow" @pointerdown.stop>
        <label>Голос <select :value="voice" @change="setF('voice', $event.target.value === 'Kore' ? '' : $event.target.value)"><option v-for="v in VOICES" :key="v[0]" :value="v[0]">{{ v[0] }} · {{ v[1] === 'женский' ? '♀' : '♂' }} {{ v[2] }}</option></select></label>
        <label>Модель <select :value="lessonModel" @change="setF('model', $event.target.value)"><option value="">авто{{ models[0] ? ' · ' + liveName(models[0]) : '' }}</option><option v-for="m in models" :key="m" :value="m">{{ liveName(m) }}{{ think(m) ? ' — думает дольше' : '' }}</option></select></label>
      </div>
      <p class="tn">Речь уходит в модель сырым звуком (без распознавания браузером), язык закреплён. Разговор идёт ключами Gemini из профиля того, кто открыл урок (Live API, без лимита запросов). Лучше в наушниках. Все настройки модели (замок языка, первая реплика, пауза, температура, шумодав) — в JSON экрана, кнопка «{ }».</p>
    </template>

    <div v-else class="tv" :class="st" @pointerdown.stop>
      <TalkAvatar v-if="step.avatar" :state="st" :out="outLevel" :inp="muted ? 0 : level" />
      <div class="tc">
        <button v-if="st !== 'live' && st !== 'connecting'" type="button" class="go" :disabled="!hasKeys" @click="start"><img v-if="icon" :src="icon" alt="" />{{ st === 'ended' ? 'Поговорить ещё раз' : 'Начать разговор' }}</button>
        <div v-else-if="ptt" class="pt" :class="pt">          <!-- рация: одна большая кнопка — нажал, говоришь, нажал — отправил -->
          <button type="button" class="pr" @click="stop">Завершить</button>
          <button type="button" class="pb" :style="{ '--l': level }" :disabled="st !== 'live'" :aria-label="pt === 'talk' ? 'Отправить реплику' : 'Нажмите и говорите'" @click="pttStart">
            <svg v-if="pt === 'talk'" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
          </button>
          <span class="pi">{{ st === 'live' ? sec : '' }}</span>
          <p class="pc"><b>{{ st === 'connecting' ? 'Подключаюсь к Gemini…' : pt === 'talk' ? 'Говорите' : pt === 'wait' ? 'Gemini отвечает' : 'Нажмите и говорите' }}</b>
            <small>{{ st === 'connecting' ? '' : pt === 'talk' ? 'нажмите ещё раз — реплика уйдёт в Gemini' : pt === 'wait' ? 'нажмите — перебить и сказать своё' : 'нажмите ещё раз — Gemini ответит' }}<template v-if="note"> · {{ note }}</template></small></p>
        </div>
        <template v-else>
          <span class="orb" :style="{ '--l': level }"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg></span>
          <div class="ts"><b>{{ st === 'connecting' ? 'Подключаюсь к Gemini…' : muted ? 'Микрофон выключен' : 'Говорите — Gemini слушает' }}</b><small v-if="st === 'live'">{{ sec }} · {{ liveName(used) }} · {{ usedV }}<template v-if="note"> · {{ note }}</template></small></div>
          <button v-if="st === 'live'" type="button" class="sm" :class="{ on: muted }" @click="mute">{{ muted ? 'Включить микрофон' : 'Пауза' }}</button>
          <button type="button" class="sm red" @click="stop">Завершить</button>
        </template>
      </div>
      <div v-if="evalOn && (st === 'live' || segs.length)" class="evb">
        <div class="evh"><b v-if="lastRep" class="lv">≈ {{ lastRep.level }}{{ lastRep.plus ? '+' : '' }}</b><span v-if="lastRep">понятность {{ lastRep.intelligibility }}%</span>
          <small>ваша речь: {{ Math.round(speechSec) }} с<template v-if="!segs.length"> · первая оценка — после {{ STEP }} с</template></small></div>
        <div v-if="segs.length" class="evs"><span v-for="g in segs" :key="g.n" class="sg" :class="g.st" :title="g.err">#{{ g.n }} · {{ g.st === 'sent' ? 'отправлено…' : g.st === 'err' ? 'ошибка' : `${g.rep.level}${g.rep.plus ? '+' : ''} · ${g.rep.mistakes.length} ош.` }}</span></div>
      </div>
      <SpeechReport v-if="evalOn && st === 'ended' && lastRep" :report="lastRep" bare />
      <p v-if="!hasKeys" class="er">Нужен ключ Gemini — добавьте его в профиле, раздел «Ключи Gemini».</p>
      <p v-if="err" class="er">{{ err }}</p>
      <div v-if="lines.length" class="txw">
        <div ref="box" class="tx" :class="{ sc: scrolling }" @scroll.passive="onScroll">
          <div v-for="(l, i) in lines" :key="i" class="b" :class="[l.role, { dr: l.draft }]"><small v-if="l.draft" class="bl">Transcribe Live пишет…</small>{{ l.t || (l.draft ? '…' : '') }}<small v-if="l.warn" class="bw">⚠ {{ l.warn }}</small></div>
        </div>
        <button v-if="!atEnd" type="button" class="tdn" aria-label="Вниз, к новым репликам" @click="toEnd()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
      </div>
    </div>
  </template>
  <!-- подвал (21.11.2026): модель — «таблеткой» слева от «Продолжить»; пока идёт разговор — не меняется (голос — вверху) -->
  <div v-else-if="part === 'fb' && !p.edit" class="tf" @pointerdown.stop>
    <label v-if="models.length" class="pill" :class="{ off: tp.busy[step.id] }" :title="editor ? 'Модель разговора — пишется в экран (model в JSON)' : 'Модель разговора — из урока; выбор здесь — только на этот раз'">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /></svg><span class="pv">{{ pickName }}</span>
      <select :value="pick || lessonModel" :disabled="tp.busy[step.id]" aria-label="Модель" @change="onModel($event.target.value)"><option value="">авто · {{ liveName(models[0]) }}{{ !editor && !lessonModel ? ' · из урока' : '' }}</option><option v-if="lessonModel && !models.includes(lessonModel)" :value="lessonModel">{{ liveName(lessonModel) }} · из урока</option><option v-for="m in models" :key="m" :value="m">{{ liveName(m) }}{{ !editor && m === lessonModel ? ' · из урока' : '' }}{{ think(m) ? ' — думает дольше, отвечает с паузой' : '' }}</option></select></label>
  </div>
</template>

<style scoped>
.tk { margin: 0 0 10px; font-size: 15px; font-weight: 600; line-height: 1.45; color: var(--text) }
.tl { display: block; margin: 4px 0 4px; font-size: 12px; font-weight: 800; color: var(--hint) } .tl small { font-weight: 600; margin-left: 4px }
.tp { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); font: 12.5px/1.45 var(--font); resize: vertical }
.trow { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0 4px } .trow label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--hint) }
.trow select { max-width: 190px; height: 30px; padding: 0 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; font-size: 12px }
.tn { margin: 4px 0 0; font-size: 11.5px; font-weight: 600; color: var(--hint) }
.tv { display: grid; gap: 10px }
.ev { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--text); cursor: pointer }
.thd { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 12px; margin: -4px 0 8px }          /* вверху под заданием: «Оценивать речь» слева, голос справа */
.ev.off { opacity: .5; cursor: default }
/* «таблетки» (21.11.2026): голос — вверху, модель — в подвале */
.tf { display: flex; gap: 6px; min-width: 0 }          /* в одну строку: таблетка — по ширине своей надписи */
.pill { position: relative; flex: 0 1 auto; display: inline-flex; align-items: center; min-width: 0; height: 30px; padding: 0 22px 0 9px; border: 1px solid #d6e4fb; border-radius: 15px; background: #f3f7ff; color: #2f6fe0; cursor: pointer }
.pill::after { content: ''; position: absolute; right: 10px; top: 11px; width: 5px; height: 5px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); pointer-events: none }
.pill svg { flex: none; width: 13px; height: 13px; margin-right: 4px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
.pill .pv { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; font-weight: 800 }
.pill select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; font-size: 16px; cursor: pointer }          /* список — прозрачный поверх таблетки: ширина не зависит от длинных пунктов */
.pill:focus-within { box-shadow: 0 0 0 2px rgba(47, 111, 224, .35) } .pill.off { opacity: .5; cursor: default } .pill.off select { cursor: default }
.evb { display: grid; gap: 6px; padding: 8px 12px; border-radius: 12px; background: rgba(75, 141, 248, .07) }
.evh { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap } .evh .lv { font-size: 18px; color: #2f6fe0 } .evh span { font-size: 13px; font-weight: 700 } .evh small { font-size: 12px; color: var(--hint) }
.evs { display: flex; flex-wrap: wrap; gap: 4px } .sg { padding: 2px 8px; border-radius: 8px; background: var(--card); font-size: 11.5px; font-weight: 700; color: var(--hint) }
.sg.sent { color: #2f6fe0 } .sg.done { color: #1f7a4f } .sg.err { color: #b3261e }
.tc { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 10px 12px; border-radius: 16px; background: var(--surface) }
.go { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; height: 48px; border: 0; border-radius: 14px; background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff; font: inherit; font-size: 16px; font-weight: 800; cursor: pointer }
.go img { width: 22px; height: 22px; background: #fff; border-radius: 6px; padding: 2px } .go:disabled { opacity: .45; cursor: not-allowed }
.orb { --l: 0; flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: #4b8df8; color: #fff; box-shadow: 0 0 0 calc(var(--l) * 14px) rgba(75, 141, 248, .25); transition: box-shadow .08s }
.connecting .orb { background: #9bbcf5; animation: pl 1s ease-in-out infinite } @keyframes pl { 50% { opacity: .5 } }
.orb svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round }
.ts { flex: 1; min-width: 0; display: flex; flex-direction: column } .ts b { font-size: 14px } .ts small { font-size: 12px; color: var(--hint); font-variant-numeric: tabular-nums }
.sm { flex: none; height: 34px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--card); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .sm.on { background: #fff4d6 } .sm.red { color: var(--red-d) }
.er { margin: 0; font-size: 13px; font-weight: 700; color: var(--red-d) }
.txw { position: relative }
/* рация (21.11.2026) */
.tc:has(.pt) { padding: 12px 10px } .pt { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px 10px }
.pr { justify-self: start; height: 34px; padding: 0 12px; border: 1px solid #f1c7c7; border-radius: 17px; background: var(--card); color: #c0392b; font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer }
.pi { justify-self: end; font-size: 12px; font-weight: 700; color: var(--hint); font-variant-numeric: tabular-nums }
.pb { --l: 0; width: 76px; height: 76px; display: grid; place-items: center; border: 0; border-radius: 50%; background: linear-gradient(135deg, #4b8df8, #a35cf0); color: #fff; box-shadow: 0 6px 18px rgba(91, 108, 240, .35); cursor: pointer; transition: background .2s, box-shadow .15s; touch-action: manipulation }
.pb svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round } .pb:disabled { opacity: .5; cursor: default }
.pt.talk .pb { background: #e5484d; box-shadow: 0 0 0 calc(6px + var(--l) * 14px) rgba(229, 72, 77, .18), 0 0 0 calc(14px + var(--l) * 24px) rgba(229, 72, 77, .07) }
.pt.wait .pb { background: #eef1f6; color: #6b7a99; box-shadow: none }
.pc { grid-column: 1 / -1; margin: 0; text-align: center; font-size: 14px } .pc small { display: block; font-size: 12px; font-weight: 700; color: var(--hint) } .pt.talk .pc b { color: #c0392b }
.b.dr { background: #f2fbe9; border: 1.5px dashed #9ad07a; color: #4f7a3c } .bl { display: block; font-size: 10.5px; font-weight: 800; letter-spacing: .3px; text-transform: uppercase; color: #5aa33a }
.bw { display: block; margin-top: 3px; font-size: 11.5px; font-weight: 800; color: #c0392b }
.lk { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 9px; border-radius: 13px; background: #fff1f1; color: #c0392b; font-size: 11.5px; font-weight: 900 } .lk svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round }
.tx { display: flex; flex-direction: column; gap: 5px; max-height: max(340px, 52vh); overflow-y: auto; overscroll-behavior: contain; padding: 14px 6px 4px 2px;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 18px); mask-image: linear-gradient(to bottom, transparent 0, #000 18px);          /* верх растворяется */
  scrollbar-width: thin; scrollbar-color: transparent transparent; transition: scrollbar-color .3s }
.tx:hover, .tx.sc { scrollbar-color: rgba(0, 0, 0, .28) transparent }          /* полоска — только пока мышь над чатом или его крутят */
.tx::-webkit-scrollbar { width: 6px } .tx::-webkit-scrollbar-track { background: transparent } .tx::-webkit-scrollbar-thumb { border-radius: 3px; background: transparent }
.tx:hover::-webkit-scrollbar-thumb, .tx.sc::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, .28) }
.tdn { position: absolute; right: 10px; bottom: 8px; width: 38px; height: 38px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--card); color: var(--hint); box-shadow: 0 2px 8px rgba(0, 0, 0, .18); cursor: pointer; animation: tdn .18s ease-out }
.tdn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round } .tdn:hover { color: var(--text) }
@keyframes tdn { from { opacity: 0; transform: scale(.8) } } @media (prefers-reduced-motion: reduce) { .tdn { animation: none } }
.b { max-width: 82%; padding: 7px 11px; border-radius: 14px; font-size: 14px; line-height: 1.4; white-space: pre-wrap }
.b.ai { align-self: flex-start; background: rgba(75, 141, 248, .12); border-bottom-left-radius: 4px }
.b.me { align-self: flex-end; background: var(--green-l, #d7ffb8); border-bottom-right-radius: 4px }
</style>

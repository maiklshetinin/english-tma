<script setup>
// «Разговор с Gemini» (20.11.2026, эксперимент): живой голосовой диалог на компьютере — Live API, ключи из профиля (utils/live.js).
// По умолчанию — собеседование на Карту поляка: Gemini — консул, спрашивает по-польски, ученик отвечает голосом.
// В правке: что делает ученик (text), роль Gemini (prompt — видит только ИИ), голос и модель. Ход разговора — расшифровка пузырями.
// Без оценки: «Продолжить» доступна сразу (как у «Подсказки»).
// Всё, что уходит в Live-модель (язык, замок языка, первая реплика, пауза, чувствительность, температура, шумодав), — в JSON экрана
// (кнопка «{ }»), умолчания — defaults.ts (talkCfg); в экране хранятся только отличия (20.11.2026).
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExText from '../parts/ExText.vue'
import { usePlay, useEdit } from '../ctx'
import { startTalk, liveModels, liveName, firstKey } from '../../utils/live'
import { ai } from '../../utils/gemini'
import { aiIcon } from '../../utils/ai'
import { VOICES } from '../../utils/tts'
import SpeechReport from '../../components/SpeechReport.vue'
import { assessSpeech, wavOf } from '../../utils/speech'
import J from './talk.json'
import { LANGS, LOCK, OPENER, DEF_PROMPT, talkCfg, talkSystem } from './defaults'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const icon = aiIcon('Gemini')

// модели и голос — в правке; модели — из ключа
const cfg = computed(() => talkCfg(props.step))          // действующие настройки: свои поля экрана поверх умолчаний
const models = ref([]), voice = computed(() => cfg.value.voice)
const lessonModel = computed(() => (cfg.value.model === 'auto' ? '' : cfg.value.model))          // 'auto' — самая свежая Live-модель ключа
onMounted(async () => { const k = firstKey(); if (k) models.value = await liveModels(k) })
// модель перед разговором (20.11.2026): в прохождении — свой выбор (запоминается в браузере), по умолчанию — из правки или самая свежая
const PK = 'tma.live.pick'
const pick = ref((() => { try { return localStorage.getItem(PK) || '' } catch { return '' } })())
// голос перед разговором — так же: свой выбор в браузере, по умолчанию — из правки (20.11.2026)
const VK = 'tma.live.voice'
const vpick = ref((() => { try { return localStorage.getItem(VK) || '' } catch { return '' } })())
function setVPick(v) { vpick.value = v; try { if (v) localStorage.setItem(VK, v); else localStorage.removeItem(VK) } catch { /* */ } }
const vName = (n) => { const v = VOICES.find((x) => x[0] === n); return v ? `${v[0]} · ${v[1] === 'женский' ? '♀' : '♂'} ${v[2]}` : n }
function setPick(v) { pick.value = v; try { if (v) localStorage.setItem(PK, v); else localStorage.removeItem(PK) } catch { /* */ } }
const think = (m) => /think/i.test(m)
// язык разговора: расшифровка и голос закреплены, перед ролью — «замок» (LOCK): иначе Live-модель сама угадывает язык
// и с акцентом «слышит» русский (20.11.2026). Перед разговором ученик может выбрать другой язык (запоминается в браузере, как в «Транскрипции»)
const base = computed(() => cfg.value.lang)
const LGK = 'tma.talk.lang'
const mine = ref((() => { try { return localStorage.getItem(LGK) || '' } catch { return '' } })())
const lang = computed(() => (LANGS[mine.value] ? mine.value : base.value))
function pickLang(v) { if (st.value === 'live' || st.value === 'connecting') return
  mine.value = v === base.value ? '' : v; try { if (mine.value) localStorage.setItem(LGK, v); else localStorage.removeItem(LGK) } catch { /* */ } }
function setF(k, v) { if (v) props.step[k] = v; else delete props.step[k]; ed.changed() }

// разговор
const used = ref(''), usedV = ref(''), st = ref('idle'), err = ref(''), note = ref(''), lines = ref([]), level = ref(0), muted = ref(false), t0 = ref(0), now = ref(0)
let sess = null, clock = 0
const box = ref(null)
const sec = computed(() => { const s = Math.max(0, Math.round((now.value - t0.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
function push(role, chunk) {
  const last = lines.value.at(-1)
  if (last && last.role === role && !last.closed) last.t += chunk; else lines.value.push({ role, t: chunk.replace(/^\s+/, ''), closed: false })
  nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
}
async function start() {
  if (st.value === 'connecting' || st.value === 'live') return
  err.value = ''; note.value = ''; lines.value = []; resetEval()
  const key = firstKey()
  if (!key) { err.value = 'Нужен ключ Gemini — добавьте его в профиле, раздел «Ключи Gemini»'; return }
  let m = pick.value || lessonModel.value
  if (!m) { const l = await liveModels(key); m = l[0] }
  used.value = m
  if (!m) { err.value = 'Google не дал этому ключу ни одной Live-модели'; return }
  usedV.value = vpick.value || voice.value
  const c = cfg.value, l = lang.value, own = l === c.lang          // язык выбран не как в уроке — замок и первая реплика этого языка
  sess = startTalk({ key, model: m, voice: usedV.value, lang: l, system: talkSystem({ lock: own ? c.lock : LOCK[l], prompt: c.prompt }), opener: own ? c.opener : OPENER[l],
    silenceMs: c.silenceMs, endSens: c.endSens, temperature: c.temperature, noiseSuppression: c.noiseSuppression, rec: evalOn.value ? onRec : null, on: {
    state: (s, info) => {
      if (s === 'live' && info) { note.value = info; return }
      st.value = s === 'error' ? 'ended' : s
      if (s === 'error') err.value = info
      if (s === 'live') { t0.value = now.value = Date.now(); clearInterval(clock); clock = setInterval(() => { now.value = Date.now() }, 500) }
      if (s === 'ended' || s === 'error') { clearInterval(clock); level.value = 0; sess = null; if (evalOn.value && speechSec.value - sentAt >= 8) sendEval(true) }          // хвост речи — последней оценкой
    },
    text: (role, t) => push(role, t),
    turn: () => { const l = lines.value.at(-1); if (l) l.closed = true },
    level: (v) => { level.value = level.value * 0.6 + v * 0.4 },
  } })
  st.value = 'connecting'
}
function stop() { sess?.stop() }

// «Оценивать речь» во время разговора (20.11.2026): копится только свой голос (пока Gemini молчит); набралось ещё 20 с речи —
// в фоне оценка (Flash Lite, вся своя речь с начала, до последних 3 минут) — уровень уточняется; занято — следующая ждёт.
// После «Завершить» — полный отчёт последней оценки, ничего ждать не надо
const EK = 'tma.talk.eval', STEP = 20, MAX_SEC = 180
const evalOn = ref((() => { try { return localStorage.getItem(EK) === '1' } catch { return false } })())
function setEval(v) { evalOn.value = v; try { localStorage.setItem(EK, v ? '1' : '0') } catch { /* */ } }
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
  try { S.rep = await assessSpeech({ blob, sec: Math.max(s2, 20), transcript: me, context: them, lang: lang.value }); S.st = 'done' }
  catch (e) { S.st = 'err'; S.err = e.message }
  finally { evBusy = false; if (speechSec.value - sentAt >= STEP) sendEval() }
}
function resetEval() { recA.length = 0; segs.value = []; speechSec.value = 0; sentAt = 0 }
function mute() { muted.value = !muted.value; sess?.mute(muted.value) }
onBeforeUnmount(() => { sess?.stop(); clearInterval(clock) })
const hasKeys = computed(() => ai.keys.length > 0)
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <ExText v-model="step.text" tag="p" class="tk" ph="Собеседование на Карту поляка: консул задаёт вопросы — отвечайте по-польски" multi>{{ step.text || 'Собеседование на Карту поляка: консул задаёт вопросы — отвечайте по-польски' }}</ExText>

    <template v-if="p.edit">
      <label class="tl">Роль Gemini <small>видит только ИИ · пусто — консул на Карту поляка</small></label>
      <textarea class="tp" :value="step.prompt || ''" :placeholder="DEF_PROMPT" rows="6" spellcheck="false" @pointerdown.stop @keydown.stop @input="setF('prompt', $event.target.value)" />
      <div class="trow" @pointerdown.stop>
        <label>Голос <select :value="voice" @change="setF('voice', $event.target.value === 'Kore' ? '' : $event.target.value)"><option v-for="v in VOICES" :key="v[0]" :value="v[0]">{{ v[0] }} · {{ v[1] === 'женский' ? '♀' : '♂' }} {{ v[2] }}</option></select></label>
        <label>Язык <select :value="base" @change="setF('lang', $event.target.value === 'pl-PL' ? '' : $event.target.value)"><option v-for="(t, k) in LANGS" :key="k" :value="k">{{ t }}</option></select></label>
        <label>Модель <select :value="lessonModel" @change="setF('model', $event.target.value)"><option value="">авто{{ models[0] ? ' · ' + liveName(models[0]) : '' }}</option><option v-for="m in models" :key="m" :value="m">{{ liveName(m) }}{{ think(m) ? ' — думает дольше' : '' }}</option></select></label>
      </div>
      <p class="tn">Речь уходит в модель сырым звуком (без распознавания браузером), язык закреплён. Разговор идёт ключами Gemini из профиля того, кто открыл урок (Live API, без лимита запросов). Лучше в наушниках. Все настройки модели (замок языка, первая реплика, пауза, температура, шумодав) — в JSON экрана, кнопка «{ }».</p>
    </template>

    <div v-else class="tv" :class="st" @pointerdown.stop>
      <div v-if="st !== 'live' && st !== 'connecting'" class="tm">
        <label v-if="models.length">Модель <select :value="pick" @change="setPick($event.target.value)"><option value="">{{ lessonModel ? liveName(lessonModel) + ' (из урока)' : 'авто · ' + liveName(models[0]) }}</option><option v-for="m in models" :key="m" :value="m">{{ liveName(m) }}{{ think(m) ? ' — думает дольше, отвечает с паузой' : '' }}</option></select></label>
        <label>Голос <select :value="vpick" @change="setVPick($event.target.value)"><option value="">{{ vName(voice) }}{{ step.voice && step.voice !== 'Kore' ? ' (из урока)' : '' }}</option>
          <optgroup label="Женские"><option v-for="v in VOICES.filter((x) => x[1] === 'женский')" :key="v[0]" :value="v[0]">{{ vName(v[0]) }}</option></optgroup>
          <optgroup label="Мужские"><option v-for="v in VOICES.filter((x) => x[1] === 'мужской')" :key="v[0]" :value="v[0]">{{ vName(v[0]) }}</option></optgroup></select></label>
        <label>Язык <select :value="lang" @change="pickLang($event.target.value)"><option v-for="(t, k) in LANGS" :key="k" :value="k">{{ t }}{{ k === base ? ' (из урока)' : '' }}</option></select></label>
        <label class="ev"><input type="checkbox" class="sw" :checked="evalOn" @change="setEval($event.target.checked)" />📊 Оценивать речь</label>
      </div>
      <div class="tc">
        <button v-if="st !== 'live' && st !== 'connecting'" type="button" class="go" :disabled="!hasKeys" @click="start"><img v-if="icon" :src="icon" alt="" />{{ st === 'ended' ? 'Поговорить ещё раз' : 'Начать разговор' }}</button>
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
      <div v-if="lines.length" ref="box" class="tx">
        <div v-for="(l, i) in lines" :key="i" class="b" :class="l.role">{{ l.t }}</div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.tk { margin: 0 0 10px; font-size: 15px; font-weight: 600; line-height: 1.45; color: var(--text) }
.tl { display: block; margin: 4px 0 4px; font-size: 12px; font-weight: 800; color: var(--hint) } .tl small { font-weight: 600; margin-left: 4px }
.tp { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); font: 12.5px/1.45 var(--font); resize: vertical }
.trow { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0 4px } .trow label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--hint) }
.trow select { max-width: 190px; height: 30px; padding: 0 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; font-size: 12px }
.tn { margin: 4px 0 0; font-size: 11.5px; font-weight: 600; color: var(--hint) }
.tv { display: grid; gap: 10px }
.tm { display: flex; align-items: center; gap: 10px; flex-wrap: wrap } .tm label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--hint) } .tm small { font-size: 12px; color: var(--hint) }
.tm select { max-width: 260px; height: 30px; padding: 0 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; font-size: 12px }
.ev { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text); cursor: pointer }
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
.tx { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow: auto; padding: 2px }
.b { max-width: 85%; padding: 8px 12px; border-radius: 14px; font-size: 14px; line-height: 1.4; white-space: pre-wrap }
.b.ai { align-self: flex-start; background: rgba(75, 141, 248, .12); border-bottom-left-radius: 4px }
.b.me { align-self: flex-end; background: var(--green-l, #d7ffb8); border-bottom-right-radius: 4px }
</style>

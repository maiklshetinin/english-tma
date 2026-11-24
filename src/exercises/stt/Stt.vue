<script setup>
// «Транскрипция» (20.11.2026, эксперимент): говорите — Gemini 3.5 Transcribe Live пишет текстом, что услышал.
// Звук сырой, без распознавания браузером; язык закреплён (pl-PL / en-US). Серый курсив — черновик, пока говорят,
// после паузы — готовый кусок. Ключи — из профиля (utils/live.js). Без оценки: «Продолжить» сразу.
import { ref, computed, onBeforeUnmount, nextTick } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExText from '../parts/ExText.vue'
import { usePlay, useEdit } from '../ctx'
import { startTranscribe, sttModel, firstKey, liveName } from '../../utils/live'
import { ai } from '../../utils/gemini'
import { aiIcon } from '../../utils/ai'
import SpeechReport from '../../components/SpeechReport.vue'
import J from './stt.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const icon = aiIcon('Gemini')
// языки (20.11.2026): по умолчанию — из правки урока, в прохождении можно переключить (запоминается в браузере); три языка: польский, английский, испанский
const LANGS = { 'pl-PL': 'Польский', 'en-US': 'Английский', 'es-ES': 'Испанский' }
const SHORT = { 'pl-PL': 'PL', 'en-US': 'EN', 'es-ES': 'ES' }
const base = computed(() => 'pl-PL')          // 24.11.2026: тип pl-stt — язык только польский, выбора нет
const LK = 'tma.stt.lang'
const mine = ref((() => { try { return localStorage.getItem(LK) || '' } catch { return '' } })())
const lang = computed(() => base.value)
function pickLang(v) { if (st.value === 'live' || st.value === 'connecting') return; if (v !== lang.value && rec.value.length) { fin.value = []; draft.value = ''; rec.value = [] }          // другой язык — запись заново
  mine.value = v === base.value ? '' : v; try { if (mine.value) localStorage.setItem(LK, v); else localStorage.removeItem(LK) } catch { /* */ } }
function setLang(v) { if (v === 'pl-PL') delete props.step.lang; else props.step.lang = v; ed.changed() }

const st = ref('idle'), err = ref(''), note = ref(''), fin = ref([]), draft = ref(''), level = ref(0), used = ref(''), t0 = ref(0), now = ref(0)
let sess = null, clock = 0
const rec = ref([])          // звук диктовки — для «Теста речи» (копится и при «Говорить дальше», «Очистить» — сначала)
const box = ref(null)
const sec = computed(() => { const s = Math.max(0, Math.round((now.value - t0.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
const text = computed(() => fin.value.join(' ').replace(/\s+/g, ' ').trim())
const scroll = () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
async function start() {
  if (st.value === 'connecting' || st.value === 'live') return
  err.value = ''; note.value = ''; draft.value = ''
  const key = firstKey()
  if (!key) { err.value = 'Нужен ключ Gemini — добавьте его в профиле, раздел «Ключи Gemini»'; return }
  st.value = 'connecting'
  used.value = await sttModel(key)
  sess = startTranscribe({ key, model: used.value, rec: rec.value, lang: lang.value, on: {
    state: (s, info) => {
      if (s === 'live' && info) { note.value = info; return }
      st.value = s === 'error' ? 'ended' : s
      if (s === 'error') err.value = info
      if (s === 'live') { t0.value = now.value = Date.now(); clearInterval(clock); clock = setInterval(() => { now.value = Date.now() }, 500) }
      if (s === 'ended' || s === 'error') { clearInterval(clock); level.value = 0; sess = null; if (draft.value.trim()) { fin.value.push(draft.value.trim()); draft.value = '' } }
    },
    interim: (t) => { draft.value = t; scroll() },
    final: (t) => { fin.value.push(t.trim()); draft.value = ''; scroll() },
    level: (v) => { level.value = level.value * 0.6 + v * 0.4 },
  } })
}
function stop() { sess?.stop() }
function clear() { fin.value = []; draft.value = ''; rec.value = [] }
async function copy() { try { await navigator.clipboard.writeText(text.value); note.value = 'текст скопирован' } catch { /* */ } }
onBeforeUnmount(() => { sess?.stop(); clearInterval(clock) })
const hasKeys = computed(() => ai.keys.length > 0)
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <ExText v-model="step.text" tag="p" class="sk" ph="Например: расскажите о себе по-польски — 3–4 предложения" multi>{{ step.text || 'Скажите что-нибудь по-польски' }}</ExText>

    <div v-if="p.edit" class="srow" @pointerdown.stop>
      <span class="sn">Язык — польский (тип pl-stt)</span>
      <p class="sn">Речь уходит в Gemini 3.5 Transcribe Live сырым звуком, ключами из профиля. До 10 минут подряд.</p>
    </div>

    <div v-else class="sv" :class="st" @pointerdown.stop>
      <div v-if="false" class="sl" role="radiogroup" aria-label="Язык речи">
        <button v-for="(t, k) in SHORT" :key="k" type="button" role="radio" :aria-checked="lang === k" class="lc" :class="{ on: lang === k }" :disabled="st === 'live' || st === 'connecting'" :title="LANGS[k] + (k === base ? ' — язык урока' : '')" @click="pickLang(k)">{{ t }}</button>
      </div>
      <div class="sc">
        <button v-if="st !== 'live' && st !== 'connecting'" type="button" class="go" :disabled="!hasKeys" @click="start"><img v-if="icon" :src="icon" alt="" />{{ text ? 'Говорить дальше' : 'Начать — говорите' }}</button>
        <template v-else>
          <span class="orb" :style="{ '--l': level }"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg></span>
          <div class="ss"><b>{{ st === 'connecting' ? 'Подключаюсь…' : 'Говорите — Gemini записывает' }}</b><small v-if="st === 'live'">{{ sec }} · {{ liveName(used) }} · {{ LANGS[lang] }}<template v-if="note"> · {{ note }}</template></small></div>
          <button type="button" class="sm red" @click="stop">Стоп</button>
        </template>
      </div>
      <p v-if="!hasKeys" class="er">Нужен ключ Gemini — добавьте его в профиле, раздел «Ключи Gemini».</p>
      <p v-if="err" class="er">{{ err }}</p>
      <div v-if="text || draft" ref="box" class="out"><span>{{ text }}</span> <i v-if="draft">{{ draft }}</i></div>
      <SpeechReport v-if="text && st !== 'live' && st !== 'connecting'" :chunks="rec" :transcript="text" :lang="lang" />
      <div v-if="text && st !== 'live' && st !== 'connecting'" class="sb"><button type="button" class="sm" @click="copy">Копировать</button><button type="button" class="sm" @click="clear">Очистить</button><small v-if="note">{{ note }}</small></div>
    </div>
  </template>
</template>

<style scoped>
.sk { margin: 0 0 10px; font-size: 15px; font-weight: 600; line-height: 1.45; color: var(--text) }
.srow { display: grid; gap: 6px } .srow label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--hint) }
.srow select { height: 30px; padding: 0 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; font-size: 12px }
.sn { margin: 0; font-size: 11.5px; font-weight: 600; color: var(--hint) }
.sv { display: grid; gap: 10px }
.sl { display: flex; flex-wrap: wrap; gap: 6px }
.lc { min-width: 40px; height: 30px; padding: 0 10px; border: 1.5px solid var(--border); border-radius: 15px; background: var(--card); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer }
.lc.on { border-color: #4b8df8; background: rgba(75, 141, 248, .12); color: #2f6fe0 } .lc:disabled:not(.on) { opacity: .4; cursor: default }
.sc { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 10px 12px; border-radius: 16px; background: var(--surface) }
.go { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; height: 48px; border: 0; border-radius: 14px; background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff; font: inherit; font-size: 16px; font-weight: 800; cursor: pointer }
.go img { width: 22px; height: 22px; background: #fff; border-radius: 6px; padding: 2px } .go:disabled { opacity: .45; cursor: not-allowed }
.orb { --l: 0; flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: #4b8df8; color: #fff; box-shadow: 0 0 0 calc(var(--l) * 14px) rgba(75, 141, 248, .25); transition: box-shadow .08s }
.connecting .orb { background: #9bbcf5; animation: pl 1s ease-in-out infinite } @keyframes pl { 50% { opacity: .5 } }
.orb svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round }
.ss { flex: 1; min-width: 0; display: flex; flex-direction: column } .ss b { font-size: 14px } .ss small { font-size: 12px; color: var(--hint); font-variant-numeric: tabular-nums }
.sm { flex: none; height: 34px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .sc .sm { background: var(--card) } .sm.red { color: var(--red-d) }
.er { margin: 0; font-size: 13px; font-weight: 700; color: var(--red-d) }
.out { max-height: 320px; overflow: auto; padding: 12px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); font-size: 17px; line-height: 1.55; white-space: pre-wrap }
.out i { color: var(--hint); font-style: italic }
.sb { display: flex; align-items: center; gap: 8px } .sb small { font-size: 12px; color: var(--hint) }
</style>

<script setup>
// Окно озвучки Gemini (20.11.2026) — только в редакторе курса. Затемнение, текст (можно поправить), голос, «Озвучить» —
// и видно, что происходит: какой ключ пробуется, сколько секунд ждём. Готово — послушать, «Ещё раз» или «Сохранить в экран».
// Запрос — ключами преподавателя из профиля (utils/tts.js), прямо из браузера.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import AudioPill from './AudioPill.vue'
import { VOICES, getVoice, setVoice, speak } from '../utils/tts'
import { ai } from '../utils/gemini'
import { aiIcon } from '../utils/ai'

const props = defineProps({ text: { type: String, default: '' }, what: { type: String, default: 'вопрос' } })
const emit = defineEmits(['close', 'save'])
const txt = ref(props.text), voice = ref(getVoice())
const st = ref('idle')                 // idle | busy | done | err
const err = ref(null), step = ref(null), res = ref(null), url = ref(''), t0 = ref(0), now = ref(0)
let ac = null, tm = 0
const sec = computed(() => ((now.value - t0.value) / 1000).toFixed(1).replace('.', ','))
const took = ref('')
const icon = aiIcon('Gemini')
const noKeys = computed(() => !ai.keys.length)

function pickVoice(v) { voice.value = v; setVoice(v) }
async function go() {
  if (st.value === 'busy' || !txt.value.trim()) return
  st.value = 'busy'; err.value = null; step.value = null; t0.value = now.value = Date.now()
  tm = setInterval(() => { now.value = Date.now() }, 100)
  ac = new AbortController()
  try {
    const r = await speak(txt.value, voice.value, { signal: ac.signal, onStep: (x) => { step.value = x } })
    if (url.value) URL.revokeObjectURL(url.value)
    res.value = { ...r, voice: voice.value }; url.value = URL.createObjectURL(r.blob); took.value = sec.value; st.value = 'done'
  } catch (e) {
    if (e.cancel) { st.value = res.value ? 'done' : 'idle'; return }
    err.value = e; st.value = 'err'
  } finally { clearInterval(tm); ac = null }
}
function stop() { ac?.abort() }
function save() {
  if (!res.value) return
  const f = new File([res.value.blob], `tts_${voice.value}_${Date.now().toString(36)}.wav`, { type: 'audio/wav' })
  emit('save', f); close(true)
}
function close(force = false) { if (st.value === 'busy' && force !== true) return; emit('close') }
const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (st.value === 'busy') stop(); else close() } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey, true); clearInterval(tm); ac?.abort(); if (url.value) URL.revokeObjectURL(url.value) })
const dur = computed(() => (res.value ? res.value.sec.toFixed(1).replace('.', ',') + ' с' : ''))
</script>

<template>
  <Teleport to="body">
    <div class="tts-bg" @pointerdown.self="close" @keydown.stop @paste.stop @wheel.stop>
      <div class="tts" role="dialog" aria-modal="true" aria-label="Озвучка Gemini">
        <header>
          <img v-if="icon" :src="icon" alt="" /><b>Озвучить {{ what }}</b>
          <button type="button" class="x" title="Закрыть" :disabled="st === 'busy'" @click="close">✕</button>
        </header>

        <label class="lb" for="tts-t">Текст</label>
        <textarea id="tts-t" v-model="txt" rows="3" :readonly="st === 'busy'" spellcheck="false" />

        <div class="lb">Голос</div>
        <div class="vs">
          <button v-for="v in VOICES" :key="v[0]" type="button" class="v" :class="{ on: voice === v[0] }" :disabled="st === 'busy'" @click="pickVoice(v[0])">
            <b>{{ v[0] }}</b><small>{{ v[1] === 'женский' ? '♀' : '♂' }} {{ v[2] }}</small>
          </button>
        </div>

        <div v-if="noKeys" class="msg bad">Нет ключей Gemini. Добавьте ключ в профиле — раздел «Ключи Gemini», и вернитесь сюда.</div>

        <div v-if="st === 'busy'" class="prog">
          <span class="spin" /><div><b>Gemini озвучивает… {{ sec }} с</b>
            <small v-if="step">ключ {{ step.key }}<template v-if="step.n > 1"> · {{ step.i + 1 }} из {{ step.n }}</template></small></div>
          <button type="button" class="ghost" @click="stop">Остановить</button>
          <i class="bar" />
        </div>
        <div v-else-if="st === 'err'" class="msg bad"><b>Не получилось.</b> {{ err?.message }}</div>
        <div v-if="res && st !== 'busy'" class="out">
          <AudioPill :key="url" :src="url" autoplay />
          <small>{{ dur }} · голос {{ res.voice }} · ответ за {{ took }} с · ключ {{ res.key }}</small>
        </div>

        <footer>
          <button v-if="res && st !== 'busy'" type="button" class="ghost" :disabled="noKeys" @click="go">Ещё раз</button>
          <button v-else type="button" class="pri" :disabled="st === 'busy' || noKeys || !txt.trim()" @click="go">{{ st === 'err' ? 'Попробовать ещё раз' : 'Озвучить' }}</button>
          <button v-if="res && st !== 'busy'" type="button" class="pri" @click="save">Сохранить в экран</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tts-bg { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 16px; background: rgba(10, 14, 20, .5); backdrop-filter: blur(2px) }
.tts { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box; padding: 18px 20px 16px; border-radius: 18px; background: var(--card, #fff); color: var(--text, #1a1a1a); box-shadow: 0 20px 60px rgba(0, 0, 0, .3); font-family: var(--font, system-ui) }
header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px }
header img { width: 22px; height: 22px }
header b { flex: 1; font-size: 17px }
.x { border: 0; background: none; color: var(--hint, #888); font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 8px }
.x:hover:not(:disabled) { background: var(--surface, #f1f1f1) }
.lb { display: block; margin: 0 0 6px; font-size: 12px; font-weight: 700; color: var(--hint, #777); text-transform: uppercase; letter-spacing: .04em }
textarea { width: 100%; box-sizing: border-box; margin-bottom: 14px; padding: 10px 12px; border: 1px solid var(--border, #e3e3e3); border-radius: 12px; background: var(--bg, #fff); color: inherit; font: inherit; font-size: 15px; line-height: 1.45; resize: vertical }
textarea:focus { outline: none; border-color: #4b8df8; box-shadow: 0 0 0 3px rgba(75, 141, 248, .18) }
.vs { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 6px; margin-bottom: 14px }
.v { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 7px 10px; border: 1.5px solid var(--border, #e3e3e3); border-radius: 10px; background: none; color: inherit; font: inherit; cursor: pointer; text-align: left }
.v b { font-size: 13px } .v small { font-size: 11px; color: var(--hint, #888) }
.v:hover:not(:disabled) { border-color: #9bbcf5 }
.v.on { border-color: #4b8df8; background: rgba(75, 141, 248, .1) }
.prog { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(75, 141, 248, .1); overflow: hidden; margin-bottom: 12px }
.prog > div { flex: 1; display: flex; flex-direction: column } .prog small { color: var(--hint, #777); font-size: 12px }
.prog b { font-variant-numeric: tabular-nums }
.spin { width: 18px; height: 18px; flex: none; border: 2.5px solid #4b8df8; border-right-color: transparent; border-radius: 50%; animation: s .7s linear infinite }
.bar { position: absolute; left: 0; bottom: 0; height: 3px; width: 35%; background: linear-gradient(90deg, #4b8df8, #a35cf0); animation: b 1.4s ease-in-out infinite }
@keyframes s { to { transform: rotate(360deg) } }
@keyframes b { from { left: -35% } to { left: 100% } }
.msg { padding: 10px 14px; border-radius: 12px; font-size: 14px; margin-bottom: 12px; line-height: 1.4 }
.msg.bad { background: rgba(224, 70, 70, .1); color: #c53030 }
.out { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px }
.out small { color: var(--hint, #777); font-size: 12px }
footer { display: flex; justify-content: flex-end; gap: 8px }
.pri, .ghost { height: 40px; padding: 0 18px; border: 0; border-radius: 12px; font: inherit; font-weight: 700; cursor: pointer }
.pri { background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff }
.ghost { background: var(--surface, #f1f1f1); color: inherit }
.pri:disabled, .ghost:disabled { opacity: .45; cursor: not-allowed }
</style>

<script setup>
// Выбор голоса плашками (20.11.2026): женские / мужские, у каждой ▶ — образец голоса. Образец озвучивается один раз (1 запрос)
// и хранится в браузере (utils/tts.js, отдельно для модели и языка — PL / EN) — дальше играет бесплатно. Синяя ▶ — уже сохранён.
// Тот же вид, что в окне одиночной озвучки (TtsDialog). v-model — имя голоса; model — для какой модели образцы.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { VOICES, speak, SAMPLES, getSampleLang, setSampleLang, sampleGet, samplePut, sampleKeys, modelName } from '../utils/tts'
const props = defineProps({ modelValue: { type: String, required: true }, model: { type: String, required: true }, text: { type: String, default: '' }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const GROUPS = [['Женские', VOICES.filter((v) => v[1] === 'женский')], ['Мужские', VOICES.filter((v) => v[1] === 'мужской')]]
const lang = ref(getSampleLang(props.text)), saved = ref(new Set()), busy = ref(''), on = ref(''), err = ref('')
const phrase = computed(() => SAMPLES[lang.value]), key = computed(() => phrase.value + '|' + props.model)
const load = () => sampleKeys(key.value).then((v) => { saved.value = new Set(v) })
onMounted(load); watch(key, load)
let au = null
function setLang(l) { if (busy.value) return; au?.pause(); lang.value = l; setSampleLang(l) }
async function sample(v) {
  if (busy.value || props.disabled) return
  if (on.value === v) { au?.pause(); return }
  au?.pause(); err.value = ''
  const k = key.value
  let b = await sampleGet(v, k)
  if (!b) {
    busy.value = v
    try { b = (await speak(phrase.value, v, { model: props.model })).blob; await samplePut(v, b, k); if (k === key.value) saved.value = new Set([...saved.value, v]) }
    catch (e) { err.value = e.message; return } finally { busy.value = '' }
  }
  const u = URL.createObjectURL(b); au = new Audio(u); on.value = v
  au.onended = au.onpause = () => { if (on.value === v) on.value = ''; URL.revokeObjectURL(u) }
  au.play().catch(() => { on.value = '' })
}
onBeforeUnmount(() => au?.pause())
</script>

<template>
  <div class="vpk">
    <div class="vhd"><span>Голос</span><span class="smp">▶ образцы {{ modelName(model) }} · {{ saved.size }} из 10 ·<button v-for="(t, l) in { pl: 'PL', en: 'EN' }" :key="l" type="button" class="lg" :class="{ on: lang === l }" :title="SAMPLES[l]" @click="setLang(l)">{{ t }}</button></span></div>
    <div class="vg2">
      <div v-for="[g, list] in GROUPS" :key="g" class="vgrp">
        <div class="vgl">{{ g }}</div>
        <div class="vs">
          <div v-for="v in list" :key="v[0]" class="v" :class="{ on: modelValue === v[0] }">
            <button type="button" class="vn" :disabled="disabled" @click="emit('update:modelValue', v[0])"><b>{{ v[0] }}</b><small>{{ v[2] }}</small></button>
            <button type="button" class="vp" :class="{ has: saved.has(v[0]), play: on === v[0] }" :disabled="disabled || (!!busy && busy !== v[0])"
              :title="saved.has(v[0]) ? 'Образец — из браузера, квоту не тратит' : 'Образец — озвучить один раз (1 запрос), дальше бесплатно'" @click="sample(v[0])">
              <span v-if="busy === v[0]" class="spin" /><svg v-else-if="on === v[0]" viewBox="0 0 24 24"><rect x="7" y="6" width="3.5" height="12" rx="1" /><rect x="13.5" y="6" width="3.5" height="12" rx="1" /></svg><svg v-else viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    <p v-if="err" class="er">{{ err }}</p>
  </div>
</template>

<style scoped>
.vpk { display: grid; gap: 6px }
.vhd { display: flex; align-items: baseline; gap: 10px; font-size: 12px; font-weight: 700; color: var(--hint, #777) }
.smp { font-size: 11px; font-weight: 600 } .lg { margin-left: 4px; padding: 1px 6px; border: 1px solid var(--border, #ddd); border-radius: 6px; background: none; color: inherit; font: inherit; font-size: 10px; font-weight: 700; cursor: pointer } .lg.on { border-color: #4b8df8; background: rgba(75, 141, 248, .12); color: #2f6fe0 }
.vg2 { display: grid; grid-template-columns: 4fr 6fr; gap: 14px }
.vgl { margin-bottom: 4px; font-size: 11px; font-weight: 800; color: var(--hint, #888); text-transform: uppercase; letter-spacing: .04em }
.vs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px } .vgrp:last-child .vs { grid-template-columns: repeat(3, minmax(0, 1fr)) }
.v { display: flex; align-items: stretch; min-width: 0; border: 1px solid var(--border, #e3e3e3); border-radius: 9px; overflow: hidden }
.v.on { border-color: #4b8df8; box-shadow: inset 0 0 0 1px #4b8df8; background: rgba(75, 141, 248, .08) }
.vn { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 5px 4px 5px 9px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-align: left }
.vn b { font-size: 13px } .vn small { font-size: 11px; color: var(--hint, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100% }
.vp { flex: none; width: 26px; display: grid; place-items: center; padding: 0; border: 0; background: none; color: #b5b5b5; cursor: pointer }
.vp svg { width: 13px; height: 13px; fill: currentColor } .vp.has { color: #4b8df8 } .vp.play { color: #2f6fe0 } .vp:hover:not(:disabled) { background: rgba(75, 141, 248, .12) } .vp:disabled { opacity: .35; cursor: default }
.spin { width: 11px; height: 11px; border: 2px solid #4b8df8; border-right-color: transparent; border-radius: 50%; animation: s .7s linear infinite } @keyframes s { to { transform: rotate(360deg) } }
.er { margin: 0; font-size: 12.5px; font-weight: 700; color: #c53030 }
@media (max-width: 640px) { .vg2 { grid-template-columns: 1fr } }
</style>

<script setup>
// Голосовое сообщение «как в Telegram» (21.11.2026, «Ответ по смыслу · целым аудио»): ▶, волна, длительность — запись можно
// переслушать; внизу — что с ней: ⏱ уходит в Gemini → ✓✓ распознано (сколько ждали) или ошибка с «Повторить».
import { ref, computed, onBeforeUnmount, watch } from 'vue'
const props = defineProps({
  url: { type: String, required: true }, peaks: { type: Array, default: () => [] }, sec: { type: Number, default: 0 },
  status: { type: String, default: 'sending' },          // sending | done | error | live (24.11.2026, рация · голосовые: голос ушёл в Gemini Live, без распознавания)
  via: { type: String, default: '' },          // подпись под голосовым вместо «целым аудио → модель»
  model: { type: String, default: '' }, ms: { type: Number, default: 0 }, err: { type: String, default: '' },
})
const emit = defineEmits(['retry'])
const playing = ref(false), pos = ref(0)
let au = null, raf = 0
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const shown = computed(() => fmt(playing.value ? pos.value * props.sec : props.sec))
function tick() { if (!au) return; pos.value = au.duration ? au.currentTime / au.duration : 0; raf = requestAnimationFrame(tick) }
function stop() { au?.pause(); cancelAnimationFrame(raf); au = null; playing.value = false; pos.value = 0 }
function toggle() {
  if (playing.value) return stop()
  au = new Audio(props.url); au.onended = stop
  au.play().then(() => { playing.value = true; tick() }).catch(stop)
}
watch(() => props.url, stop)
onBeforeUnmount(stop)
</script>

<template>
  <div class="vn" :class="status" @pointerdown.stop>
    <button type="button" class="vp" :aria-label="playing ? 'Пауза' : 'Переслушать запись'" @click="toggle">
      <svg v-if="!playing" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5h3v14h-3zM13.5 5h3v14h-3z" /></svg>
    </button>
    <div class="vb">
      <div class="vw" aria-hidden="true"><i v-for="(h, i) in peaks" :key="i" :class="{ on: playing && i / peaks.length < pos }" :style="{ height: Math.round(4 + h * 18) + 'px' }" /></div>
      <div class="vm">
        <span>{{ shown }}</span>
        <span class="vs" aria-live="polite">
          <template v-if="status === 'sending'"><svg class="clk" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>отправляю в Gemini<b class="dots"><i>.</i><i>.</i><i>.</i></b></template>
          <template v-else-if="status === 'done'"><svg class="tk" viewBox="0 0 28 24" aria-hidden="true"><path d="M2 13l5 5L18 6M11 16l2 2L24 6" /></svg>распознано{{ ms ? ' · ' + (ms / 1000).toFixed(1).replace('.', ',') + ' с' : '' }}</template>
          <template v-else-if="status === 'live'"><svg class="tk" viewBox="0 0 28 24" aria-hidden="true"><path d="M2 13l5 5L18 6M11 16l2 2L24 6" /></svg>услышала {{ model || 'Gemini' }}</template>
          <template v-else><b class="ex">!</b>не распознано · <button type="button" class="rt" @click="emit('retry')">Повторить</button></template>
        </span>
      </div>
      <p v-if="status === 'error' && err" class="ve">{{ err }}</p>
      <p class="vc">{{ via || 'целым аудио → ' + (model || 'Gemini Flash Lite') }}</p>
    </div>
  </div>
</template>

<style scoped>
.vn { align-self: flex-end; display: flex; align-items: flex-start; gap: 10px; width: min(330px, 100%); box-sizing: border-box; margin: 0 0 8px auto; padding: 8px 12px 6px 8px; border-radius: 16px 16px 4px 16px; background: #e3fbd0; color: #2f5a1f; box-shadow: 0 1px 1px rgba(0, 0, 0, .08); animation: vin .2s ease-out }
.vp { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: #5bb75b; color: #fff; cursor: pointer }
.vp svg { width: 20px; height: 20px; fill: currentColor } .vp:focus-visible { outline: 2px solid #2f6fe0; outline-offset: 2px }
.vb { min-width: 0; flex: 1 }
.vw { display: flex; align-items: center; gap: 2px; height: 24px; margin-top: 2px }
.vw i { flex: 1; min-width: 2px; max-width: 3px; border-radius: 2px; background: rgba(91, 183, 91, .45) } .vw i.on { background: #3d9a3d }
.vm { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px; font-size: 11.5px; font-weight: 700; color: #4f8a3c }
.vs { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap }
.clk { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; animation: spin 2s linear infinite }
.tk { width: 17px; height: 13px; fill: none; stroke: #3d9a3d; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round }
.dots i { font-style: normal; animation: dot 1.2s infinite } .dots i:nth-child(2) { animation-delay: .2s } .dots i:nth-child(3) { animation-delay: .4s }
.ex { display: inline-grid; place-items: center; width: 14px; height: 14px; border-radius: 50%; background: #d93025; color: #fff; font-size: 10px }
.rt { padding: 0; border: 0; background: none; color: #2f6fe0; font: inherit; font-weight: 800; cursor: pointer; text-decoration: underline }
.ve { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: #b3261e }
.vc { margin: 3px 0 0; font-size: 11px; font-weight: 600; color: #6f9a5f }
.vn.error { background: #fdecea; color: #7a271a } .vn.error .vp { background: #d98a80 } .vn.error .vm, .vn.error .vc { color: #a5503f }
@keyframes vin { from { opacity: 0; transform: translateY(6px) scale(.97) } }
@keyframes spin { to { transform: rotate(360deg) } } @keyframes dot { 0%, 100% { opacity: .2 } 40% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .vn, .clk, .dots i { animation: none } }
</style>

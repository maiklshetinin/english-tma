<script setup>
// Персонаж над «Разговором с Gemini» (шаблон «Разговор с персонажем», 20.11.2026, тест): Lottie-стикер public/talk/avatar.tgs
// (Telegram-стикер = Lottie JSON в gzip). Рот — два слоя стикера: «mouth 3» (открыт) и «mouth_close» (закрыт); их анимацию
// прозрачности убираем и сами показываем нужный: пока идёт разговор — по громкости голоса Gemini (out() — utils/live.js outLevel),
// до и после разговора — как в стикере («hi», рот открыт на кадрах 9–89). Подключение — анимация медленнее.
// Не загрузился (нет файла, старый браузер без DecompressionStream) — персонажа просто нет, разговор работает.
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
const props = defineProps({ state: { type: String, default: 'idle' }, out: { type: Function, default: null } })
const box = ref(null), ok = ref(true)
const SRC = import.meta.env.BASE_URL + 'talk/avatar.tgs'
const OPEN = 'mouth 3', CLOSE = 'mouth_close', HI = [9, 89]          // слои рта и кадры «hi» с открытым ртом
let anim = null, raf = 0, mo = null, mc = null, lvl = 0, open = null, dead = false

async function load() {
  if (typeof DecompressionStream === 'undefined' || typeof fetch === 'undefined') throw new Error('нет распаковки')
  const r = await fetch(SRC); if (!r.ok || !r.body) throw new Error('нет файла')
  const data = JSON.parse(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text())
  for (const l of data.layers ?? []) if (l.nm === OPEN || l.nm === CLOSE) { l.ks.o = { a: 0, k: 100 }; l.cl = l.nm === OPEN ? 'ava-mo' : 'ava-mc' }          // рот — наш; class — чтобы найти в SVG
  const { default: lottie } = await import('lottie-web/build/player/lottie_light')
  if (dead) return
  anim = lottie.loadAnimation({ container: box.value, renderer: 'svg', loop: true, autoplay: true, animationData: data, rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } })
  anim.addEventListener('DOMLoaded', () => { mo = box.value?.querySelector('.ava-mo'); mc = box.value?.querySelector('.ava-mc'); speed(); tick() })
}
function mouth(v) { if (v === open) return; open = v; if (mo) mo.style.display = v ? '' : 'none'; if (mc) mc.style.display = v ? 'none' : '' }
function tick() {
  if (dead || !anim) return
  if (props.state === 'live' && props.out) {
    lvl = lvl * 0.5 + (props.out() || 0) * 0.5
    mouth(open ? lvl > 0.04 : lvl > 0.1)          // гистерезис — рот не дрожит на тихих звуках
  } else { const f = anim.currentFrame; mouth(f >= HI[0] && f < HI[1]) }
  raf = requestAnimationFrame(tick)
}
const speed = () => anim?.setSpeed(props.state === 'connecting' ? 0.5 : 1)
watch(() => props.state, speed)
onMounted(() => { load().catch(() => { ok.value = false }) })
onBeforeUnmount(() => { dead = true; cancelAnimationFrame(raf); anim?.destroy() })
</script>

<template>
  <div v-if="ok" ref="box" class="ava" :class="state" aria-hidden="true" />
</template>

<style scoped>
.ava { width: 168px; height: 168px; margin: 0 auto -4px; pointer-events: none }
.ava.connecting { opacity: .75; transition: opacity .3s }
</style>

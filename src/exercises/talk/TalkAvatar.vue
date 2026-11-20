<script setup>
// Персонаж над «Разговором с Gemini» (шаблон «Разговор с персонажем», 20.11.2026, тест): Lottie-стикер public/talk/avatar.tgs
// (Telegram-стикер = Lottie JSON в gzip). Стикер подготовлен (Claude, 20.11.2026): оба рта «заморожены» — открытый (форма кадра 50)
// и закрытый (кадра 104), у слоёв class ava-mo / ava-mc — их показываем сами на любом кадре. Демо поведения — артефакт «Персонаж для
// «Разговора с Gemini» — демо».
// Состояния (сами, по разговору): в начале — «привет» (машет, кадры 0–90), потом спокойная поза (кадр 100) и «дыхание»;
// подключение — «думает» (рука к волосам, кадры 100→120); говорит Gemini — рот по громкости её голоса (out() — utils/live.js outLevel)
// и покачивание в такт; говорит ученик (inp — громкость микрофона) — наклон головы, «слушает»; после «Завершить» — машет «пока».
// Не загрузился (нет файла, старый браузер без DecompressionStream) — персонажа просто нет, разговор работает.
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
const props = defineProps({ state: { type: String, default: 'idle' }, out: { type: Function, default: null }, inp: { type: Number, default: 0 } })
const box = ref(null), wrap = ref(null), ok = ref(true), mode = ref('hi')
const SRC = import.meta.env.BASE_URL + 'talk/avatar.tgs'
const CALM = 100, THINK = [100, 120], HI = [0, 90], MOUTH_HI = [12, 84]          // кадры стикера
let anim = null, raf = 0, mo = null, mc = null, lvl = 0, open = null, dead = false, talkAt = 0, listenAt = 0

async function load() {
  if (typeof DecompressionStream === 'undefined' || typeof fetch === 'undefined') throw new Error('нет распаковки')
  const r = await fetch(SRC); if (!r.ok || !r.body) throw new Error('нет файла')
  const data = JSON.parse(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text())
  const { default: lottie } = await import('lottie-web/build/player/lottie_light')
  if (dead) return
  anim = lottie.loadAnimation({ container: box.value, renderer: 'svg', loop: false, autoplay: false, animationData: data, rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } })
  anim.addEventListener('DOMLoaded', () => { mo = box.value?.querySelector('.ava-mo'); mc = box.value?.querySelector('.ava-mc'); mouth(false); go(props.state === 'connecting' ? 'think' : 'hi'); tick() })
  anim.addEventListener('complete', () => { if (mode.value === 'hi' || mode.value === 'bye') go('idle') })
}
/** Спокойная поза: сначала сбросить кусок анимации — иначе lottie считает кадр от его начала (после «думает» персонаж пропадал) */
const calm = () => { anim.resetSegments(true); anim.goToAndStop(CALM, true) }
function mouth(v) { if (v === open) return; open = v; if (mo) mo.style.display = v ? '' : 'none'; if (mc) mc.style.display = v ? 'none' : '' }
/** Перейти в состояние: hi / bye — машет один раз; think — рука к волосам; idle / talk / listen — спокойная поза */
function go(m) {
  if (!anim || m === mode.value && m !== 'hi' && m !== 'bye') return
  const prev = mode.value; mode.value = m
  if (m === 'hi' || m === 'bye') anim.playSegments(HI, true)
  else if (m === 'think') anim.playSegments(THINK, true)
  else if (prev === 'think') anim.playSegments([THINK[1], CALM], true)          // из «думает» рука плавно возвращается
  else if (prev === 'hi' || prev === 'bye') { if (anim.isPaused) calm() }          // дождётся конца взмаха
  else calm()
}
function tick() {
  if (dead || !anim) return
  const now = performance.now()
  if (props.state === 'live') {
    lvl = lvl * 0.45 + (props.out?.() || 0) * 0.55
    if (lvl > 0.12) talkAt = now
    if (props.inp > 0.12) listenAt = now
    const want = now - talkAt < 600 ? 'talk' : now - listenAt < 900 ? 'listen' : 'idle'          // паузы короче — состояние держится, не дёргается
    if (mode.value !== 'hi' || anim.isPaused) go(want)
  } else lvl = 0
  if (mode.value === 'talk') mouth(open ? lvl > 0.06 : lvl > 0.14)          // гистерезис — рот не дрожит на тихих звуках
  else if (mode.value === 'hi' || mode.value === 'bye') { const f = anim.currentFrame + HI[0]; mouth(f >= MOUTH_HI[0] && f < MOUTH_HI[1]) }
  else mouth(false)
  if (wrap.value) wrap.value.style.transform = mode.value === 'talk' ? `translateY(${-lvl * 5}px) rotate(${(lvl - 0.3) * 2}deg)` : ''
  raf = requestAnimationFrame(tick)
}
watch(() => props.state, (s, was) => {
  if (s === 'connecting') go('think')
  else if (s === 'live') go('idle')
  else if (was === 'live' || was === 'connecting') go('bye')          // «Завершить» — машет на прощание
})
onMounted(() => { load().catch(() => { ok.value = false }) })
onBeforeUnmount(() => { dead = true; cancelAnimationFrame(raf); anim?.destroy() })
</script>

<template>
  <div v-if="ok" class="avw"><div ref="wrap" class="avb"><div ref="box" class="ava" :class="mode" aria-hidden="true" /></div></div>
</template>

<style scoped>
.avw { display: grid; place-items: center; margin-bottom: -4px; pointer-events: none }
.avb { animation: br 3.6s ease-in-out infinite } @keyframes br { 50% { translate: 0 -2px; scale: 1.012 } }
.ava { width: 180px; height: 180px; transition: transform .35s ease }
.ava.listen { transform: rotate(-4deg) translateX(-6px) }
.ava.think { transform: rotate(2deg) translateY(-3px) }
@media (prefers-reduced-motion: reduce) { .avb { animation: none } }
</style>

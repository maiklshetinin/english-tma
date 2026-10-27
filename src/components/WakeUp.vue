<script setup>
// Экран ожидания при входе. Бесплатный сервер на Render засыпает и просыпается до ~30 секунд —
// вместо голого спиннера показываем «сервер-соню»: сначала спит (летят Z), через несколько секунд открывает глаза.
// Под ним сменяются шутливые фразы и английские выражения «пока ждём», внизу — полоска к ~30 секундам.
// Появляется не сразу (через delay мс), чтобы при быстром ответе ничего не мелькало.
import { computed, onMounted, onUnmounted, ref } from 'vue'
const props = defineProps({ delay: { type: Number, default: 1000 } })

const LINES = [
  { t: 'Будим сервер — он любит поспать 😴' },
  { t: 'Пока ждём:', en: 'wake up', ru: 'просыпаться' },
  { t: 'Сервер потягивается и ищет тапочки…' },
  { t: 'Пока ждём:', en: 'rise and shine!', ru: 'подъём, солнышко!' },
  { t: 'Наливаем серверу кофе ☕' },
  { t: 'Пока ждём:', en: 'sleepyhead', ru: 'соня' },
  { t: 'Ещё чуть-чуть! Бесплатный сервер просыпается до 30 секунд' },
  { t: 'Пока ждём:', en: 'just a sec', ru: 'секундочку' },
  { t: 'Почти проснулся — уже открыл один глаз 👀' },
  { t: 'Пока ждём:', en: 'better late than never', ru: 'лучше поздно, чем никогда' },
]
const shown = ref(false), sec = ref(0)
let t0 = 0, timer = 0, showTimer = 0
onMounted(() => {
  t0 = Date.now()
  showTimer = window.setTimeout(() => { shown.value = true }, props.delay)
  timer = window.setInterval(() => { sec.value = Math.floor((Date.now() - t0) / 1000) }, 250)
})
onUnmounted(() => { clearTimeout(showTimer); clearInterval(timer) })
const awake = computed(() => sec.value >= 7)                                 // через 7 с соня открывает глаза
const line = computed(() => LINES[Math.floor(sec.value / 3.5) % LINES.length])
const pct = computed(() => Math.min(96, Math.round(100 * (1 - Math.exp(-sec.value / 14)))))   // быстро в начале, к 30 с — почти полная
</script>

<template>
  <div class="wake" role="status" aria-live="polite">
    <div v-if="!shown" class="spin" aria-label="Загрузка" />
    <template v-else>
      <div class="hero" :class="{ awake }">
        <span class="z z1">Z</span><span class="z z2">z</span><span class="z z3">z</span>
        <svg class="blob" viewBox="0 0 120 110" aria-hidden="true">
          <ellipse cx="60" cy="102" rx="38" ry="6" class="shadow" />
          <g class="body">
            <path d="M18 62c0-28 18-48 42-48s42 20 42 48c0 22-14 34-42 34S18 84 18 62z" class="skin-d" transform="translate(0 5)" />
            <path d="M18 62c0-28 18-48 42-48s42 20 42 48c0 22-14 34-42 34S18 84 18 62z" class="skin" />
            <ellipse cx="44" cy="40" rx="9" ry="5" class="shine" transform="rotate(-25 44 40)" />
            <g class="eyes-closed"><path d="M38 60q7 6 14 0" /><path d="M68 60q7 6 14 0" /></g>
            <g class="eyes-open"><circle cx="45" cy="58" r="8" class="white" /><circle cx="75" cy="58" r="8" class="white" /><circle cx="47" cy="59" r="4" class="pupil" /><circle cx="77" cy="59" r="4" class="pupil" /></g>
            <ellipse cx="34" cy="72" rx="6" ry="3.5" class="cheek" /><ellipse cx="86" cy="72" rx="6" ry="3.5" class="cheek" />
            <path d="M54 76q6 5 12 0" class="mouth" />
            <path d="M44 16c4-10 14-12 22-6" class="cap" />
          </g>
        </svg>
      </div>
      <h3>{{ awake ? 'Сервер просыпается…' : 'Сервер спит' }}</h3>
      <Transition name="fade" mode="out-in">
        <p :key="line.t + (line.en || '')" class="line">{{ line.t }}<template v-if="line.en"> <b class="en">{{ line.en }}</b> — {{ line.ru }}</template></p>
      </Transition>
      <div class="bar" aria-hidden="true"><i :style="{ width: pct + '%' }" /></div>
      <small class="hint">{{ sec < 30 ? `${sec} с` : 'Дольше обычного — проверьте интернет' }}</small>
    </template>
  </div>
</template>

<style scoped>
.wake { min-height: 70vh; display: grid; place-content: center; justify-items: center; gap: 10px; max-width: 340px; margin: 0 auto; padding: 24px 16px; text-align: center }
.spin { width: 40px; height: 40px; border-radius: 50%; border: 5px solid var(--border); border-top-color: var(--green); animation: r .8s linear infinite }
@keyframes r { to { transform: rotate(360deg) } }
h3 { margin: 4px 0 0; font-size: 22px; font-weight: 900 }
.line { margin: 0; min-height: 44px; color: var(--hint); font-size: 15px; font-weight: 700 }
.en { color: var(--blue); font-weight: 900 }
.bar { width: 220px; height: 14px; border-radius: 99px; background: var(--border); overflow: hidden }
.bar i { display: block; height: 100%; border-radius: 99px; background: var(--green); box-shadow: inset 0 -4px 0 var(--green-d), inset 0 4px 0 rgba(255, 255, 255, .25); transition: width .25s ease-out }
.hint { color: var(--hint-2); font-weight: 800 }

/* Персонаж: дышит во сне, после пробуждения подпрыгивает и моргает */
.hero { position: relative; width: 150px; height: 140px }
.blob { width: 150px; height: 140px; overflow: visible }
.skin { fill: var(--green) } .skin-d { fill: var(--green-d) } .shine { fill: rgba(255, 255, 255, .35) } .shadow { fill: rgba(0, 0, 0, .08) }
.cheek { fill: #ff6fae; opacity: .75 } .white { fill: #fff } .pupil { fill: #3c3c3c }
.eyes-closed path, .mouth, .cap { fill: none; stroke: #2b5b00; stroke-width: 4; stroke-linecap: round }
.cap { stroke: var(--green-d); stroke-width: 6 }
.body { transform-origin: 60px 96px; animation: breathe 2.6s ease-in-out infinite }
@keyframes breathe { 50% { transform: scale(1.04, .96) } }
.eyes-open { display: none }
.awake .eyes-closed { display: none } .awake .eyes-open { display: inline; animation: blink 3.2s infinite; transform-origin: 60px 58px }
.awake .body { animation: hop .9s cubic-bezier(.3, 1.6, .5, 1) infinite alternate }
@keyframes hop { from { transform: translateY(0) scale(1.03, .97) } to { transform: translateY(-10px) scale(.98, 1.02) } }
@keyframes blink { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
.z { position: absolute; top: 18px; right: 22px; font-weight: 900; color: var(--blue); opacity: 0; animation: zz 2.4s ease-out infinite }
.z1 { font-size: 22px } .z2 { font-size: 17px; animation-delay: .8s } .z3 { font-size: 13px; animation-delay: 1.6s }
@keyframes zz { 0% { opacity: 0; transform: translate(0, 0) } 20% { opacity: 1 } 100% { opacity: 0; transform: translate(26px, -40px) rotate(12deg) } }
.awake .z { display: none }
.fade-enter-active, .fade-leave-active { transition: opacity .25s, transform .25s } .fade-enter-from { opacity: 0; transform: translateY(6px) } .fade-leave-to { opacity: 0; transform: translateY(-6px) }
</style>

<script setup>
// Нагрузка недели — маленький «спидометр» рядом с переключателем недель.
//  • Стрелка и число — часы уроков выбранной недели (урок = 1 час; группа — тоже 1; отменённый всеми учениками не считается).
//  • Зоны шкалы — от вашей нормы часов в неделю: до 80% — зелёная («Комфортно»), до 100% — оранжевая («Плотно»), выше — красная («Риск выгорания»).
//  • Нажатие — маленькое меню: состояние и «Моя норма» − / + (запоминается на этом устройстве).
import { computed, onMounted, onUnmounted, ref } from 'vue'
const props = defineProps({
  lessons: { type: Array, required: true },       // уроки (из расписания)
  dates: { type: Array, required: true },         // 7 дат недели
  activeOf: { type: Function, required: true },   // (урок) → true, если урок состоится (не отменён всеми учениками)
})

const NORM_KEY = 'tutor.weeklyNorm'
const readNorm = () => { try { const n = Number(localStorage.getItem(NORM_KEY)); return n >= 5 && n <= 60 ? n : 25 } catch { return 25 } }
const norm = ref(readNorm())
const setNorm = (n) => { norm.value = Math.max(5, Math.min(60, n)); try { localStorage.setItem(NORM_KEY, String(norm.value)) } catch { /* не запомним */ } }

const hours = computed(() => props.lessons.filter(l => props.dates.includes(l.date) && props.activeOf(l)).length)
const max = computed(() => Math.max(Math.ceil(norm.value * 1.5 / 5) * 5, Math.ceil((hours.value + 2) / 5) * 5))
const zone = computed(() => (hours.value > norm.value ? 'bad' : hours.value > norm.value * 0.8 ? 'warn' : 'ok'))
const ZONE = { ok: 'Комфортно', warn: 'Плотно', bad: 'Риск выгорания' }

// Мини-шкала: полукруг радиусом 30
const R = 30, CX = 40, CY = 38
const pt = (v) => { const a = Math.PI * (1 - Math.min(v, max.value) / max.value); return [CX + R * Math.cos(a), CY - R * Math.sin(a)] }
const arc = (from, to) => { const [x1, y1] = pt(from), [x2, y2] = pt(to); return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}` }
const shown = ref(0)
onMounted(() => requestAnimationFrame(() => { shown.value = 1 }))
const angle = computed(() => -90 + 180 * Math.min(hours.value * shown.value, max.value) / max.value)

// Меню с нормой: открывается нажатием, закрывается кликом мимо
const open = ref(false), root = ref(null)
const outside = (e) => { if (open.value && root.value && !root.value.contains(e.target)) open.value = false }
onMounted(() => document.addEventListener('pointerdown', outside))
onUnmounted(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <div ref="root" class="wl" :class="zone">
    <button class="g" :aria-expanded="open" :title="`Нагрузка: ${hours} ч из нормы ${norm} — ${ZONE[zone]}`" @click="open = !open">
      <svg viewBox="0 0 80 44" aria-hidden="true">
        <path :d="arc(0, max)" class="track" />
        <path :d="arc(0, norm * 0.8)" class="z ok" /><path :d="arc(norm * 0.8, norm)" class="z warn" /><path :d="arc(norm, max)" class="z bad" />
        <g class="needle" :style="{ transform: `rotate(${angle}deg)` }"><path d="M40 13 L42 38 L38 38 Z" /><circle cx="40" cy="38" r="4" /></g>
      </svg>
      <span class="v"><b>{{ hours }}</b> ч</span>
    </button>
    <div v-if="open" class="pop" role="dialog" aria-label="Нагрузка недели">
      <div class="st"><b>{{ hours }} ч</b> из {{ norm }} — <span class="zn">{{ ZONE[zone] }}</span></div>
      <div class="norm"><span>Моя норма</span><button aria-label="Меньше" @click="setNorm(norm - 1)">−</button><b>{{ norm }} ч</b><button aria-label="Больше" @click="setNorm(norm + 1)">+</button></div>
    </div>
  </div>
</template>

<style scoped>
.wl { position: relative; flex: none }
.g { display: flex; align-items: center; gap: 4px; padding: 2px 8px 2px 4px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: var(--text); font: inherit; cursor: pointer }
.g:hover { border-color: var(--hint-2) }
.g svg { width: 58px; height: 32px; overflow: visible }
.track { fill: none; stroke: var(--border); stroke-width: 7 }
.z { fill: none; stroke-width: 7 } .z.ok { stroke: var(--green) } .z.warn { stroke: var(--orange) } .z.bad { stroke: var(--red) }
.needle { transform-origin: 40px 38px; transition: transform .9s cubic-bezier(.3, 1.5, .5, 1) } .needle path, .needle circle { fill: var(--text) }
.v { font-size: 12px; font-weight: 800; color: var(--hint); white-space: nowrap } .v b { font-size: 18px; font-weight: 900 }
.ok .v b { color: var(--green-d) } .warn .v b { color: var(--orange-d) } .bad .v b { color: var(--red-d) }
.pop { position: absolute; z-index: 30; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); display: grid; gap: 8px; padding: 10px 12px; min-width: 210px;
  background: var(--card); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 10px 24px rgba(0, 0, 0, .14); font-size: 13px; font-weight: 700; color: var(--hint) }
.st b { color: var(--text) } .ok .zn { color: var(--green-d) } .warn .zn { color: var(--orange-d) } .bad .zn { color: var(--red-d) }
.norm { display: flex; align-items: center; gap: 8px; white-space: nowrap }
.norm button { width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 9px; background: var(--card); color: var(--text); font: inherit; font-size: 16px; line-height: 1; cursor: pointer }
.norm b { color: var(--text); min-width: 40px; text-align: center }
</style>

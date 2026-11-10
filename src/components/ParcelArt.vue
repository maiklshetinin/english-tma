<script setup>
// Картинки посылок: кто несёт (chute — парашют, crane — кран, bird — аист; flap — машет крыльями) и что несёт
// (chest — сундук, mail — конверт, note — записка-стикер с текстом). Размер задаёт родитель.
// Рисунки свои; в ParachuteDrop.vue — их «живые» версии с анимацией доставки.
// mood аиста: hard — тяжело (глаз навыкате, пот), shut — зажмурился, happy — доволен; иначе обычный глаз
defineProps({ kind: { type: String, default: 'chest' }, text: { type: String, default: '' }, flap: Boolean, mood: { type: String, default: '' } })
</script>
<template>
  <svg v-if="kind === 'chute'" viewBox="0 0 200 150" aria-hidden="true">
    <path d="M10 70 Q100 -30 190 70 Z" fill="#ff6b6b" /><path d="M10 70 Q40 20 70 70 Z" fill="#ffd166" /><path d="M70 70 Q100 8 130 70 Z" fill="#fff" /><path d="M130 70 Q160 20 190 70 Z" fill="#ffd166" />
    <path d="M12 72 L88 148 M70 72 L94 148 M130 72 L106 148 M188 72 L112 148" stroke="#8a6a4a" stroke-width="2.4" fill="none" />
  </svg>
  <svg v-else-if="kind === 'crane'" viewBox="0 0 60 44" aria-hidden="true">
    <rect x="0" y="2" width="60" height="6" fill="#f2c94c" /><rect x="18" y="5" width="24" height="9" rx="2" fill="#4b4b4b" /><rect x="28.5" y="14" width="3" height="12" fill="#4b4b4b" />
    <path d="M30 26 L30 31 Q37 31 37 36 Q37 41 31 41 Q26 41 25 36" fill="none" stroke="#e0b13a" stroke-width="3.5" stroke-linecap="round" />
  </svg>
  <svg v-else-if="kind === 'bird'" class="pa-bird" :class="{ flap }" viewBox="0 0 220 140" aria-hidden="true">
    <g class="pa-wing"><path d="M104 68 Q92 18 46 8 Q58 24 54 36 Q68 34 70 46 Q82 46 86 62 Z" fill="#c9d5dc" stroke="#8fa3ad" stroke-width="2" /></g>
    <path d="M62 84 L14 96 L4 92 M14 96 L4 102 M64 90 L18 108 L8 106 M18 108 L10 115" fill="none" stroke="#ff8a00" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M58 70 L28 60 L36 72 L26 82 L56 88 Z" fill="#3d3d3d" />
    <path d="M132 70 Q160 70 158 46" fill="none" stroke="#8fa3ad" stroke-width="17" stroke-linecap="round" />
    <path d="M52 78 Q56 54 98 54 Q138 54 142 76 Q140 100 98 102 Q60 102 52 78 Z" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="2" />
    <path d="M172 32 L210 46 Q213 50 207 51 L170 47 Z" fill="#ff8a00" />
    <circle cx="160" cy="40" r="15" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="2" />
    <path d="M132 70 Q160 70 158 46" fill="none" stroke="#f6f9fb" stroke-width="13" stroke-linecap="round" />
    <g v-if="mood === 'hard'">
      <circle cx="165" cy="35" r="6.5" fill="#fff" stroke="#555" stroke-width="1.5" /><circle cx="167" cy="38" r="2" fill="#222" /><path d="M156 27 L170 23" fill="none" stroke="#555" stroke-width="2.2" stroke-linecap="round" />
      <path class="pa-sw" d="M148 22 q-3 -6 0 -9 q3 3 0 9 Z" fill="#1cb0f6" /><path class="pa-sw s2" d="M160 16 q-3 -6 0 -9 q3 3 0 9 Z" fill="#1cb0f6" />
    </g>
    <path v-else-if="mood === 'shut'" d="M160 31 L169 36 L160 41" fill="none" stroke="#555" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <path v-else-if="mood === 'happy'" d="M159 37 Q165 30 171 37" fill="none" stroke="#555" stroke-width="2.5" stroke-linecap="round" />
    <circle v-else cx="165" cy="36" r="2.6" fill="#222" />
    <g class="pa-wing">
      <path d="M106 72 Q92 16 40 4 Q54 22 50 34 Q64 32 66 46 Q80 46 84 64 Z" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="2" />
      <path d="M40 4 Q54 22 50 34 Q64 32 66 46 L74 47 Q66 22 40 4 Z" fill="#3d3d3d" />
    </g>
  </svg>
  <svg v-else-if="kind === 'mail'" viewBox="0 0 60 44" aria-hidden="true">
    <rect x="2" y="2" width="56" height="40" rx="4" fill="#fffdf5" stroke="#b9a66e" stroke-width="2" /><path d="M3 5 L30 26 L57 5" fill="none" stroke="#b9a66e" stroke-width="2" /><circle cx="30" cy="27" r="6" fill="#e5484d" />
  </svg>
  <span v-else-if="kind === 'note' && text" class="pa-note">{{ text }}</span>
  <svg v-else-if="kind === 'note'" viewBox="0 0 44 40" aria-hidden="true">
    <rect x="4" y="3" width="36" height="34" fill="#ffd84d" transform="rotate(-5 22 20)" /><path d="M11 14 L32 12 M11 21 L32 19 M12 28 L26 27" stroke="#8a6a00" stroke-width="2.4" stroke-linecap="round" fill="none" />
  </svg>
  <svg v-else viewBox="0 0 120 100" aria-hidden="true">
    <rect x="10" y="44" width="100" height="50" rx="6" fill="#a0612b" /><path d="M10 44 Q10 14 60 14 Q110 14 110 44 Z" fill="#b8722f" /><rect x="24" y="16" width="10" height="78" fill="#e0b13a" /><rect x="86" y="16" width="10" height="78" fill="#e0b13a" /><rect x="52" y="34" width="16" height="18" rx="3" fill="#f2c94c" />
  </svg>
</template>
<style scoped>
.pa-bird { overflow: visible }
.pa-wing { transform-box: fill-box; transform-origin: 94% 97% }
.flap .pa-wing { animation: pa-flap .2s ease-in-out infinite alternate }
.pa-sw { animation: pa-sweat .5s linear infinite } .pa-sw.s2 { animation-delay: .25s }
@keyframes pa-sweat { from { transform: none; opacity: 1 } to { transform: translate(-16px, -12px); opacity: 0 } }
@keyframes pa-flap { from { transform: rotate(14deg) } to { transform: rotate(-80deg) } }
.pa-note { display: block; box-sizing: border-box; padding: 6px 4px; overflow: hidden; background: #ffe58a; box-shadow: 0 2px 5px rgba(0, 0, 0, .18); transform: rotate(-4deg); font-family: 'Caveat', 'Segoe Print', 'Bradley Hand', cursive; font-size: 17px; font-weight: 700; line-height: 1; color: #3b2f00; text-align: center; overflow-wrap: anywhere }
</style>

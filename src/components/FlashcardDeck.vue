<script setup>
import { ref, computed } from 'vue'
import { useTelegram } from '../composables/useTelegram'
const props = defineProps({ cards: { type: Array, required: true } })
const { haptic } = useTelegram()
const i = ref(0), flipped = ref(false), known = ref(0)
const done = computed(() => i.value >= props.cards.length)
function answer(ok) {
  if (ok) known.value++
  haptic(ok ? 'light' : 'rigid')
  flipped.value = false; i.value++   // TODO: интервальные повторения (SM-2) — сохранять рейтинг на бэкенде
}
function restart() { i.value = 0; known.value = 0; flipped.value = false }
</script>

<template>
  <div v-if="!done" class="wrap">
    <div class="hint">{{ i + 1 }} / {{ cards.length }}</div>
    <div class="scene" @click="flipped = !flipped">
      <div class="card3d" :class="{ flipped }">
        <div class="face card">{{ cards[i].front }}</div>
        <div class="face card back">{{ cards[i].back }}</div>
      </div>
    </div>
    <div class="row" v-if="flipped">
      <button class="btn ghost" style="flex:1" @click="answer(false)">Повторить</button>
      <button class="btn" style="flex:1" @click="answer(true)">Знаю</button>
    </div>
    <div v-else class="hint">Нажмите на карточку, чтобы перевернуть</div>
  </div>
  <div v-else class="card" style="text-align:center">
    <h3>Готово! 🎉</h3><p>Выучено: {{ known }} из {{ cards.length }}</p>
    <button class="btn" @click="restart">Ещё раз</button>
  </div>
</template>

<style scoped>
.wrap { display: grid; gap: 14px; text-align: center; }
.scene { perspective: 1000px; height: 220px; cursor: pointer; }
.card3d { position: relative; height: 100%; transition: transform .5s; transform-style: preserve-3d; }
.card3d.flipped { transform: rotateY(180deg); }
.face { position: absolute; inset: 0; backface-visibility: hidden; display: grid; place-items: center; font-size: 30px; font-weight: 700; }
.back { transform: rotateY(180deg); color: var(--accent); }
</style>

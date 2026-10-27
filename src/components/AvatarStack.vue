<script setup>
// Аватарки участников группы «внахлёст»: каждая следующая лежит поверх предыдущей, вокруг — кольцо цвета фона.
// Если учеников больше max — показываются первые (max − 1) и кружок «+N».
import { computed } from 'vue'
import Avatar from './Avatar.vue'
const props = defineProps({
  students: { type: Array, required: true },
  size: { type: Number, default: 24 },
  max: { type: Number, default: 3 },
  ring: { type: String, default: 'var(--card)' },        // цвет кольца — как фон, на котором лежит стопка
})
const shown = computed(() => props.students.length > props.max ? props.students.slice(0, props.max - 1) : props.students)
const rest = computed(() => props.students.length - shown.value.length)
const step = computed(() => -Math.round(props.size * 0.38))      // насколько кружки заходят друг на друга
const ringW = computed(() => Math.max(1.5, props.size / 14))
</script>
<template>
  <span class="stack" :style="{ '--ring': ring, '--rw': ringW + 'px' }" :aria-label="students.map(s => s.name).join(', ')">
    <span v-for="(s, i) in shown" :key="s.id" class="it" :style="{ marginLeft: i ? step + 'px' : 0, zIndex: i + 1 }"><Avatar :s="s" :size="size" /></span>
    <span v-if="rest" class="it more" :style="{ marginLeft: step + 'px', width: size + 'px', height: size + 'px', fontSize: Math.round(size * .4) + 'px' }">+{{ rest }}</span>
  </span>
</template>
<style scoped>
.stack { display: inline-flex; align-items: center; flex: none }
.it { position: relative; display: inline-grid; border-radius: 50%; box-shadow: 0 0 0 var(--rw) var(--ring) }
.more { place-items: center; background: var(--hint); color: #fff; font-weight: 900; line-height: 1; letter-spacing: -.5px; z-index: 20 }
</style>

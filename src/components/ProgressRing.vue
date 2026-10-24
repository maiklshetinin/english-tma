<script setup>
import { computed } from 'vue'
const props = defineProps({ value: { type: Number, default: 0 }, size: { type: Number, default: 84 } })
const r = 36, c = 2 * Math.PI * r
const offset = computed(() => c * (1 - props.value / 100))
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 84 84">
    <circle cx="42" cy="42" :r="r" fill="none" stroke="var(--bg)" stroke-width="9" />
    <circle cx="42" cy="42" :r="r" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round"
      :stroke-dasharray="c" :stroke-dashoffset="offset" transform="rotate(-90 42 42)" style="transition: stroke-dashoffset .6s" />
    <text x="42" y="48" text-anchor="middle" font-size="18" font-weight="700" fill="var(--text)">{{ value }}%</text>
  </svg>
</template>

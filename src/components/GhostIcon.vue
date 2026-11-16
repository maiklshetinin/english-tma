<script setup>
// Значок-привидение (кнопка подсказок следующей недели в шапке и выбор в меню «Вид сетки» → «Привидение»).
// Варианты: sheet — простыня, flow — струящийся, fade — тающий, silhouette — силуэт (по умолчанию). См. utils/gridStyle.js → GHOST_ICONS.
defineProps({ variant: { type: String, default: 'silhouette' }, size: { type: Number, default: 28 } })
</script>
<template>
  <svg class="gi" :class="variant" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="variant === 'sheet'">
      <path class="body" d="M12 2.6c-4.3 0-7 3.3-7 7.6 0 3.2-.4 6.4-1.8 9.6-.3.7.4 1.3 1 .9 1.1-.7 1.9-.4 2.5.4.6.8 1.6.9 2.3.1.8-.9 1.9-1 2.7-.1.8.9 2 .9 2.8 0 .8-.9 1.9-.8 2.6 0 .6.6 1.5.6 2-.2.4-.6 1.1-.8 1.8-.4.6.3 1.2-.3 1-.9-1.3-3.2-1.9-6.4-1.9-9.4 0-4.3-2.7-7.6-7-7.6z" />
      <path class="fold" d="M8.3 13.5c.4 2.2.3 4.2-.5 6M14.8 14c.6 2 .7 4 .2 5.8" />
      <ellipse class="eye" cx="9.6" cy="9.4" rx="1.3" ry="2" /><ellipse class="eye" cx="14.4" cy="9.4" rx="1.3" ry="2" />
    </template>
    <template v-else-if="variant === 'flow'">
      <path class="body" d="M12.2 2.5c-4.2 0-6.9 3.1-6.9 7.2 0 4.2 1 6.7 3.3 9 1.9 1.9 4.6 2.6 7.1 2.4 1.5-.1 2.8-.7 3.6-1.6-1.7.3-3.2 0-4.1-.9 1.6-.2 2.8-.9 3.3-2-1.2.3-2.2.2-2.9-.3 1.4-1.4 2.1-3.7 2.1-6.6 0-4.1-2.6-7.2-5.5-7.2z" />
      <ellipse class="eye" cx="9.9" cy="9" rx="1.25" ry="1.9" /><ellipse class="eye" cx="14.3" cy="9" rx="1.25" ry="1.9" /><ellipse class="eye" cx="12" cy="13.4" rx="1.2" ry="1.8" />
    </template>
    <template v-else-if="variant === 'fade'">
      <path class="body" d="M12 2.6c-4.1 0-6.8 3.2-6.8 7.4v4.2h13.6V10c0-4.2-2.7-7.4-6.8-7.4z" />
      <path class="body" opacity=".55" d="M5.2 14.2v2.4c0 .9.9 1.3 1.6.8.7.8 1.8.9 2.5.1.7.9 2 .9 2.7 0 .7.9 2 .9 2.7 0 .7.8 1.8.7 2.5-.1.7.5 1.6.1 1.6-.8v-2.4z" />
      <path class="fold" opacity=".5" d="M6.5 19.6h11M8 21.4h8" />
      <ellipse class="eye" cx="9.6" cy="9.4" rx="1.3" ry="2" /><ellipse class="eye" cx="14.4" cy="9.4" rx="1.3" ry="2" />
    </template>
    <template v-else>
      <path class="solid" d="M12 2.4c-4.4 0-7.2 3.4-7.2 7.7 0 3.4-.5 6.5-1.9 9.4 1.5.4 2.6-.1 3.5-1.2.8 1.3 2.1 2 3.4 1.6.7 1.1 1.6 1.7 2.6 1.7s2-.6 2.6-1.7c1.3.4 2.6-.3 3.4-1.6.9 1.1 2 1.6 3.5 1.2-1.4-2.9-1.9-6-1.9-9.4 0-4.3-2.8-7.7-7.2-7.7z" />
      <ellipse class="hole" cx="9.6" cy="9.6" rx="1.4" ry="2.1" /><ellipse class="hole" cx="14.4" cy="9.6" rx="1.4" ry="2.1" />
    </template>
  </svg>
</template>
<style scoped>
.gi { flex: none; display: block }
.body { fill: #e6f1fb; stroke: #5f7c99; stroke-width: 1.2; stroke-linejoin: round }
.fold { fill: none; stroke: #9fb6cc; stroke-width: .9; stroke-linecap: round }
.eye { fill: #1d2a38 }
.solid { fill: #5f7c99 } .hole { fill: var(--gi-bg, var(--card)) }      /* глаза силуэта — цвета подложки кнопки */
html[data-theme='dark'] .solid { fill: #8fa9c3 }
</style>

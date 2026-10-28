<script setup>
// Аватарка из Telegram (photoUrl / tgId / @ник через сервер — composables/useAvatar), а если её нет или она не загрузилась — инициал на цветном фоне.
// online — зелёная точка «в сети» справа внизу, как в Telegram (utils/online.ts).
// Архивный ученик (s.archived): серая, снизу тёмная полоска со значком архива — так он виден в истории проведённых уроков.
import { computed } from 'vue'
import { avatarSrc, markBad } from '../composables/useAvatar'
const props = defineProps({ s: { type: Object, required: true }, size: { type: Number, default: 40 }, online: Boolean })
const src = computed(() => avatarSrc(props.s))      // не открылась — markBad, и avatarSrc отдаст следующий источник
</script>
<template>
  <span class="avw">
  <span class="av" :class="{ img: src, arch: s.archived }" :title="s.archived ? `${s.name} — в архиве` : undefined" :style="{ width: size + 'px', height: size + 'px', background: s.color, fontSize: size * .46 + 'px' }">
    <img v-if="src" :src="src" alt="" draggable="false" referrerpolicy="no-referrer" @error="markBad(src)" />
    <template v-else>{{ (s.name || '?')[0] }}</template>
    <span v-if="s.archived" class="ab" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/></svg></span>
  </span>
  <i v-if="online && !s.archived" class="on" :style="{ '--d': Math.max(7, Math.round(size * .2)) + 'px' }" title="в сети" aria-label="в сети" />
  </span>
</template>
<style scoped>
.avw { position: relative; display: inline-grid; flex: none }
/* Точка «в сети»: зелёная, с белым кольцом цвета фона — как в Telegram */
.on { position: absolute; right: 4%; bottom: 4%; width: var(--d); height: var(--d); border-radius: 50%; background: #4fce5d; box-shadow: 0 0 0 2px var(--card); z-index: 1 }      /* как в Telegram: ~20 % аватарки, тонкое белое кольцо */
.av { display: inline-grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 900; flex: none; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .18); line-height: 1; overflow: hidden }
.av.img { box-shadow: none; background: var(--surface) !important }
.av { position: relative }
.av.arch { filter: grayscale(1); opacity: .75 }
.ab { position: absolute; left: 0; right: 0; bottom: 0; height: 38%; display: grid; place-items: center; background: rgba(40, 40, 40, .78); color: #fff }
.ab svg { height: 70%; width: auto; min-height: 7px }
.av img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none }
</style>

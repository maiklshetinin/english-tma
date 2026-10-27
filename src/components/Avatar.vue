<script setup>
// Аватарка из Telegram (photoUrl / tgId), а если её нет или она не загрузилась — инициал на цветном фоне.
// Архивный ученик (s.archived): серая, снизу тёмная полоска со значком архива — так он виден в истории проведённых уроков.
import { ref, computed, watch } from 'vue'
import { avatarSrc } from '../composables/useAvatar'
const props = defineProps({ s: { type: Object, required: true }, size: { type: Number, default: 40 } })
const failed = ref(false)
const src = computed(() => avatarSrc(props.s))
watch(src, () => { failed.value = false })
</script>
<template>
  <span class="av" :class="{ img: src && !failed, arch: s.archived }" :title="s.archived ? `${s.name} — в архиве` : undefined" :style="{ width: size + 'px', height: size + 'px', background: s.color, fontSize: size * .46 + 'px' }">
    <img v-if="src && !failed" :src="src" alt="" draggable="false" referrerpolicy="no-referrer" @error="failed = true" />
    <template v-else>{{ (s.name || '?')[0] }}</template>
    <span v-if="s.archived" class="ab" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/></svg></span>
  </span>
</template>
<style scoped>
.av { display: inline-grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 900; flex: none; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .18); line-height: 1; overflow: hidden }
.av.img { box-shadow: none; background: var(--surface) !important }
.av { position: relative }
.av.arch { filter: grayscale(1); opacity: .75 }
.ab { position: absolute; left: 0; right: 0; bottom: 0; height: 38%; display: grid; place-items: center; background: rgba(40, 40, 40, .78); color: #fff }
.ab svg { height: 70%; width: auto; min-height: 7px }
.av img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none }
</style>

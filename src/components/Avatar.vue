<script setup>
// Аватарка из Telegram (photoUrl / tgId), а если её нет или она не загрузилась — инициал на цветном фоне.
import { ref, computed, watch } from 'vue'
import { avatarSrc } from '../composables/useAvatar'
const props = defineProps({ s: { type: Object, required: true }, size: { type: Number, default: 40 } })
const failed = ref(false)
const src = computed(() => avatarSrc(props.s))
watch(src, () => { failed.value = false })
</script>
<template>
  <span class="av" :class="{ img: src && !failed }" :style="{ width: size + 'px', height: size + 'px', background: s.color, fontSize: size * .46 + 'px' }">
    <img v-if="src && !failed" :src="src" alt="" draggable="false" referrerpolicy="no-referrer" @error="failed = true" />
    <template v-else>{{ (s.name || '?')[0] }}</template>
  </span>
</template>
<style scoped>
.av { display: inline-grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 900; flex: none; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .18); line-height: 1; overflow: hidden }
.av.img { box-shadow: none; background: var(--surface) !important }
.av img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none }
</style>

<script setup>
// Фото ученика крупно — как в Telegram при нажатии на аватарку: тёмный фон, фото по центру, имя снизу.
// Закрывается нажатием в любом месте, Esc или «Назад» в Telegram. Фото нет — крупный инициал на его цвете.
import { computed, onMounted, onUnmounted } from 'vue'
import { avatarSrc, markBad } from '../composables/useAvatar'
import AppIcon from './AppIcon.vue'
const props = defineProps({ s: { type: Object, required: true } })
const emit = defineEmits(['close'])
const src = computed(() => avatarSrc(props.s))
const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); emit('close') } }
onMounted(() => addEventListener('keydown', onKey, true))
onUnmounted(() => removeEventListener('keydown', onKey, true))
</script>
<template>
  <Teleport to="body">
    <div class="pz" role="dialog" :aria-label="`Фото: ${s.name}`" @click="emit('close')">
      <button class="x" aria-label="Закрыть"><AppIcon name="x" :size="22" /></button>
      <img v-if="src" :src="src" alt="" class="ph" referrerpolicy="no-referrer" @error="markBad(src)" />
      <div v-else class="ph ini" :style="{ background: s.color }">{{ (s.name || '?')[0] }}</div>
      <div class="nm">{{ s.name }}<small v-if="s.username">@{{ s.username }}</small></div>
    </div>
  </Teleport>
</template>
<style scoped>
.pz { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; align-content: center; gap: 14px; padding: 24px; background: rgba(0, 0, 0, .86); cursor: zoom-out; animation: pzbg .18s ease-out }
.ph { width: min(86vw, 420px); height: min(86vw, 420px); border-radius: 22px; object-fit: cover; box-shadow: 0 20px 60px rgba(0, 0, 0, .5); animation: pzin .2s cubic-bezier(.2, .9, .3, 1.2) }
.ini { display: grid; place-items: center; color: #fff; font-size: min(40vw, 190px); font-weight: 900 }
.nm { display: grid; justify-items: center; color: #fff; font-size: 17px; font-weight: 800 } .nm small { font-size: 13px; font-weight: 600; opacity: .65 }
.x { position: absolute; top: 14px; right: 14px; display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .14); color: #fff; cursor: pointer }
@keyframes pzbg { from { background: rgba(0, 0, 0, 0) } }
@keyframes pzin { from { transform: scale(.3); opacity: 0 } }
</style>

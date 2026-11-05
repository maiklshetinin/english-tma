<script setup>
// Синяя полоса звука, как в Busuu: кнопка ▶ / ❚❚, тонкая полоска хода, скорость 1x / 0.75x.
// В экране «Новое слово» лежит поверх фото снизу; без фото — сама по себе.
// media — готовый <video>: тогда полоса управляет им (видео без своих кнопок, как в Busuu).
import { ref, computed, onUnmounted, watch } from 'vue'
const props = defineProps({ src: { type: String, default: '' }, autoplay: Boolean, media: { type: Object, default: null } })
const own = ref(null), playing = ref(false), pos = ref(0), slow = ref(false)
const a = computed(() => props.media || own.value)
const EV = { play: () => (playing.value = true), pause: () => (playing.value = false), ended: () => { playing.value = false; pos.value = 0 }, timeupdate: () => tick() }
watch(() => props.media, (m, old) => { for (const [k, f] of Object.entries(EV)) { old?.removeEventListener(k, f); m?.addEventListener(k, f) } if (m) playing.value = !m.paused }, { immediate: true })
onUnmounted(() => { for (const [k, f] of Object.entries(EV)) props.media?.removeEventListener(k, f) })
function toggle() { const el = a.value; if (!el) return; if (el.paused) { el.playbackRate = slow.value ? .75 : 1; el.play().catch(() => {}) } else el.pause() }
function seek(e) { const el = a.value; if (!el?.duration) return; const r = e.currentTarget.getBoundingClientRect(); el.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * el.duration }
function speed() { slow.value = !slow.value; if (a.value) a.value.playbackRate = slow.value ? .75 : 1 }
const tick = () => { const el = a.value; pos.value = el?.duration ? el.currentTime / el.duration : 0 }
watch(() => props.src, () => { pos.value = 0; playing.value = false })
onUnmounted(() => a.value?.pause())
defineExpose({ toggle })
</script>

<template>
  <div class="ap" @pointerdown.stop>
    <audio v-if="!media" ref="own" :src="src" preload="metadata" :autoplay="autoplay" @play="playing = true" @pause="playing = false" @ended="playing = false; pos = 0" @timeupdate="tick" />
    <button class="pp" :title="playing ? 'Пауза' : 'Слушать'" @click.stop="toggle">
      <svg v-if="!playing" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>
      <svg v-else viewBox="0 0 24 24"><rect x="7" y="5.5" width="3.6" height="13" rx="1" /><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" /></svg>
    </button>
    <span class="tr" @click.stop="seek"><i :style="{ width: pos * 100 + '%' }" /></span>
    <button class="sp" title="Скорость" @click.stop="speed">{{ slow ? '0.75x' : '1x' }}</button>
  </div>
</template>

<style scoped>
.ap { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 6px 0 4px; border-radius: 15px; background: #1a73e8; color: #fff; box-sizing: border-box }
.pp { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border: 0; padding: 0; border-radius: 50%; background: none; color: #fff; cursor: pointer }
.pp svg { width: 16px; height: 16px; fill: currentColor }
.tr { position: relative; flex: 1; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, .45); cursor: pointer }
.tr::before { content: ''; position: absolute; inset: -8px 0 }
.tr i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: #fff }
.sp { flex: none; border: 0; padding: 0 4px; background: none; color: #fff; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; min-width: 30px }
</style>

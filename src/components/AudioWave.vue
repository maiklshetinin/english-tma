<script setup>
// Звук карточки «как на стоках»: ▶, волна и длительность. Нажали — играет, пройденная часть волны темнеет; нажали на волну — перемотка.
// Волну считаем из самого файла (Web Audio): сразу после загрузки — из файла в браузере, иначе пробуем скачать.
// Если файл с чужого сайта и скачать нельзя (браузер не даёт) — вместо волны ровная полоска, длительность всё равно видна.
// Посчитанное хранится в карточке (meta: «длительность|высоты столбиков»), чтобы не считать каждый раз.
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { waveOf } from '../utils/wave'
const props = defineProps({ src: { type: String, required: true }, meta: { type: String, default: '' }, small: Boolean })
const emit = defineEmits(['meta'])
const peaks = ref(null), dur = ref(0), pos = ref(0), playing = ref(false)
let au = null, raf = 0

function readMeta(m) {
  const [d, p] = (m || '').split('|'); if (!d) return false
  dur.value = Number(d) || 0; peaks.value = p ? [...p].map(ch => (ch.charCodeAt(0) - 97) / 15) : null
  return true
}
async function load() {
  if (readMeta(props.meta) && peaks.value) return
  try { const r = await fetch(props.src); if (!r.ok) throw 0; const m = await waveOf(await r.arrayBuffer()); readMeta(m); emit('meta', m) }
  catch {                                                   // чужой сайт не даёт скачать — хотя бы длительность из самого <audio>
    const a = new Audio(); a.preload = 'metadata'; a.src = props.src
    a.onloadedmetadata = () => { if (isFinite(a.duration)) dur.value = a.duration }
  }
}
onMounted(load); watch(() => props.src, () => { stop(); peaks.value = null; dur.value = 0; load() })
function tick() { if (!au) return; pos.value = au.currentTime / (au.duration || dur.value || 1); raf = requestAnimationFrame(tick) }
function stop() { au?.pause(); cancelAnimationFrame(raf); playing.value = false; pos.value = 0; au = null }
function toggle() {
  if (playing.value) return stop()
  window.dispatchEvent(new CustomEvent('wave-play')); au = new Audio(props.src)
  au.onended = stop; au.onloadedmetadata = () => { if (isFinite(au.duration)) dur.value = au.duration }
  au.play().then(() => { playing.value = true; tick() }).catch(stop)
}
function seek(e) {
  const r = e.currentTarget.getBoundingClientRect(), k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  if (!au) toggle(); const go = () => { if (au) au.currentTime = k * (au.duration || dur.value) }
  au?.readyState >= 1 ? go() : au?.addEventListener('loadedmetadata', go, { once: true })
}
const other = () => stop()                                 // играет только один звук на странице
onMounted(() => window.addEventListener('wave-play', other)); onUnmounted(() => { window.removeEventListener('wave-play', other); stop() })
const time = computed(() => { const t = Math.round(dur.value || 0); return t ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : '' })
</script>
<template>
  <span class="aw" :class="{ small, on: playing }" @click.stop>
    <button class="pl" :title="playing ? 'Стоп' : 'Послушать'" @click="toggle"><svg v-if="!playing" viewBox="0 0 12 12"><path d="M3 1.8v8.4L10 6z" /></svg><svg v-else viewBox="0 0 12 12"><rect x="2.5" y="2" width="2.6" height="8" rx="1" /><rect x="7" y="2" width="2.6" height="8" rx="1" /></svg></button>
    <span class="wv" title="Нажмите на волну — перемотать" @click="seek">
      <template v-if="peaks"><i v-for="(p, i) in peaks" :key="i" :class="{ done: i / peaks.length < pos }" :style="{ height: Math.max(12, p * 100) + '%' }" /></template>
      <b v-else class="flat"><u :style="{ width: pos * 100 + '%' }" /></b>
    </span>
    <small class="tm">{{ time }}</small>
  </span>
</template>
<style scoped>
.aw { display: inline-flex; align-items: center; gap: 8px; width: 100%; max-width: 260px; height: 26px }
.pl { flex: none; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%; background: var(--blue-l); color: var(--blue); cursor: pointer }
.pl svg { width: 11px; height: 11px; fill: currentColor } .aw.on .pl { background: var(--blue); color: #fff }
.wv { flex: 1; min-width: 0; overflow: hidden; height: 100%; display: flex; align-items: center; gap: 1.5px; cursor: pointer }
.wv i { flex: 1; min-width: 1px; border-radius: 2px; background: #c9ced6; transition: background .1s } .wv i.done { background: #3c4048 }
.aw.on .wv i.done { background: var(--blue) }
.flat { position: relative; flex: 1; height: 4px; border-radius: 2px; background: #c9ced6; overflow: hidden } .flat u { position: absolute; left: 0; top: 0; bottom: 0; background: var(--blue) }
.tm { flex: none; min-width: 30px; font-size: 12px; font-weight: 700; color: var(--hint); font-variant-numeric: tabular-nums }
.small { height: 22px } .small .pl { width: 20px; height: 20px }
</style>

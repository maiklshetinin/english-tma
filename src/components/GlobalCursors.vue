<script setup>
// Общие курсоры (включает разработчик — сразу у всех): курсоры коллег на любой странице (как в редакторе курсов, только везде) и вспышка на месте клика.
// Координаты — от начала страницы (pageX/pageY): у вас одинаковые мониторы, так что стрелка стоит там же, где мышь коллеги.
// Редактор курсов показывает свои курсоры сам.
import { reactive, ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { live, liveSend, onLive, shared } from '../composables/useLive'
const route = useRoute()
const cur = reactive({}), sc = ref({ x: scrollX, y: scrollY }), now = ref(Date.now())
let t = 0, last = null
function send(e, click = false) {
  if (!shared.cursors || !live.on) return
  last = { t: 'pcursor', path: route.fullPath, x: e.pageX, y: e.pageY, click }
  if (click) { liveSend(last); return }
  if (!t) t = setTimeout(() => { t = 0; liveSend(last) }, 60)       // не чаще ~16 раз в секунду
}
const move = (e) => send(e), down = (e) => send(e, true), scroll = () => { sc.value = { x: scrollX, y: scrollY } }
const off = onLive('pcursor', (m) => { cur[m.cid] = { ...m, at: Date.now(), clickAt: m.click ? Date.now() : cur[m.cid]?.clickAt } })
let tick = 0
onMounted(() => { addEventListener('pointermove', move, { passive: true }); addEventListener('pointerdown', down, { passive: true }); addEventListener('scroll', scroll, { passive: true }); tick = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { off(); removeEventListener('pointermove', move); removeEventListener('pointerdown', down); removeEventListener('scroll', scroll); clearInterval(tick) })
const shown = computed(() => (shared.cursors ? Object.entries(cur).map(([cid, c]) => ({ cid, ...c, u: live.users.find(u => u.cid === cid) }))
  .filter(c => c.u && c.path === route.fullPath && now.value - c.at < 20000) : []))
</script>
<template>
  <div v-for="c in shown" :key="c.cid" class="gc" :style="{ transform: `translate(${c.x - sc.x}px, ${c.y - sc.y}px)`, '--rc': c.u.color }">
    <i v-if="c.clickAt && Date.now() - c.clickAt < 700" :key="c.clickAt" class="ping" />
    <svg viewBox="0 0 16 16"><path d="M1 1l5.2 13.5 2-5.6L14 7z" /></svg><span>{{ c.u.name }}</span>
  </div>
</template>
<style scoped>
.gc { position: fixed; left: 0; top: 0; z-index: 200; pointer-events: none; transition: transform .08s linear }
.gc svg { width: 18px; height: 18px; fill: var(--rc); stroke: #fff; stroke-width: 1.4; stroke-linejoin: round; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .25)) }
.gc span { position: absolute; left: 14px; top: 16px; padding: 2px 7px; border-radius: 6px 6px 6px 2px; background: var(--rc); color: #fff; font-size: 11px; font-weight: 800; white-space: nowrap }
.ping { position: absolute; left: -14px; top: -14px; width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--rc); animation: ping .6s ease-out forwards }
@keyframes ping { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }
</style>

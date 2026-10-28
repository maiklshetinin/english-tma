<script setup>
// Общие курсоры (включает разработчик — сразу у всех): курсоры коллег на любой странице (как в редакторе курсов, только везде)
// и вспышка на месте клика. Привязка — к элементу под мышкой: путь к нему в странице (sel) и место внутри (rx, ry от 0 до 1).
// Так стрелка встаёт туда же при любом масштабе браузера и ширине окна; не нашли элемент — по координатам страницы.
// Редактор курсов показывает свои курсоры сам.
import { reactive, ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { live, liveSend, onLive, shared } from '../composables/useLive'
const route = useRoute()
const cur = reactive({}), now = ref(Date.now()), tick = ref(0)
// Путь к элементу от области страницы (main): «div:nth-child(2)>button:nth-child(1)…». Считаем от main, а не от корня:
// кружки вверху, всплывашки и меню живут вне main и нумерацию не сбивают. У коллеги та же страница — тот же элемент.
const root = () => document.querySelector('.shell > main')
function pathOf(el) {
  const top = root(), parts = []
  while (el && el !== top && el.nodeType === 1 && parts.length < 30) {
    const p = el.parentElement; if (!p) return ''
    parts.unshift(`${el.tagName.toLowerCase()}:nth-child(${[...p.children].indexOf(el) + 1})`)
    el = p
  }
  return top && el === top ? parts.join('>') : ''
}
const find = (sel) => { try { return sel ? root()?.querySelector(':scope>' + sel) : null } catch { return null } }
let t = 0, last = null
function send(e, click = false) {
  if (!shared.cursors || !live.on) return
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const sel = el ? pathOf(el) : '', r = sel ? el.getBoundingClientRect() : null
  last = { t: 'pcursor', path: route.fullPath, sel, rx: r?.width ? (e.clientX - r.left) / r.width : 0, ry: r?.height ? (e.clientY - r.top) / r.height : 0, x: e.pageX, y: e.pageY, click }
  if (click) { liveSend(last); return }
  if (!t) t = setTimeout(() => { t = 0; liveSend(last) }, 60)       // не чаще ~16 раз в секунду
}
const move = (e) => send(e), down = (e) => send(e, true), re = () => { tick.value++ }
const off = onLive('pcursor', (m) => { cur[m.cid] = { ...m, at: Date.now(), clickAt: m.click ? Date.now() : cur[m.cid]?.clickAt } })
let clock = 0
onMounted(() => {
  addEventListener('pointermove', move, { passive: true }); addEventListener('pointerdown', down, { passive: true })
  addEventListener('scroll', re, { passive: true, capture: true }); addEventListener('resize', re)
  clock = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => { off(); removeEventListener('pointermove', move); removeEventListener('pointerdown', down); removeEventListener('scroll', re, { capture: true }); removeEventListener('resize', re); clearInterval(clock) })
// Где рисовать (координаты окна): по элементу, если он есть у нас; иначе — по координатам страницы
function place(c) {
  const el = find(c.sel)
  if (el) { const r = el.getBoundingClientRect(); return { x: r.left + c.rx * r.width, y: r.top + c.ry * r.height } }
  return { x: c.x - scrollX, y: c.y - scrollY }
}
const shown = computed(() => {
  void tick.value
  if (!shared.cursors) return []
  return Object.entries(cur).map(([cid, c]) => ({ cid, ...c, u: live.users.find(u => u.cid === cid) }))
    .filter(c => c.u && c.path === route.fullPath && now.value - c.at < 20000).map(c => ({ ...c, at2: place(c) }))
})
</script>
<template>
  <div v-for="c in shown" :key="c.cid" class="gc" :style="{ transform: `translate(${c.at2.x}px, ${c.at2.y}px)`, '--rc': c.u.color }">
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

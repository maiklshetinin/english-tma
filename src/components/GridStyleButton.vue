<script setup>
// Кнопка с решёткой над таблицей недели: меню (как в iOS) — вид сетки с маленьким превью и фон экрана (точки, как в Figma). См. utils/gridStyle.js.
import { ref, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'
import { GRID_STYLES, gridStyle, setGridStyle, bgDots, setBgDots } from '../utils/gridStyle'
const open = ref(null)
function toggle(e) {
  if (open.value) { open.value = null; return }
  const r = e.currentTarget.getBoundingClientRect(), W = 230
  open.value = { left: Math.min(Math.max(8, r.left + r.width / 2 - W / 2), innerWidth - W - 8) + 'px', top: r.bottom + 6 + 'px', width: W + 'px' }
}
const pick = (id) => { setGridStyle(id); open.value = null }
const onKey = (e) => { if (e.key === 'Escape') open.value = null }
onMounted(() => { addEventListener('keydown', onKey); addEventListener('resize', () => { open.value = null }) })
onUnmounted(() => removeEventListener('keydown', onKey))
</script>

<template>
  <button class="gsb" :class="{ on: open }" title="Вид сетки" aria-label="Вид сетки" :aria-expanded="!!open" @click="toggle"><AppIcon name="grid" :size="18" /></button>
  <Teleport to="body">
    <div v-if="open" class="gs-bg" @click.self="open = null">
      <div class="gs-pop" :style="open" role="menu" aria-label="Вид сетки">
        <div class="gs-h">Вид сетки</div>
        <button v-for="s in GRID_STYLES" :key="s.id" class="gs-r" role="menuitemradio" :aria-checked="gridStyle === s.id" @click="pick(s.id)">
          <!-- Превью: 3×2 клетки в выбранном стиле («без линий» — пусто, только одна плашка-урок) -->
          <span class="gs-pv" :class="s.id"><i v-for="n in 6" :key="n" :class="{ les: n === 5 }" /></span>
          <span class="gs-tx"><b>{{ s.title }}</b><small>{{ s.sub }}</small></span>
          <span v-if="gridStyle === s.id" class="gs-ok"><AppIcon name="check" :size="16" /></span>
        </button>
        <div class="gs-h sep">Фон</div>
        <label class="gs-r" role="menuitemcheckbox" :aria-checked="bgDots">
          <span class="gs-pv bgd" />
          <span class="gs-tx"><b>Точки</b><small>как в Figma</small></span>
          <input type="checkbox" class="sw" :checked="bgDots" @change="setBgDots($event.target.checked)" />
        </label>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gsb { display: grid; place-items: center; width: 40px; height: 40px; border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 12px; background: var(--card); color: var(--hint); cursor: pointer }
.gsb:hover, .gsb.on { color: var(--blue); border-color: var(--blue); background: var(--blue-l) }
.gs-bg { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .06) }
.gs-pop { position: fixed; display: grid; padding: 4px 0; border-radius: 16px; background: var(--card); box-shadow: 0 12px 40px rgba(0, 0, 0, .22), 0 0 0 1px rgba(0, 0, 0, .04); overflow: hidden; transform-origin: top center; animation: gsp .16s ease-out }
@keyframes gsp { from { opacity: 0; transform: scale(.92) } }
.gs-h { padding: 8px 14px 6px; font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.gs-r { display: flex; align-items: center; gap: 12px; width: 100%; height: 52px; padding: 0 14px; border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer }
.gs-r + .gs-r { box-shadow: inset 0 1px 0 var(--border) } .gs-r:hover { background: var(--surface) }
.gs-tx { flex: 1; display: grid; line-height: 1.25 } .gs-tx b { font-size: 15px } .gs-tx small { font-size: 12px; font-weight: 600; color: var(--hint) }
.gs-ok { color: var(--blue); display: grid }
/* Превью */
.gs-pv { flex: none; display: grid; grid-template-columns: repeat(3, 10px); gap: 2px; padding: 3px; border-radius: 6px; background: var(--card); box-shadow: 0 0 0 1px var(--border) }
.gs-pv i { height: 8px; border-radius: 2px } .gs-pv i.les { background: var(--blue) !important; box-shadow: none !important; border-radius: 2px !important }
.gs-pv.cells i { background: var(--card); box-shadow: inset 0 0 0 1px var(--hint-2) }
.gs-pv.gray i { background: var(--border) }
.gs-pv.none i { background: transparent }
.gs-pv.lines { gap: 0 2px } .gs-pv.lines i { border-radius: 0; box-shadow: inset 0 -1px 0 var(--hint-2); height: 9px }
.gs-h.sep { margin-top: 2px; padding-top: 10px; box-shadow: inset 0 1px 0 var(--border) }
.gs-pv.bgd { width: 38px; height: 25px; padding: 0; background-color: #f4f4f4; background-image: radial-gradient(circle, #bdbdbd .9px, transparent 1.2px); background-size: 5px 5px }
/* Переключатель как в Telegram */
.sw { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 38px; height: 22px; margin: 0; padding: 0; border: 0; border-radius: 99px; background: var(--border); cursor: pointer; transition: background .15s }
.sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .15s }
.sw:checked { background: var(--blue) } .sw:checked::after { transform: translateX(16px) }
</style>

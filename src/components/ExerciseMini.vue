<script setup>
// Миниатюра экрана (меню «Exercise», плитки на ветке урока): сам экран ученика — LessonPlayer с шаблоном из src/exercises
// и «рыбой» шаблона (TEMPLATES в utils/lesson.ts), уменьшенный. Точь-в-точь как в уроке: полоска прогресса, экран, подвал с кнопкой.
// Поменяли шаблон или плеер — поменялся и значок (18.11.2026). Нажатия выключены, звук и видео не грузятся.
// size: 'tray' / 'rail' — 124×156, как в меню «Exercise». idle (23.11.2026) — таймеры и анимации шаблона в значке стоят. Не шаблон экрана (например, «Готовый урок») — стопка карточек.
import { computed } from 'vue'
import LessonPlayer from './LessonPlayer.vue'
import { TEMPLATES } from '../utils/lesson'
const props = defineProps({ id: { type: String, required: true }, size: { type: String, default: 'tray' } })
const ALIAS = { spell: 'order', speak: 'sayword' }          // старые id шаблонов
const bid = computed(() => { const b = props.id.replace(/^pg_/, ''); return ALIAS[b] ?? b })
const steps = computed(() => { const t = TEMPLATES.find(x => x.id === bid.value); if (!t) return null; const s = t.make(); if (props.id.startsWith('pg_')) s.bs = 'page'; return [s] })
const resolve = (v, k) => (k === 'image' ? v : '')          // в значке — только картинки
const small = computed(() => props.size === 'tray' || props.size === 'rail')
</script>

<template>
  <span v-if="steps" class="mini xmt" :class="size" inert aria-hidden="true">
    <span class="sc" :class="{ big: !small }"><LessonPlayer :steps="steps" :resolve="resolve" embedded mini idle :pct="30" /></span>
  </span>
  <span v-else class="mini" :class="[id, size]"><span class="ms"><i /><i /><i /></span></span>
</template>

<style scoped>
.mini { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; width: 150px; height: 104px; box-sizing: border-box; padding: 8px 12px; border: 1px solid #e3e3e3; border-radius: 10px; background: var(--card); transition: transform .15s, box-shadow .15s }
/* размер «как в меню Exercise» (CourseEditor → .tray.inter .mini) */
.mini.tray, .mini.rail { width: 124px; height: 156px; padding: 6px 9px 16px; gap: 4px; overflow: hidden }
/* экран — как карточка на ветке урока (460 px), уменьшенный; высотой во весь значок: подвал с кнопкой — внизу, лишнее уходит под него */
.mini.xmt { display: block; padding: 0 !important; overflow: hidden; pointer-events: none; user-select: none }
.sc { position: absolute; left: 0; top: 0; width: 460px; height: calc(154px * 460 / 122); transform: scale(calc(122 / 460)); transform-origin: 0 0 }
.sc.big { height: calc(102px * 460 / 148); transform: scale(calc(148 / 460)) }
.mini.xmt .sc :deep(.lp) { height: 100%; border-radius: 0 }
.mini.xmt .sc :deep(.lp > .body) { flex: 1 1 auto; min-height: 0; overflow: hidden }
.mini.xmt:has(.lp.book) { background: #fffdf6; border-color: #eadfc4 } .mini.xmt:has(.lp.bkpg) { background: #fff; border-color: #d3d1c7 }
/* «Готовый урок» и прочее — стопка карточек */
.mini .ms { position: relative; width: 120px; height: 90px; transform: scale(.82); transform-origin: top center }
.mini .ms i { position: absolute; display: block; width: 84px; height: 62px; border: 1px solid #e3e3e3; border-radius: 8px; background: var(--card); box-shadow: 0 2px 5px rgba(0, 0, 0, .08) }
.mini .ms i:nth-child(1) { left: 0; top: 0; background: linear-gradient(#fff 20%, #8fb8e8 20% 60%, #fff 60%) } .mini .ms i:nth-child(2) { left: 18px; top: 13px; background: linear-gradient(#fff 35%, #8ff0c8 35% 70%, #fff 70%) } .mini .ms i:nth-child(3) { left: 36px; top: 26px; background: radial-gradient(circle at 50% 40%, #ffc800 12px, #fff 13px) }
.mini.lesson { background: none; border: 0; padding: 4px; overflow: visible }
</style>

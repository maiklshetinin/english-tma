<script setup>
// Призрак перетаскивания (useDnd). Им и целимся: цель — ячейка под его центром.
//  • Ученик / группа из панели: появляется ровно на месте взятого (кружки того же размера) и за мгновение сжимается
//    до размера ячейки — кружки уменьшаются и наезжают друг на друга, получается та же карточка, что будет в таблице.
//  • Урок из таблицы: копия карточки того же размера поверх оригинала, едет за курсором.
import { computed, ref, watch, nextTick } from 'vue'
import { dnd } from '../composables/useDnd'
import Avatar from './Avatar.vue'
import AvatarStack from './AvatarStack.vue'
import { useStudentsStore } from '../stores/students'
const studentStore = useStudentsStore()
const p = computed(() => dnd.payload)
const lesson = computed(() => p.value?.kind === 'lesson')
const people = computed(() => {
  if (!p.value) return []
  const ids = lesson.value ? p.value.lesson.studentIds : p.value.ids ?? [p.value.id]
  return ids.map(id => studentStore.findAny(id)).filter(Boolean)
})
// Сжатие: первый кадр — как в панели, следующий — размер ячейки (переход в CSS)
const small = ref(false)
watch(() => dnd.active, (on) => { small.value = false; if (on) nextTick(() => requestAnimationFrame(() => { small.value = true })) })
const g = computed(() => dnd.grab), b = computed(() => dnd.box)
const W = computed(() => (lesson.value || small.value || !g.value ? b.value?.W : g.value.w) || 110)
const H = computed(() => (lesson.value || small.value || !g.value ? b.value?.H : g.value.h) || 44)
const fx = computed(() => b.value?.fx ?? 0.5), fy = computed(() => b.value?.fy ?? 0.5)
const box = computed(() => ({ width: W.value + 'px', height: H.value + 'px', left: -fx.value * W.value + 'px', top: -fy.value * H.value + 'px' }))
// Кружки: в панели — по одному в клетке сетки; в ячейке — внахлёст, как у урока в таблице
const shown = computed(() => people.value.slice(0, 4))
const avEnd = computed(() => Math.max(20, Math.min(38, H.value - 10)))
const av = computed(() => (small.value || !g.value?.av ? avEnd.value : Math.round(g.value.av)))
const ml = (i) => {
  const n = shown.value.length
  if (small.value || !g.value) return i ? -Math.round(av.value * 0.35) + 'px' : (n > 1 ? 4 : 2) + 'px'
  const col = g.value.w / n
  return Math.round(i ? col - av.value : (col - av.value) / 2) + 'px'
}
const one = computed(() => people.value.length === 1)
</script>
<template>
  <div v-if="dnd.active && people.length" class="gw" :style="{ transform: `translate(${dnd.x}px, ${dnd.y}px)` }">
    <div class="ghost" :class="{ lesson, small: small || lesson, one }" :style="box">
      <template v-if="lesson">
        <AvatarStack v-if="!one" :students="people" :size="20" :max="3" ring="var(--card)" />
        <template v-else><Avatar :s="people[0]" :size="20" /><span class="nm">{{ people[0].name }}</span></template>
      </template>
      <template v-else>
        <Avatar v-for="(s, i) in shown" :key="s.id" :s="s" :size="av" :style="{ marginLeft: ml(i), zIndex: 10 - i }" />
        <span v-if="one" class="nm pn">{{ people[0].name }}</span>
      </template>
    </div>
  </div>
</template>
<style scoped>
.gw { position: fixed; left: 0; top: 0; z-index: 100; pointer-events: none; width: 0; height: 0 }
/* Ученик / группа: сначала как в панели (без рамки), потом — карточка урока, как в ячейке */
.ghost { position: absolute; box-sizing: border-box; display: flex; align-items: center; overflow: hidden; white-space: nowrap;
  border: 2px solid transparent; border-radius: 14px; background: color-mix(in srgb, var(--surface) 70%, transparent); color: var(--text); font-size: 13px; font-weight: 800;
  transition: width .18s ease, height .18s ease, left .18s ease, top .18s ease, border-color .18s, background .18s, box-shadow .18s }
.ghost :deep(.avw) { flex: none; transition: margin .18s ease } .ghost :deep(.av) { transition: width .18s ease, height .18s ease, font-size .18s ease }
.ghost :deep(.avw + .avw .av) { box-shadow: 0 0 0 2px var(--card) }
.ghost.small { border-color: var(--blue); border-bottom-width: 4px; border-radius: 10px; background: var(--card); box-shadow: 0 8px 20px rgba(0, 0, 0, .2) }
.nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; margin-left: 6px; opacity: 0; transition: opacity .15s .1s }
.ghost.small .nm { opacity: 1 }
@media (max-width: 719px) { .nm.pn { display: none } }
/* Урок из таблицы: копия карточки поверх оригинала */
.ghost.lesson { gap: 5px; justify-content: center; padding: 0; border-color: var(--hint-2); opacity: .92; transition: none }
.ghost.lesson .nm { display: none; margin: 0; font-size: 12px }
@media (min-width: 720px) { .ghost.lesson .nm { display: block } .ghost.lesson { justify-content: flex-start; padding: 0 6px } }
</style>

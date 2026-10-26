<script setup>
import { computed } from 'vue'
import { dnd } from '../composables/useDnd'
import { hh } from '../store/app'
import Avatar from './Avatar.vue'
import { useStudentsStore } from '../stores/students'
const studentStore = useStudentsStore()
const p = computed(() => dnd.payload)
const s = computed(() => p.value && studentStore.list.find(x => x.id === (p.value.kind === 'student' ? p.value.id : p.value.lesson.studentIds[0])))
// Урок из таблицы: призрак — копия карточки того же размера, она лежит ровно поверх оригинала и просто едет за курсором (без «прыжка»).
const lesson = computed(() => p.value?.kind === 'lesson' && dnd.grab)
const pos = computed(() => lesson.value
  ? { width: dnd.grab.w + 'px', height: dnd.grab.h + 'px', transform: `translate(${dnd.x - dnd.grab.dx}px, ${dnd.y - dnd.grab.dy}px)` }
  // ученик из списка: на тачскрине призрак смещён выше пальца, чтобы палец его не закрывал
  : { transform: `translate(${dnd.x}px, ${dnd.y}px) ${dnd.touch ? 'translate(-50%, -140%)' : 'translate(14px, 10px)'}` })
</script>
<template>
  <div v-if="dnd.active && s" class="ghost" :class="{ lesson }" :style="pos" :title="s.name">
    <template v-if="lesson"><Avatar :s="s" :size="20" /><span class="nm">{{ s.name }}</span></template>
    <template v-else><Avatar :s="s" :size="26" /><b>{{ s.name }}</b><small v-if="p.kind === 'lesson'">{{ hh(p.lesson.hour) }}</small></template>
  </div>
</template>
<style scoped>
.ghost { position: fixed; left: 0; top: 0; z-index: 100; pointer-events: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; white-space: nowrap;
  background: var(--card); border: 2px solid var(--blue); border-bottom-width: 4px; border-radius: 14px; color: var(--blue-d); font-size: 14px; box-shadow: 0 10px 24px rgba(0, 0, 0, .18); rotate: -3deg }
.ghost small { color: var(--hint) }
.ghost.lesson .nm { display: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-weight: 800 }
.ghost.lesson { overflow: hidden; gap: 5px; justify-content: center; padding: 0; rotate: none; border-radius: 10px; background: var(--blue-l); opacity: .92; box-shadow: 0 6px 16px rgba(0, 0, 0, .22) }
@media (min-width: 720px) { .ghost.lesson .nm { display: block } .ghost.lesson { justify-content: flex-start; padding: 0 6px } }
</style>

<script setup>
// Шторка: либо карточка урока (отметить / открыть ученика / убрать), либо выбор ученика для пустого слота.
import { computed } from 'vue'
import { state, hourOf, fmtSlot } from '../store/mock'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({ lesson: Object, slot: Object })
const emit = defineEmits(['close', 'remove', 'open', 'pick'])
const s = computed(() => props.lesson && state.students.find(x => x.id === props.lesson.studentId))
const when = computed(() => props.lesson ? fmtSlot(props.lesson.node.date, hourOf(props.lesson.node)) : fmtSlot(props.slot.date, props.slot.hour))
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')">
    <div class="sheet-box" role="dialog" aria-modal="true">
      <template v-if="lesson">
        <div class="row2"><Avatar :s="s" :size="56" /><div><h2 style="margin:0">{{ s.name }}</h2><div class="hint">{{ when }}</div></div></div>
        <button class="btn ghost" @click="emit('open', s.id)">Открыть ученика</button>
        <button class="btn ghost" style="color:var(--red)" @click="emit('remove', lesson)"><AppIcon name="trash" :size="16" /> Убрать урок</button>
        <button class="btn ghost" style="color:var(--hint)" @click="emit('close')">Закрыть</button>
      </template>
      <template v-else>
        <h2 style="margin:0">Кого назначить?</h2><div class="hint">{{ when }}</div>
        <button v-for="st in state.students" :key="st.id" class="pick" @click="emit('pick', st.id)"><Avatar :s="st" :size="36" /><b>{{ st.name }}</b><small>@{{ st.username }}</small></button>
        <button class="btn ghost" style="color:var(--hint)" @click="emit('close')">Отмена</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pick { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 14px; background: var(--card); color: var(--text); font: inherit; text-align: left; cursor: pointer }
.pick:hover { border-color: var(--blue); background: var(--blue-l) } .pick b { flex: 1 } .pick small { color: var(--hint-2) }
</style>

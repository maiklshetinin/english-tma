<script setup>
// Шторка: либо карточка урока (ученики, открыть ученика, убрать урок), либо выбор ученика для пустого слота.
import { computed } from 'vue'
import { state, fmtSlot, handle } from '../store/app'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import { useStudentsStore } from '../stores/students'
const studentStore = useStudentsStore()
const props = defineProps({ lesson: Object, slot: Object })
const emit = defineEmits(['close', 'remove', 'open', 'pick'])
const members = computed(() => (props.lesson?.studentIds ?? []).map(id => studentStore.list.find(x => x.id === id)).filter(Boolean))   // архивных учеников в списке нет
const when = computed(() => props.lesson ? fmtSlot(props.lesson.date, props.lesson.hour) : fmtSlot(props.slot.date, props.slot.hour))
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')">
    <div class="sheet-box" role="dialog" aria-modal="true">
      <template v-if="lesson">
        <template v-if="members.length === 1">
          <div class="row2"><Avatar :s="members[0]" :size="56" /><div><h2 style="margin:0">{{ members[0].name }}</h2><div class="hint">{{ when }}</div></div></div>
          <button class="btn ghost" @click="emit('open', members[0].id)">Открыть ученика</button>
        </template>
        <template v-else>
          <h2 style="margin:0">Групповой урок</h2><div class="hint">{{ when }}</div>
          <button v-for="st in members" :key="st.id" class="pick" @click="emit('open', st.id)"><Avatar :s="st" :size="36" /><b>{{ st.name }}</b><small>{{ handle(st) }}</small></button>
        </template>
        <button class="btn ghost" style="color:var(--red)" @click="emit('remove', lesson)"><AppIcon name="trash" :size="16" /> Убрать урок</button>
        <button class="btn ghost" style="color:var(--hint)" @click="emit('close')">Закрыть</button>
      </template>
      <template v-else>
        <h2 style="margin:0">Кого назначить?</h2><div class="hint">{{ when }}</div>
        <button v-for="st in studentStore.list" :key="st.id" class="pick" @click="emit('pick', st.id)"><Avatar :s="st" :size="36" /><b>{{ st.name }}</b><small>{{ handle(st) }}</small></button>
        <button class="btn ghost" style="color:var(--hint)" @click="emit('close')">Отмена</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pick { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 14px; background: var(--card); color: var(--text); font: inherit; text-align: left; cursor: pointer }
.pick:hover { border-color: var(--blue); background: var(--blue-l) } .pick b { flex: 1 } .pick small { color: var(--hint-2) }
</style>

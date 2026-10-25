<script setup>
// Вкладка «Путь» преподавателя: режим редактирования и пресеты пути. Пресет — заготовка (юниты + кружки),
// которую добавляют в путь ученика из его профиля. Путь конкретного ученика правится в карточке ученика.
import { ref, computed } from 'vue'
import { state, nextId as nextUnitId, addPreset, duplicatePreset, removePreset, restorePreset } from '../../store/mock'
import { showToast } from '../../composables/useToast'
import PathEditor from '../../components/PathEditor.vue'
import AppIcon from '../../components/AppIcon.vue'
const sel = ref(state.presets[0]?.id ?? null), name = ref(''), creating = ref(false)
const preset = computed(() => state.presets.find(p => p.id === sel.value) ?? state.presets[0])

function create() {
  const p = addPreset(name.value.trim() || 'Новый пресет', [{ id: nextUnitId(), title: 'Unit 1', sub: '', nodes: [] }])
  sel.value = p.id; name.value = ''; creating.value = false
}
const copy = () => { sel.value = duplicatePreset(preset.value).id }
function remove() {
  const gone = removePreset(preset.value.id); sel.value = state.presets[0]?.id ?? null
  showToast(`Пресет удалён: ${gone.preset.name}`, () => { restorePreset(gone); sel.value = gone.preset.id })
}
</script>
<template>
  <div class="page wide">
    <div class="card">
      <div class="seg tabs"><button v-for="p in state.presets" :key="p.id" :class="{ on: preset && p.id === preset.id }" @click="sel = p.id">{{ p.name }}</button>
        <button v-if="!creating" aria-label="Новый пресет" @click="creating = true"><AppIcon name="plus" :size="16" /></button></div>
      <div v-if="creating" class="row2" style="margin-top:10px">
        <input v-model="name" placeholder="Название пресета" style="flex:1;min-width:140px;margin:0" @keyup.enter="create" />
        <button class="btn" @click="create">Создать</button><button class="btn ghost" @click="creating = false">Отмена</button>
      </div>
      <template v-if="preset">
        <label class="lab" style="margin-top:12px">Название пресета</label>
        <div class="row2"><input v-model="preset.name" style="flex:1;min-width:140px;margin:0" />
          <button class="btn ghost" @click="copy"><AppIcon name="copy" :size="16" /> Копия</button>
          <button class="btn ghost" style="color:var(--red)" aria-label="Удалить пресет" @click="remove"><AppIcon name="trash" :size="16" /></button></div>
        <p class="hint" style="margin:10px 0 0">Добавить пресет в путь ученика можно в его профиле (вкладка «Ученики» или карточка на главной).</p>
      </template>
    </div>
    <PathEditor v-if="preset" :key="preset.id" :units="preset.units" preset />
    <div v-else class="card hint" style="text-align:center">Пресетов пока нет — создайте первый кнопкой «+».</div>
  </div>
</template>
<style scoped>
.tabs { flex-wrap: wrap }
</style>

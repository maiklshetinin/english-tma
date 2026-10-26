<script setup>
// Правка кружка: тип (ДЗ / повторение слов / слова + ДЗ), название, дата, монеты, колода, текст задания.
import { computed } from 'vue'
import { NODE_TYPES } from '../store/app'
import AppIcon from './AppIcon.vue'
import { useDecksStore } from '../stores/decks'
const deckStore = useDecksStore()
const props = defineProps({ units: Array, pos: Object, preset: Boolean })
defineEmits(['close', 'move', 'remove'])
const n = computed(() => props.units[props.pos.ui].nodes[props.pos.i])
const types = computed(() => {
  const t = Object.entries(NODE_TYPES)
  if (n.value.type === 'tutor') t.push(['tutor', 'Урок с учителем'])
  else if (!NODE_TYPES[n.value.type]) t.push([n.value.type, n.value.type])          // старые типы из прежних данных не теряем
  return t
})
const withDeck = computed(() => n.value.type === 'cards' || n.value.type === 'combo')
const withDesc = computed(() => n.value.type !== 'cards' && n.value.type !== 'tutor')
</script>
<template>
  <div class="bg" @click.self="$emit('close')"><div class="sheet">
    <h2>Кружок</h2>
    <label class="lab">Тип</label>
    <select v-model="n.type"><option v-for="t in types" :key="t[0]" :value="t[0]">{{ t[1] }}</option></select>
    <label class="lab">Название</label><input v-model="n.title" />
    <div class="row2">
      <div v-if="!preset" style="flex:2"><label class="lab">Дата</label><input v-model="n.date" type="date" /></div>
      <div v-if="n.type === 'tutor'" style="flex:1"><label class="lab">Время</label><input v-model="n.time" type="time" /></div>
      <div style="flex:1"><label class="lab">Монеты</label><input v-model.number="n.xp" type="number" min="0" /></div>
    </div>
    <template v-if="withDeck">
      <label class="lab">Колода слов</label>
      <select v-model="n.deckId"><option :value="undefined">Первая доступная</option><option v-for="d in deckStore.list" :key="d.id" :value="d.id">{{ d.title }}</option></select>
    </template>
    <template v-if="withDesc"><label class="lab">{{ n.type === 'combo' ? 'Текст домашнего задания' : 'Текст задания' }}</label><textarea v-model="n.desc" rows="3" /></template>
    <label v-if="!preset" class="row2" style="margin-bottom:8px"><input v-model="n.done" type="checkbox" style="width:auto;margin:0" /> Выполнено</label>
    <div class="row2">
      <button class="btn ghost" aria-label="Выше" @click="$emit('move', -1)"><AppIcon name="up" :size="18" /></button>
      <button class="btn ghost" aria-label="Ниже" @click="$emit('move', 1)"><AppIcon name="down" :size="18" /></button>
      <button class="btn ghost" style="color:var(--bad)" aria-label="Удалить кружок" @click="$emit('remove')"><AppIcon name="trash" :size="18" /></button>
      <button class="btn" style="margin-left:auto" @click="$emit('close')">Готово</button>
    </div>
  </div></div>
</template>
<style scoped>
.bg { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 20; display: flex; align-items: flex-end; justify-content: center }
.sheet { width: 100%; max-width: 560px; max-height: 92vh; overflow: auto; background: var(--card); border-radius: 24px 24px 0 0; padding: 22px 20px calc(24px + var(--safe-b)) }
.sheet h2 { margin: 0 0 10px } @media (min-width: 768px) { .bg { align-items: center } .sheet { border-radius: 24px } }
</style>

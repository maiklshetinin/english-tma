<script setup>
import { ref } from 'vue'
import { state } from '../store/mock'
const title = ref(''), raw = ref(''), studentId = ref(1)
function add() {
  const cards = raw.value.split('\n').map(l => l.split('-').map(s => s.trim())).filter(p => p[0] && p[1])
    .map(([front, back]) => ({ front, back }))
  if (!title.value || !cards.length) return
  state.decks.push({ id: Date.now(), studentId: studentId.value, title: title.value, cards })
  title.value = raw.value = ''
}
</script>
<template>
  <div class="page">
    <div class="card">
      <h3>Новый набор</h3>
      <input v-model="title" placeholder="Название набора" />
      <textarea v-model="raw" rows="5" placeholder="Слово - перевод (по одному в строке)"></textarea>
      <button class="btn" @click="add">Создать</button>
    </div>
    <div class="card" v-for="d in state.decks" :key="d.id"><h3>{{ d.title }}</h3><div class="hint">{{ d.cards.length }} слов</div></div>
  </div>
</template>

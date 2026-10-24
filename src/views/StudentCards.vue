<script setup>
import { ref } from 'vue'
import { myDecks } from '../store/mock'
import FlashcardDeck from '../components/FlashcardDeck.vue'
const active = ref(null)
</script>
<template>
  <div class="page">
    <template v-if="!active">
      <div class="card" v-for="d in myDecks" :key="d.id">
        <div class="row"><div><h3>{{ d.title }}</h3><div class="hint">{{ d.cards.length }} слов</div></div>
        <button class="btn" @click="active = d">Учить</button></div>
      </div>
    </template>
    <template v-else>
      <button class="btn ghost" @click="active = null">← К наборам</button>
      <FlashcardDeck :cards="active.cards" />
    </template>
  </div>
</template>

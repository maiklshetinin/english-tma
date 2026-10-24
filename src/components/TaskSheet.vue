<script setup>
import { relDay, fmtDate } from '../store/mock'
import AppIcon from './AppIcon.vue'
import FlashcardDeck from './FlashcardDeck.vue'
import { myDecks } from '../store/mock'
defineProps({ node: { type: Object, required: true } })
defineEmits(['close', 'complete'])
</script>
<template>
  <div class="bg" @click.self="$emit('close')">
    <div class="sheet">
      <h2>{{ node.title }}</h2>
      <div class="hint">{{ fmtDate(node.date) }}<template v-if="node.time"> · {{ node.time }}</template> · {{ relDay(node.date) }}</div>
      <p v-if="node.desc">{{ node.desc }}</p>
      <FlashcardDeck v-if="node.type === 'cards' && !node.done && myDecks[0]" :cards="myDecks[0].cards" @finish="$emit('complete', node)" />
      <template v-else>
        <p style="color:var(--ok);font-weight:800">+{{ node.xp }} монет</p>
        <template v-if="node.type === 'tutor'">
          <a v-if="node.link && !node.done" :href="node.link" target="_blank"><button class="btn">Присоединиться к уроку</button></a>
          <button v-if="!node.done" class="btn ghost" @click="$emit('complete', node)">Демо: учитель отметил проведённым</button>
        </template>
        <button v-else-if="!node.done" class="btn" @click="$emit('complete', node)">Отметить выполненным</button>
        <div v-if="node.done" style="color:var(--ok);font-weight:800;display:flex;gap:6px;align-items:center"><AppIcon name="check" /> Выполнено</div>
      </template>
      <button class="btn ghost" @click="$emit('close')">Закрыть</button>
    </div>
  </div>
</template>
<style scoped>
.bg { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 20; display: flex; align-items: flex-end; justify-content: center }
.sheet { width: 100%; max-width: 560px; background: var(--card); border-radius: 28px 28px 0 0; padding: 22px 20px calc(24px + var(--safe-b)); display: grid; gap: 8px; animation: up .25s }
.sheet h2 { margin: 0 } @keyframes up { from { transform: translateY(100%) } }
@media (min-width: 768px) { .bg { align-items: center } .sheet { border-radius: 28px } }
</style>

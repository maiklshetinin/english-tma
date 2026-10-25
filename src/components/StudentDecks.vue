<script setup>
// Блок в профиле ученика: какие колоды ему назначены и сколько у него к повторению.
import { state } from '../store/mock'
import { deckCounts } from '../composables/useSrs'
import { showToast } from '../composables/useToast'
import AppIcon from './AppIcon.vue'
const props = defineProps({ studentId: { type: [String, Number], required: true } })
const has = (d) => d.forAll || d.assigned.includes(props.studentId)
const cnt = (d) => deckCounts(d, props.studentId)
function toggle(d) {
  const i = d.assigned.indexOf(props.studentId)
  if (i >= 0) { d.assigned.splice(i, 1); showToast(`Колода «${d.title}» убрана`, () => d.assigned.push(props.studentId)) }
  else { d.assigned.push(props.studentId); showToast(`Колода «${d.title}» добавлена`, () => d.assigned.splice(d.assigned.indexOf(props.studentId), 1)) }
}
</script>
<template>
  <div class="card">
    <h3 class="h"><AppIcon name="cards" /> Колоды</h3>
    <div v-for="d in state.decks" :key="d.id" class="r">
      <div class="in"><b>{{ d.title }}</b>
        <div class="hint">{{ d.cards.length }} карт.<template v-if="has(d)"> · новых {{ cnt(d).new }} · к повторению {{ cnt(d).learn + cnt(d).due }}</template></div></div>
      <span v-if="d.forAll" class="badge ok">Для всех</span>
      <button v-else-if="has(d)" class="btn ghost sm" @click="toggle(d)"><AppIcon name="check" :size="16" /> Назначена</button>
      <button v-else class="btn sm" @click="toggle(d)"><AppIcon name="plus" :size="16" /> Добавить</button>
    </div>
    <p v-if="!state.decks.length" class="hint" style="margin:0">Колод пока нет — создайте их во вкладке «Слова».</p>
  </div>
</template>
<style scoped>
.h { display: flex; gap: 8px; align-items: center } .r { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 2px solid var(--surface) } .in { flex: 1; min-width: 0 }
</style>

<script setup>
// Круг прогресса выученных слов: выучено = слова с интервалом повторения ≥ 7 дней, среди всех слов доступных колод пользователя.
import { computed } from 'vue'
import { userStats } from '../composables/useSrs'
import ProgressRing from './ProgressRing.vue'
import { useDecksStore } from '../stores/decks'
const deckStore = useDecksStore()
const props = defineProps({ userKey: { type: [String, Number], required: true }, size: { type: Number, default: 76 } })
const st = computed(() => userStats(props.userKey, deckStore.forUser(props.userKey)))
const pct = computed(() => st.value.total ? Math.round(st.value.mature / st.value.total * 100) : 0)
</script>
<template>
  <div class="wr">
    <ProgressRing :value="pct" :size="size" color="var(--blue)" />
    <span class="hint">выучено слов<br />{{ st.mature }} из {{ st.total }}</span>
  </div>
</template>
<style scoped>
.wr { display: grid; justify-items: center; align-content: center; gap: 4px; text-align: center }
.wr .hint { font-size: 13px; line-height: 1.25 }
</style>

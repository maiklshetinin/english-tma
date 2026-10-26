<script setup>
// Шторка кружка. «Слова» — сессия повторения (учится ученик); «Слова + ДЗ» — сначала слова, затем отметка о выполненном ДЗ.
import { ref, computed } from 'vue'
import { relDay, fmtDate, deckOf } from '../store/app'
import AppIcon from './AppIcon.vue'
import StudySession from './StudySession.vue'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const props = defineProps({ node: { type: Object, required: true } })
const emit = defineEmits(['close', 'complete'])
const DEMO = import.meta.env.DEV
const deck = computed(() => deckOf(props.node))
const words = computed(() => props.node.type === 'cards' || props.node.type === 'combo')
const learner = computed(() => auth.role === 'student' && !!deck.value)        // слова учит ученик; преподаватель только отмечает выполнение
const wordsDone = ref(false)
const showSession = computed(() => words.value && learner.value && !props.node.done && !wordsDone.value)
const onWords = () => (props.node.type === 'cards' ? emit('complete', props.node) : (wordsDone.value = true))
</script>
<template>
  <div class="bg" @click.self="$emit('close')">
    <div class="sheet">
      <h2>{{ node.title }}</h2>
      <div v-if="node.date" class="hint">{{ fmtDate(node.date) }}<template v-if="node.time"> · {{ node.time }}</template> · {{ relDay(node.date) }}</div>
      <div v-if="node.type === 'combo' && !node.done" class="hint">{{ showSession ? 'Шаг 1 из 2 · повторение слов' : 'Шаг 2 из 2 · домашнее задание' }}</div>
      <p v-if="node.desc && (node.type !== 'combo' || !showSession)">{{ node.desc }}</p>
      <StudySession v-if="showSession" :deck="deck" :user-key="auth.currentStudentId" embedded @finish="onWords" @exit="$emit('close')" />
      <template v-else>
        <p style="color:var(--orange);font-weight:900;margin:4px 0">+{{ node.xp }} монет</p>
        <template v-if="node.type === 'tutor'">
          <a v-if="node.link && !node.done" :href="node.link" target="_blank"><button class="btn">Присоединиться к уроку</button></a>
          <button v-if="!node.done && (auth.role === 'teacher' || DEMO)" class="btn ghost" @click="$emit('complete', node)">Отметить урок проведённым</button>
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
.sheet { width: 100%; max-width: 560px; max-height: 92vh; overflow: auto; background: var(--card); border-radius: 24px 24px 0 0; padding: 22px 20px calc(24px + var(--safe-b)); display: grid; gap: 8px; animation: up .25s }
.sheet h2 { margin: 0 } @keyframes up { from { transform: translateY(100%) } }
@media (min-width: 768px) { .bg { align-items: center } .sheet { border-radius: 24px } }
</style>

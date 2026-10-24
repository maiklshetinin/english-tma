<script setup>
import { ref } from 'vue'
import { completeNode } from '../store/mock'
import TaskPath from '../components/TaskPath.vue'
import TaskSheet from '../components/TaskSheet.vue'
import PaymentAlert from '../components/PaymentAlert.vue'
import StatsGrid from '../components/StatsGrid.vue'
import PaymentCard from '../components/PaymentCard.vue'
const sel = ref(null)
const done = (n) => { completeNode(n); sel.value = null }
</script>
<template>
  <div class="layout">
    <section class="main"><PaymentAlert /><TaskPath @open="sel = $event" /></section>
    <!-- Метрики на десктопе живут справа; на мобильном — только во вкладке «Профиль» -->
    <aside class="aside"><StatsGrid /><PaymentCard /></aside>
    <TaskSheet v-if="sel" :node="sel" @close="sel = null" @complete="done" />
  </div>
</template>
<style scoped>
.layout { max-width: 560px; margin: 0 auto; padding: 12px 16px 120px; display: grid; gap: 14px }
.main { display: grid; gap: 12px } .aside { display: none }
@media (min-width: 768px) { .layout { max-width: 720px } }
@media (min-width: 1200px) {
  .layout { max-width: 1100px; grid-template-columns: minmax(0, 1fr) 340px; gap: 28px; padding-bottom: 40px }
  .aside { display: grid; gap: 14px; align-content: start; position: sticky; top: 24px }
}
</style>

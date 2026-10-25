<script setup>
import { ref, onMounted } from 'vue'
import { loadStudents } from '../../composables/useStudents'
import { state, pathOf, pctOf, unitOf } from '../../store/mock'
import AddStudent from '../../components/AddStudent.vue'
import Avatar from '../../components/Avatar.vue'
import StudentDetail from './StudentDetail.vue'
const adding = ref(false)
onMounted(() => loadStudents().catch(() => {}))      // подтянуть новых учеников и статусы «В приложении»
const PAY = { paid: ['Оплачено', 'ok'], due: ['Ждёт оплаты', 'warn'], overdue: ['Просрочено', 'bad'] }
</script>
<template>
  <StudentDetail v-if="state.selectedStudentId" :id="state.selectedStudentId" @back="state.selectedStudentId = null" />
  <div v-else class="page wide">
    <div class="row2" style="justify-content:space-between"><h2 style="margin:6px 0">Ученики</h2><button v-if="!adding" class="btn" @click="adding = true">+ Добавить ученика</button></div>
    <AddStudent v-if="adding" @close="adding = false" />
    <div v-if="!state.students.length && !adding" class="card" style="text-align:center"><b>Пока никого нет</b><p class="hint" style="margin:6px 0 0">Нажмите «Добавить ученика», введите имя и отправьте ему ссылку-приглашение.</p></div>
    <div v-else class="card tbl">
      <div class="tr th"><span>Ученик</span><span class="uc">Юнит</span><span>Оплата</span><span>Прогресс</span></div>
      <button class="tr" v-for="s in state.students" :key="s.id" @click="state.selectedStudentId = s.id">
        <span class="who"><Avatar :s="s" /><span><b>{{ s.name }}</b><small v-if="s.status === 'invited'" class="badge warn" style="justify-self:start">Ждёт приглашения</small><small class="hint ui">{{ unitOf(pathOf(s.id)) }}</small></span></span>
        <span class="hint uc">{{ unitOf(pathOf(s.id)) }}</span>
        <span><span class="badge" :class="PAY[s.payment.status][1]">{{ PAY[s.payment.status][0] }}</span></span>
        <span class="prog"><span class="bar"><i :style="{ width: pctOf(pathOf(s.id)) + '%' }" /></span>{{ pctOf(pathOf(s.id)) }}%</span>
      </button>
    </div>
  </div>
</template>
<style scoped>
.tbl { padding: 6px 8px } .tr { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 10px; align-items: center; width: 100%; padding: 12px 10px; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; border-radius: 14px }
button.tr:hover { background: var(--blue-l) } .th { font-size: 13px; color: var(--hint); cursor: default }
.who { display: flex; align-items: center; gap: 10px } .who span { display: grid } .ui { display: block } .uc { display: none }
.prog { display: flex; align-items: center; gap: 8px; font-weight: 700 } .bar { flex: 1; height: 12px; border-radius: 9px; background: var(--border); overflow: hidden; min-width: 40px } .bar i { display: block; height: 100%; background: var(--green); border-radius: 9px }
.tr > :nth-child(4) { grid-column: 1 / -1 } .th > :nth-child(4) { display: none }
@media (min-width: 768px) { .tr { grid-template-columns: 1.4fr 1.4fr 1fr 1.2fr } .uc { display: block } .ui { display: none } .tr > :nth-child(4) { grid-column: auto } .th > :nth-child(4) { display: block } }
</style>

<script setup>
// Список уроков одного ученика (или всех — без studentId): тот же, что видит ученик на вкладке «Уроки».
// У преподавателя (canMark) у каждого урока есть кнопка «Проведён»: статус сохраняется на сервере, а у ученика
// «Запланирован» меняется на «Проведён» (он увидит это при открытии вкладки или возврате в приложение).
import { computed } from 'vue'
import { allLessons, fmtDate, relDay } from '../store/app'
import { useScheduleStore } from '../stores/schedule'
import { showToast } from '../composables/useToast'
const props = defineProps({ studentId: { type: String, default: null }, canMark: Boolean })
const scheduleStore = useScheduleStore()
const groups = computed(() => {
  const m = {}
  allLessons.value.filter(l => !props.studentId || l.studentId === props.studentId).forEach(l => (m[l.date] ??= []).push(l))
  return Object.entries(m)
})
function toggle(row) {
  const was = row.done
  scheduleStore.setDone(row.lesson, !was)
  showToast(was ? 'Отметка «проведён» снята' : 'Урок отмечен проведённым', () => scheduleStore.setDone(row.lesson, was))
}
</script>
<template>
  <div class="lessons">
    <div v-if="!groups.length" class="card hint" style="text-align:center">Пока нет уроков в расписании</div>
    <div v-for="[date, list] in groups" :key="date" class="grp">
      <div class="hint" style="font-weight:700;text-transform:capitalize;margin:6px 4px">{{ fmtDate(date) }} · {{ relDay(date) }}</div>
      <div class="card row" v-for="l in list" :key="l.id" :class="{ off: l.canceled }" :style="{ opacity: l.done && !canMark ? .6 : 1 }">
        <div><b>{{ l.time }}</b> · {{ l.title }}
          <div class="hint" v-if="!studentId">{{ l.studentName }}</div>
          <div class="hint" v-if="l.canceled">Без оплаты</div>
          <div class="hint" v-else-if="l.price">Цена: {{ l.price }}</div></div>
        <div class="row2" style="justify-content:flex-end">
          <span v-if="l.canceled" class="badge bad">{{ canMark ? 'Отменил ученик' : 'Отменён вами' }}</span>
          <span v-else class="badge" :class="l.done ? 'ok' : 'warn'">{{ l.done ? 'Проведён' : 'Запланирован' }}</span>
          <button v-if="canMark && !l.canceled" class="btn" :class="{ ghost: l.done }" @click="toggle(l)">{{ l.done ? 'Отменить' : 'Проведён' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>.lessons, .grp { display: grid; gap: 8px } .off { border-color: var(--red-l) } .off b { text-decoration: line-through; color: var(--hint) }</style>

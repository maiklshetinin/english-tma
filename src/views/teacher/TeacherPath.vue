<script setup>
// Вкладка «Курсы» преподавателя: курсы и под ними — «Как видит ученик». Как в Figma: нажали курс — он показан ниже (смотреть и проходить),
// двойное нажатие или «›» — редактор.
// Пресеты пути (старый вид) убраны 05.11.2026 — путь ученика по-прежнему правится в его карточке.
import { ref } from 'vue'
import CourseList from '../../components/CourseList.vue'
import CourseViewer from '../../components/CourseViewer.vue'
const sel = ref(null)                  // выбранный курс: показывается в «Как видит ученик»
</script>
<template>
  <div class="page wide">
    <CourseList v-model:selected="sel" />
    <CourseViewer :id="sel" />
  </div>
</template>

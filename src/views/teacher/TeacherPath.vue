<script setup>
// Вкладка «Курсы» преподавателя: курсы и под ними — «Как видит ученик». Как в Figma: нажали курс — он показан ниже (смотреть и проходить),
// двойное нажатие или «›» — редактор.
// Пресеты пути (старый вид) убраны 05.11.2026 — путь ученика по-прежнему правится в его карточке.
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import CourseList from '../../components/CourseList.vue'
import CourseViewer from '../../components/CourseViewer.vue'
import AppIcon from '../../components/AppIcon.vue'
const sel = ref(useRoute().query.c ?? null)
const list = ref(null)          // 25.11.2026: карандаш и корзина выбранного курса — в строке прогресса (CourseViewer, слот actions)        // выбранный курс: показывается в «Как видит ученик» (из адреса — после перезагрузки тот же)
</script>
<template>
  <div class="page wide">
    <CourseList ref="list" v-model:selected="sel" />
    <CourseViewer :id="sel">
      <template #actions>
        <button class="tpa" title="Редактировать курс" aria-label="Редактировать курс" @click="list?.open(sel)"><AppIcon name="pencil" :size="13" /></button>
        <button class="tpa" :title="'Картинка на иконку курса: выбрать файл. Ещё — перетащить картинку на иконку или Ctrl+V. Режется в квадрат по центру'" aria-label="Картинка курса" @click="list?.pickCover()"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg></button>
        <button v-if="list?.hasCover(sel)" class="tpa" title="Убрать картинку курса — снова значок" aria-label="Убрать картинку курса" @click="list?.dropCover()"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <button class="tpa del" title="Удалить курс" aria-label="Удалить курс" @click="list?.removeSel()"><AppIcon name="trash" :size="13" /></button>
      </template>
    </CourseViewer>
  </div>
</template>
<style scoped>
.tpa { flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--border); border-radius: 50%; background: var(--card); color: var(--hint); cursor: pointer }
.tpa:hover { color: var(--blue); border-color: var(--blue) } .tpa.del:hover { color: var(--red, #e5484d); border-color: var(--red, #e5484d) }
</style>

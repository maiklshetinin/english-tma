// «Урок проведён» — маленький праздник (16.11.2026): учитель нажал «Урок проведён» — карточка урока подпрыгивает,
// от неё всплывает «+1 500», сумма дня мигает зелёным, а деньги недели досчитываются вверх (WeekGrid, WeekMoney).
// Срабатывает только от нажатия учителя (TeacherHome → toggleDone), не от синхронизации и не от «Отменить» в тосте.
import { ref } from 'vue'

export const doneBurst = ref(null)      // { id, date, t } — последний отмеченный урок
export const celebrateDone = (lesson) => { doneBurst.value = { id: lesson.id, date: lesson.date, t: Date.now() } }
/** Был ли «праздник» только что (деньги недели досчитываем только тогда, а не при переключении недель). */
export const justCelebrated = (ms = 1500) => !!doneBurst.value && Date.now() - doneBurst.value.t < ms
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

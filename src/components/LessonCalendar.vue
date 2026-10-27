<script setup>
// Календарь уроков ученика по месяцам: у ученика — вкладка «Уроки», у преподавателя (teacher) — карточка ученика.
// У преподавателя ещё: кнопка «Проведён» у урока и деньги за месяц — «Ожидается» (все уроки, кроме отменённых) и «Факт» (проведённые).
//  • Цвет урока: зелёный — проведён (подтвердил преподаватель), серый — запланирован, красный — отменил ученик.
//  • ‹ › — листать месяцы: история хранится вся (GET /lessons/history), две живые недели — свежие из расписания.
//  • Нажатие на день — уроки этого дня под календарём; внизу — итог месяца.
import { computed, ref, watch } from 'vue'
import { DAYS, hh, todayYmd } from '../store/app'
import { useScheduleStore } from '../stores/schedule'
import { useStudentsStore } from '../stores/students'
import { priceAt, fmtMoney } from '../utils/price'
import { showToast } from '../composables/useToast'
const props = defineProps({ studentId: { type: String, default: null }, teacher: Boolean, compact: Boolean })   // compact — всё в одной карточке, урок дня — по нажатию на день
const scheduleStore = useScheduleStore(), studentStore = useStudentsStore()

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const today = todayYmd()                                   // по поясу расписания (по умолчанию Москва)
const month = ref(today.slice(0, 7))                       // 'YYYY-MM'
const picked = ref(null)                                   // выбранный день 'YYYY-MM-DD'

const all = computed(() => scheduleStore.allOf(props.studentId))
const statusOf = (l) => (l.canceled?.[props.studentId] ? 'off' : l.done ? 'done' : 'plan')
const priceOf = (l) => {
  if (l.canceled?.[props.studentId]) return 0
  if (l.done && l.prices?.[props.studentId] != null) return l.prices[props.studentId]
  return priceAt(studentStore.findAny(props.studentId), l.date, l.hour)
}
const byDate = computed(() => { const m = {}; for (const l of all.value) (m[l.date] ??= []).push(l); return m })
// Цвет дня — по его урокам: есть проведённый → зелёный, иначе запланированный → серый, иначе только отменённые → красный
const dayStatus = (d) => { const ls = byDate.value[d]; if (!ls) return ''; const ss = ls.map(statusOf); return ss.includes('done') ? 'done' : ss.includes('plan') ? 'plan' : 'off' }

// Сетка месяца: с понедельника, 5–6 недель
const cells = computed(() => {
  const [y, mo] = month.value.split('-').map(Number)
  const first = new Date(y, mo - 1, 1), days = new Date(y, mo, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const out = []
  for (let i = 0; i < lead; i++) out.push(null)
  for (let d = 1; d <= days; d++) out.push(`${month.value}-${String(d).padStart(2, '0')}`)
  while (out.length % 7) out.push(null)
  return out
})
const shift = (n) => {
  const [y, mo] = month.value.split('-').map(Number), d = new Date(y, mo - 1 + n, 1)
  month.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const title = computed(() => { const [y, mo] = month.value.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}` })
const isThisMonth = computed(() => month.value === today.slice(0, 7))
const hasEarlier = computed(() => all.value.some(l => l.date.slice(0, 7) < month.value))
const hasLater = computed(() => all.value.some(l => l.date.slice(0, 7) > month.value))
// Листать можно туда, где есть уроки, и всегда — обратно к текущему месяцу
const prevOff = computed(() => !hasEarlier.value && month.value <= today.slice(0, 7))
const nextOff = computed(() => !hasLater.value && month.value >= today.slice(0, 7))

// При открытии и смене месяца выбираем день: сегодня (если в этом месяце) или ближайший день с уроком
watch([month, all], () => {
  if (props.compact) { if (picked.value && !picked.value.startsWith(month.value)) picked.value = null; return }      // компактно: ничего не выбрано, пока не нажали
  if (picked.value?.startsWith(month.value)) return
  const inMonth = Object.keys(byDate.value).filter(d => d.startsWith(month.value)).sort()
  picked.value = isThisMonth.value ? (inMonth.find(d => d >= today) ?? today) : (inMonth[0] ?? null)
}, { immediate: true })
const pick = (d) => { if (!props.compact) { picked.value = d; return } picked.value = picked.value === d || !byDate.value[d] ? null : d }
const dayLessons = computed(() => (picked.value ? byDate.value[picked.value] ?? [] : []))
const pickedTitle = computed(() => { if (!picked.value) return ''; const d = new Date(picked.value + 'T00:00'); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${DAYS[(d.getDay() + 6) % 7].toLowerCase()}` })

// Итог месяца. paid — факт (проведённые, по зафиксированным ценам); expected — ожидается: проведённые + запланированные (по цене на время урока);
// lost — отменённые учеником (по цене на время урока, без оплаты)
const sum = computed(() => {
  const s = { done: 0, plan: 0, off: 0, paid: 0, expected: 0, lost: 0 }
  for (const l of all.value) if (l.date.startsWith(month.value)) {
    const st = statusOf(l); s[st]++
    if (st === 'done') { s.paid += priceOf(l); s.expected += priceOf(l) }
    else if (st === 'plan') s.expected += priceOf(l)
    else s.lost += priceAt(studentStore.findAny(props.studentId), l.date, l.hour)
  }
  return s
})
const STATUS = computed(() => ({ done: 'Проведён', plan: 'Запланирован', off: props.teacher ? 'Отменил ученик' : 'Отменён вами' }))
// Преподаватель: «Проведён» / «Отменить» прямо в календаре (отменённый учеником урок не отмечаем)
const locked = (l) => l.done && (Object.keys(l.names ?? {}).length > 0 || l.studentIds.some(id => studentStore.findAny(id)?.archived))
function toggle(l) {
  const was = !!l.done
  scheduleStore.setDone(l, !was)
  showToast(was ? 'Отметка «проведён» снята' : 'Урок отмечен проведённым', () => scheduleStore.setDone(l, was))
}
</script>

<template>
  <div class="lc" :class="{ cmp: compact }">
  <div class="cal card">
    <div class="mh">
      <button class="nav" :disabled="prevOff" aria-label="Предыдущий месяц" @click="shift(-1)">‹</button>
      <div class="mt"><b>{{ title }}</b><button v-if="!isThisMonth" class="today" @click="month = today.slice(0, 7); picked = today">Сегодня</button></div>
      <button class="nav" :disabled="nextOff" aria-label="Следующий месяц" @click="shift(1)">›</button>
    </div>
    <div class="grid wd"><span v-for="(d, i) in DAYS" :key="d" :class="{ we: i > 4 }">{{ d }}</span></div>
    <div class="grid days">
      <template v-for="(d, i) in cells" :key="i">
        <span v-if="!d" class="day empty" />
        <button v-else class="day" :class="[dayStatus(d), { today: d === today, picked: d === picked, has: byDate[d], past: d < today }]" :aria-label="`${+d.slice(8)}: ${(byDate[d] || []).length} урок(ов)`" @click="pick(d)">
          <span class="n">{{ +d.slice(8) }}</span>
          <span v-if="byDate[d]?.length > 1" class="dots"><i v-for="l in byDate[d].slice(0, 3)" :key="l.id" :class="statusOf(l)" /></span>
        </button>
      </template>
    </div>
    <div v-if="!compact" class="legend"><span><i class="done" />Проведён</span><span><i class="plan" />Запланирован</span><span><i class="off" />Отменён</span></div>
    <template v-else>
      <!-- Урок выбранного дня — прямо в карточке, по нажатию на день -->
      <div v-for="l in dayLessons" :key="l.id" class="cl" :class="statusOf(l)">
        <i class="dot" /><b>{{ pickedTitle }} · {{ hh(l.hour, l.minute) }}</b>
        <span class="cs">{{ STATUS[statusOf(l)] }}{{ statusOf(l) !== 'off' && priceOf(l) ? ` · ${fmtMoney(priceOf(l))}` : '' }}</span>
        <button v-if="teacher && statusOf(l) !== 'off'" class="btn sm" :class="{ ghost: l.done }" :disabled="locked(l)" @click="toggle(l)">{{ l.done ? 'Отменить' : 'Проведён' }}</button>
      </div>
      <!-- Итог месяца: легенда = счётчики, ниже деньги одной строкой -->
      <div class="cnt"><span><i class="done" /><b>{{ sum.done }}</b> проведено</span><span><i class="plan" /><b>{{ sum.plan }}</b> запланировано</span><span><i class="off" /><b>{{ sum.off }}</b> отменено</span></div>
      <div v-if="teacher && (sum.expected || sum.lost)" class="cm">
        <div class="cmr"><span><b class="g">{{ fmtMoney(sum.paid) }}</b> из {{ fmtMoney(sum.expected) }} за месяц</span><b v-if="sum.lost" class="r">−{{ fmtMoney(sum.lost) }}</b></div>
        <div class="mbar"><i :style="{ width: (sum.expected ? Math.min(100, sum.paid / sum.expected * 100) : 0) + '%' }" /></div>
      </div>
    </template>
  </div>

  <template v-if="!compact">
  <div v-if="picked" class="dayl">
    <div class="hint dt">{{ pickedTitle }}</div>
    <div v-if="!dayLessons.length" class="card hint none">В этот день уроков нет</div>
    <div v-for="l in dayLessons" :key="l.id" class="card ls" :class="statusOf(l)">
      <span class="bar" />
      <div class="info"><b class="tm">{{ hh(l.hour, l.minute) }}</b> · Урок
        <div class="hint">{{ statusOf(l) === 'off' ? 'Без оплаты' : priceOf(l) ? `Цена: ${fmtMoney(priceOf(l))}` : '' }}</div></div>
      <span class="badge" :class="{ done: 'ok', plan: 'warn', off: 'bad' }[statusOf(l)]">{{ STATUS[statusOf(l)] }}</span>
      <button v-if="teacher && statusOf(l) !== 'off'" class="btn sm" :class="{ ghost: l.done }" :disabled="locked(l)" :title="locked(l) ? 'В уроке ученик из архива или удалённый — отметку не снять' : ''" @click="toggle(l)">{{ l.done ? 'Отменить' : 'Проведён' }}</button>
    </div>
  </div>

  <div class="card sum" :class="{ t: teacher }">
    <div><b class="g">{{ sum.done }}</b><small>проведено</small></div>
    <div><b>{{ sum.plan }}</b><small>запланировано</small></div>
    <div><b class="r">{{ sum.off }}</b><small>отменено</small></div>
    <div v-if="sum.paid && !teacher"><b>{{ fmtMoney(sum.paid) }}</b><small>за проведённые</small></div>
  </div>
  <div v-if="teacher" class="card money">
    <div class="mrow"><span>Ожидается за месяц</span><b>{{ fmtMoney(sum.expected) }}</b></div>
    <div class="mrow real"><span>Факт — проведённые</span><b>{{ fmtMoney(sum.paid) }}</b></div>
    <div class="mbar" role="progressbar" :aria-valuenow="sum.expected ? Math.round(sum.paid / sum.expected * 100) : 0" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: (sum.expected ? Math.min(100, sum.paid / sum.expected * 100) : 0) + '%' }" /></div>
    <div v-if="sum.lost" class="mrow lost"><span>Потеряно — отменил ученик</span><b>−{{ fmtMoney(sum.lost) }}</b></div>
  </div>
  </template>
  </div>
</template>

<style scoped>
.lc { width: 100%; max-width: 520px; margin: 0 auto; display: grid; gap: 12px }
.cal { padding: 14px 12px 12px; display: grid; gap: 6px }
.mh { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px }
.mt { display: flex; align-items: center; gap: 8px } .mt b { font-size: 18px; font-weight: 900 }
.today { border: 2px solid var(--border); background: var(--card); color: var(--blue); border-radius: 99px; font: inherit; font-size: 12px; font-weight: 800; padding: 2px 10px; cursor: pointer }
.nav { width: 40px; height: 40px; border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 12px; background: var(--card); color: var(--text); font: inherit; font-size: 22px; font-weight: 900; line-height: 1; cursor: pointer }
.nav:disabled { opacity: .35; cursor: default }
.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px }
.wd span { text-align: center; font-size: 12px; font-weight: 800; color: var(--hint-2) } .wd .we { color: var(--purple-d) }
.day { position: relative; aspect-ratio: 1 / 1; max-height: 56px; display: grid; place-content: center; justify-items: center; gap: 3px; border: 2px solid transparent; border-radius: 12px; background: var(--surface);
  font: inherit; color: var(--text); cursor: pointer; padding: 0 }
.day.empty { background: none; cursor: default }
.day .n { font-size: 14px; font-weight: 800; line-height: 1 } .day.past:not(.has) .n { color: var(--hint-2) }
.day.today { border-color: var(--red); } .day.today .n { color: var(--red-d) }
/* День с уроками: проведён — зелёный, запланирован — серый, отменён — красный (как кнопки Duolingo, с нижней гранью) */
.day.done { background: var(--green); box-shadow: inset 0 -4px 0 var(--green-d) } .day.done .n { color: #fff }
.day.plan { background: var(--border); box-shadow: inset 0 -4px 0 var(--hint-2) } .day.plan .n { color: var(--text) }
.day.off { background: var(--red-l); box-shadow: inset 0 -4px 0 var(--red) } .day.off .n { color: var(--red-d); text-decoration: line-through }
.day.picked { border-color: var(--blue); outline: 3px solid var(--blue); outline-offset: 1px }
.day.picked:not(.has) { background: var(--blue-l) }
.dots { display: flex; gap: 3px; height: 6px } .dots i, .legend i { width: 6px; height: 6px; border-radius: 50% }
.day.done .dots i { box-shadow: 0 0 0 1.5px #fff } .legend i { width: 12px; height: 12px; border-radius: 4px }
.done { --c: var(--green) } .plan { --c: var(--hint-2) } .off { --c: var(--red) }
.dots i, .legend i { background: var(--c) }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; justify-content: center; margin-top: 4px; font-size: 12px; font-weight: 700; color: var(--hint) }
.legend span { display: inline-flex; align-items: center; gap: 5px } .legend i { display: inline-block }

.dayl { display: grid; gap: 8px } .dt { font-weight: 800; margin: 4px 4px 0; text-transform: capitalize }
.none { text-align: center; padding: 14px }
.ls { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 18px; overflow: hidden }
.ls .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--c) }
.ls .info { flex: 1; min-width: 0 } .ls .tm { font-size: 17px }
.ls.off .tm { text-decoration: line-through; color: var(--hint) }
.ls.done { background: var(--green-l); border-color: var(--green) }

.money { display: grid; gap: 8px; padding: 14px 16px }
.mrow { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 14px; font-weight: 800; color: var(--hint) }
.mrow b { font-size: 20px; font-weight: 900; color: var(--text) } .mrow.real b { color: var(--green-d) } .mrow.lost b { font-size: 16px; color: var(--red-d) }
html[data-theme='dark'] .mrow.real b { color: var(--green) } html[data-theme='dark'] .mrow.lost b { color: var(--red) }
.mbar { height: 12px; border-radius: 99px; background: var(--border); overflow: hidden } .mbar i { display: block; height: 100%; border-radius: 99px; background: var(--green); box-shadow: inset 0 -3px 0 var(--green-d); transition: width .25s }
.ls .btn { flex: none } .ls { flex-wrap: wrap; row-gap: 8px } .ls .info { flex: 1 1 150px }
.sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 12px; text-align: center }
.sum div { display: grid; gap: 2px } .sum b { font-size: 20px; font-weight: 900 } .sum small { font-size: 12px; font-weight: 800; color: var(--hint); line-height: 1.15 }
.sum .g { color: var(--green-d) } .sum .r { color: var(--red-d) }
@media (max-width: 480px) { .sum { grid-template-columns: repeat(2, 1fr); row-gap: 12px } }
.sum.t { grid-template-columns: repeat(3, 1fr) }
html[data-theme='dark'] .sum .g { color: var(--green) } html[data-theme='dark'] .sum .r { color: var(--red) }
.lc.cmp { max-width: none }
.lc.cmp .day { max-height: 44px; border-radius: 10px } .lc.cmp .day .n { font-size: 13px }
.cl { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 6px; padding: 8px 10px; border-radius: 12px; background: var(--surface); font-size: 14px }
.cl .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c) } .cl .cs { flex: 1; color: var(--hint); font-weight: 600 } .cl.off b { text-decoration: line-through; color: var(--hint) }
.cnt { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--hint) }
.cnt span { display: inline-flex; align-items: center; gap: 5px } .cnt i { width: 10px; height: 10px; border-radius: 3px; background: var(--c) } .cnt b { color: var(--text); font-weight: 900 }
.cm { display: grid; gap: 6px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--border) }
.cmr { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; font-weight: 700; color: var(--hint) } .cmr b { font-size: 17px; font-weight: 900 }
.cmr .g { color: var(--green-d) } .cmr .r { color: var(--red-d); font-size: 15px } .cm .mbar { height: 8px }
</style>

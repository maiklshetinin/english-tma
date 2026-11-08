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
import { useAuthStore } from '../stores/auth'
import ReceiptSheet from './ReceiptSheet.vue'
import AppIcon from './AppIcon.vue'
import { lineDate, receiptTotal, receiptCount } from '../utils/receipt'
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
const monthName = computed(() => MONTHS[+month.value.slice(5, 7) - 1].toLowerCase())      // «ноябрь» — в «Счёт за ноябрь»
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
const lessonsWord = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'урок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'урока' : 'уроков'}`
// Ученик и его цена — для строки «Ученик: … · цена» под месяцем
const who = computed(() => { const st = studentStore.findAny(props.studentId); return { name: st?.name ?? '', price: st?.price || 0 } })
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
// Счёт за месяц (у преподавателя): проведённые уроки месяца по зафиксированным ценам
const auth = useAuthStore(), receiptOpen = ref(false)
const receipt = computed(() => ({
  month: month.value, student: studentStore.findAny(props.studentId)?.name ?? '', teacher: auth.user?.first_name || '',      // имя преподавателя — из его Telegram
  lines: all.value.filter(l => l.date.startsWith(month.value) && statusOf(l) === 'done').sort((a, b) => (a.date + hh(a.hour, a.minute)).localeCompare(b.date + hh(b.hour, b.minute)))
    .map(l => ({ date: l.date, hour: l.hour, minute: l.minute ?? 0, price: priceOf(l) })),
  days: Object.fromEntries(Object.keys(byDate.value).filter(d => d.startsWith(month.value)).map(d => [d, dayStatus(d)])),      // календарь месяца в счёте
}))
const STATUS = computed(() => ({ done: 'Проведён', plan: 'Запланирован', off: props.teacher ? 'Отменил ученик' : 'Отменён вами' }))
// Календарь только показывает уроки: статус («проведён», отмена) меняют лишь на «Главной», в расписании
</script>

<template>
  <div class="lc" :class="{ cmp: compact }">
  <div class="cal card">
    <!-- Карточка ученика — копия картинки счёта: крупно месяц (стрелки маленькие справа), «Ученик: … · цена», пунктир, календарь, пунктир, строки, пунктир, итог -->
    <template v-if="compact">
      <div class="rtop"><b>{{ title }}</b>
        <button v-if="!isThisMonth" class="today" @click="month = today.slice(0, 7); picked = null">Сегодня</button>
        <button class="ar" :disabled="prevOff" aria-label="Предыдущий месяц" title="Предыдущий месяц" @click="shift(-1)"><AppIcon name="back" :size="18" /></button>
        <button class="ar next" :disabled="nextOff" aria-label="Следующий месяц" title="Следующий месяц" @click="shift(1)"><AppIcon name="back" :size="18" /></button>
      </div>
      <span class="rsub">Ученик: {{ who.name }}<template v-if="teacher && who.price"> · {{ fmtMoney(who.price) }} за урок</template></span>
      <div class="dash" />
    </template>
    <div v-else class="mh">
      <button class="icon-btn nav" :disabled="prevOff" aria-label="Предыдущий месяц" title="Предыдущий месяц" @click="shift(-1)"><AppIcon name="back" :size="20" /></button>
      <div class="mt"><b>{{ title }}</b><button v-if="!isThisMonth" class="today" @click="month = today.slice(0, 7); picked = today">Сегодня</button></div>
      <button class="icon-btn nav next" :disabled="nextOff" aria-label="Следующий месяц" title="Следующий месяц" @click="shift(1)"><AppIcon name="back" :size="20" /></button>
    </div>
    <div class="grid wd"><span v-for="(d, i) in DAYS" :key="d" :class="{ we: i > 4 }">{{ d }}</span></div>
    <div class="grid days">
      <template v-for="(d, i) in cells" :key="i">
        <span v-if="!d" class="day empty" />
        <button v-else class="day" :class="[dayStatus(d), { today: d === today, picked: d === picked, has: byDate[d], past: d < today }]" :aria-label="`${+d.slice(8)}: ${(byDate[d] || []).length} урок(ов)`" @click="pick(d)">
          <span class="n">{{ +d.slice(8) }}</span><small v-if="d === today" class="tl">сегодня</small>
          <span v-if="byDate[d]?.length > 1" class="dots"><i v-for="l in byDate[d].slice(0, 3)" :key="l.id" :class="statusOf(l)" /></span>
        </button>
      </template>
    </div>
    <div v-if="!compact" class="legend"><span><i class="done" />Проведён</span><span><i class="plan" />Запланирован</span><span><i class="off" />Отменён</span></div>
    <!-- Ниже — ровно то, что уйдёт в счёт: проведённые уроки, «Проведено», «К оплате»; отменённые видны крестиком в календаре -->
    <template v-if="compact">
      <div class="dash" />
      <div v-for="l in receipt.lines" :key="l.date + l.hour + '-' + (l.minute || 0)" class="ln" :class="{ hl: picked === l.date }"><span>{{ lineDate(l) }}</span><i /><b v-if="teacher">{{ fmtMoney(l.price) }}</b></div>
      <p v-if="!receipt.lines.length" class="none">В этом месяце проведённых уроков пока нет</p>
      <template v-if="teacher">
        <div class="dash" />
        <div class="rcnt"><span>Проведено</span><b>{{ receiptCount(receipt) }}</b></div>
        <div class="rtot"><span>К оплате</span><b>{{ fmtMoney(receiptTotal(receipt)) }}</b></div>
        <span v-if="sum.plan" class="ahead">Впереди ещё {{ lessonsWord(sum.plan) }} · {{ fmtMoney(sum.expected - sum.paid) }}</span>
        <button v-if="sum.done" class="btn primary send" title="Счёт за месяц: скачать (картинка или PDF) или отправить в Telegram" @click="receiptOpen = true"><AppIcon name="receipt" :size="20" /> Выставить счёт</button>
      </template>
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
  <ReceiptSheet v-if="receiptOpen" :receipt="receipt" @close="receiptOpen = false" />
  </div>
</template>

<style scoped>
.lc { width: 100%; max-width: 520px; margin: 0 auto; display: grid; gap: 12px }
.cal { padding: 14px 12px 12px; display: grid; gap: 6px }
.mh { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px }
.mt { display: flex; align-items: center; gap: 8px } .mt b { font-size: 18px; font-weight: 900 }
.today { border: 1px solid var(--border); background: var(--card); color: var(--blue); border-radius: 99px; font: inherit; font-size: 12px; font-weight: 800; padding: 2px 10px; cursor: pointer }
/* Стрелки месяцев — такие же квадратные кнопки, как «назад» (BackButton) */
.nav { border-color: var(--border) } .nav.next svg { transform: scaleX(-1) }
.nav:disabled { opacity: .35; cursor: default }
.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px }
.wd span { text-align: center; font-size: 12px; font-weight: 800; color: var(--hint-2) }
.day { position: relative; justify-self: center; width: 100%; max-width: 56px; aspect-ratio: 1 / 1; max-height: 56px; display: grid; place-content: center; justify-items: center; gap: 3px; border: 0; border-radius: 10px; background: none;
  font: inherit; color: var(--text); cursor: pointer; padding: 0 }
.day.empty { background: none; cursor: default }
.day .n { font-size: 14px; font-weight: 800; line-height: 1 } .day.past:not(.has) .n { color: var(--hint-2) }
/* Сегодня — синим (красный — это «отменён»): синее число и черта под ним; у дня с уроком цвет числа — как у урока, черта остаётся */
/* Сегодня — серой подложкой, как в расписании */
.day.today .n { color: var(--blue); font-weight: 900 } .day .tl { position: absolute; left: 0; right: 0; bottom: 1px; text-align: center; font-size: 9px; font-weight: 900; line-height: 1; color: var(--blue) }      /* сегодня — синее число и подпись «сегодня»; серым — только запланированные */      /* сегодня — синее число с чертой; серым — только запланированные */

/* Статусы как в расписании (сборки в GitHub): кружок в углу дня. Проведён — зелёная галочка, отменён — красный крестик, впереди — серая плашка с рамкой */
/* ✓ и ✕ — как на «Главной» (WeekGrid): кружок 16px, #1f883d / #cf222e, белая обводка */
.cnt i.done, .cnt i.off, .mli .st.done, .mli .st.off { width: 16px; height: 16px; background: var(--c) center / 11px no-repeat }
/* Число — в своей коробочке по центру клетки, значок — в углу коробочки (как в счёте): числа стоят ровно, значок рядом с числом */
.day .n { position: relative; display: grid; place-items: center; width: 30px; height: 28px; border-radius: 8px }
.day.done .n::after, .day.off .n::after { content: ''; position: absolute; top: -7px; right: -8px; width: 16px; height: 16px; border-radius: 50%; background: var(--c) center / 11px no-repeat; box-shadow: 0 0 0 2px var(--card) }
.day.done .n::after, .cnt i.done, .mli .st.done { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 8.2l2.3 2.3 4.7-4.9' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") }
.day.off .n::after, .cnt i.off, .mli .st.off { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") }
.day.plan .n { background: var(--surface); box-shadow: inset 0 0 0 1px #d0d7de; color: var(--text) }      /* запланирован — серый квадратик вокруг числа */
.day.off .n { color: var(--hint-2); text-decoration: line-through }
.day.picked { outline: 2px solid var(--text); outline-offset: 1px }
.day.picked:not(.has) { background: var(--surface) }
.dots { position: absolute; left: 50%; bottom: 3px; transform: translateX(-50%); display: flex; gap: 3px; height: 6px } .dots i, .legend i { width: 6px; height: 6px; border-radius: 50% }
 .legend i { width: 10px; height: 10px; border-radius: 50% }
.done { --c: #1f883d } .plan { --c: #afb8c1 } .off { --c: #cf222e }
.dots i, .legend i { background: var(--c) }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; justify-content: center; margin-top: 4px; font-size: 12px; font-weight: 700; color: var(--hint) }
.legend span { display: inline-flex; align-items: center; gap: 5px } .legend i { display: inline-block }

.dayl { display: grid; gap: 8px } .dt { font-weight: 800; margin: 4px 4px 0; text-transform: capitalize }
.none { text-align: center; padding: 14px }
.ls { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 18px; overflow: hidden }
.ls .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--c) }
.ls .info { flex: 1; min-width: 0 } .ls .tm { font-size: 17px }
.ls.off .tm { text-decoration: line-through; color: var(--hint) }


.money { display: grid; gap: 8px; padding: 14px 16px }
.mrow { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 14px; font-weight: 800; color: var(--hint) }
.mrow b { font-size: 20px; font-weight: 900; color: var(--text) } .mrow.real b { color: var(--text) } .mrow.lost b { font-size: 16px; color: var(--red-d) }
html[data-theme='dark'] .mrow.lost b { color: var(--red) }
.mbar { height: 12px; border-radius: 99px; background: var(--border); overflow: hidden } .mbar i { display: block; height: 100%; border-radius: 99px; background: #1f883d; transition: width .25s }
.ls .btn { flex: none } .ls { flex-wrap: wrap; row-gap: 8px } .ls .info { flex: 1 1 150px }
.sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 12px; text-align: center }
.sum div { display: grid; gap: 2px } .sum b { font-size: 20px; font-weight: 900 } .sum small { font-size: 12px; font-weight: 800; color: var(--hint); line-height: 1.15 }
.sum .g { color: #1f883d } .sum .r { color: var(--red-d) }
@media (max-width: 480px) { .sum { grid-template-columns: repeat(2, 1fr); row-gap: 12px } }
.sum.t { grid-template-columns: repeat(3, 1fr) }
html[data-theme='dark'] .sum .g { color: var(--green) } html[data-theme='dark'] .sum .r { color: var(--red) }
.lc.cmp { max-width: none }
.cnt { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--hint) }
.cnt span { display: inline-flex; align-items: center; gap: 5px } .cnt i { flex: none; border-radius: 50% } .cnt i.plan { width: 14px; height: 14px; border-radius: 4px; background: var(--surface); box-shadow: inset 0 0 0 1px #d0d7de }      /* легенда — как дни календаря: ✓ зелёный, ✕ красный, серый квадрат */ .cnt b { color: var(--text); font-weight: 900 }
.cm { display: grid; gap: 6px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--border) }
.cmr { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; font-weight: 700; color: var(--hint) } .cmr b { font-size: 17px; font-weight: 900 }
.cmr { gap: 10px } .cmr > span { flex: 1 }
.cmr .g { color: var(--text) } .cmr .r { color: var(--red-d); font-size: 15px }
/* ---- Карточка ученика — как картинка счёта (utils/receipt.ts: ширина 360, поля 24, клетка 34, число в коробочке 28×26) ---- */
.lc.cmp .cal { padding: 22px 24px 20px; gap: 0 }
.rtop { display: flex; align-items: center; gap: 4px } .rtop b { flex: 1; font-size: 24px; font-weight: 900; letter-spacing: -.3px }
.ar { width: 30px; height: 30px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--text); cursor: pointer }
.ar:hover:not(:disabled) { background: var(--surface) } .ar:disabled { opacity: .3; cursor: default } .ar.next svg { transform: scaleX(-1) }
.rsub { margin-top: 4px; font-size: 13px; font-weight: 700; color: var(--hint) }
.dash { margin: 14px 0 8px; border-top: 1px dashed #d6d6d6 }
.lc.cmp .grid { gap: 0 } .lc.cmp .wd span { padding: 6px 0 4px; font-size: 11px; color: #9aa0a6 }
.lc.cmp .day { max-width: none; aspect-ratio: auto; height: 34px; max-height: none; border-radius: 7px }
.lc.cmp .day .n { width: 28px; height: 26px; border-radius: 7px; font-size: 13px; color: #b8b8b8 }
.lc.cmp .day.done .n, .lc.cmp .day.plan .n { color: var(--text) } .lc.cmp .day.off .n { color: #b0b0b0 }
.lc.cmp .day.plan .n { background: #f7f7f7 } .lc.cmp .day.today .n { color: var(--blue) }
.lc.cmp .day.done .n::after, .lc.cmp .day.off .n::after { top: -4px; right: -5px; width: 12px; height: 12px; background-size: 9px; box-shadow: none }
.lc.cmp .day .tl { bottom: -1px; font-size: 8px } .lc.cmp .dots { display: none }
.lc.cmp .day.picked { outline: 0 } .lc.cmp .day.picked .n { outline: 2px solid var(--blue); outline-offset: 1px }
.ln { display: flex; align-items: baseline; gap: 6px; min-height: 26px; padding: 0 2px; border-radius: 6px; font-size: 14px; font-weight: 700 }
.ln.hl { background: var(--blue-l) } .ln span { flex: none } .ln i { flex: 1; min-width: 8px; border-bottom: 2px dotted #cfcfcf; transform: translateY(-4px) } .ln b { flex: none; font-weight: 800 }
.lc.cmp .none { margin: 6px 0 2px; font-size: 13px; font-weight: 700; color: var(--hint) }
.rcnt { display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px; font-weight: 700; color: var(--hint) } .rcnt b { font-weight: 800 }
.rtot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; font-size: 18px; font-weight: 900 } .rtot b { font-size: 22px; font-weight: 900 }
.ahead { margin-top: 10px; font-size: 12px; font-weight: 700; color: #9aa0a6 }
.send { margin-top: 16px; padding: 13px; font-size: 15px; gap: 8px }
</style>

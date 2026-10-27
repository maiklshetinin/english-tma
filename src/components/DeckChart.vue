<script setup>
// График колоды: как алгоритм (Anki / FSRS) «отбрасывает» слова.
//  • Сверху — счётчики (Новые / Изучаю / Повторение / Выучено) и «лента дней»: колонки «Сейчас», «завтра», дальше по дням,
//    в каждой — сами слова, которые придут в этот день. Колонки считаются от сегодня, поэтому каждый день слова сдвигаются
//    на колонку ближе к «Сейчас»; ответили — слово «прыгает» вправо (метка «только что»).
//  • Ниже — все слова по порядку показа: когда вернётся (на шагах изучения — живой обратный отсчёт), шкала времени
//    «сейчас → год» с отметкой, интервал, вероятность вспомнить прямо сейчас.
//  • Нажатие на слово — его история: каждый ответ (цвет — оценка) и на сколько после него отбросило слово.
// Всё реактивно: ответили в сессии — график меняется сразу; часы тикают раз в секунду.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { srsOf, kindOf, today, LEARNED_DAYS } from '../composables/useSrs'
import { dueMs, recallNow, fmtSpan, memoryOf, ymdOf } from '../utils/fsrs'
import AppIcon from './AppIcon.vue'
const props = defineProps({ deck: { type: Object, required: true }, userKey: { type: [String, Number], required: true }, overlay: Boolean })
const emit = defineEmits(['back'])

const now = ref(Date.now()); let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(clock))
const DAY = 86_400_000
const GRADE = ['Снова', 'Трудно', 'Хорошо', 'Легко']

const rows = computed(() => {
  const t = today()
  return props.deck.cards.filter(c => !c.suspended).map(c => {
    const s = srsOf(props.userKey, c), k = kindOf(s)
    if (!s) return { c, k, s: null, at: Infinity }
    const at = dueMs(s), mature = k === 'review' && s.interval >= LEARNED_DAYS
    return { c, k: mature ? 'mature' : k, s, at, overdue: k === 'review' && s.due <= t, r: recallNow(s, now.value), mem: memoryOf(s) }
  }).sort((a, b) => a.at - b.at)
})
const counts = computed(() => { const o = { new: 0, learn: 0, review: 0, mature: 0 }; for (const r of rows.value) o[r.k]++; return o })

// Столбики по дням: «Сейчас» (шаги изучения и просроченные/сегодняшние повторения), затем 30 дней, потом «Позже».
// Считаются от сегодня — каждый день все столбики сдвигаются на один влево, к «Сейчас». Наведение (или нажатие) — какие слова в этом дне.
const HORIZON = 30
const dayIdx = (r) => Math.round((new Date(r.s.due + 'T12:00') - new Date(today() + 'T12:00')) / DAY)
const columns = computed(() => {
  const t = new Date(today() + 'T12:00').getTime()
  const cols = Array.from({ length: HORIZON + 1 }, (_, i) => ({ key: i, d: ymdOf(t + i * DAY), i, items: [] }))
  const later = { key: 'later', i: Infinity, items: [] }
  for (const r of rows.value) {
    if (!r.s) continue
    const i = r.k === 'learn' ? 0 : Math.max(0, dayIdx(r))
    ;(i <= HORIZON ? cols[i] : later).items.push(r)
  }
  return [...cols, later]
})
const maxN = computed(() => Math.max(1, ...columns.value.map(c => c.items.length)))
const segs = (c) => ['learn', 'review', 'mature'].map(k => ({ k, n: c.items.filter(r => r.k === k).length })).filter(x => x.n)
const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const colTitle = (c) => c.key === 'later' ? `Позже ${HORIZON} дней` : c.i === 0 ? 'Сейчас (сегодня)' : `${c.i === 1 ? 'Завтра' : DOW[new Date(c.d + 'T12:00').getDay()]}, ${+c.d.slice(8)} ${MON[+c.d.slice(5, 7) - 1]}`
const tick = (c) => c.key === 'later' ? '…' : c.i === 0 ? 'сейч.' : c.i % 7 === 0 ? `+${c.i / 7}н` : ''
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов')
const hover = ref(null), pinned = ref(0)                                 // наведённый / выбранный столбик (по умолчанию «Сейчас»)
const active = computed(() => columns.value.find(c => c.key === (hover.value ?? pinned.value)) ?? columns.value[0])
const fresh = (r) => r.s?.lastAt && now.value - r.s.lastAt < 120_000          // ответили меньше 2 минут назад — слово только что «прыгнуло»
const chipSub = (r) => r.k === 'learn' ? when(r).replace('через ', '') : r.overdue && dayIdx(r) < 0 ? `просрочено ${-dayIdx(r)} дн.` : `интервал ${fmtSpan(0, r.s.interval || 1)}`
const pick = (r) => { open.value = open.value === r.c.id ? null : r.c.id }
const picked = computed(() => rows.value.find(r => r.c.id === open.value) ?? null)

// Когда вернётся: живой отсчёт для шагов изучения, иначе «сегодня / завтра / через N дн.»
function when(r) {
  if (!r.s) return 'новое'
  const ms = r.at - now.value
  if (r.k === 'learn') { if (ms <= 0) return 'уже пора'; const s = Math.round(ms / 1000); return s < 3600 ? `через ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `через ${Math.round(s / 3600)} ч.` }
  if (r.overdue) return 'пора повторить'
  const d = Math.round((new Date(r.s.due + 'T12:00') - new Date(today() + 'T12:00')) / DAY)
  return d === 1 ? 'завтра' : `через ${fmtSpan(0, d)}`
}
// Позиция на шкале «сейчас → 1 год» (логарифмическая: минуты и годы на одной полоске)
const SPAN_MS = 365 * DAY, MIN_MS = 60_000
const pos = (r) => { if (!r.s) return 0; const ms = Math.max(MIN_MS, r.at - now.value); return Math.min(100, Math.log(ms / MIN_MS) / Math.log(SPAN_MS / MIN_MS) * 100) }
const TICKS = [['1 мин', MIN_MS], ['1 ч', 3600_000], ['1 дн', DAY], ['1 нед', 7 * DAY], ['1 мес', 30 * DAY], ['1 год', SPAN_MS]].map(([t, ms]) => ({ t, x: Math.log(ms / MIN_MS) / Math.log(SPAN_MS / MIN_MS) * 100 }))

const open = ref(null)
const histOf = (r) => (r.s?.hist ?? []).map(([at, q, iv]) => ({ at, q, iv, label: iv < 0 ? fmtSpan(-iv, 0) : fmtSpan(0, iv), days: iv < 0 ? -iv / 1440 : iv }))
const histMax = (r) => Math.max(1, ...histOf(r).map(h => h.days))
const KIND = { new: 'Новое', learn: 'Изучаю', review: 'Повторение', mature: 'Выучено' }
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
</script>

<template>
  <div class="dc" :class="{ ov: overlay }">
    <header class="bar">
      <button class="btn ghost sm" @click="emit('back')"><AppIcon name="back" :size="18" /> {{ overlay ? 'К карточкам' : 'Колоды' }}</button>
      <b class="dt">{{ deck.title }}</b>
    </header>

    <div class="card sum">
      <div class="k new"><b>{{ counts.new }}</b><small>новые</small></div>
      <div class="k learn"><b>{{ counts.learn }}</b><small>изучаю</small></div>
      <div class="k review"><b>{{ counts.review }}</b><small>повторение</small></div>
      <div class="k mature"><b>{{ counts.mature }}</b><small title="интервал 21+ дн., как «зрелые» в Anki">выучено</small></div>
    </div>

    <!-- Лента дней: какие слова придут сегодня, завтра и дальше. Каждый день всё сдвигается на колонку к «Сейчас» -->
    <div class="card brd">
      <div class="fh"><b>Когда придут слова</b><span class="hint">каждый день столбики сдвигаются на один влево ← · наведите на столбик</span></div>
      <div class="bars" @mouseleave="hover = null">
        <button v-for="c in columns" :key="c.key" class="bc" :class="{ on: active.key === c.key, now: c.i === 0, later: c.key === 'later' }"
          :aria-label="`${colTitle(c)}: ${c.items.length} ${word(c.items.length)}`" @mouseenter="hover = c.key" @focus="hover = c.key" @click="pinned = c.key; hover = null">
          <span v-if="c.items.length" class="bn">{{ c.items.length }}</span>
          <span class="stack" :style="{ height: (c.items.length ? 8 + c.items.length / maxN * 82 : 3) + 'px' }"><i v-for="g in segs(c)" :key="g.k" :class="g.k" :style="{ flexGrow: g.n }" /></span>
          <small class="tk2">{{ tick(c) }}</small>
        </button>
      </div>
      <!-- Подсказка столбика: сколько и какие слова (наведите или нажмите на столбик) -->
      <div class="tip">
        <div class="tt"><b>{{ colTitle(active) }}</b><span>{{ active.items.length ? `${active.items.length} ${word(active.items.length)}` : 'слов нет' }}</span></div>
        <div v-if="active.items.length" class="tw">
          <button v-for="r in active.items" :key="r.c.id" class="chip" :class="[r.k, { on: open === r.c.id, fresh: fresh(r) }]" :title="r.c.back" @click="pick(r)">
            <b>{{ r.c.front }}</b><small>{{ chipSub(r) }}</small><i v-if="fresh(r)" class="jump">только что</i></button>
        </div>
      </div>
      <div class="lgd"><span><i class="learn" />изучаю (минуты)</span><span><i class="review" />повторение</span><span><i class="mature" />выучено</span><span class="hint">нажмите на слово — его история</span></div>
      <!-- История выбранного слова — прямо под лентой -->
      <div v-if="picked" class="hist">
        <div class="pw"><b>{{ picked.c.front }}</b> — {{ picked.c.back }} <span class="hint">· {{ when(picked) }}</span></div>
        <div v-if="!picked.s" class="hint">Слово ещё не показывалось.</div>
        <template v-else>
          <div class="meta"><span>{{ KIND[picked.k] }}</span><span>вспомнит сейчас <b>{{ Math.round(picked.r * 100) }}%</b></span><span>стабильность <b>{{ fmtSpan(0, Math.max(1, Math.round(picked.mem.stab))) }}</b></span><span>сложность <b>{{ picked.mem.diff.toFixed(1) }}</b>/10</span><span>ошибок <b>{{ picked.s.lapses }}</b></span></div>
          <div v-if="histOf(picked).length" class="hb">
            <div v-for="(h, i) in histOf(picked)" :key="i" class="hc" :title="`${fmtDate(h.at)} · ${GRADE[h.q]} → ${h.label}`">
              <small class="hv">{{ h.label }}</small>
              <i :class="'q' + h.q" :style="{ height: Math.max(4, Math.sqrt(h.days / histMax(picked)) * 70) + 'px' }" />
              <small class="hg">{{ GRADE[h.q] }}</small><small class="hd">{{ fmtDate(h.at).split(' ')[0] }}</small>
            </div>
          </div>
          <div class="lg"><span><i class="q0" />Снова</span><span><i class="q1" />Трудно</span><span><i class="q2" />Хорошо</span><span><i class="q3" />Легко</span><span class="hint">высота — на сколько отбросило после ответа</span></div>
        </template>
      </div>
    </div>

    <!-- Слова: когда вернётся каждое -->
    <div class="card list">
      <div class="lh"><b>Все слова на шкале времени</b>
        <div class="tk"><span v-for="(t, i) in TICKS" :key="t.t" :class="{ opt: [1, 3, 4].includes(i) }" :style="{ left: t.x + '%' }">{{ t.t }}</span></div></div>
      <template v-for="r in rows" :key="r.c.id">
        <button class="wr" :class="[r.k, { op: open === r.c.id }]" @click="pick(r)">
          <span class="w"><b>{{ r.c.front }}</b><small>{{ r.c.back }}</small></span>
          <span class="tl"><i class="track" /><i v-for="t in TICKS" :key="t.t" class="tick" :style="{ left: t.x + '%' }" /><i v-if="r.s" class="mk" :style="{ left: pos(r) + '%' }" /></span>
          <span class="when"><b>{{ when(r) }}</b><small v-if="r.s">вспомнит: {{ Math.round(r.r * 100) }}%</small><small v-else>ещё не показано</small></span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dc { display: grid; gap: 12px }
.dc.ov { position: fixed; inset: 0; z-index: 40; overflow-y: auto; background: var(--bg); padding: 16px max(16px, calc(50% - 320px)) calc(40px + var(--safe-b)); align-content: start }
.bar { display: flex; align-items: center; gap: 10px } .dt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; text-align: center; margin-right: 90px }
.sum { display: grid; grid-template-columns: repeat(4, 1fr); padding: 0; overflow: hidden }
.k { display: grid; justify-items: center; gap: 1px; padding: 10px 2px } .k + .k { border-left: 1px solid var(--border) }
.k b { font-size: 20px; font-weight: 900 } .k small { font-size: 11px; font-weight: 700; color: var(--hint); text-align: center }
.k.new b { color: var(--blue) } .k.learn b { color: var(--red-d) } .k.review b { color: var(--green-d) } .k.mature b { color: var(--text) }
/* Лента дней */
.fh { display: grid; gap: 2px; font-size: 15px } .fh .hint { font-size: 12px }
.brd { display: grid; gap: 8px; padding: 12px 12px 10px; min-width: 0 }
.bars { display: grid; grid-template-columns: repeat(32, minmax(0, 1fr)); gap: 2px; align-items: end; height: 124px; padding-top: 4px }
.bc { display: grid; justify-items: center; align-content: end; gap: 2px; height: 100%; padding: 0 0 2px; border: 0; border-radius: 6px; background: none; cursor: pointer; min-width: 0; font: inherit }
.bc:hover, .bc.on { background: var(--blue-l) } .bc.later { border-left: 1px dashed var(--border); border-radius: 0 6px 6px 0 }
.stack { display: flex; flex-direction: column-reverse; gap: 2px; width: 76%; max-width: 18px; border-radius: 4px 4px 0 0; overflow: hidden; background: var(--border) }
.stack i { display: block; min-height: 3px } .stack .learn { background: var(--red) } .stack .review { background: var(--green) } .stack .mature { background: var(--green-d) }
.bn { font-size: 10px; font-weight: 900; color: var(--text); line-height: 1 }
.tk2 { height: 12px; font-size: 9px; font-weight: 800; color: var(--hint-2); white-space: nowrap; line-height: 12px; overflow: visible; width: 0; display: flex; justify-content: center }
.bc.now .tk2 { color: var(--blue) }
.tip { display: grid; gap: 6px; padding: 8px 10px; border-radius: 12px; background: var(--surface); min-height: 64px; align-content: start }
.tt { display: flex; justify-content: space-between; gap: 10px; font-size: 14px } .tt span { font-weight: 800; color: var(--hint) }
.tw { display: flex; flex-wrap: wrap; gap: 6px } .tw .chip { width: auto; max-width: 180px }
.chip { position: relative; display: grid; gap: 0; width: 100%; padding: 5px 7px 5px 9px; border: 0; border-left: 4px solid var(--c); border-radius: 8px; background: var(--card); font: inherit; color: var(--text); text-align: left; cursor: pointer; line-height: 1.2; box-shadow: 0 1px 0 var(--border) }
.chip b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .chip small { font-size: 10px; font-weight: 700; color: var(--hint); font-variant-numeric: tabular-nums; white-space: nowrap }
.chip.on { outline: 2px solid var(--blue); outline-offset: 1px } .chip.learn small { color: var(--red-d) }
.chip.learn { --c: var(--red) } .chip.review { --c: var(--green) } .chip.mature { --c: var(--green-d) }
.chip.fresh { animation: pop .6s ease } @keyframes pop { 0% { transform: scale(.85); opacity: .3 } 60% { transform: scale(1.05) } 100% { transform: none; opacity: 1 } }
.jump { position: absolute; top: -6px; right: -2px; padding: 0 5px; border-radius: 99px; background: var(--orange); color: #fff; font-style: normal; font-size: 9px; font-weight: 900 }
.lgd { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; font-weight: 700; color: var(--hint) } .lgd span { display: inline-flex; align-items: center; gap: 4px }
.lgd i { width: 10px; height: 10px; border-radius: 3px; display: inline-block } .lgd .learn { background: var(--red) } .lgd .review { background: var(--green) } .lgd .mature { background: var(--green-d) }
.pw { font-size: 15px } .hd { font-size: 9px; color: var(--hint-2); font-weight: 700 }
/* Слова */
.list { display: grid; padding: 4px 0 }
.lh { display: grid; grid-template-columns: minmax(0, 34%) minmax(0, 1fr) 118px; align-items: end; gap: 10px; padding: 10px 14px 6px; font-size: 14px }
.tk { position: relative; height: 14px; grid-column: 2 } .tk span { position: absolute; transform: translateX(-50%); font-size: 10px; font-weight: 700; color: var(--hint-2); white-space: nowrap }
.tk span:first-child { transform: none } .tk span:last-child { transform: translateX(-100%) }
.wr { display: grid; grid-template-columns: minmax(0, 34%) minmax(0, 1fr) 118px; align-items: center; gap: 10px; width: 100%; padding: 8px 14px; border: 0; border-top: 1px solid var(--border); background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer }
.wr:hover, .wr.op { background: var(--surface) }
.w { display: grid; min-width: 0; line-height: 1.25 } .w b, .w small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .w b { font-size: 15px } .w small { font-size: 12px; color: var(--hint); font-weight: 600 }
.tl { position: relative; height: 14px }
.track { position: absolute; left: 0; right: 0; top: 6px; height: 2px; background: var(--border); border-radius: 2px }
.tick { position: absolute; top: 3px; width: 1px; height: 8px; background: var(--border) }
.mk { position: absolute; top: 1px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 2px var(--card); transition: left .6s ease }
.wr.new { --c: var(--blue) } .wr.learn { --c: var(--red) } .wr.review { --c: var(--green) } .wr.mature { --c: var(--green-d) }
.when { display: grid; justify-items: end; line-height: 1.2; text-align: right } .when b { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap } .when small { font-size: 11px; color: var(--hint); font-weight: 600 }
.wr.learn .when b { color: var(--red-d) } .wr.new .when b { color: var(--blue) }
/* История слова */
.hist { display: grid; gap: 8px; padding: 10px 12px 12px; border-radius: 12px; background: var(--surface) }
.meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; font-weight: 700; color: var(--hint) } .meta b { color: var(--text) }
.hb { display: flex; align-items: flex-end; gap: 6px; min-height: 110px; overflow-x: auto; padding-bottom: 2px }
.hc { flex: none; width: 44px; display: grid; justify-items: center; align-content: end; gap: 3px }
.hc i { display: block; width: 26px; border-radius: 4px 4px 0 0 } .hv { font-size: 10px; font-weight: 800; white-space: nowrap } .hg { font-size: 10px; color: var(--hint); font-weight: 700 }
.q0 { background: var(--red) } .q1 { background: var(--orange) } .q2 { background: var(--green) } .q3 { background: var(--blue) }
.lg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; font-weight: 700; color: var(--hint) } .lg span { display: inline-flex; align-items: center; gap: 4px } .lg i { width: 10px; height: 10px; border-radius: 3px; display: inline-block }
@media (max-width: 520px) { .lh, .wr { grid-template-columns: minmax(0, 38%) minmax(0, 1fr) 96px; gap: 8px; padding-left: 10px; padding-right: 10px } .dt { margin-right: 0 } .when small { display: none } .tk .opt { display: none } }
</style>

<script setup>
// График колоды: где сейчас каждое слово и как алгоритм (Anki / FSRS) его «отбрасывает».
//  • Столбики — сколько слов придёт в каждый отрезок времени. Масштаб: «Сутки» (по часам), «Неделя», «Месяц» (по дням), «Год» (по месяцам).
//    Отрезки считаются от «сейчас», поэтому со временем столбики сами сдвигаются влево, к «Сейчас».
//  • Наведение на столбик (на телефоне — нажатие) — всплывающая подсказка поверх графика: сколько и какие слова, когда вернутся.
//    Подсказка не сдвигает страницу. Нажатый столбик держит подсказку открытой; в ней нажатие на слово — его история ответов.
//  • В реальном времени: ответили в сессии — над графиком всплывает «budget · Снова → <1 мин.», столбик с этим словом
//    подсвечивается и сразу открывается. Часы тикают раз в секунду.
//  dock — график сверху сессии (над карточкой), без него — отдельный экран из списка колод.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { srsOf, kindOf, today, LEARNED_DAYS, resetDeck, buildQueue, deckCounts } from '../composables/useSrs'
import { showToast } from '../composables/useToast'
import { dueMs, recallNow, fmtSpan, memoryOf } from '../utils/fsrs'
import AppIcon from './AppIcon.vue'
const props = defineProps({ deck: { type: Object, required: true }, userKey: { type: [String, Number], required: true }, dock: Boolean, currentId: { type: String, default: null } })
const emit = defineEmits(['back', 'reset'])

const now = ref(Date.now()); let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(clock))
const HOUR = 3_600_000, DAY = 86_400_000
const GRADE = ['Снова', 'Трудно', 'Хорошо', 'Легко']
const KIND = { new: 'Новое', learn: 'Изучаю', review: 'Повторение', mature: 'Выучено' }

// Все слова колоды: когда придут, состояние, вероятность вспомнить
const rows = computed(() => props.deck.cards.filter(c => !c.suspended).map(c => {
  const s = srsOf(props.userKey, c), k = kindOf(s)
  if (!s) return { c, k, s: null }
  return { c, k: k === 'review' && s.interval >= LEARNED_DAYS ? 'mature' : k, s, at: dueMs(s), r: recallNow(s, now.value), mem: memoryOf(s) }
}))
const started = computed(() => rows.value.filter(r => r.s))
const counts = computed(() => { const o = { new: 0, learn: 0, review: 0, mature: 0 }; for (const r of rows.value) o[r.k]++; return o })

// ── Масштаб ──
const SCALES = [
  { id: 'day', t: 'Сутки', n: 24 },        // сейчас + 23 часа по часу + «позже»
  { id: 'week', t: 'Неделя', n: 8 },       // сегодня + 7 дней + «позже»
  { id: 'month', t: 'Месяц', n: 31 },      // сегодня + 30 дней + «позже»
  { id: 'year', t: 'Год', n: 13 },         // этот месяц + 12 + «позже»
]
const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v) } catch { return null } }
const saved = store('tma.chartScale')
const scale = ref(SCALES.some(s => s.id === saved) ? saved : 'month')
const sc = computed(() => SCALES.find(s => s.id === scale.value))

const dayDiff = (ymd) => Math.round((new Date(ymd + 'T12:00') - new Date(today() + 'T12:00')) / DAY)
const monthDiff = (ymd) => { const a = today(); return (+ymd.slice(0, 4) - +a.slice(0, 4)) * 12 + (+ymd.slice(5, 7) - +a.slice(5, 7)) }
/** В какой столбик попадает слово при текущем масштабе (0 — «сейчас», n — «позже»). */
function binOf(r) {
  const n = sc.value.n
  if (scale.value === 'day') { const d = r.at - now.value; return d <= 0 ? 0 : Math.min(n, Math.floor(d / HOUR) + 1) }
  if (r.k === 'learn') return 0
  return Math.min(n, Math.max(0, scale.value === 'year' ? monthDiff(r.s.due) : dayDiff(r.s.due)))
}
const bins = computed(() => {
  const out = Array.from({ length: sc.value.n + 1 }, (_, i) => ({ i, items: [] }))
  for (const r of started.value) out[binOf(r)].items.push(r)
  for (const b of out) b.items.sort((a, z) => a.at - z.at)
  return out
})
const maxN = computed(() => Math.max(1, ...bins.value.map(b => b.items.length)))
const segs = (b) => ['learn', 'review', 'mature'].map(k => ({ k, n: b.items.filter(r => r.k === k).length })).filter(x => x.n)

// Подписи
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const dateAt = (i) => { const d = new Date(today() + 'T12:00'); d.setDate(d.getDate() + i); return d }
const monthAt = (i) => { const d = new Date(today() + 'T12:00'); d.setDate(1); d.setMonth(d.getMonth() + i); return d }
function axis(i) {                                          // подпись под столбиком (не под каждым)
  if (i === sc.value.n) return 'позже'
  if (i === 0) return 'сейчас'
  if (i === sc.value.n - 1 && scale.value !== 'week') return ''
  if (scale.value === 'day') return i % 6 === 0 ? `+${i} ч` : ''
  if (scale.value === 'week') return i === 1 ? 'завтра' : DOW[dateAt(i).getDay()]
  if (scale.value === 'month') return i % 7 === 0 && i < 28 ? `+${i / 7} нед` : ''
  return i % 3 === 0 ? MON[monthAt(i).getMonth()] : ''
}
function title(i) {                                         // заголовок открытого столбика
  const n = sc.value.n
  if (i === n) return scale.value === 'day' ? 'Позже, чем через сутки' : scale.value === 'year' ? 'Позже, чем через год' : `Позже, чем через ${n - 1} дн.`
  if (scale.value === 'day') return i === 0 ? 'Сейчас — пора повторять' : i === 1 ? 'В ближайший час' : `Через ${i - 1}–${i} ч`
  if (scale.value === 'year') { const d = monthAt(i); return i === 0 ? `Этот месяц (${MONN[d.getMonth()].toLowerCase()})` : `${MONN[d.getMonth()]} ${d.getFullYear()}` }
  if (i === 0) return 'Сегодня — и всё, что уже пора'
  const d = dateAt(i), dw = DOW[d.getDay()]
  return `${i === 1 ? 'Завтра' : dw[0].toUpperCase() + dw[1]}, ${d.getDate()} ${MONG[d.getMonth()]}`
}
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов')

// Открытый столбик: наведённый (на компьютере) или выбранный нажатием
const hover = ref(null), pinned = ref(null), open = ref(null), autoPin = ref(false)
watch(scale, (v) => { store('tma.chartScale', v); pinned.value = null; hover.value = null; open.value = null })
const activeI = computed(() => hover.value ?? pinned.value)
const active = computed(() => activeI.value == null ? null : bins.value[activeI.value] ?? null)
// Подсказка — над столбиком: низ подсказки на 8px выше верхушки столбика; высота — сколько есть места до верха экрана
const plotw = ref(null), tipPos = ref({ bottom: 0, maxH: 260 })
function placeTip() {
  const w = plotw.value, i = activeI.value; if (!w || i == null) return
  const bar = w.querySelectorAll('.bc')[i]?.querySelector('.bn') || w.querySelectorAll('.bc')[i]?.querySelector('.stk'); if (!bar) return
  const wr = w.getBoundingClientRect(), br = bar.getBoundingClientRect()
  tipPos.value = { bottom: Math.round(wr.bottom - br.top + 8), maxH: Math.max(140, Math.min(300, Math.round(br.top - 16))) }
}
watch([activeI, () => bins.value.map(b => b.items.length).join()], () => nextTick(placeTip))
onMounted(() => addEventListener('resize', placeTip)); onUnmounted(() => removeEventListener('resize', placeTip))
const tipLeft = computed(() => activeI.value == null ? 50 : (activeI.value + 0.5) / bins.value.length * 100)
const pin = (i) => { autoPin.value = false; open.value = null; pinned.value = pinned.value === i ? null : i; hover.value = null }
// Нажатие мимо графика закрывает закреплённую подсказку
const root = ref(null)
const outside = (e) => { if (pinned.value != null && root.value && !root.value.querySelector('.plotw')?.contains(e.target)) { pinned.value = null; open.value = null } }
onMounted(() => document.addEventListener('pointerdown', outside))
onUnmounted(() => document.removeEventListener('pointerdown', outside))
// Очередь как в Anki — в подсказке «Сейчас»: номер, в каком порядке придут карточки (изучаемые, чьё время пришло → повторения → новые),
// а карточки на шагах, которым ещё рано, — с обратным отсчётом «через 0:45». Пересчитывается раз в секунду.
const queue = computed(() => { now.value; return buildQueue(props.deck, props.userKey, now.value) })
const qPos = computed(() => {                               // карточка на экране (currentId) — первая, дальше очередь по порядку
  const ids = queue.value.map(c => c.id), order = props.currentId ? [props.currentId, ...ids.filter(id => id !== props.currentId)] : ids
  const m = {}; order.forEach((id, i) => { m[id] = i + 1 }); return m
})
const queueNew = computed(() => queue.value.filter(c => !srsOf(props.userKey, c)))
const newLeft = computed(() => deckCounts(props.deck, props.userKey).new)
/** Слова подсказки: у «Сейчас» — в порядке очереди (кто следующий — первым), у остальных — по времени. */
const tipItems = computed(() => {
  if (!active.value) return []
  if (active.value.i !== 0) return active.value.items
  const pos = (r) => qPos.value[r.c.id] ?? 1e6 + r.at
  return [...active.value.items].sort((a, b) => pos(a) - pos(b))
})
const firstWait = computed(() => active.value?.i === 0 ? tipItems.value.findIndex(r => !qPos.value[r.c.id]) : -1)   // где в списке начинаются «ещё рано»
const newRange = computed(() => { const ps = queueNew.value.map(c => qPos.value[c.id]).filter(Boolean); return ps.length ? (ps.length > 1 ? `${Math.min(...ps)}–${Math.max(...ps)}` : `${ps[0]}`) : '' })
const MAXW = 8                                              // в подсказке — первые 8 слов, дальше «и ещё N»

// Когда вернётся слово: обратный отсчёт до часа, дальше — «завтра / 5 дн.»
function when(r) {
  const ms = r.at - now.value
  if (ms <= 0) return 'пора'
  if (ms < HOUR) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  if (r.k === 'learn') return `${Math.round(ms / HOUR)} ч`
  const d = dayDiff(r.s.due); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : fmtSpan(0, d)
}

// ── В реальном времени: слово только что «ушло» ──
const jump = ref(null); let jumpTimer = null
const lastKey = computed(() => { let m = null; for (const r of started.value) if (!m || (r.s.lastAt ?? 0) > (m.s.lastAt ?? 0)) m = r; return m ? `${m.c.id}:${m.s.lastAt}` : '' })
watch(lastKey, (v, was) => {
  if (!v || !was) return                                    // при открытии графика не всплываем
  const id = v.split(':')[0], r = started.value.find(x => x.c.id === id); if (!r) return
  const h = r.s.hist?.at(-1)
  jump.value = { id, word: r.c.front, q: h?.q ?? 2, to: h ? (h.i < 0 ? fmtSpan(-h.i, 0) : fmtSpan(0, h.i)) : '' }
  hover.value = null; pinned.value = binOf(r); autoPin.value = true; open.value = null
  clearTimeout(jumpTimer); jumpTimer = setTimeout(() => { jump.value = null; if (autoPin.value) pinned.value = null }, 4500)
})
onUnmounted(() => clearTimeout(jumpTimer))
const fresh = (r) => jump.value?.id === r.c.id

// «Сбросить колоду»: два нажатия — второе подтверждает; все слова снова новые (только у этого пользователя)
const sure = ref(false)
function reset() {
  if (!sure.value) { sure.value = true; return }
  const n = resetDeck(String(props.userKey), props.deck); sure.value = false; open.value = null; pinned.value = null
  showToast(n ? `Колода сброшена: ${n} ${word(n)} снова новые` : 'Сбрасывать нечего — слова ещё не начаты'); emit('reset')
}

// История слова
const histOf = (r) => (r.s?.hist ?? []).filter(h => !Array.isArray(h)).map(({ t: at, q, i: iv }) => ({ at, q, label: iv < 0 ? fmtSpan(-iv, 0) : fmtSpan(0, iv), days: iv < 0 ? -iv / 1440 : iv }))
const histMax = (r) => Math.max(1, ...histOf(r).map(h => h.days))
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}` }
</script>

<template>
  <div ref="root" class="dc" :class="{ docked: dock }">
    <header v-if="!dock" class="bar">
      <button class="btn ghost sm" @click="emit('back')"><AppIcon name="back" :size="18" /> Колоды</button>
      <b class="dt">{{ deck.title }}</b>
    </header>

    <section class="card ch">
      <div class="top">
        <div class="ttl"><b>Где слова</b>
          <span class="cnt"><i class="new" />{{ counts.new }} новых <i class="learn" />{{ counts.learn }} изучаю <i class="review" />{{ counts.review }} повтор. <i class="mature" />{{ counts.mature }} выучено</span></div>
        <div class="seg scl" role="radiogroup" aria-label="Масштаб">
          <button v-for="s in SCALES" :key="s.id" role="radio" :aria-checked="scale === s.id" :class="{ on: scale === s.id }" @click="scale = s.id">{{ s.t }}</button>
        </div>
        <button v-if="dock" class="x" aria-label="Скрыть график" title="Скрыть" @click="emit('back')"><AppIcon name="x" :size="16" /></button>
      </div>


      <!-- Столбики; подсказка со словами всплывает поверх — ничего не сдвигается -->
      <div ref="plotw" class="plotw">
      <div class="plot" :style="{ '--n': bins.length }" @mouseleave="hover = null">
        <div class="grid"><i /><i /><i /></div>
        <!-- Всплывашка над столбиками: слово только что ушло -->
        <Transition name="jmp"><div v-if="jump && !active" class="jump" :class="'jq' + jump.q"><b>{{ jump.word }}</b> · {{ GRADE[jump.q] }} → <b class="to">{{ jump.to }}</b></div></Transition>
        <button v-for="b in bins" :key="b.i" class="bc" :class="{ on: activeI === b.i, pin: pinned === b.i, later: b.i === sc.n, hot: b.items.some(fresh) }"
          :aria-label="`${title(b.i)}: ${b.items.length} ${word(b.items.length)}`" @mouseenter="hover = b.i" @click="pin(b.i)">
          <span v-if="b.items.length" class="bn">{{ b.items.length }}</span>
          <span class="stk" :style="{ height: (b.items.length ? 8 + b.items.length / maxN * (dock ? 110 : 120) : 3) + 'px' }"><i v-for="g in segs(b)" :key="g.k" :class="g.k" :style="{ flexGrow: g.n }" /></span>
        </button>
      </div>
      <div class="ax" :style="{ '--n': bins.length }"><span v-for="b in bins" :key="b.i" :class="{ now: b.i === 0 }">{{ axis(b.i) }}</span></div>

      <!-- Подсказка столбика -->
      <Transition name="tipf">
        <div v-if="active" class="tip" :class="{ pinned: pinned === active.i }" :style="{ '--x': tipLeft + '%', '--b': tipPos.bottom + 'px', '--mh': tipPos.maxH + 'px' }">
          <div class="th"><b>{{ title(active.i) }}</b><span>{{ active.items.length ? `${active.items.length} ${word(active.items.length)}` : 'слов нет' }}</span></div>
          <div v-if="active.items.length" class="tl">
            <template v-for="(r, idx) in tipItems.slice(0, open ? 99 : MAXW)" :key="r.c.id">
              <!-- Новые встают в очередь после повторений и раньше карточек, которым ещё рано (как в Anki) -->
              <div v-if="active.i === 0 && newLeft && idx === firstWait" class="qnew"><i class="qn nw">{{ newRange || '+' + newLeft }}</i><span>{{ newLeft }} новых: {{ queueNew.slice(0, 3).map(c => c.front).join(', ') }}{{ newLeft > 3 ? '…' : '' }}</span></div>
              <button class="tw" :class="[r.k, { fresh: fresh(r), on: open === r.c.id }]" :disabled="pinned !== active.i" @click.stop="open = open === r.c.id ? null : r.c.id">
                <i v-if="active.i === 0 && qPos[r.c.id]" class="qn" :class="{ first: qPos[r.c.id] === 1 }" :title="qPos[r.c.id] === 1 && currentId ? 'Сейчас на экране' : `В очереди ${qPos[r.c.id]}-я`">{{ qPos[r.c.id] }}</i><i v-else class="dot" />
                <b>{{ r.c.front }}</b><small>{{ r.c.back }}</small><span class="cd" :class="{ wait: active.i === 0 && !qPos[r.c.id] }">{{ active.i === 0 && !qPos[r.c.id] ? `через ${when(r)}` : active.i === 0 && qPos[r.c.id] === 1 && currentId ? 'на экране' : when(r) }}</span></button>
              <!-- История слова (в закреплённой подсказке) -->
              <div v-if="open === r.c.id" class="hist">
                <div class="meta"><span>{{ KIND[r.k] }}</span><span>вспомнит <b>{{ Math.round(r.r * 100) }}%</b></span><span>стаб. <b>{{ fmtSpan(0, Math.max(1, Math.round(r.mem.stab))) }}</b></span><span>сложн. <b>{{ r.mem.diff.toFixed(1) }}</b></span><span>ошибок <b>{{ r.s.lapses }}</b></span></div>
                <div v-if="histOf(r).length" class="hb">
                  <div v-for="(h, i) in histOf(r)" :key="i" class="hc" :title="`${fmtDate(h.at)} · ${GRADE[h.q]} → ${h.label}`">
                    <small class="hv">{{ h.label }}</small><i :class="'q' + h.q" :style="{ height: Math.max(3, Math.sqrt(h.days / histMax(r)) * 40) + 'px' }" /><small class="hd">{{ fmtDate(h.at) }}</small>
                  </div>
                </div>
              </div>
            </template>
            <small v-if="!open && active.items.length > MAXW" class="more">и ещё {{ active.items.length - MAXW }}…{{ pinned === active.i ? '' : ' — нажмите на столбик' }}</small>
          </div>
          <div v-if="active.i === 0 && newLeft && firstWait < 0" class="qnew"><i class="qn nw">{{ newRange || '+' + newLeft }}</i><span>{{ newLeft }} новых: {{ queueNew.slice(0, 3).map(c => c.front).join(', ') }}{{ newLeft > 3 ? '…' : '' }}</span></div>
          <small v-if="active.items.length && pinned !== active.i" class="hint2">нажмите на столбик — закрепить и посмотреть историю слова</small>
        </div>
      </Transition>
      </div>
      <p v-if="!started.length" class="hint none">Слова ещё не начаты — ответьте на первую карточку</p>
      <div class="foot"><button class="rst" :class="{ sure }" :disabled="!started.length" @click="reset" @blur="sure = false">
        <AppIcon name="refresh" :size="14" />{{ sure ? `Точно? ${started.length} ${word(started.length)} станут новыми` : 'Сбросить прогресс колоды' }}</button></div>
    </section>
  </div>
</template>

<style scoped>
.dc { display: grid; gap: 12px }
.bar { display: flex; align-items: center; gap: 10px } .dt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; text-align: center; margin-right: 90px }
.ch { position: relative; display: grid; gap: 8px; padding: 12px 12px 10px; min-width: 0 }
.dc.docked .ch { animation: down .25s ease } @keyframes down { from { transform: translateY(-12px); opacity: 0 } }
.dc.docked .plot { height: 150px }
/* Шапка: заголовок, счётчики, масштаб */
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px }
.ttl { flex: 1; min-width: 180px; display: grid; gap: 2px } .ttl > b { font-size: 16px }
.cnt { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 5px; font-size: 11px; font-weight: 700; color: var(--hint) }
.cnt i { width: 8px; height: 8px; border-radius: 2px; margin-left: 6px } .cnt i:first-child { margin-left: 0 }
.cnt .new { background: var(--blue) } .cnt .learn { background: var(--red) } .cnt .review { background: var(--green) } .cnt .mature { background: var(--green-d) }
.scl { flex: none; padding: 2px } .scl button { padding: 4px 9px; font-size: 12px }
.x { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .x:hover { background: var(--surface) }
/* Всплывашка «слово ушло» */
.jump { position: absolute; top: 0; left: 50%; max-width: 92%; overflow: hidden; text-overflow: ellipsis; transform: translateX(-50%); z-index: 3; padding: 6px 14px; border-radius: 99px; background: #2f3a40; color: #fff; font-size: 13px; font-weight: 700; white-space: nowrap; box-shadow: 0 6px 16px rgba(0, 0, 0, .2) }
.jump.jq0 .to { color: #ff8a8a } .jump.jq1 .to { color: #ffc266 } .jump.jq2 .to { color: #a0f07a } .jump.jq3 .to { color: #8fdcff }
.jmp-enter-active, .jmp-leave-active { transition: all .3s ease } .jmp-enter-from, .jmp-leave-to { opacity: 0; transform: translate(-50%, -8px) }
/* Столбики */
.plot { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 3px; align-items: end; height: 165px; padding-top: 14px }
.grid { position: absolute; inset: 14px 0 0; display: grid; grid-template-rows: repeat(3, 1fr); pointer-events: none } .grid i { border-top: 1px dashed var(--border) }
.bc { position: relative; display: grid; justify-items: center; align-content: end; gap: 2px; height: 100%; padding: 0 0 1px; border: 0; border-radius: 8px 8px 0 0; background: none; cursor: pointer; min-width: 0; font: inherit; z-index: 1 }
.bc:hover, .bc.on { background: var(--blue-l) } .bc.later { border-left: 1px dashed var(--border); border-radius: 0 8px 0 0 }
.stk { display: flex; flex-direction: column-reverse; gap: 2px; width: 72%; max-width: 26px; border-radius: 5px 5px 2px 2px; overflow: hidden; background: var(--border); transition: height .5s cubic-bezier(.3, 1.4, .5, 1) }
.stk i { display: block; min-height: 3px } .stk .learn { background: var(--red) } .stk .review { background: var(--green) } .stk .mature { background: var(--green-d) }
.bc.hot .stk { animation: hot 1s ease 3; transform-origin: bottom } @keyframes hot { 50% { transform: scaleY(1.1); filter: brightness(1.15) } }
.bn { font-size: 11px; font-weight: 900; color: var(--text); line-height: 1 }
.ax { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 3px; height: 14px; border-top: 1px solid var(--border); padding-top: 3px }
.ax span { display: flex; justify-content: center; width: 0; justify-self: center; font-size: 10px; font-weight: 800; color: var(--hint-2); white-space: nowrap } .ax span.now { color: var(--blue) }
.none { margin: 0; text-align: center; font-size: 13px }
/* Подсказка столбика — поверх графика, ничего не сдвигает */
.plotw { position: relative }
.tip { position: absolute; z-index: 20; bottom: var(--b, 100%); pointer-events: none; left: clamp(min(130px, 50%), var(--x), calc(100% - min(130px, 50%))); transform: translateX(-50%); width: min(260px, 100%); box-sizing: border-box; max-height: var(--mh, 260px); overflow-y: auto;
  display: grid; gap: 4px; padding: 8px 8px 6px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 10px 28px rgba(0, 0, 0, .16) }
.tip.pinned { pointer-events: auto }      /* наведённая подсказка не мешает водить по столбикам; закреплённую можно нажимать */
/* подсказка над столбиком — уголок снизу */
.tipf-enter-active, .tipf-leave-active { transition: opacity .12s, transform .12s } .tipf-enter-from, .tipf-leave-to { opacity: 0; transform: translate(-50%, -4px) }
.th { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 0 4px 2px; font-size: 13px } .th span { flex: none; font-size: 12px; font-weight: 800; color: var(--hint) }
.tl { display: grid; gap: 1px }
.tw { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 5px 6px; border: 0; border-radius: 8px; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer }
.tw:disabled { cursor: default; color: var(--text); opacity: 1 } .tw:not(:disabled):hover, .tw.on { background: var(--surface) }
.tw .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--c) } .tw.learn { --c: var(--red) } .tw.review { --c: var(--green) } .tw.mature { --c: var(--green-d) }
.tw b { flex: none; max-width: 45%; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .tw small { flex: 1; min-width: 0; font-size: 11px; font-weight: 600; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tw .cd { flex: none; font-size: 12px; font-weight: 800; color: var(--hint); font-variant-numeric: tabular-nums } .tw.learn .cd { color: var(--red-d) }
.tw.fresh { background: #fff3d6; box-shadow: inset 0 0 0 2px var(--orange) } html[data-theme='dark'] .tw.fresh { background: var(--surface) }
.more, .hint2 { padding: 0 6px; font-size: 11px; font-weight: 700; color: var(--hint) } .hint2 { color: var(--hint-2) }
.bc.pin { box-shadow: inset 0 0 0 2px var(--blue) }
/* Номер в очереди: синий кружок; 1 — карточка на экране (заливка) */
.qn { flex: none; display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: var(--blue-l); color: var(--blue); font-style: normal; font-size: 11px; font-weight: 900; font-variant-numeric: tabular-nums }
.qn.first { background: var(--blue); color: #fff } .tw .cd.wait { color: var(--orange-d) }
.qnew { display: flex; align-items: center; gap: 6px; padding: 5px 6px; font-size: 12px; font-weight: 600; color: var(--hint) } .qn.nw { background: var(--surface); color: var(--blue) }
.none { margin: 0; text-align: center; font-size: 13px }
/* История слова */
.hist { display: grid; gap: 4px; margin: 0 0 4px 20px; padding: 6px 8px; border-radius: 10px; background: var(--surface) }
.meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-size: 11px; font-weight: 700; color: var(--hint) } .meta > b:first-child { font-size: 15px; color: var(--text) } .meta span b { color: var(--text) }
.hb { display: flex; align-items: flex-end; gap: 6px; overflow-x: auto; padding-bottom: 2px }
.hc { flex: none; width: 36px; display: grid; justify-items: center; align-content: end; gap: 2px }
.hc i { display: block; width: 18px; border-radius: 4px 4px 0 0 } .hv { font-size: 10px; font-weight: 800; white-space: nowrap } .hd { font-size: 9px; color: var(--hint-2); font-weight: 700 }
.q0 { background: var(--red) } .q1 { background: var(--orange) } .q2 { background: var(--green) } .q3 { background: var(--blue) }
.foot { display: flex; justify-content: flex-end }
.rst { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 0; border-radius: 99px; background: none; color: var(--hint); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.rst:hover:not(:disabled) { background: var(--red-l); color: var(--red-d) } .rst.sure { background: var(--red); color: #fff } .rst:disabled { opacity: .4; cursor: default }
@media (max-width: 520px) { .dt { margin-right: 0 } .scl button { padding: 4px 7px } .plot { height: 130px } }
</style>

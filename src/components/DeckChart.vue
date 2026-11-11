<script setup>
// График колоды: где сейчас каждое слово и как алгоритм (Anki / FSRS) его «отбрасывает».
// Сам график (стопки карточек, масштаб, подсказка, физика) — общий PileChart.vue (он же в Review); здесь — данные колоды,
// подсказка с очередью как в Anki и историей ответов слова, «Сбросить прогресс колоды».
//  dock — график сверху сессии (над карточкой), без него — отдельный экран из списка колод.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { srsOf, kindOf, LEARNED_DAYS, resetDeck, buildQueue, deckCounts, today } from '../composables/useSrs'
import { showToast } from '../composables/useToast'
import { dueMs, recallNow, fmtSpan, memoryOf } from '../utils/fsrs'
import AppIcon from './AppIcon.vue'
import BackButton from './BackButton.vue'
import PileChart from './PileChart.vue'
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
  const kk = k === 'review' && s.interval >= LEARNED_DAYS ? 'mature' : k
  return { id: c.id, front: c.front, back: c.back, image: c.image, zero: kk === 'learn', c, k: kk, s, at: dueMs(s), r: recallNow(s, now.value), mem: memoryOf(s) }
}))
const started = computed(() => rows.value.filter(r => r.s))
const counts = computed(() => { const o = { new: 0, learn: 0, review: 0, mature: 0 }; for (const r of rows.value) o[r.k]++; return o })
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов')
const dayDiff = (ymd) => Math.round((new Date(ymd + 'T12:00') - new Date(today() + 'T12:00')) / DAY)

// Очередь как в Anki — в подсказке «Сейчас»: номер, в каком порядке придут карточки, а карточки на шагах, которым ещё рано, — «через 0:45»
const queue = computed(() => { now.value; return buildQueue(props.deck, props.userKey, now.value) })
const qPos = computed(() => {
  const ids = queue.value.map(c => c.id), order = props.currentId ? [props.currentId, ...ids.filter(id => id !== props.currentId)] : ids
  const m = {}; order.forEach((id, i) => { m[id] = i + 1 }); return m
})
const queueNew = computed(() => queue.value.filter(c => !srsOf(props.userKey, c)))
const newLeft = computed(() => deckCounts(props.deck, props.userKey).new)
/** Слова подсказки: у «Сейчас» — в порядке очереди, у остальных — по времени */
const tipItems = (b) => b.i !== 0 ? b.items : [...b.items].sort((a, z) => (qPos.value[a.c.id] ?? 1e6 + a.at) - (qPos.value[z.c.id] ?? 1e6 + z.at))
const firstWait = (list, b) => b.i === 0 ? list.findIndex(r => !qPos.value[r.c.id]) : -1
const newRange = computed(() => { const ps = queueNew.value.map(c => qPos.value[c.id]).filter(Boolean); return ps.length ? (ps.length > 1 ? `${Math.min(...ps)}–${Math.max(...ps)}` : `${ps[0]}`) : '' })
const open = ref(null)                                        // слово, чья история открыта

// Когда вернётся слово: обратный отсчёт до часа, дальше — «завтра / 5 дн.»
function when(r) {
  const ms = r.at - now.value
  if (ms <= 0) return 'пора'
  if (ms < HOUR) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  if (r.k === 'learn') return `${Math.round(ms / HOUR)} ч`
  const d = dayDiff(r.s.due); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : fmtSpan(0, d)
}

// В реальном времени: слово только что «ушло» — падает в свою стопку и подсвечивается
const jump = ref(null); let jumpTimer = null
const lastKey = computed(() => { let m = null; for (const r of started.value) if (!m || (r.s.lastAt ?? 0) > (m.s.lastAt ?? 0)) m = r; return m ? `${m.c.id}:${m.s.lastAt}` : '' })
watch(lastKey, (v, was) => {
  if (!v || !was) return
  jump.value = v.split(':')[0]
  clearTimeout(jumpTimer); jumpTimer = setTimeout(() => { jump.value = null }, 2500)
})
onUnmounted(() => clearTimeout(jumpTimer))

// «Сбросить колоду»: два нажатия — второе подтверждает
const sure = ref(false)
function reset() {
  if (!sure.value) { sure.value = true; return }
  const n = resetDeck(String(props.userKey), props.deck); sure.value = false; open.value = null
  showToast(n ? `Колода сброшена: ${n} ${word(n)} снова новые` : 'Сбрасывать нечего — слова ещё не начаты'); emit('reset')
}

// История слова
const histOf = (r) => (r.s?.hist ?? []).filter(h => !Array.isArray(h)).map(({ t: at, q, i: iv }) => ({ at, q, label: iv < 0 ? fmtSpan(-iv, 0) : fmtSpan(0, iv), days: iv < 0 ? -iv / 1440 : iv }))
const histMax = (r) => Math.max(1, ...histOf(r).map(h => h.days))
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}` }
</script>

<template>
  <div class="dc" :class="{ docked: dock }">
    <header v-if="!dock" class="bar">
      <BackButton to="Колоды" @click="emit('back')" />
      <b class="dt">{{ deck.title }}</b>
    </header>

    <section class="card ch">
      <PileChart :items="started" :dock="dock" :fresh="jump" :order="['mature', 'review', 'learn']" @unpin="open = null">
        <template #top><span class="cnt">{{ counts.new }} новых · {{ counts.learn }} изучаю · {{ counts.review + counts.mature }} повтор.</span></template>
        <template #actions>
          <!-- В колоде «Сбросить» — значком в той же строке; первое нажатие — «Точно?» -->
          <button v-if="dock" class="rst ri" :class="{ sure }" :disabled="!started.length" :aria-label="sure ? 'Точно сбросить' : 'Сбросить прогресс колоды'" :title="sure ? '' : 'Сбросить прогресс колоды'" @click="reset" @blur="sure = false">
            <AppIcon name="refresh" :size="15" /><template v-if="sure">Точно? {{ started.length }} {{ word(started.length) }} станут новыми</template></button>
          <button v-if="dock" class="x" aria-label="Скрыть график" title="Скрыть" @click="emit('back')"><AppIcon name="x" :size="16" /></button>
        </template>
        <template #tip="{ bin, pinned, max }">
          <div class="tl">
            <template v-for="(r, idx) in tipItems(bin).slice(0, open ? 99 : max)" :key="r.c.id">
              <!-- Новые встают в очередь после повторений и раньше карточек, которым ещё рано (как в Anki) -->
              <div v-if="bin.i === 0 && newLeft && idx === firstWait(tipItems(bin), bin)" class="qnew"><i class="qn nw">{{ newRange || '+' + newLeft }}</i><span>{{ newLeft }} новых: {{ queueNew.slice(0, 3).map(c => c.front).join(', ') }}{{ newLeft > 3 ? '…' : '' }}</span></div>
              <button class="tw" :class="[r.k, { fresh: jump === r.c.id, on: open === r.c.id }]" :disabled="!pinned" @click.stop="open = open === r.c.id ? null : r.c.id">
                <i v-if="bin.i === 0 && qPos[r.c.id]" class="qn" :class="{ first: qPos[r.c.id] === 1 }" :title="qPos[r.c.id] === 1 && currentId ? 'Сейчас на экране' : `В очереди ${qPos[r.c.id]}-я`">{{ qPos[r.c.id] }}</i><i v-else class="dot" />
                <b>{{ r.c.front }}</b><small>{{ r.c.back }}</small><span class="cd" :class="{ wait: bin.i === 0 && !qPos[r.c.id] }">{{ bin.i === 0 && !qPos[r.c.id] ? `через ${when(r)}` : bin.i === 0 && qPos[r.c.id] === 1 && currentId ? 'на экране' : when(r) }}</span></button>
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
            <small v-if="!open && bin.items.length > max" class="more">и ещё {{ bin.items.length - max }}…{{ pinned ? '' : ' — нажмите на столбик' }}</small>
          </div>
          <div v-if="bin.i === 0 && newLeft && firstWait(tipItems(bin), bin) < 0" class="qnew"><i class="qn nw">{{ newRange || '+' + newLeft }}</i><span>{{ newLeft }} новых: {{ queueNew.slice(0, 3).map(c => c.front).join(', ') }}{{ newLeft > 3 ? '…' : '' }}</span></div>
        </template>
      </PileChart>
      <p v-if="!started.length" class="hint none">Слова ещё не начаты — ответьте на первую карточку</p>
      <div v-if="!dock" class="foot"><button class="rst" :class="{ sure }" :disabled="!started.length" @click="reset" @blur="sure = false">
        <AppIcon name="refresh" :size="14" />{{ sure ? `Точно? ${started.length} ${word(started.length)} станут новыми` : 'Сбросить прогресс колоды' }}</button></div>
    </section>
  </div>
</template>

<style scoped>
.dc { display: grid; gap: 12px }
.bar { display: flex; align-items: center; gap: 10px } .dt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; text-align: center; margin-right: 90px }
.ch { position: relative; display: grid; gap: 8px; padding: 12px 12px 10px; min-width: 0 }
.dc.docked .ch { animation: down .25s ease; gap: 4px; padding: 6px 10px 6px }      /* сверху сессии — минимум отступов, место отдано графику */
.dc.docked .x { width: 26px; height: 26px } @keyframes down { from { transform: translateY(-12px); opacity: 0 } }
.cnt { font-size: 12px; font-weight: 700; color: var(--hint) }
.x { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .x:hover { background: var(--surface) }
.none { margin: 0; text-align: center; font-size: 13px }
/* Подсказка столбика (содержимое — слот PileChart) */
.tl { display: grid; gap: 1px }
.tw { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 5px 6px; border: 0; border-radius: 8px; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer }
.tw:disabled { cursor: default; color: var(--text); opacity: 1 } .tw:not(:disabled):hover, .tw.on { background: var(--surface) }
.tw .dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--c, var(--hint-2)) } .tw.learn { --c: var(--red) } .tw.review { --c: var(--green) } .tw.mature { --c: var(--green-d) }
.tw b { flex: none; max-width: 45%; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .tw small { flex: 1; min-width: 0; font-size: 11px; font-weight: 600; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tw .cd { flex: none; font-size: 12px; font-weight: 800; color: var(--hint); font-variant-numeric: tabular-nums } .tw.learn .cd { color: var(--red-d) }
.tw.fresh { background: #fff3d6; box-shadow: inset 0 0 0 2px var(--orange) } html[data-theme='dark'] .tw.fresh { background: var(--surface) }
.more { padding: 0 6px; font-size: 11px; font-weight: 700; color: var(--hint) }
/* Номер в очереди: синий кружок; 1 — карточка на экране (заливка) */
.qn { flex: none; display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: var(--blue-l); color: var(--blue); font-style: normal; font-size: 11px; font-weight: 900; font-variant-numeric: tabular-nums }
.qn.first { background: var(--blue); color: #fff } .tw .cd.wait { color: var(--orange-d) }
.qnew { display: flex; align-items: center; gap: 6px; padding: 5px 6px; font-size: 12px; font-weight: 600; color: var(--hint) } .qn.nw { background: var(--surface); color: var(--blue) }
/* История слова */
.hist { display: grid; gap: 4px; margin: 0 0 4px 20px; padding: 6px 8px; border-radius: 10px; background: var(--surface) }
.meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-size: 11px; font-weight: 700; color: var(--hint) } .meta span b { color: var(--text) }
.hb { display: flex; align-items: flex-end; gap: 6px; overflow-x: auto; padding-bottom: 2px }
.hc { flex: none; width: 36px; display: grid; justify-items: center; align-content: end; gap: 2px }
.hc i { display: block; width: 18px; border-radius: 4px 4px 0 0 } .hv { font-size: 10px; font-weight: 800; white-space: nowrap } .hd { font-size: 9px; color: var(--hint-2); font-weight: 700 }
.q0 { background: var(--red) } .q1 { background: var(--orange) } .q2 { background: var(--green) } .q3 { background: var(--blue) }
.foot { display: flex; justify-content: flex-end }
.rst { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 0; border-radius: 99px; background: none; color: var(--hint); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.rst:hover:not(:disabled) { background: var(--red-l); color: var(--red-d) } .rst.sure { background: var(--red); color: #fff } .rst:disabled { opacity: .4; cursor: default }
.ri { padding: 5px 7px } .ri.sure { padding: 5px 10px }
/* сверху сессии — квадратные кнопки в рамке, как переключатели графика */
.dc.docked .ri, .dc.docked .x { box-sizing: border-box; height: 26px; min-width: 28px; justify-content: center; padding: 0 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--hint) } .dc.docked .ri.sure { padding: 0 10px; background: var(--red); border-color: var(--red); color: #fff }
.dc.docked .x { width: auto }
@media (max-width: 520px) {
  .dt { margin-right: 0 }
  .dc.docked .ch { gap: 4px; padding: 8px 8px 10px }
  .dc.docked .cnt { white-space: nowrap; overflow: hidden }
  .dc.docked .ri.sure { position: absolute; right: 8px; top: 30px; z-index: 5 }
}
</style>

<script setup>
// «Аналитика прогресса» (вкладка Review «Грамматика и навыки», 18.11.2026 — по согласованному макету).
// Только то, что уже есть, — ничего не вводится и не придумывается; цвета — только 4 цвета наших тегов:
//  • Плашки навыков — теги экранов (Чтение, Слух, Письмо, Речь): шанс вспомнить по FSRS, сколько дней помнит, разница
//    с прошлым месяцем (по снимкам сервера). Нажал на плашку — всё ниже только по этому тегу.
//  • «Темп по месяцам» — столбики: сколько упражнений пройдено за месяц (24.11.2026: раньше — законченные уроки; теперь каждое
//    упражнение, на которое ответил, даже если урок не закончен — из журнала); внутри — доля по тегам.
//    Над ними: упражнений за месяц, разница с прошлым, время и сколько ответов зачтено.
//  • «По навыкам» — круг по тегам: сколько упражнений каждого навыка в уроках месяца.
//  • Темы грамматики — шанс вспомнить, разница с прошлым месяцем, сколько помнит; сначала слабые. Нажал — кривая памяти.
// Расчёты — utils/progress.ts; данные — словарь Review (items) и GET /progress/stats (пройденные уроки и снимки по месяцам).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { SKILL_C } from '../utils/lesson'
import { SKILLS, topicById } from '../utils/skills'
import { TAGS, monthOf, prevMonth, monthName, monthIn, monthTo, monthsOf, lessonsIn, tagCount, stateAt, topicTags, memText, hm } from '../utils/progress'
import { exWord } from '../utils/runlog'
import { apiRequest, isDemo, API, fb } from '../firebase'
import WordCurve from './WordCurve.vue'

const props = defineProps({
  items: { type: Object, required: true },             // навыки и темы из словаря Review { ключ: RItem }
  cfg: { type: Object, required: true },               // { retention, maxDays }
  studentId: { type: [String, Number], default: null }, // карточка ученика у преподавателя; нет — свой прогресс
})
const online = !isDemo && !!API && !!fb
const lessons = ref([]), mon = ref({}), loadErr = ref(false)
let reqN = 0
async function load() {
  if (!online) return
  const n = ++reqN
  try {
    const r = await apiRequest('/progress/stats' + (props.studentId != null ? `?studentId=${encodeURIComponent(props.studentId)}` : ''))
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json(); if (n !== reqN) return
    lessons.value = d.ex ?? d.lessons ?? []; mon.value          // ex — пройденные упражнения (сервер с 24.11.2026); старый сервер — уроки
     = d.mon ?? {}; loadErr.value = false
  } catch { if (n === reqN) loadErr.value = true }
}
watch(() => props.studentId, load, { immediate: true })
// ученик отвечает — память в словаре уже новая; уроки и снимки подтягиваем не чаще раза в 10 с
let lt = null
watch(() => props.items, () => { clearTimeout(lt); lt = setTimeout(load, 10_000) })
const tick = ref(Date.now()); let tt = null
onMounted(() => { tt = setInterval(() => { tick.value = Date.now() }, 60_000) })
onUnmounted(() => { clearInterval(tt); clearTimeout(lt) })

const months = computed(() => monthsOf(lessons.value, mon.value, tick.value))
const cur = computed(() => monthOf(tick.value))
const ym = ref(monthOf(Date.now()))
const mIdx = computed(() => Math.max(0, months.value.indexOf(ym.value)))
const step = (d) => { const m = months.value[mIdx.value + d]; if (m) ym.value = m }
const pm = computed(() => prevMonth(ym.value))
const hasPrev = computed(() => months.value[0] <= pm.value)
const tag = ref(null)                                       // фильтр по тегу (нажали плашку или кусок круга)
const pick = (k) => { tag.value = tag.value === k ? null : k }
const tab = ref((() => { try { return localStorage.getItem('tma.progress.tab') || 'pace' } catch { return 'pace' } })())
watch(tab, (v) => { try { localStorage.setItem('tma.progress.tab', v) } catch { /* приватный режим */ } })
const at = (key, m) => stateAt(key, m, props.items, mon.value, props.cfg, tick.value)
const pct = (st) => (st ? (st.failed ? 0 : st.recall) : null)

// плашки навыков
const tiles = computed(() => TAGS.map((k) => {
  const st = at('skill:' + k, ym.value), pv = hasPrev.value ? at('skill:' + k, pm.value) : null
  return { k, t: SKILLS[k], c: SKILL_C[k], st, p: pct(st), d: st && pv ? pct(st) - pct(pv) : null, first: !!st && !pv }
}))

// темп: уроки месяца (с фильтром по тегу)
const L = computed(() => lessonsIn(lessons.value, ym.value, tag.value))
const Lp = computed(() => lessonsIn(lessons.value, pm.value, tag.value))
const kpi = computed(() => {
  const ok = L.value.reduce((a, l) => a + l.ok, 0), all = L.value.reduce((a, l) => a + l.all, 0)
  return { n: L.value.length, d: hasPrev.value ? L.value.length - Lp.value.length : null, sec: L.value.reduce((a, l) => a + l.sec, 0), okp: all ? Math.round(ok / all * 100) : null }
})
// столбики: до 6 месяцев вокруг выбранного; высота — уроки, внутри — доли упражнений по тегам
const H = 210, PAD = 26
const W = ref(600), chartBox = ref(null)          // ширина графика = ширина карточки: на телефоне подписи не мельчают
let ro = null
onMounted(() => { ro = new ResizeObserver(([e]) => { W.value = Math.max(260, Math.round(e.contentRect.width)) }) })
watch(chartBox, (el, was) => { if (was) ro?.unobserve(was); if (el) ro?.observe(el) })
onUnmounted(() => ro?.disconnect())
const bars = computed(() => {
  const ms = months.value, end = Math.min(ms.length, Math.max(mIdx.value + 1, 6)), win = ms.slice(Math.max(0, end - 6), end)
  const cols = win.map((m) => {
    const ls = lessonsIn(lessons.value, m, tag.value), cnt = tagCount(ls), tot = TAGS.reduce((a, k) => a + cnt[k], 0)
    const parts = tag.value ? [{ k: tag.value, v: ls.length ? 1 : 0 }] : TAGS.map((k) => ({ k, v: tot ? cnt[k] / tot : 0 }))
    return { m, n: ls.length, parts: parts.filter(p => p.v > 0) }
  })
  const max = Math.max(1, ...cols.map(c => c.n)), slot = W.value / Math.max(cols.length, 1), bw = Math.min(70, slot * 0.55)
  return cols.map((c, i) => {
    const h = (c.n / max) * (H - PAD - 22), x = i * slot + (slot - bw) / 2
    let y = H - 22
    const segs = c.parts.map((p) => { const sh = h * p.v; y -= sh; return { k: p.k, y, h: sh, pc: Math.round(p.v * 100) } })
    return { ...c, x, w: bw, top: H - 22 - h, cx: x + bw / 2, segs }
  })
})
// круг по тегам: упражнения каждого навыка в уроках месяца
const donut = computed(() => {
  const cnt = tagCount(lessonsIn(lessons.value, ym.value)), tot = TAGS.reduce((a, k) => a + cnt[k], 0)
  const R = 62, C = 2 * Math.PI * R
  let off = 0
  const arcs = TAGS.filter(k => cnt[k]).map((k) => { const len = cnt[k] / tot * C; const a = { k, len, off, gap: C - len }; off += len; return a })
  return { cnt, tot, R, C, arcs }
})
// темы грамматики
const tTags = computed(() => topicTags(lessons.value))
const topics = computed(() => {
  const keys = new Set([...Object.keys(props.items).filter(k => k.startsWith('topic:')), ...Object.values(mon.value).flatMap(o => Object.keys(o).filter(k => k.startsWith('topic:')))])
  return [...keys].map((key) => {
    const st = at(key, ym.value); if (!st) return null
    const pv = hasPrev.value ? at(key, pm.value) : null, x = props.items[key], tp = topicById(key.slice(6))
    return { key, t: x?.text ?? tp?.t ?? key.slice(6), lvl: x?.tr ?? tp?.lvl ?? '', tags: tTags.value[key] ?? [], st, p: pct(st), d: pv ? pct(st) - pct(pv) : null, x }
  }).filter(r => r && (!tag.value || r.tags.includes(tag.value))).sort((a, b) => a.p - b.p || a.t.localeCompare(b.t))
})
const open = ref(null)
const how = ref(false)
</script>

<template>
  <div class="sp">
    <div class="card">
      <div class="hd">
        <h2>Аналитика прогресса</h2>
        <span class="mon">
          <button class="nav" :disabled="mIdx === 0" aria-label="Предыдущий месяц" @click="step(-1)">‹</button>
          <b>{{ monthName(ym) }} {{ ym.slice(0, 4) }}<small v-if="ym === cur"> · сейчас</small></b>
          <button class="nav" :disabled="mIdx >= months.length - 1" aria-label="Следующий месяц" @click="step(1)">›</button>
        </span>
      </div>
      <button class="lnk" @click="how = !how">Откуда цифры <span>{{ how ? '▴' : '▾' }}</span></button>
      <div v-if="how" class="how">
        <p>Всё — из ответов в уроках, ничего не вводится. Процент у навыка и темы — шанс вспомнить по алгоритму повторений (FSRS), «помнит» — сколько дней держится память. Навык — по тегам упражнений, как в меню: Чтение, Слух, Письмо, Речь («Повтори за диктором» — когда фраза распозналась и совпала).</p>
        <p>Темп — пройденные упражнения за месяц (каждое, на которое ответили, даже если урок не закончен); цвета внутри столбика — доля каждого навыка. Прошлые месяцы — по снимкам на конец месяца (сохраняются сами с 18.11.2026).</p>
      </div>
      <p v-if="loadErr" class="em">Не удалось загрузить упражнения — темп появится, когда сервер ответит.</p>

      <div class="tiles">
        <button v-for="s in tiles" :key="s.k" class="tile" :class="{ sel: tag === s.k, dim: tag && tag !== s.k }" @click="pick(s.k)">
          <span class="row1"><i class="tg" :style="{ background: s.c }">{{ s.t }}</i><b v-if="s.st">{{ s.p }}%</b></span>
          <template v-if="s.st">
            <span class="bar"><i :style="{ width: s.p + '%', background: s.c }" /></span>
            <span class="row2"><span>{{ s.st.failed ? 'только что ошибка' : memText(s.st.stab) }}</span><em v-if="s.d != null" :class="s.d >= 0 ? 'pos' : 'neg'">{{ s.d >= 0 ? '▲' : '▼' }} {{ Math.abs(s.d) }} к {{ monthTo(pm) }}</em><em v-else-if="s.first" class="mu">первый месяц</em></span>
          </template>
          <span v-else class="mu">пока не было упражнений</span>
        </button>
      </div>
    </div>

    <div class="card">
      <div class="tabs" role="tablist"><button v-for="[k, t] in [['pace', 'Темп по месяцам'], ['tags', 'По навыкам']]" :key="k" role="tab" :aria-selected="tab === k" :class="{ on: tab === k }" @click="tab = k">{{ t }}</button></div>
      <template v-if="tab === 'pace'">
        <div class="kpis">
          <div class="kpi"><b>{{ kpi.n }} {{ exWord(kpi.n) }}</b><span>пройдено в {{ monthIn(ym) }}<template v-if="tag"> · с тегом «{{ SKILLS[tag] }}»</template></span></div>
          <div class="kpi"><b :class="kpi.d == null ? '' : kpi.d >= 0 ? 'pos' : 'neg'">{{ kpi.d == null ? '—' : (kpi.d >= 0 ? '+' : '') + kpi.d }}</b><span>{{ kpi.d == null ? 'первый месяц' : 'к ' + monthTo(pm) }}</span></div>
          <div class="kpi"><b>{{ kpi.n ? hm(kpi.sec) : '—' }}</b><span>в упражнениях<template v-if="kpi.okp != null"> · {{ kpi.okp }}% зачтено</template></span></div>
        </div>
        <span class="lg"><i v-for="k in tag ? [tag] : TAGS" :key="k" class="tg sm" :style="{ background: SKILL_C[k] }">{{ SKILLS[k] }}</i></span>
        <div ref="chartBox" class="cbx"><svg class="bars" :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="bars.map(b => `${monthName(b.m)}: ${b.n} ${exWord(b.n)}`).join(', ')">
          <line :x1="0" :x2="W" :y1="H - 22" :y2="H - 22" class="base" />
          <g v-for="b in bars" :key="b.m" class="col" :class="{ on: b.m === ym }" @click="ym = b.m">
            <rect :x="b.x - 6" y="0" :width="b.w + 12" :height="H" fill="transparent" />
            <rect v-for="(g, i) in b.segs" :key="g.k" class="seg" :x="b.x" :y="g.y" :width="b.w" :height="Math.max(0, g.h - (i < b.segs.length - 1 ? 1.5 : 0))" :rx="i === b.segs.length - 1 ? 5 : 0" :fill="SKILL_C[g.k]" />
            <template v-for="g in b.segs" :key="'t' + g.k"><text v-if="!tag && g.h >= 15" :x="b.cx" :y="g.y + g.h / 2 + 4" class="pc">{{ g.pc }}%</text></template>
            <text v-if="b.n" :x="b.cx" :y="b.top - 7" class="tot">{{ b.n }}</text>
            <text :x="b.cx" :y="H - 6" class="ax">{{ monthName(b.m).slice(0, 3) }}</text>
          </g>
        </svg></div>
        <p class="mu">Высота — сколько упражнений пройдено. Цвета внутри — доля каждого навыка. Нажмите на месяц, чтобы посмотреть его сверху.</p>
      </template>
      <template v-else>
        <div v-if="donut.tot" class="dn">
          <svg viewBox="0 0 160 160" class="ring" role="img" :aria-label="TAGS.map(k => `${SKILLS[k]}: ${donut.cnt[k]}`).join(', ')">
            <circle cx="80" cy="80" :r="donut.R" fill="none" style="stroke: var(--border)" stroke-width="22" />
            <circle v-for="a in donut.arcs" :key="a.k" cx="80" cy="80" :r="donut.R" fill="none" :stroke="SKILL_C[a.k]" stroke-width="22" :stroke-dasharray="`${Math.max(0, a.len - 2)} ${a.gap + 2}`" :stroke-dashoffset="-a.off" transform="rotate(-90 80 80)" :opacity="tag && tag !== a.k ? .3 : 1" class="arc" @click="pick(a.k)" />
            <text x="80" y="80" class="n">{{ donut.tot }}</text><text x="80" y="99" class="s">упражнений</text>
          </svg>
          <div class="lgr">
            <template v-for="k in TAGS" :key="k"><i class="tg" :style="{ background: SKILL_C[k], opacity: tag && tag !== k ? .45 : 1 }" @click="pick(k)">{{ SKILLS[k] }}</i><b>{{ donut.cnt[k] }}</b><span class="mu">{{ Math.round(donut.cnt[k] / donut.tot * 100) }}%</span></template>
          </div>
        </div>
        <p v-else class="em">В {{ monthIn(ym) }} упражнений не было.</p>
        <p class="mu">Сколько упражнений каждого навыка было за {{ monthName(ym) }} — видно, какому навыку не хватает практики. Нажмите на навык, чтобы оставить только его.</p>
      </template>
    </div>

    <div class="card">
      <div class="hd"><h3>Темы</h3><span class="mu">{{ tag ? `с тегом «${SKILLS[tag]}», ` : '' }}{{ monthName(ym) }} · сначала слабые</span><button v-if="tag" class="lnk all" @click="tag = null">Показать все</button></div>
      <p v-if="!topics.length" class="em">{{ tag ? 'Тем с этим тегом пока нет.' : 'Пока нет. Тема появится после ответов на экраны урока с темой — её задаёт преподаватель в редакторе курса (или она угадывается по названию урока).' }}</p>
      <template v-for="r in topics" :key="r.key">
        <button class="tr" :class="{ on: open === r.key }" :disabled="!r.x" @click="open = open === r.key ? null : r.key">
          <span class="nm">{{ r.t }}<small v-if="r.lvl">{{ r.lvl }}</small></span>
          <span class="tgs"><i v-for="k in r.tags" :key="k" class="tg sm" :style="{ background: SKILL_C[k] }">{{ SKILLS[k] }}</i></span>
          <span class="bar"><i :style="{ width: r.p + '%' }" /></span>
          <b class="pcv">{{ r.p }}%</b>
          <em v-if="r.d != null" class="dd" :class="r.d >= 0 ? 'pos' : 'neg'">{{ r.d >= 0 ? '▲' : '▼' }} {{ Math.abs(r.d) }}</em><em v-else class="dd mu">новая</em>
          <small class="mm">{{ r.st.failed ? 'только что ошибка' : memText(r.st.stab) }}</small>
        </button>
        <div v-if="open === r.key && r.x" class="cv"><WordCurve :item="r.x" :cfg="cfg" /></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sp { display: grid; gap: 12px; min-width: 0 }
.card { background: var(--card); border-radius: 18px; padding: 18px; box-shadow: 0 1px 0 rgba(0, 0, 0, .04), 0 6px 22px rgba(0, 0, 0, .05); display: grid; gap: 10px; min-width: 0 }
.hd { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
h2 { margin: 0; font-size: 24px; font-weight: 900 } h3 { margin: 0; font-size: 18px; font-weight: 900 }
.mon { margin-left: auto; display: flex; align-items: center; gap: 6px } .mon b { min-width: 132px; text-align: center; font-size: 15px; font-weight: 800 } .mon b::first-letter { text-transform: uppercase } .mon small { font-weight: 700; color: var(--hint) }
.nav { width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); font: inherit; font-size: 18px; font-weight: 800; color: var(--text); cursor: pointer } .nav:disabled { opacity: .35; cursor: default }
.lnk { all: unset; justify-self: start; cursor: pointer; font-size: 13px; font-weight: 800; color: #1278b0; text-decoration: underline } .lnk span { font-size: 11px; text-decoration: none } .lnk.all { margin-left: auto; justify-self: auto }
.how { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--surface) } .how p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--hint) }
.mu { font-size: 12.5px; font-weight: 600; color: var(--hint); margin: 0; font-style: normal } .em { margin: 0; font-size: 13px; color: var(--hint); line-height: 1.5 }
.tg { display: inline-block; padding: 3px 11px; border-radius: 99px; color: #fff; font-size: 12.5px; font-weight: 800; font-style: normal; white-space: nowrap } .tg.sm { padding: 1px 8px; font-size: 11px }
.pos { color: #3a9a00 } .neg { color: #e0453a }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px }
.tile { display: grid; align-content: start; gap: 7px; padding: 12px 14px; margin: 0; border: 0; border-radius: 14px; box-shadow: inset 0 0 0 1px var(--border); background: var(--card); font: inherit; text-align: left; color: var(--text); cursor: pointer; min-width: 0 }
.tile.sel { box-shadow: inset 0 0 0 2px #1cb0f6 } .tile.dim { opacity: .45 }
.row1 { display: flex; align-items: center; justify-content: space-between; gap: 6px } .row1 b { font-size: 22px; font-weight: 900 }
.row2 { display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; font-size: 12px; font-weight: 700; color: var(--hint) } .row2 em { font-style: normal }
.bar { height: 6px; border-radius: 99px; background: var(--border); overflow: hidden } .bar i { display: block; height: 100%; border-radius: 99px }
.tabs { display: flex; gap: 20px; border-bottom: 1px solid var(--border) }
.tabs button { all: unset; cursor: pointer; padding: 4px 0 9px; margin-bottom: -1px; font-size: 14.5px; font-weight: 800; color: var(--hint); border-bottom: 2px solid transparent } .tabs button.on { color: #1278b0; border-bottom-color: #1cb0f6 }
.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px }
.kpi { display: grid; gap: 2px; padding: 10px 12px; border-radius: 12px; background: var(--surface) } .kpi b { font-size: 19px; font-weight: 900 } .kpi span { font-size: 12px; font-weight: 700; color: var(--hint) }
.lg { display: flex; flex-wrap: wrap; gap: 6px }
.cbx { min-width: 0 } .bars { display: block; overflow: visible }
.bars .base { stroke: var(--border); stroke-width: 1 }
.bars .col { cursor: pointer } .bars .col:not(.on) .seg { opacity: .55 } .bars .col:hover .seg { opacity: .85 }
.bars .pc { fill: #fff; font-size: 11px; font-weight: 800; text-anchor: middle; pointer-events: none }
.bars .tot { fill: var(--text); font-size: 13px; font-weight: 900; text-anchor: middle } .bars .ax { fill: var(--hint); font-size: 12px; font-weight: 700; text-anchor: middle } .bars .col.on .ax { fill: var(--text) }
.dn { display: flex; align-items: center; gap: 24px; flex-wrap: wrap }
.ring { width: 170px; height: 170px; flex: none } .ring .arc { cursor: pointer } .ring .n { font-size: 30px; font-weight: 900; text-anchor: middle; fill: var(--text) } .ring .s { font-size: 11px; font-weight: 700; text-anchor: middle; fill: var(--hint) }
.lgr { display: grid; grid-template-columns: auto auto auto; gap: 8px 14px; align-items: center; font-size: 14px } .lgr .tg { cursor: pointer; justify-self: start }
.tr { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.2fr) minmax(50px, .8fr) 44px 46px 96px; align-items: center; gap: 10px; padding: 9px 10px; margin: 0; border: 0; border-top: 1px solid var(--border); border-radius: 0; background: none; font: inherit; text-align: left; color: var(--text); cursor: pointer }
.tr:hover:not(:disabled), .tr.on { background: var(--surface) } .tr:disabled { cursor: default }
.tr .bar i { background: var(--hint) }
.nm { display: grid; font-size: 14px; font-weight: 800 } .nm small { font-size: 11px; font-weight: 700; color: var(--hint) }
.tgs { display: flex; gap: 4px; flex-wrap: wrap }
.pcv { text-align: right; font-size: 14px; font-weight: 900 } .dd { font-size: 12px; font-weight: 800; font-style: normal } .mm { font-size: 12px; font-weight: 600; color: var(--hint) }
.cv { padding: 10px; border-radius: 12px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--border) }
@media (max-width: 700px) {
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)) } .kpis { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) } .kpis .kpi:last-child { grid-column: 1 / -1 }
  h2 { font-size: 20px } .mon { margin-left: 0 }
  .tr { grid-template-columns: minmax(0, 1fr) auto auto; row-gap: 4px } .tr .tgs { grid-column: 1 / -1; order: 5 } .tr .bar { display: none } .tr .mm { grid-column: 1 / -1; order: 6 }
}
</style>

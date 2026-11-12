<script setup>
// «Как работает курс» (Профиль преподавателя → «Как работает курс»): живая схема на выдуманном курсе — отметили ответы ученика,
// промотали время — видно, куда ушли слова в Review, как тают проценты и когда слова попадают в «Повторение» и в чекпоинт.
// Всё считается настоящими функциями приложения (utils/review: FSRS, уровни, интервалы; настройки — algo), а не нарисовано руками.
// Правила «Повторения» и чекпоинта повторяют CourseViewer.vue (repeatOf, ckParts): CK_MAX = 8, RV_MAX = 10 — поменяете там, поправьте здесь.
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import BackButton from '../../components/BackButton.vue'
import { rate, recallAt, intervalOf, levelOf, LV_DAYS } from '../../utils/review'
import { algo } from '../../stores/algo'
const router = useRouter()
const CK_MAX = 8, RV_MAX = 10, DAYS_MAX = 14
const cfg = computed(() => ({ retention: algo.retention, maxDays: algo.maxDays }))
const pct = computed(() => Math.round(algo.retention * 100))

// пример курса: экраны и слова на них (graded — проверяемый экран: верно / ошибка)
const LESSONS = [
  { id: 'l1', title: 'Урок 1 · Hello', screens: [
    { id: 's1', kind: 'Новое слово', words: ['Hello'], graded: false },
    { id: 's2', kind: 'Выбери ответ', words: ['Hello'], graded: true },
    { id: 's3', kind: 'Пары', words: ['Bye', 'See you'], graded: true },
    { id: 's4', kind: 'Собери фразу', words: ['Nice to meet you'], graded: true }] },
  { id: 'l2', title: 'Урок 2 · How are you', screens: [
    { id: 's5', kind: 'Выбери ответ', words: ['How are you?'], graded: true },
    { id: 's6', kind: 'Заполни пропуск', words: ['fine'], graded: true }] },
]
const SCREENS = LESSONS.flatMap(l => l.screens.map(s => ({ ...s, lesson: l.title.split(' · ')[0] })))
const GRADED = SCREENS.filter(s => s.graded)
const ans = reactive({ s2: 'ok', s3: 'bad', s4: 'ok', s5: 'ok', s6: 'ok' })      // 'ok' | 'bad' | null
const setAns = (id, v) => { ans[id] = ans[id] === v ? null : v }
const days = ref(0)

// Память слов после урока. Ошибка → экран повторяется в конце урока, пока не верно: в Review уходят обе попытки
// («Снова», потом «Хорошо») в тот же день — поэтому память после ошибки почти не растёт, даже если ученик исправился.
const mem = computed(() => {
  const m = {}, seen = new Set()
  for (const s of SCREENS) for (const w of s.words) {
    seen.add(w)
    if (!s.graded || !ans[s.id]) continue
    m[w] = ans[s.id] === 'ok' ? rate(m[w], true, 0, cfg.value) : rate(rate(m[w], false, 0, cfg.value), true, 0, cfg.value)
  }
  return { m, all: [...seen] }
})
const LV = { weak: ['Слабое', 'weak'], medium: ['Среднее', 'medium'], strong: ['Сильное', 'strong'] }
const words = computed(() => mem.value.all.map((w, i) => {
  const m = mem.value.m[w]
  if (!m) return { w, isNew: true, i }
  const ivl = intervalOf(m.s, cfg.value), r = Math.round(recallAt(m.s, days.value) * 100)
  return { w, i, r, ivl, due: days.value >= ivl, left: ivl - days.value, lv: LV[levelOf(m.s)], s: m.s, err: SCREENS.some(s => s.words.includes(w) && ans[s.id] === 'bad') }
}))
const dueWords = computed(() => words.value.filter(x => !x.isNew && x.due))
// «Повторение» показывает слово экраном урока, где оно было (первый проверяемый экран с этим словом)
const repeatList = computed(() => dueWords.value.map(x => ({ w: x.w, s: GRADED.find(s => s.words.includes(x.w)) })).slice(0, RV_MAX))
const nextDue = computed(() => { const l = words.value.filter(x => !x.isNew && !x.due).map(x => x.left); return l.length ? Math.min(...l) : null })
// Чекпоинт: экраны с ошибкой (даже исправленной); ошибок нет — проверяемые экраны уроков поровну, до CK_MAX
const errScreens = computed(() => GRADED.filter(s => ans[s.id] === 'bad'))
const ckList = computed(() => errScreens.value.length ? errScreens.value : GRADED.filter(s => ans[s.id]).slice(0, CK_MAX))
const retry = (l) => l.screens.filter(s => s.graded && ans[s.id] === 'bad').map(s => s.kind)

const dayWord = (n) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b >= 2 && b <= 4 ? 'дня' : 'дней' }
const num = (d) => String(+d.toFixed(1)).replace('.', ',')
const fmtLeft = (d) => d < 1 ? `${Math.max(1, Math.round(d * 24))} ч` : `${num(d)} ${dayWord(Math.ceil(d))}`
const dayLabel = computed(() => days.value === 0 ? 'сразу после урока' : days.value < 1 ? `${Math.round(days.value * 24)} ч` : `${num(days.value)} ${dayWord(Math.ceil(days.value))}`)

// график: x — дни 0…DAYS_MAX, y — память 50…100 %
const GW = 400, GH = 150
const X = (d) => d / DAYS_MAX * GW, Y = (r) => GH - 10 - (Math.max(0.5, r) - 0.5) / 0.5 * (GH - 20)
const COLORS = ['#1899d6', '#7c3aed', '#58cc02', '#ff9600', '#e11d48', '#0d9488']
// Слова с одинаковой памятью дают одну и ту же кривую — рисуем её один раз, с подписью справа (сколько слов и после чего)
const curves = computed(() => {
  const by = new Map()
  for (const x of words.value) if (!x.isNew) { const k = x.s.toFixed(3) + (x.err ? 'e' : ''); if (!by.has(k)) by.set(k, { s: x.s, ivl: x.ivl, err: x.err, ws: [] }); by.get(k).ws.push(x.w) }
  return [...by.values()].map((g, n) => {
    let d = `M0 ${Y(1).toFixed(1)}`
    for (let k = 1; k <= DAYS_MAX * 4; k++) { const t = k / 4; d += ` L${X(t).toFixed(1)} ${Y(recallAt(g.s, t)).toFixed(1)}` }
    return { key: n, ws: g.ws, d, c: g.err ? '#e5484d' : '#1899d6', dueX: X(Math.min(g.ivl, DAYS_MAX)), endY: Y(recallAt(g.s, DAYS_MAX)),
      label: `${g.err ? 'ошибка → исправил' : 'верно'} · ${g.ws.length} ${g.ws.length === 1 ? 'слово' : g.ws.length < 5 ? 'слова' : 'слов'}` }
  })
})
const colorOf = (w) => curves.value.find(c => c.ws.includes(w))?.c ?? 'var(--border)'
</script>

<template>
  <div class="page how">
    <header class="hd">
      <BackButton to="Профиль" @click="router.push({ name: 'profile' })" />
      <div><h1>Как работает курс</h1><p>Куда уходят ответы ученика: Review, «Повторение» и чекпоинт — на примере. Отметьте ответы и промотайте время.</p></div>
    </header>

    <div class="two">
      <!-- пример курса -->
      <section class="box">
        <div class="ct"><span class="tag">Курс A1</span><b>Chapter 1: Приветствия</b></div>
        <div v-for="l in LESSONS" :key="l.id" class="ls">
          <b class="lt">{{ l.title }}</b>
          <div v-for="s in l.screens" :key="s.id" class="sc">
            <span class="sk"><b>{{ s.kind }}</b><small>{{ s.words.join(' · ') }} → в Review</small></span>
            <span v-if="s.graded" class="seg2" role="group" :aria-label="`Ответ на «${s.kind}»`">
              <button :class="{ ok: ans[s.id] === 'ok' }" :aria-pressed="ans[s.id] === 'ok'" @click="setAns(s.id, 'ok')">✓ верно</button>
              <button :class="{ bad: ans[s.id] === 'bad' }" :aria-pressed="ans[s.id] === 'bad'" @click="setAns(s.id, 'bad')">✕ ошибка</button>
            </span>
            <small v-else class="plain">без проверки — слово «новое»</small>
          </div>
          <p v-if="retry(l).length" class="rt">↻ В конце урока ещё раз: {{ retry(l).join(', ') }} — пока не будет верно. Обе попытки уходят в Review.</p>
        </div>
        <div class="blk rv" :class="{ on: repeatList.length }">
          <b>Повторение <small>после главы · в прогресс курса не идёт</small></b>
          <template v-if="repeatList.length">
            <span>Пора повторить — каждое экраном своего урока:</span>
            <ul><li v-for="o in repeatList" :key="o.w"><i :style="{ background: colorOf(o.w) }" />{{ o.w }} <small>· {{ o.s.kind }}, {{ o.s.lesson }}</small></li></ul>
          </template>
          <span v-else-if="!curves.length">Ученик ещё ничего не ответил — повторять нечего.</span>
          <span v-else>Повторять пока нечего — всё свежее<template v-if="nextDue !== null">, следующее через {{ fmtLeft(nextDue) }}</template>. Промотайте время →</span>
        </div>
        <div class="blk ck">
          <b>Чекпоинт главы</b>
          <span v-if="errScreens.length">Соберётся из экранов, где была ошибка (даже исправленная):</span>
          <span v-else-if="ckList.length">Ошибок нет — возьмёт проверяемые экраны уроков поровну (до {{ CK_MAX }}):</span>
          <span v-else>Проверять нечего — кнопка «Готово — дальше».</span>
          <ul v-if="ckList.length"><li v-for="s in ckList" :key="s.id">{{ s.kind }} <small>· {{ s.words.join(', ') }}, {{ s.lesson }}</small></li></ul>
        </div>
      </section>

      <!-- Review ученика -->
      <section class="box">
        <b class="h2">Review ученика</b>
        <div class="tl">
          <label for="how-days"><span>Прошло после урока</span><b>{{ dayLabel }}</b></label>
          <input id="how-days" v-model.number="days" type="range" min="0" :max="DAYS_MAX" step="0.25">
          <svg :viewBox="`0 0 ${GW} ${GH}`" role="img" aria-label="Память слов по дням: каждая линия — слово, вертикаль — сейчас, пунктир — порог повторения">
            <line x1="0" :x2="GW" :y1="Y(algo.retention)" :y2="Y(algo.retention)" class="thr" />
            <text :x="GW - 4" :y="Y(algo.retention) - 4" class="thr-t" text-anchor="end">≈{{ pct }} % — пора повторить</text>
            <path v-for="c in curves" :key="c.key" :d="c.d" :stroke="c.c" class="cv" />
            <circle v-for="c in curves" :key="c.key + 'd'" :cx="c.dueX" :cy="Y(algo.retention)" r="3.5" :fill="c.c" />
            <text v-for="c in curves" :key="c.key + 't'" :x="GW - 4" :y="c.endY - 5" class="cl" :fill="c.c" text-anchor="end">{{ c.label }}</text>
            <line :x1="X(days)" :x2="X(days)" y1="0" :y2="GH" class="now" />
            <text :x="Math.min(X(days) + 4, GW - 44)" y="11" class="now-t">сейчас</text>
            <text x="2" :y="GH - 1" class="ax">урок</text>
            <text :x="GW - 2" :y="GH - 1" class="ax" text-anchor="end">{{ DAYS_MAX }} дней</text>
          </svg>
        </div>
        <div class="tb">
          <div class="th"><span>Слово</span><span>Помнит</span><span>Уровень</span><span>Повтор</span></div>
          <div v-for="x in words" :key="x.w" class="tr">
            <span class="w"><i :style="{ background: colorOf(x.w) }" />{{ x.w }}</span>
            <template v-if="x.isNew"><span class="mu">—</span><span class="lv new">Новое</span><span class="mu">—</span></template>
            <template v-else>
              <span class="pc"><span class="bar"><i :style="{ width: x.r + '%' }" :class="x.r >= pct ? 'g' : x.r >= 75 ? 'o' : 'r'" /></span><b :class="x.r >= pct ? 'g' : x.r >= 75 ? 'o' : 'r'">{{ x.r }}%</b></span>
              <span class="lv" :class="x.lv[1]">{{ x.lv[0] }}</span>
              <span :class="x.due ? 'due' : ''">{{ x.due ? 'пора' : 'через ' + fmtLeft(x.left) }}</span>
            </template>
          </div>
        </div>
        <p class="fn">Считается тем же алгоритмом и с теми же настройками, что у ваших учеников (повторять при ≈{{ pct }} %). Срок повтора — в целых днях, как в Anki, поэтому «пора» может наступить при 91 % или 89 %.</p>
      </section>
    </div>

    <section class="rules">
      <h2>Правила</h2>
      <div class="grid">
        <div class="rc"><b>1 · Слово попадает в Review</b><ul>
          <li>После любого ответа на экран, где есть слово или фраза.</li>
          <li>«Выбери ответ», «Пары», «Собери», «Заполни пропуск» — с оценкой: верно = «Хорошо», ошибка = «Снова».</li>
          <li>«Новое слово», «Подсказка», «Повтори» — только знакомство: слово «новое», память ещё не считается.</li>
          <li>В «Парах» каждая пара — отдельное слово. Одинаковые слова из разных уроков — одна строка.</li></ul></div>
        <div class="rc"><b>2 · Как считается процент</b><ul>
          <li>«Помнит» — вероятность вспомнить слово сейчас (алгоритм FSRS, как в Anki).</li>
          <li>У слова есть стабильность — через сколько дней процент упадёт до 90 %. После первого верного ответа — около 2 дней.</li>
          <li>Сразу после ответа — 100 %, дальше тает по кривой. Верный повтор через паузу растит стабильность, ошибка — роняет.</li>
          <li>Ошибка и исправление в тот же день почти не растят память — поэтому такое слово придёт на повтор раньше.</li></ul></div>
        <div class="rc"><b>3 · Уровень слова</b>
          <div class="lvs"><span class="lv weak">Слабое<small>меньше {{ LV_DAYS.medium }} дней</small></span><span class="lv medium">Среднее<small>{{ LV_DAYS.medium }}–{{ LV_DAYS.strong - 1 }} дней</small></span><span class="lv strong">Сильное<small>от {{ LV_DAYS.strong }} дней</small></span></div>
          <small class="mu">Считается по стабильности, а не по проценту.</small></div>
        <div class="rc rv"><b>4 · Попадает в «Повторение»</b><ul>
          <li>Блок стоит после каждой главы и собирается сам.</li>
          <li>Берёт слова и упражнения главы, у которых подошёл срок повтора — когда память опускается примерно до {{ pct }} % (настройка в «Алгоритме повторений»). Срок считается в целых днях, как в Anki, поэтому в этот день может быть и 91 %, и 89 %.</li>
          <li>Слово показывается экраном того урока, где оно было. За раз — до {{ RV_MAX }} экранов, остальное — в следующий раз.</li>
          <li>Пока всё свежее — «Повторять пока нечего» и когда следующее.</li></ul></div>
        <div class="rc ck"><b>5 · Попадает в чекпоинт</b><ul>
          <li>Собирается, когда ученик его открывает. Ваши экраны в чекпоинте (если положили) идут первыми.</li>
          <li>Дальше — экраны уроков главы, где ученик хоть раз ошибся (даже если потом исправился).</li>
          <li>Ошибок не было — до {{ CK_MAX }} проверяемых экранов, поровну из каждого урока.</li>
          <li>Проверять нечего — «Готово — дальше». Пока засчитывается при любом результате; порог 80 % — в планах.</li></ul></div>
        <div class="rc cards"><b>Карточки («Слова»)</b>
          <p>Колоды считаются тем же алгоритмом FSRS, но живут отдельно от курса: в Review, «Повторение» и чекпоинт не попадают. У них своя настройка запоминания и шаги как в Anki (1 мин → 10 мин → дни).</p></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.how { max-width: 1040px; gap: 28px }
.hd { display: flex; align-items: flex-start; gap: 12px }
h1 { margin: 0; font-size: 26px; font-weight: 900 } .hd p { margin: 2px 0 0; font-size: 14px; font-weight: 600; color: var(--hint) }
h2 { margin: 0 0 12px; font-size: 22px; font-weight: 900 }
.two { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start }
.box { flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--border); border-radius: 18px; background: var(--card) }
.ct { display: flex; align-items: center; gap: 8px } .ct b { font-size: 17px; font-weight: 900 }
.tag { padding: 3px 8px; border-radius: 8px; background: #f3e8ff; color: #7c3aed; font-size: 12px; font-weight: 900 }
.ls { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 14px; background: var(--surface) }
.lt { font-size: 15px; font-weight: 900; color: #2e8b00 }
.sc { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 8px 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--border) }
.sk { flex: 1 1 150px; min-width: 0; display: grid; line-height: 1.25 } .sk b { font-size: 13px } .sk small, .plain { font-size: 12px; font-weight: 600; color: var(--hint) }
.seg2 { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden }
.seg2 button { border: 0; padding: 7px 10px; background: var(--card); color: var(--hint); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.seg2 button + button { border-left: 1px solid var(--border) }
.seg2 button.ok { background: #e9f9df; color: #2e7d00 } .seg2 button.bad { background: #ffe5e5; color: #c62828 }
.rt { margin: 0; padding: 6px 10px; border-radius: 10px; background: #fff0f0; color: #c62828; font-size: 12px; font-weight: 700 }
.blk { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 14px; font-size: 13px; font-weight: 600; line-height: 1.45 }
.blk > b { font-size: 15px; font-weight: 900 } .blk > b small { font-size: 12px; font-weight: 700; color: var(--hint) }
.blk ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px } .blk li { display: flex; align-items: center; gap: 6px; font-weight: 800 } .blk li small { font-weight: 600; color: var(--hint) }
.blk li i, .w i { flex: none; width: 8px; height: 8px; border-radius: 50% }
.blk.rv { background: #f6f2ff; border: 1px solid #e2d6ff; transition: box-shadow .2s } .blk.rv > b { color: #6d28d9 } .blk.rv.on { box-shadow: 0 0 0 2px #a78bfa }
.blk.ck { background: #fff6e5; border: 1px solid #ffe0a8 } .blk.ck > b { color: #b45309 }
.h2 { font-size: 17px; font-weight: 900 }
.tl { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 14px; background: var(--surface) }
.tl label { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; font-weight: 700 } .tl label b { font-size: 16px; font-weight: 900; color: var(--blue) }
.tl input { width: 100%; accent-color: #1899d6 }
.tl svg { width: 100%; height: auto; border-radius: 10px; background: var(--card) }
.thr { stroke: #ff9600; stroke-width: 1.2; stroke-dasharray: 5 4 } .thr-t { font-size: 10px; font-weight: 700; fill: #b45309 }
.cv { fill: none; stroke-width: 2 } .now { stroke: var(--text); stroke-width: 1.2 } .now-t { font-size: 10px; font-weight: 800; fill: var(--text) } .ax { font-size: 9px; font-weight: 700; fill: var(--hint) } .cl { font-size: 10px; font-weight: 800 }
.tb { display: grid; font-size: 14px }
.th, .tr { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 78px 84px; gap: 8px; align-items: center; padding: 8px 2px }
.th { padding-top: 0; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--hint) }
.tr { border-top: 1px solid var(--border) } .th > :last-child, .tr > :last-child { text-align: right }
.w { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.pc { display: flex; align-items: center; gap: 6px } .bar { flex: 1; height: 6px; border-radius: 3px; background: var(--border); overflow: hidden } .bar i { display: block; height: 100% }
.pc b { width: 36px; font-size: 13px } .g { color: #2e8b00 } .o { color: #c2590a } .r { color: #d92d20 }
.bar .g { background: #58cc02 } .bar .o { background: #ff9600 } .bar .r { background: #ff4b4b }
.due { color: #d92d20; font-weight: 800 } .mu { color: var(--hint) }
.lv { justify-self: start; display: inline-grid; padding: 2px 7px; border-radius: 7px; font-size: 12px; font-weight: 800 }
.lv.weak { background: #fff0f0; color: #c62828 } .lv.medium { background: #fff4e0; color: #b45309 } .lv.strong { background: #f2fbe9; color: #2e7d00 } .lv.new { background: var(--surface); color: var(--hint) }
.fn { margin: 0; padding-top: 6px; border-top: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--hint) }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px }
.rc { display: flex; flex-direction: column; gap: 8px; padding: 16px; border: 1px solid var(--border); border-radius: 16px; background: var(--card) }
.rc > b { font-size: 16px; font-weight: 900 } .rc ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; font-weight: 600; line-height: 1.45 } .rc p { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.45 }
.rc.rv > b { color: #6d28d9 } .rc.ck > b { color: #b45309 } .rc.cards { border-style: dashed }
.lvs { display: flex; gap: 6px } .lvs .lv { flex: 1; padding: 8px; font-size: 14px } .lvs small { font-size: 12px; font-weight: 600; color: var(--hint) }
/* тёмная тема: светлые плашки цветов — приглушённые */
:global(html[data-theme='dark']) .how .tag { background: #2a2340; color: #c4b5fd }
:global(html[data-theme='dark']) .how .seg2 button.ok, :global(html[data-theme='dark']) .how .lv.strong { background: #17301f; color: #7fd46a }
:global(html[data-theme='dark']) .how .seg2 button.bad, :global(html[data-theme='dark']) .how .rt, :global(html[data-theme='dark']) .how .lv.weak { background: #3a2326; color: #ff8a80 }
:global(html[data-theme='dark']) .how .lv.medium { background: #3a2c16; color: #ffb74d }
:global(html[data-theme='dark']) .how .blk.rv { background: #221d33; border-color: #3f3266 } :global(html[data-theme='dark']) .how .blk.ck { background: #2a2216; border-color: #5c4316 }
:global(html[data-theme='dark']) .how .lt { color: #7fd46a }
</style>

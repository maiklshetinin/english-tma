<script setup>
// «Алгоритм повторений» (#/review/algo): как приложение решает, когда повторить слово, — FSRS-6 (тот же, что в Anki).
// Одна библиотека ts-fsrs и для Review (utils/review.ts), и для колод (utils/fsrs.ts); прогресс у них раздельный.
// Преподаватель меняет желаемое запоминание и максимальный интервал — отдельно для Review и для колод; настройки общие
// для всех учеников и хранятся на сервере (GET/PUT /review/settings). Ученик видит ту же страницу без кнопок — описание и историю.
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BackButton from '../components/BackButton.vue'
import { algo, loadAlgo, saveAlgo } from '../stores/review'
import { ALGO_DEFAULT, ALGO_LIMITS, LV_DAYS, rate, intervalOf, recallAt } from '../utils/review'
import { answer, dueMs } from '../utils/fsrs'
import { useAuthStore } from '../stores/auth'
import { showToast } from '../composables/useToast'

const router = useRouter(), auth = useAuthStore()
const canEdit = computed(() => auth.role === 'teacher')
const cfg = reactive({ ...algo })
const busy = ref(false)
onMounted(async () => { await loadAlgo(true); Object.assign(cfg, algo) })
const KEYS = ['retention', 'maxDays', 'deckRetention', 'deckMaxDays']
const changed = computed(() => KEYS.some(k => cfg[k] !== algo[k]))
const isDefault = computed(() => KEYS.every(k => cfg[k] === ALGO_DEFAULT[k]))
const mode = ref('review')                                    // какие настройки крутим: Review или колоды
const RK = computed(() => (mode.value === 'review' ? 'retention' : 'deckRetention')), MK = computed(() => (mode.value === 'review' ? 'maxDays' : 'deckMaxDays'))
const maxSel = computed({ get: () => cfg[MK.value], set: (v) => { cfg[MK.value] = v } })
const MAXES = [[30, '1 месяц'], [90, '3 месяца'], [180, 'полгода'], [365, '1 год'], [1825, '5 лет'], [36500, 'без ограничения (100 лет)']]
const pct = computed({ get: () => Math.round(cfg[RK.value] * 100), set: (v) => { cfg[RK.value] = Math.round(v) / 100 } })

const DAY = 86_400_000
const fmt = (d) => d < 1 ? 'сегодня' : d < 31 ? `${d} дн` : d < 365 ? `${Math.round(d / 30.4)} мес` : `${(d / 365).toFixed(d < 3650 ? 1 : 0).replace('.0', '').replace('.', ',')} г`
// Слово, на которое ученик каждый раз отвечает верно в день повтора: через сколько дней повторы и сколько их за год
const chain = computed(() => {
  const c = { retention: cfg[RK.value], maxDays: cfg[MK.value] }, out = []
  if (mode.value === 'decks') {                                // колоды: шаги 1 мин → 10 мин («Хорошо»), потом повторения по дням
    const T0 = new Date(2026, 0, 5, 10).getTime()
    let st = answer(null, 2, T0, c); st = answer(st, 2, dueMs(st), c)
    while (out.length < 8) { out.push({ ivl: st.interval, at: (dueMs(st) - T0) / DAY, s: st.stab }); st = answer(st, 2, dueMs(st) + 10 * 3_600_000, c) }
    return out
  }
  let m = rate(undefined, true, 0, c), t = 0
  while (out.length < 8) {
    const ivl = intervalOf(m.s, c); out.push({ ivl, at: t / DAY + ivl, s: m.s })
    t = m.last + ivl * DAY; m = rate(m, true, t, c)
  }
  return out
})
const perYear = computed(() => 1 + chain.value.filter(x => x.at <= 365).length)
// Пила: вероятность вспомнить между повторами (график на 1–2 первых месяца… года)
const SPAN = computed(() => Math.min(365, Math.max(30, Math.ceil(chain.value[3].at))))
const W = 320, H = 120
const Y0 = 0.6                                                // ось вероятности на «пиле» — от 60 % (иначе зубцы почти не видны)
const yOf = (r) => H - (r - Y0) / (1 - Y0) * H
const saw = computed(() => {
  const pts = [], span = SPAN.value
  let start = 0
  for (const x of chain.value) {
    for (let k = 0; k <= 24; k++) {
      const d = start + x.ivl * k / 24; if (d > span) break
      pts.push([d / span * W, yOf(recallAt(x.s, d - start))])
    }
    start += x.ivl; if (start > span) break
    pts.push([start / span * W, 0])
  }
  return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L')
})
const marks = computed(() => chain.value.filter(x => x.at <= SPAN.value).map(x => ({ x: x.at / SPAN.value * W, t: fmt(Math.round(x.at)) })))
const lineY = computed(() => yOf(cfg[RK.value]))

async function save() {
  busy.value = true
  const ok = await saveAlgo({ ...cfg })
  busy.value = false
  showToast(ok ? 'Настройки сохранены — повторы пересчитаны' : 'Не удалось сохранить — сервер не ответил', null, ok ? undefined : 'bad')
}
const reset = () => Object.assign(cfg, ALGO_DEFAULT)

// Эббингауз (1885): сколько «сэкономлено» при повторном заучивании спустя время — по сути, сколько осталось в памяти
const EB = [[1 / 72, 58], [1 / 24, 44], [8.8 / 24, 36], [1, 34], [2, 28], [6, 25], [31, 21]]
const ebX = (d) => Math.log10(d * 24 * 3 + 1) / Math.log10(31 * 72 + 1) * W
const ebPts = EB.map(([d, v]) => ({ x: ebX(d), y: H - v / 100 * H, v, d }))
const ebPath = 'M' + ebPts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')
const ebLbl = (d) => d < 1 / 24 + 0.001 ? (d < 0.02 ? '20 мин' : '1 ч') : d < 1 ? '9 ч' : `${d} дн`
</script>

<template>
  <div class="page wide algo">
    <div class="hd"><BackButton to="Review" @click="router.push({ name: 'review' })" /><h1>Алгоритм повторений</h1></div>

    <section class="card">
      <h2>Настройки<small v-if="!canEdit"> · меняет преподаватель</small></h2>
      <div class="seg" role="tablist" aria-label="Чьи настройки"><button v-for="[k, t] in [['review', 'Review'], ['decks', 'Колоды']]" :key="k" role="tab" :aria-selected="mode === k" :class="{ on: mode === k }" @click="mode = k">{{ t }}</button></div>
      <div class="row">
        <label for="al-ret"><b>Желаемое запоминание</b><span>Повтор назначается, когда вероятность вспомнить слово падает до этого уровня. Выше — повторы чаще, память крепче; ниже — реже, но больше забываний.</span></label>
        <div class="val">{{ pct }} %</div>
      </div>
      <input id="al-ret" v-model.number="pct" type="range" :min="ALGO_LIMITS.retention[0] * 100" :max="ALGO_LIMITS.retention[1] * 100" step="1" :disabled="!canEdit" />
      <div class="lg"><span>70 % — реже</span><span>90 % — как в Anki</span><span>97 % — чаще</span></div>

      <div class="row">
        <label for="al-max"><b>Максимальный интервал</b><span>Дальше этого срока повтор не отодвигается, даже если слово выучено крепко.</span></label>
        <select id="al-max" v-model.number="maxSel" :disabled="!canEdit"><option v-for="[d, t] in MAXES" :key="d" :value="d">{{ t }}</option></select>
      </div>

      <div class="prev">
        <p><b>Пример:</b> {{ mode === 'decks' ? 'карточка: «Хорошо» на шагах 1 мин → 10 мин, потом «Хорошо» в каждый повтор —' : 'слово, на которое ученик каждый раз отвечает верно,' }} повторяется через
          <template v-for="(x, k) in chain.slice(0, 6)" :key="k"><span class="ch">{{ fmt(x.ivl) }}</span>{{ k < 5 ? ' → ' : '' }}</template>
          … — <b>{{ perYear }}</b> {{ perYear % 10 === 1 && perYear !== 11 ? 'повтор' : perYear % 10 >= 2 && perYear % 10 <= 4 && (perYear < 10 || perYear > 20) ? 'повтора' : 'повторов' }} за первый год.</p>
        <svg :viewBox="`-28 -6 ${W + 36} ${H + 26}`" class="gr" role="img" :aria-label="`Вероятность вспомнить между повторами, ${SPAN} дней`">
          <g class="ax"><line x1="0" :y1="H" :x2="W" :y2="H" /><line x1="0" y1="0" x2="0" :y2="H" />
            <text x="-6" y="4" text-anchor="end">100%</text><text x="-6" :y="H / 2 + 4" text-anchor="end">80%</text><text x="-6" :y="H + 4" text-anchor="end">60%</text>
            <text x="0" :y="H + 16">0</text></g>
          <line class="tg" x1="0" :y1="lineY" :x2="W" :y2="lineY" /><text class="tgt" :x="W - 2" :y="lineY - 4" text-anchor="end">{{ pct }} %</text>
          <g v-for="(m, k) in marks" :key="k"><line class="mk" :x1="m.x" y1="0" :x2="m.x" :y2="H" /><text v-if="m.x > 22 && (k === 0 || m.x - marks[k - 1].x > 34)" :x="m.x" :y="H + 16" text-anchor="middle">{{ m.t }}</text></g>
          <path class="saw" :d="saw" />
        </svg>
        <p class="nt">Синяя линия — вероятность вспомнить (шкала от 60 %): после ответа она 100 % и тает по кривой забывания; пунктир — повтор, когда она дошла до {{ pct }} %. С каждым верным ответом кривая становится положе, и повторы отодвигаются.</p>
      </div>

      <div v-if="canEdit" class="bar">
        <button class="ghost" :disabled="isDefault" @click="reset">Вернуть стандартные</button>
        <span class="sp" />
        <button class="go" :disabled="!changed || busy" @click="save">{{ busy ? 'Сохраняю…' : 'Сохранить' }}</button>
      </div>
      <p class="nt">Настройки общие для всех учеников и действуют сразу: в Review сроки повторов пересчитываются, в колодах новые сроки — со следующего ответа; история ответов не меняется. Прогресс Review и колод раздельный.</p>
    </section>

    <section class="card txt">
      <h2>Что это за алгоритм</h2>
      <p>Review считает память по <b>FSRS</b> (Free Spaced Repetition Scheduler — «свободный планировщик интервальных повторений»). Это тот же алгоритм, что включается в Anki, версия FSRS-6, библиотека <i>ts-fsrs</i> — одна и для Review, и для колод (у колод ещё шаги изучения 1 мин → 10 мин и четыре кнопки «Снова / Трудно / Хорошо / Легко», как в Anki).</p>
      <p>У каждого слова две величины:</p>
      <ul>
        <li><b>Стабильность S</b> — за сколько дней вероятность вспомнить слово упадёт до 90 %. Сразу после первого верного ответа это пара дней, после нескольких удачных повторов — недели и месяцы.</li>
        <li><b>Сложность D</b> (1–10) — насколько слово «не даётся». Ошибки её повышают, и стабильность у трудного слова растёт медленнее.</li>
      </ul>
      <p>Из них считается <b>вероятность вспомнить сейчас R</b>: сразу после ответа 100 %, дальше она тает по кривой забывания. Повтор назначается, когда R дойдёт до «желаемого запоминания».</p>
      <p><b>Как ответы в уроке превращаются в оценки.</b> Верный ответ — оценка «Хорошо», ошибка — «Снова» (как кнопки в Anki). «Новое слово», «Подсказка» и «Повтори» только знакомят со словом — память ещё не считается («новое»). В «Парах» каждая пара — отдельный ответ. Повтор в тот же день стабильность почти не растит — память укрепляют повторы через паузу, а ошибка снижает её сразу.</p>
      <p><b>Уровни в Review:</b> стабильность меньше {{ LV_DAYS.medium }} дней — слабое, {{ LV_DAYS.medium }}–{{ LV_DAYS.strong - 1 }} — среднее, от {{ LV_DAYS.strong }} дней — сильное (как «зрелые» карточки в Anki).</p>
      <p class="nt">Числа внутри формул (21 вес) — стандартные: их подобрали на истории повторов тысяч пользователей Anki. Anki умеет подстраивать их под одного человека по его истории; это можно добавить позже, когда у учеников накопятся сотни ответов.</p>
    </section>

    <section class="card txt">
      <h2>История</h2>
      <ol class="tl">
        <li><span><b>1885 — Эббингауз.</b> Герман Эббингауз заучивал бессмысленные слоги и замерял, сколько помнит спустя время. Так появилась <i>кривая забывания</i>: больше всего забывается в первые часы, потом медленнее.</span>
          <svg :viewBox="`-28 -6 ${W + 36} ${H + 26}`" class="gr eb" role="img" aria-label="Кривая забывания Эббингауза: 20 минут — 58 %, 1 час — 44 %, 9 часов — 36 %, 1 день — 34 %, 2 дня — 28 %, 6 дней — 25 %, 31 день — 21 %">
            <g class="ax"><line x1="0" :y1="H" :x2="W" :y2="H" /><line x1="0" y1="0" x2="0" :y2="H" />
              <text x="-6" y="4" text-anchor="end">100%</text><text x="-6" :y="H + 4" text-anchor="end">0</text></g>
            <path class="ebl" :d="ebPath" />
            <g v-for="p in ebPts" :key="p.d"><circle :cx="p.x" :cy="p.y" r="3.5" /><text :x="p.x" :y="p.y - 7" text-anchor="middle" class="ev">{{ p.v }}%</text><text :x="p.x" :y="H + 16" text-anchor="middle">{{ ebLbl(p.d) }}</text></g>
          </svg>
          <small>Его данные: через 20 мин — 58 %, 1 ч — 44 %, 9 ч — 36 %, 1 день — 34 %, 6 дней — 25 %, месяц — 21 % (это «экономия» при повторном заучивании — мера того, что осталось в памяти).</small></li>
        <li><b>1972 — Лейтнер.</b> Себастьян Лейтнер придумал коробку с карточками: знаешь — карточка переезжает в отделение, которое повторяют реже; ошибся — обратно в первое.</li>
        <li><b>1987 — SuperMemo SM-2.</b> Пётр Возняк вывел формулу: каждый интервал — прошлый × «лёгкость» (около 2,5). Её взяла Anki (2006) и использовала почти 20 лет. Минус: множитель один на всех, он не знает, какова вероятность вспомнить.</li>
        <li><b>2022 — FSRS.</b> Джарретт Е (Jarrett Ye, компания MaiMemo) построил модель памяти «сложность — стабильность — вероятность вспомнить» на миллионах реальных повторов и опубликовал её с открытым кодом.</li>
        <li><b>2023 — FSRS в Anki.</b> С версии 23.10 FSRS встроен в Anki как замена SM-2. По замерам сообщества, при том же запоминании он требует заметно меньше повторов.</li>
        <li><b>Сейчас.</b> FSRS-6 считает и Review, и колоды этого приложения — одна библиотека, прогресс раздельный. У колод — шаги изучения 1 мин → 10 мин, как в Anki.</li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.algo { display: grid; gap: 12px; justify-items: stretch }
.algo > * { width: 100%; max-width: 760px; margin: 0 auto; box-sizing: border-box; min-width: 0 }
.hd { display: flex; align-items: center; gap: 12px } .hd h1 { margin: 0 }
.card { background: var(--card); border-radius: 18px; padding: 18px; box-shadow: 0 1px 0 rgba(0, 0, 0, .04), 0 6px 22px rgba(0, 0, 0, .05); display: grid; gap: 12px }
h2 { margin: 0; font-size: 21px; font-weight: 900 } h2 small { font-size: 13px; font-weight: 700; color: var(--hint) }
.row { display: flex; align-items: center; gap: 14px; justify-content: space-between }
.row label { display: grid; gap: 3px; min-width: 0 } .row label b { font-size: 16px; font-weight: 900 } .row label span { font-size: 13px; font-weight: 600; color: var(--hint); line-height: 1.4 }
.val { flex: none; font-size: 30px; font-weight: 900; color: #1cb0f6 }
input[type=range] { width: 100%; accent-color: #1cb0f6; margin: -4px 0 0 }
.lg { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 800; color: var(--hint); margin-top: -8px }
select { width: auto; flex: none; font: inherit; font-weight: 700; padding: 7px 10px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--card) }
.prev { display: grid; gap: 8px; padding: 12px 14px; border-radius: 14px; background: var(--surface) }
.prev p { margin: 0; font-size: 14px; line-height: 1.55 }
.ch { display: inline-block; padding: 0 7px; border-radius: 8px; background: var(--card); box-shadow: inset 0 0 0 1.5px var(--border); font-weight: 800; color: #1278b0 }
.gr { width: 100%; height: auto; max-height: 190px; font-family: inherit }
.gr .ax line { stroke: #cfd4da; stroke-width: 1 } .gr text { font-size: 10px; font-weight: 700; fill: #8a8f98 }
.gr .tg { stroke: #ff9600; stroke-width: 1.2; stroke-dasharray: 4 3 } .gr .tgt { fill: #ff9600; font-weight: 900 }
.gr .mk { stroke: #b5bac1; stroke-width: 1; stroke-dasharray: 2 3 }
.gr .saw { fill: none; stroke: #1cb0f6; stroke-width: 2.4; stroke-linejoin: round }
.gr .ebl { fill: none; stroke: #9747ff; stroke-width: 2.2 } .gr.eb circle { fill: #9747ff } .gr .ev { fill: #9747ff; font-weight: 900 }
.seg { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface); justify-self: start }
.seg button { font: inherit; font-size: 14px; font-weight: 800; border: 0; border-radius: 10px; padding: 7px 16px; background: none; color: var(--hint); cursor: pointer } .seg button.on { background: var(--card); color: #1278b0; box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.nt { margin: 0; font-size: 12.5px; font-weight: 600; color: #777; line-height: 1.45 }
.bar { display: flex; gap: 8px; align-items: center } .sp { flex: 1 }
.go, .ghost { border: 0; border-radius: 12px; padding: 10px 16px; font: inherit; font-weight: 900; cursor: pointer }
.go { background: #1cb0f6; color: #fff } .ghost { background: var(--border); color: var(--hint) } .go:disabled, .ghost:disabled { opacity: .45; cursor: default }
.txt p, .txt li { font-size: 14px; line-height: 1.55; color: #333 } .txt p { margin: 0 } .txt ul { margin: 0; padding-left: 20px; display: grid; gap: 6px }
.tl { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px }
.tl li { padding-left: 16px; border-left: 3px solid var(--border); display: grid; gap: 6px } .tl small { font-size: 12.5px; color: #777; line-height: 1.45 }
@media (max-width: 520px) {
  .card { padding: 14px } .row { flex-wrap: wrap } .val { font-size: 26px } select { width: 100% } .lg span:nth-child(2) { display: none }
}
</style>

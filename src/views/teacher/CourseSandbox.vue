<script setup>
// «Песочница курса» (Профиль → «Песочница курса»): курс — пример из двух глав или ЛЮБОЙ ваш курс целиком (только чтение: курс,
// прогресс и Review учеников не меняются), — где преподаватель пробует ТЕСТОВЫЕ настройки (порог и строгость чекпоинта, «Повторить
// сейчас» по всему курсу, старые слова в чекпоинте, итог урока, напоминание в Telegram) и как в машине времени листает дни: уроки
// проходятся по одному в выбранном темпе, ответы ✓/✕ отмечаются быстро (всё верно / случайные ошибки), график и таблица показывают
// память слов. Ничего не сохраняется и никуда не отправляется. Память — те же функции FSRS и настройки, что у учеников (utils/review, algo).
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import BackButton from '../../components/BackButton.vue'
import { rate, recallAt, intervalOf, hitsOf, exName } from '../../utils/review'
import { INTERACTIVE, stepIssue } from '../../utils/lesson'
import { algo } from '../../stores/algo'
import { API, apiRequest, fb, isDemo } from '../../firebase'
const router = useRouter()
const cfgA = computed(() => ({ retention: algo.retention, maxDays: algo.maxDays }))
const pctR = computed(() => Math.round(algo.retention * 100))

// ── тестовые настройки ──
const cfg = reactive({ thr: false, pct: 80, strict: false, global: false, mix: false, sum: false, tg: false })
const SETTINGS = [
  { k: 'thr', t: 'Порог чекпоинта', x: 'Чекпоинт засчитывается, только если ученик набрал порог; иначе — ещё раз, другим набором. Порог выбираете вы.' },
  { k: 'strict', t: 'Строгий чекпоинт', x: 'Включено: пока чекпоинт не сдан на порог, следующие главы закрыты. Выключено (мягко): глава открыта, несданный чекпоинт висит «долгом». Работает вместе с порогом.' },
  { k: 'global', t: 'Повторить сейчас — по всему курсу', x: 'Одна кнопка наверху собирает всё, чему пора, со всех глав — вместо блока после каждой главы.' },
  { k: 'mix', t: 'Старое в чекпоинте', x: '2–3 самых слабых слова прошлых глав в чекпоинте. В порог не идут — только чтобы не забывалось.' },
  { k: 'sum', t: 'Итог урока: что вернётся', x: 'После урока ученик видит, какие слова вернутся завтра (ошибки), а какие — позже.' },
  { k: 'tg', t: 'Напоминание в Telegram', x: 'Раз в день в 19:00 бот пишет ученику, если словам подошёл срок, — с кнопкой «Повторить». Промотайте время и посмотрите.' },
]
const PCTS = [70, 80, 90]
const PACES = [[0, 'всё в 1 день'], [1, 'урок в день'], [2, 'через день']]

// ── курс: пример или ваш (главы → уроки → проверяемые экраны со словами) ──
const GRADED = ['choice', 'order', 'gap', 'pairs'], CK_MAX = 8
const DEMO = [
  { title: 'Chapter 1: Приветствия', own: [], lessons: [{ title: 'Урок 1 · Hello', screens: [
    { id: 's2', kind: 'Выбери ответ', words: ['Hello'] }, { id: 's3', kind: 'Пары', words: ['Bye', 'See you'] }, { id: 's4', kind: 'Собери фразу', words: ['Nice to meet you'] }] }] },
  { title: 'Chapter 2: Как дела', own: [], lessons: [{ title: 'Урок 2 · How are you', screens: [
    { id: 's5', kind: 'Выбери ответ', words: ['How are you?'] }, { id: 's6', kind: 'Заполни пропуск', words: ['fine'] }] }] },
]
const DEMO_ANS = { s2: 'ok', s3: 'bad', s4: 'ok', s5: 'ok', s6: 'bad' }
// курс с сервера → главы песочницы: юнит — глава; урок/слова/ДЗ/тест — урок; свой чекпоинт учителя — экраны чекпоинта главы
function fromCourse(d) {
  const out = []; let cur = null
  for (const x of d?.items ?? []) {
    if (x.type === 'unit') { cur = { title: x.title || 'Глава', own: [], lessons: [] }; out.push(cur); continue }
    if (!cur) { cur = { title: 'Без главы', own: [], lessons: [] }; out.push(cur) }
    if (!INTERACTIVE.includes(x.type)) continue
    const scr = (x.steps ?? []).filter(st => GRADED.includes(st.kind) && !stepIssue(st))
      .map(st => ({ id: `${x.id}:${st.id}`, kind: exName(st), words: [...new Set(hitsOf(st, { ok: true }).map(h => h.text))] })).filter(sc => sc.words.length)
    if (x.type === 'checkpoint') cur.own.push(...scr.map(sc => ({ ...sc, id: 'own' + sc.id })))
    else if (scr.length) cur.lessons.push({ title: x.title || 'Урок', screens: scr })
  }
  return out.filter(c => c.lessons.length || c.own.length)
}
const number = (chs) => { let k = 0; return chs.map((c, i) => ({ ...c, n: i + 1, lessons: c.lessons.map(l => ({ ...l, k: k++ })) })) }

const online = !isDemo && !!API && !!fb
const LOCAL = 'tma.courseRail.v1'
const list = ref([]), src = ref('demo'), real = ref(null), loading = ref(false), err = ref('')
onMounted(async () => {
  if (!online) { try { const d = JSON.parse(localStorage.getItem(LOCAL)); if (d?.items) list.value = [{ id: 'local', title: d.title || 'Мой курс' }] } catch { /* нет курса */ } return }
  try { const r = await apiRequest('/courses'); if (r.ok) list.value = (await r.json()).courses ?? [] } catch { /* сеть — останется пример */ }
})
const CH = computed(() => number(src.value === 'demo' ? DEMO : real.value ?? []))
const title = computed(() => src.value === 'demo' ? 'Пример курса' : list.value.find(c => c.id === src.value)?.title || 'Курс')

const ans = reactive({})                                     // ответы ученика на экраны уроков: id → 'ok' | 'bad'
const ck = reactive({})                                      // ответы в чекпоинтах: id → 'ok' | 'bad'
const pace = ref(1)                                          // уроков: все в один день / по одному в день / через день
const days = ref(1)                                          // «сейчас» — день от первого урока
const clear = (o) => { for (const k of Object.keys(o)) delete o[k] }
function setAll(v) { clear(ans); for (const c of CH.value) for (const l of c.lessons) for (const s of l.screens) if (v) ans[s.id] = v === 'rnd' ? (Math.random() < 0.2 ? 'bad' : 'ok') : v }
const lessonOk = (l) => { for (const s of l.screens) ans[s.id] = 'ok' }
async function pick(id) {
  err.value = ''; clear(ck); pace.value = 1
  if (id === 'demo') { src.value = 'demo'; real.value = null; clear(ans); Object.assign(ans, DEMO_ANS); days.value = 1; return }
  loading.value = true
  try {
    let d
    if (id === 'local') d = JSON.parse(localStorage.getItem(LOCAL))
    else { const r = await apiRequest(`/courses/${id}`); if (!r.ok) throw new Error(`(${r.status})`); d = await r.json() }
    real.value = fromCourse(d); src.value = id; setAll('ok'); days.value = 0
  } catch (e) { err.value = `Не удалось загрузить курс ${e.message}` } finally { loading.value = false }
}
Object.assign(ans, DEMO_ANS)
const setAns = (id, v) => { ans[id] = ans[id] === v ? null : v }
const setCk = (id, v) => { ck[id] = ck[id] === v ? null : v }

const dayOf = (l) => l.k * pace.value
const lastDay = computed(() => Math.max(0, ...CH.value.flatMap(c => c.lessons.map(dayOf))))
const DAYS_MAX = computed(() => lastDay.value + 14)
watch(DAYS_MAX, (m) => { if (days.value > m) days.value = m })
const step = (d) => { days.value = Math.min(DAYS_MAX.value, Math.max(0, +(days.value + d).toFixed(2))) }

// чекпоинт главы — как в курсе: экраны учителя + экраны с ошибками; ошибок нет — до CK_MAX отвеченных, равномерно;
// + (настройка) самые слабые слова прошлых глав
const even = (a, n) => a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.floor(i * a.length / n)])
function ckOf(c, words) {
  const scr = c.lessons.flatMap(l => l.screens).filter(s => ans[s.id]), errs = scr.filter(s => ans[s.id] === 'bad')
  const pool = [...c.own, ...errs], base = (pool.length ? pool : even(scr, CK_MAX)).map(s => ({ id: c.n + s.id, kind: s.kind, words: s.words.join(', '), old: false }))
  const olds = cfg.mix && c.n > 1 && words ? words.filter(x => x.ch < c.n).sort((a, b) => a.r - b.r).slice(0, 3).map(x => ({ id: c.n + 'o' + x.w, kind: 'Слово', words: `${x.w} (${x.r} %)`, old: true })) : []
  const items = [...base, ...olds], scored = items.filter(i => !i.old)
  const done = scored.every(i => ck[i.id]), score = scored.length ? Math.round(scored.filter(i => ck[i.id] === 'ok').length / scored.length * 100) : 100
  return { items, scored, done, score, passed: !scored.length || (done && (!cfg.thr || score >= cfg.pct)) }
}
// строгий режим: глава закрыта, пока не сдан чекпоинт хоть одной главы до неё
const lockedN = computed(() => {
  if (!(cfg.thr && cfg.strict)) return 0
  const k = CH.value.findIndex(c => !ckOf(c).passed)
  return k >= 0 && k < CH.value.length - 1 ? k + 2 : 0      // номер первой закрытой главы
})
const isLocked = (c) => !!lockedN.value && c.n >= lockedN.value

// память каждого слова — по всем встречам в пройденных к моменту t уроках (одно слово в разных уроках — одна память).
// Встреча: верно — «Хорошо»; ошибка — «Снова», потом «Хорошо» в конце урока (обе попытки в тот же день).
const DAY = 864e5
function wordsAt(t) {
  const by = new Map()
  for (const c of CH.value) {
    if (isLocked(c)) continue
    for (const l of c.lessons) {
      const d = dayOf(l); if (d > t) continue
      for (const s of l.screens) {
        const a = ans[s.id]; if (!a) continue
        for (const w of s.words) { const key = w.toLowerCase(); if (!by.has(key)) by.set(key, { w, ch: c.n, s, ev: [] }); by.get(key).ev.push({ d, ok: a === 'ok' }) }
      }
    }
  }
  return [...by.values()].map(x => {
    let m
    for (const e of x.ev) m = e.ok ? rate(m, true, e.d * DAY, cfgA.value) : rate(rate(m, false, e.d * DAY, cfgA.value), true, e.d * DAY, cfgA.value)
    const last = x.ev[x.ev.length - 1], ivl = intervalOf(m.s, cfgA.value), age = t - last.d
    return { w: x.w, ch: x.ch, s: x.s, st: m.s, err: !last.ok, ivl, last: last.d, n: x.ev.length, r: Math.round(recallAt(m.s, age) * 100), due: age >= ivl, left: ivl - age }
  })
}
const words = computed(() => wordsAt(days.value))
const due = computed(() => words.value.filter(x => x.due))
const taken = computed(() => CH.value.flatMap(c => isLocked(c) ? [] : c.lessons).filter(l => dayOf(l) <= days.value).length)
const lessonsN = computed(() => CH.value.reduce((a, c) => a + c.lessons.length, 0))
// глава, где ученик сейчас: последняя открытая, в которой уже начат урок
const curN = computed(() => { let n = 1; for (const c of CH.value) if (!isLocked(c) && c.lessons.some(l => dayOf(l) <= days.value)) n = c.n; return n })

// «Прилетело» в «Повторение» — как на «Как работает курс»: подсветка в блоке и плашка под ползунком (2,5 с)
const arrived = ref([])
let arrT = 0
watch(() => due.value.map(x => x.w), (now, was) => {
  const fresh = now.filter(w => !(was ?? []).includes(w))
  if (!fresh.length || !was) return
  arrived.value = fresh; clearTimeout(arrT); arrT = setTimeout(() => { arrived.value = [] }, 2500)
})
onUnmounted(() => clearTimeout(arrT))

// График памяти (как на «Как работает курс»): x — дни от первого урока, y — 50…100 %; кривая начинается в день последней встречи
// со словом; одинаковая память и день — одна кривая. Подписи — пока кривых немного (иначе — цвет: синяя верно, красная ошибка).
const GW = 400, GH = 150
const X = (d) => d / DAYS_MAX.value * GW, Y = (r) => GH - 10 - (Math.max(0.5, r) - 0.5) / 0.5 * (GH - 20)
const curves = computed(() => {
  const by = new Map(), M = DAYS_MAX.value
  for (const x of words.value) { const k = `${x.st.toFixed(3)}|${x.last}`; if (!by.has(k)) by.set(k, { s: x.st, ivl: x.ivl, last: x.last, err: x.err, ws: [] }); by.get(k).ws.push(x.w) }
  const out = [...by.values()].map((g, n) => {
    const at = (d) => recallAt(g.s, d - g.last)
    let d = `M${X(g.last).toFixed(1)} ${Y(1).toFixed(1)}`
    for (let t = g.last + 0.25; t <= M + 1e-9; t += 0.25) d += ` L${X(t).toFixed(1)} ${Y(at(t)).toFixed(1)}`
    const dueT = Math.min(g.last + g.ivl, M)
    return { key: n, ws: g.ws, d, c: g.err ? '#e5484d' : '#1899d6', dueX: X(dueT), dueY: Y(at(dueT)), endY: Y(at(M)),
      label: `${g.err ? 'ошибка' : 'верно'} · день ${num(g.last)} · ${g.ws.length} ${wordsN(g.ws.length)}` }
  })
  // подписи справа не налезают друг на друга: снизу вверх, не ближе 12 px
  let floor = GH - 14
  for (const c of [...out].sort((a, b) => b.endY - a.endY)) { c.labY = Math.min(c.endY - 5, floor); floor = c.labY - 12 }
  return out
})
const labels = computed(() => curves.value.length <= 6)

const dayWord = (n) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b >= 2 && b <= 4 ? 'дня' : 'дней' }
const num = (d) => String(+d.toFixed(1)).replace('.', ',')
const fmtLeft = (d) => d < 1 ? `${Math.max(1, Math.round(d * 24))} ч` : `${num(d)} ${dayWord(Math.ceil(d))}`
const wordsN = (n) => n === 1 ? 'слово' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 > 20) ? 'слова' : 'слов'

const chapters = computed(() => CH.value.map(c => {
  const locked = isLocked(c)
  const ckx = ckOf(c, words.value)
  const cdue = due.value.filter(x => x.ch === c.n)
  const lessons = c.lessons.map(l => {
    const by = {}
    for (const x of words.value) if (l.screens.includes(x.s)) (by[x.ivl] ??= []).push(x.w)
    const d = dayOf(l)
    return { ...l, day: d, later: d > days.value, summary: Object.keys(by).sort((a, b) => a - b).map(k => ({ tomorrow: +k === 1, when: +k === 1 ? 'Вернутся завтра' : `Через ${k} ${dayWord(+k)}`, words: by[k].join(', ') })) }
  })
  let res
  if (!ckx.items.length) res = ['', 'Проверять нечего —', 'кнопка «Готово — дальше».']
  else if (!ckx.done) res = ['', 'Пройдите чекпоинт:', `отметьте ответы (${ckx.scored.filter(i => ck[i.id]).length} из ${ckx.scored.length}).`]
  else if (!cfg.thr) res = ['ok', 'Засчитан', `— ${ckx.score} %. Без порога засчитывается при любом результате.`]
  else if (ckx.score >= cfg.pct) res = ['ok', 'Засчитан ✓', `${ckx.score} % при пороге ${cfg.pct} %. Глава пройдена.`]
  else res = ['bad', 'Не засчитан', `${ckx.score} % из нужных ${cfg.pct} %. Ещё раз — другим набором экранов.${cfg.strict ? ' Следующие главы закрыты, пока не сдаст.' : ''}`]
  const before = c.n < curN.value, first = c.lessons.length ? dayOf(c.lessons[0]) : 0
  return { ...c, lessons, locked, ck: ckx.items, res,
    note: locked ? (c.n === lockedN.value ? 'ученик хочет сюда' : 'закрыта') : before ? 'пройдена' : c.n === curN.value ? 'ученик сейчас здесь' : `впереди · с дня ${num(first)}`,
    debt: before && cfg.thr && !cfg.strict && !ckx.passed ? (ckx.done ? 'чекпоинт не сдан — пересдать' : 'чекпоинт ещё не пройден') : '',
    due: cdue, repeat: cdue.length ? `Пора повторить — каждое экраном своего урока:${before ? ' (ученик уже дальше — этот блок выше, его легко пропустить)' : ''}` : 'Повторять пока нечего — всё свежее. Промотайте время →' }
}))

// ── напоминание в Telegram (нарисованное): каждый вечер в 19:00 (урок днём — 19:00 через 0,25 дня) — если есть что повторить ──
const msgs = computed(() => {
  if (!cfg.tg) return []
  const out = []
  for (let k = 0; k + 0.25 <= days.value; k++) {
    const d = wordsAt(k + 0.25).filter(x => x.due); if (!d.length) continue
    out.push({ k, text: `Пора повторить ${d.length} ${wordsN(d.length)}: ${d.slice(0, 6).map(x => x.w).join(', ')}${d.length > 6 ? '…' : ''}. Это пара минут.`,
      btn: cfg.global ? 'Повторить сейчас' : 'Открыть «Повторение»', when: `день ${k}, 19:00` })
  }
  return out
})
const toast = ref(null)
let toastT = 0
watch(() => msgs.value.length ? msgs.value[msgs.value.length - 1].k : -1, (k, was) => {
  if (k < 0 || k === was) return
  toast.value = msgs.value[msgs.value.length - 1]; clearTimeout(toastT); toastT = setTimeout(() => { toast.value = null }, 6000)
})
onUnmounted(() => clearTimeout(toastT))
</script>

<template>
  <div class="page sbx">
    <header class="hd">
      <BackButton to="Профиль" @click="router.push({ name: 'profile' })" />
      <div class="hdt"><h1>Песочница курса</h1><p>Пример или ваш курс целиком: отметьте ответы ученика, листайте дни как в машине времени, сдайте чекпоинт, включите настройки — и смотрите, как меняется курс и что приходит ученику в Telegram.</p></div>
    </header>

    <div class="note" role="note">
      <span class="tst">ТЕСТ</span>
      <div><b>Это тестовые настройки — в курсе их пока нет</b>
        <span>Их можно добавить в курс, и тогда они будут управлять тем, как ученик проходит чекпоинты и повторяет слова. Здесь — песочница: включайте и выключайте их и смотрите на примере или на своём курсе, что изменится у ученика. Ваш курс только читается — он, прогресс и Review учеников не меняются; ничего не сохраняется и никуда не отправляется.</span>
        <small>Какие понравятся — сделаем по-настоящему, и они появятся в настройках курса.</small></div>
    </div>

    <section class="sets" aria-label="Тестовые настройки">
      <div v-for="s in SETTINGS" :key="s.k" class="set" :class="{ on: cfg[s.k] }">
        <button class="swb" role="switch" :aria-checked="cfg[s.k]" @click="cfg[s.k] = !cfg[s.k]"><i aria-hidden="true" /><b>{{ s.t }}</b></button>
        <span class="sx">{{ s.x }}</span>
        <div v-if="s.k === 'thr'" class="pcts" :class="{ dim: !cfg.thr }">
          <b>Порог выбираете вы:</b>
          <span class="seg2"><button v-for="p in PCTS" :key="p" :class="{ sel: cfg.pct === p }" :aria-pressed="cfg.pct === p" @click="cfg.pct = p">{{ p }} %</button></span>
          <small>{{ cfg.thr ? `сейчас нужно набрать ${cfg.pct} %` : 'заработает, когда включите порог' }}</small>
        </div>
      </div>
    </section>

    <div class="two">
      <section class="box" aria-label="Курс ученика">
        <div class="ct">
          <label class="pk"><span>Курс</span>
            <select v-model="src" :disabled="loading" aria-label="Курс для песочницы" @change="pick(src)">
              <option value="demo">Пример (2 главы)</option>
              <option v-for="c in list" :key="c.id" :value="c.id">{{ c.title || 'Без названия' }}</option>
            </select></label>
          <b>путь ученика</b>
        </div>
        <p v-if="loading" class="mu">Загружаю курс…</p>
        <p v-else-if="err" class="mu r">{{ err }}</p>
        <p v-else-if="!CH.length" class="mu">В этом курсе нет проверяемых экранов (выбор, пары, собери, пропуск) — показывать нечего.</p>
        <div class="qa">
          <span class="ql">Ответы ученика:</span>
          <button class="qb" @click="setAll('ok')">✓ все верно</button>
          <button class="qb" @click="setAll('rnd')">✕ случайные ошибки ~20 %</button>
          <button class="qb" @click="setAll(null)">очистить</button>
          <span class="ql">Темп:</span>
          <span class="seg2"><button v-for="[v, t] in PACES" :key="v" :class="{ sel: pace === v }" :aria-pressed="pace === v" @click="pace = v">{{ t }}</button></span>
        </div>
        <div v-if="cfg.global" class="gl">
          <div><b>Повторить сейчас</b><span class="cnt">{{ due.length }}</span></div>
          <span>{{ due.length ? 'Со всего курса — ученик видит это сразу, в какой бы главе ни был:' : 'Повторять пока нечего. Промотайте время →' }}</span>
          <TransitionGroup tag="ul" name="fly" class="rl"><li v-for="x in due" :key="x.w" :class="{ new: arrived.includes(x.w) }">{{ x.w }} <small>· гл. {{ x.ch }}</small></li></TransitionGroup>
        </div>

        <div v-for="c in chapters" :key="c.n" class="chp">
          <div class="cht"><b>{{ c.title }}</b><small>{{ c.note }}</small><span v-if="c.debt" class="debt">долг: {{ c.debt }}</span></div>
          <div v-if="c.locked" class="lock">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            <span><b>Глава закрыта.</b> Сначала сдайте чекпоинт главы {{ lockedN - 1 }} на {{ cfg.pct }} % — до этого уроки дальше не откроются (строгий режим).</span>
          </div>
          <template v-else>
            <div v-for="l in c.lessons" :key="l.k" class="ls" :class="{ later: l.later }">
              <div class="lh"><b class="lt">{{ l.title }}</b><span class="dy">{{ l.later ? `день ${num(l.day)} — ещё впереди` : `день ${num(l.day)}` }}</span><button class="qb xs" @click="lessonOk(l)">всё ✓</button></div>
              <div v-for="s in l.screens" :key="s.id" class="sc">
                <span class="sk"><b>{{ s.kind }}</b><small>{{ s.words.join(' · ') }}</small></span>
                <span class="seg2" role="group" :aria-label="`Ответ на «${s.kind}»`">
                  <button :class="{ ok: ans[s.id] === 'ok' }" :aria-pressed="ans[s.id] === 'ok'" @click="setAns(s.id, 'ok')">✓ верно</button>
                  <button :class="{ bad: ans[s.id] === 'bad' }" :aria-pressed="ans[s.id] === 'bad'" @click="setAns(s.id, 'bad')">✕ ошибка</button>
                </span>
              </div>
              <div v-if="cfg.sum && l.summary.length" class="sum">
                <b>Итог урока — что вернётся</b>
                <span v-for="g in l.summary" :key="g.when"><b :class="g.tomorrow ? 'r' : 'g'">{{ g.when }}:</b> {{ g.words }}</span>
              </div>
            </div>
            <div v-if="!cfg.global" class="blk rv" :class="{ on: c.due.length }"><b>Повторение главы</b><span>{{ c.repeat }}</span>
              <TransitionGroup tag="ul" name="fly" class="rl"><li v-for="x in c.due" :key="x.w" :class="{ new: arrived.includes(x.w) }"><i :class="x.err ? 'e' : ''" />{{ x.w }} <small>· {{ x.s.kind }}</small></li></TransitionGroup></div>
            <div class="blk ckb">
              <b>Чекпоинт · глава {{ c.n }}</b>
              <div v-for="i in c.ck" :key="i.id" class="ci">
                <span><b>{{ i.kind }}</b> <small>· {{ i.words }}</small> <em v-if="i.old">из прошлой главы · в порог не идёт</em></span>
                <span class="seg2 xs">
                  <button :class="{ ok: ck[i.id] === 'ok' }" aria-label="Верно" :aria-pressed="ck[i.id] === 'ok'" @click="setCk(i.id, 'ok')">✓</button>
                  <button :class="{ bad: ck[i.id] === 'bad' }" aria-label="Ошибка" :aria-pressed="ck[i.id] === 'bad'" @click="setCk(i.id, 'bad')">✕</button>
                </span>
              </div>
              <div class="res" :class="c.res[0]"><b>{{ c.res[1] }}</b> {{ c.res[2] }}</div>
            </div>
          </template>
        </div>
      </section>

      <section class="box" aria-label="Время и память слов">
        <b class="h2">Review ученика <small>· {{ title }}</small></b>
        <div class="tl">
          <label for="sbx-days"><span>Машина времени · уроков пройдено {{ taken }} из {{ lessonsN }}</span><b>день {{ num(days) }}</b></label>
          <div class="tm">
            <button class="qb xs" aria-label="На день назад" @click="step(-1)">‹ день</button>
            <input id="sbx-days" v-model.number="days" type="range" min="0" :max="DAYS_MAX" step="0.25">
            <button class="qb xs" aria-label="На день вперёд" @click="step(1)">день ›</button>
          </div>
          <svg :viewBox="`0 0 ${GW} ${GH}`" role="img" aria-label="Память слов по дням: каждая линия — группа слов, вертикаль — сейчас, пунктир — порог повторения">
            <line x1="0" :x2="GW" :y1="Y(algo.retention)" :y2="Y(algo.retention)" class="thr" />
            <text :x="GW - 4" :y="Y(algo.retention) - 4" class="thr-t" text-anchor="end">≈{{ pctR }} % — пора повторить</text>
            <path v-for="c in curves" :key="c.key" :d="c.d" :stroke="c.c" class="cv"><title>{{ c.label }}: {{ c.ws.join(', ') }}</title></path>
            <circle v-for="c in curves" :key="c.key + 'd'" :cx="c.dueX" :cy="c.dueY" r="4" :fill="c.c" stroke="#fff" stroke-width="1.5"><title>Срок повтора — здесь слова придут в «Повторение»</title></circle>
            <template v-if="labels"><text v-for="c in curves" :key="c.key + 't'" :x="GW - 4" :y="c.labY" class="cl" :fill="c.c" text-anchor="end">{{ c.label }}</text></template>
            <line :x1="X(days)" :x2="X(days)" y1="0" :y2="GH" class="now" />
            <text :x="Math.min(X(days) + 4, GW - 44)" y="11" class="now-t">сейчас</text>
            <text x="2" :y="GH - 1" class="ax">день 0</text>
            <text :x="GW - 2" :y="GH - 1" class="ax" text-anchor="end">день {{ DAYS_MAX }}</text>
          </svg>
          <Transition name="pop"><p v-if="arrived.length" class="arr" role="status">↗ В «Повторение»: <b>{{ arrived.join(', ') }}</b> — подошёл срок</p></Transition>
        </div>
        <p v-if="!labels" class="mu">Синие линии — слова, отвеченные верно, красные — с ошибкой; наведите на линию — какие слова.</p>
        <div class="tb">
          <div class="th"><span>Слово</span><span>Помнит</span><span>Повтор</span></div>
          <div v-for="x in words" :key="x.w" class="tr">
            <span class="w">{{ x.w }} <small>· гл. {{ x.ch }}{{ x.n > 1 ? ` · встреч ${x.n}` : '' }}</small></span>
            <b :class="x.r >= pctR ? 'g' : x.r >= 75 ? 'o' : 'r'">{{ x.r }}%</b>
            <span v-if="x.due" class="due">пора</span>
            <span v-else-if="x.r < pctR" class="wt" :title="`Память уже ${x.r} %, но повтор не назначается раньше следующего дня: в тот же день он почти не растит память`">через {{ fmtLeft(x.left) }}<em>ждёт завтра</em></span>
            <span v-else>через {{ fmtLeft(x.left) }}</span>
          </div>
        </div>
        <div v-if="cfg.tg" class="chat">
          <div class="chh"><span class="ava" aria-hidden="true">T</span><b>Tutor TMA · бот</b><small>Telegram ученика</small></div>
          <span v-if="!msgs.length" class="mu">Сообщений пока нет. Промотайте время — когда словам подойдёт срок, бот напишет в 19:00.</span>
          <div v-for="m in [...msgs].reverse()" :key="m.k" class="msg"><span>{{ m.text }}</span><span class="mb">{{ m.btn }}</span><small>{{ m.when }}</small></div>
        </div>
        <p class="fn">Ученик сейчас в главе {{ curN }}. Память считается теми же функциями и настройками, что у ваших учеников (повтор при ≈{{ pctR }} %); слово из нескольких уроков — одна память по всем встречам. Повторы в песочнице не проходятся — видно, когда и что придёт.</p>
      </section>
    </div>

    <Teleport to="body">
      <Transition name="tgp">
        <div v-if="toast" class="tgt" role="status">
          <span class="ava" aria-hidden="true">T</span>
          <div><div class="tgh"><b>Tutor TMA</b><small>Telegram · {{ toast.when }}</small></div>
            <span>{{ toast.text }}</span>
            <button class="mb" @click="toast = null">{{ toast.btn }}</button></div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.sbx { max-width: 1080px; gap: 18px }
.hd { display: flex; align-items: flex-start; gap: 12px } .hdt { flex: 1; min-width: 0 }
h1 { margin: 0; font-size: 26px; font-weight: 900 } .hd p { margin: 2px 0 0; font-size: 14px; font-weight: 600; color: var(--hint) }
.note { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 16px; background: #fff8e1; border: 1px solid #ffe08a; color: #3c3c3c }
.note > div { display: grid; gap: 4px; font-size: 14px; font-weight: 600; line-height: 1.5 } .note b { font-size: 15px; font-weight: 900 } .note small { font-size: 13px; color: #6b5a1f }
.tst { flex: none; padding: 3px 8px; border-radius: 8px; background: #ffc800; color: #4b3a00; font-size: 12px; font-weight: 900 }
.sets { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px }
.set { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--card) }
.set.on { border-color: #b9e1fb; background: #f2f9ff }
.swb { display: flex; align-items: center; gap: 10px; padding: 0; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer }
.swb i { position: relative; flex: none; width: 38px; height: 22px; border-radius: 99px; background: var(--hint-2); transition: background .15s }
.swb i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s }
.set.on .swb i { background: var(--blue) } .set.on .swb i::after { transform: translateX(16px) }
.swb b { font-size: 15px; font-weight: 900 } .sx { font-size: 12.5px; font-weight: 600; line-height: 1.4; color: var(--hint) }
.pcts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px } .pcts.dim { opacity: .55 } .pcts b { font-size: 12.5px; font-weight: 800 } .pcts small { font-size: 11.5px; font-weight: 600; color: var(--hint) }
.seg2 { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; background: var(--card) }
.seg2 button { border: 0; padding: 6px 10px; background: var(--card); color: var(--hint); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.seg2 button + button { border-left: 1px solid var(--border) } .seg2.xs button { padding: 3px 9px }
.seg2 button.sel { background: var(--blue-l); color: var(--blue) } .seg2 button.ok { background: #e9f9df; color: #2e7d00 } .seg2 button.bad { background: #ffe5e5; color: #c62828 }
.two { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start }
.box { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--border); border-radius: 18px; background: var(--card) }
.box:first-child { flex-basis: 520px }
.ct { display: flex; align-items: center; gap: 8px } .ct b { font-size: 17px; font-weight: 900 }
.pk { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; font-weight: 800; color: var(--hint) }
.pk select { max-width: 260px; min-width: 0; padding: 5px 8px; border: 1px solid #d8c7ff; border-radius: 9px; background: #f3e8ff; color: #6d28d9; font: inherit; font-size: 13px; font-weight: 900; cursor: pointer }
.ct { flex-wrap: wrap } .qa { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px } .ql { font-size: 12.5px; font-weight: 800; color: var(--hint) }
.qb { padding: 5px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--card); color: var(--text); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer } .qb.xs { padding: 3px 8px; font-size: 11.5px }
.lh { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px } .lh .lt { flex: 1 1 auto; min-width: 0 } .dy { font-size: 11.5px; font-weight: 800; color: var(--hint) }
.ls.later { opacity: .6 } .tm { display: flex; align-items: center; gap: 6px } .tm input { flex: 1; min-width: 0 }
.tb { max-height: 360px; overflow: auto } .h2 small { font-size: 13px; font-weight: 700; color: var(--hint) }
.gl { display: grid; gap: 6px; padding: 12px; border-radius: 14px; background: #6d28d9; color: #fff } .gl > div { display: flex; justify-content: space-between; align-items: center } .gl b { font-size: 16px; font-weight: 900 }
.gl > span { font-size: 13px; font-weight: 600; line-height: 1.45; color: #ede7ff } .cnt { padding: 3px 9px; border-radius: 99px; background: #fff; color: #6d28d9; font-size: 13px; font-weight: 900 }
.chp { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 16px; border: 1px solid var(--border); background: var(--surface) }
.cht { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px } .cht b { font-size: 16px; font-weight: 900 } .cht small { font-size: 12px; font-weight: 600; color: var(--hint) }
.debt { padding: 2px 8px; border-radius: 7px; background: #fff0d6; color: #b45309; font-size: 11.5px; font-weight: 900 }
.lock { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 14px; background: var(--card); border: 1px dashed var(--border); font-size: 13px; font-weight: 600; line-height: 1.45 }
.ls { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 14px; background: var(--card) } .lt { font-size: 14px; font-weight: 900; color: #2e8b00 }
.sc { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 7px 10px; border-radius: 10px; border: 1px solid var(--border) }
.sk { flex: 1 1 140px; min-width: 0; display: grid; line-height: 1.25 } .sk b { font-size: 13px } .sk small { font-size: 12px; font-weight: 600; color: var(--hint) }
.sum { display: grid; gap: 3px; padding: 8px 10px; border-radius: 10px; border: 1px dashed #b7a4f5; font-size: 12.5px; font-weight: 600; line-height: 1.4 } .sum > b { font-weight: 900; color: #6d28d9 }
.blk { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 14px; font-size: 12.5px; font-weight: 600; line-height: 1.45 } .blk > b { font-size: 14px; font-weight: 900 }
.blk.rv { background: #f6f2ff; border: 1px solid #e2d6ff } .blk.rv > b { color: #6d28d9 }
.blk.ckb { background: #fff6e5; border: 1px solid #ffe0a8 } .blk.ckb > b { color: #b45309 }
.ci { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 8px; border-radius: 9px; background: var(--card) } .ci > span:first-child { flex: 1 1 140px; min-width: 0 }
.ci small { color: var(--hint) } .ci em { font-style: normal; padding: 1px 6px; border-radius: 6px; background: #f3e8ff; color: #6d28d9; font-size: 11px; font-weight: 800 }
.res { padding: 7px 10px; border-radius: 9px; background: var(--surface); font-size: 13px } .res.ok { background: #e9f9df; color: #2e7d00 } .res.bad { background: #ffe5e5; color: #c62828 }
.h2 { font-size: 17px; font-weight: 900 }
.tl { display: grid; gap: 6px; padding: 10px 12px; border-radius: 14px; background: var(--surface) }
.tl label { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; font-weight: 700 } .tl label b { font-size: 16px; font-weight: 900; color: var(--blue) } .tl input { width: 100%; accent-color: #1899d6 }
.th, .tr { display: grid; grid-template-columns: minmax(0, 1fr) 54px 104px; gap: 6px; align-items: center; padding: 7px 2px }
.th { padding-top: 0; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--hint) } .tr { border-top: 1px solid var(--border); font-size: 13.5px }
.th > :last-child, .tr > :last-child { text-align: right; white-space: nowrap } .w { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .w small { color: var(--hint) }
.g { color: #2e8b00 } .o { color: #c2590a } .r { color: #d92d20 } .due { color: #d92d20; font-weight: 800 } .mu { font-size: 12.5px; font-weight: 600; color: var(--hint) }
.chat { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: #e7eef5 }
.chh { display: flex; align-items: center; gap: 8px } .chh b { font-size: 14px; font-weight: 900; color: #3c3c3c } .chh small { font-size: 11.5px; font-weight: 600; color: #6b6b6b }
.ava { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #58cc02; color: #fff; font-size: 13px; font-weight: 900 }
.msg { align-self: flex-start; max-width: 92%; display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 4px 14px 14px 14px; background: #fff; color: #3c3c3c; font-size: 13px; font-weight: 600; line-height: 1.4 }
.msg small { align-self: flex-end; font-size: 10.5px; color: #8a8a8a }
.mb { align-self: flex-start; padding: 5px 10px; border: 0; border-radius: 8px; background: #eaf5fd; color: #0b6fa3; font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer }
.tl svg { width: 100%; height: auto; border-radius: 10px; background: var(--card) }
.thr { stroke: #ff9600; stroke-width: 1.2; stroke-dasharray: 5 4 } .thr-t { font-size: 10px; font-weight: 700; fill: #b45309 }
.cv { fill: none; stroke-width: 2 } .now { stroke: var(--text); stroke-width: 1.2 } .now-t { font-size: 10px; font-weight: 800; fill: var(--text) } .ax { font-size: 9px; font-weight: 700; fill: var(--hint) } .cl { font-size: 9.5px; font-weight: 800; paint-order: stroke; stroke: var(--card); stroke-width: 3px; stroke-linejoin: round }      /* подложка под подписью — кривая не перечёркивает текст */
.wt { display: grid; justify-items: end; line-height: 1.2 } .wt em { font-style: normal; font-size: 11px; font-weight: 800; color: #c2590a; cursor: help }
.rl { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px } .rl li { display: flex; align-items: center; gap: 6px; margin: 0 -4px; padding: 1px 4px; border-radius: 6px; font-weight: 800 } .rl small { font-weight: 600; opacity: .75 }
.rl i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #1899d6 } .rl i.e { background: #e5484d }
.gl .rl li.new { animation: glow-d 2.4s ease-out } .blk.rv .rl li.new { animation: glow 2.4s ease-out }
@keyframes glow { 0%, 40% { background: #e4d8ff } 100% { background: transparent } } @keyframes glow-d { 0%, 40% { background: rgba(255, 255, 255, .3) } 100% { background: transparent } }
.blk.rv { transition: box-shadow .2s } .blk.rv.on { box-shadow: 0 0 0 2px #a78bfa }
.arr { margin: 0; padding: 6px 10px; border-radius: 10px; background: #f1ebff; color: #6d28d9; font-size: 13px; font-weight: 700 } .arr b { font-weight: 900 }
.fly-enter-active { transition: transform .45s cubic-bezier(.2, .9, .3, 1.3), opacity .3s } .fly-enter-from { transform: translateX(60px); opacity: 0 } .fly-leave-active { transition: opacity .2s } .fly-leave-to { opacity: 0 }
.pop-enter-active, .pop-leave-active { transition: opacity .25s, transform .25s } .pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-4px) }
@media (prefers-reduced-motion: reduce) { .fly-enter-active, .pop-enter-active, .pop-leave-active { transition: none } .rl li.new { animation: none } }
:global(html[data-theme='dark']) .sbx .arr { background: #2a2340; color: #c4b5fd }
.fn { margin: 0; padding-top: 6px; border-top: 1px solid var(--border); font-size: 12px; font-weight: 600; line-height: 1.45; color: var(--hint) }
.tgt { position: fixed; top: 16px; right: 16px; z-index: 400; width: 330px; max-width: calc(100vw - 32px); box-sizing: border-box; display: flex; gap: 10px; padding: 12px 14px; border-radius: 16px; background: #fff; color: #3c3c3c; border: 1px solid #e5e5e5; box-shadow: 0 10px 30px rgba(0, 0, 0, .22); font-family: inherit }
.tgt .ava { width: 36px; height: 36px; font-size: 15px } .tgt > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; font-size: 13px; font-weight: 600; line-height: 1.4 }
.tgh { display: flex; justify-content: space-between; gap: 8px } .tgh b { font-size: 13.5px; font-weight: 900 } .tgh small { font-size: 11px; color: #8a8a8a }
.tgp-enter-active, .tgp-leave-active { transition: transform .3s cubic-bezier(.2, .9, .3, 1.2), opacity .25s } .tgp-enter-from, .tgp-leave-to { transform: translateY(-16px); opacity: 0 }
@media (prefers-reduced-motion: reduce) { .tgp-enter-active, .tgp-leave-active, .swb i, .swb i::after { transition: none } }
:global(html[data-theme='dark']) .sbx .note { background: #2e2814; border-color: #5c4b16; color: var(--text) } :global(html[data-theme='dark']) .sbx .note small { color: #d9c27a }
:global(html[data-theme='dark']) .sbx .set.on { background: #16283a; border-color: #24496b }
:global(html[data-theme='dark']) .sbx .blk.rv { background: #221d33; border-color: #3f3266 } :global(html[data-theme='dark']) .sbx .blk.ckb { background: #2a2216; border-color: #5c4316 }
:global(html[data-theme='dark']) .sbx .seg2 button.ok, :global(html[data-theme='dark']) .sbx .res.ok { background: #17301f; color: #7fd46a }
:global(html[data-theme='dark']) .sbx .seg2 button.bad, :global(html[data-theme='dark']) .sbx .res.bad { background: #3a2326; color: #ff8a80 }
:global(html[data-theme='dark']) .sbx .chat { background: #1e2a36 } :global(html[data-theme='dark']) .sbx .chh b { color: var(--text) }
</style>

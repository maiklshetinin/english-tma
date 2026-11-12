<script setup>
// «Песочница курса» (Профиль → «Песочница курса»): пример курса из двух глав, где преподаватель пробует ТЕСТОВЫЕ настройки —
// порог и строгость чекпоинта, «Повторить сейчас» по всему курсу, старые слова в чекпоинте, итог урока, напоминание в Telegram —
// и видит, как меняется курс ученика. Только показ: в курсе этих настроек пока нет, ничего не сохраняется и никуда не отправляется
// (уведомление «из Telegram» нарисовано). Память слов — те же функции FSRS и настройки, что у учеников (utils/review, algo).
import { ref, reactive, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import BackButton from '../../components/BackButton.vue'
import { rate, recallAt, intervalOf } from '../../utils/review'
import { algo } from '../../stores/algo'
const router = useRouter()
const cfgA = computed(() => ({ retention: algo.retention, maxDays: algo.maxDays }))
const pctR = computed(() => Math.round(algo.retention * 100))

// ── тестовые настройки ──
const cfg = reactive({ thr: false, pct: 80, strict: false, global: false, mix: false, sum: false, tg: false })
const SETTINGS = [
  { k: 'thr', t: 'Порог чекпоинта', x: 'Чекпоинт засчитывается, только если ученик набрал порог; иначе — ещё раз, другим набором. Порог выбираете вы.' },
  { k: 'strict', t: 'Строгий чекпоинт', x: 'Включено: пока чекпоинт не сдан на порог, следующая глава закрыта. Выключено (мягко): глава открыта, несданный чекпоинт висит «долгом». Работает вместе с порогом.' },
  { k: 'global', t: 'Повторить сейчас — по всему курсу', x: 'Одна кнопка наверху собирает всё, чему пора, со всех глав — вместо блока после каждой главы.' },
  { k: 'mix', t: 'Старое в чекпоинте', x: '2–3 самых слабых слова прошлых глав в чекпоинте. В порог не идут — только чтобы не забывалось.' },
  { k: 'sum', t: 'Итог урока: что вернётся', x: 'После урока ученик видит, какие слова вернутся завтра (ошибки), а какие — позже.' },
  { k: 'tg', t: 'Напоминание в Telegram', x: 'Раз в день в 19:00 бот пишет ученику, если словам подошёл срок, — с кнопкой «Повторить». Промотайте время и посмотрите.' },
]
const PCTS = [70, 80, 90]

// ── пример курса: глава 1 пройдена вчера, ученик сейчас в главе 2 ──
const CH = [
  { n: 1, title: 'Chapter 1: Приветствия', lessons: [{ title: 'Урок 1 · Hello', screens: [
    { id: 's2', kind: 'Выбери ответ', words: ['Hello'] }, { id: 's3', kind: 'Пары', words: ['Bye', 'See you'] }, { id: 's4', kind: 'Собери фразу', words: ['Nice to meet you'] }] }] },
  { n: 2, title: 'Chapter 2: Как дела', lessons: [{ title: 'Урок 2 · How are you', screens: [
    { id: 's5', kind: 'Выбери ответ', words: ['How are you?'] }, { id: 's6', kind: 'Заполни пропуск', words: ['fine'] }] }] },
]
const AGE = { 1: 1, 2: 0 }                                  // слова главы 1 «старше» на день
const screensOf = (c) => c.lessons.flatMap(l => l.screens)
const ans = reactive({ s2: 'ok', s3: 'bad', s4: 'ok', s5: 'ok', s6: 'bad' })
const ck = reactive({})                                      // ответы в чекпоинтах: id → 'ok' | 'bad'
const setAns = (id, v) => { ans[id] = ans[id] === v ? null : v }
const setCk = (id, v) => { ck[id] = ck[id] === v ? null : v }
const days = ref(0)

// память слова после урока: верно — «Хорошо»; ошибка — «Снова», потом «Хорошо» в конце урока (обе попытки в тот же день)
const memOf = (a) => a === 'ok' ? rate(undefined, true, 0, cfgA.value) : rate(rate(undefined, false, 0, cfgA.value), true, 0, cfgA.value)

// чекпоинт главы: экраны с ошибками, иначе все отвеченные; + (настройка) самые слабые слова прошлых глав
function ckOf(c, words) {
  const scr = screensOf(c).filter(s => ans[s.id]), errs = scr.filter(s => ans[s.id] === 'bad')
  const base = (errs.length ? errs : scr).map(s => ({ id: c.n + s.id, kind: s.kind, words: s.words.join(', '), old: false }))
  const olds = cfg.mix && c.n > 1 && words ? words.filter(x => x.ch < c.n).sort((a, b) => a.r - b.r).slice(0, 3).map(x => ({ id: c.n + 'o' + x.w, kind: 'Слово', words: `${x.w} (${x.r} %)`, old: true })) : []
  const items = [...base, ...olds], scored = items.filter(i => !i.old)
  const done = scored.every(i => ck[i.id]), score = scored.length ? Math.round(scored.filter(i => ck[i.id] === 'ok').length / scored.length * 100) : 100
  return { items, scored, done, score, passed: !scored.length || (done && (!cfg.thr || score >= cfg.pct)) }
}
const ch1 = computed(() => ckOf(CH[0]))
const ch2Locked = computed(() => cfg.thr && cfg.strict && !ch1.value.passed)

function wordsAt(d) {
  const out = []
  for (const c of CH) {
    if (c.n === 2 && ch2Locked.value) continue
    for (const s of screensOf(c)) for (const w of s.words) {
      const a = ans[s.id]; if (!a) continue
      const m = memOf(a), ivl = intervalOf(m.s, cfgA.value), t = d + AGE[c.n]
      out.push({ w, ch: c.n, s, ivl, r: Math.round(recallAt(m.s, t) * 100), due: t >= ivl, left: ivl - t })
    }
  }
  return out
}
const words = computed(() => wordsAt(days.value))
const due = computed(() => words.value.filter(x => x.due))

const dayWord = (n) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b >= 2 && b <= 4 ? 'дня' : 'дней' }
const num = (d) => String(+d.toFixed(1)).replace('.', ',')
const fmtLeft = (d) => d < 1 ? `${Math.max(1, Math.round(d * 24))} ч` : `${num(d)} ${dayWord(Math.ceil(d))}`
const dayLabel = computed(() => days.value === 0 ? 'сразу' : days.value < 1 ? `${Math.round(days.value * 24)} ч` : `${num(days.value)} ${dayWord(Math.ceil(days.value))}`)
const wordsN = (n) => n === 1 ? 'слово' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 > 20) ? 'слова' : 'слов'

const chapters = computed(() => CH.map(c => {
  const locked = c.n === 2 && ch2Locked.value
  const ckx = ckOf(c, words.value)
  const cdue = due.value.filter(x => x.ch === c.n)
  const lessons = c.lessons.map(l => {
    const by = {}
    for (const x of words.value) if (l.screens.includes(x.s)) (by[x.ivl] ??= []).push(x.w)
    return { ...l, summary: Object.keys(by).sort((a, b) => a - b).map(k => ({ tomorrow: +k === 1, when: +k === 1 ? 'Вернутся завтра' : `Через ${k} ${dayWord(+k)}`, words: by[k].join(', ') })) }
  })
  let res
  if (!ckx.items.length) res = ['', 'Проверять нечего —', 'кнопка «Готово — дальше».']
  else if (!ckx.done) res = ['', 'Пройдите чекпоинт:', `отметьте ответы (${ckx.scored.filter(i => ck[i.id]).length} из ${ckx.scored.length}).`]
  else if (!cfg.thr) res = ['ok', 'Засчитан', `— ${ckx.score} %. Без порога засчитывается при любом результате.`]
  else if (ckx.score >= cfg.pct) res = ['ok', 'Засчитан ✓', `${ckx.score} % при пороге ${cfg.pct} %. Глава пройдена.`]
  else res = ['bad', 'Не засчитан', `${ckx.score} % из нужных ${cfg.pct} %. Ещё раз — другим набором экранов.${cfg.strict ? ' Следующая глава закрыта, пока не сдаст.' : ''}`]
  return { ...c, lessons, locked, ck: ckx.items, res,
    note: c.n === 1 ? 'пройдена вчера' : locked ? 'ученик хочет сюда' : 'ученик сейчас здесь',
    debt: c.n === 1 && cfg.thr && !cfg.strict && !ckx.passed ? (ckx.done ? 'чекпоинт не сдан — пересдать' : 'чекпоинт ещё не пройден') : '',
    repeat: cdue.length ? `Пора повторить: ${cdue.map(x => x.w).join(', ')}.${c.n === 1 ? ' Ученик уже в главе 2 — этот блок выше, его легко пропустить.' : ''}` : 'Повторять пока нечего — всё свежее. Промотайте время →' }
}))

// ── напоминание в Telegram (нарисованное): каждый вечер в 19:00 — урок был днём, первое 19:00 через 0,25 дня — если есть что повторить ──
const msgs = computed(() => {
  if (!cfg.tg) return []
  const out = []
  for (let k = 0; k + 0.25 <= days.value; k++) {
    const d = wordsAt(k + 0.25).filter(x => x.due); if (!d.length) continue
    out.push({ k, text: `Пора повторить ${d.length} ${wordsN(d.length)}: ${d.map(x => x.w).join(', ')}. Это пара минут.`,
      btn: cfg.global ? 'Повторить сейчас' : 'Открыть «Повторение»', when: `${k === 0 ? 'сегодня' : 'день ' + (k + 1)}, 19:00` })
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
      <div class="hdt"><h1>Песочница курса</h1><p>Пример курса, где можно всё попробовать: отметить ответы ученика, промотать время, сдать чекпоинт и включить настройки — и посмотреть, как меняется курс и что приходит ученику в Telegram.</p></div>
    </header>

    <div class="note" role="note">
      <span class="tst">ТЕСТ</span>
      <div><b>Это тестовые настройки — в курсе их пока нет</b>
        <span>Их можно добавить в курс, и тогда они будут управлять тем, как ученик проходит чекпоинты и повторяет слова. Здесь — песочница: включайте и выключайте их и смотрите на примере курса ниже, что изменится у ученика. Ничего не сохраняется и никуда не отправляется, на настоящих учеников не влияет.</span>
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
        <div class="ct"><span class="tag">Курс A1</span><b>путь ученика</b></div>
        <div v-if="cfg.global" class="gl">
          <div><b>Повторить сейчас</b><span class="cnt">{{ due.length }}</span></div>
          <span>{{ due.length ? `Со всего курса: ${due.map(x => `${x.w} (гл. ${x.ch})`).join(', ')}. Ученик видит это сразу, в какой бы главе ни был.` : 'Повторять пока нечего. Промотайте время →' }}</span>
        </div>

        <div v-for="c in chapters" :key="c.n" class="chp">
          <div class="cht"><b>{{ c.title }}</b><small>{{ c.note }}</small><span v-if="c.debt" class="debt">долг: {{ c.debt }}</span></div>
          <div v-if="c.locked" class="lock">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            <span><b>Глава закрыта.</b> Сначала сдайте чекпоинт главы 1 на {{ cfg.pct }} % — до этого уроки главы 2 не откроются (строгий режим).</span>
          </div>
          <template v-else>
            <div v-for="l in c.lessons" :key="l.title" class="ls">
              <b class="lt">{{ l.title }}</b>
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
            <div v-if="!cfg.global" class="blk rv"><b>Повторение главы</b><span>{{ c.repeat }}</span></div>
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
        <b class="h2">Review ученика</b>
        <div class="tl">
          <label for="sbx-days"><span>Прошло после уроков</span><b>{{ dayLabel }}</b></label>
          <input id="sbx-days" v-model.number="days" type="range" min="0" max="14" step="0.5">
        </div>
        <div class="tb">
          <div class="th"><span>Слово</span><span>Помнит</span><span>Повтор</span></div>
          <div v-for="x in words" :key="x.w" class="tr">
            <span class="w">{{ x.w }} <small>· гл. {{ x.ch }}</small></span>
            <b :class="x.r >= pctR ? 'g' : x.r >= 75 ? 'o' : 'r'">{{ x.r }}%</b>
            <span :class="{ due: x.due }">{{ x.due ? 'пора' : 'через ' + fmtLeft(x.left) }}</span>
          </div>
        </div>
        <div v-if="cfg.tg" class="chat">
          <div class="chh"><span class="ava" aria-hidden="true">T</span><b>Tutor TMA · бот</b><small>Telegram ученика</small></div>
          <span v-if="!msgs.length" class="mu">Сообщений пока нет. Промотайте время — когда словам подойдёт срок, бот напишет в 19:00.</span>
          <div v-for="m in [...msgs].reverse()" :key="m.k" class="msg"><span>{{ m.text }}</span><span class="mb">{{ m.btn }}</span><small>{{ m.when }}</small></div>
        </div>
        <p class="fn">Ученик сейчас в главе 2. Память считается теми же функциями и настройками, что у ваших учеников (повтор при ≈{{ pctR }} %).</p>
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
.tag { padding: 3px 8px; border-radius: 8px; background: #f3e8ff; color: #7c3aed; font-size: 12px; font-weight: 900 }
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
.th, .tr { display: grid; grid-template-columns: minmax(0, 1fr) 54px 96px; gap: 6px; align-items: center; padding: 7px 2px }
.th { padding-top: 0; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--hint) } .tr { border-top: 1px solid var(--border); font-size: 13.5px }
.th > :last-child, .tr > :last-child { text-align: right; white-space: nowrap } .w { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .w small { color: var(--hint) }
.g { color: #2e8b00 } .o { color: #c2590a } .r { color: #d92d20 } .due { color: #d92d20; font-weight: 800 } .mu { font-size: 12.5px; font-weight: 600; color: var(--hint) }
.chat { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: #e7eef5 }
.chh { display: flex; align-items: center; gap: 8px } .chh b { font-size: 14px; font-weight: 900; color: #3c3c3c } .chh small { font-size: 11.5px; font-weight: 600; color: #6b6b6b }
.ava { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #58cc02; color: #fff; font-size: 13px; font-weight: 900 }
.msg { align-self: flex-start; max-width: 92%; display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 4px 14px 14px 14px; background: #fff; color: #3c3c3c; font-size: 13px; font-weight: 600; line-height: 1.4 }
.msg small { align-self: flex-end; font-size: 10.5px; color: #8a8a8a }
.mb { align-self: flex-start; padding: 5px 10px; border: 0; border-radius: 8px; background: #eaf5fd; color: #0b6fa3; font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer }
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

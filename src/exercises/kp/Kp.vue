<script setup>
// «Ответ по смыслу» (Karta Polaka, 19.11.2026): вопрос; ученик надиктовывает ответ в поле (своим приложением или микрофоном
// клавиатуры), «Проверить» — чат (ChatGPT / Gemini / Claude) в браузере преподавателя сверяет с эталоном по смыслу через мост (utils/ai.js, server/ai.ts).
// Всё стоит на своих местах с самого начала, после проверки только заполняется — экран не прыгает: спидометр справа от вопроса,
// поле ответа (после проверки — тот же текст на том же месте), «Не прозвучало», «Эталон». Отзыв Gemini — в подвале.
// Вид — как домашка курса: кремовый фон и шрифты Alice / PT Serif. В правке: вопрос и эталон правятся на своих местах,
// а «JSON» в подвале — весь экран текстом: вопрос, эталон, порог и промпт для Gemini (свой у этого экрана; для теста промпта).
// 19.11.2026: точь-в-точь как в ответах домашки — номер и вопрос на подложке #f2dab5, красная гранёная звезда у обязательных (step.star),
// в эталоне оранжевые термины, жирный, курсив, абзацы с отступом и пункты (разметка: ==термин==, **жирный**, _курсив_, «• »).
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExText from '../parts/ExText.vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit } from '../ctx'
import { PASS, SYSTEM, bridgeStatus, aiIcon, kpPlain } from '../../utils/ai'
import TtsDialog from '../../components/TtsDialog.vue'
import { modelName } from '../../utils/tts'
import { startTranscribe, sttModel, firstKey, startTalk, liveModels, liveName } from '../../utils/live'
import { checkModels, checkName, limitOf, getPick, setPick } from '../../utils/kpcheck'
import { kpLive } from '../../utils/kplive'
import { kpCfg, fill } from './defaults'
import { ai } from '../../utils/gemini'
import J from './kp.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const pass = computed(() => props.step.pass ?? PASS)

// шрифты домашки — один раз на страницу
onMounted(() => {
  if (typeof document === 'undefined' || document.getElementById('kp-fonts')) return
  const l = document.createElement('link'); l.id = 'kp-fonts'; l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=Alice&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap'
  document.head.appendChild(l)
})

// эталон с оформлением домашки: строки — абзацы, «• » — пункт списка; внутри ==оранжевый==, **жирный**, _курсив_
const TOK = /(\*\*.+?\*\*|==.+?==|(?<![\p{L}\d])_.+?_(?![\p{L}\d]))/u
const runs = (l) => l.split(new RegExp(TOK.source, 'gu')).filter(Boolean).map((x) => (
  x.startsWith('**') && x.endsWith('**') && x.length > 4 ? { t: x.slice(2, -2), k: 'b' }
    : x.startsWith('==') && x.endsWith('==') && x.length > 4 ? { t: x.slice(2, -2), k: 'acc' }
      : x.length > 2 && x.startsWith('_') && x.endsWith('_') ? { t: x.slice(1, -1), k: 'i' } : { t: x, k: '' }))
const refBlocks = computed(() => {
  const out = []
  for (const l of String(props.step.ideal ?? '').split('\n').map((x) => x.trim()).filter(Boolean)) {
    if (l.startsWith('• ')) { const last = out.at(-1), li = runs(l.slice(2)); if (last?.ul) last.ul.push(li); else out.push({ ul: [li] }) }
    else out.push({ p: runs(l) })
  }
  return out
})
// с кем мост: до проверки — в подвале «● Мост подключён · [значок] Gemini» / «Мост не в сети» (обновляется, пока экран открыт),
// после — в заголовке «Не прозвучало»: «проверил [значок] Gemini»
const bridge = ref(null)
const loadBridge = () => bridgeStatus().then((b) => { bridge.value = b }).catch(() => { bridge.value = null })
let brTm = 0
onMounted(() => { if (p.edit) return; loadBridge(); if (props.part === 'fb') brTm = setInterval(() => { if (!p.st.done) loadBridge() }, 15_000) })
onBeforeUnmount(() => clearInterval(brTm))
const by = computed(() => (checked.value && r.value.site ? { t: 'проверил', api: !!r.value.api, live: !!r.value.live, model: r.value.model, sites: [r.value.site], sec: Number.isFinite(r.value.ms) ? (r.value.ms / 1000).toFixed(1).replace('.', ',') + ' с' : '' } : null))
// 19.11.2026: программы диктовки вставляют текст в поле напрямую, без события input — v-model этого не видит («0 слов»,
// «Проверить» серая), а Vue при любой перерисовке ещё и стирал такой текст (value он переписывает всегда). Поэтому поле без привязки:
// своё значение пишем в него, только когда текст поменялся в данных (watch), и сверяем поле само: при нажатиях, вставке, уходе фокуса и раз в полсекунды
const ta = ref(null)
const sync = () => { const v = ta.value?.value; if (typeof v === 'string' && v !== p.st.text && !p.st.done) p.st.text = v }
let syncTm = 0
onMounted(() => { if (ta.value) ta.value.value = p.st.text || ''; syncTm = setInterval(sync, 500) })
watch(() => p.st.text, (v) => { if (ta.value && ta.value.value !== (v || '')) ta.value.value = v || '' })
watch(ta, (el) => { if (el) el.value = p.st.text || '' }, { flush: 'sync' })          // поле появилось заново (повтор вопроса) — со своим текстом
onBeforeUnmount(() => clearInterval(syncTm))
// «Надиктовать с Gemini» (20.11.2026): речь сырым звуком — в Gemini 3.5 Transcribe Live (польский закреплён), готовые куски
// дописываются в поле ответа, черновик — серым под полем. Поле остаётся обычным: можно вставить текст или надиктовать по-старому
const dic = ref('idle'), dicDraft = ref(''), dicErr = ref(''), dicLvl = ref(0), dicT0 = ref(0), dicNow = ref(0)
let dicS = null, dicTm = 0
const canDic = computed(() => ai.keys.length > 0)
const dicSec = computed(() => { const s = Math.max(0, Math.round((dicNow.value - dicT0.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
const addText = (t) => { const x = String(t || '').trim(); if (x && !p.st.done) p.st.text = ((p.st.text || '').trim() + ' ' + x).trim() }
async function dictate() {
  if (dic.value === 'live' || dic.value === 'connecting') { dicS?.stop(); return }
  const key = firstKey(); dicErr.value = ''
  if (!key) { dicErr.value = 'Нужен ключ Gemini в профиле'; return }
  dic.value = 'connecting'
  dicS = startTranscribe({ key, model: await sttModel(key), lang: 'pl-PL', on: {
    state: (s, info) => {
      if (s === 'live' && info) return
      dic.value = s === 'error' ? 'idle' : s === 'ended' ? 'idle' : s
      if (s === 'error') dicErr.value = info
      if (s === 'live') { dicT0.value = dicNow.value = Date.now(); clearInterval(dicTm); dicTm = setInterval(() => { dicNow.value = Date.now() }, 500) }
      if (s === 'ended' || s === 'error') { clearInterval(dicTm); dicLvl.value = 0; dicS = null; addText(dicDraft.value); dicDraft.value = '' }
    },
    interim: (t) => { dicDraft.value = t },
    final: (t) => { addText(t); dicDraft.value = '' },
    level: (v) => { dicLvl.value = dicLvl.value * 0.6 + v * 0.4 },
  } })
}
watch(() => p.st.busy || p.st.done, (v) => { if (v) dicS?.stop() })
// облачко над полем: пока идёт диктовка (пусто — «…»), или ошибка; длинный черновик — его хвост
const dicCloud = computed(() => !p.edit && (dic.value === 'live' || !!dicDraft.value || !!dicErr.value))
const dicShow = computed(() => { const t = dicDraft.value || (dic.value === 'live' ? '…' : dicErr.value); return t.length > 120 ? '…' + t.slice(-120) : t })

// «· Gemini API» (20.11.2026, тест): проверка напрямую (utils/kpcheck.js), мост — запасной. Модель: в правке — у экрана,
// в подвале перед проверкой — своя в этом браузере (главнее)
const api = computed(() => props.step.engine === 'api' || props.step.engine === 'live')          // 'live' — убранный «Live (голос)»: идёт как Gemini API
const cModels = ref([]), cPick = ref(getPick())
onMounted(async () => { if (api.value && ai.keys[0]) cModels.value = await checkModels(ai.keys[0].key) })
function pickCheck(v) { cPick.value = v; setPick(v) }
const cAuto = computed(() => props.step.model || cModels.value[0] || '')
function setModelF(v) { if (v) props.step.model = v; else delete props.step.model; ed.changed() }

function moreLive() { if (lv.value?.more) return lv.value.more(); lv.value?.stop?.(); discuss() }

// «Обсудить голосом» (Live API): после оценки Gemini голосом разбирает ответ — что упущено, уточняющий вопрос, «попробуйте ещё раз»
const tk = ref('idle'), tkErr = ref(''), tkLines = ref([]), tkLvl = ref(0), tkModel = ref('')
let tkS = null
const tkBox = ref(null)
function tkPush(role, chunk) {
  const l = tkLines.value.at(-1)
  if (l && l.role === role && !l.closed) l.t += chunk; else tkLines.value.push({ role, t: chunk.replace(/^\s+/, ''), closed: false })
  setTimeout(() => { if (tkBox.value) tkBox.value.scrollTop = tkBox.value.scrollHeight }, 0)
}
async function discuss() {
  if (tk.value === 'live' || tk.value === 'connecting') { tkS?.stop(); return }
  const key = firstKey(); tkErr.value = ''
  if (!key) { tkErr.value = 'Нужен ключ Gemini в профиле'; return }
  tk.value = 'connecting'; tkLines.value = []
  let m = ''; try { m = localStorage.getItem('tma.live.pick') || '' } catch { /* */ }
  if (!m) m = (await liveModels(key))[0] || ''
  if (!m) { tk.value = 'idle'; tkErr.value = 'Google не дал ключу Live-модели'; return }
  let v = 'Kore'; try { v = localStorage.getItem('tma.live.voice') || 'Kore' } catch { /* */ }
  tkModel.value = m
  const c = kpCfg(props.step)          // промпт разбора и первая реплика — из JSON экрана (exercises/kp/defaults.ts)
  const sys = fill(c.discussPrompt, { question: props.step.text ?? '', reference: kpPlain(props.step.ideal ?? ''), answer: p.st.text ?? '', score: r.value?.score ?? '?', missed: (r.value?.missed ?? []).join('; ') || 'nic ważnego' })
  tkS = startTalk({ key, model: m, voice: v, lang: 'pl-PL', system: sys, opener: c.discussOpener, on: {
    state: (s2, info) => { if (s2 === 'live' && info) return; tk.value = s2 === 'error' || s2 === 'ended' ? 'idle' : s2; if (s2 === 'error') tkErr.value = info; if (s2 === 'ended' || s2 === 'error') { tkS = null; tkLvl.value = 0 } },
    text: tkPush, turn: () => { const l = tkLines.value.at(-1); if (l) l.closed = true }, level: (x) => { tkLvl.value = tkLvl.value * 0.6 + x * 0.4 },
  } })
}
onBeforeUnmount(() => tkS?.stop())

onBeforeUnmount(() => { dicS?.stop(); clearInterval(dicTm) })
// вид экрана (19.11.2026): pdf — как домашка (подписи на подложке, без рамок; по умолчанию), lines — тонкие линии между частями,
// cards — мягкие подложки; step.plain — эталон без выделений (просто абзацы). Меняются кнопками в подвале правки
const LOOKS = { pdf: 'PDF', lines: 'линии', cards: 'подложки' }
const look = computed(() => (LOOKS[props.step.look] ? props.step.look : 'pdf'))
function nextLook() { const k = Object.keys(LOOKS), n = k[(k.indexOf(look.value) + 1) % k.length]; if (n === 'pdf') delete props.step.look; else props.step.look = n; ed.changed() }
function toggleMarks() { if (props.step.plain) delete props.step.plain; else props.step.plain = true; ed.changed() }
const mk = (x) => (props.step.plain ? '' : x.k)          // выделения выключены — всё обычным текстом
// озвучка вопроса (20.11.2026): в правке — значок Gemini у вопроса → окно (голос, ход, послушать) → «Сохранить в экран» = step.audio;
// у ученика — кнопка-динамик у вопроса, если звук есть
const tts = ref(false), gIcon = aiIcon('Gemini')
const ttsText = computed(() => kpPlain(props.step.text ?? '').trim())
function ttsSave(f, by) { ed.put(props.step, 'audio', f); props.step.audioBy = by; ed.changed() }
function ttsClear() { delete props.step.audioBy; ed.clear(props.step, 'audio') }
const byT = computed(() => { const [m, v] = String(props.step.audioBy || '').split('|'); return m && v ? `${modelName(m)} · ${v}` : '' })
let qAu = null
const playing = ref(false)
function playQ() {
  if (!props.step.audio) return
  if (qAu && !qAu.paused) { qAu.pause(); return }
  qAu?.pause(); qAu = new Audio(p.src(props.step.audio, 'audio'))
  qAu.onplay = () => { playing.value = true }; qAu.onpause = qAu.onended = () => { playing.value = false }
  qAu.play().catch(() => {})
}
onBeforeUnmount(() => qAu?.pause())
function toggleAuto() { if (props.step.autoplay) delete props.step.autoplay; else props.step.autoplay = true; ed.changed() }
function toggleStar() { if (props.step.star) delete props.step.star; else props.step.star = true; ed.changed() }

const r = computed(() => p.st.ai)                          // { score, missed, feedback } или { error }
// проверка голосовой моделью: её разговор — kpLive[id экрана] (оценка пришла функцией, дальше — голос / расшифровка / «Подробнее»)
const lv = computed(() => (r.value?.live ? kpLive[props.step.id] : null))
const lvBox = ref(null)
watch(() => lv.value?.lines.map((l) => l.t).join('').length, () => setTimeout(() => { if (lvBox.value) lvBox.value.scrollTop = lvBox.value.scrollHeight }, 0))
onBeforeUnmount(() => { if (props.part === 'body') kpLive[props.step.id]?.stop?.() })
const nameOf = (m) => (m === 'live' ? 'Live · голосом' : checkName(m))
const checked = computed(() => !!r.value && r.value.score != null)
const words = computed(() => { const n = (p.st.text || '').trim() ? p.st.text.trim().split(/\s+/).length : 0; return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'слово' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'слова' : 'слов'}` })
const tier = computed(() => { const s = r.value?.score ?? 0; return s >= pass.value ? 'ok' : s >= 40 ? 'mid' : 'low' })
const tierT = { ok: 'Зачтено', mid: 'Почти', low: 'Не зачтено' }
// спидометр: дуга 0–100 % и стрелка (как WeekLoad), отметка порога зачёта
const pt = (f, rad) => { const a = Math.PI * (1 - f); return [(60 + rad * Math.cos(a)).toFixed(1), (60 - rad * Math.sin(a)).toFixed(1)] }
const arc = computed(() => { const [x, y] = pt((r.value?.score ?? 0) / 100, 48); return `M12 60 A48 48 0 0 1 ${x} ${y}` })
const needle = computed(() => pt(checked.value ? r.value.score / 100 : 0, 38))
const tick = computed(() => [pt(pass.value / 100, 40), pt(pass.value / 100, 56)])

// «JSON» в правке: экран текстом (как присылает Gemini) — поправили и «Применить»; промпт и порог по умолчанию не сохраняются
const jsOpen = ref(false), js = ref(''), jsErr = ref('')
const asJson = () => JSON.stringify({ id: props.step.n ?? null, star: !!props.step.star, autoplay: !!props.step.autoplay, look: look.value, marks: !props.step.plain, question: props.step.text ?? '', reference: props.step.ideal ?? '', pass_threshold: pass.value, system_prompt: props.step.prompt || SYSTEM }, null, 2)
function jsToggle() { jsOpen.value = !jsOpen.value; if (jsOpen.value) { js.value = asJson(); jsErr.value = '' } }
function jsApply() {
  let o; try { o = JSON.parse(js.value) } catch { jsErr.value = 'Не JSON — проверьте кавычки и запятые'; return }
  if (!o || typeof o !== 'object') { jsErr.value = 'Нужен объект { … }'; return }
  const n = Number(o.pass_threshold), s = props.step
  if (o.pass_threshold != null && !(Number.isInteger(n) && n > 0 && n <= 100)) { jsErr.value = 'pass_threshold — целое от 1 до 100'; return }
  if (typeof o.question === 'string') s.text = o.question
  if (typeof o.reference === 'string') s.ideal = o.reference
  if (o.star === true) s.star = true; else if (o.star === false) delete s.star
  if (o.autoplay === true) s.autoplay = true; else if (o.autoplay === false) delete s.autoplay
  if (o.look === 'lines' || o.look === 'cards') s.look = o.look; else if (o.look === 'pdf') delete s.look
  if (o.marks === false) s.plain = true; else if (o.marks === true) delete s.plain
  if (Number.isInteger(o.id) && o.id > 0 && o.id < 100) s.n = o.id; else if (o.id === null) delete s.n
  if (o.pass_threshold == null || n === PASS) delete s.pass; else s.pass = n
  const pr = typeof o.system_prompt === 'string' ? o.system_prompt.trim() : ''
  if (!pr || pr === SYSTEM) delete s.prompt; else s.prompt = pr
  ed.changed(); jsErr.value = ''; jsOpen.value = false
}
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <div class="kq">
      <div class="kqw">
        <button v-if="p.edit" type="button" class="kst" :class="{ off: !step.star }" :title="step.star ? 'Обязательный вопрос (звезда) — убрать' : 'Сделать обязательным (красная звезда)'" @click="toggleStar"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 50L38.4 3.4L35.4 37.8Z" class="s1" /><path d="M50 50L38.4 3.4L57.1 32.4Z" class="s2" /><path d="M50 50L90.7 24.6L57.1 32.4Z" class="s1" /><path d="M50 50L90.7 24.6L69.0 51.3Z" class="s2" /><path d="M50 50L86.8 80.9L69.0 51.3Z" class="s1" /><path d="M50 50L86.8 80.9L54.6 68.4Z" class="s2" /><path d="M50 50L32.0 94.5L54.6 68.4Z" class="s1" /><path d="M50 50L32.0 94.5L33.9 60.1Z" class="s2" /><path d="M50 50L2.1 46.7L33.9 60.1Z" class="s1" /><path d="M50 50L2.1 46.7L35.4 37.8Z" class="s2" /></svg></button>
        <span v-else-if="step.star" class="kst" title="Ответ нужно знать обязательно"><svg viewBox="0 0 100 100" role="img" aria-label="Обязательный вопрос"><path d="M50 50L38.4 3.4L35.4 37.8Z" class="s1" /><path d="M50 50L38.4 3.4L57.1 32.4Z" class="s2" /><path d="M50 50L90.7 24.6L57.1 32.4Z" class="s1" /><path d="M50 50L90.7 24.6L69.0 51.3Z" class="s2" /><path d="M50 50L86.8 80.9L69.0 51.3Z" class="s1" /><path d="M50 50L86.8 80.9L54.6 68.4Z" class="s2" /><path d="M50 50L32.0 94.5L54.6 68.4Z" class="s1" /><path d="M50 50L32.0 94.5L33.9 60.1Z" class="s2" /><path d="M50 50L2.1 46.7L33.9 60.1Z" class="s1" /><path d="M50 50L2.1 46.7L35.4 37.8Z" class="s2" /></svg></span>
        <ExText v-model="step.text" tag="div" class="kqt" ph="Kiedy i jak obchodzimy Mikołajki?" multi>
          <template #before><span v-if="step.n" class="kqn">{{ step.n }}.</span></template>
          <span v-if="step.n" class="kqn">{{ step.n }}.</span>{{ step.text || '…' }}
        </ExText>
        <button v-if="step.audio" type="button" class="kau" :class="{ on: playing }" :title="playing ? 'Пауза' : 'Послушать вопрос' + (byT ? ' — озвучено ' + byT : '')" @pointerdown.stop @click.stop="playQ"><svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg></button>
        <template v-if="p.edit">
          <button type="button" class="ktts" :title="step.audio ? 'Озвучить вопрос заново (Gemini)' + (byT ? ' — сейчас: ' + byT : '') : 'Озвучить вопрос (Gemini)'" :disabled="!ttsText" @pointerdown.stop @click.stop="tts = true"><img v-if="gIcon" :src="gIcon" alt="Gemini" /><span v-else>AI</span><i v-if="ed.pct(step, 'audio') != null">{{ ed.pct(step, 'audio') }}%</i></button>
          <button v-if="step.audio" type="button" class="kax" title="Убрать озвучку" @pointerdown.stop @click.stop="ttsClear">✕</button>
        </template>
        <TtsDialog v-if="tts" :text="ttsText" what="вопрос" :by="step.audioBy || ''" :has="!!step.audio" @close="tts = false" @save="ttsSave" />
      </div>
      <div v-if="!p.edit && (checked || p.st.busy)" class="kg" :class="checked && tier">          <!-- в правке спидометра нет (20.11.2026): в узкой карточке он сжимал вопрос в столбик -->
        <svg viewBox="0 0 120 66" role="img" :aria-label="checked ? `Совпадение по смыслу ${r.score} %` : 'Ещё не проверено'">
          <path d="M12 60 A48 48 0 0 1 108 60" class="tr" />
          <path v-if="checked && r.score > 0" :d="arc" class="fl" />
          <path :d="`M${tick[0][0]} ${tick[0][1]} L${tick[1][0]} ${tick[1][1]}`" class="tk" />
          <line x1="60" y1="60" :x2="needle[0]" :y2="needle[1]" class="nd" /><circle cx="60" cy="60" r="5" class="nd" />
        </svg>
        <div class="kgv"><b>{{ p.st.busy ? '…' : checked ? r.score + '%' : '—' }}</b><span >{{ p.st.busy ? 'проверяю' : tierT[tier] }}</span></div>
      </div>
    </div>

    <div class="kl" :class="look"><label :for="'kpa-' + step.id">Ваш ответ</label>
      <button v-if="!p.edit && !p.st.done && canDic" type="button" class="kdic" :class="dic" :style="{ '--l': dicLvl }" :disabled="p.st.busy" :title="dic === 'live' ? 'Остановить запись' : 'Надиктовать ответ — Gemini распознаёт польскую речь'" @pointerdown.stop @click="dictate">
        <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>{{ dic === 'live' ? 'Стоп · ' + dicSec : dic === 'connecting' ? 'Подключаюсь…' : 'Надиктовать с Gemini' }}</button>
      <span>{{ p.edit ? `зачёт от ${pass}%` : checked ? words : `${words} · зачёт от ${pass}%` }}</span></div>
    <div v-if="p.edit" class="ka ro" title="Тут ученик надиктовывает ответ по-польски">Mikołajki obchodzimy…</div>
    <div v-else-if="!p.st.done" class="kaw" :class="{ dic: dicCloud }">
      <textarea :id="'kpa-' + step.id" ref="ta" class="ka" @input="p.st.text = $event.target.value" :readonly="p.st.busy" placeholder="Надиктуйте или напишите ответ по-польски…" @pointerdown.stop @keydown.stop @keyup="sync" @paste="sync" @change="sync" @blur="sync" @focus="sync" />
      <!-- черновик диктовки — облаком поверх низа поля (21.11.2026): раньше строкой под полем — появлялась и пропадала, всё ниже прыгало -->
      <div v-if="dicCloud" class="kdd" :class="{ er: dicErr && !dicDraft }" aria-live="polite"><small>{{ dicErr && !dicDraft ? 'Диктовка' : 'Gemini слышит' }}</small>{{ dicShow }}</div>
    </div>
    <div v-else class="ka done">{{ p.st.text }}</div>

    <div class="kb miss" :class="look">
      <div class="kh"><span class="kht">Не прозвучало<template v-if="checked && r.missed.length"> · {{ r.missed.length }}</template></span>
        <span v-if="by" class="kby">{{ by.t }}<template v-for="s in by.sites" :key="s"><img v-if="aiIcon(s)" :src="aiIcon(s)" alt="" />{{ by.sites.length === 1 ? s : '' }}</template><template v-if="by.live"> Live · {{ lv?.name || by.model }}</template><template v-else-if="by.api"> API · {{ checkName(by.model) }}</template><template v-if="by.sec"> · {{ by.sec }}</template></span></div>
      <p v-if="checked && r.note" class="ph kno">{{ r.note }}</p>
      <p v-if="p.edit" class="ph">Пункты от Gemini — после проверки</p>
      <p v-else-if="r?.error" class="ph er">{{ r.error }}</p>
      <ul v-else-if="checked && r.missed.length"><li v-for="(m, k) in r.missed" :key="k">{{ m }}</li></ul>
      <p v-else-if="checked" class="ph">Всё главное прозвучало</p>
      <p v-else class="ph">Появится после проверки</p>
    </div>
    <div class="kb ref" :class="look">
      <div class="kh"><span class="kht">Эталон</span></div>
      <ExText v-if="p.edit" v-model="step.ideal" tag="p" class="kr raw" ph="Полный «идеальный» ответ. Оформление: ==термин== оранжевым, **жирный**, _курсив_, строка с «• » — пункт" multi />
      <div v-else-if="p.st.done" class="kr">
        <template v-for="(b, i) in refBlocks" :key="i">
          <p v-if="b.p"><template v-for="(x, j) in b.p" :key="j"><b v-if="mk(x) === 'b' || mk(x) === 'acc'" :class="mk(x) === 'acc' && 'acc'">{{ x.t }}</b><i v-else-if="mk(x) === 'i'">{{ x.t }}</i><template v-else>{{ x.t }}</template></template></p>
          <ul v-else><li v-for="(li, j) in b.ul" :key="j"><template v-for="(x, m) in li" :key="m"><b v-if="mk(x) === 'b' || mk(x) === 'acc'" :class="mk(x) === 'acc' && 'acc'">{{ x.t }}</b><i v-else-if="mk(x) === 'i'">{{ x.t }}</i><template v-else>{{ x.t }}</template></template></li></ul>
        </template>
      </div>
      <p v-else class="ph">Откроется после проверки — не подглядывайте</p>
    </div>
    <div v-if="api && checked && !p.edit && lv" class="kdis" @pointerdown.stop>
      <div class="klv">
        <button type="button" class="kqb" :title="lv.quiet ? 'Включить голос' : 'Заглушить — только текст'" @click="lv.setQuiet(!lv.quiet)">{{ lv.quiet ? '🔇' : '🔊' }}</button>
        <button v-if="!lv.listening && lv.state === 'live'" type="button" class="kdb" @click="moreLive"><img v-if="gIcon" :src="gIcon" alt="" />Подробнее — разбор голосом</button>
        <button v-if="lv.state === 'live'" type="button" class="kqb x" title="Закончить разговор" @click="lv.stop()">Завершить</button>
        <small>{{ lv.name }}<template v-if="lv.listening && lv.state === 'live'"> · говорите — Gemini слушает</template><template v-if="lv.state === 'ended'"> · разговор закончен</template></small>
      </div>
      <p v-if="lv.err" class="ph er">{{ lv.err }}</p>
      <div v-if="lv.lines.length" ref="lvBox" class="ktx"><div v-for="(l, i) in lv.lines" :key="i" class="kbl" :class="l.role">{{ l.t }}</div></div>
    </div>
    <div v-if="api && checked && !p.edit" class="kdis" @pointerdown.stop>
      <button type="button" class="kdb" :class="tk" :style="{ '--l': tkLvl }" @click="discuss">
        <img v-if="gIcon" :src="gIcon" alt="" />{{ tk === 'live' ? 'Завершить разбор' : tk === 'connecting' ? 'Подключаюсь…' : tkLines.length ? 'Обсудить ещё раз' : 'Обсудить ответ голосом' }}</button>
      <small v-if="tk === 'live'">{{ liveName(tkModel) }} · говорите — Gemini слушает</small>
      <p v-if="tkErr" class="ph er">{{ tkErr }}</p>
      <div v-if="tkLines.length" ref="tkBox" class="ktx"><div v-for="(l, i) in tkLines" :key="i" class="kbl" :class="l.role">{{ l.t }}</div></div>
    </div>
  </template>
  <template v-else-if="part === 'fb' && p.st.done && r">
    <small>{{ r.error ? 'Без проверки' : tierT[tier] }}</small><span class="fs">{{ r.error ? 'Сравните свой ответ с эталоном' : r.feedback }}</span>
  </template>
  <template v-else-if="part === 'fb' && !p.st.done && !p.edit && api">
    <span class="kbr api" @pointerdown.stop><i /><img v-if="gIcon" :src="gIcon" alt="" />Gemini API
      <select class="kms" :value="cPick" title="Модель проверки — запоминается в этом браузере" @change="pickCheck($event.target.value)"><option value="">{{ cAuto ? nameOf(cAuto) + (step.model ? ' (из урока)' : ' · авто') : 'авто' }}</option><option value="live">Live · голосом — быстро, без лимита</option><option v-for="m in cModels" :key="m" :value="m">{{ checkName(m) }}{{ limitOf(m) ? ' · ' + limitOf(m) : '' }}</option></select>
      <em :class="{ off: !bridge?.online }">запасной — мост {{ bridge?.online ? 'в сети' : 'не в сети' }}</em></span>
  </template>
  <template v-else-if="part === 'fb' && !p.st.done && !p.edit && bridge">
    <span class="kbr" :class="{ off: !bridge.online }"><i />{{ bridge.online ? 'Мост подключён' : 'Мост не в сети — проверки не будет' }}<template v-for="s in bridge.sites" :key="s"><img v-if="aiIcon(s)" :src="aiIcon(s)" alt="" />{{ s }}</template></span>
  </template>
  <template v-else-if="part === 'tools'">
    <span class="kjw">
      <ExTool title="Вид экрана: PDF (как в домашке) → линии → подложки" @click="nextLook">Вид: {{ LOOKS[look] }}</ExTool>
      <ExTool :on="!step.plain" title="Выделения в эталоне: оранжевые термины, жирный, курсив — включить / выключить" @click="toggleMarks">Выделения{{ step.plain ? ' выкл' : ' ✓' }}</ExTool>
      <select v-if="api" class="kms ed" :value="step.model || ''" title="Модель проверки у этого экрана (Gemini API)" @pointerdown.stop @change="setModelF($event.target.value)"><option value="">Модель: авто{{ cModels[0] ? ' · ' + checkName(cModels[0]) : '' }}</option><option value="live">Live · голосом</option><option v-for="m in cModels" :key="m" :value="m">{{ checkName(m) }}{{ limitOf(m) ? ' · ' + limitOf(m) : '' }}</option></select>
      <ExTool :on="!!step.autoplay" title="Звук вопроса сам играет, когда ученик открывает экран (если вопрос озвучен)" @click="toggleAuto">Автозвук{{ step.autoplay ? ' ✓' : ' выкл' }}</ExTool>
      <ExTool :on="jsOpen" title="Экран текстом: вопрос, эталон, порог и промпт для Gemini" @click="jsToggle">JSON{{ step.prompt || step.pass ? ' ✓' : '' }}</ExTool>
      <span v-if="jsOpen" class="kj" @pointerdown.stop @keydown.stop>
        <small>Этот экран: вопрос, эталон, порог зачёта и промпт для Gemini{{ step.prompt ? ' (свой)' : ' (общий)' }}</small>
        <textarea v-model="js" class="exf kjt" spellcheck="false" aria-label="JSON экрана" />
        <span class="kjb"><em v-if="jsErr">{{ jsErr }}</em><button type="button" class="kjg" @click="js = asJson(); jsErr = ''">Сбросить</button><button type="button" class="kjo" @click="jsApply">Применить</button></span>
      </span>
    </span>
  </template>
</template>

<style scoped>
.kq { display: flex; align-items: center; gap: 14px; min-height: 84px }
/* вопрос — как заголовок вопроса в ответах домашки: номер и текст на подложке, звезда наползает слева */
.kqw { position: relative; flex: 1; min-width: 0; display: flex; align-items: center }
.kqt { flex: 1; min-width: 0; padding: 5px 12px; border-radius: 10px; background: #f2dab5; font-family: 'PT Serif', Georgia, serif; font-size: 18px; font-weight: 400; line-height: 1.35; color: #351a05 }
.kqt :deep(.exf) { background: transparent } .kqn { margin-right: .3em }
.kst { flex: none; width: 30px; height: 30px; margin: 0 -9px 0 -6px; padding: 0; border: 0; background: none; position: relative; z-index: 1 } button.kst { cursor: pointer }
.kst svg { display: block; width: 100%; height: 100% } .kst .s1 { fill: #ff3b3b } .kst .s2 { fill: #d10f0f }
.kau, .ktts, .kax { flex: none; display: grid; place-items: center; margin-left: 6px; padding: 0; border: 0; cursor: pointer; position: relative }
.kau { width: 34px; height: 34px; border-radius: 50%; background: #f2dab5; color: #8a4b1c }
.kau svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round } .kau svg path:first-child { fill: currentColor }
.kau:hover, .kau.on { background: #e9c99a }
.ktts { width: 34px; height: 34px; border-radius: 10px; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, .14) }
.ktts img { width: 20px; height: 20px } .ktts:hover:not(:disabled) { box-shadow: 0 2px 8px rgba(75, 141, 248, .45) } .ktts:disabled { opacity: .4; cursor: not-allowed }
.ktts i { position: absolute; bottom: -14px; font-size: 10px; font-style: normal; color: #8a4b1c }
.kax { width: 22px; height: 22px; border-radius: 50%; background: none; color: #a07a55; font-size: 12px } .kax:hover { background: rgba(0, 0, 0, .06) }
.kst.off { opacity: .28; filter: grayscale(1) } .kst.off:hover { opacity: .6 }
.kg { flex: none; align-self: flex-start; display: flex; flex-direction: column; align-items: center; gap: 1px; width: 58px; margin-left: 6px; padding: 4px 0 5px; border-radius: 10px; background: #fff0d0 }          /* итог проверки — маленькой плашкой в углу (20.11.2026), до проверки её нет */
.kg.ok { background: #d7ffb8 } .kg.low { background: #ffdfe0 }
.kg svg { width: 38px; height: 21px; flex: none; overflow: visible }
.kg .tr { fill: none; stroke: rgba(0, 0, 0, .1); stroke-width: 13; stroke-linecap: round }
.kg .fl { fill: none; stroke: #ff9600; stroke-width: 13; stroke-linecap: round } .kg.ok .fl { stroke: #58cc02 } .kg.low .fl { stroke: #ff4b4b }
.kg .tk { stroke: #8a6a48; stroke-width: 3 } .kg .nd { stroke: #4b4b4b; fill: #4b4b4b; stroke-width: 5; stroke-linecap: round }
.kgv { display: flex; flex-direction: column; align-items: center; font-family: var(--font) } .kgv b { font-size: 14px; font-weight: 800; line-height: 1.1; color: #4b4b4b }
.kgv span { font-size: 9.5px; font-weight: 800; color: #8a5200; white-space: nowrap } .ok .kgv span { color: #3d7a00 } .low .kgv span { color: #b3261e }
.kl { display: flex; justify-content: space-between; margin-bottom: -8px; font-family: var(--font); font-size: 12px; font-weight: 800; color: #6b5a48; text-transform: uppercase; letter-spacing: .3px } .kl span { font-weight: 600; text-transform: none; letter-spacing: 0 }
/* поле ответа и тот же ответ после проверки — одной высоты: ниже ничего не съезжает */
.ka { display: block; width: 100%; height: 132px; box-sizing: border-box; margin: 0; padding: 11px 13px; border: 1px solid #e3c79c; border-radius: 12px; background: transparent;
  font-family: 'PT Serif', Georgia, serif; font-size: 17px; line-height: 1.5; color: #351a05; resize: none; outline: none; overflow: auto; user-select: text }
.ka:focus { border-color: #1cb0f6 } .ka::placeholder { color: #a08766 } .ka[readonly] { opacity: .7 }
.ka.done { height: auto; min-height: 0; padding: 2px 0; border-color: transparent; white-space: pre-wrap; overflow: visible }          /* после проверки — целиком, без прокрутки */ .ka.ro { color: #a08766; font-style: italic }
.kb { display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; padding: 10px 13px; border: 1px dashed #e3c79c; border-radius: 12px; overflow: auto }
.kb { padding: 0; border: 0; border-radius: 0; overflow: visible }          /* 19.11.2026: без пунктирных рамок и прокрутки — блок высотой с текст */
/* А · PDF: подписи — на подложке, как «Ответы» в домашке */
.kl.pdf { margin-bottom: -4px; align-items: center }
.kdic { --l: 0; margin: 0 8px 0 auto; display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px 0 8px; border: 0; border-radius: 13px; background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff; font-family: var(--font); font-size: 11.5px; font-weight: 800; text-transform: none; letter-spacing: 0; cursor: pointer; white-space: nowrap }
.kdic svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round }
.kdic.live { background: #e5484d; box-shadow: 0 0 0 calc(var(--l) * 8px) rgba(229, 72, 77, .22); font-variant-numeric: tabular-nums } .kdic.connecting { opacity: .7 } .kdic:disabled { opacity: .4; cursor: default }
.kaw { position: relative } .kaw.dic .ka { padding-bottom: 66px }          /* поле не меняет высоту — облачко лежит поверх его низа, текст прокручивается выше */
.kdd { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 2; max-height: 58px; overflow: hidden; padding: 6px 12px 7px; border-radius: 14px; background: #fff; box-shadow: 0 4px 14px rgba(53, 26, 5, .14), 0 0 0 1px #ecd9b8; font-family: 'PT Serif', Georgia, serif; font-size: 14.5px; font-style: italic; line-height: 1.3; color: #6b4a26; pointer-events: none; animation: kdd .18s ease-out }
.kdd small { display: block; margin-bottom: 1px; font-family: var(--font); font-size: 10.5px; font-style: normal; font-weight: 800; letter-spacing: .3px; text-transform: uppercase; color: #4b8df8 }
.kdd.er { color: #b3261e; font-family: var(--font); font-size: 12.5px; font-style: normal; font-weight: 700 } .kdd.er small { color: #b3261e }
@keyframes kdd { from { opacity: 0; transform: translateY(4px) } }
@media (prefers-reduced-motion: reduce) { .kdd { animation: none } }
.kl.pdf label, .pdf .kht { padding: 2px 10px; border-radius: 7px; background: #f2dab5; font-family: 'PT Serif', Georgia, serif; font-size: 14px; font-style: italic; font-weight: 700; color: #7b4224; text-transform: none; letter-spacing: 0 }
/* Б · тонкие линии между частями */
.kb.lines { padding-top: 12px; border-top: 1px solid #e9cfa6 }
/* В · мягкие подложки; «Не прозвучало» — с оранжевой полоской */
.kb.cards { padding: 10px 13px; border-radius: 12px; background: #fff6e6 } .kb.miss.cards { border-left: 3px solid #cd8a30; border-radius: 0 12px 12px 0 }
.kh { display: flex; align-items: center; gap: 4px; font-family: var(--font); font-size: 12px; font-weight: 800; color: #6b5a48; text-transform: uppercase; letter-spacing: .3px }
.kby { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-weight: 600; text-transform: none; letter-spacing: 0; color: #8a6a48 } .kby img { width: 15px; height: 15px; object-fit: contain }
/* подвал до проверки: с кем мост */
.kbr.api { color: #2f6fe0; flex-wrap: wrap } .kbr.api img { margin: 0 } .kbr.api em { font-style: normal; font-weight: 600; font-size: 12px; color: #3d7a00 } .kbr.api em.off { color: #b3261e }
.kms { height: 26px; max-width: 230px; padding: 0 4px; border: 1px solid rgba(47, 111, 224, .35); border-radius: 8px; background: #fff; color: #2f6fe0; font: inherit; font-size: 12px; font-weight: 700 } .kms.ed { height: 24px; font-size: 10.5px; max-width: 200px }
.kno { margin: 4px 0 0; font-size: 12px !important }
.klv { display: flex; align-items: center; gap: 8px; flex-wrap: wrap } .klv small { font-size: 12px; color: #8a6a48 }
.kqb { flex: none; height: 34px; min-width: 38px; padding: 0 12px; border: 0; border-radius: 17px; background: #f2dab5; color: #5a3a1c; font-family: var(--font); font-size: 14px; font-weight: 800; line-height: 1; cursor: pointer } .kqb.x { color: #b3261e }          /* не .kq — это строка вопроса (min-height 84) */
.kdis { display: grid; gap: 8px; margin-top: 4px }
.kdb { --l: 0; justify-self: start; display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px 0 10px; border: 0; border-radius: 19px; background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff; font-family: var(--font); font-size: 13.5px; font-weight: 800; cursor: pointer }
.kdb img { width: 20px; height: 20px; padding: 2px; border-radius: 6px; background: #fff } .kdb.live { background: #e5484d; box-shadow: 0 0 0 calc(var(--l) * 10px) rgba(229, 72, 77, .22) } .kdb.connecting { opacity: .7 }
.kdis small { font-size: 12px; color: #8a6a48 }
.ktx { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow: auto }
.kbl { max-width: 88%; padding: 7px 11px; border-radius: 13px; font-family: var(--font); font-size: 14px; line-height: 1.4; white-space: pre-wrap }
.kbl.ai { align-self: flex-start; background: rgba(75, 141, 248, .14); border-bottom-left-radius: 4px } .kbl.me { align-self: flex-end; background: #d7ffb8; border-bottom-right-radius: 4px }
.kbr { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #3d7a00 } .kbr.off { color: #b3261e }
.kbr i { width: 8px; height: 8px; border-radius: 50%; background: currentColor } .kbr img { width: 16px; height: 16px; margin-left: 4px; object-fit: contain }
.kb ul { margin: 0; padding-left: 18px; display: grid; gap: 3px; font-family: 'PT Serif', Georgia, serif; font-size: 15px; line-height: 1.35; color: #351a05 }
.ph { margin: 0; font-family: 'PT Serif', Georgia, serif; font-size: 14.5px; font-style: italic; color: #8a6a48 } .ph.er { color: #b3261e; font-style: normal }
.kr { margin: 0; font-family: 'PT Serif', Georgia, serif; font-size: 18px; font-weight: 400; line-height: 1.5;          /* как в домашке: эталон тем же кеглем, что вопрос */ color: #351a05 }
.kr.raw { white-space: pre-wrap }
.kr p { margin: 0; text-indent: 1em } .kr ul { margin: 2px 0; padding-left: 22px; display: grid; gap: 2px } .kr li::marker { color: #cd8a30 }
.kr b { font-weight: 700 } .kr b.acc { color: #cd8a30 } .kr i { font-style: italic }
/* «JSON» в подвале правки — окошко поверх (окно экрана не растёт) */
.kjw { position: relative; display: inline-flex }
.kj { position: absolute; left: 0; bottom: calc(100% + 12px); z-index: 6; display: grid; gap: 6px; width: 440px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); box-shadow: 0 6px 20px rgba(0, 0, 0, .12); font-family: var(--font) }
.kj small { font-size: 11px; font-weight: 700; color: var(--hint) }
.kjt { height: 260px; padding: 8px; overflow: auto; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace; text-align: left; white-space: pre-wrap; field-sizing: fixed }
.kjb { display: flex; align-items: center; justify-content: flex-end; gap: 6px } .kjb em { margin-right: auto; font-size: 11.5px; font-style: normal; font-weight: 700; color: var(--red-d, #c33) }
.kjg, .kjo { padding: 5px 12px; border: 0; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer } .kjg { background: var(--surface); color: var(--text) } .kjo { background: var(--blue); color: #fff }
@media (min-width: 900px) {
  .lp:not(.embedded):not(.single) .kqt, .lp:not(.embedded):not(.single) .kr { font-size: 20px }
  .lp:not(.embedded):not(.single) .ka { height: 150px; font-size: 18px }
  .lp:not(.embedded):not(.single) .ka.done { height: auto }          /* 20.11.2026: высота 150 перебивала «после проверки — по тексту», длинный ответ наезжал на «Не прозвучало» */
}
</style>

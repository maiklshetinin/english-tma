<script setup>
// «Ответ по смыслу» (Karta Polaka, 19.11.2026): вопрос; ученик надиктовывает ответ в поле (своим приложением или микрофоном
// клавиатуры), «Проверить» — чат (ChatGPT / Gemini / Claude) в браузере преподавателя сверяет с эталоном по смыслу через мост (utils/ai.js, server/ai.ts).
// Всё стоит на своих местах с самого начала, после проверки только заполняется — экран не прыгает: спидометр справа от вопроса,
// поле ответа (после проверки — тот же текст на том же месте), «Не прозвучало», «Эталон». Отзыв Gemini — в подвале.
// Вид — как домашка курса: кремовый фон и шрифты Alice / PT Serif. В правке: вопрос и эталон правятся на своих местах,
// а «JSON» в подвале — весь экран текстом: вопрос, эталон, порог и промпт для Gemini (свой у этого экрана; для теста промпта).
// 19.11.2026: точь-в-точь как в ответах домашки — номер и вопрос на подложке #f2dab5, красная гранёная звезда у обязательных (step.star),
// в эталоне оранжевые термины, жирный, курсив, абзацы с отступом и пункты (разметка: ==термин==, **жирный**, _курсив_, «• »).
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { sfxMicOn, sfxMicOff } from '../../composables/useSfx'          // «тр-тр-тр» микрофона (23.11.2026)
import ExHead from '../parts/ExHead.vue'
import ExText from '../parts/ExText.vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit, inEditor } from '../ctx'
import { PASS, SYSTEM, bridgeStatus, bridgeLast, bridgePush, aiIcon, kpPlain } from '../../utils/ai'
import { live } from '../../composables/useLive'
import TtsDialog from '../../components/TtsDialog.vue'
import { modelName } from '../../utils/tts'
import { sttModel, sttModels, STT_MODEL, firstKey, startTalk, liveModels, liveName, startDictation, dicChoices, dicName, dicKind } from '../../utils/live'
import { checkModels, checkName, limitOf, getPick, setPick } from '../../utils/kpcheck'
import { kpLive } from '../../utils/kplive'
import { recordMic, transcribeFile } from '../../utils/sttfile'
import { startBallDictation, ballLiveOf } from '../../utils/kpball'
import { reqOf } from '../../utils/overlay'
import VoiceNote from '../../components/VoiceNote.vue'
import KpBall from './KpBall.vue'          // «· шар» (24.11.2026, тест; step.ball) — шар смысловых блоков над ответом
import { ballNet } from '../../utils/kpball'
import { kpCfg, fill, kpReady, langHow } from './defaults'
import { ai } from '../../utils/gemini'
import J from './kp.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const editor = inEditor()          // открыт в редакторе курса (на ветке) — правки пишутся в сам экран
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
const bridge = computed(() => bridgeLast.value)          // статус — общий на всю страницу (utils/ai.js), 23.11.2026
const loadBridge = (fresh = false) => bridgeStatus(undefined, fresh).then((b) => { if (b) bridgeLast.value = b }).catch(() => {})
let brTm = 0
// экран не выбран на холсте редактора (p.idle, 23.11.2026) — мост не опрашиваем; выбрали — сразу свежий статус и опрос раз в 15 с
const idle = computed(() => !!p?.idle)
// «Ответ по смыслу · шар» (24.11.2026, тест): шару — всё, что сказано (поле ответа + черновик диктовки); статусы его запросов — в подвал
// 🎙 (24.11.2026): сколько говорил — сумма записей диктовки (p.st.spoke), в углу пузыря ответа. Время выполнения упражнения
// считает и показывает плеер (LessonPlayer → st.took, «время выполнения» в подвале), оно же — в журнале
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const spokeS = computed(() => (p.st.spoke || 0) + (dic.value === 'live' && dicT0.value ? (dicNow.value - dicT0.value) / 1000 : 0))
const ballText = computed(() => ((p.st.text || '') + ' ' + (dicDraft.value || '')).trim())
const BALL_ST = { on: 'open', busy: 'connecting', err: 'error', off: '' }
const ballList = computed(() => { const n = props.step.ball && ballNet[props.step.id]; if (!n) return []
  return [{ k: 'split', name: 'Нарезка эталона' + (n.model ? ' · ' + n.model : ''), ...n.split }, { k: 'cover', name: 'Сверка смысла' + (n.model ? ' · ' + n.model : ''), ...n.cover }].filter((x) => x.txt) })
// экран выбрали (или открыли) — сразу свежий статус, мимо 15-секундной памяти (23.11.2026): видно и в Network; дальше — раз в 15 с.
// Спрашивает только подвал (part fb) — статус показывает он
// статус идёт сам по /live (bridgePush) — тогда ни запроса, ни таймера; соединения нет — спросить при выборе и раз в 15 с
function brRun() { clearInterval(brTm); brTm = 0; if (p.edit || idle.value || props.part !== 'fb' || bridgePush()) return; loadBridge(true); brTm = setInterval(() => { if (!p.st.done && !bridgePush()) loadBridge() }, 15_000) }
onMounted(() => { if (p.edit) return; if (!idle.value) brRun() })          // невыбранный экран мост не спрашивает и его статус не показывает («Экран не активен»)
watch(idle, brRun)
watch(() => live.on, brRun)
onBeforeUnmount(() => clearInterval(brTm))
const by = computed(() => (checked.value && r.value.site ? { t: 'проверил', api: !!r.value.api, live: !!r.value.live, model: r.value.model, sites: [r.value.site], sec: Number.isFinite(r.value.ms) ? (r.value.ms / 1000).toFixed(1).replace('.', ',') + ' с' : '' } : null))
// 19.11.2026: программы диктовки вставляют текст в поле напрямую, без события input — v-model этого не видит («0 слов»,
// «Проверить» серая), а Vue при любой перерисовке ещё и стирал такой текст (value он переписывает всегда). Поэтому поле без привязки:
// своё значение пишем в него, только когда текст поменялся в данных (watch), и сверяем поле само: при нажатиях, вставке, уходе фокуса и раз в полсекунды
const ta = ref(null)
const sync = () => { const v = ta.value?.value; if (typeof v === 'string' && v !== p.st.text && !p.st.done) p.st.text = v }
let syncTm = 0
// сверка поля раз в полсекунды — только у выбранного экрана (у невыбранного поле не трогают — inert)
const syncRun = () => { clearInterval(syncTm); syncTm = 0; if (!idle.value) syncTm = setInterval(sync, 500) }
onMounted(() => { if (ta.value) ta.value.value = p.st.text || ''; syncRun() })
watch(idle, (v) => { if (v) sync(); syncRun() })          // уходят с экрана — последний раз сверить поле
watch(() => p.st.text, (v) => { if (ta.value && ta.value.value !== (v || '')) ta.value.value = v || ''; nextTick(fit) })
// строка ввода в подвале растёт по тексту — без прокрутки внутри (23.11.2026)
function fit() { const el = ta.value; if (!el || props.part !== 'fb') return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
onMounted(() => nextTick(fit))
watch(ta, (el) => { if (el) el.value = p.st.text || '' }, { flush: 'sync' })          // поле появилось заново (повтор вопроса) — со своим текстом
onBeforeUnmount(() => clearInterval(syncTm))
// «Надиктовать с Gemini» (20.11.2026): речь сырым звуком — в Gemini 3.5 Transcribe Live (польский закреплён), готовые куски
// дописываются в поле ответа, черновик — серым под полем. Поле остаётся обычным: можно вставить текст или надиктовать по-старому
// dicNet (24.11.2026): соединение с нейросетью диктовки — для строки под полем: off | connecting | open | closed | error
const dicNet = ref('off')
const dic = ref('idle'), dicDraft = ref(''), dicErr = ref(''), dicLvl = ref(0), dicT0 = ref(0), dicNow = ref(0)
let dicS = null, dicTm = 0, dicBase = ''
/** ✕ во время диктовки (как в Claude): остановить и выбросить продиктованное сейчас — поле как до нажатия микрофона */
function dicCancel() { if (dicNet.value === 'open' || dicNet.value === 'connecting') dicNet.value = 'closed'; const s = dicS; dicDraft.value = ''; dicS = null; s?.stop(); clearInterval(dicTm); dic.value = 'idle'; dicLvl.value = 0; waveRun(false); micOffSnd(); if (!p.st.done) p.st.text = dicBase }
// бегущие линии, как в Claude (23.11.2026): каждые 70 мс громкость — новой полоской справа, старые уезжают влево; тишина — точки
const WAVE_N = 24
const wave = ref(Array(WAVE_N).fill(0))
let waveTm = 0, micOn = false
// 23.11.2026: лента едет плавно и в тишине (как у Claude): новая полоска раз в 70 мс, между ними — сдвиг на шаг (5 px) по кадрам
const WAVE_STEP = 7, waveOff = ref(0)
let waveRaf = 0, waveAt = 0
function waveRun(on) {
  clearInterval(waveTm); cancelAnimationFrame(waveRaf); waveTm = waveRaf = 0; waveOff.value = 0
  if (!on) { wave.value = Array(WAVE_N).fill(0); return }
  waveAt = performance.now()
  waveTm = setInterval(() => { wave.value = [...wave.value.slice(1), dicLvl.value]; waveAt = performance.now() }, 70)
  const f = (t) => { waveOff.value = Math.min(1, Math.max(0, (t - waveAt) / 70)) * WAVE_STEP; waveRaf = requestAnimationFrame(f) }
  waveRaf = requestAnimationFrame(f)
}
const waveH = (v) => 3 + Math.min(1, Math.sqrt(Math.max(0, v)) * 1.5) * 21          // 24.11.2026: крупнее, как у Claude — точка 3 px, полоска до 24 px
const micOffSnd = () => { if (micOn) { micOn = false; sfxMicOff() } }          // «тр-тр-тр» вниз — один раз на запись
onBeforeUnmount(() => { clearInterval(waveTm); cancelAnimationFrame(waveRaf) })
const canDic = computed(() => ai.keys.length > 0)
const dicSec = computed(() => { const s = Math.max(0, Math.round((dicNow.value - dicT0.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
const addText = (t) => { const x = String(t || '').trim(); if (x && !p.st.done) p.st.text = ((p.st.text || '').trim() + ' ' + x).trim() }
// 23.11.2026: продиктованное — туда, где курсор (или вместо выделенного), а не в конец; следующие куски — следом.
// Щёлкнули во время диктовки в другое место текста — дальше туда. insSel — [начало, конец] вставки; null — в конец
let insSel = null
function insText(t) {
  const x = String(t || '').trim(); if (!x || p.st.done) return
  const el = ta.value, cur = p.st.text || ''
  if (el && document.activeElement === el) insSel = [el.selectionStart, el.selectionEnd]
  if (!insSel || insSel[0] > cur.length) { addText(x); return }
  const before = cur.slice(0, insSel[0]), after = cur.slice(Math.min(insSel[1], cur.length))
  const sp1 = before && !/\s$/.test(before) ? ' ' : '', sp2 = after && !/^[\s.,!?;:)]/.test(after) ? ' ' : ''
  p.st.text = before + sp1 + x + sp2 + after
  const at = before.length + sp1.length + x.length
  insSel = [at, at]
  nextTick(() => { if (el && document.activeElement === el) el.setSelectionRange(at, at) })
}
async function dictate() {
  if (fileMode.value) return dictateFile()
  if (dic.value === 'live' || dic.value === 'connecting') { dicS?.stop(); return }
  const key = firstKey(); dicErr.value = ''
  if (!key) { dicErr.value = 'Нужен ключ Gemini в профиле'; return }
  dic.value = 'connecting'; dicNet.value = 'connecting'; dicBase = p.st.text || ''; sfxMicOn(); micOn = true          // ✕ — вернуть, как было до диктовки; «тр-тр-тр» — пошло
  { const el = ta.value; insSel = el && props.part === 'fb' ? [el.selectionStart ?? dicBase.length, el.selectionEnd ?? dicBase.length] : null }          // куда вставлять — где курсор
  // чем распознавать — dicModel экрана или курса (23.11.2026): auto — свежая …transcribe-live ключа; Live-собеседник — молча; browser — сам браузер
  const want = (!editor && dicPick.value) || kpCfg(props.step).dicModel, model = props.step.ballLive ? (ballLiveOf(props.step.id)?.modelId || want) : dicKind(want) === 'auto' ? await sttModel(key) : want          // шар Live: слушает его же Live-сессия, своей расшифровки нет
  dicUsed.value = model
  dicS = (props.step.ballLive ? startBallDictation : startDictation)({ id: props.step.id, key, model, lang: kpCfg(props.step).lang, extra: reqOf(kpCfg(props.step), 'dictation'), on: {          // язык — из JSON экрана (lang)
    state: (s, info) => {
      if (s === 'live' && info) return
      dic.value = s === 'error' ? 'idle' : s === 'ended' ? 'idle' : s
      if (s === 'error') { dicErr.value = info; dicNet.value = 'error' }
      if (s === 'ended') dicNet.value = 'closed'
      if (s === 'live') { dicNet.value = 'open'; dicT0.value = dicNow.value = Date.now(); clearInterval(dicTm); dicTm = setInterval(() => { dicNow.value = Date.now() }, 500); waveRun(true) }
      if ((s === 'ended' || s === 'error') && dic.value !== 'connecting' && dicT0.value) { p.st.spoke = (p.st.spoke || 0) + (Date.now() - dicT0.value) / 1000; dicT0.value = 0 }          // 🎙 — сколько говорил
      if (s === 'ended' || s === 'error') { clearInterval(dicTm); dicLvl.value = 0; dicS = null; insText(dicDraft.value); dicDraft.value = ''; waveRun(false); micOffSnd() }
    },
    interim: (t) => { dicDraft.value = t },
    final: (t) => { insText(t); dicDraft.value = '' },
    level: (v) => { dicLvl.value = dicLvl.value * 0.6 + v * 0.4 },
  } })
}
watch(() => p.st.busy || p.st.done, (v) => { if (v) { dicS?.stop(); if (recS) { recS.cancel(); recS = null; clearInterval(dicTm); dic.value = 'idle' } } })
// «· целым аудио» (21.11.2026, тест; step.dic === 'file'): голос пишем целиком, после «Стоп» вся запись ОДНИМ запросом уходит в Gemini
// (utils/sttfile.js — текстовая модель Flash Lite слушает аудио; не Transcribe Live, та только потоком). Запись — голосовым сообщением
// «как в Telegram» (VoiceNote: переслушать, ⏱ отправляю → ✓✓ распознано), ответ модели «впечатывается» в поле. Облачка нет
const fileMode = computed(() => props.step.dic === 'file')
const note = ref(null)
let recS = null, typeTm = 0
async function dictateFile() {
  if (dic.value === 'live') return finishRec()
  if (dic.value !== 'idle') return
  dicErr.value = ''
  if (!ai.keys.length) { dicErr.value = 'Нужен ключ Gemini в профиле'; return }
  dic.value = 'connecting'
  try { recS = await recordMic({ on: { level: (v) => { dicLvl.value = dicLvl.value * 0.6 + v * 0.4 }, max: () => finishRec() } }) }
  catch (e) { dic.value = 'idle'; dicErr.value = e?.name === 'NotAllowedError' ? 'Нет доступа к микрофону — разрешите его в браузере' : 'Микрофон не запустился: ' + (e?.message || e); return }
  dic.value = 'live'; dicT0.value = dicNow.value = Date.now(); clearInterval(dicTm); dicTm = setInterval(() => { dicNow.value = Date.now() }, 500)
}
function finishRec() {
  const r = recS?.stop(); recS = null; clearInterval(dicTm); dicLvl.value = 0
  if (r?.sec) p.st.spoke = (p.st.spoke || 0) + r.sec; dicT0.value = 0          // 🎙 «целым аудио» — длина записи
  if (!r) { dic.value = 'idle'; return }
  if (note.value?.url) URL.revokeObjectURL(note.value.url)
  note.value = { url: URL.createObjectURL(r.blob), blob: r.blob, peaks: r.peaks, sec: r.sec, status: 'sending', model: '', ms: 0, err: '' }
  sendNote()
}
async function sendNote() {
  const n = note.value; if (!n) return
  n.status = 'sending'; n.err = ''; dic.value = 'sending'
  try {
    const c = kpReady(kpCfg(props.step))          // промпт и просьба расшифровки, язык — из JSON экрана (sttPrompt, sttAsk, lang)
    const r = await transcribeFile({ blob: n.blob, lang: c.lang, prompt: c.sttPrompt, ask: c.sttAsk, extra: reqOf(c, 'stt') })
    n.model = checkName(r.model); n.ms = r.ms
    if (!r.text) { n.status = 'error'; n.err = 'Речи не слышно — запишите ещё раз, поближе к микрофону' } else { n.status = 'done'; typeIn(r.text) }
  } catch (e) { n.status = 'error'; n.err = e?.message || String(e) }
  finally { dic.value = 'idle' }
}
/** Ответ модели «впечатывается» в поле — около секунды */
function typeIn(t) {
  const base = (p.st.text || '').trim(), add = (base ? ' ' : '') + t, step = Math.max(1, Math.ceil(add.length / 40)); let i = 0
  clearInterval(typeTm)
  typeTm = setInterval(() => { if (p.st.done) return clearInterval(typeTm); i += step; p.st.text = base + add.slice(0, i); if (i >= add.length) clearInterval(typeTm) }, 25)
}
// облачко над полем: пока идёт диктовка (пусто — «…»), или ошибка; длинный черновик — его хвост
// ---------- Модель диктовки (23.11.2026): выбор в правке экрана — пишется в экран (dicModel); на весь курс — «{ }» на плитке ----------
const dicUsed = ref('')                 // чем распознаётся сейчас (auto — уже развёрнутое имя)
const dicOpts = ref([]), dicAuto = ref('')
// в подвале — какая модель распознаёт диктовку (видно всем); в редакторе курса — список, чтобы сменить. Невыбранный экран на холсте не спрашивает
async function dicLoad() {
  if (fileMode.value || !ai.keys.length || idle.value) return
  if (props.part !== 'tools' && (props.part !== 'fb' || p?.edit)) return
  const key = firstKey()
  dicAuto.value = (await sttModels(key))[0] || STT_MODEL          // список моделей ключа — из кэша на сутки
  dicOpts.value = await dicChoices(key)          // список — и в редакторе, и при прохождении
}
onMounted(dicLoad)
watch(idle, (v) => { if (!v && !dicAuto.value) dicLoad() })
const isLive = computed(() => !!props.step.ballLive)          // шар Live: одна Live-сессия — мост и выбор модели диктовки в подвале не показываем
const dicSel = computed(() => (props.step.dicModel && props.step.dicModel !== 'auto' ? props.step.dicModel : ''))
function setDic(v) { if (v) props.step.dicModel = v; else delete props.step.dicModel; ed.changed() }
// при прохождении урока курс не меняем: выбор — только в этом браузере (как модель проверки), главнее урока; '' — как в уроке
const DPK = 'tma.dic.pick'
const dicPick = ref(editor ? '' : (() => { try { return localStorage.getItem(DPK) || '' } catch { return '' } })())
function pickDic(v) { if (editor) return setDic(v); dicPick.value = v; try { if (v) localStorage.setItem(DPK, v); else localStorage.removeItem(DPK) } catch { /* приватный режим */ } }
const lessonDic = computed(() => { const m = kpCfg(props.step).dicModel; return m && m !== 'auto' ? m : '' })          // из урока: экран или курс
const dicVal = computed(() => (editor ? dicSel.value : dicPick.value))
const dicShort = (id) => dicName(id).replace(/^Gemini /, '').replace(/^Браузер \(Web Speech\)$/, 'Браузер')          // в подвале — коротко
const DIC_GROUPS = [['stt', 'Расшифровка речи — только распознаёт'], ['live', 'Live-собеседник — молча, берём расшифровку'], ['browser', 'Без Gemini']]
// русские буквы в ответе (диктовка ошиблась языком) — розовым под текстом, чтобы сразу увидеть и поправить (23.11.2026)
const CYR = /[А-Яа-яЁё]+(?:[\s,.\-–—]+[А-Яа-яЁё]+)*/g
const cyrSegs = computed(() => { const s = p?.st?.text || '', out = []; let i = 0; for (const m of s.matchAll(CYR)) { if (m.index > i) out.push({ t: s.slice(i, m.index) }); out.push({ t: m[0], c: true }); i = m.index + m[0].length } if (i < s.length) out.push({ t: s.slice(i) }); return out })
const cyrN = computed(() => cyrSegs.value.filter((x) => x.c).reduce((n, x) => n + x.t.split(/[\s,.\-–—]+/).filter(Boolean).length, 0))
const dicWho = computed(() => (dicKind(dicUsed.value) === 'browser' ? 'Браузер слышит' : dicUsed.value ? dicName(dicUsed.value) + ' слышит' : 'Gemini слышит'))
const dicCloud = computed(() => !p.edit && !fileMode.value && (dic.value === 'live' || !!dicDraft.value || !!dicErr.value))
const dicShow = computed(() => { const t = dicDraft.value || (dic.value === 'live' ? '…' : dicErr.value); return t.length > 120 ? '…' + t.slice(-120) : t })

// «· Gemini API» (20.11.2026, тест): проверка напрямую (utils/kpcheck.js), мост — запасной. Модель: в правке — у экрана,
// в подвале перед проверкой — своя в этом браузере (главнее)
const api = computed(() => props.step.engine === 'api' || props.step.engine === 'live')
// 24.11.2026: «думает» — пока идёт проверка, ответ уже пузырём наверху, а на месте результата — значок чата и бегущий текст (как у Claude / Gemini)
const thinking = computed(() => p.st.busy && !p.st.done && !fileMode.value && !p.edit)
const thinkWho = computed(() => (api.value ? 'Gemini' : bridge.value?.sites?.[0] || 'Gemini'))
const thinkSec = ref(0)
let thinkTm = 0
watch(thinking, (on) => { clearInterval(thinkTm); thinkTm = 0; thinkSec.value = 0; if (on && props.part === 'body') { const t0 = Date.now(); thinkTm = setInterval(() => { thinkSec.value = Math.floor((Date.now() - t0) / 1000) }, 1000) } })
onBeforeUnmount(() => clearInterval(thinkTm))          // 'live' — убранный «Live (голос)»: идёт как Gemini API
// модель проверки — из JSON экрана (model); в редакторе курса пилюля пишет прямо в экран, у ученика — выбор только на это открытие
const cModels = ref([]), cPick = ref(editor ? '' : getPick())
onMounted(async () => { if (api.value && ai.keys[0]) cModels.value = await checkModels(ai.keys[0].key) })
const cSel = computed(() => (editor ? props.step.model || '' : cPick.value || props.step.model || ''))
function pickCheck(v) { if (editor) return setModelF(v); v = v === (props.step.model || '') ? '' : v; cPick.value = v; setPick(v) }
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
  const c = kpReady(kpCfg(props.step))          // промпт разбора, первая реплика, Live-модель, голос, язык — из JSON экрана (exercises/kp/defaults.ts)
  let m = c.liveModel !== 'auto' ? c.liveModel : ''
  if (!m) m = (await liveModels(key))[0] || ''
  if (!m) { tk.value = 'idle'; tkErr.value = 'Google не дал ключу Live-модели'; return }
  const v = c.voice
  tkModel.value = m
  const sys = fill(c.discussPrompt, { question: props.step.text ?? '', reference: kpPlain(props.step.ideal ?? ''), answer: p.st.text ?? '', score: r.value?.score ?? '?', missed: (r.value?.missed ?? []).join('; ') || c.discussNone })
  tkS = startTalk({ key, model: m, voice: v, lang: c.lang, system: sys, opener: c.discussOpener, extra: reqOf(c, 'discuss'), on: {
    state: (s2, info) => { if (s2 === 'live' && info) return; tk.value = s2 === 'error' || s2 === 'ended' ? 'idle' : s2; if (s2 === 'error') tkErr.value = info; if (s2 === 'ended' || s2 === 'error') { tkS = null; tkLvl.value = 0 } },
    text: tkPush, turn: () => { const l = tkLines.value.at(-1); if (l) l.closed = true }, level: (x) => { tkLvl.value = tkLvl.value * 0.6 + x * 0.4 },
  } })
}
onBeforeUnmount(() => tkS?.stop())

onBeforeUnmount(() => { dicS?.stop(); recS?.cancel(); clearInterval(dicTm); clearInterval(typeTm); if (note.value?.url) URL.revokeObjectURL(note.value.url) })
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
// 22.11.2026: пришёл ответ чата — плавно подкрутить к «Не прозвучало», чтобы результат был виден целиком
const resEl = ref(null)
watch(checked, (v) => { if (v) nextTick(() => resEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })) })
const refOpen = ref(false)          // эталон во всплывающей подсказке: открыта ли
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
    <ExHead v-if="p.edit || fileMode" :step="step" :def="J.head" />          <!-- 23.11.2026: у ученика без «Ответьте устно на вопрос» — вопрос сразу наверху; в правке — чтобы поменять -->
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
        <template v-if="!p.edit">
          <button type="button" class="krb" :class="{ on: refOpen }" :disabled="!p.st.done" :title="p.st.done ? 'Показать эталон' : 'Эталон откроется после проверки'" @pointerdown.stop @click="refOpen = !refOpen">Эталон</button>
          <div v-if="refOpen && p.st.done" class="krp" @pointerdown.stop>
            <button type="button" class="krx" title="Закрыть" @click="refOpen = false">✕</button>
            <div class="kr">
              <template v-for="(b, i) in refBlocks" :key="i">
                <p v-if="b.p"><template v-for="(x, j) in b.p" :key="j"><b v-if="mk(x) === 'b' || mk(x) === 'acc'" :class="mk(x) === 'acc' && 'acc'">{{ x.t }}</b><i v-else-if="mk(x) === 'i'">{{ x.t }}</i><template v-else>{{ x.t }}</template></template></p>
                <ul v-else><li v-for="(li, j) in b.ul" :key="j"><template v-for="(x, m) in li" :key="m"><b v-if="mk(x) === 'b' || mk(x) === 'acc'" :class="mk(x) === 'acc' && 'acc'">{{ x.t }}</b><i v-else-if="mk(x) === 'i'">{{ x.t }}</i><template v-else>{{ x.t }}</template></template></li></ul>
              </template>
            </div>
          </div>
        </template>
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

    <KpBall v-if="step.ball" :step="step" :text="ballText" :final="p.st.text || ''" :done="!!p.st.done" :edit="!!p.edit" :idle="idle" />
    <div class="kth">
    <div v-if="fileMode || p.edit || p.st.done || thinking" class="kl" :class="look"><label :for="'kpa-' + step.id">Ваш ответ</label>
      <button v-if="fileMode && !p.edit && !p.st.done && canDic" type="button" class="kdic" :class="dic" :style="{ '--l': dicLvl }" :disabled="p.st.busy || dic === 'sending'" :title="dic === 'live' ? 'Остановить запись' : fileMode ? 'Записать ответ целиком — после «Стоп» запись уйдёт в Gemini одним файлом' : 'Надиктовать ответ — Gemini распознаёт польскую речь'" @pointerdown.stop @click="dictate">
        <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>{{ dic === 'live' ? 'Стоп · ' + dicSec : dic === 'connecting' ? (fileMode ? 'Включаю микрофон…' : 'Подключаюсь…') : dic === 'sending' ? 'Распознаю…' : fileMode ? 'Записать ответ' : 'Надиктовать с Gemini' }}</button>
      <span>{{ p.edit ? `зачёт от ${pass}%` : checked ? words : `${words} · зачёт от ${pass}%` }}</span></div>
    <p v-if="fileMode && !p.st.done" class="kfn" :class="{ er: dicErr }">{{ dicErr || '🎙 Запись уходит в Gemini целым аудио после «Стоп» — не кусками; распознанный текст впишется в поле' }}</p>
    <VoiceNote v-if="fileMode && note && !p.edit" :url="note.url" :peaks="note.peaks" :sec="note.sec" :status="note.status" :model="note.model" :ms="note.ms" :err="note.err" @retry="sendNote" />
    <div v-if="p.edit" class="ka ro" title="Тут ученик надиктовывает ответ по-польски">Mikołajki obchodzimy…</div>
    <div v-else-if="!p.st.done && fileMode" class="kaw" :class="{ dic: dicCloud }">
      <textarea :id="'kpa-' + step.id" ref="ta" class="ka" @input="p.st.text = $event.target.value" :readonly="p.st.busy" :placeholder="'Надиктуйте или напишите ответ ' + langHow(kpCfg(step).lang) + '…'" @pointerdown.stop @keydown.stop @keyup="sync" @paste="sync" @change="sync" @blur="sync" @focus="sync" />
      <!-- черновик диктовки — облаком поверх низа поля (21.11.2026): раньше строкой под полем — появлялась и пропадала, всё ниже прыгало -->
      <div v-if="dicCloud" class="kdd" :class="{ er: dicErr && !dicDraft }" aria-live="polite"><small>{{ dicErr && !dicDraft ? 'Диктовка' : dicWho }}</small>{{ dicShow }}</div>
    </div>
    <div v-else-if="p.st.done || thinking" class="ka done">{{ p.st.text }}<span v-if="spokeS >= 1" class="kmeta" title="Сколько вы говорили — сумма записей диктовки">🎙 {{ mmss(spokeS) }}</span></div>          <!-- 24.11.2026: время речи — в углу пузыря, как в Telegram -->          <!-- ответ «уходит вверх» пузырём — после проверки -->

    <div v-if="thinking" class="kthink" aria-live="polite"><span class="kthi"><img v-if="aiIcon(thinkWho)" :src="aiIcon(thinkWho)" alt="" /></span>
      <span class="kthx">{{ thinkWho }} проверяет ответ</span><span class="kths">{{ thinkSec ? thinkSec + ' с' : '' }}</span></div>
    <div v-else ref="resEl" class="kb miss" :class="look">
      <div class="kh"><span class="kht">Не прозвучало<template v-if="checked && r.missed.length"> · {{ r.missed.length }}</template></span>
        <span v-if="by" class="kby">{{ by.t }}<template v-for="s in by.sites" :key="s"><img v-if="aiIcon(s)" :src="aiIcon(s)" alt="" />{{ by.sites.length === 1 ? s : '' }}</template><template v-if="by.live"> Live · {{ lv?.name || by.model }}</template><template v-else-if="by.api"> API · {{ checkName(by.model) }}</template><template v-if="by.sec"> · {{ by.sec }}</template></span></div>
      <p v-if="checked && r.note" class="ph kno">{{ r.note }}</p>
      <p v-if="p.edit" class="ph">Пункты от Gemini — после проверки</p>
      <p v-else-if="r?.error" class="ph er">{{ r.error }}</p>
      <ul v-else-if="checked && r.missed.length"><li v-for="(m, k) in r.missed" :key="k">{{ m }}</li></ul>
      <p v-else-if="checked" class="ph">Всё главное прозвучало</p>
      <p v-else class="ph">Появится после проверки</p>
    </div>
    <div v-if="p.edit" class="kb ref" :class="look">
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
  <!-- 23.11.2026: строка ввода как в чате (Claude) — в подвале, где «Проверить». Внутри: текст (растёт по высоте, без прокрутки),
       микрофон и «Проверить»; пока диктуют — то, что модель слышит, курсивом, волна, ✕ (выбросить продиктованное) и ✓ (остановить).
       Под строкой — тихо: мост, слова и порог, модель распознавания. «Целым аудио» — по-старому, поле наверху -->
  <template v-else-if="part === 'fb' && !p.st.done && !p.edit">
    <div v-if="!fileMode" class="kcm" :class="[dic, { busy: p.st.busy, off: idle }]" @pointerdown.stop>
      <div class="kcw"><div class="kchl" aria-hidden="true"><template v-for="(sg, i) in cyrSegs" :key="i"><mark v-if="sg.c">{{ sg.t }}</mark><template v-else>{{ sg.t }}</template></template>{{ '\n' }}</div>
      <textarea :id="'kpa-' + step.id" ref="ta" class="kci" rows="1" :readonly="p.st.busy" :placeholder="'Ответьте ' + langHow(kpCfg(step).lang) + ' — напишите или нажмите микрофон'" @input="p.st.text = $event.target.value; fit()" @keydown.stop @keyup="sync" @paste="sync" @change="sync" @blur="sync" @focus="sync" /></div>
      <div v-if="dicDraft || dic === 'live' || dic === 'connecting' || dicErr" class="kcd" :class="{ er: dicErr && !dicDraft && dic === 'idle' }" aria-live="polite">{{ dicDraft || (dic === 'connecting' ? 'Подключаюсь…' : dic === 'live' ? 'Говорите — ' + dicWho.replace(/ слышит$/, '') + ' слушает…' : dicErr) }}</div>
      <div class="kcr">
        <template v-if="dic === 'live' || dic === 'connecting'">
          <span class="kcwv" :title="dicSec" aria-hidden="true"><span class="kcwvs" :style="{ transform: `translateX(${-waveOff}px)` }"><i v-for="(v, i) in wave" :key="i" :style="{ height: waveH(v) + 'px' }" /></span></span>
          <button type="button" class="kcx" title="Выбросить то, что продиктовали сейчас" aria-label="Выбросить" @click="dicCancel"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <button type="button" class="kcx" title="Остановить — текст останется" aria-label="Готово" @click="dictate"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></button>
        </template>
        <template v-else>
          <button v-if="canDic" type="button" class="kcx mic" :disabled="p.st.busy || idle" :title="'Надиктовать — ' + dicWho.replace(/ слышит$/, '')" aria-label="Надиктовать" @click="dictate"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg></button>
          <button type="button" class="kcgo" :class="{ busy: p.st.busy }" :disabled="!p.canCheck || idle" :title="p.st.busy ? 'Проверяю…' : 'Проверить ответ'" aria-label="Проверить" @click="p.checkAny()"><svg v-if="!p.st.busy" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg><i v-else class="kspin" /></button>
        </template>
      </div>
    </div>
    <div class="kcst">
      <span v-if="idle && !isLive" class="kbr idle" title="Экран не выбран: мост не спрашиваем, скрипты стоят. Нажмите на экран — оживёт и спросит мост"><i />Мост не активен</span>
      <span v-else-if="api && !isLive" class="kbr api" @pointerdown.stop><i /><img v-if="gIcon" :src="gIcon" alt="" />Gemini API
      <select class="kms" :value="cSel" :title="editor ? 'Модель проверки — пишется в экран (model в JSON)' : 'Модель проверки — из урока; выбор здесь — только на этот раз'" @change="pickCheck($event.target.value)"><option value="">авто · {{ cModels[0] ? nameOf(cModels[0]) : 'Flash Lite' }}</option><option v-if="step.model && step.model !== 'live' && !cModels.includes(step.model)" :value="step.model">{{ nameOf(step.model) }} · из урока</option><option value="live">Live · голосом — быстро, без лимита</option><option v-for="m in cModels" :key="m" :value="m">{{ checkName(m) }}{{ limitOf(m) ? ' · ' + limitOf(m) : '' }}</option></select>
      <em :class="{ off: !bridge?.online }">запасной — мост {{ bridge?.online ? 'в сети' : 'не в сети' }}</em></span>
      <span v-else-if="bridge && !isLive" class="kbr" :class="{ off: !bridge.online }"><i />{{ bridge.online ? 'Мост подключён' : 'Мост не в сети — проверки не будет' }}<template v-for="s in bridge.sites" :key="s"><img v-if="aiIcon(s)" :src="aiIcon(s)" alt="" />{{ s }}</template></span>
      <span v-for="x in ballList" :key="x.k" class="knt" :class="BALL_ST[x.st]" :title="x.name + ' — ' + x.txt"><i />{{ x.name }} · {{ x.txt }}<em v-if="x.st === 'busy'" class="kdd"><b>.</b><b>.</b><b>.</b></em></span>
      <span v-if="p.st.busy && !fileMode" class="knt connecting" :title="api ? 'Ответ ушёл на проверку в Gemini API' : 'Ответ ушёл на проверку через мост в чат'"><i />проверка · запрос ушёл<em class="kdd"><b>.</b><b>.</b><b>.</b></em></span>
      <span class="ksp" />
      <span v-if="!fileMode && cyrN" class="kcyr" title="В ответе русские буквы — подсвечены розовым: диктовка ошиблась языком, поправьте">русские буквы: {{ cyrN }}</span>
      <span v-if="!fileMode" class="kcn" :title="'Зачёт — от ' + pass + ' % смысла эталона'">{{ words }} · от {{ pass }}%</span>
      <span v-if="!fileMode && canDic && !idle && !isLive" class="knt" :class="dicNet" :title="'Соединение с нейросетью диктовки (' + dicShort(dicUsed || dicSel || dicAuto || STT_MODEL) + '): открывается на каждое нажатие микрофона и закрывается после ✓'"><i />{{ { off: 'соединение закрыто', connecting: 'подключаюсь', open: 'соединение открыто · слушает', closed: 'соединение закрыто', error: 'соединение оборвалось' }[dicNet] }}<em v-if="dicNet === 'connecting'" class="kdd"><b>.</b><b>.</b><b>.</b></em></span>
      <select v-if="idle && !fileMode && canDic && !isLive" class="kms kdm" disabled><option>🎙 {{ dicSel ? dicShort(dicSel) : 'авто' }}</option></select>
      <select v-else-if="!fileMode && canDic && !isLive" class="kms kdm" :value="dicVal" :title="editor ? 'Чем распознавать «Надиктовать с Gemini» на этом экране (dicModel в JSON). На все экраны курса — «{ }» на плитке в меню Exercise' : 'Чем распознавать диктовку — выбор только в этом браузере, урок не меняется'" @pointerdown.stop @change="pickDic($event.target.value)"><option value="">🎙 {{ dicShort((!editor && lessonDic) || dicAuto || STT_MODEL) }}</option><option v-if="dicVal && !dicOpts.some(o => o.id === dicVal)" :value="dicVal">🎙 {{ dicShort(dicVal) }}</option><template v-for="g in DIC_GROUPS" :key="g[0]"><optgroup v-if="dicOpts.some(o => o.kind === g[0])" :label="g[1]"><option v-for="o in dicOpts.filter(o => o.kind === g[0])" :key="o.id" :value="o.id">🎙 {{ dicShort(o.id) }}</option></optgroup></template></select>
    </div>
  </template>
  <template v-else-if="part === 'tools'">
    <span class="kjw">
      <ExTool title="Вид экрана: PDF (как в домашке) → линии → подложки" @click="nextLook">Вид: {{ LOOKS[look] }}</ExTool>
      <ExTool :on="!step.plain" title="Выделения в эталоне: оранжевые термины, жирный, курсив — включить / выключить" @click="toggleMarks">Выделения{{ step.plain ? ' выкл' : ' ✓' }}</ExTool>
      <select v-if="api" class="kms ed" :value="step.model || ''" title="Модель проверки у этого экрана (Gemini API)" @pointerdown.stop @change="setModelF($event.target.value)"><option value="">Модель: авто{{ cModels[0] ? ' · ' + checkName(cModels[0]) : '' }}</option><option value="live">Live · голосом</option><option v-for="m in cModels" :key="m" :value="m">{{ checkName(m) }}{{ limitOf(m) ? ' · ' + limitOf(m) : '' }}</option></select>
      <select v-if="!fileMode && !isLive" class="kms ed" :value="dicSel" title="Чем распознавать «Надиктовать с Gemini» на этом экране (dicModel в JSON). На все экраны курса — «{ }» на плитке в меню Exercise" @pointerdown.stop @change="setDic($event.target.value)"><option value="">Диктовка: авто{{ dicAuto ? ' · ' + dicName(dicAuto) : '' }}</option><option v-if="dicSel && !dicOpts.some(o => o.id === dicSel)" :value="dicSel">Диктовка: {{ dicName(dicSel) }}</option><template v-for="g in DIC_GROUPS" :key="g[0]"><optgroup v-if="dicOpts.some(o => o.kind === g[0])" :label="g[1]"><option v-for="o in dicOpts.filter(o => o.kind === g[0])" :key="o.id" :value="o.id">Диктовка: {{ dicName(o.id) }}</option></optgroup></template></select>
      <ExTool :on="!!step.autoplay" title="Звук вопроса сам играет, когда ученик открывает экран (если вопрос озвучен)" @click="toggleAuto">Автозвук{{ step.autoplay ? ' ✓' : ' выкл' }}</ExTool>
      <ExTool title="JSON экрана — то же большое окно, что «{ }»: всё, что можно поменять у этого экрана, и справа — «Что принимает»" @click="ed.json(step)">JSON</ExTool>          <!-- 23.11.2026: своё маленькое поле со своим форматом убрано -->
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
.kdm { margin-left: 8px; height: 24px; max-width: 140px; font-size: 11px } .kdm:disabled { color: #a3a3a3; border-color: #dcdcdc; background: #f6f6f6 }
.kdic { --l: 0; margin: 0 8px 0 auto; display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px 0 8px; border: 0; border-radius: 13px; background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff; font-family: var(--font); font-size: 11.5px; font-weight: 800; text-transform: none; letter-spacing: 0; cursor: pointer; white-space: nowrap }
.kdic svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round }
.kdic.live { background: #e5484d; box-shadow: 0 0 0 calc(var(--l) * 8px) rgba(229, 72, 77, .22); font-variant-numeric: tabular-nums } .kdic.connecting { opacity: .7 } .kdic:disabled { opacity: .4; cursor: default }
.kfn { margin: -4px 2px 8px; font-size: 12px; font-weight: 700; color: #a08060 } .kfn.er { color: #b3261e }          /* «· целым аудио»: что происходит с записью */
.kdic.sending { opacity: .75 }
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
/* строка ввода как в чате Claude (23.11.2026): белая, тонкая серая рамка, крупное скругление; продиктованное — серым курсивом;
   справа — серые квадратные кнопки и «отправить» со стрелкой; под строкой — мелко: мост, слова и порог, модель распознавания */
.kcm { display: flex; flex-direction: column; gap: 6px; padding: 14px 12px 10px 18px; border: 1px solid rgba(0, 0, 0, .1); border-radius: 20px; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, .04); text-align: left; transition: border-color .15s, box-shadow .15s }
.kcm:focus-within, .kcm.live { border-color: rgba(0, 0, 0, .18); box-shadow: 0 2px 14px rgba(0, 0, 0, .07) }
.kci { display: block; width: 100%; min-height: 26px; box-sizing: border-box; margin: 0; padding: 0; border: 0; outline: 0; resize: none; overflow: hidden; background: transparent; color: #1f1f1f; caret-color: #1a73e8; font-family: var(--font); font-size: 16px; font-weight: 500; line-height: 1.55; user-select: text }
.kcw { position: relative } .kcw .kci { position: relative; z-index: 1 }
.kchl { position: absolute; inset: 0; z-index: 0; margin: 0; padding: 0; color: transparent; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; font-family: var(--font); font-size: 16px; font-weight: 500; line-height: 1.55; pointer-events: none; user-select: none }
.kchl mark { color: transparent; background: #ffd0e2; border-radius: 4px; box-shadow: 0 0 0 1px #ffd0e2 }
.kcyr { color: #c2185b; font-size: 12px; font-weight: 700; white-space: nowrap }
.kci::placeholder { color: #9b9b9b; font-weight: 500 }
.kcd { color: #6f6f6f; font-family: var(--font); font-size: 15px; font-style: italic; font-weight: 500; line-height: 1.55 } .kcd.er { color: #b3261e; font-size: 12.5px; font-style: normal; font-weight: 700 }
.kcr { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 34px }
.kcx { flex: none; display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 9px; background: #f0f0f0; color: #3a3a3a; cursor: pointer; transition: background .12s }
.kcx:hover:not(:disabled) { background: #e5e5e5 } .kcx:disabled { opacity: .4; cursor: default }
.kcx svg, .kcgo svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.kcgo { flex: none; display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 9px; background: #1cb0f6; color: #fff; cursor: pointer; transition: background .12s }
.kcgo:hover:not(:disabled) { background: #1899d6 } .kcgo:disabled { background: #e8e8e8; color: #b0b0b0; cursor: default } .kcgo.busy:disabled { background: #1cb0f6; color: #fff }
.kspin { width: 16px; height: 16px; border: 2px solid rgba(255, 255, 255, .45); border-top-color: #fff; border-radius: 50%; animation: kspin .8s linear infinite } @keyframes kspin { to { transform: rotate(360deg) } }
.kcwv { flex: none; width: 157px; height: 34px; margin-right: 6px; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 28px); mask-image: linear-gradient(90deg, transparent, #000 28px) }          /* слева лента тает */
.kcwvs { display: flex; align-items: center; gap: 4px; height: 100%; will-change: transform } .kcwv i { flex: none; width: 3px; min-height: 3px; border-radius: 2px; background: #6f6f6f }
.kcwv i:nth-last-child(-n + 3) { background: #3a3a3a }          /* свежие полоски — темнее */
.kcm, .kcst { width: 100%; box-sizing: border-box }
.kcst { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 10px; margin-top: 4px; padding: 0 10px; font-size: 12px; line-height: 1.2 }
.kcst > * { flex: none } .kcst .kbr { white-space: nowrap }
.ksp { flex: 1 1 0 !important } .kcn { color: #8f8f8f; font-size: 12.5px; font-weight: 500 }
.kcst .kdm { height: 28px; max-width: 165px; margin-left: 0; padding: 0 6px; border: 0; border-radius: 8px; background: transparent; color: #3a3a3a; font-size: 12.5px; font-weight: 600; cursor: pointer } .kcst .kdm:hover:not(:disabled) { background: #f0f0f0 } .kcst .kdm:disabled { color: #b0b0b0; background: transparent }
.kcst .kbr { font-size: 12.5px; font-weight: 600 }
.kmeta { float: right; margin: 6px -4px -4px 12px; font-family: var(--font, inherit); font-size: 12px; font-weight: 700; line-height: 1; color: #5a8a3c; font-variant-numeric: tabular-nums; white-space: nowrap }          /* 🎙 0:14 — в углу пузыря */
.ktook { font-variant-numeric: tabular-nums; white-space: nowrap }
/* соединение с нейросетью (24.11.2026): серая точка — закрыто, синяя мигает — подключаюсь / запрос ушёл, зелёная — открыто, красная — оборвалось */
.knt { display: inline-flex; align-items: center; gap: 5px; color: #8f8f8f; font-size: 12px; font-weight: 600; white-space: nowrap }
.knt i { width: 7px; height: 7px; border-radius: 50%; background: #c4c4c4; flex: none }
.knt.open { color: #1f7a3a } .knt.open i { background: #2bb34a; box-shadow: 0 0 0 3px rgba(43, 179, 74, .16) }
.knt.connecting { color: #1a73e8 } .knt.connecting i { background: #1a73e8; animation: kntp 1s ease-in-out infinite }
.knt.error { color: #b3261e } .knt.error i { background: #d93025 }
.kdd b { font-weight: inherit; animation: kddb 1.2s infinite } .kdd b:nth-child(2) { animation-delay: .2s } .kdd b:nth-child(3) { animation-delay: .4s }
@keyframes kntp { 50% { opacity: .35 } } @keyframes kddb { 0%, 100% { opacity: .2 } 40% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .knt.connecting i, .kdd b { animation: none } }
:global(.foot:has(.kcm)) { align-items: flex-end }
/* подвал тонкий, как у Claude: строка ввода и под ней строка мелкого текста — без полосы, рамки и больших отступов */
:global(.lp .foot.foot:has(.kcm)) { padding: 6px 14px 8px; border-top: 0; background: transparent }
:global(.lp.lp:not(.embedded):not(.single) .foot.foot:has(.kcm)) { padding: 8px max(20px, calc(50% - 390px)) 12px }
.kbr { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #3d7a00 } .kbr.off { color: #b3261e } .kbr.idle { color: #a3a3a3 }
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
/* 22.11.2026: экран как чат — всё одним столбцом, части идут друг за другом и не наезжают.
   Ответ ученика — справа (зелёный), результат проверки — слева (белые «пузыри») */
.kth { display: flex; flex-direction: column; gap: 10px; min-width: 0 }
.kth .kl, .kth .kl.pdf { margin-bottom: 0 }          /* без отрицательных отступов — из-за них подписи заезжали на соседей */
.kth .ka.done { align-self: flex-end; width: auto; max-width: 88%; padding: 9px 13px; border: 0; border-radius: 16px 16px 4px 16px; background: #d7ffb8; overflow: visible }
.kthink { align-self: flex-start; display: flex; align-items: center; gap: 9px; padding: 4px 2px; font-family: var(--font); font-size: 15px }
.kthi { display: grid; place-items: center; width: 22px; height: 22px; animation: kthSpin 2.4s cubic-bezier(.6, 0, .4, 1) infinite } .kthi img { width: 20px; height: 20px }
@keyframes kthSpin { 0% { transform: rotate(0) scale(1) } 50% { transform: rotate(180deg) scale(.82) } 100% { transform: rotate(360deg) scale(1) } }
.kthx { font-weight: 600; color: transparent; background: linear-gradient(90deg, #8a7a66 0%, #8a7a66 35%, #e8d9c2 50%, #8a7a66 65%, #8a7a66 100%) 0 0 / 250% 100%; -webkit-background-clip: text; background-clip: text; animation: kthShine 1.8s linear infinite }
@keyframes kthShine { from { background-position: 100% 0 } to { background-position: -150% 0 } }
.kths { font-size: 12px; color: #a8957c; font-variant-numeric: tabular-nums }
.kcm.busy .kci { color: transparent !important; caret-color: transparent } .kcm.busy .kchl { visibility: hidden }          /* ответ ушёл пузырём наверх — в поле не дублируем */
.kth .kb.miss { align-self: flex-start; box-sizing: border-box; max-width: 94%; padding: 10px 14px; border: 0; border-radius: 16px 16px 16px 4px; background: #fff; box-shadow: 0 1px 3px rgba(53, 26, 5, .14) }
/* 22.11.2026: эталон — всплывающая подсказка поверх экрана, места в потоке не занимает */
.krb { flex: none; margin-left: 6px; height: 34px; padding: 0 12px; border: 0; border-radius: 17px; background: #f2dab5; color: #7b4224; font-family: var(--font); font-size: 13px; font-weight: 800; cursor: pointer }
.krb:disabled { opacity: .45; cursor: default } .krb.on { background: #e9c99a }
.krp { position: absolute; left: 0; right: 0; top: calc(100% + 8px); z-index: 20; max-height: 60vh; overflow: auto; box-sizing: border-box; padding: 12px 38px 12px 14px; border-radius: 14px; background: #fff; box-shadow: 0 8px 24px rgba(53, 26, 5, .22), 0 0 0 1px #ecd9b8; animation: kdd .18s ease-out }
.krx { position: absolute; top: 6px; right: 8px; width: 24px; height: 24px; border: 0; border-radius: 50%; background: none; color: #a07a55; cursor: pointer }
.krx:hover { background: rgba(0, 0, 0, .06) }
.krp .kr { font-size: 16px }
</style>
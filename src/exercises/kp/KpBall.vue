<script setup>
// Шар смысловых блоков над «Ответом по смыслу» (24.11.2026, тест; шаблон kpball, step.ball). Логика и запросы — utils/kpball.js
// (там же расписан весь алгоритм). Здесь — только шар: блоки по сфере (точки Фибоначчи), медленно крутится; блок раскрыт —
// зелёный, шар поворачивается к нему; после проверки — нераскрытые серым пунктиром, шар по очереди показывает их.
// В правке — список блоков и кнопка «Нарезать эталон» (Gemini) — пишет блоки в экран (keys в JSON).
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useEdit } from '../ctx'
import { kpCfg, kpReady, fill as fillT } from './defaults'
import { kpPlain } from '../../utils/ai'
import { reqOf } from '../../utils/overlay'
import { quickBlocks, matchLocal, splitBlocks, coverBlocks, netOf, openBallLive, refCover, saidCover, fixDiff, ballLog, txShow as txOpen } from '../../utils/kpball'
const props = defineProps({ step: { type: Object, required: true }, text: { type: String, default: '' }, final: { type: String, default: '' }, done: Boolean, edit: Boolean, idle: Boolean })          // text — всё сказанное (с черновиком), final — только готовые («чёрные») куски
const ed = useEdit()
// Темы шара (24.11.2026): белая (тест), «Космос» — тёмная панель со звёздами, слова светятся; «Как у Марии» — бежево-коричневая, цвета домашек
// Марии Кобрыни. Выбор — кружками над шаром, помнится в браузере
// «Сфера» (24.11.2026) — тёмная, как «Голосовая сфера слов»: блоки-пилюли, засчитанное — голубым свечением, только что засчитанное — розово-голубым, шар можно крутить мышью
const THEMES_OLD = [{ k: 'sphere', t: 'Сфера' }, { k: 'white', t: 'Белая' }, { k: 'space', t: 'Космос' }, { k: 'book', t: 'Как у Марии' }]
// «Шар Live · новый вид» (ballV2, 25.11.2026, макет «Шар Live — экран ответа»): три темы на весь экран — коричневая, светлая, чёрная (= «Сфера»);
// по умолчанию чёрная (плитку видно среди остальных), помнится отдельно от старого шара
const v2 = computed(() => !!props.step.ballV2)
// «Шар Live · текст» (ballText, kpblurtext, 25.11.2026, макет «Без шара»): шара нет — эталон текстом под размытием; проявляются только
// сказанные слова (saidCover: кусок от модели длиннее сказанного — лишнее размыто и в процент не идёт). Текст можно свернуть (помнится).
// Засчитанное без речи отсекает openBallLive (guard). Тема — коричневая
const tx = computed(() => !!props.step.ballText)
const THEMES = props.step.ballV2 ? [{ k: 'book', t: 'Коричневая' }, { k: 'white', t: 'Светлая' }, { k: 'sphere', t: 'Чёрная' }] : THEMES_OLD
const TK = props.step.ballV2 ? 'tma.ball2.theme' : 'tma.ball.theme'
const theme = ref(props.step.ballText ? 'book' : (() => { try { const v = localStorage.getItem(TK); return THEMES.some((x) => x.k === v) ? v : 'sphere' } catch { return 'sphere' } })())
watch(theme, (v) => { if (tx.value) return; try { localStorage.setItem(TK, v) } catch { /* */ } })

const own = computed(() => (Array.isArray(props.step.keys) && props.step.keys.length ? props.step.keys : null))
const blocks = ref(own.value || quickBlocks(props.step.ideal))
const fast = ref(!own.value)          // блоки «быстрые» (выделения эталона), пока Gemini не нарезала
const ok = ref(new Set()), byAi = ref(new Set()), hit = ref(-1), info = ref({})          // info[i] — от чата: { said, fix, note }
const got = computed(() => Object.entries(info.value).map(([i, x]) => ({ i: +i, label: blocks.value[+i]?.label ?? '', ...x })).filter((x) => x.label).sort((a, b) => b.at - a.at))
const sc = ref({})          // Live (шар Live): i → оценка блока 0..1 (1 — целиком, 0.5 — частично); у обычного шара пусто
const isLive = computed(() => !!props.step.ballLive)
const pct = computed(() => isLive.value ? livePct.value : (blocks.value.length ? Math.round((blocks.value.reduce((a, _, i) => a + (ok.value.has(i) ? 1 : sc.value[i] || 0), 0) / blocks.value.length) * 100) : 0))
const missing = computed(() => isLive.value ? missedL.value : blocks.value.map((b, i) => (ok.value.has(i) ? null : b.label)).filter(Boolean))
// ---------- шар Live v3 (25.11.2026): без нарезки. Эталон — целиком в Live; модель ТОЛЬКО присылает найденные в нём куски (ref, дословно).
// Процент и «не прозвучало» — здесь, на фронте (refCover): какие слова эталона покрыты найденными кусками. Нейросеть процент не считает.
// В шаре: найденные куски — светятся; пока не «Готово» — для вида размытые начала предложений эталона (ничего не подсказывают); после «Готово» —
// непокрытые куски эталона — красным. Под шаром: «Засчитано» сразу, «Не прозвучало» — только после «Готово»
const found = ref([])          // [{ ref, said, at }]
const cov = computed(() => tx.value ? saidCover(props.step.ideal || '', found.value) : refCover(props.step.ideal || '', found.value.map((x) => x.ref)))
// текст: слова эталона — открыто (сказано) / новое (последний засчитанный кусок) / размыто; лента — новое сверху, у куска несказанное размыто
const txNew = computed(() => { const f = found.value; if (!f.length || props.done) return new Set(); let k = 0; f.forEach((x, i) => { if (x.at > f[k].at) k = i }); return new Set(cov.value.items?.[k]?.idx ?? []) })
// сообщения (25.11.2026, v3): каждое нажатие микрофона — что услышала Live (расшифровка) и что из этого засчитано / отброшено
const msgs = ref([])          // [{ at, heard, idx: [номера в found], bad: [{ ref, said }], rep }]
const msgsDesc = computed(() => [...msgs.value].reverse())
// подсмотреть размытое слово: нажали — видно 3 с, в процент не идёт
const peek = ref(new Set())
function look(k) { const s = new Set(peek.value); s.add(k); peek.value = s; setTimeout(() => { const t = new Set(peek.value); t.delete(k); peek.value = t }, 3000) }
const partPct = (parts) => { const n = parts.length, on = parts.filter((w) => w.on).length; return n ? { on, n, p: Math.round((on / n) * 100) } : null }
const txFeed = computed(() => found.value.map((x, i) => ({ ...x, i, parts: cov.value.items?.[i]?.parts ?? [] })).sort((a, b) => b.at - a.at))
// 26.11.2026: процент — по эталону: засчитанный кусок идёт в процент целиком (как раньше, refCover); несказанные слова только размыты, на процент не влияют
const refCov = computed(() => (tx.value ? refCover(props.step.ideal || '', found.value.map((x) => x.ref)) : cov.value))
const livePct = computed(() => refCov.value.pct), missedL = computed(() => refCov.value.missed)
const partShare = (parts) => { const n = cov.value.words?.length || 0; return n && parts.length ? Math.max(1, Math.round((parts.length / n) * 100)) : 0 }          // сколько процентов эталона дал этот кусок
const hiddenS = () => String(props.step.ideal || '').replace(/\*\*|==|_/g, '').split(/[.!?;\n]+/).map((x) => x.trim().split(/\s+/).slice(0, 6).join(' ')).filter((x) => x.length > 3).slice(0, 10)
const liveRes = () => { netOf(props.step.id).res = { pct: livePct.value, missed: [...missedL.value], total: found.value.length, ok: found.value.length,
  note: `Засчитано кусков эталона: ${found.value.length} · покрыто ${livePct.value}% текста эталона` } }          // итог — для «Готово» (LessonPlayer.aiCheck)
function rebuild(fresh = []) {          // шар Live: блоки шара = найденное + (размытое | не прозвучавшее)
  const f = found.value, tail = props.done ? missedL.value : hiddenS()
  blocks.value = [...f.map((x) => ({ label: x.ref, words: [] })), ...tail.map((t) => ({ label: t, words: [] }))]
  const inf = {}; f.forEach((x, i) => { inf[i] = { said: x.said, fix: x.fix || '', note: '', at: x.at } }); info.value = inf; sc.value = {}
  const all = new Set(f.map((_, i) => i)), old = new Set([...all].filter((i) => !fresh.includes(i)))
  ok.value = old; byAi.value = new Set(old); light(fresh, true)
}
function onLiveFound(list, meta = null) {
  liveChecked.value = true
  const have = new Set(found.value.map((x) => x.ref.toLowerCase())), at = Date.now(), add = list.filter((x) => !have.has(x.ref.toLowerCase())).map((x, k) => ({ ...x, at: at - k }))
  const start = found.value.length; found.value = [...found.value, ...add]
  rebuild(add.map((_, k) => start + k)); liveRes()
  if (tx.value) add.forEach((_, k) => {          // журнал колонкой (25.11.2026): что приложение сделало с куском — сколько слов открыто, что осталось размытым
    const it = cov.value.items?.[start + k]; if (!it) return
    const off = it.parts.filter((w) => !w.on).map((w) => w.w)
    ballLog(props.step.id, 'app', it.parts.length ? `открыто ${it.parts.length - off.length} из ${it.parts.length} слов` + (off.length ? ` · не сказано — размыто (в процент кусок идёт целиком): «${off.join(' ')}»` : ' · всё сказано') : 'кусок не найден в эталоне — не засчитан')
  })
  if (tx.value && list.length && !add.length) ballLog(props.step.id, 'app', 'повтор — уже засчитано раньше')
  if (tx.value && meta) msgs.value = [...msgs.value, { at, heard: meta.heard || '', idx: add.map((_, k) => start + k), bad: meta.bad || [], rep: list.length - add.length }]
}


// ---------- сфера ----------
const box = ref(null), els = []
let pts = [], ya = 0, xa = 0.2, tY = null, tX = null, hitAt = 0, raf = 0, missI = 0, missTm = 0, drag = null, fq = [], fqTm = 0
function layout() {
  const n = blocks.value.length
  pts = blocks.value.map((_, i) => { const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963; return { x: Math.cos(a) * r, y, z: Math.sin(a) * r } })
}
function face(i) { const p = pts[i]; if (!p) return; tY = Math.atan2(-p.x, p.z); tX = Math.atan2(p.y, Math.hypot(p.x, p.z)); hitAt = performance.now(); hit.value = i }
const near = (c, t) => { let d = t - c; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return c + d * 0.08 }
function draw() {
  const b = box.value; if (!b) return
  if (drag) { /* крутят мышью */ } else if (tY !== null) { ya = near(ya, tY); xa = near(xa, tX); if (performance.now() - hitAt > 1700) { tY = tX = null; hit.value = -1 } } else if (!props.idle) ya += 0.004
  const sph = theme.value === 'sphere', W = b.clientWidth, H = b.clientHeight, R = sph ? Math.min(H / 2 - 22, W / 2.6) : Math.min(H / 2 - 14, W / 3.2), kx = sph ? 1.15 : 1.45, cy = Math.cos(ya), sy = Math.sin(ya), cx = Math.cos(xa), sx = Math.sin(xa)
  pts.forEach((p, i) => {
    const el = els[i]; if (!el) return
    const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy, y2 = p.y * cx - z1 * sx, z2 = p.y * sx + z1 * cx
    const s = i === hit.value ? 1.32 : 0.65 + 0.55 * (z2 + 1) / 2
    el.style.transform = `translate(${W / 2 + x1 * R * kx - el.offsetWidth / 2}px, ${H / 2 + y2 * R - el.offsetHeight / 2}px) scale(${s.toFixed(3)})`
    el.style.opacity = i === hit.value ? '1' : (0.22 + 0.78 * (z2 + 1) / 2).toFixed(2); el.style.zIndex = i === hit.value ? '200' : String(Math.round((z2 + 1) * 50))
  })
}
function loop() { draw(); raf = requestAnimationFrame(loop) }
function run() { cancelAnimationFrame(raf); if (props.idle) nextTick(draw); else raf = requestAnimationFrame(loop) }          // миниатюра — один кадр
watch(blocks, () => { layout(); nextTick(draw) })
watch(theme, () => nextTick(draw))
/** крутить шар мышью или пальцем */
function grab(e) {
  if (props.idle || e.button > 0) return
  drag = { x: e.clientX, y: e.clientY }; tY = tX = null
  const mv = (ev) => { if (!drag) return; ya += (ev.clientX - drag.x) * 0.006; xa -= (ev.clientY - drag.y) * 0.006; drag = { x: ev.clientX, y: ev.clientY } }
  const up = () => { drag = null; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up) }
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up)
}
watch(() => props.idle, run)

// ---------- сверка ----------
function light(idx, ai) {
  const s = new Set(ok.value), a = new Set(byAi.value); let first = -1
  const fresh = []
  for (const i of idx) if (!s.has(i)) { s.add(i); if (ai) a.add(i); fresh.push(i) }
  if (!fresh.length) return
  ok.value = s; byAi.value = a
  const wasIdle = !fq.length && !fqTm; fq.push(...fresh); if (wasIdle) faceNext()          // шар поворачивается к каждому засчитанному по очереди
}
function faceNext() { fqTm = 0; const i = fq.shift(); if (i == null) return; face(i); if (fq.length) fqTm = setTimeout(faceNext, 1500) }
// 24.11.2026: в чат — кнопкой «Отправить на проверку» (сказал, помолчал — отправил) и последний раз — по «Проверить».
// Один запрос за раз: нажали, пока чат отвечает, — следующий уйдёт сразу после ответа
let sentWords = 0, busy = false, again = false
const asking = ref(false)
const wc = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0)
const sentN = ref(0)          // сколько слов уже ушло — для кнопки (есть ли новое)
const hasNew = computed(() => wc(props.final || props.text) > sentN.value)
function onText() {
  if (props.edit || props.idle) return
  if (isLive.value) return          // шар Live (25.11.2026): засчитывает только Live — без мгновенной подсветки по словам
  light(matchLocal(props.text, blocks.value), false)          // мгновенно — дословные совпадения (и по черновику)
}
/** «Отправить на проверку»: в чат — только новый кусок (сказанное после прошлой отправки), блоки — с пометкой уже засчитанных */
async function cover() {
  if (isLive.value) return          // шар Live сверяет сам по микрофону
  if (busy) { again = true; return }
  const all = (props.final || props.text).trim(), w = all ? all.split(/\s+/) : []
  if (w.length <= sentWords) return
  const before = w.slice(0, sentWords).join(' '), chunk = w.slice(sentWords).join(' ')
  busy = true; asking.value = true; sentWords = sentN.value = w.length
  try {
    const r = await coverBlocks({ id: props.step.id, question: props.step.text || '', blocks: blocks.value, text: chunk, done: [...ok.value], before })
    const inf = { ...info.value }, at = Date.now()
    r.forEach((x, k) => { inf[x.i] = { said: x.said, fix: x.fix, note: x.note, at: at - k } })
    info.value = inf
    light(r.map((x) => x.i), true)
  } catch { /* статус — в подвале */ }
  finally { busy = false; asking.value = false; if (again) { again = false; if (wc(props.final || props.text) > sentWords) cover() } }
}
// ---------- шар Live: одна Live-сессия на экран — utils/kpball.js (openBallLive). Голос — микрофоном (рация, Kp.vue → startBallDictation);
// выключили микрофон — модель присылает найденные куски эталона (onLiveFound). Текстом («РЕЧЬ: …») и блоками больше не шлём (убрано 25.11.2026)
const liveChecked = ref(false)
const passN = computed(() => (Number.isFinite(props.step.pass) ? props.step.pass : 60))          // порог экрана — для подписи под процентом
let lv = null
function resetSay() { liveChecked.value = false; found.value = []; msgs.value = []; ok.value = new Set(); byAi.value = new Set(); info.value = {}; sc.value = {}; sentWords = sentN.value = 0 }
function startLive() {
  lv?.stop(); resetSay()
  const id = props.step.id, q = props.step.text || '', ideal = props.step.ideal || ''
  try {
    const c = kpReady(kpCfg(props.step))          // промпт и функция — из JSON экрана (ballPrompt, ballTool), 25.11.2026
    lv = openBallLive({ id, question: q, ideal, system: fillT(c.ballPrompt, { question: q, reference: kpPlain(ideal) }), tool: c.ballTool, fix: props.step.ballFix === true, guard: false, fresh: tx.value, perTurn: props.step.ballSess === true, flow: props.step.ballFlow === true,          /* «· текст»: после каждого ответа — новая связь, один запрос — один ответ */          /* 25.11.2026: проверка «была ли речь» по расшифровке ломала засчитывание (Live расшифровывает польский кириллицей) — как у «нового вида», без неё */ extra: reqOf(c, 'ballLive'), onCover: onLiveFound })
  } catch (e) { netOf(id).cover = { st: 'err', txt: String(e.message || e) }; return }
  fast.value = false; netOf(id).split = { st: 'off', txt: '' }; rebuild(); liveRes()
}
watch(() => props.idle, (v) => { if (!v && isLive.value && !props.edit && !lv) startLive() })          // экран выбрали на холсте — Live включается
watch(() => props.text, onText)
watch(() => props.done, async (d) => {
  clearInterval(missTm)
  if (!d) { if (isLive.value) resetSay()
    ok.value = new Set(); byAi.value = new Set(); info.value = {}; sc.value = {}; sentWords = sentN.value = 0; netOf(props.step.id).cover = { st: 'off', txt: 'ждёт речь' }; if (isLive.value && !props.idle && !props.edit) startLive(); return }
  if (isLive.value) rebuild()          // шар Live: размытое уходит — на его месте непокрытые куски эталона (refCover)
  else if (wc(props.text) > sentWords) await cover()          // последняя сверка — по всему ответу
  missTm = setInterval(() => { const m = blocks.value.map((_, i) => i).filter((i) => !ok.value.has(i)); if (m.length) { face(m[missI++ % m.length]); hit.value = -1 } }, 1800)          // по очереди — что не прозвучало
})

// ---------- блоки ----------
const cutting = ref(false), cutErr = ref('')
async function load() {
  if (own.value || props.idle || props.edit) return
  try { const b = await splitBlocks({ id: props.step.id, question: props.step.text || '', ideal: props.step.ideal || '' }); blocks.value = b; fast.value = false; ok.value = new Set(); byAi.value = new Set(); info.value = {}; sentWords = sentN.value = 0; onText() }
  catch { /* остаются быстрые блоки; статус — в подвале */ }
}
/** правка: Gemini режет эталон заново — блоки пишутся в экран (keys) */
async function cut() {
  cutting.value = true; cutErr.value = ''
  try { const b = await splitBlocks({ id: props.step.id, question: props.step.text || '', ideal: props.step.ideal || '', force: true }); props.step.keys = b; blocks.value = b; fast.value = false; ed.changed() }
  catch (e) { cutErr.value = e.message || String(e) } finally { cutting.value = false }
}
function dropOwn() { delete props.step.keys; blocks.value = quickBlocks(props.step.ideal); fast.value = true; ed.changed() }
watch(() => props.step.keys, (k) => { if (Array.isArray(k) && k.length) { blocks.value = k; fast.value = false } })

onMounted(() => { layout(); run(); if (!props.idle && !props.edit) { netOf(props.step.id); if (isLive.value) startLive(); else load() } })
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearTimeout(fqTm); clearInterval(missTm); lv?.stop() })
</script>

<template>
  <div class="kball" :class="['th-' + theme, { idle, lv: isLive, v2, tx, fx: step.ballFix === true }]" @pointerdown.stop>
    <!-- «· текст» (ballText): без шара — эталон под размытием, проявляются только сказанные слова; свернуть — кнопкой -->
    <!-- «· текст» (ballText): процент — карточкой, как было; текст эталона под размытием — по кнопке «Эталон» у вопроса (Kp.vue, txShow);
         размытое слово — нажать, покажется на 3 с (в процент не идёт) -->
    <!-- процент — спидометром у вопроса (Kp.vue, как у «Ответа по смыслу»); здесь только текст эталона по кнопке «Эталон» -->
    <section v-if="tx && (txOpen || idle || edit)" class="kbtx">
      <p class="kbtxq"><template v-for="(x, j) in cov.words" :key="j"><span :class="cov.hit[j] ? (txNew.has(j) ? 'nw' : 'on') : done ? 'ms' : peek.has('t' + j) ? 'pk' : 'hd'" @click="!cov.hit[j] && !done && look('t' + j)">{{ x.w }}</span>{{ ' ' }}</template></p>
    </section>
    <div v-if="!idle && !v2 && !tx" class="kbth" role="radiogroup" aria-label="Тема шара"><button v-for="x in THEMES" :key="x.k" type="button" role="radio" :aria-checked="theme === x.k" class="kbt" :class="['t-' + x.k, { on: theme === x.k }]" :title="'Тема: ' + x.t" @click="theme = x.k" /></div>
    <!-- новый вид: одно окно — сверху вопрос (из Kp.vue, Teleport в #kb2h-…) и процент справа, ниже шар, внизу полоса -->
    <div v-if="!tx" class="kb2w" :class="{ on: v2 }">
      <div v-if="v2" class="kb2h">
        <div :id="'kb2h-' + step.id" class="kb2q" />
        <div class="kb2pc" :class="{ bad: done && pct < passN }"><b>{{ pct }}%</b><small>{{ done && pct < passN ? 'пока не зачёт · ' : '' }}проход {{ passN }}%</small>
          <div v-if="!idle" class="kbth" role="radiogroup" aria-label="Тема"><button v-for="x in THEMES" :key="x.k" type="button" role="radio" :aria-checked="theme === x.k" class="kbt" :class="['t-' + x.k, { on: theme === x.k }]" :title="'Тема: ' + x.t" @click="theme = x.k" /></div></div>          <!-- темы — под процентом, окно поднимается к самому верху -->
      </div>
    <div ref="box" class="kbs" aria-hidden="true" @pointerdown="grab"><i v-if="theme === 'sphere'" class="kbhalo" />
      <span v-for="(b, i) in blocks" :key="i + b.label" :ref="(el) => { els[i] = el }" class="kbw" :class="{ ok: ok.has(i), part: !ok.has(i) && sc[i] > 0, ai: byAi.has(i), fx: !!info[i]?.fix, miss: done && !ok.has(i), hit: hit === i }">{{ b.label }}</span>
    </div>
      <div v-if="v2" class="kb2bar" :class="{ bad: done && pct < passN }"><i :style="{ width: pct + '%' }" /></div>
    </div>
    <div v-if="!v2 && !tx" class="kbp" :class="{ lvbad: isLive && done && pct < passN }" :title="'Процент — доля раскрытых блоков эталона. Зелёные — сказано дословно, с точкой — засчитала Gemini по смыслу'">
      <b>{{ pct }}%</b><span class="kbbar"><i :style="{ width: pct + '%' }" /></span>
      <small v-if="isLive && !edit">{{ idle ? 'пример' : `покрыто ${pct}% текста эталона · ` + (done && pct < passN ? `пока не зачёт, проход от ${passN}%` : `проход от ${passN}%`) }}</small>
      <small v-else>{{ ok.size }} из {{ blocks.length }} блоков<template v-if="fast && !edit"> · {{ idle ? 'пример' : 'нарезаю эталон…' }}</template></small>
      <button v-if="!edit && !idle && !done && !isLive" type="button" class="kbgo" :disabled="asking || !hasNew" :title="'Отправить всё сказанное в чат через мост: какие смысловые блоки засчитаны и где ошибки'" @click="cover"><i class="kbdot" />{{ asking ? 'Чат сверяет…' : 'Отправить на проверку' }}</button>
    </div>
    <!-- шар Live (25.11.2026, макет «Шар Live — экран ответа»): засчитанное — одной строкой: кусок эталона жирным, серым — что сказал; новое сверху, в рамке.
         После «Готово» ниже — «Не прозвучало». Полоса прокрутки — как в Telegram: только при наведении -->
    <div v-if="isLive && (liveChecked || done) && !edit && !idle" class="kblv">
      <div v-if="!tx" class="kblvh"><h4>Засчитано</h4><i>{{ got.length }}</i><small v-if="!done">новое — сверху</small></div>
      <ul v-if="tx && txFeed.length" class="kbmsg2">          <!-- 25.11.2026: строки — кусок эталона (несказанное размыто), под ним — как сказали, справа — сколько слов куска сказано -->
        <li v-for="(x, k) in txFeed" :key="x.i" class="kbr" :class="{ nw: k === 0 && !done }"><i class="kbrd" />
          <span class="kbrr"><template v-for="(w, j) in x.parts" :key="j"><span :class="w.on ? '' : peek.has(x.i + ':' + j) ? 'pk' : 'kbtxh2'" @click="!w.on && look(x.i + ':' + j)">{{ w.w }}</span>{{ ' ' }}</template></span>
          <b v-if="partShare(x.parts)" class="kbrp full" :title="`этот кусок засчитан — ${partShare(x.parts)}% эталона (из общего процента); несказанные слова в нём только размыты`">+{{ partShare(x.parts) }}%</b>
          <span v-if="x.said" class="kbrs">{{ x.said }}</span></li>
      </ul>
      <ul v-else-if="!tx && got.length" class="kblvl"><li v-for="(x, k) in got" :key="x.i" :class="{ nw: k === 0 && !done }"><i v-if="k === 0 && !done" class="kblvd" /><b v-else class="kblvc">✓</b><span class="kblvr">{{ x.label }}</span><span v-if="x.said && step.ballFix" class="kblvf"><template v-for="(d, j) in fixDiff(x.said, x.fix)" :key="j"><span v-if="d.t != null">{{ d.t }} </span><span v-else class="kfx"><ins v-if="d.ins">{{ d.ins }}</ins><s v-if="d.del">{{ d.del }}</s><s v-else class="kfx0">&nbsp;</s></span> </template></span><span v-else-if="x.said" class="kblvs">{{ x.said }}</span></li></ul>
      <p v-else class="kb2e">пока ничего</p>
      <template v-if="done && !tx">
        <div class="kblvh no"><h4>Не прозвучало</h4><i>{{ missedL.length }}</i></div>
        <ul v-if="missedL.length" class="kblvl no"><li v-for="(m, k) in missedL" :key="k"><b class="kblvc">✕</b><span class="kblvr">{{ m }}</span></li></ul>
        <p v-else class="kb2e">всё сказано</p>
      </template>
    </div>
    <!-- что засчитал чат: блок ✓ — что ты сказал → как правильно (что исправлено); новое — сверху -->
    <ul v-if="!isLive && got.length && !edit && !idle" class="kbl">
      <li v-for="(x, k) in got" :key="x.i" :class="{ fx: x.fix, nw: k === 0 && isLive }"><b>✓ {{ x.label }}</b><span v-if="x.said" class="kbs1">«{{ x.said }}»</span>
        <template v-if="x.fix"><span class="kbf">→ {{ x.fix }}</span><small v-if="x.note">{{ x.note }}</small></template></li>
    </ul>
    <p v-if="!isLive && done && missing.length" class="kbm"><b>Не прозвучало:</b> {{ missing.join(' · ') }}</p>
    <div v-if="edit" class="kbe">
      <small>{{ own ? 'Свои блоки экрана (keys в JSON) — ученик увидит их' : 'Блоков у экрана нет — у ученика Gemini нарежет эталон сама (и запомнит в браузере). Можно нарезать сейчас и поправить в JSON' }}</small>
      <div class="kbb"><button type="button" class="kbc" :disabled="cutting || !step.ideal" @click="cut">{{ cutting ? 'Gemini режет…' : own ? '✂ Нарезать заново' : '✂ Нарезать эталон (Gemini)' }}</button>
        <button v-if="own" type="button" class="kbc x" @click="dropOwn">Убрать свои блоки</button></div>
      <p v-if="cutErr" class="kbm er">{{ cutErr }}</p>
    </div>
  </div>
</template>

<style scoped>
.kball { margin: 4px 0 10px }
/* тест — на белом (24.11.2026): весь экран упражнения с шаром белый, подвал — тоже (кроме зелёного / красного итога) */
:global(.lp:has(.kball.th-white:not(.idle))), :global(.lp:has(.kball.th-white:not(.idle)) .body), :global(.lp:has(.kball.th-white:not(.idle)) .foot:not(.good):not(.bad)),
:global(.lp:has(.kball.th-space:not(.idle))), :global(.lp:has(.kball.th-space:not(.idle)) .body), :global(.lp:has(.kball.th-space:not(.idle)) .foot:not(.good):not(.bad)),
:global(.lp:has(.kball.th-sphere:not(.idle))), :global(.lp:has(.kball.th-sphere:not(.idle)) .body), :global(.lp:has(.kball.th-sphere:not(.idle)) .foot:not(.good):not(.bad)) { background: #fff !important }
/* «Как у Марии»: фон страницы домашки (#ffeccf), текст — тёмно-коричневый, акцент — оранжевый (tools/lib/kp-json.py → style.colors) */
:global(.lp:has(.kball.th-book:not(.idle))), :global(.lp:has(.kball.th-book:not(.idle)) .body), :global(.lp:has(.kball.th-book:not(.idle)) .foot:not(.good):not(.bad)) { background: #ffeccf !important }
.kball { position: relative }
.kbth { position: absolute; right: 0; top: 0; z-index: 60; display: flex; gap: 5px }
.kbt { width: 16px; height: 16px; padding: 0; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px #d0d4da; cursor: pointer } .kbt.on { box-shadow: 0 0 0 2px #1a73e8 }
.kbt.t-white { background: #fff } .kbt.t-space { background: radial-gradient(circle at 35% 35%, #4b5cff, #0b1020 70%) } .kbt.t-book { background: #f2dab5; border-color: #ffeccf }
/* Космос: тёмная панель со звёздами, слова светятся */
.th-space .kbs { border-radius: 18px; background: radial-gradient(1px 1px at 12% 18%, #fff, transparent), radial-gradient(1px 1px at 78% 30%, #cfe1ff, transparent), radial-gradient(1.5px 1.5px at 44% 72%, #fff, transparent), radial-gradient(1px 1px at 88% 82%, #fff, transparent), radial-gradient(1px 1px at 22% 88%, #bcd, transparent), radial-gradient(1.5px 1.5px at 62% 12%, #fff, transparent), radial-gradient(1px 1px at 6% 52%, #dde, transparent), radial-gradient(ellipse at 50% 55%, #1b2a6b 0%, #0b1020 62%, #05070f 100%) }
.th-space .kbw { color: #8fa2d6; background: rgba(255, 255, 255, .04) }
.th-space .kbw.ok { background: rgba(43, 179, 74, .18); color: #8dffb6; text-shadow: 0 0 8px rgba(141, 255, 182, .7) }
.th-space .kbw.hit { box-shadow: 0 0 0 2px #8dffb6, 0 0 18px rgba(141, 255, 182, .55) }
.th-space .kbw.miss { background: rgba(255, 80, 80, .12); color: #ff9c9c; box-shadow: inset 0 0 0 1.5px rgba(255, 120, 120, .6) }
.th-space .kbw.fx::before { color: #ffd27a }
.th-space .kbth { right: 8px; top: 8px }
/* Как у Марии: коричневые слова, засчитанное — оранжевым */
.th-book .kbw { color: #9a6f4a } .th-book .kbw.ok { background: #fbe3bd; color: #351a05 } .th-book .kbw.hit { box-shadow: 0 0 0 2px #cd8a30 }
.th-book .kbw.miss { background: #fff7ea; color: #b3261e } .th-book .kbp b { color: #cd8a30 } .th-book .kbbar { background: #f4dcb8 } .th-book .kbbar i { background: #cd8a30 }
.th-book .kbl li { background: #fff4e2 } .th-book .kbl b { color: #7b4224 } .th-book .kbgo { border-color: #e6c08f; color: #7b4224; background: #fff8ee }
.kbs { position: relative; height: 210px; overflow: hidden; user-select: none }
.kball.idle .kbs { height: 170px }
.kbw { position: absolute; transition: background .3s, color .3s, box-shadow .3s, filter .4s; left: 0; top: 0; padding: 3px 10px; border-radius: 12px; white-space: nowrap; font-size: 14px; font-weight: 700; color: #7b8494; will-change: transform }
.kbw { filter: blur(3.5px) } .kball.idle .kbw, .kbw.ok, .kbw.miss { filter: none }          /* нераскрытое — размыто: подсказку не подсмотреть; после проверки — видно, чего не хватило */
.kbw.ok { background: #e3fbef; color: #128a55 } .kbw.fx::before { content: '✎ '; color: #b26a00 }          /* ✎ — сказал с ошибкой, чат поправил (список ниже) */ .kbw.ai::after { content: ' •'; color: #1a73e8 }
.kbw.hit { box-shadow: 0 0 0 2px #2bb34a }
.kbw.part { filter: blur(1.4px); box-shadow: inset 0 0 0 1.5px rgba(43, 179, 74, .55) } .th-sphere .kbw.part { box-shadow: inset 0 0 0 1.5px rgba(56, 189, 248, .6) }          /* Live: блок передан частично */
.kbw.miss { background: #fff; color: #b3261e; box-shadow: inset 0 0 0 1.5px #f1c7c7 }
.kbp { display: flex; align-items: center; gap: 10px; margin-top: 2px }
.kbp b { min-width: 52px; font-size: 22px; font-weight: 900; color: #128a55; font-variant-numeric: tabular-nums }
.kbbar { flex: 1; height: 8px; border-radius: 4px; background: #eef0f3; overflow: hidden } .kbbar i { display: block; height: 100%; background: #2bb34a; transition: width .4s }
.kbp small { font-size: 12px; font-weight: 700; color: var(--hint); white-space: nowrap }
.kbgo { flex: none; height: 26px; padding: 0 10px; border: 1px solid #b7e3c3; border-radius: 13px; background: #fff; color: #1f7a3a; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer } .kbgo:disabled { opacity: .55; cursor: default }
.kbl { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; max-height: 160px; overflow-y: auto }
.kbl li { padding: 5px 10px; border-radius: 10px; background: #f2fbf4; font-size: 13px; line-height: 1.4 } .kbl li.fx { background: #fff7e8 }
.kbl b { font-weight: 800; color: #128a55; margin-right: 6px } .kbs1 { color: #555; font-style: italic } .kbf { margin-left: 6px; font-weight: 800; color: #b26a00 }
.kbl small { display: block; font-size: 12px; font-weight: 600; color: #8a6a3a }
/* ---------- «Шар Live · новый вид» (ballV2, 25.11.2026, макет «Шар Live — экран ответа»): одно окно — вопрос и процент сверху, шар, полоса ---------- */
.kb2w { display: contents }
.kb2w.on { position: relative; display: block; padding: 12px 14px 12px; border-radius: 22px; border: 1px solid #ecd2ab; background: #fff4e2; overflow: hidden }
.kb2h { position: relative; z-index: 3; display: flex; align-items: flex-start; gap: 14px }
.kb2q { flex: 1; min-width: 0 } .kb2q:empty { display: none }
.kb2q :deep(.kq) { min-height: 0 }
.kb2pc { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; padding-top: 2px }
.kb2pc b { font-size: 30px; font-weight: 900; line-height: 1; color: #cd8a30 } .kb2pc small { font-size: 12px; font-weight: 700; color: #9a6f4a; white-space: nowrap }
.kb2pc.bad b, .kb2pc.bad small { color: #b3261e }
.kball.v2 .kbs, .kball.v2.th-sphere .kbs { height: 170px } .kball.v2.idle .kbs { height: 130px }          /* 25.11.2026: ниже — меньше пустоты между вопросом и полосой */
.kb2bar { height: 4px; border-radius: 2px; background: #f4dcb8; overflow: hidden } .kb2bar i { display: block; height: 100%; background: #cd8a30; transition: width .4s } .kb2bar.bad i { background: #e5484d }
.kball.v2 .kbth { position: static; justify-content: flex-end; margin: 4px 0 0 } .kball.v2 { margin-top: 0 }
/* светлая */
.th-white .kb2w.on { background: #fff; border-color: #e3e6ea } .th-white .kb2pc b { color: #2bb34a } .th-white .kb2pc small { color: #6b7280 }
.th-white .kb2bar { background: #e3f5e7 } .th-white .kb2bar i { background: #2bb34a }
.kball.v2.th-white .kb2q :deep(.kqt) { background: #eef0f3; color: #1f2328 }
/* чёрная (= «Сфера», как «Голосовая сфера слов») */
.th-sphere .kb2w.on { background: radial-gradient(circle at 50% 55%, rgba(56, 189, 248, .14) 0%, rgba(244, 114, 182, .05) 45%, rgba(20, 25, 38, .8) 75%); border-color: rgba(255, 255, 255, .09) }
.th-sphere .kb2pc b { color: #7dd3fc } .th-sphere .kb2pc small { color: #8b9bb4 } .th-sphere .kb2pc.bad b, .th-sphere .kb2pc.bad small { color: #fda4af }
.th-sphere .kb2bar { background: rgba(255, 255, 255, .08) } .th-sphere .kb2bar i { background: linear-gradient(90deg, #38bdf8, #f472b6) }
.kball.v2.th-sphere .kb2q :deep(.kqt) { background: rgba(255, 255, 255, .07); color: #f1f5f9 }
.kball.v2.th-sphere .kb2q :deep(.krb) { background: rgba(255, 255, 255, .08); color: #cbd5e1 }
/* телефон: вопрос без подложки (макет) */
@media (max-width: 560px) {
  .kb2w.on { padding: 10px 12px }
  .kball.v2 .kb2q :deep(.kqt), .kball.v2.th-white .kb2q :deep(.kqt), .kball.v2.th-sphere .kb2q :deep(.kqt) { background: none; padding: 0; font-size: 17px }
  .kb2pc b { font-size: 22px } .kball.v2 .kbs, .kball.v2.th-sphere .kbs { height: 150px }
}
/* нижняя панель (микрофон, «Готово», статус) — той же ширины, что окно и список, а не шире (25.11.2026) */
:global(.lp:has(.kball.v2:not(.idle)) .kpt), :global(.lp:has(.kball.v2:not(.idle)) .kcst) { max-width: 916px; margin-left: auto !important; margin-right: auto !important }
@media (min-width: 561px) { :global(.lp:has(.kball.tx:not(.idle)) .kpt), :global(.lp:has(.kball.tx:not(.idle)) .kcst) { max-width: 916px; margin-left: auto !important; margin-right: auto !important } }
:global(.lp:has(.kball.tx) .fb) { min-width: 0; grid-template-columns: minmax(0, 1fr) }          /* 25.11.2026: на телефоне подвал уезжал за правый край (auto-поля в сетке) — ширина подвала только на компьютере */          /* «· текст»: подвал шириной с экран ответа (25.11.2026) */
/* темы нового вида — на весь экран урока */
:global(.lp:has(.kball.v2.th-white:not(.idle))), :global(.lp:has(.kball.v2.th-white:not(.idle)) .body), :global(.lp:has(.kball.v2.th-white:not(.idle)) .foot:not(.good):not(.bad)) { background: #f5f6f8 !important }
:global(.lp:has(.kball.v2.th-sphere:not(.idle))), :global(.lp:has(.kball.v2.th-sphere:not(.idle)) .body), :global(.lp:has(.kball.v2.th-sphere:not(.idle)) .foot:not(.good):not(.bad)) { background: #090b10 !important; color: #f1f5f9 }
:global(.lp:has(.kball.v2.th-sphere:not(.idle)) .body) { background: radial-gradient(circle at 50% 30%, #161d2f 0%, #090b10 72%) !important }
:global(.lp:has(.kball.v2.th-sphere:not(.idle)) .kpt) { background: rgba(20, 25, 38, .72) !important; border-color: rgba(255, 255, 255, .09) !important; box-shadow: none !important }
:global(.lp:has(.kball.v2.th-sphere:not(.idle)) .kptt:not(.live):not(.connecting)) { background: rgba(255, 255, 255, .06) !important; color: #f1f5f9 !important }
:global(.lp:has(.kball.v2.th-sphere:not(.idle)) .kpdone:not(:disabled)) { background: rgba(56, 189, 248, .18) !important; color: #7dd3fc !important; box-shadow: inset 0 0 0 1px rgba(56, 189, 248, .5) !important }
:global(.lp:has(.kball.v2.th-sphere:not(.idle)) .foot) { border-top-color: rgba(255, 255, 255, .09) !important }

/* шар Live: урок шире — 960 px, как в макете (строки засчитанного без обрезки) */
:global(.lp:not(.embedded):not(.single) .body:has(.kball.lv:not(.idle))) { max-width: 960px }
/* шар Live: лента засчитанного (макет 25.11.2026) — строка: ✓ кусок эталона · серым что сказал; новое — точка и рамка; «Не прозвучало» — красным */
.kblv { display: flex; flex-direction: column; gap: 6px; margin-top: 10px }
.kblvh { display: flex; align-items: baseline; gap: 8px; margin-top: 4px } .kblvh h4 { margin: 0; font-size: 16px; font-weight: 900; color: #351a05 }
.kblvh i { padding: 1px 9px; border-radius: 999px; background: #cd8a30; color: #fff; font-size: 12.5px; font-weight: 800; font-style: normal } .kblvh small { margin-left: auto; font-size: 12.5px; font-weight: 700; color: #9a6f4a }
.kblvh.no h4 { color: #b3261e } .kblvh.no i { background: #e5484d }
.kblvl { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; max-height: 236px; overflow-y: auto; scrollbar-width: none }
.kblvl::-webkit-scrollbar { width: 0 } .kblvl:hover { scrollbar-width: thin; scrollbar-color: rgba(123, 66, 36, .28) transparent }
.kblvl:hover::-webkit-scrollbar { width: 6px } .kblvl:hover::-webkit-scrollbar-thumb { background: rgba(123, 66, 36, .28); border-radius: 3px } .kblvl::-webkit-scrollbar-button { display: none }
.kblvl li { flex: none; display: grid; grid-template-columns: 14px minmax(0, 1fr); align-items: baseline; gap: 2px 10px; padding: 9px 14px; border-radius: 12px; background: #fff; line-height: 1.35 }          /* всегда две строки: кусок эталона, под ним серым — что сказал, ровно под текстом */
.kblvl li.nw { box-shadow: inset 0 0 0 2px #cd8a30 } .kblvd { justify-self: center; align-self: center; width: 8px; height: 8px; border-radius: 50%; background: #cd8a30 }
.kblvc { justify-self: center; color: #cd8a30; font-weight: 900 } .kblvr { grid-column: 2; min-width: 0; font-size: 15px; font-weight: 800; color: #351a05 }          /* целиком, переносом — без «…» */
.kblvs { grid-column: 2; min-width: 0; font-size: 14px; font-weight: 600; color: #a08a72 }
.kball.fx .kblvl { max-height: 340px } .kball.fx .kblvl li { padding: 12px 16px; gap: 6px 10px } .kball.fx .kblvr { font-size: 16px }
/* разбор ошибок (kpballfix): фраза ученика — ошибка зачёркнута красным, над ней — как правильно (зелёным) */
.kblvf { grid-column: 2; min-width: 0; font-size: 15.5px; font-weight: 600; color: #5c4632; line-height: 2.5 }
.kfx { display: inline-flex; flex-direction: column; align-items: center; vertical-align: bottom; line-height: 1.25; margin: 0 1px }
.kfx s { color: #d0302f; text-decoration: line-through 2px #e5484d; padding: 0 3px; border-radius: 4px; background: #fdecec } .kfx s.kfx0 { background: none; text-decoration: none; min-height: 1em }
.kfx ins { text-decoration: none; color: #1a7f4b; font-weight: 800; font-size: 13.5px; padding: 0 4px; border-radius: 4px; background: #e3f6ea }
.th-sphere .kblvf, .th-space .kblvf { color: #cbd5e1 } .th-sphere .kfx s, .th-space .kfx s { background: rgba(229, 72, 77, .15); color: #fca5a5 } .th-sphere .kfx ins, .th-space .kfx ins { background: rgba(26, 127, 75, .25); color: #86efac }
.kblvl.no li { background: #fff7f5 }
/* «· текст» (kpblurtext): карточка эталона под размытием */
.kball.tx { margin-top: 10px } .kball.tx .kblv { margin-top: 0 }          /* 26.11.2026: под вопросом зазор 10px */
.kbtx { margin: 0 0 10px; padding: 16px 20px 18px; border-radius: 20px; background: #fff6e8; border: 1px solid #f1dcbc; display: flex; flex-direction: column; gap: 12px }
.kbtx.shut { padding-bottom: 14px }
.kbtxh { display: flex; align-items: center; gap: 14px } .kbtxp { font-size: 34px; font-weight: 900; color: #cd8a30; line-height: 1 } .kbtxp.bad { color: #d92d20 }
.kbtxb { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px } .kbtxb .kbbar { display: block; height: 8px; border-radius: 4px; background: #f4dcb8; overflow: hidden } .kbtxb .kbbar i { display: block; height: 100%; background: #cd8a30; border-radius: 4px; transition: width .4s }
.kbtxb small { font-size: 12.5px; font-weight: 700; color: #9a6f4a }
.kbtxt { flex: none; border: 0; border-radius: 11px; padding: 7px 13px; background: #f6e2c4; color: #7b4224; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer } .kbtxt:hover { background: #f0d3a8 }
.kbtxq { margin: 0; font-family: 'PT Serif', Georgia, serif; font-size: 19px; line-height: 1.75; color: #351a05 }
.kbtxq .hd { color: #c9a77c; filter: blur(5px); user-select: none } .kbtxq .nw { background: #fde3b4; box-shadow: 0 2px 0 #cd8a30; border-radius: 3px; transition: background 1s }
.kbtxq .ms { color: #b3261e; opacity: .8; text-decoration: underline dashed rgba(179, 38, 30, .45); text-underline-offset: 4px }
.kbmsg li { display: flex; flex-direction: column; gap: 6px }
/* «· текст», плотно (25.11.2026): процент строкой, строки — кусок эталона, под ним — как сказали, справа — сколько слов куска сказано */
.kbtm { display: flex; align-items: center; gap: 8px; margin: 2px 4px 8px } .kbtm b { font-size: 15px; font-weight: 900; color: #cd8a30 } .kbtm small { font-size: 12.5px; font-weight: 700; color: #9a6f4a }
.kbtm.bad b, .kbtm.bad small { color: #d92d20 }
.kbtmb { position: relative; flex: 1; height: 5px; border-radius: 3px; background: #f4dcb8 } .kbtmb i { display: block; height: 100%; border-radius: 3px; background: #cd8a30; transition: width .4s }
.kbtmb em { position: absolute; top: -2px; width: 2px; height: 9px; background: #9a6f4a; opacity: .45 }

.kbtxq .pk, .kbrr .pk { background: #fff3dc; border-radius: 4px; box-shadow: 0 0 0 1px #e9c99c; color: #7b4224 } .kbtxq .hd, .kbrr .kbtxh2 { cursor: pointer }
.kbmsg2 { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px }
.kbr { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 1px 10px; align-items: baseline; padding: 6px 12px; border-radius: 10px; background: #fff }
.kbr.nw { box-shadow: inset 0 0 0 1.5px #cd8a30 } .kbrd { width: 6px; height: 6px; border-radius: 50%; background: #e8c48e; align-self: center } .kbr.nw .kbrd { background: #cd8a30 }
.kbrr { font-size: 15px; font-weight: 800; color: #351a05; line-height: 1.4; min-width: 0 } .kbrs { grid-column: 2 / 4; font-size: 13px; font-weight: 600; color: #a08a72; line-height: 1.35 }
.kbrp { padding: 1px 7px; border-radius: 999px; background: #fdf0e0; color: #c2590a; font-size: 11.5px; font-weight: 900; white-space: nowrap } .kbrp.full { background: #e9f7e0; color: #2e8b00 }
.kbr.bad { background: #fff7f5 } .kbr.bad .kbrd { background: #e5484d } .kbr.bad s { color: #b3261e; font-weight: 700 } .kbr.bad .kbrp { background: #fdecea; color: #b3261e } .kbr.bad .kbrs { color: #b3261e; opacity: .8 }
.kbr.none { background: transparent; padding: 2px 12px } .kbr.none .kbrs { grid-column: 2 / 4; font-size: 12.5px }
.kbmh { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border-radius: 12px 12px 12px 4px; background: #fbeedb; color: #5c4632; font-size: 14px; font-weight: 600; line-height: 1.4 }
.kbmh svg { flex: none; width: 15px; height: 15px; margin-top: 2px; fill: none; stroke: #cd8a30; stroke-width: 2; stroke-linecap: round }
.kbmp { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 10px; font-size: 15px; font-weight: 800; color: #351a05; line-height: 1.35 } .kbmp > b { color: #cd8a30; font-weight: 900; justify-self: center }
.kbmp.bad > b { color: #b3261e } .kbmp.bad s { color: #b3261e; font-weight: 700; text-decoration-thickness: 2px } .kbmp.bad small { display: block; font-size: 12px; font-weight: 700; color: #b3261e; opacity: .8 }
.kbm0 { font-size: 12.5px; font-weight: 700; color: #a08a72; padding-left: 24px }
.kbtxh2 { filter: blur(4px); opacity: .7; user-select: none }          /* в ленте: часть куска, которую не сказали, — размыта */
@media (max-width: 560px) { .kbtx { padding: 12px 14px } .kbtxp { font-size: 26px } .kbtxq { font-size: 16px } } .kblvl.no .kblvc { color: #b3261e } .kblvl.no .kblvr { color: #8c1d18; font-weight: 700 }
.kball .kbp.lvbad b { color: #b3261e } .kball .kbp.lvbad small { color: #b3261e } .kball .kbp.lvbad .kbbar i { background: #e5484d }
.th-sphere .kblvh h4, .th-space .kblvh h4 { color: #e2e8f0 } .th-sphere .kblvl li, .th-space .kblvl li { background: rgba(255, 255, 255, .06) } .th-sphere .kblvr, .th-space .kblvr { color: #f1f5f9 } .th-sphere .kblvs, .th-space .kblvs { color: #8b9bb4 }
.th-sphere .kblvl.no li, .th-space .kblvl.no li { background: rgba(251, 113, 133, .08) } .th-sphere .kblvl.no .kblvr, .th-space .kblvl.no .kblvr { color: #fda4af }
/* шар Live: два блока под шаром — засчитано / не засчитано (25.11.2026) */
.kb2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px } .kb2.one { grid-template-columns: 1fr } @media (max-width: 560px) { .kb2 { grid-template-columns: 1fr } }
.kb2s { min-width: 0 } .kb2s h4 { margin: 0 0 4px; font-size: 12px; font-weight: 800; color: #128a55 } .kb2s.no h4 { color: #b3261e }
.kb2s .kbl { margin: 0 } .kb2s.no .kbl li { background: #fff3f2 } .kb2s.no .kbl b { color: #b3261e } .kb2s.no .kbl li.half { background: #fff8e8 } .kb2s.no .kbl li.half b { color: #b26a00 }
.kb2e { margin: 0; font-size: 12.5px; font-weight: 600; color: #9a9a9a }
.th-book .kb2s h4 { color: #7b4224 } .th-book .kb2s.no h4 { color: #b3261e } .th-book .kb2s.no .kbl li { background: #fff7ea }
.th-sphere .kb2s h4, .th-space .kb2s h4 { color: #7dd3fc } .th-sphere .kb2s.no h4, .th-space .kb2s.no h4 { color: #fda4af }
.th-sphere .kb2s.no .kbl li, .th-space .kb2s.no .kbl li { background: rgba(251, 113, 133, .08) } .th-sphere .kb2s.no .kbl b, .th-space .kb2s.no .kbl b { color: #fda4af }
/* шар Live (25.11.2026): полоска из делений — одно деление = один блок; наполовину переданный — закрашен наполовину; свежий засчитанный в списке — обведён */
.kbseg { flex: 1; display: flex; gap: 4px; height: 8px } .kbseg i { flex: 1; border-radius: 4px; background: #eef0f3; transition: background .4s }
.kbseg i.f { background: #2bb34a } .kbseg i.h { background: linear-gradient(90deg, #2bb34a 50%, #eef0f3 50%) }
.th-book .kbseg i { background: #f4dcb8 } .th-book .kbseg i.f { background: #cd8a30 } .th-book .kbseg i.h { background: linear-gradient(90deg, #cd8a30 50%, #f4dcb8 50%) }
.th-space .kbseg i, .th-sphere .kbseg i { background: rgba(255, 255, 255, .08) } .th-space .kbseg i.f { background: #2bb34a } .th-sphere .kbseg i.f { background: #38bdf8 }
.th-space .kbseg i.h { background: linear-gradient(90deg, #2bb34a 50%, rgba(255, 255, 255, .08) 50%) } .th-sphere .kbseg i.h { background: linear-gradient(90deg, #38bdf8 50%, rgba(255, 255, 255, .08) 50%) }
.kbl li.nw { box-shadow: inset 0 0 0 1.5px #2bb34a } .th-book .kbl li.nw { box-shadow: inset 0 0 0 1.5px #cd8a30 } .th-sphere .kbl li.nw { box-shadow: inset 0 0 0 1.5px rgba(56, 189, 248, .7) }
.kbm { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: #b3261e; line-height: 1.45 } .kbm b { font-weight: 800 }
.kbe { display: grid; gap: 6px; margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: #f6f8fb } .kbe small { font-size: 12px; font-weight: 600; color: var(--hint) }
.kbb { display: flex; gap: 6px; flex-wrap: wrap }
.kbc { height: 30px; padding: 0 12px; border: 1px solid #d6e4fb; border-radius: 15px; background: #fff; color: #2f6fe0; font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer } .kbc:disabled { opacity: .5; cursor: default }
.kbc.x { border-color: #f1c7c7; color: #b3261e }
.kbm.er { margin: 0 }
/* «Сфера» (24.11.2026): тёмная панель с ореолом, как «Голосовая сфера слов» */
.th-sphere { padding: 12px 14px 14px; border-radius: 18px; background: #090b10 radial-gradient(circle at 50% 42%, #161d2f 0%, #090b10 72%); color: #f1f5f9 }
.th-sphere .kbs { height: 290px; cursor: grab; touch-action: none } .th-sphere .kbs:active { cursor: grabbing } .kball.th-sphere.idle .kbs { height: 170px }
.kbhalo { position: absolute; left: 50%; top: 50%; width: 240px; height: 240px; margin: -120px 0 0 -120px; border-radius: 50%; background: radial-gradient(circle, rgba(56, 189, 248, .14) 0%, rgba(244, 114, 182, .05) 45%, transparent 70%); filter: blur(8px); pointer-events: none }
.th-sphere .kbw { padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .06); background: rgba(255, 255, 255, .03); color: #f1f5f9; font-size: 15px; font-weight: 500; letter-spacing: .02em }
.th-sphere .kbw.ok { color: #7dd3fc; background: rgba(56, 189, 248, .16); border-color: rgba(56, 189, 248, .55); box-shadow: 0 0 18px rgba(56, 189, 248, .3) }
.th-sphere .kbw.hit { color: #fff; font-weight: 700; background: linear-gradient(135deg, rgba(56, 189, 248, .45), rgba(244, 114, 182, .45)); border-color: #f472b6; box-shadow: 0 0 28px rgba(244, 114, 182, .75), 0 0 55px rgba(56, 189, 248, .65) }
.th-sphere .kbw.miss { color: #fda4af; background: rgba(251, 113, 133, .1); border-color: rgba(251, 113, 133, .5); box-shadow: none }
.th-sphere .kbw.fx::before { color: #fbbf24 } .th-sphere .kbw.ai::after { color: #38bdf8 }
.th-sphere .kbth { right: 10px; top: 10px }
.th-sphere .kbp b { color: #7dd3fc } .th-sphere .kbbar { background: rgba(255, 255, 255, .08) } .th-sphere .kbbar i { background: linear-gradient(90deg, #38bdf8, #f472b6) } .th-sphere .kbp small { color: #8b9bb4 }
.th-sphere .kbgo { height: 32px; padding: 0 14px; display: inline-flex; align-items: center; gap: 7px; border-color: rgba(56, 189, 248, .4); border-radius: 12px; background: rgba(56, 189, 248, .15); color: #7dd3fc }
.kbdot { display: none } .th-sphere .kbdot { display: block; width: 7px; height: 7px; border-radius: 50%; background: currentColor } .th-sphere .kbgo:disabled .kbdot { animation: kbpulse 1.2s infinite ease-in-out }
@keyframes kbpulse { 0%, 100% { transform: scale(.9); opacity: .6 } 50% { transform: scale(1.45); opacity: 1 } }
.th-sphere .kbl li { background: rgba(255, 255, 255, .05) } .th-sphere .kbl li.fx { background: rgba(251, 191, 36, .08) } .th-sphere .kbl b { color: #7dd3fc } .th-sphere .kbs1 { color: #cbd5e1 } .th-sphere .kbf { color: #fbbf24 } .th-sphere .kbl small { color: #8b9bb4 }
.th-sphere .kbm { color: #fda4af } .th-sphere .kbe { background: rgba(255, 255, 255, .05) } .th-sphere .kbe small { color: #8b9bb4 }
.kbt.t-sphere { background: radial-gradient(circle at 35% 35%, #f472b6, #38bdf8 45%, #090b10 75%) }
@media (prefers-reduced-motion: reduce) { .kbw { transition: none } }
</style>

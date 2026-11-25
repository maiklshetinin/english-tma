<script setup>
// Шар смысловых блоков над «Ответом по смыслу» (24.11.2026, тест; шаблон kpball, step.ball). Логика и запросы — utils/kpball.js
// (там же расписан весь алгоритм). Здесь — только шар: блоки по сфере (точки Фибоначчи), медленно крутится; блок раскрыт —
// зелёный, шар поворачивается к нему; после проверки — нераскрытые серым пунктиром, шар по очереди показывает их.
// В правке — список блоков и кнопка «Нарезать эталон» (Gemini) — пишет блоки в экран (keys в JSON).
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useEdit } from '../ctx'
import { quickBlocks, matchLocal, splitBlocks, coverBlocks, netOf, openBallLive, blocksMsg, liveCached } from '../../utils/kpball'
const props = defineProps({ step: { type: Object, required: true }, text: { type: String, default: '' }, final: { type: String, default: '' }, done: Boolean, edit: Boolean, idle: Boolean })          // text — всё сказанное (с черновиком), final — только готовые («чёрные») куски
const ed = useEdit()
// Темы шара (24.11.2026): белая (тест), «Космос» — тёмная панель со звёздами, слова светятся; «Как у Марии» — бежево-коричневая, цвета домашек
// Марии Кобрыни. Выбор — кружками над шаром, помнится в браузере
// «Сфера» (24.11.2026) — тёмная, как «Голосовая сфера слов»: блоки-пилюли, засчитанное — голубым свечением, только что засчитанное — розово-голубым, шар можно крутить мышью
const THEMES = [{ k: 'sphere', t: 'Сфера' }, { k: 'white', t: 'Белая' }, { k: 'space', t: 'Космос' }, { k: 'book', t: 'Как у Марии' }]
const TK = 'tma.ball.theme'
const theme = ref((() => { try { const v = localStorage.getItem(TK); return THEMES.some((x) => x.k === v) ? v : 'sphere' } catch { return 'sphere' } })())
watch(theme, (v) => { try { localStorage.setItem(TK, v) } catch { /* */ } })

const own = computed(() => (Array.isArray(props.step.keys) && props.step.keys.length ? props.step.keys : null))
const blocks = ref(own.value || quickBlocks(props.step.ideal))
const fast = ref(!own.value)          // блоки «быстрые» (выделения эталона), пока Gemini не нарезала
const ok = ref(new Set()), byAi = ref(new Set()), hit = ref(-1), info = ref({})          // info[i] — от чата: { said, fix, note }
const got = computed(() => Object.entries(info.value).map(([i, x]) => ({ i: +i, label: blocks.value[+i]?.label ?? '', ...x })).filter((x) => x.label).sort((a, b) => b.at - a.at))
const sc = ref({})          // Live (шар Live): i → оценка блока 0..1 (1 — целиком, 0.5 — частично); у обычного шара пусто
const isLive = computed(() => !!props.step.ballLive)
const pct = computed(() => isLive.value ? livePct.value : (blocks.value.length ? Math.round((blocks.value.reduce((a, _, i) => a + (ok.value.has(i) ? 1 : sc.value[i] || 0), 0) / blocks.value.length) * 100) : 0))
const missing = computed(() => isLive.value ? missedL.value : blocks.value.map((b, i) => (ok.value.has(i) ? null : b.label)).filter(Boolean))
// ---------- шар Live v3 (25.11.2026): без нарезки. Эталон — целиком в Live; модель сама присылает найденные в нём куски (ref) и процент.
// В шаре: найденные куски — светятся; пока не «Готово» — для вида размытые начала предложений эталона (ничего не подсказывают); после «Готово» —
// не прозвучавшее (summary) — красным. Под шаром: «Засчитано» сразу, «Не засчитано» — только после «Готово»
const livePct = ref(0), found = ref([]), missedL = ref([]), summed = ref(false)          // found: [{ ref, said, at }]
const hiddenS = () => String(props.step.ideal || '').replace(/\*\*|==|_/g, '').split(/[.!?;\n]+/).map((x) => x.trim().split(/\s+/).slice(0, 6).join(' ')).filter((x) => x.length > 3).slice(0, 10)
const liveRes = () => { netOf(props.step.id).res = { pct: livePct.value, missed: [...missedL.value], total: found.value.length + missedL.value.length, ok: found.value.length,
  note: `Засчитано фраз эталона: ${found.value.length}` + (summed.value ? ` · не прозвучало: ${missedL.value.length}` : '') } }          // итог — для «Готово» (LessonPlayer.aiCheck)
function rebuild(fresh = []) {          // шар Live: блоки шара = найденное + (размытое | не прозвучавшее)
  const f = found.value, tail = summed.value ? missedL.value : props.done ? [] : hiddenS()
  blocks.value = [...f.map((x) => ({ label: x.ref, words: [] })), ...tail.map((t) => ({ label: t, words: [] }))]
  const inf = {}; f.forEach((x, i) => { inf[i] = { said: x.said, fix: '', note: '', at: x.at } }); info.value = inf; sc.value = {}
  const all = new Set(f.map((_, i) => i)), old = new Set([...all].filter((i) => !fresh.includes(i)))
  ok.value = old; byAi.value = new Set(old); light(fresh, true)
}
function onLiveFound(list, percent) {
  liveChecked.value = true
  const have = new Set(found.value.map((x) => x.ref.toLowerCase())), at = Date.now(), add = list.filter((x) => !have.has(x.ref.toLowerCase())).map((x, k) => ({ ...x, at: at - k }))
  if (percent > livePct.value) livePct.value = percent
  const start = found.value.length; found.value = [...found.value, ...add]
  rebuild(add.map((_, k) => start + k)); liveRes()
}
function onLiveSummary(missed, percent) { missedL.value = missed; summed.value = true; if (percent) livePct.value = percent; rebuild(); liveRes() }


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
  if (isLive.value) return coverLive()
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
// ---------- шар Live (24.11.2026, тест): одна Live-сессия вместо моста — utils/kpball.js (openBallLive) ----------
// Текст сказанного уходит в модель кусками «РЕЧЬ: …» (сразу после паузы или кнопкой), она молча вызывает cover(n, score, said): 1 — блок целиком,
// 0.5 — частично (блок наполовину, процент считаем сами). Одно сообщение за раз: пока модель не договорила, следующий кусок ждёт
// после первой сверки Live под шаром — два блока: «Засчитано» (что сказал) и «Не засчитано» (½ — передано частично)
const liveChecked = ref(false)
let lv = null, lvBlocks = [], busyL = false, againL = false, busyTm = 0, autoTm = 0, fillTm = 0
function fill(b) {          // блоки «наливаются» в шар по одному — как будто нейросеть выдаёт их
  clearInterval(fillTm); let k = 0; blocks.value = []
  fillTm = setInterval(() => { k++; blocks.value = b.slice(0, k); if (k >= b.length) { clearInterval(fillTm); fillTm = 0 } }, 260)
}
function resetSay() { liveChecked.value = false; livePct.value = 0; found.value = []; missedL.value = []; summed.value = false; ok.value = new Set(); byAi.value = new Set(); info.value = {}; sc.value = {}; sentWords = sentN.value = 0; busyL = againL = false; clearTimeout(busyTm) }
function startLive(keep = false) {          // keep — переподключение: засчитанное остаётся, вся речь уходит заново
  lv?.stop(); if (keep) { sentWords = sentN.value = 0; busyL = againL = false; clearTimeout(busyTm) } else resetSay()
  const id = props.step.id, q = props.step.text || '', ideal = props.step.ideal || ''
  try {
    lv = openBallLive({ id, question: q, ideal,
      onCover: onLiveFound, onSummary: onLiveSummary,
      onTurn: () => { busyL = false; asking.value = false; clearTimeout(busyTm); if (againL) { againL = false; coverLive() } } })
  } catch (e) { netOf(id).cover = { st: 'err', txt: String(e.message || e) }; return }
  fast.value = false; netOf(id).split = { st: 'off', txt: '' }; if (!keep) rebuild(); liveRes()          // v3: блоков нет — эталон уже в системной инструкции
}
function coverLive() {
  const all = (props.final || props.text).trim(), w = all ? all.split(/\s+/) : []
  if (w.length <= sentWords) return
  if (busyL) { againL = true; return }
  if (!lv?.alive) { startLive(true); setTimeout(coverLive, 1200); return }          // сессия закрылась — открыть заново (блоки и вся речь уйдут снова)
  const chunk = w.slice(sentWords).join(' ')
  busyL = true; asking.value = true; sentWords = sentN.value = w.length
  netOf(props.step.id).cover = { st: 'busy', txt: 'запрос ушёл в Live — сверяет речь с блоками' }
  lv.send('РЕЧЬ: ' + chunk)
  clearTimeout(busyTm); busyTm = setTimeout(() => { if (busyL) { busyL = false; asking.value = false; netOf(props.step.id).cover = { st: 'err', txt: 'Live не ответил за 25 с' } } }, 25_000)
}
watch(() => props.idle, (v) => { if (!v && isLive.value && !props.edit && !lv) startLive() })          // экран выбрали на холсте — Live включается
watch(() => props.final, () => {          // сказал — помолчал: само уходит в Live
  if (!isLive.value || props.edit || props.idle || props.done) return
  if (lv?.hearing) { sentWords = sentN.value = wc(props.final); return }          // речь слышит сама Live-сессия (микрофон) — текстом повторно не шлём
  clearTimeout(autoTm); autoTm = setTimeout(() => { if (hasNew.value) coverLive() }, 1100)
})
watch(() => props.text, onText)
watch(() => props.done, async (d) => {
  clearInterval(missTm)
  if (!d) { if (isLive.value) { resetSay(); summed.value = false }
    ok.value = new Set(); byAi.value = new Set(); info.value = {}; sc.value = {}; sentWords = sentN.value = 0; netOf(props.step.id).cover = { st: 'off', txt: 'ждёт речь' }; if (isLive.value && !props.idle && !props.edit) startLive(); return }
  if (isLive.value) rebuild()          // шар Live: размытое уходит, не прозвучавшее (summary) — уже пришло к «Готово»
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
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearTimeout(fqTm); clearInterval(missTm); clearInterval(fillTm); clearTimeout(autoTm); clearTimeout(busyTm); lv?.stop() })
</script>

<template>
  <div class="kball" :class="['th-' + theme, { idle }]" @pointerdown.stop>
    <div v-if="!idle" class="kbth" role="radiogroup" aria-label="Тема шара"><button v-for="x in THEMES" :key="x.k" type="button" role="radio" :aria-checked="theme === x.k" class="kbt" :class="['t-' + x.k, { on: theme === x.k }]" :title="'Тема: ' + x.t" @click="theme = x.k" /></div>
    <div ref="box" class="kbs" aria-hidden="true" @pointerdown="grab"><i v-if="theme === 'sphere'" class="kbhalo" />
      <span v-for="(b, i) in blocks" :key="i + b.label" :ref="(el) => { els[i] = el }" class="kbw" :class="{ ok: ok.has(i), part: !ok.has(i) && sc[i] > 0, ai: byAi.has(i), fx: !!info[i]?.fix, miss: done && !ok.has(i), hit: hit === i }">{{ b.label }}</span>
    </div>
    <div class="kbp" :title="'Процент — доля раскрытых блоков эталона. Зелёные — сказано дословно, с точкой — засчитала Gemini по смыслу'">
      <b>{{ pct }}%</b><span class="kbbar"><i :style="{ width: pct + '%' }" /></span>
      <small v-if="isLive && !edit">{{ idle ? 'пример' : 'засчитано фраз: ' + found.length }}</small>
      <small v-else>{{ ok.size }} из {{ blocks.length }} блоков<template v-if="fast && !edit"> · {{ idle ? 'пример' : 'нарезаю эталон…' }}</template></small>
      <button v-if="!edit && !idle && !done && !isLive" type="button" class="kbgo" :disabled="asking || !hasNew" :title="'Отправить всё сказанное в чат через мост: какие смысловые блоки засчитаны и где ошибки'" @click="cover"><i class="kbdot" />{{ asking ? 'Чат сверяет…' : 'Отправить на проверку' }}</button>
    </div>
    <div v-if="isLive && (liveChecked || done) && !edit && !idle" class="kb2" :class="{ one: !(done && summed) }">
      <section class="kb2s ok"><h4>Засчитано · {{ got.length }}</h4>
        <ul v-if="got.length" class="kbl"><li v-for="(x, k) in got" :key="x.i" :class="{ nw: k === 0 && !done }"><b>✓ {{ x.label }}</b><span v-if="x.said" class="kbs1">«{{ x.said }}»</span></li></ul>
        <p v-else class="kb2e">пока ничего</p></section>
      <section v-if="done && summed" class="kb2s no"><h4>Не прозвучало · {{ missedL.length }}</h4>
        <ul v-if="missedL.length" class="kbl"><li v-for="(m, k) in missedL" :key="k"><b>✕ {{ m }}</b></li></ul>
        <p v-else class="kb2e">всё сказано</p></section>
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

<script setup>
// Шар смысловых блоков над «Ответом по смыслу» (24.11.2026, тест; шаблон kpball, step.ball). Логика и запросы — utils/kpball.js
// (там же расписан весь алгоритм). Здесь — только шар: блоки по сфере (точки Фибоначчи), медленно крутится; блок раскрыт —
// зелёный, шар поворачивается к нему; после проверки — нераскрытые серым пунктиром, шар по очереди показывает их.
// В правке — список блоков и кнопка «Нарезать эталон» (Gemini) — пишет блоки в экран (keys в JSON).
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useEdit } from '../ctx'
import { quickBlocks, matchLocal, splitBlocks, coverBlocks, netOf } from '../../utils/kpball'
const props = defineProps({ step: { type: Object, required: true }, text: { type: String, default: '' }, done: Boolean, edit: Boolean, idle: Boolean })
const ed = useEdit()

const own = computed(() => (Array.isArray(props.step.keys) && props.step.keys.length ? props.step.keys : null))
const blocks = ref(own.value || quickBlocks(props.step.ideal))
const fast = ref(!own.value)          // блоки «быстрые» (выделения эталона), пока Gemini не нарезала
const ok = ref(new Set()), byAi = ref(new Set()), hit = ref(-1)
const pct = computed(() => (blocks.value.length ? Math.round((ok.value.size / blocks.value.length) * 100) : 0))
const missing = computed(() => blocks.value.map((b, i) => (ok.value.has(i) ? null : b.label)).filter(Boolean))

// ---------- сфера ----------
const box = ref(null), els = []
let pts = [], ya = 0, xa = 0, tY = null, tX = null, hitAt = 0, raf = 0, missI = 0, missTm = 0
function layout() {
  const n = blocks.value.length
  pts = blocks.value.map((_, i) => { const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963; return { x: Math.cos(a) * r, y, z: Math.sin(a) * r } })
}
function face(i) { const p = pts[i]; if (!p) return; tY = Math.atan2(-p.x, p.z); tX = Math.atan2(p.y, Math.hypot(p.x, p.z)); hitAt = performance.now(); hit.value = i }
const near = (c, t) => { let d = t - c; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return c + d * 0.08 }
function draw() {
  const b = box.value; if (!b) return
  if (tY !== null) { ya = near(ya, tY); xa = near(xa, tX); if (performance.now() - hitAt > 1700) { tY = tX = null; hit.value = -1 } } else if (!props.idle) ya += 0.004
  const W = b.clientWidth, H = b.clientHeight, R = Math.min(H / 2 - 14, W / 3.2), cy = Math.cos(ya), sy = Math.sin(ya), cx = Math.cos(xa), sx = Math.sin(xa)
  pts.forEach((p, i) => {
    const el = els[i]; if (!el) return
    const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy, y2 = p.y * cx - z1 * sx, z2 = p.y * sx + z1 * cx
    const s = 0.62 + 0.38 * (z2 + 1) / 2 + (i === hit.value ? 0.35 : 0)
    el.style.transform = `translate(${W / 2 + x1 * R * 1.45 - el.offsetWidth / 2}px, ${H / 2 + y2 * R - el.offsetHeight / 2}px) scale(${s.toFixed(3)})`
    el.style.opacity = (0.25 + 0.75 * (z2 + 1) / 2).toFixed(2); el.style.zIndex = String(Math.round((z2 + 1) * 50))
  })
}
function loop() { draw(); raf = requestAnimationFrame(loop) }
function run() { cancelAnimationFrame(raf); if (props.idle) nextTick(draw); else raf = requestAnimationFrame(loop) }          // миниатюра — один кадр
watch(blocks, () => { layout(); nextTick(draw) })
watch(() => props.idle, run)

// ---------- сверка ----------
function light(idx, ai) {
  const s = new Set(ok.value), a = new Set(byAi.value); let first = -1
  for (const i of idx) if (!s.has(i)) { s.add(i); if (ai) a.add(i); if (first < 0) first = i }
  if (first >= 0) { ok.value = s; byAi.value = a; face(first) }
}
let sentWords = 0, busy = false, again = false, coverTm = 0
const wc = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0)
function onText() {
  if (props.edit || props.idle) return
  light(matchLocal(props.text, blocks.value), false)          // мгновенно — дословные совпадения
  clearTimeout(coverTm)
  if (wc(props.text) - sentWords >= 4) coverTm = setTimeout(cover, 2500)          // 4+ новых слова и пауза 2,5 с — по смыслу в Gemini
}
async function cover() {
  if (busy) { again = true; return }
  const text = props.text.trim(); if (!text) return
  busy = true; sentWords = wc(text)
  try { light(await coverBlocks({ id: props.step.id, question: props.step.text || '', blocks: blocks.value, text }), true) } catch { /* статус — в подвале */ }
  finally { busy = false; if (again) { again = false; if (wc(props.text) > sentWords) cover() } }
}
watch(() => props.text, onText)
watch(() => props.done, async (d) => {
  clearInterval(missTm)
  if (!d) { ok.value = new Set(); byAi.value = new Set(); sentWords = 0; netOf(props.step.id).cover = { st: 'off', txt: 'ждёт речь' }; return }
  if (wc(props.text) > sentWords) await cover()          // последняя сверка — по всему ответу
  missTm = setInterval(() => { const m = blocks.value.map((_, i) => i).filter((i) => !ok.value.has(i)); if (m.length) { face(m[missI++ % m.length]); hit.value = -1 } }, 1800)          // по очереди — что не прозвучало
})

// ---------- блоки ----------
const cutting = ref(false), cutErr = ref('')
async function load() {
  if (own.value || props.idle || props.edit) return
  try { const b = await splitBlocks({ id: props.step.id, question: props.step.text || '', ideal: props.step.ideal || '' }); blocks.value = b; fast.value = false; ok.value = new Set(); byAi.value = new Set(); sentWords = 0; onText() }
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

onMounted(() => { layout(); run(); if (!props.idle && !props.edit) { netOf(props.step.id); load() } })
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearTimeout(coverTm); clearInterval(missTm) })
</script>

<template>
  <div class="kball" :class="{ idle }" @pointerdown.stop>
    <div ref="box" class="kbs" aria-hidden="true">
      <span v-for="(b, i) in blocks" :key="i + b.label" :ref="(el) => { els[i] = el }" class="kbw" :class="{ ok: ok.has(i), ai: byAi.has(i), miss: done && !ok.has(i), hit: hit === i }">{{ b.label }}</span>
    </div>
    <div class="kbp" :title="'Процент — доля раскрытых блоков эталона. Зелёные — сказано дословно, с точкой — засчитала Gemini по смыслу'">
      <b>{{ pct }}%</b><span class="kbbar"><i :style="{ width: pct + '%' }" /></span>
      <small>{{ ok.size }} из {{ blocks.length }} блоков<template v-if="fast && !edit"> · {{ idle ? 'пример' : 'нарезаю эталон…' }}</template></small>
    </div>
    <p v-if="done && missing.length" class="kbm"><b>Не прозвучало:</b> {{ missing.join(' · ') }}</p>
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
.kbs { position: relative; height: 210px; overflow: hidden; user-select: none }
.kball.idle .kbs { height: 170px }
.kbw { position: absolute; left: 0; top: 0; padding: 3px 10px; border-radius: 12px; white-space: nowrap; font-size: 14px; font-weight: 700; color: #7b8494; transition: background .3s, color .3s, box-shadow .3s; will-change: transform }
.kbw.ok { background: #e3fbef; color: #128a55 } .kbw.ai::after { content: ' •'; color: #1a73e8 }
.kbw.hit { box-shadow: 0 0 0 2px #2bb34a }
.kbw.miss { background: #fff; color: #b3261e; box-shadow: inset 0 0 0 1.5px #f1c7c7 }
.kbp { display: flex; align-items: center; gap: 10px; margin-top: 2px }
.kbp b { min-width: 52px; font-size: 22px; font-weight: 900; color: #128a55; font-variant-numeric: tabular-nums }
.kbbar { flex: 1; height: 8px; border-radius: 4px; background: #eef0f3; overflow: hidden } .kbbar i { display: block; height: 100%; background: #2bb34a; transition: width .4s }
.kbp small { font-size: 12px; font-weight: 700; color: var(--hint); white-space: nowrap }
.kbm { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: #b3261e; line-height: 1.45 } .kbm b { font-weight: 800 }
.kbe { display: grid; gap: 6px; margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: #f6f8fb } .kbe small { font-size: 12px; font-weight: 600; color: var(--hint) }
.kbb { display: flex; gap: 6px; flex-wrap: wrap }
.kbc { height: 30px; padding: 0 12px; border: 1px solid #d6e4fb; border-radius: 15px; background: #fff; color: #2f6fe0; font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer } .kbc:disabled { opacity: .5; cursor: default }
.kbc.x { border-color: #f1c7c7; color: #b3261e }
.kbm.er { margin: 0 }
@media (prefers-reduced-motion: reduce) { .kbw { transition: none } }
</style>

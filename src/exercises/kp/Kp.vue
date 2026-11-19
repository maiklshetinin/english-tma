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
import { PASS, SYSTEM, bridgeStatus, aiIcon } from '../../utils/ai'
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
const by = computed(() => (checked.value && r.value.site ? { t: 'проверил', sites: [r.value.site] } : null))
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
// вид экрана (19.11.2026): pdf — как домашка (подписи на подложке, без рамок; по умолчанию), lines — тонкие линии между частями,
// cards — мягкие подложки; step.plain — эталон без выделений (просто абзацы). Меняются кнопками в подвале правки
const LOOKS = { pdf: 'PDF', lines: 'линии', cards: 'подложки' }
const look = computed(() => (LOOKS[props.step.look] ? props.step.look : 'pdf'))
function nextLook() { const k = Object.keys(LOOKS), n = k[(k.indexOf(look.value) + 1) % k.length]; if (n === 'pdf') delete props.step.look; else props.step.look = n; ed.changed() }
function toggleMarks() { if (props.step.plain) delete props.step.plain; else props.step.plain = true; ed.changed() }
const mk = (x) => (props.step.plain ? '' : x.k)          // выделения выключены — всё обычным текстом
function toggleStar() { if (props.step.star) delete props.step.star; else props.step.star = true; ed.changed() }

const r = computed(() => p.st.ai)                          // { score, missed, feedback } или { error }
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
const asJson = () => JSON.stringify({ id: props.step.n ?? null, star: !!props.step.star, look: look.value, marks: !props.step.plain, question: props.step.text ?? '', reference: props.step.ideal ?? '', pass_threshold: pass.value, system_prompt: props.step.prompt || SYSTEM }, null, 2)
function jsToggle() { jsOpen.value = !jsOpen.value; if (jsOpen.value) { js.value = asJson(); jsErr.value = '' } }
function jsApply() {
  let o; try { o = JSON.parse(js.value) } catch { jsErr.value = 'Не JSON — проверьте кавычки и запятые'; return }
  if (!o || typeof o !== 'object') { jsErr.value = 'Нужен объект { … }'; return }
  const n = Number(o.pass_threshold), s = props.step
  if (o.pass_threshold != null && !(Number.isInteger(n) && n > 0 && n <= 100)) { jsErr.value = 'pass_threshold — целое от 1 до 100'; return }
  if (typeof o.question === 'string') s.text = o.question
  if (typeof o.reference === 'string') s.ideal = o.reference
  if (o.star === true) s.star = true; else if (o.star === false) delete s.star
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
      </div>
      <div class="kg" :class="checked && tier">
        <svg viewBox="0 0 120 66" role="img" :aria-label="checked ? `Совпадение по смыслу ${r.score} %` : 'Ещё не проверено'">
          <path d="M12 60 A48 48 0 0 1 108 60" class="tr" />
          <path v-if="checked && r.score > 0" :d="arc" class="fl" />
          <path :d="`M${tick[0][0]} ${tick[0][1]} L${tick[1][0]} ${tick[1][1]}`" class="tk" />
          <line x1="60" y1="60" :x2="needle[0]" :y2="needle[1]" class="nd" /><circle cx="60" cy="60" r="5" class="nd" />
        </svg>
        <div class="kgv"><b>{{ p.st.busy ? '…' : checked ? r.score + '%' : '—' }}</b><span :class="checked && 'bdg'">{{ p.st.busy ? 'проверяю' : checked ? tierT[tier] : `зачёт от ${pass}%` }}</span></div>
      </div>
    </div>

    <div class="kl" :class="look"><label :for="'kpa-' + step.id">Ваш ответ</label><span>{{ p.edit ? '' : words }}</span></div>
    <div v-if="p.edit" class="ka ro" title="Тут ученик надиктовывает ответ по-польски">Mikołajki obchodzimy…</div>
    <textarea v-else-if="!p.st.done" :id="'kpa-' + step.id" ref="ta" class="ka" @input="p.st.text = $event.target.value" :readonly="p.st.busy" placeholder="Надиктуйте или напишите ответ по-польски…" @pointerdown.stop @keydown.stop @keyup="sync" @paste="sync" @change="sync" @blur="sync" @focus="sync" />
    <div v-else class="ka done">{{ p.st.text }}</div>

    <div class="kb miss" :class="look">
      <div class="kh"><span class="kht">Не прозвучало<template v-if="checked && r.missed.length"> · {{ r.missed.length }}</template></span>
        <span v-if="by" class="kby">{{ by.t }}<template v-for="s in by.sites" :key="s"><img v-if="aiIcon(s)" :src="aiIcon(s)" alt="" />{{ by.sites.length === 1 ? s : '' }}</template></span></div>
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
  </template>
  <template v-else-if="part === 'fb' && p.st.done && r">
    <small>{{ r.error ? 'Без проверки' : tierT[tier] }}</small><span class="fs">{{ r.error ? 'Сравните свой ответ с эталоном' : r.feedback }}</span>
  </template>
  <template v-else-if="part === 'fb' && !p.st.done && !p.edit && bridge">
    <span class="kbr" :class="{ off: !bridge.online }"><i />{{ bridge.online ? 'Мост подключён' : 'Мост не в сети — проверки не будет' }}<template v-for="s in bridge.sites" :key="s"><img v-if="aiIcon(s)" :src="aiIcon(s)" alt="" />{{ s }}</template></span>
  </template>
  <template v-else-if="part === 'tools'">
    <span class="kjw">
      <ExTool title="Вид экрана: PDF (как в домашке) → линии → подложки" @click="nextLook">Вид: {{ LOOKS[look] }}</ExTool>
      <ExTool :on="!step.plain" title="Выделения в эталоне: оранжевые термины, жирный, курсив — включить / выключить" @click="toggleMarks">Выделения{{ step.plain ? ' выкл' : ' ✓' }}</ExTool>
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
.kst.off { opacity: .28; filter: grayscale(1) } .kst.off:hover { opacity: .6 }
.kg { flex: none; display: flex; align-items: center; gap: 8px; width: 178px }
.kg svg { width: 84px; height: 46px; flex: none; overflow: visible }
.kg .tr { fill: none; stroke: #f0d6ae; stroke-width: 11; stroke-linecap: round }
.kg .fl { fill: none; stroke: #ff9600; stroke-width: 11; stroke-linecap: round } .kg.ok .fl { stroke: #58cc02 } .kg.low .fl { stroke: #ff4b4b }
.kg .tk { stroke: #8a6a48; stroke-width: 1.6 } .kg .nd { stroke: #4b4b4b; fill: #4b4b4b; stroke-width: 3; stroke-linecap: round }
.kgv { display: grid; gap: 3px; font-family: var(--font) } .kgv b { font-size: 24px; font-weight: 800; line-height: 1; color: #4b4b4b }
.kgv span { justify-self: start; font-size: 11.5px; font-weight: 700; color: #6b5a48; white-space: nowrap }
.kgv .bdg { padding: 2px 8px; border-radius: 99px; background: #fff0d0; color: #8a5200 } .ok .kgv .bdg { background: #d7ffb8; color: #3d7a00 } .low .kgv .bdg { background: #ffdfe0; color: #b3261e }
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
.kl.pdf label, .pdf .kht { padding: 2px 10px; border-radius: 7px; background: #f2dab5; font-family: 'PT Serif', Georgia, serif; font-size: 14px; font-style: italic; font-weight: 700; color: #7b4224; text-transform: none; letter-spacing: 0 }
/* Б · тонкие линии между частями */
.kb.lines { padding-top: 12px; border-top: 1px solid #e9cfa6 }
/* В · мягкие подложки; «Не прозвучало» — с оранжевой полоской */
.kb.cards { padding: 10px 13px; border-radius: 12px; background: #fff6e6 } .kb.miss.cards { border-left: 3px solid #cd8a30; border-radius: 0 12px 12px 0 }
.kh { display: flex; align-items: center; gap: 4px; font-family: var(--font); font-size: 12px; font-weight: 800; color: #6b5a48; text-transform: uppercase; letter-spacing: .3px }
.kby { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-weight: 600; text-transform: none; letter-spacing: 0; color: #8a6a48 } .kby img { width: 15px; height: 15px; object-fit: contain }
/* подвал до проверки: с кем мост */
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
}
</style>

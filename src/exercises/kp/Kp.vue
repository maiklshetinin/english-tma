<script setup>
// «Ответ по смыслу» (Karta Polaka, 19.11.2026): вопрос; ученик надиктовывает ответ в поле (своим приложением или микрофоном
// клавиатуры), «Проверить» — чат (ChatGPT / Gemini / Claude) в браузере преподавателя сверяет с эталоном по смыслу через мост (utils/ai.js, server/ai.ts).
// Всё стоит на своих местах с самого начала, после проверки только заполняется — экран не прыгает: спидометр справа от вопроса,
// поле ответа (после проверки — тот же текст на том же месте), «Не прозвучало», «Эталон». Отзыв Gemini — в подвале.
// Вид — как домашка курса: кремовый фон и шрифты Alice / PT Serif. В правке: вопрос и эталон правятся на своих местах,
// а «JSON» в подвале — весь экран текстом: вопрос, эталон, порог и промпт для Gemini (свой у этого экрана; для теста промпта).
import { ref, computed, onMounted } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExText from '../parts/ExText.vue'
import ExTool from '../parts/ExTool.vue'
import { usePlay, useEdit } from '../ctx'
import { PASS, SYSTEM } from '../../utils/ai'
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
const asJson = () => JSON.stringify({ question: props.step.text ?? '', reference: props.step.ideal ?? '', pass_threshold: pass.value, system_prompt: props.step.prompt || SYSTEM }, null, 2)
function jsToggle() { jsOpen.value = !jsOpen.value; if (jsOpen.value) { js.value = asJson(); jsErr.value = '' } }
function jsApply() {
  let o; try { o = JSON.parse(js.value) } catch { jsErr.value = 'Не JSON — проверьте кавычки и запятые'; return }
  if (!o || typeof o !== 'object') { jsErr.value = 'Нужен объект { … }'; return }
  const n = Number(o.pass_threshold), s = props.step
  if (o.pass_threshold != null && !(Number.isInteger(n) && n > 0 && n <= 100)) { jsErr.value = 'pass_threshold — целое от 1 до 100'; return }
  if (typeof o.question === 'string') s.text = o.question
  if (typeof o.reference === 'string') s.ideal = o.reference
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
      <ExText v-model="step.text" tag="b" class="kqt" ph="Kiedy i jak obchodzimy Mikołajki?" multi empty="…" />
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

    <div class="kl"><label :for="'kpa-' + step.id">Ваш ответ</label><span>{{ p.edit ? '' : words }}</span></div>
    <div v-if="p.edit" class="ka ro" title="Тут ученик надиктовывает ответ по-польски">Mikołajki obchodzimy…</div>
    <textarea v-else-if="!p.st.done" :id="'kpa-' + step.id" v-model="p.st.text" class="ka" :readonly="p.st.busy" placeholder="Надиктуйте или напишите ответ по-польски…" @pointerdown.stop @keydown.stop />
    <div v-else class="ka done">{{ p.st.text }}</div>

    <div class="kb miss">
      <div class="kh">Не прозвучало<template v-if="checked && r.missed.length"> · {{ r.missed.length }}</template></div>
      <p v-if="p.edit" class="ph">Пункты от Gemini — после проверки</p>
      <p v-else-if="r?.error" class="ph er">{{ r.error }}</p>
      <ul v-else-if="checked && r.missed.length"><li v-for="(m, k) in r.missed" :key="k">{{ m }}</li></ul>
      <p v-else-if="checked" class="ph">Всё главное прозвучало</p>
      <p v-else class="ph">Появится после проверки</p>
    </div>
    <div class="kb ref">
      <div class="kh">Эталон</div>
      <ExText v-if="p.edit" v-model="step.ideal" tag="p" class="kr" ph="Полный «идеальный» ответ — с ним Gemini сверяет ответ ученика" multi />
      <p v-else-if="p.st.done" class="kr">{{ step.ideal }}</p>
      <p v-else class="ph">Откроется после проверки — не подглядывайте</p>
    </div>
  </template>
  <template v-else-if="part === 'fb' && p.st.done && r">
    <small>{{ r.error ? 'Без проверки' : tierT[tier] }}</small><span class="fs">{{ r.error ? 'Сравните свой ответ с эталоном' : r.feedback }}</span>
  </template>
  <template v-else-if="part === 'tools'">
    <span class="kjw">
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
.kqt { flex: 1; min-width: 0; font-family: 'PT Serif', Georgia, serif; font-size: 21px; font-weight: 400; line-height: 1.3; color: #351a05 }
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
.ka.done { border-color: transparent; white-space: pre-wrap } .ka.ro { color: #a08766; font-style: italic }
.kb { display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; padding: 10px 13px; border: 1px dashed #e3c79c; border-radius: 12px; overflow: auto }
.kb.miss { height: 112px; flex: none } .kb.ref { min-height: 120px }
.kh { font-family: var(--font); font-size: 12px; font-weight: 800; color: #6b5a48; text-transform: uppercase; letter-spacing: .3px }
.kb ul { margin: 0; padding-left: 18px; display: grid; gap: 3px; font-family: 'PT Serif', Georgia, serif; font-size: 15px; line-height: 1.35; color: #351a05 }
.ph { margin: 0; font-family: 'PT Serif', Georgia, serif; font-size: 14.5px; font-style: italic; color: #8a6a48 } .ph.er { color: #b3261e; font-style: normal }
.kr { margin: 0; font-family: 'PT Serif', Georgia, serif; font-size: 15.5px; line-height: 1.55; color: #351a05; white-space: pre-wrap }
/* «JSON» в подвале правки — окошко поверх (окно экрана не растёт) */
.kjw { position: relative; display: inline-flex }
.kj { position: absolute; left: 0; bottom: calc(100% + 12px); z-index: 6; display: grid; gap: 6px; width: 440px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); box-shadow: 0 6px 20px rgba(0, 0, 0, .12); font-family: var(--font) }
.kj small { font-size: 11px; font-weight: 700; color: var(--hint) }
.kjt { height: 260px; padding: 8px; overflow: auto; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace; text-align: left; white-space: pre-wrap; field-sizing: fixed }
.kjb { display: flex; align-items: center; justify-content: flex-end; gap: 6px } .kjb em { margin-right: auto; font-size: 11.5px; font-style: normal; font-weight: 700; color: var(--red-d, #c33) }
.kjg, .kjo { padding: 5px 12px; border: 0; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer } .kjg { background: var(--surface); color: var(--text) } .kjo { background: var(--blue); color: #fff }
@media (min-width: 900px) {
  .lp:not(.embedded):not(.single) .kqt { font-size: 24px }
  .lp:not(.embedded):not(.single) .ka { height: 150px; font-size: 18px }
}
</style>

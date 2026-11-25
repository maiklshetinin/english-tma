<script setup>
// Окно правки JSON — большое, «как в VS Code» (21.11.2026): вместо маленького поля в карточке.
// Номера строк, подсветка, проверка на лету (строка с ошибкой — красным, клик по ошибке — к строке), «Форматировать» (Shift+Alt+F),
// перенос строк вкл/выкл (Alt+Z), справа — «Как собирается» (что уйдёт в чат и в модели) — обновляется, пока печатаете.
// Ctrl+Enter / Ctrl+S — применить, Esc — закрыть (если меняли — спросит). В <body> через Teleport: холст с масштабом не мешает.
// 23.11.2026: schema — «Что принимает» (src/exercises/schema.ts): справа список ключей упражнения с видом и подписью, есть в JSON —
// подсвечен, нет — серым (нажать — вставить с действующим значением); «Применить» не пройдёт с неизвестным ключом, без обязательного
// или с значением не того вида. Ключи, что были в JSON при открытии, — всегда свои. kind — каким должен остаться тип экрана.
// readonly — только посмотреть (экран чужого курса). how — { parts: [{ to, text }], warn: [], own?: [] } или null (нет панели); note — строка над сборкой; error — ошибка от родителя.
import { computed, nextTick, onMounted, ref } from 'vue'
import JsonEdit from './JsonEdit.vue'
import { checkKeys, blankOf } from '../exercises/schema'
import { jsonTheme, flipJsonTheme } from '../utils/jsonTheme.js'
import { TEMPLATES, typeId } from '../utils/lesson'

const props = defineProps({
  modelValue: { type: String, default: '' }, title: { type: String, default: 'JSON' }, sub: { type: String, default: '' },
  how: { type: Object, default: null }, note: { type: String, default: '' }, error: { type: String, default: '' },
  applyText: { type: String, default: 'Применить' }, hint: { type: String, default: '' },
  readonly: { type: Boolean, default: false },          // только посмотреть: без «Применить», поле не правится
  schema: { type: Array, default: null }, kind: { type: String, default: '' },
  tpl: { type: String, default: '' },          // ID шаблона (24.11.2026): строка «тип: talkptt · Разговор · рация · по полям: kind, ptt…» под заголовком
  reqs: { type: Array, default: null },          // «Запрос в API» (24.11.2026, exercises/requests.ts): [{ to, via, body, note?, own? }] — по тексту в поле          // что принимает упражнение (schema.ts)
})
const emit = defineEmits(['update:modelValue', 'apply', 'close'])
// Тип упражнения (24.11.2026): отдельного поля «тип» в JSON нет — приложение узнаёт шаблон по kind и флагам (utils/lesson.ts → tplOf).
// Показываем ID, название и эти поля — чтобы было видно, что это за упражнение и что в JSON его задаёт
const TPL_KEYS = ['kind', 'ptt', 'avatar', 'busuu', 'vn', 'exam', 'dic', 'engine', 'bs', 'lang']
const tplInfo = computed(() => {
  const t = props.tpl && TEMPLATES.find((x) => x.id === props.tpl); if (!t) return null
  let s = {}; try { s = t.make() || {} } catch { /* */ }
  return { id: typeId(t.id), t: t.t, keys: TPL_KEYS.filter((k) => s[k] !== undefined && s[k] !== false).map((k) => (s[k] === true ? k : `${k}: "${s[k]}"`)) }
})
const ed = ref(null), start = props.modelValue
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1' } catch { return d } }
const keep = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* приватный режим */ } }
const wrap = ref(read('tma.jsonWrap', true)), howOn = ref(read('tma.jsonHow', false))
// справа — вкладка: «Что принимает» (keys) или «Как собирается» (how); выбор помнится
const side = ref((() => { try { return localStorage.getItem('tma.jsonSide') || 'keys' } catch { return 'keys' } })())
const sideOf = computed(() => {
  if (side.value === 'none') return ''
  if (side.value === 'how' && props.how) return 'how'
  if (side.value === 'req' && props.reqs) return 'req'
  if (props.schema) return 'keys'
  return props.how && howOn.value ? 'how' : ''
})
function setSide(v) { side.value = v; if (v === 'how') howOn.value = true; try { localStorage.setItem('tma.jsonSide', v) } catch { /* */ } }
const pos = ref({ line: 1, col: 1 })
const text = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })

// 25.11.2026: настоящий перенос строки (Enter, вставленный многострочный промпт) внутри "…" — не ошибка: читаем его как \n,
// а при сохранении и «Форматировать» он сам превращается в \n. Так длинные промпты можно писать и вставлять абзацами
function softNl(t) {
  let out = '', str = false, esc = false
  for (const c of String(t)) {
    if (str) {
      if (esc) { esc = false; out += c; continue }
      if (c === '\\') { esc = true; out += c; continue }
      if (c === '"') { str = false; out += c; continue }
      if (c === '\n') { out += '\\n'; continue }
      if (c === '\r') continue
      if (c === '\t') { out += '\\t'; continue }
      out += c
    } else { if (c === '"') str = true; out += c }
  }
  return out
}
// Проверка на лету: где ошибка — строка и столбец (Chrome: «position N (line L column C)», Firefox: «at line L column C»)
const parsed = computed(() => {
  try { JSON.parse(softNl(text.value)); return { ok: true } } catch (e) {
    const m = String(e.message), lc = m.match(/line (\d+) column (\d+)/)
    let line = lc ? +lc[1] : 0, col = lc ? +lc[2] : 0
    const p = m.match(/position (\d+)/)
    if (!line && p) { const b = text.value.slice(0, +p[1]); line = b.split('\n').length; col = +p[1] - b.lastIndexOf('\n') }
    if (!line && /end of (JSON )?(data|input)/i.test(m)) line = text.value.split('\n').length
    return { ok: false, line, col, msg: m.replace(/^JSON\.parse: /, '').replace(/ in JSON at position \d+.*$/, '') }
  }
})
// понятные причины по-русски (текст ошибки браузера — запасной)
const RU = [[/after property value/, 'после значения нужна запятая или }'], [/after array element/, 'после элемента нужна запятая или ]'],
  [/double-quoted property name/, 'ключ — в двойных кавычках (или лишняя запятая перед })'], [/property name or '\}'/, 'ожидался ключ в кавычках или }'],
  [/end of (JSON )?(data|input)/i, 'JSON обрывается — не хватает } или ]'], [/control character/i, 'внутри строки перенос строки — пишите \\n'],
  [/[Uu]nterminated string/, 'строка не закрыта кавычкой'], [/after JSON/, 'лишний текст после JSON'], [/[Uu]nexpected token|unexpected character/, 'лишний или неверный символ']]
const ruMsg = (m) => RU.find(([r]) => r.test(m))?.[1] ?? m
const dirty = computed(() => text.value !== start)
// ---------- «Запрос в API»: объекты, как уходят по сети, с подсветкой ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function hl(v) {
  const s = esc(JSON.stringify(v, null, 2) ?? '')
  return s.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, (m, str, colon, lit) =>
    str ? (colon ? `<span class="hk">${str}</span>${colon}` : `<span class="hs">${str}</span>`) : lit ? `<span class="hl">${m}</span>` : `<span class="hn">${m}</span>`)
}
const copiedReq = ref(-1)
function copyReq(r, i) { navigator.clipboard?.writeText(JSON.stringify(r.body, null, 2)).then(() => { copiedReq.value = i; setTimeout(() => { if (copiedReq.value === i) copiedReq.value = -1 }, 1500) }).catch(() => {}) }
/** «request.check» у запроса: есть в JSON — перейти к нему; нет — вставить пустым, чтобы дописать свои поля */
function ownReq(name) {
  if (props.readonly || !obj.value || typeof obj.value !== 'object') return
  const o = obj.value, rq = o.request && typeof o.request === 'object' ? o.request : {}
  if (!(name in rq)) text.value = JSON.stringify({ ...o, request: { ...rq, [name]: {} } }, null, 2)
  nextTick(() => { const i = text.value.split('\n').findIndex((l) => l.includes(`"${name}"`)); if (i >= 0) ed.value?.goLine(i + 1) })
}

// ---------- «Что принимает»: ключи упражнения ----------
let first = {}; try { first = JSON.parse(start) ?? {} } catch { /* */ }
const known = computed(() => { if (!props.schema) return null; const s = [...props.schema]; for (const k of Object.keys(first)) if (!s.some((x) => x.key === k)) s.push({ key: k, type: 'any', label: 'было в JSON при открытии' }); return s })
const obj = computed(() => { if (!parsed.value.ok) return null; try { return JSON.parse(softNl(text.value)) } catch { return null } })
const issues = computed(() => (known.value && obj.value ? checkKeys(obj.value, known.value, props.kind || undefined) : []))
const badKeys = computed(() => new Set(issues.value.map((x) => x.key)))
const has = (k) => !!obj.value && typeof obj.value === 'object' && k in obj.value
const tsT = (s) => (s.type === 'kind' ? JSON.stringify(props.kind || 'тип') : s.type === 'select' ? (s.options ?? []).map((o) => JSON.stringify(o)).join(' | ') : { text: 'string', number: 'number', bool: 'boolean', list: '[ … ]', object: '{ … }', file: 'string /* адрес файла */', any: 'any' }[s.type] ?? 'any') + (s.null ? ' | null' : '')
const typeT = (s) => (s.type === 'select' ? (s.options ?? []).join(' | ') : { kind: 'тип экрана', text: 'строка', number: 'число', bool: 'true / false', list: 'список', object: 'объект', file: 'файл (адрес)', any: '' }[s.type] ?? '')
const valT = (v) => { const x = typeof v === 'string' ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : JSON.stringify(v); return x === undefined ? '' : x }
/** нажали на ключ: есть — к его строке; нет — вставить с действующим значением */
function pickKey(s) {
  const line = text.value.split('\n').findIndex((l) => l.trimStart().startsWith(JSON.stringify(s.key) + ':'))
  if (has(s.key)) { if (line >= 0) ed.value?.goLine(line + 1); return }
  if (props.readonly || !obj.value || typeof obj.value !== 'object') return
  text.value = JSON.stringify({ ...obj.value, [s.key]: blankOf(s) }, null, 2)
  nextTick(() => { const l = text.value.split('\n').findIndex((x) => x.trimStart().startsWith(JSON.stringify(s.key) + ':')); if (l >= 0) ed.value?.goLine(l + 1) })
}
function apply() { if (props.readonly || !parsed.value.ok || issues.value.length) return; const f = softNl(text.value); if (f !== text.value) text.value = f; emit('apply') }          // переносы внутри строк — в \n перед сохранением

function fmt() { if (props.readonly) return; if (!parsed.value.ok) { if (parsed.value.line) ed.value?.goLine(parsed.value.line); return } text.value = JSON.stringify(JSON.parse(softNl(text.value)), null, 2) }
function flipWrap() { wrap.value = !wrap.value; keep('tma.jsonWrap', wrap.value) }
function flipHow() { howOn.value = !howOn.value; keep('tma.jsonHow', howOn.value) }
function close() { if (dirty.value && !window.confirm('Закрыть без сохранения? Изменения в JSON пропадут.')) return; emit('close') }
function key(e) {
  const k = e.key.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && (k === 'enter' || k === 's')) { e.preventDefault(); apply() }
  else if (e.shiftKey && e.altKey && (k === 'f' || e.code === 'KeyF')) { e.preventDefault(); fmt() }
  else if (e.altKey && !e.shiftKey && (k === 'z' || e.code === 'KeyZ')) { e.preventDefault(); flipWrap() }
  else if (k === 'escape') { e.preventDefault(); close() }
}
onMounted(() => nextTick(() => ed.value?.focus()))
</script>

<template>
  <Teleport to="body">
    <div class="jm-bg" @pointerdown.self="close" @keydown.stop="key" @keyup.stop @paste.stop @copy.stop @cut.stop @wheel.stop>
      <div class="jm" :class="jsonTheme" role="dialog" aria-modal="true" :aria-label="title">
        <header>
          <div class="jm-t"><b>{{ title }}</b><small v-if="sub">{{ sub }}</small>
            <span v-if="tplInfo" class="jm-tp" title="Отдельного поля «тип» в JSON нет: приложение узнаёт упражнение по этим полям (src/utils/lesson.ts → tplOf). Поменяете их — экран станет другим упражнением. Все ID — tools/make-json.py --list">тип <code>{{ tplInfo.id }}</code> · {{ tplInfo.t }}<template v-if="tplInfo.keys.length"> · задаётся полями <code v-for="k in tplInfo.keys" :key="k">{{ k }}</code></template></span></div>
          <span class="sp" />
          <button class="jb ic" :title="jsonTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'" @click="flipJsonTheme">
            <svg v-if="jsonTheme === 'dark'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
          </button>
          <button class="jb ic x" title="Закрыть (Esc)" @click="close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </header>
        <div class="jm-bar">
          <button v-if="!readonly" class="jb" title="Расставить отступы (Shift+Alt+F)" @click="fmt">Форматировать</button>
          <button class="jb" :class="{ on: wrap }" title="Переносить длинные строки (Alt+Z)" @click="flipWrap">Перенос строк</button>
          <button v-if="schema" class="jb" :class="{ on: sideOf === 'keys' }" title="Какие ключи принимает это упражнение — справа; нажмите на ключ: есть — перейти, нет — вставить" @click="sideOf === 'keys' ? setSide('none') : setSide('keys')">Что принимает</button>
          <button v-if="how" class="jb" :class="{ on: sideOf === 'how' }" title="Что из этого JSON уйдёт в чат и в модели — обновляется, пока печатаете" @click="sideOf === 'how' ? setSide('none') : setSide('how')">Как собирается</button>
          <button v-if="reqs" class="jb" :class="{ on: sideOf === 'req' }" title="Объекты, которые уходят в API, — как их видит программист; пока печатаете — обновляются" @click="sideOf === 'req' ? setSide('none') : setSide('req')">Запрос в API</button>
          <slot name="actions" />
        </div>
        <div class="jm-body" :class="{ split: !!sideOf }">
          <JsonEdit ref="ed" v-model="text" box="jm-ed" :theme="jsonTheme" :wrap="wrap" :bad="parsed.ok ? 0 : parsed.line" :readonly="readonly" aria-label="JSON" @caret="pos = $event" />
          <aside v-if="sideOf === 'keys'" class="jm-how jm-keys">
            <p class="n">Такой объект принимает это упражнение. <b class="kin">Подсвечено</b> — есть в вашем JSON; <span class="kout">серое</span> — можно добавить (нажмите — вставится с текущим значением); <code>?</code> — необязательный.</p>
            <p v-for="x in issues" :key="x.key + x.msg" class="w">✕ {{ x.msg }}</p>
            <div class="kobj">
              <span class="kbr0">{</span>
              <button v-for="s in known" :key="s.key" type="button" class="kline" :class="{ in: has(s.key), bad: badKeys.has(s.key) }" :title="(s.label ? s.label + '\n' : '') + (has(s.key) ? 'Есть в JSON — перейти к строке' : readonly ? '' : 'Вставить' + (s.def !== undefined && s.type !== 'kind' ? ' — сейчас: ' + valT(s.def) : ''))" @click="pickKey(s)">
                <span class="kk">"{{ s.key }}"</span><span v-if="!s.req" class="kq">?</span>: <span class="kty">{{ tsT(s) }}</span>,<span v-if="s.label" class="kc"> // {{ s.label }}</span>
              </button>
              <span class="kbr0">}</span>
            </div>
          </aside>
          <aside v-else-if="sideOf === 'req'" class="jm-how jm-req">
            <p class="n">Ровно эти объекты уходят по сети — собраны из JSON слева. Свои поля — в <code>"request": {{ '{' }} "имя": {{ '{' }} … } }</code>: лягут поверх (вложенное сливается, <code>null</code> — убрать поле). Имя — у каждого запроса справа.</p>
            <p v-if="!obj" class="w">JSON пока не разбирается — показан последний верный</p>
            <section v-for="(r, i) in reqs" :key="i" class="rq">
              <div class="rqh"><b>{{ r.to }}</b>
                <button v-if="r.own" type="button" class="rqo" :class="{ in: !!obj?.request?.[r.own] }" :title="readonly ? 'Свои поля этого запроса — request.' + r.own : obj?.request?.[r.own] ? 'Есть свои поля — перейти' : 'Добавить свои поля этому запросу'" @click="ownReq(r.own)">request.{{ r.own }}</button>
                <button type="button" class="rqc" title="Скопировать объект" @click="copyReq(r, i)">{{ copiedReq === i ? '✓' : 'Копировать' }}</button></div>
              <code class="rqv">{{ r.via }}</code>
              <pre class="rqb" v-html="hl(r.body)" />
              <p v-if="r.note" class="rqn">{{ r.note }}</p>
            </section>
          </aside>
          <aside v-else-if="sideOf === 'how'" class="jm-how">
            <p v-for="w in how.warn" :key="w" class="w">⚠ {{ w }}</p>
            <p v-if="note" class="n">{{ note }}</p>
            <section v-for="pt in how.parts" :key="pt.to"><b>{{ pt.to }}</b><pre>{{ pt.text || '‹пусто›' }}</pre></section>
          </aside>
        </div>
        <footer>
          <button v-if="!parsed.ok" class="st bad" title="Перейти к строке с ошибкой" @click="parsed.line && ed?.goLine(parsed.line)">✕ {{ parsed.line ? 'Строка ' + parsed.line + (parsed.col ? ', столбец ' + parsed.col : '') + ': ' : '' }}{{ ruMsg(parsed.msg) }}</button>
          <span v-else class="st ok">✓ JSON в порядке</span>
          <small v-if="error" class="err">{{ error }}</small>
          <small v-else-if="issues.length" class="err" title="Подробно — справа, «Что принимает»">{{ issues.length === 1 ? issues[0].msg : 'Ключи: ' + issues.length + ' ошибк' + (issues.length < 5 ? 'и' : 'ок') + ' — справа, «Что принимает»' }}</small>
          <span class="sp" />
          <small class="pos">Стр {{ pos.line }}, стлб {{ pos.col }}</small>
        </footer>
        <div class="jm-end">
          <small>{{ readonly ? 'Только просмотр · Esc — закрыть' : hint || 'Ctrl+Enter или Ctrl+S — применить · Esc — закрыть · Tab — отступ · Shift+Alt+F — форматировать' }}</small>
          <span class="sp" />
          <button class="jb" @click="close">{{ readonly ? 'Закрыть' : 'Отмена' }}</button>
          <button v-if="!readonly" class="jb ap" :disabled="!parsed.ok || issues.length > 0" :title="issues.length ? 'Сначала исправьте ключи — справа, «Что принимает»' : ''" @click="apply">{{ applyText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.jm-bg { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; padding: 20px; background: rgba(15, 18, 24, .45); backdrop-filter: blur(2px) }
.jm { width: min(1320px, 100%); height: min(920px, calc(100vh - 40px)); display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; border-radius: 18px; background: #fff; color: #222; box-shadow: 0 24px 80px rgba(0, 0, 0, .35); font-family: inherit; text-align: left }
.jm.dark { background: #252526; color: #ddd }
header { display: flex; align-items: center; gap: 8px } .jm-t { display: grid; gap: 2px; min-width: 0 }
.jm-tp { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 2px; font-size: 12px; font-weight: 700; color: #6b7a99 } .jm-tp code { padding: 1px 6px; border-radius: 5px; background: rgba(75, 141, 248, .12); color: #2f6fe0; font: 700 11.5px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace }
.jm-t b { font-size: 17px; font-weight: 900 } .jm-t small { font-size: 12.5px; color: #8a8f98; font-weight: 600 }
.sp { flex: 1 }
.jm-bar, footer, .jm-end { display: flex; align-items: center; gap: 6px; flex-wrap: wrap }
.jb { flex: none; width: auto; height: auto; border: 0; border-radius: 10px; padding: 7px 12px; background: #f0f1f3; color: #4b4b4b; font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer; white-space: nowrap }
.jb:hover { background: #e6e8eb } .jb.on, .jb.ap { background: #1cb0f6; color: #fff } .jb.ap:hover { background: #0ea0e6 } .jb:disabled { opacity: .45; cursor: default }
.jm.dark .jb { background: #3a3d41; color: #ddd } .jm.dark .jb:hover { background: #45494e } .jm.dark .jb.on, .jm.dark .jb.ap { background: #0e639c; color: #fff }
.jb.ic { display: grid; place-items: center; width: 34px; height: 34px; padding: 0 } .jb.ic svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round }
.jm-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; gap: 10px }
.jm-body.split { grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr) }
.jm-body :deep(.jm-ed) { min-height: 0; height: 100% }
.jm-how { min-height: 0; overflow: auto; display: grid; align-content: start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: #f7f8fa; font-size: 12px }
.jm.dark .jm-how { background: #1e1e1e }
.jm-how section { display: grid; gap: 3px } .jm-how b { font-size: 11.5px; font-weight: 900; color: #777 }
.jm-how pre { margin: 0; padding: 7px 9px; border-radius: 8px; background: #fff; border: 1px solid #eceef1; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; color: inherit }
.jm.dark .jm-how pre { background: #2a2a2a; border-color: #333 }
.jm-how .w { margin: 0; padding: 5px 8px; border-radius: 8px; background: #fff4dc; color: #b45309; font-weight: 800 }
.jm-how .n { margin: 0; color: #8a8f98; font-weight: 600 }
/* «Что принимает» (23.11.2026): объект, как в TypeScript; ключ есть в JSON — подсвечен; нет — серым; с ошибкой — красным */
.jm-keys { gap: 8px; align-content: start }
.kobj { display: grid; padding: 10px 4px; border-radius: 10px; background: #fff; border: 1px solid #eceef1; font: 12.5px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #6b7280 }
.jm.dark .kobj { background: #1e1e1e; border-color: #333; color: #9aa0a6 }
.kbr0 { padding: 0 10px; color: #6b7280; font-weight: 700 }
.kline { display: block; width: 100%; margin: 0; padding: 1px 10px 1px 26px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: left; text-indent: -12px; cursor: pointer }
.kline:hover { background: #f3f4f6 } .jm.dark .kline:hover { background: #2a2a2a }
.kline .kk { color: #9aa0a6 } .kline .kq { color: #9aa0a6 } .kline .kty { color: #a3a3a3 } .kline .kc { color: #b5b9bf; font-style: italic }
.kline.in { background: #eef7ff } .kline.in .kk { color: #0b6bcb; font-weight: 700 } .kline.in .kty { color: #b45309 } .kline.in .kc { color: #8a8f98 }
.jm.dark .kline.in { background: #10314d } .jm.dark .kline.in .kk { color: #7cc4ff } .jm.dark .kline.in .kty { color: #e8b26a }
.kline.bad { background: #fff1f0 } .kline.bad .kk { color: #d92d20 }
.kin { color: #0b6bcb } .kout { color: #9aa0a6 } .jm-keys .n code { font: 700 12px ui-monospace, monospace; color: #6b7280 }
/* «Запрос в API» (24.11.2026): объект с подсветкой, как в редакторе */
.rq { gap: 5px !important; padding-bottom: 6px }
.rqh { display: flex; align-items: center; gap: 6px } .rqh b { flex: 1; min-width: 0 }
.rqo, .rqc { flex: none; border: 0; border-radius: 6px; padding: 2px 7px; background: #eceef1; color: #6b7280; font: 700 11px ui-monospace, monospace; cursor: pointer } .rqc { font-family: inherit }
.rqo.in { background: #e0efff; color: #0b6bcb } .rqo:hover, .rqc:hover { filter: brightness(.95) }
.jm.dark .rqo, .jm.dark .rqc { background: #333; color: #aaa } .jm.dark .rqo.in { background: #10314d; color: #7cc4ff }
.rqv { display: block; padding: 0 2px; color: #8a8f98; font: 600 11px/1.4 ui-monospace, monospace; overflow-wrap: anywhere }
.jm-how pre.rqb { color: #374151 } .jm.dark .jm-how pre.rqb { color: #d4d4d4 }
.rqb :deep(.hk) { color: #0b6bcb } .rqb :deep(.hs) { color: #a3570c } .rqb :deep(.hn) { color: #0e7c5a } .rqb :deep(.hl) { color: #7c3aed }
.jm.dark .rqb :deep(.hk) { color: #9cdcfe } .jm.dark .rqb :deep(.hs) { color: #ce9178 } .jm.dark .rqb :deep(.hn) { color: #b5cea8 } .jm.dark .rqb :deep(.hl) { color: #569cd6 }
.rqn { margin: 0; color: #8a8f98; font-size: 11.5px; font-style: italic }
.jm-req .n code { font: 700 11.5px ui-monospace, monospace; color: #6b7280 }
footer { font-size: 12px; min-height: 22px }
.st { border: 0; background: none; padding: 0; font: inherit; font-weight: 800; text-align: left } .st.ok { color: #3b8a11 } .st.bad { color: #d92d20; cursor: pointer } .st.bad:hover { text-decoration: underline }
.err { color: #d92d20; font-weight: 800 } .pos { color: #8a8f98; font-variant-numeric: tabular-nums }
.jm-end small { font-size: 12px; color: #8a8f98; font-weight: 600 }
@media (max-width: 720px) {
  .jm-bg { padding: 0 } .jm { height: 100%; border-radius: 0; padding: 12px }
  .jm-body.split { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1.3fr) minmax(0, 1fr) }
  .jm-end small, .pos { display: none }
}
</style>

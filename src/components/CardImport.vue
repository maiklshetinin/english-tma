<script setup>
// Импорт карточек из Excel (.xlsx) или CSV/TSV — «всеядный»: столбцы в любом порядке, с заголовками или без, несколько листов.
//  • Каждому столбцу файла — своё поле карточки (Слово, Перевод, Пример, …) или «не брать». Сначала угадываем сами:
//    по заголовку («слово», «translation», «картинка»…) или по содержимому (латиница коротко — слово, кириллица — перевод,
//    длинные фразы — пример и его перевод, ссылки на картинки и <img src='…'> — фото, ссылки на .mp3 — озвучка, номера — не брать).
//  • Справа — карточка так, как её увидит ученик (настоящий StudySession), по нажатию на строку — она.
//  • Фото и озвучка по ссылке остаются ссылками (как Google Диск сейчас); свои файлы можно бросить потом в таблицу — они уйдут в хранилище колоды.
//  • Добавить к колоде (совпадающее слово обновляется, прогресс учеников сохраняется) или заменить все карточки.
import { ref, computed, watch } from 'vue'
import { newId } from '../utils/id'
import { isMediaUrl, imageSrc } from '../utils/media'
import { parseCsv } from '../composables/useSheetImport'
import StudySession from './StudySession.vue'
import AppIcon from './AppIcon.vue'

// auto — сразу добавить в колоду без окна, если всё однозначно (один лист, слово и перевод нашлись, влезает в колоду);
// иначе — показать окно. Что взяли из каких столбцов — уходит в done (колода показывает это полосой с «Отменить»).
const props = defineProps({ deck: { type: Object, required: true }, file: { type: Object, required: true }, auto: Boolean })
const shownDlg = ref(!props.auto)
const emit = defineEmits(['close', 'done'])

const FIELDS = [
  { k: 'front', t: 'Слово', c: '#1cb0f6' }, { k: 'back', t: 'Перевод', c: '#58cc02' }, { k: 'example', t: 'Пример', c: '#ce82ff' },
  { k: 'exampleTr', t: 'Перевод примера', c: '#a560e8' }, { k: 'image', t: 'Фото', c: '#ff9600' }, { k: 'audio', t: 'Озвучка слова', c: '#ff4b4b' },
  { k: 'exampleAudio', t: 'Озвучка примера', c: '#e5484d' },
]
const LIMITS = { cards: 4000, deckBytes: 900_000 }      // как в server/clean.ts (больше сервер не сохранит)
const FT = Object.fromEntries(FIELDS.map(f => [f.k, f]))

// ---------- Чтение файла ----------
const sheets = ref(null), err = ref(''), sheetI = ref(0)
const cell = (v) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/\r/g, '').trim()
async function read() {
  const f = props.file, name = f.name.toLowerCase()
  try {
    if (/\.(csv|tsv|txt)$/.test(name)) sheets.value = [{ sheet: f.name, data: parseCsv(await f.text()) }]
    else if (/\.xlsx$/.test(name)) { const { default: readXlsx } = await import('read-excel-file/browser'); sheets.value = await readXlsx(f) }
    else if (/\.xls$/.test(name)) throw new Error('Старый формат .xls не читается — откройте файл в Excel и сохраните как .xlsx')
    else throw new Error('Нужен файл Excel (.xlsx) или CSV')
    sheets.value = sheets.value.map(s => ({ name: s.sheet, rows: s.data.map(r => r.map(cell)).filter(r => r.some(Boolean)) })).filter(s => s.rows.length)
    if (!sheets.value.length) throw new Error('В файле нет данных')
    sheetI.value = Math.max(0, sheets.value.findIndex(s => s.rows[0]?.length >= 2))
  } catch (e) { err.value = e.message || 'Не удалось прочитать файл' }
}
read().then(() => {
  if (!props.auto || !sheets.value) { shownDlg.value = true; return }
  guess()
  const one = sheets.value.filter(x => x.rows[0]?.length >= 2).length === 1
  if (one && !need.value && !tooBig.value && parsed.value.cards.length) apply()
  else shownDlg.value = true
})

// ---------- Что в какой колонке ----------
const sheet = computed(() => sheets.value?.[sheetI.value])
const width = computed(() => Math.max(0, ...(sheet.value?.rows.slice(0, 200).map(r => r.length) ?? [0])))
const head = ref(false)                 // первая строка — заголовки
const map = ref([])                     // столбец → поле ('' — не брать)
const from = ref(1), to = ref(null)     // какие строки брать (номера строк данных, с 1); пусто — до конца

const IMG = /<img[^>]+src\s*=\s*['"]([^'"]+)['"]/i
const isImgUrl = (s) => IMG.test(s) || /^https:\/\/\S+\.(jpe?g|png|webp|gif|avif)(\?\S*)?$/i.test(s) || /^https:\/\/(drive\.google\.com|lh\d\.googleusercontent\.com)\//.test(s)
const isAudUrl = (s) => /^https:\/\/\S+\.(mp3|m4a|ogg|oga|opus|wav|aac)(\?\S*)?$/i.test(s) || /\[sound:/.test(s)
const cyr = (s) => (s.match(/[а-яё]/gi)?.length ?? 0) / Math.max(1, (s.match(/[a-zа-яё]/gi)?.length ?? 0))
const HEAD = [[/^(слово|слова|word|words|english|англ|term|термин|front|лицо|вопрос)/i, 'front'], [/^(перевод примера|example transl|translation of example|перевод предлож)/i, 'exampleTr'],
  [/^(перевод|translation|russian|рус|значение|meaning|back|оборот|ответ)/i, 'back'], [/^(пример|example|sentence|предложение|контекст)/i, 'example'],
  [/^(фото|картинк|изображ|image|picture|img|photo|рисунок)/i, 'image'], [/^(озвучка примера|example audio|звук примера)/i, 'exampleAudio'], [/^(озвучка|звук|аудио|audio|sound|mp3|произнош)/i, 'audio']]
function guess() {
  const rows = sheet.value?.rows ?? []; if (!rows.length) return
  const first = rows[0], byHead = first.map(h => HEAD.find(([re]) => re.test(h))?.[1] ?? null)
  head.value = byHead.filter(Boolean).length >= 1 && first.every(h => !isImgUrl(h) && h.length < 40)
  const data = rows.slice(head.value ? 1 : 0, 80), out = Array(width.value).fill('')
  const used = new Set()
  const take = (i, k) => { if (!used.has(k) && !out[i]) { out[i] = k; used.add(k); return true } return false }
  if (head.value) byHead.forEach((k, i) => k && take(i, k))
  const stat = [...Array(width.value).keys()].map(i => {
    const v = data.map(r => r[i] ?? '').filter(Boolean), n = v.length || 1
    return { i, n: v.length, img: v.filter(isImgUrl).length / n, aud: v.filter(isAudUrl).length / n, num: v.filter(x => /^[\d.,\s-]+$/.test(x)).length / n,
      url: v.filter(x => /^https?:\/\//.test(x)).length / n, cyr: v.reduce((a, x) => a + cyr(x), 0) / n, words: v.reduce((a, x) => a + x.split(/\s+/).length, 0) / n }
  }).filter(s => s.n && !out[s.i])
  for (const s of stat) if (s.img > 0.5) take(s.i, 'image')
  for (const s of stat) if (s.aud > 0.5) take(s.i, 'audio') || take(s.i, 'exampleAudio')
  const text = stat.filter(s => !out[s.i] && s.num < 0.8 && s.url < 0.5)
  const lat = text.filter(s => s.cyr < 0.3), ru = text.filter(s => s.cyr >= 0.3)
  lat.sort((a, b) => a.words - b.words).forEach((s, j) => take(s.i, s.words < 4 && j === 0 ? 'front' : 'example') || take(s.i, 'example'))
  ru.sort((a, b) => a.words - b.words).forEach((s, j) => take(s.i, s.words < 5 && j === 0 ? 'back' : 'exampleTr') || take(s.i, 'exampleTr'))
  map.value = out
  from.value = 1; to.value = null
}
watch([sheet], guess)
function setField(i, k) {                                  // одно поле — один столбец: если оно уже где-то стоит, там сбрасываем
  map.value = map.value.map((x, j) => (j === i ? k : k && x === k ? '' : x))
}

// ---------- Строки → карточки ----------
const dataRows = computed(() => (sheet.value?.rows ?? []).slice(head.value ? 1 : 0))
const total = computed(() => dataRows.value.length)
const last = computed(() => (to.value > 0 ? Math.min(to.value, total.value) : total.value))
const media = (k, s) => {
  if (!s) return ''
  if (k === 'image') { const m = s.match(IMG); s = m ? m[1] : s }
  if (/\[sound:/.test(s)) return ''                        // озвучка из Anki — файлом, ссылки нет
  s = s.trim(); return isMediaUrl(s) ? s : null              // null — ссылка есть, но не https
}
const parsed = computed(() => {
  const out = [], seen = new Map(); let noPair = 0, bad = 0, dup = 0
  dataRows.value.slice(Math.max(0, from.value - 1), last.value).forEach((r, n) => {
    const c = { row: n + from.value }
    map.value.forEach((k, i) => {
      if (!k) return
      const v = r[i] ?? ''
      if (['image', 'audio', 'exampleAudio'].includes(k)) { const u = media(k, v); if (u === null) bad++; else if (u) c[k] = u }
      else if (v) c[k] = v.slice(0, k === 'front' || k === 'back' ? 300 : 600)
    })
    if (!c.front || !c.back) { noPair++; return }
    const key = c.front.toLowerCase()
    if (seen.has(key)) { dup++; Object.assign(out[seen.get(key)], c); return }
    seen.set(key, out.length); out.push(c)
  })
  return { cards: out, noPair, bad, dup }
})
const existing = computed(() => new Map(props.deck.cards.map(c => [c.front.trim().toLowerCase(), c])))
const updates = computed(() => parsed.value.cards.filter(c => existing.value.has(c.front.toLowerCase())).length)
const mode = ref('add')                   // 'add' — добавить к колоде | 'replace' — заменить все карточки
const resultCount = computed(() => (mode.value === 'replace' ? parsed.value.cards.length : props.deck.cards.length + parsed.value.cards.length - updates.value))
const tooBig = computed(() => {
  if (resultCount.value > LIMITS.cards) return `В колоде может быть до ${LIMITS.cards} карточек, получится ${resultCount.value}. Возьмите часть строк (поля «строки с … по …») или сделайте несколько колод.`
  const bytes = JSON.stringify(parsed.value.cards).length + (mode.value === 'add' ? JSON.stringify(props.deck.cards).length : 0)
  if (bytes > LIMITS.deckBytes * 0.95) return `Колода получится слишком большой (≈${Math.round(bytes / 1024)} КБ из ${Math.round(LIMITS.deckBytes / 1024)}). Возьмите меньше строк или сделайте несколько колод.`
  return ''
})
const need = computed(() => (!map.value.includes('front') ? 'Выберите, в каком столбце слово' : !map.value.includes('back') ? 'Выберите, в каком столбце перевод' : ''))

// ---------- Предпросмотр: карточка как у ученика ----------
const pick = ref(0)
const previewCard = computed(() => { const c = parsed.value.cards[Math.min(pick.value, parsed.value.cards.length - 1)]; return c && { id: 'preview-' + c.row, ...c } })
const previewDeck = computed(() => previewCard.value && { id: 'import-preview', title: props.deck.title, cards: [previewCard.value], newPerDay: 99 })
const pickRow = (rowIndex) => { const n = rowIndex + from.value; const j = parsed.value.cards.findIndex(c => c.row === n); if (j >= 0) pick.value = j }
// Ширина столбцов: своя у каждого, меняется перетаскиванием границы
const defW = (k) => ({ front: 190, back: 230, example: 340, exampleTr: 340, image: 100, audio: 150, exampleAudio: 150 })[k] ?? 120
const colW = ref([])
watch([width, sheetI], () => { colW.value = Array.from({ length: width.value }, (_, i) => defW(map.value[i])) })
watch(map, (m, old) => { m.forEach((k, i) => { if (old && old[i] !== k) colW.value[i] = defW(k) }) })     // сменили поле — подходящая ширина
const rz = ref(null), gridEl = ref(null), gridH = ref(600)       // высота видимой таблицы — на неё рисуем линию границы
function rzStart(e, i) {
  e.preventDefault(); e.stopPropagation()
  rz.value = { i, x: e.clientX, w: colW.value[i] || 160 }
  const move = (ev) => { colW.value[i] = Math.max(60, Math.round(rz.value.w + ev.clientX - rz.value.x)) }
  const up = () => { rz.value = null; removeEventListener('pointermove', move); removeEventListener('pointerup', up); document.body.style.cursor = '' }
  addEventListener('pointermove', move); addEventListener('pointerup', up); document.body.style.cursor = getComputedStyle(e.currentTarget).cursor
}
// Все выбранные строки прокручиваются в одном списке; рисуем порциями по 200 (5000 строк сразу — тормозит), подгружаем при прокрутке
const count = ref(200)
const shown = computed(() => dataRows.value.slice(Math.max(0, from.value - 1), Math.min(last.value, Math.max(0, from.value - 1) + count.value)))
const more = (e) => { const el = e.target; if (el.scrollTop + el.clientHeight > el.scrollHeight - 400) count.value += 200 }
watch([sheetI, from, to], () => { count.value = 200 })
const firstRow = computed(() => (head.value ? sheet.value?.rows[0] : null))
const thumb = (v) => { const m = v.match(IMG); const u = m ? m[1] : v; return isImgUrl(v) ? imageSrc(u) : '' }

// ---------- Готово ----------
const KEYS = ['example', 'exampleTr', 'image', 'audio', 'exampleAudio']
function apply() {
  const cards = props.deck.cards, by = existing.value, removed = []
  if (mode.value === 'replace') {
    const keep = new Set(parsed.value.cards.map(c => c.front.toLowerCase()))
    for (const c of cards) if (!keep.has(c.front.trim().toLowerCase())) removed.push(c)
  }
  const next = mode.value === 'replace' ? [] : cards
  let added = 0, updated = 0
  for (const r of parsed.value.cards) {
    const ex = by.get(r.front.toLowerCase())
    if (ex) {                                                // то же слово — та же карточка (прогресс учеников сохраняется), пустое не стирает
      let ch = ex.back !== r.back; ex.back = r.back
      for (const k of KEYS) if (r[k] && ex[k] !== r[k]) { ex[k] = r[k]; ch = true }
      if (ch) updated++
      if (mode.value === 'replace') next.push(ex)
    } else {
      const c = { id: newId('c'), front: r.front, back: r.back }
      for (const k of KEYS) if (r[k]) c[k] = r[k]
      next.push(c); added++
    }
  }
  if (mode.value === 'replace') props.deck.cards.splice(0, props.deck.cards.length, ...next)
  const L = (i) => String.fromCharCode(65 + (i % 26)).repeat(Math.floor(i / 26) + 1)      // A, B, … Z, AA
  const cols = map.value.map((k, i) => k && `${FT[k].t} ← ${L(i)}`).filter(Boolean)
  emit('done', { added, updated, removed, cols, auto: !shownDlg.value, file: props.file.name, skipped: parsed.value.noPair })
}
</script>

<template>
  <div v-if="shownDlg" class="bg" @click.self="emit('close')">
    <div class="dlg" role="dialog" aria-label="Импорт карточек">
      <header class="hd"><AppIcon name="sheet" :size="22" /><b>Импорт: {{ file.name }}</b><span class="sp" /><button class="x" title="Закрыть" @click="emit('close')">✕</button></header>
      <p v-if="err" class="err">{{ err }}</p>
      <p v-else-if="!sheets" class="hint load">Читаю файл…</p>
      <div v-else class="body">
        <section class="left">
          <div v-if="sheets.length > 1" class="tabs"><span class="lb">Лист:</span>
            <button v-for="(s, i) in sheets" :key="s.name" :class="{ on: sheetI === i }" @click="sheetI = i">{{ s.name }} <small>{{ s.rows.length }}</small></button></div>
          <div class="opts">
            <label class="ck"><input v-model="head" type="checkbox" /> Первая строка — заголовки</label>
            <span class="rng">Строки с <input v-model.number="from" type="number" min="1" :max="total" /> по <input v-model.number="to" type="number" min="0" :max="total" :placeholder="String(total)" /> из {{ total }}</span>
          </div>
          <p class="hint tip">Над каждым столбцом выберите, что в нём. Ненужные — «не брать». Нажмите на строку — справа её карточка.</p>
          <div ref="gridEl" class="grid" :style="{ '--gh': gridH + 'px' }" @scroll.passive="more" @pointerenter="gridH = gridEl.clientHeight">
            <table :style="{ width: colW.reduce((a, b) => a + b, 0) + 'px' }">
              <colgroup><col v-for="i in width" :key="i" :style="{ width: (colW[i - 1] || 160) + 'px' }" /></colgroup>
              <thead>
                <tr><th v-for="i in width" :key="i" :style="map[i - 1] ? { '--c': FT[map[i - 1]].c } : null" :class="{ off: !map[i - 1], rzon: rz?.i === i - 1 }">
                  <select :value="map[i - 1] || ''" @change="setField(i - 1, $event.target.value)">
                    <option value="">— не брать</option><option v-for="f in FIELDS" :key="f.k" :value="f.k">{{ f.t }}</option>
                  </select>
                  <small v-if="firstRow">{{ firstRow[i - 1] }}</small>
                  <!-- Граница столбца: навели — синяя линия во всю высоту (как во Figma), тянем — меняем ширину; двойной щелчок — обычная ширина -->
                  <i class="rz" @pointerdown="rzStart($event, i - 1)" @dblclick="colW[i - 1] = defW(map[i - 1])" />
                </th></tr>
              </thead>
              <tbody>
                <tr v-for="(r, n) in shown" :key="n" :class="{ sel: previewCard && previewCard.row === n + from }" @click="pickRow(n)">
                  <td v-for="i in width" :key="i" :class="{ off: !map[i - 1] }"><span v-if="map[i - 1] === 'image' && thumb(r[i - 1] || '')" class="th" title="Фото по ссылке — останется ссылкой (не копируется в наше хранилище)"><img :src="thumb(r[i - 1])" alt="" loading="lazy" @error="$event.target.style.visibility = 'hidden'" /><i class="lnk"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i></span><span v-else>{{ r[i - 1] }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="sum">
            <span class="ok"><b>{{ parsed.cards.length }}</b> карточек опознано</span>
            <span v-if="updates" class="mid">из них <b>{{ updates }}</b> уже есть в колоде — обновятся</span>
            <span v-if="parsed.noPair" class="warn"><b>{{ parsed.noPair }}</b> строк без слова или перевода — пропущу</span>
            <span v-if="parsed.dup" class="mid"><b>{{ parsed.dup }}</b> повторов слова в файле — объединю</span>
            <span v-if="parsed.bad" class="warn"><b>{{ parsed.bad }}</b> ссылок не https — пропущу</span>
          </div>
        </section>
        <aside class="right">
          <div class="pvh">Так увидит ученик <small v-if="parsed.cards.length">· карточка {{ Math.min(pick, parsed.cards.length - 1) + 1 }} из {{ parsed.cards.length }}</small>
            <span class="nav"><button :disabled="pick <= 0" @click="pick--">‹</button><button :disabled="pick >= parsed.cards.length - 1" @click="pick++">›</button></span></div>
          <div class="pv">
            <StudySession v-if="previewDeck" :key="previewCard.id + JSON.stringify(previewCard)" :deck="previewDeck" user-key="import-preview" @exit="emit('close')" @finish="pick++" />
            <p v-else class="hint">{{ need || 'Нет строк со словом и переводом' }}</p>
          </div>
        </aside>
      </div>
      <footer v-if="sheets" class="ft">
        <div v-if="deck.cards.length" class="seg"><button :class="{ on: mode === 'add' }" @click="mode = 'add'">Добавить к колоде</button><button :class="{ on: mode === 'replace' }" @click="mode = 'replace'">Заменить все карточки</button></div>
        <span v-if="mode === 'replace' && deck.cards.length" class="hint sm">Слова, которых нет в файле, удалятся (у совпадающих прогресс учеников сохранится).</span>
        <span v-if="tooBig" class="warn sm">{{ tooBig }}</span>
        <span class="sp" />
        <button class="btn ghost sm" @click="emit('close')">Отмена</button>
        <button class="btn sm" :disabled="!!need || !parsed.cards.length || !!tooBig" @click="apply">Импортировать {{ parsed.cards.length }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.bg { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 12px; background: rgba(0, 0, 0, .45) }
.dlg { width: 100%; height: 100%; display: grid; grid-template-rows: auto 1fr auto; border-radius: 20px; background: var(--card); box-shadow: 0 20px 60px rgba(0, 0, 0, .3); overflow: hidden }
.hd { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); color: var(--green-d) } .hd b { color: var(--text); font-size: 17px } .sp { flex: 1 }
.x { border: 0; background: none; font-size: 16px; color: var(--hint); cursor: pointer }
.err { margin: 24px; color: var(--red-d); font-weight: 700 } .load { margin: 24px }
.body { display: grid; grid-template-columns: minmax(0, 1fr) 420px; min-height: 0 }
.left { display: flex; flex-direction: column; gap: 10px; padding: 14px 18px; min-height: 0; overflow: hidden }
.right { display: flex; flex-direction: column; gap: 12px; padding: 14px 18px; border-left: 1px solid var(--border); background: #fafafa; overflow: auto }
.tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px } .lb { font-size: 13px; font-weight: 800; color: var(--hint) }
.tabs button { border: 0; border-radius: 9px; padding: 6px 10px; background: var(--surface); font: inherit; font-size: 13px; font-weight: 800; color: var(--hint); cursor: pointer } .tabs button.on { background: var(--blue-l); color: var(--blue) }
.tabs small { opacity: .7 }
.opts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; font-size: 13px; font-weight: 700 }
.ck { display: flex; align-items: center; gap: 6px; cursor: pointer } .ck input { margin: 0; width: 16px; height: 16px }
.rng input { width: 74px; margin: 0 4px; padding: 5px 8px; font-size: 13px; border-width: 1px; border-radius: 8px; display: inline-block }
.tip { margin: 0; font-size: 13px }
.grid { --rzc: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M4.5 16l6-5.5V14h11v-3.5l6 5.5-6 5.5V18h-11v3.5z' fill='%23fff' stroke='%23000' stroke-width='1.2' stroke-linejoin='round'/%3E%3C/svg%3E") 16 16, col-resize; flex: 1; min-height: 160px; overflow: auto; border-radius: 12px; box-shadow: 0 0 0 1px var(--border) }
table { border-collapse: separate; border-spacing: 0; font-size: 13px; table-layout: fixed }
th { position: sticky; top: 0; z-index: 2; padding: 8px 6px; background: var(--card); border-bottom: 3px solid var(--c, var(--border)); text-align: left; vertical-align: top }
/* Ручка ширины: тонкая зона на правой границе; линия — во всю высоту таблицы, синяя при наведении и пока тянем */
.rz { position: absolute; top: 0; right: 0; width: 9px; height: var(--gh, 400px); z-index: 3; cursor: var(--rzc) }
.rz::after { content: ''; position: absolute; right: 0; top: 0; bottom: 0; width: 2px; background: transparent }
.rz:hover::after, th.rzon .rz::after { background: #0d99ff }
th select { width: 100%; margin: 0; padding: 6px 8px; border: 0; border-radius: 8px; background: color-mix(in srgb, var(--c, #999) 16%, white); color: var(--c, var(--hint)); font: inherit; font-size: 13px; font-weight: 900; cursor: pointer }
th.off select { background: var(--surface); color: var(--hint-2); font-weight: 700 }
th small { display: block; margin-top: 4px; font-size: 11px; color: var(--hint); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
th select { text-overflow: ellipsis }
td { padding: 6px 8px; border-bottom: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer }
td.off { color: var(--hint-2); background: repeating-linear-gradient(45deg, transparent 0 6px, rgba(0, 0, 0, .025) 6px 12px) }
td img { width: 54px; height: 36px; object-fit: cover; border-radius: 6px; display: block }
.th { position: relative; display: inline-block; vertical-align: middle; margin: 2px 0 2px 6px }
.lnk { position: absolute; left: -6px; bottom: -4px; display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; background: var(--card); color: var(--blue); box-shadow: 0 1px 4px rgba(0, 0, 0, .3); font-style: normal }
tr:hover td { background: #f6f9fc } tr.sel td { background: var(--blue-l) }
.sum { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; font-weight: 700 }
.ok { color: var(--green-d) } .mid { color: var(--hint) } .warn { color: #b26b00 }
.pvh { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 900; color: var(--hint); text-transform: uppercase; letter-spacing: .3px } .pvh small { text-transform: none; letter-spacing: 0; font-weight: 700 }
.nav { margin-left: auto; display: flex; gap: 4px } .nav button { width: 30px; height: 30px; border: 0; border-radius: 50%; background: var(--surface); font-size: 18px; font-weight: 900; color: var(--text); cursor: pointer } .nav button:disabled { opacity: .35; cursor: default }
.pv { padding: 14px; border-radius: 16px; background: var(--card); box-shadow: 0 0 0 1px var(--border) }
.pv :deep(.bar), .pv :deep(.dc) { display: none }      /* как у ученика, но без шапки и графика колоды */
.ft { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--border) }
.seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--surface) }
.seg button { border: 0; border-radius: 9px; padding: 6px 12px; background: none; font: inherit; font-size: 13px; font-weight: 800; color: var(--hint); cursor: pointer } .seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.sm { font-size: 12px }
@media (max-width: 900px) { .body { grid-template-columns: 1fr; overflow: auto } .left { overflow: visible } .right { border-left: 0; border-top: 1px solid var(--border) } }
</style>

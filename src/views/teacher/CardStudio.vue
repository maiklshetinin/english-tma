<script setup>
// Таблица карточек колоды (у преподавателя — по кнопке ≡ у колоды): каждое поле — столбец, сверху — сколько заполнено.
//  • Текст правится прямо в ячейках; колода сохраняется сама (stores/decks → PUT /decks/<id>).
//  • Фото и озвучка — перетаскиванием: файл на строку слова (или в нужную ячейку) или пачку на таблицу (раскладываются по имени файла:
//    apple.jpg → фото «apple», apple.mp3 → озвучка слова, apple_ex.mp3 → озвучка примера). Или нажать и выбрать файл.
//  • Фото строго 450×300 (3:2 — как место под фото у ученика): обрезаем по центру, WebP ≤ 40 КБ. Меньше 450×300 — не берём.
//  • Файлы — в S3 (server/storage.ts, папка колоды); в карточке — ссылка ${API}/media/f/<ключ>, её открывают и ученики.
//    Без сервера (демо) файлы остаются ссылками в памяти браузера.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDecksStore } from '../../stores/decks'
import { useStudentsStore } from '../../stores/students'
import { srsOf, kindOf } from '../../composables/useSrs'
import { relDay } from '../../utils/dates'
import { isDemo } from '../../firebase'
import { audioSrc } from '../../utils/media'
import { newId } from '../../utils/id'
import { showToast } from '../../composables/useToast'
import AppIcon from '../../components/AppIcon.vue'
import CardImport from '../../components/CardImport.vue'
import DeckSheet from '../../components/DeckSheet.vue'
import AudioWave from '../../components/AudioWave.vue'
import CardEditModal from '../../components/CardEditModal.vue'
import { useCardMedia, isImg, isAud, isLink, audSrc, imgSrc, forget, removeCard } from '../../composables/useCardMedia'
import { fetchSheetCsv } from '../../composables/useSheetImport'

const route = useRoute(), router = useRouter()
const decks = useDecksStore()
const deck = computed(() => decks.byId(route.query.id) ?? (isDemo ? decks.list[0] : undefined))
// Настройки колоды (название, кому назначена, новых в день, удаление) — та же шторка, что была в списке колод
const settings = ref(false)
const closeSettings = () => { settings.value = false; if (!decks.byId(route.query.id) && !isDemo) back() }
const cards = computed(() => deck.value?.cards ?? [])
const FIELDS = [
  { k: 'front', t: 'Слово', kind: 'text', need: true }, { k: 'back', t: 'Перевод', kind: 'text', need: true },
  { k: 'example', t: 'Пример', kind: 'text' }, { k: 'exampleTr', t: 'Перевод примера', kind: 'text' },
  { k: 'image', t: 'Фото', kind: 'image' }, { k: 'audio', t: 'Озвучка слова', kind: 'audio' }, { k: 'exampleAudio', t: 'Озвучка примера', kind: 'audio' },
]
// Слово и перевод — в одной ячейке (сверху слово, снизу перевод), пример и его перевод — во второй; дальше фото и озвучка
const COLS = [
  { ...FIELDS[4], short: 'Фото' },
  { k: 'w', kind: 'pair', short: 'Слово', pair: [FIELDS[0], FIELDS[1]], snd: 'audio' },
  { k: 'e', kind: 'pair', short: 'Пример', pair: [FIELDS[2], FIELDS[3]] },
]
const filled = (k) => cards.value.filter(c => c[k]).length
const q = ref('')
const shown = computed(() => { const k = q.value.trim().toLowerCase(); return cards.value.filter(c => !k || `${c.front} ${c.back}`.toLowerCase().includes(k)) })
const report = ref(null)            // итог броска пачки файлов

const { busy, info, attach, clearField } = useCardMedia(() => deck.value)
/** Ссылка на чужой сайт (Google Диск, britlex…) — не наш файл в хранилище и не только что выбранный */
const impOpen = ref(false)
const menu = ref('')          // у какой карточки открыто меню фото
const closeMenu = () => { menu.value = ''; impOpen.value = false }
const menuPos = ref({})
function openMenu(e, c) {        // меню у фото: поверх всего (fixed), у нижнего края экрана — вверх
  if (menu.value === c.id) return closeMenu()
  const r = e.currentTarget.getBoundingClientRect(), up = innerHeight - r.bottom < 230
  menuPos.value = { left: Math.min(r.left, innerWidth - 240) + 'px', ...(up ? { bottom: innerHeight - r.top + 6 + 'px' } : { top: r.bottom + 6 + 'px' }) }
  menu.value = c.id
}
onMounted(() => addEventListener('click', closeMenu)); onUnmounted(() => removeEventListener('click', closeMenu))

// ---------- Перетаскивание ----------
const wordOf = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+\d+$/, '').trim()
const EX = /[_\- ](ex|example|пример)$/i
function placeOf(f) {          // apple_ex.mp3 → { word: 'apple', ex: true }
  const raw = f.name.replace(/\.[^.]+$/, '')
  return { word: wordOf(raw.replace(EX, '') + '.x').toLowerCase(), ex: EX.test(raw) }
}
async function dropOnTable(files) {
  const r = { image: 0, audio: 0, exampleAudio: 0, miss: [], fail: 0 }
  report.value = { ...r, busy: true }
  await Promise.all(files.filter(f => isImg(f) || isAud(f)).map(async (f) => {
    const { word, ex } = placeOf(f), c = cards.value.find(x => x.front.trim().toLowerCase() === word)
    if (!c) { r.miss.push(f); return }
    const k = isImg(f) ? 'image' : ex ? 'exampleAudio' : 'audio'
    if (await attach(c, k, f)) r[k]++; else r.fail++
  }))
  report.value = r
}
async function createMissing() {
  const fs = report.value.miss; report.value = null
  for (const f of fs) {
    const { word } = placeOf(f)
    if (!cards.value.some(x => x.front.trim().toLowerCase() === word)) deck.value.cards.unshift({ id: newId('c'), front: word, back: '' })
  }
  await dropOnTable(fs)
}
const over = ref(false), overCell = ref('')
let leaveT = 0
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
const overSheet = ref(false)           // тащат таблицу (Excel / CSV), а не фото и звук — другая подсказка
function dragOver(e) {
  if (!hasFiles(e)) return; e.preventDefault(); clearTimeout(leaveT); over.value = true; overRow.value = ''; overCell.value = ''
  overSheet.value = [...(e.dataTransfer?.items ?? [])].some(i => /sheet|excel|csv|tab-separated/.test(i.type))
}
function dragLeave() { clearTimeout(leaveT); leaveT = setTimeout(() => { over.value = false; overCell.value = ''; overRow.value = '' }, 80) }
async function drop(e) {
  e.preventDefault(); over.value = false
  const sheet = [...(e.dataTransfer?.files ?? [])].find(isSheet)
  if (sheet) startImport(sheet)                                      // в список можно бросить только таблицу Excel / CSV; фото и звук — в карточке
  else showToast('Фото и звук добавляются в карточке: нажмите на слово и перетащите файл на неё', null, 'bad')
}
// Файл на строку: на ячейку фото / звука — в неё; на слово, перевод и т.п. — в эту карточку: фото → «Фото», звук → «Озвучка слова».
// Можно бросить сразу фото и звук. Имя файла тут не важно.
const overRow = ref('')
const overRowCard = computed(() => cards.value.find(c => c.id === overRow.value))
function cellOver(e, c, f) { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); clearTimeout(leaveT); overCell.value = f.kind === 'pair' ? '' : c.id + f.k; overRow.value = c.id; over.value = true; overSheet.value = [...(e.dataTransfer?.items ?? [])].some(i => /sheet|excel|csv|tab-separated/.test(i.type)) }
async function dropCell(e, c, f) {
  e.preventDefault(); e.stopPropagation(); overCell.value = ''; overRow.value = ''; over.value = false
  const files = [...(e.dataTransfer?.files ?? [])]; if (!files.length) return
  let used = false
  for (const file of files.slice(0, 3)) {
    const k = isImg(file) ? 'image' : isAud(file) ? (f.k === 'exampleAudio' || f.snd === 'exampleAudio' ? 'exampleAudio' : 'audio') : null
    if (!k) continue
    if (f.kind !== 'pair' && (f.kind === 'image') !== (k === 'image')) { showToast(f.kind === 'image' ? 'Сюда — фото (JPG, PNG, WebP)' : 'Сюда — звук (MP3, M4A, OGG, WAV)', null, 'bad'); continue }
    used = true; await attach(c, k, file)
  }
  if (!used && (f.kind === 'text' || f.kind === 'pair')) showToast('Можно бросить фото (JPG, PNG, WebP) или звук (MP3, M4A, OGG, WAV)', null, 'bad')
}
// Выбрать файл кнопкой
const pick = ref(null); let pickTo = null
function choose(c, f) { pickTo = { c, k: f.k }; pick.value.accept = f.kind === 'image' ? 'image/*' : 'audio/*'; pick.value.value = ''; pick.value.click() }
async function picked(e) { const file = e.target.files?.[0]; if (file && pickTo) await attach(pickTo.c, pickTo.k, file) }

// ---------- Импорт из Excel / CSV (окно CardImport) ----------
const isSheet = (f) => /\.(xlsx|xls|csv|tsv)$/i.test(f.name)
// Бросили таблицу — сразу в колоду (столбцы угадываются сами), сверху полоса: что откуда взяли, «Отменить», «Поменять столбцы».
// Окно с выбором столбцов — только если не всё однозначно (несколько листов, не нашлись слово/перевод, не влезает в колоду) или по «Поменять столбцы».
const importFile = ref(null), importAuto = ref(true), sheetPick = ref(null), lastImport = ref(null)
let snapshot = null
const startImport = (f, auto = true) => { snapshot = JSON.parse(JSON.stringify(deck.value.cards)); importAuto.value = auto; lastImport.value = null; importFile.value = f }
function chooseSheet() { sheetPick.value.value = ''; sheetPick.value.click() }
function imported(r) {
  const file = importFile.value; importFile.value = null
  for (const c of r.removed) for (const k of ['image', 'audio', 'exampleAudio']) forget(c[k])     // замена колоды: файлы удалённых карточек — из хранилища
  lastImport.value = { ...r, fileObj: file, snapshot }
}
function undoImport() { const s = lastImport.value?.snapshot; if (s) deck.value.cards.splice(0, deck.value.cards.length, ...s); lastImport.value = null }
function remapImport() { const f = lastImport.value?.fileObj; undoImport(); if (f) startImport(f, false) }
// Google Таблица по ссылке: сервер забирает её как CSV (GET /sheets/csv; у таблицы должен быть доступ «Все, у кого есть ссылка»),
// дальше — то же окно импорта. Берётся лист из ссылки (#gid=…), без него — первый.
const gBusy = ref(false)
async function fromGoogle() {
  const url = prompt('Ссылка на Google Таблицу (лист — тот, что открыт по ссылке)', '')?.trim(); if (!url) return
  if (!/docs\.google\.com\/spreadsheets\/d\//.test(url)) return showToast('Это не похоже на ссылку Google Таблицы', null, 'bad')
  gBusy.value = true
  try { startImport(new File([await fetchSheetCsv(url)], 'Google Таблица.csv', { type: 'text/csv' })) }
  catch (e) { showToast(e.message, null, 'bad') }
  finally { gBusy.value = false }
}
// Фото по ссылке (если файла нет под рукой): любая https-ссылка, как из Google Диска
function linkPhoto(c) {
  const u = prompt('Ссылка на фото (https://…)', isLink(c.image) ? c.image : '')?.trim(); if (!u) return
  if (!/^https:\/\//i.test(u)) return showToast('Нужна ссылка, которая начинается с https://', null, 'bad')
  const old = c.image; c.image = u; if (old) forget(old)
}
// Большие колоды: показываем строки порциями, чтобы таблица не тормозила
const limit = ref(300)

let au = null
const play = (u) => { try { au?.pause(); au = new Audio(u.startsWith('blob:') ? u : audioSrc(u)); au.play().catch(() => showToast('Звук не открылся', null, 'bad')) } catch { /* — */ } }
const src = imgSrc
onUnmounted(() => { au?.pause() })

// ---------- Строки ----------
// Правка текста — не в самих ячейках, а в небольшой форме под строкой (нажали на слово / пример)
// Карточка для правки — компактная, похожа на карточку ученика: текст правится прямо на ней, фото и звук — бросить / выбрать / записать.
// ‹ › (или ← → вне полей) — соседние карточки, Esc — закрыть
const edit = ref('')
const ec = computed(() => cards.value.find(c => c.id === edit.value))
function openEdit(c, k = '') { edit.value = c.id; if (k) setTimeout(() => document.querySelector(`.ce [data-k="${k}"]`)?.focus(), 30) }
function addCard() { const n = { id: newId('c'), front: '', back: '' }; deck.value.cards.unshift(n); q.value = ''; openEdit(n, 'front') }
function delCard(c) { removeCard(deck.value, c) }
// ---------- Статистика по карточке: кто из учеников её учит и когда повтор ----------
const studentsStore = useStudentsStore()
const learners = computed(() => (deck.value?.forAll ? studentsStore.list : studentsStore.list.filter(x => deck.value?.assigned.includes(x.id))))
const dayLabel = (d) => { const r = relDay(d); return r === 'Прошло' ? 'пора повторить' : r.toLowerCase() }
function statsOf(c) {
  const bars = []; let lapses = 0, next = ''
  for (const st of learners.value) {
    const s = srsOf(st.id, c); if (!s) continue
    const k = kindOf(s), iv = s.interval || 0
    lapses += s.lapses || 0
    if (s.due && (!next || s.due < next)) next = s.due
    bars.push({ id: st.id, h: Math.max(12, Math.min(100, Math.log2(iv + 1) / Math.log2(61) * 100)), cls: k === 'review' ? (iv >= 21 ? 'mature' : 'rev') : 'lrn',
      title: `${st.name}: ${k === 'learn' ? 'учит (шаги)' : `интервал ${iv} дн.`}${s.due ? ', повтор — ' + dayLabel(s.due) : ''}${s.lapses ? `, ошибок ${s.lapses}` : ''}` })
  }
  return { n: bars.length, bars, lapses, next: next ? 'повтор: ' + dayLabel(next) : '' }
}
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'карточка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'карточки' : 'карточек')
const back = () => router.push({ name: 'words' })
</script>

<template>
  <div class="page wide st" @dragleave="dragLeave">
    <input ref="pick" type="file" hidden @change="picked" />
    <header class="bar">
      <button class="bk" @click="back"><AppIcon name="back" :size="20" /> Колоды</button>
      <template v-if="deck"><i class="vs" /><b class="dt">{{ deck.title }}</b><span class="cnt">{{ cards.length }} {{ word(cards.length) }}</span></template>
      <span class="sp" />
      <label v-if="deck && cards.length > 15" class="search"><AppIcon name="search" :size="16" /><input v-model="q" placeholder="Найти слово" /></label>
      <span v-if="deck" class="imx"><button class="ghostb" :disabled="gBusy" @click.stop="impOpen = !impOpen">{{ gBusy ? 'Загружаю…' : 'Импорт' }} ▾</button>
        <span v-if="impOpen" class="pm down" @click.stop><button @click="impOpen = false; chooseSheet()">Файл Excel или CSV</button><button @click="impOpen = false; fromGoogle()">Google Таблица по ссылке</button>
          <small>Или просто перетащите файл на таблицу</small></span></span>
      <button v-if="deck" class="icon-btn" aria-label="Настройки колоды" title="Настройки: название, кому назначена, новых в день" @click="settings = true"><AppIcon name="sliders" :size="18" /></button>
      <button v-if="deck" class="btn sm" @click="addCard"><AppIcon name="plus" :size="16" /> Карточка</button>
      <input ref="sheetPick" type="file" hidden accept=".xlsx,.xls,.csv,.tsv" @change="$event.target.files[0] && startImport($event.target.files[0])" />
    </header>

    <div v-if="!deck" class="none"><b>Колода не найдена</b><button class="btn sm" @click="back">К колодам</button></div>
    <section v-else class="wrap" :class="{ over }" @dragover="dragOver" @drop="drop">
      <!-- Тащат файлы над таблицей — подсвечиваем всю область и говорим, что будет -->
      <div v-if="over" class="dropov"><div class="pill"><AppIcon name="download" :size="22" />
        <span v-if="overSheet"><b>Отпустите — карточки добавятся в колоду</b>столбцы угадаю сам, если что — «Поменять столбцы»</span>
        <span v-else><b>Сюда — только таблица Excel</b>фото и звук добавляются в карточке: нажмите на слово</span></div></div>
      <div v-if="lastImport" class="rep imp">
        <span>Добавлено <b>{{ lastImport.added }}</b><template v-if="lastImport.updated">, обновлено <b>{{ lastImport.updated }}</b></template> из «{{ lastImport.file }}»</span>
        <button class="lnkb" :title="lastImport.cols.join(' · ')" @click="remapImport">Не те столбцы?</button><button class="lnkb" @click="undoImport">Отменить</button>
        <button class="x" title="Скрыть" @click="lastImport = null">✕</button>
      </div>
      <div v-if="report" class="rep" :class="{ warn: report.miss?.length || report.fail }">
        <span v-if="report.busy">Загружаю…</span>
        <template v-else>
          <span>Прикреплено: <b>{{ report.image }}</b> фото, <b>{{ report.audio }}</b> озвучек слов, <b>{{ report.exampleAudio }}</b> озвучек примеров.</span>
          <span v-if="report.fail">Не загрузились: {{ report.fail }} (причина — во всплывающем сообщении).</span>
          <span v-if="report.miss.length">Не нашли слово для {{ report.miss.length }}: <i v-for="f in report.miss.slice(0, 5)" :key="f.name">{{ f.name }}</i><template v-if="report.miss.length > 5">…</template>
            <button class="mini" @click="createMissing">Создать карточки</button></span>
          <button class="x" @click="report = null">✕</button>
        </template>
      </div>
      <div class="tbl" @scroll.passive="closeMenu">
        <table>
          <thead><tr><th class="n" />
            <th v-for="col in COLS" :key="col.k" :class="col.kind">
              <span class="hd1">{{ col.short }}</span><small v-for="f in (col.pair || [])" :key="f.k" v-show="f.need && filled(f.k) < cards.length" class="miss"> · без {{ f.k === 'front' ? 'слова' : 'перевода' }}: {{ cards.length - filled(f.k) }}</small></th>
            <th class="stc" title="Столбик — ученик, который учит карточку: чем выше, тем дольше до повтора. Розовый — ещё запоминает, зелёный — повторяет, тёмно-зелёный — выучил (21+ дн.)"><span class="hd1">Ученики</span></th><th class="act" /></tr></thead>
          <!-- Список — только смотреть: нажали на строку — карточка-редактор; в строке можно лишь послушать звук и удалить -->
          <tbody>
            <tr v-for="(c, i) in shown.slice(0, limit)" :key="c.id" class="crow" :class="{ bad: !c.front || !c.back, off: c.suspended, editing: edit === c.id }" title="Открыть карточку" @click="openEdit(c)">
              <td class="n">{{ i + 1 }}</td>
              <td v-for="f in COLS" :key="f.k" :class="[f.kind, 'c-' + f.k]">
                <div v-if="f.kind === 'pair'" class="two">
                  <span class="t1" :class="{ ph: !c[f.pair[0].k], miss: f.pair[0].need && !c[f.pair[0].k] }">{{ c[f.pair[0].k] || (f.pair[0].need ? 'нет слова' : '') }}<em v-if="f.k === 'e' && c.exampleAudio" class="ea" title="У примера есть звук">🔊</em></span>
                  <span class="t2" :class="[f.k, { ph: !c[f.pair[1].k], miss: f.pair[1].need && !c[f.pair[1].k] }]">{{ c[f.pair[1].k] || (f.pair[1].need ? 'нет перевода' : '') }}</span>
                  <!-- звук слова — под переводом -->
                  <span v-if="f.snd && busy[c.id + f.snd] != null" class="up wvup"><i :style="{ '--p': busy[c.id + f.snd] }" />{{ busy[c.id + f.snd] }}%</span>
                  <span v-else-if="f.snd && c[f.snd]" class="wvrow"><AudioWave :src="audSrc(c[f.snd])" :meta="c[f.snd + 'Meta'] || ''" small @meta="c[f.snd + 'Meta'] = $event" /></span>
                </div>
                <template v-else-if="f.kind === 'aud'">
                  <span v-if="busy[c.id + f.snd] != null" class="up wvup"><i :style="{ '--p': busy[c.id + f.snd] }" />{{ busy[c.id + f.snd] }}%</span>
                  <div v-else-if="c[f.snd]" class="wvrow"><AudioWave :src="audSrc(c[f.snd])" :meta="c[f.snd + 'Meta'] || ''" small @meta="c[f.snd + 'Meta'] = $event" />
                    <i v-if="isLink(c[f.snd])" class="lnk inl" title="Звук по ссылке"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i></div>
                </template>
                <span v-else-if="f.kind === 'image'" class="cell">
                  <span v-if="busy[c.id + 'image'] != null" class="up"><i :style="{ '--p': busy[c.id + 'image'] }" /></span>
                  <template v-else-if="c.image"><img :src="src(c.image)" alt="" /><i v-if="isLink(c.image)" class="lnk" title="Фото по ссылке"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i></template>
                  <i v-else class="noph" />
                </span>
              </td>
              <!-- Как карточку учат ученики (как график активности у репозиториев GitHub): столбик на ученика — высота = через сколько дней повтор -->
              <td class="stc"><template v-for="st in [statsOf(c)]" :key="0">
                <span v-if="!st.n" class="sx">{{ learners.length ? 'ещё не начали' : '' }}</span>
                <template v-else><span class="sx"><b>{{ st.n }}</b> из {{ learners.length }} учат<template v-if="st.lapses"> · <em>ошибок {{ st.lapses }}</em></template></span>
                  <span class="spark"><i v-for="b in st.bars" :key="b.id" :class="b.cls" :style="{ height: b.h + '%' }" :title="b.title" /></span>
                  <span class="sx">{{ st.next }}</span></template>
              </template></td>
              <td class="act"><span v-if="c.suspended" class="hid" title="Скрыта от учеников">скрыта</span><button class="icon-btn danger" title="Удалить карточку" aria-label="Удалить карточку" @click.stop="delCard(c)"><AppIcon name="trash" :size="18" /></button></td>
            </tr>
          </tbody>
        </table>
        <button v-if="shown.length > limit" class="more" @click="limit += 300">Показать ещё {{ Math.min(300, shown.length - limit) }} из {{ shown.length - limit }}</button>
        <p v-if="!cards.length" class="empty">Карточек пока нет. Бросьте сюда таблицу Excel, нажмите «+ Карточка» или бросьте фото и аудио — слово возьмётся из имени файла.</p>
      </div>
    </section>
    <!-- Окно правки карточки — общий компонент (components/CardEditModal.vue) -->
    <CardEditModal v-if="edit && deck" v-model="edit" :deck="deck" :list="shown" />
    <CardImport v-if="importFile && deck" :key="importFile.name + importAuto" :deck="deck" :file="importFile" :auto="importAuto" @close="importFile = null" @done="imported" />
    <DeckSheet v-if="settings && deck" :deck="deck" @close="closeSettings" />
  </div>
</template>

<style scoped>
/* Обычная страница приложения — та же ширина, что у списка колод (.page.wide), меню слева остаётся */
.st { gap: 12px }
.bar { display: flex; align-items: center; gap: 10px }
@media (min-width: 720px) { .bar { padding-right: max(0px, calc(150px - (100vw - 920px) / 2)) } }      /* не уезжать под кружки «кто здесь» справа сверху */
.bk { display: flex; align-items: center; gap: 2px; border: 0; background: none; font: inherit; font-weight: 800; color: var(--text); cursor: pointer; padding: 6px 8px; border-radius: 10px } .bk:hover { background: var(--surface) }
.vs { width: 1px; height: 22px; background: var(--border) } .dt { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .cnt { color: var(--hint); font-size: 13px; font-weight: 700; white-space: nowrap } .sp { flex: 1 }
.search { display: flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 10px; background: var(--surface); color: var(--hint); width: 200px } .search input { margin: 0; border: 0; background: none; padding: 8px 0; font-size: 14px; min-width: 0 }
.none { display: grid; justify-items: center; align-content: center; gap: 12px }
.wrap { display: flex; flex-direction: column; gap: 10px; min-height: 300px; transition: background .12s }
.wrap { position: relative }
.dropov { position: absolute; inset: -6px; z-index: 5; border: 3px dashed var(--blue); border-radius: 18px; background: rgba(28, 176, 246, .07); pointer-events: none }
.pill { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-radius: 16px; background: var(--blue); color: #fff; box-shadow: 0 10px 30px rgba(28, 176, 246, .35); white-space: nowrap }
.pill span { display: grid; font-size: 13px; font-weight: 700; opacity: .95 } .pill b { font-size: 16px; font-weight: 900 }
.tip { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border: 2px dashed var(--border); border-radius: 14px; background: var(--card); color: var(--hint); font-size: 13px }
.tip b { color: var(--text) } .tip i, .rep i { font-style: normal; color: var(--blue); font-weight: 700; margin-right: 4px }
.rep { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 10px 14px; border-radius: 12px; background: var(--green-l); color: var(--green-d); font-size: 13px; font-weight: 600 }
.rep.imp { background: var(--blue-l); color: #136d99 } .rep .cols { font-weight: 800; color: var(--blue) }
.rep.warn { background: #fff4d6; color: #8a5b00 } .rep .x { margin-left: auto; border: 0; background: none; cursor: pointer; color: inherit; font-weight: 900 }
thead th:nth-child(3) { width: 27% } th.image .hd1 { visibility: hidden }
.wvrow { position: relative; display: flex; align-items: center; gap: 6px; padding: 2px 8px 4px } .lnk.inl { position: static; width: 16px; height: 16px; flex: none }
.wvup { padding: 2px 8px }
.addsnd { display: inline-flex; gap: 4px; opacity: 0 } tr:hover .addsnd, tr.crowhot .addsnd { opacity: 1 }
.addsnd button { border: 0; border-radius: 8px; padding: 5px 8px; background: var(--surface); font: inherit; font-size: 12px; font-weight: 800; color: var(--hint); cursor: pointer } .addsnd button:hover { color: var(--blue) }
th.aud { width: 200px } td.aud { overflow: hidden } td.pair { vertical-align: middle }
@media (hover: none) { .addsnd { opacity: 1 } }
.hd1 { white-space: nowrap; font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .4px } th small.miss { font-size: 12px; font-weight: 700; color: var(--red-d) }
/* Пустые места под фото и звук видны только у строки под мышкой — таблица не пестрит */
tbody tr:not(:hover):not(.rowhot) .slot, tbody tr:not(:hover):not(.rowhot) .mic { opacity: 0 }
@media (hover: none) { tbody tr .slot, tbody tr .mic { opacity: 1 } }
.imx { position: relative } .ghostb { border: 0; border-radius: 10px; padding: 8px 12px; background: var(--surface); font: inherit; font-size: 14px; font-weight: 800; color: var(--text); cursor: pointer } .ghostb:hover { background: var(--border) }
.pm.down { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40 }
.lnkb { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; font-weight: 800; color: var(--blue); text-decoration: underline; text-underline-offset: 3px; cursor: pointer }
.tbl { overflow-x: auto }      /* без рамки — просто строки с линиями, как список в GitHub */
th.stc { width: 150px } td.stc { padding-top: 18px }
.sx { display: block; font-size: 12px; font-weight: 700; color: var(--hint-2); white-space: nowrap } .sx b { color: var(--text) } .sx em { font-style: normal; color: var(--red-d) }
.spark { display: flex; align-items: flex-end; gap: 3px; height: 30px; margin: 6px 0 4px; padding-bottom: 1px; border-bottom: 1.5px solid #9be9a8 }
.spark i { width: 7px; border-radius: 2px 2px 0 0 } .spark .lrn { background: #ff9b9b } .spark .rev { background: #40c463 } .spark .mature { background: #216e39 }
table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 760px; table-layout: fixed; font-size: 14px }
th { position: sticky; top: 0; z-index: 1; background: var(--card); text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: top }
.hd { display: grid; gap: 4px; justify-items: stretch; text-align: left } .hd small { display: block; text-align: left } .hd span { font-weight: 900; font-size: 13px } .hd em { color: var(--red); font-style: normal }
.hd small { font-size: 11px; font-weight: 700; color: var(--hint-2) } .hd small.miss { color: var(--red-d) }
.fill { display: block; height: 4px; border-radius: 3px; background: var(--surface); overflow: hidden } .fill b { display: block; height: 100%; background: var(--green) }
th.image { width: 150px } td.image { padding-right: 0 } td.image + td .two { padding-left: 4px } th.n, td.n { width: 34px; color: var(--hint-2); text-align: center; font-size: 12px } th.act { width: 104px } td.act { white-space: nowrap; text-align: right }
td { padding: 4px 6px; border-bottom: 1px solid var(--border); vertical-align: middle }
tr:hover td { background: #fafafa } tr.crowhot td { background: var(--blue-l) !important } tr.crowhot td:first-child { box-shadow: inset 3px 0 0 var(--blue) } tr.bad td.n { color: var(--red) }
td input { margin: 0; padding: 6px 8px; width: 100%; box-sizing: border-box; border: 1px solid transparent; border-radius: 8px; background: none; font-size: 14px }
.two { display: grid; gap: 3px; padding: 6px 8px; border-radius: 8px; cursor: text } 
.two span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.two .t1 { font-size: 15px; font-weight: 800; color: var(--text) } .two .t2 { font-size: 14px; font-weight: 700; color: var(--blue); min-height: 1em } .two .t2.e { color: var(--hint) }
.two .ph { color: var(--hint-2); font-weight: 600; font-size: 13px } .two .miss { color: var(--red-d) }
tr.editing td { background: var(--blue-l) }
/* Строка списка: вся кликабельна (откроет карточку) */
tr.crow { cursor: pointer } tr.crow:hover td { background: #f6f9fc }
.noph { display: block; width: 132px; height: 88px; border-radius: 12px; background: var(--surface) }
tr.crow td { padding-top: 14px; padding-bottom: 14px } .cell img { border-radius: 12px }
.two .t1 { font-size: 17px } .two .t2 { font-size: 15px } .two .wvrow { padding: 6px 0 0; max-width: 240px }
td.c-e .two .t1 { font-size: 15px; font-weight: 700 } td.c-e .two span { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical }
tr.crow td { vertical-align: top } tr.crow td.act { vertical-align: middle }      /* корзина — всегда видна, по центру строки */ tr.crow td.n { padding-top: 22px } tr.crow .two { padding-top: 6px; cursor: pointer }
.ea { margin-left: 6px; font-size: 12px; font-style: normal; opacity: .6 }
.hid { margin-right: 6px; padding: 2px 8px; border-radius: 6px; background: #fff4d6; color: #8a5b00; font-size: 11px; font-weight: 800 }
td.act .del { width: 44px; height: 44px; opacity: 0 } tr.crow:hover td.act .del { opacity: 1 }
.edrow td { padding: 0 10px 12px 44px; background: var(--blue-l) !important; border-bottom: 1px solid var(--border) }
.ed { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 12px; border-radius: 12px; background: var(--card); box-shadow: 0 4px 16px rgba(0, 0, 0, .08) }
.ed label { display: grid; gap: 4px } .ed span { font-size: 12px; font-weight: 800; color: var(--hint) } .ed em { color: var(--red); font-style: normal }
.ed input { margin: 0; padding: 8px 10px; font-size: 14px; border: 1.5px solid var(--border); border-radius: 9px; background: var(--card) } .ed input:focus { border-color: var(--blue) }
.edf { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 10px } .edf small { color: var(--hint); font-size: 12px; font-weight: 600 }
th.pair .hd + .hd { margin-top: 6px } .hd span small { margin-left: 6px; display: inline !important; white-space: nowrap }
.hd .src { display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-left: 6px; padding: 0 4px; border-radius: 5px; background: #e8f0fe; color: #1a73e8; font-size: 11px; font-weight: 900; font-style: normal; vertical-align: 1px }
td input:hover { border-color: var(--border) } td input:focus { border-color: var(--blue); background: var(--card) } td input.need { background: #fff1f1 }
td.dz { text-align: center } td.hot { background: var(--blue-l) !important; box-shadow: inset 0 0 0 2px var(--blue) }
.cell { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 4px }
.cell img { width: 132px; height: 88px; object-fit: cover; border-radius: 10px; cursor: pointer; display: block }
.pm { position: fixed; z-index: 40; display: grid; min-width: 220px; padding: 6px; border-radius: 12px; background: var(--card); box-shadow: 0 10px 30px rgba(0, 0, 0, .18), 0 0 0 1px var(--border); text-align: left }
.pm small { padding: 4px 8px 6px; font-size: 11px; font-weight: 800; color: var(--hint); white-space: normal }
.pm button, .pm a { display: block; padding: 8px 10px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 13px; font-weight: 700; color: var(--text); text-align: left; text-decoration: none; cursor: pointer }
.pm button:hover, .pm a:hover { background: var(--surface) } .pm .red { color: var(--red-d) }
.rm { position: absolute; right: -8px; top: -8px; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: var(--card); box-shadow: 0 1px 4px rgba(0, 0, 0, .25); color: var(--hint); font-size: 10px; font-weight: 900; cursor: pointer; opacity: 0; transition: opacity .1s }
.cell.au .rm { position: static; opacity: 0 } td:hover .rm, .rm:focus-visible { opacity: 1 } .rm:hover { color: var(--red-d) }
@media (hover: none) { .rm { opacity: 1 } }
.slot.ph52 { width: 72px; height: 48px; border-radius: 10px; font-size: 20px; font-weight: 600 }
.mic.lnkadd { position: absolute; right: -10px; bottom: -8px; width: 22px; height: 22px; font-size: 11px; background: var(--card); box-shadow: 0 1px 4px rgba(0, 0, 0, .2) }
.slot { width: 64px; height: 42px; border: 2px dashed var(--border); border-radius: 9px; background: none; font: inherit; font-size: 12px; font-weight: 800; color: var(--hint-2); cursor: pointer }
.cell.au .slot { width: 56px } .slot:hover { border-color: var(--blue); color: var(--blue) }
.mic { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: none; font-size: 14px; cursor: pointer; opacity: .55 } .mic:hover { opacity: 1; background: var(--surface) }
.recb { height: 34px; padding: 0 10px; border: 0; border-radius: 999px; background: var(--red); color: #fff; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.lnk { position: absolute; left: -5px; bottom: -5px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--card); color: var(--blue); box-shadow: 0 1px 4px rgba(0, 0, 0, .3); pointer-events: none; font-style: normal }
.play { position: relative; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--blue-l); color: var(--blue); font-size: 13px; cursor: pointer }
.up { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: var(--blue) }
.up i { width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(var(--blue) calc(var(--p) * 1%), var(--surface) 0) }
.del { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: none; color: var(--hint-2); cursor: pointer; opacity: 0 }
tr:hover .del, .del:focus-visible { opacity: 1 } .del:hover { background: var(--red-l); color: var(--red-d) }
@media (hover: none) { .del { opacity: 1 } }
.hide { border: 0; border-radius: 8px; padding: 5px 8px; background: none; font: inherit; font-size: 12px; font-weight: 800; color: var(--hint-2); cursor: pointer; opacity: 0; vertical-align: middle }
.hide.on { opacity: 1; background: #fff4d6; color: #8a5b00 } tr:hover .hide { opacity: 1 } .hide:hover { background: var(--surface) }
@media (hover: none) { .hide { opacity: 1 } }
.del { display: inline-grid; vertical-align: middle }
tr.off td:not(.act) { opacity: .45 }
.mini { border: 0; border-radius: 8px; padding: 5px 9px; background: rgba(0, 0, 0, .06); font: inherit; font-size: 12px; font-weight: 800; color: inherit; cursor: pointer } .mini:hover { background: rgba(0, 0, 0, .1) }
.more { display: block; margin: 10px auto; border: 0; border-radius: 10px; padding: 8px 14px; background: var(--surface); font: inherit; font-size: 13px; font-weight: 800; color: var(--blue); cursor: pointer }
.empty { padding: 30px; text-align: center; color: var(--hint) }
@media (max-width: 700px) { .tip { display: none } .search { width: 120px } .cnt { display: none } }
</style>

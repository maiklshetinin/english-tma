<script setup>
// Таблица карточек колоды (у преподавателя — по кнопке ≡ у колоды): каждое поле — столбец, сверху — сколько заполнено.
//  • Текст правится прямо в ячейках; колода сохраняется сама (stores/decks → PUT /decks/<id>).
//  • Фото и озвучка — перетаскиванием: файл на строку слова (или в нужную ячейку) или пачку на таблицу (раскладываются по имени файла:
//    apple.jpg → фото «apple», apple.mp3 → озвучка слова, apple_ex.mp3 → озвучка примера). Или нажать и выбрать файл.
//  • Фото строго 450×300 (3:2 — как место под фото у ученика): обрезаем по центру, WebP ≤ 40 КБ. Меньше 450×300 — не берём.
//  • Файлы — в S3 (server/storage.ts, папка колоды); в карточке — ссылка ${API}/media/f/<ключ>, её открывают и ученики.
//    Без сервера (демо) файлы остаются ссылками в памяти браузера.
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDecksStore } from '../../stores/decks'
import { useStudentsStore } from '../../stores/students'
import { srsOf, kindOf } from '../../composables/useSrs'
import { relDay } from '../../utils/dates'
import { API, apiRequest, fb, isDemo } from '../../firebase'
import { imageSrc, audioSrc } from '../../utils/media'
import { newId } from '../../utils/id'
import { showToast } from '../../composables/useToast'
import AppIcon from '../../components/AppIcon.vue'
import CardImport from '../../components/CardImport.vue'
import DeckSheet from '../../components/DeckSheet.vue'
import AudioWave from '../../components/AudioWave.vue'
import { waveOf } from '../../utils/wave'
import { fetchSheetCsv } from '../../composables/useSheetImport'

const route = useRoute(), router = useRouter()
const decks = useDecksStore()
const deck = computed(() => decks.byId(route.query.id) ?? (isDemo ? decks.list[0] : undefined))
// Настройки колоды (название, кому назначена, новых в день, удаление) — та же шторка, что была в списке колод
const settings = ref(false)
const closeSettings = () => { settings.value = false; if (!decks.byId(route.query.id) && !isDemo) back() }
const cards = computed(() => deck.value?.cards ?? [])
const online = !isDemo && !!API && !!fb
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
const info = reactive({})          // id+поле → «было → стало» для фото
const busy = reactive({})          // id+поле → % загрузки

// ---------- Фото: строго 450×300, WebP ≤ 40 КБ ----------
const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)
const isAud = (f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|weba)$/i.test(f.name)
const kb = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ')
const PW = 450, PH = 300, GOAL = 40 * 1024
const enc = (cv, type, qq) => new Promise(ok => cv.toBlob(ok, type, qq))
async function squeeze(file) {
  let bmp; try { bmp = await createImageBitmap(file) } catch { throw new Error(`не удалось открыть фото ${file.name}`) }
  const sw = Math.min(bmp.width, bmp.height * PW / PH), sh = sw * PH / PW            // самый большой кадр 3:2 — по центру
  if (sw < PW || sh < PH) throw new Error(`${file.name}: фото маленькое (${bmp.width}×${bmp.height}) — нужно хотя бы ${PW}×${PH}`)
  const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH
  const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, PW, PH)
  let type = 'image/webp', qq = 0.85, blob = await enc(cv, type, qq)
  if (blob?.type !== type) { type = 'image/jpeg'; blob = await enc(cv, type, qq) }        // Safari старше 14 не умеет WebP
  while (blob.size > GOAL && qq > 0.5) { qq = Math.round((qq - 0.07) * 100) / 100; blob = await enc(cv, type, qq) }
  return { blob, note: `${kb(file.size)} → ${kb(blob.size)} · ${PW}×${PH}` }
}
const audioType = (f) => f.type || ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', weba: 'audio/webm' })[f.name.split('.').pop().toLowerCase()] || 'audio/mpeg'

// ---------- Загрузка в хранилище ----------
const MEDIA = `${API}/media/f/`
const ourKey = (url) => (url?.startsWith(MEDIA) ? decodeURIComponent(url.slice(MEDIA.length)) : null)
async function send(blob, type, id) {
  const token = await fb?.currentUser?.getIdToken()
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest()
    x.open('POST', `${API}/media/upload?deckId=${encodeURIComponent(deck.value.id)}`)
    x.setRequestHeader('Content-Type', type); if (token) x.setRequestHeader('Authorization', `Bearer ${token}`)
    x.upload.onprogress = (e) => { if (e.lengthComputable) busy[id] = Math.round(e.loaded / e.total * 100) }
    x.onload = () => { if (x.status < 300) return ok(JSON.parse(x.responseText).key); let m = ''; try { m = JSON.parse(x.responseText).error } catch { /* не JSON */ } no(new Error(`${x.status}${m ? ': ' + m : ''}`)) }
    x.onerror = () => no(new Error('сервер не отвечает'))
    x.send(blob)
  })
}
/** Убрать старый файл из хранилища (заменили или удалили) — молча, это не главное */
const forget = (url) => { const k = ourKey(url); if (k && online) apiRequest('/media/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }) }).catch(() => {}) }
/** Положить файл в поле карточки: фото — ужать, всё — в хранилище, в карточку — ссылку. false — не вышло (причина — во всплывашке) */
async function attach(c, k, file) {
  const id = c.id + k
  if (busy[id] != null) return false
  busy[id] = 0
  try {
    let blob = file, type = audioType(file)
    if (k === 'image') { const r = await squeeze(file); blob = r.blob; type = blob.type; info[id] = r.note }
    const old = c[k]
    if (!online) c[k] = URL.createObjectURL(blob)
    else { const key = await send(blob, type, id); c[k] = MEDIA + key }
    if (k !== 'image') { try { c[k + 'Meta'] = await waveOf(blob) } catch { delete c[k + 'Meta'] } }      // волна и длительность — сразу из файла
    if (old && old !== c[k]) forget(old)
    return true
  } catch (e) { showToast(/фото маленькое|не удалось открыть/.test(e.message) ? e.message : `Не удалось загрузить ${file.name} (${e.message})`, null, 'bad'); return false }
  finally { delete busy[id] }
}
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
const isLink = (u) => !!u && !u.startsWith('blob:') && !ourKey(u)
const audSrc = (u) => (u?.startsWith('blob:') ? u : audioSrc(u))
function clearField(c, k) { forget(c[k]); delete c[k]; delete c[k + 'Meta']; delete info[c.id + k] }

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
const src = (u) => (u?.startsWith('blob:') ? u : imageSrc(u))
onUnmounted(() => { au?.pause() })

// ---------- Строки ----------
// Правка текста — не в самих ячейках, а в небольшой форме под строкой (нажали на слово / пример)
// Карточка для правки — компактная, похожа на карточку ученика: текст правится прямо на ней, фото и звук — бросить / выбрать / записать.
// ‹ › (или ← → вне полей) — соседние карточки, Esc — закрыть
const edit = ref('')
const ec = computed(() => cards.value.find(c => c.id === edit.value))
const eIdx = computed(() => shown.value.findIndex(c => c.id === edit.value))
function openEdit(c, k = '') { edit.value = c.id; if (k) setTimeout(() => document.querySelector(`.ce [data-k="${k}"]`)?.focus(), 30) }
const step = (d) => { const n = shown.value[eIdx.value + d]; if (n) edit.value = n.id }
const ceOver = ref(false), ceZone = ref('')       // над какой частью карточки держат файл: фото / звук слова / звук примера
async function zoneDrop(e, k) {
  e.preventDefault(); ceOver.value = false; ceZone.value = ''
  const f = [...(e.dataTransfer?.files ?? [])].find(x => (k === 'image' ? isImg(x) : isAud(x)))
  if (f) await attach(ec.value, k, f); else showToast(k === 'image' ? 'Сюда — фото (JPG, PNG, WebP)' : 'Сюда — звук (MP3, M4A, OGG, WAV)', null, 'bad')
}
async function ceDrop(e) {
  e.preventDefault(); ceOver.value = false; ceZone.value = ''
  for (const f of [...(e.dataTransfer?.files ?? [])].slice(0, 3)) { if (isImg(f)) await attach(ec.value, 'image', f); else if (isAud(f)) await attach(ec.value, ec.value.audio && !ec.value.exampleAudio && ec.value.example ? 'exampleAudio' : 'audio', f) }
}
function ceKey(e) {
  if (!edit.value) return
  if (e.key === 'Escape') { edit.value = ''; return }
  if (/INPUT|TEXTAREA/.test(e.target.tagName)) return
  if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1)
}
onMounted(() => addEventListener('keydown', ceKey)); onUnmounted(() => removeEventListener('keydown', ceKey))
function addCard() { const n = { id: newId('c'), front: '', back: '' }; deck.value.cards.unshift(n); q.value = ''; openEdit(n, 'front') }
function delCard(c) {
  const files = ['image', 'audio', 'exampleAudio'].filter(k => c[k])
  if ((c.front || files.length) && !confirm(`Удалить карточку «${c.front || 'без слова'}»?${files.length ? ' Её фото и озвучка удалятся из хранилища.' : ''}`)) return
  files.forEach(k => forget(c[k]))
  const i = deck.value.cards.findIndex(x => x.id === c.id); if (i >= 0) deck.value.cards.splice(i, 1)
}
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
    <!-- Карточка-редактор: как у ученика, всё правится прямо на ней; фото и звук — перетащить на карточку или нажать.
         Листать — большие стрелки по бокам или ← →, Esc — закрыть -->
    <div v-if="ec" class="ce-bg" @click.self="edit = ''">
      <button class="side l" :disabled="eIdx <= 0" title="Предыдущая (←)" @click="step(-1)"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <div class="ce" :class="{ over: ceOver, off: ec.suspended }" @dragover.prevent="ceOver = true; ceZone = ''" @dragleave="ceOver = false; ceZone = ''" @drop="ceDrop">
        <div class="ceh"><small>{{ eIdx + 1 }} из {{ shown.length }}</small><span class="sp" />
          <button class="hb" :class="{ on: ec.suspended }" :title="ec.suspended ? 'Скрыта от учеников — вернуть' : 'Скрыть от учеников'" @click="ec.suspended ? delete ec.suspended : (ec.suspended = true)">
            <svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /><path v-if="ec.suspended" d="M4 4l16 16" /></svg></button>
          <button class="hb red" title="Удалить карточку" @click="delCard(ec); edit = ''"><AppIcon name="trash" :size="22" /></button>
          <button class="hb" title="Закрыть (Esc)" @click="edit = ''"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
        <div class="wrow"><input v-model.trim="ec.front" data-k="front" class="cw" placeholder="слово" :class="{ miss: !ec.front }" />
          <span class="spk2" :class="{ zon: ceZone === 'audio' }" @dragover.prevent.stop="ceZone = 'audio'; ceOver = true" @drop.stop="zoneDrop($event, 'audio')">
            <span v-if="busy[ec.id + 'audio'] != null" class="up"><i :style="{ '--p': busy[ec.id + 'audio'] }" /></span>
            <template v-else-if="ec.audio"><AudioWave :src="audSrc(ec.audio)" :meta="ec.audioMeta || ''" small @meta="ec.audioMeta = $event" /><i v-if="isLink(ec.audio)" class="lk" title="Звук по ссылке"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i><button class="xx" title="Убрать звук" @click="clearField(ec, 'audio')">✕</button></template>
            <button v-else class="addsnd2" title="Добавить звук — выбрать файл или перетащить сюда" @click="choose(ec, FIELDS[5])"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/></svg><b>+</b></button>
          </span></div>
        <input v-model.trim="ec.back" data-k="back" class="ct" placeholder="перевод" :class="{ miss: !ec.back }" />
        <div class="cph" :class="{ empty: !ec.image, zon: ceZone === 'image' }" @dragover.prevent.stop="ceZone = 'image'; ceOver = true" @drop.stop="zoneDrop($event, 'image')" @click="!ec.image && busy[ec.id + 'image'] == null && choose(ec, FIELDS[4])">
          <span v-if="busy[ec.id + 'image'] != null" class="up"><i :style="{ '--p': busy[ec.id + 'image'] }" />{{ busy[ec.id + 'image'] }}%</span>
          <template v-else-if="ec.image"><img :src="src(ec.image)" alt="" /><i v-if="isLink(ec.image)" class="lk big" title="Фото по ссылке"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i>
            <span class="ctl"><button @click.stop="choose(ec, FIELDS[4])">Заменить</button><button class="red" @click.stop="clearField(ec, 'image')">Убрать</button></span></template>
          <span v-else class="addph"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 15l-5-5-8 9" /></svg>Перетащите фото или нажмите</span>
        </div>
        <div class="wrow"><textarea v-model.trim="ec.example" data-k="example" class="ce1" rows="2" placeholder="пример" />
          <span class="spk2" :class="{ zon: ceZone === 'exampleAudio' }" @dragover.prevent.stop="ceZone = 'exampleAudio'; ceOver = true" @drop.stop="zoneDrop($event, 'exampleAudio')">
            <span v-if="busy[ec.id + 'exampleAudio'] != null" class="up"><i :style="{ '--p': busy[ec.id + 'exampleAudio'] }" /></span>
            <template v-else-if="ec.exampleAudio"><AudioWave :src="audSrc(ec.exampleAudio)" :meta="ec.exampleAudioMeta || ''" small @meta="ec.exampleAudioMeta = $event" /><i v-if="isLink(ec.exampleAudio)" class="lk" title="Звук по ссылке"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg></i><button class="xx" title="Убрать звук" @click="clearField(ec, 'exampleAudio')">✕</button></template>
            <button v-else class="addsnd2" title="Добавить звук — выбрать файл или перетащить сюда" @click="choose(ec, FIELDS[6])"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/></svg><b>+</b></button>
          </span></div>
        <textarea v-model.trim="ec.exampleTr" data-k="exampleTr" class="ce2" rows="1" placeholder="перевод примера" />
        <div v-if="ceOver && !ceZone" class="ceov">Отпустите — фото или звук в эту карточку</div>
      </div>
      <button class="side r" :disabled="eIdx >= shown.length - 1" title="Следующая (→)" @click="step(1)"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>
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
/* Карточка для правки */
.ce-bg { position: fixed; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; gap: 18px; padding: 16px; background: rgba(17, 24, 39, .45); backdrop-filter: blur(2px) }
.ce { position: relative; width: min(400px, 100%); max-height: 100%; overflow: auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 10px 16px 18px; border-radius: 24px; background: var(--card); box-shadow: 0 24px 60px rgba(0, 0, 0, .28) }
.ce.over { box-shadow: 0 0 0 3px var(--blue), 0 24px 60px rgba(0, 0, 0, .28) } .ce.off { opacity: .85 }
.side { flex: none; display: grid; place-items: center; width: 52px; height: 52px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .95); color: var(--text); cursor: pointer; box-shadow: 0 6px 20px rgba(0, 0, 0, .2); transition: transform .1s, opacity .1s }
.side svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round }
.side:hover:not(:disabled) { transform: scale(1.06); color: var(--blue) } .side:disabled { opacity: 0; pointer-events: none }
.ceh { display: flex; align-items: center; gap: 4px; margin: 0 -6px 4px 0 } .ceh small { font-size: 13px; font-weight: 800; color: var(--hint-2) }
.hb { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 12px; background: none; color: var(--hint); cursor: pointer }
.hb svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.hb:hover { background: var(--surface); color: var(--text) } .hb.red:hover { background: var(--red-l); color: var(--red-d) } .hb.on { color: var(--orange-d); background: #fff4d6 }
.ce input, .ce textarea { margin: 0; width: 100%; border: 0; border-radius: 12px; background: none; text-align: center; padding: 4px 8px; resize: none; font-family: inherit; line-height: 1.3; outline: none; transition: background .1s }
.ce input:hover, .ce textarea:hover { background: var(--surface) } .ce input:focus, .ce textarea:focus { background: var(--blue-l) }
.ce input::placeholder, .ce textarea::placeholder { color: var(--hint-2); font-weight: 600 }
.cw { font-size: 28px; font-weight: 900 } .ct { font-size: 19px; font-weight: 800; color: var(--blue) } .ce .miss { background: #fff1f1 }
.ce1 { font-size: 16px; font-weight: 700 } .ce2 { font-size: 14px; font-weight: 600; color: var(--hint) }
.wrow { display: flex; align-items: center; gap: 6px } .wrow > :first-child { flex: 1; min-width: 0 }
.spk2 { position: relative; flex: none; display: inline-flex; align-items: center; gap: 4px; max-width: 150px; border-radius: 12px; padding: 2px }
.spk2 .aw { width: 116px } .spk2 .lk { position: static }
.addsnd2 { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border: 2px dashed var(--border); border-radius: 50%; background: none; color: var(--hint-2); cursor: pointer }
.addsnd2 b { position: absolute; right: -4px; bottom: -4px; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--card); font-size: 14px; line-height: 1 }
.addsnd2:hover { border-color: var(--blue); color: var(--blue) }
.xx { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--hint-2); font-size: 11px; cursor: pointer; opacity: 0 } .spk2:hover .xx { opacity: 1 } .xx:hover { color: var(--red-d) }
.cph { position: relative; aspect-ratio: 3 / 2; border-radius: 16px; overflow: hidden; background: var(--surface); display: grid; place-items: center; margin: 8px 0 }
.cph.empty { border: 2px dashed var(--border); background: none; cursor: pointer } .cph.empty:hover { border-color: var(--blue); background: var(--blue-l) }
.cph img { width: 100%; height: 100%; object-fit: contain }
.addph { display: grid; justify-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: var(--hint-2) } .cph.empty:hover .addph { color: var(--blue) }
.ctl { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 8px; padding: 18px 10px 10px; background: linear-gradient(transparent, rgba(0, 0, 0, .35)); opacity: 0; transition: opacity .15s } .cph:hover .ctl { opacity: 1 }
@media (hover: none) { .ctl, .xx { opacity: 1 } }
.ctl button { border: 0; border-radius: 10px; padding: 8px 14px; background: rgba(255, 255, 255, .95); font: inherit; font-size: 13px; font-weight: 800; color: var(--text); cursor: pointer } .ctl .red { color: var(--red-d) }
.lk { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--card); color: var(--blue); box-shadow: 0 1px 4px rgba(0, 0, 0, .25); font-style: normal; flex: none }
.lk.big { position: absolute; left: 10px; top: 10px; width: 26px; height: 26px }
.cph.zon, .spk2.zon { outline: 3px solid var(--blue); outline-offset: 2px; background: var(--blue-l) }
.ceov { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; border-radius: 24px; background: rgba(221, 244, 255, .88); color: var(--blue); font-size: 17px; font-weight: 900; text-align: center; pointer-events: none }
@media (max-width: 560px) { .side { position: fixed; bottom: 18px; z-index: 2 } .side.l { left: 18px } .side.r { right: 18px } }
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

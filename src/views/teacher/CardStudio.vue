<script setup>
// Таблица карточек колоды (у преподавателя — по кнопке ≡ у колоды): каждое поле — столбец, сверху — сколько заполнено.
//  • Текст правится прямо в ячейках; колода сохраняется сама (stores/decks → PUT /decks/<id>).
//  • Фото и озвучка — перетаскиванием: файл на строку слова (или в нужную ячейку) или пачку на таблицу (раскладываются по имени файла:
//    apple.jpg → фото «apple», apple.mp3 → озвучка слова, apple_ex.mp3 → озвучка примера). Или нажать и выбрать файл, или записать с микрофона.
//  • Фото строго 450×300 (3:2 — как место под фото у ученика): обрезаем по центру, WebP ≤ 40 КБ. Меньше 450×300 — не берём.
//  • Файлы — в S3 (server/storage.ts, папка колоды); в карточке — ссылка ${API}/media/f/<ключ>, её открывают и ученики.
//    Без сервера (демо) файлы остаются ссылками в памяти браузера.
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDecksStore } from '../../stores/decks'
import { API, apiRequest, fb, isDemo } from '../../firebase'
import { imageSrc, audioSrc } from '../../utils/media'
import { newId } from '../../utils/id'
import { showToast } from '../../composables/useToast'
import AppIcon from '../../components/AppIcon.vue'

const route = useRoute(), router = useRouter()
const decks = useDecksStore()
const deck = computed(() => decks.byId(route.query.id) ?? (isDemo ? decks.list[0] : undefined))
const cards = computed(() => deck.value?.cards ?? [])
const online = !isDemo && !!API && !!fb
const FIELDS = [
  { k: 'front', t: 'Слово', kind: 'text', need: true }, { k: 'back', t: 'Перевод', kind: 'text', need: true },
  { k: 'example', t: 'Пример', kind: 'text' }, { k: 'exampleTr', t: 'Перевод примера', kind: 'text' },
  { k: 'image', t: 'Фото', kind: 'image' }, { k: 'audio', t: 'Озвучка слова', kind: 'audio' }, { k: 'exampleAudio', t: 'Озвучка примера', kind: 'audio' },
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
    if (old && old !== c[k]) forget(old)
    return true
  } catch (e) { showToast(/фото маленькое|не удалось открыть/.test(e.message) ? e.message : `Не удалось загрузить ${file.name} (${e.message})`, null, 'bad'); return false }
  finally { delete busy[id] }
}
function clearField(c, k) { forget(c[k]); delete c[k]; delete info[c.id + k] }

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
function dragOver(e) { if (!hasFiles(e)) return; e.preventDefault(); clearTimeout(leaveT); over.value = true; overRow.value = ''; overCell.value = '' }
function dragLeave() { clearTimeout(leaveT); leaveT = setTimeout(() => { over.value = false; overCell.value = ''; overRow.value = '' }, 80) }
async function drop(e) { e.preventDefault(); over.value = false; await dropOnTable([...(e.dataTransfer?.files ?? [])]) }
// Файл на строку: на ячейку фото / звука — в неё; на слово, перевод и т.п. — в эту карточку: фото → «Фото», звук → «Озвучка слова».
// Можно бросить сразу фото и звук. Имя файла тут не важно.
const overRow = ref('')
function cellOver(e, c, f) { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); clearTimeout(leaveT); overCell.value = f.kind === 'text' ? '' : c.id + f.k; overRow.value = c.id; over.value = false }
async function dropCell(e, c, f) {
  e.preventDefault(); e.stopPropagation(); overCell.value = ''; overRow.value = ''; over.value = false
  const files = [...(e.dataTransfer?.files ?? [])]; if (!files.length) return
  let used = false
  for (const file of files.slice(0, 3)) {
    const k = isImg(file) ? 'image' : isAud(file) ? (f.k === 'exampleAudio' ? 'exampleAudio' : 'audio') : null
    if (!k) continue
    if (f.kind !== 'text' && (f.kind === 'image') !== (k === 'image')) { showToast(f.kind === 'image' ? 'Сюда — фото (JPG, PNG, WebP)' : 'Сюда — звук (MP3, M4A, OGG, WAV)', null, 'bad'); continue }
    used = true; await attach(c, k, file)
  }
  if (!used && f.kind === 'text') showToast('Можно бросить фото (JPG, PNG, WebP) или звук (MP3, M4A, OGG, WAV)', null, 'bad')
}
// Выбрать файл кнопкой
const pick = ref(null); let pickTo = null
function choose(c, f) { pickTo = { c, k: f.k }; pick.value.accept = f.kind === 'image' ? 'image/*' : 'audio/*'; pick.value.value = ''; pick.value.click() }
async function picked(e) { const file = e.target.files?.[0]; if (file && pickTo) await attach(pickTo.c, pickTo.k, file) }

// ---------- Запись с микрофона (до 30 с) ----------
const rec = reactive({ id: '', t: 0 }); let mr = null, timer = 0
async function record(c, k) {
  if (rec.id) { const same = rec.id === c.id + k; mr?.stop(); if (same) return }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), chunks = []
    mr = new MediaRecorder(stream); Object.assign(rec, { id: c.id + k, t: 0 })
    mr.ondataavailable = (e) => chunks.push(e.data)
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop()); clearInterval(timer); rec.id = ''
      const type = (mr.mimeType || 'audio/webm').split(';')[0]
      if (chunks.length) attach(c, k, new File(chunks, `rec.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'weba'}`, { type }))
    }
    mr.start(); timer = setInterval(() => { rec.t++; if (rec.t >= 30) mr.stop() }, 1000)
  } catch { showToast('Нет доступа к микрофону', null, 'bad') }
}
let au = null
const play = (u) => { try { au?.pause(); au = new Audio(u.startsWith('blob:') ? u : audioSrc(u)); au.play().catch(() => showToast('Звук не открылся', null, 'bad')) } catch { /* — */ } }
const src = (u) => (u?.startsWith('blob:') ? u : imageSrc(u))
onUnmounted(() => { clearInterval(timer); mr?.state === 'recording' && mr.stop(); au?.pause() })

// ---------- Строки ----------
function addCard() { deck.value.cards.unshift({ id: newId('c'), front: '', back: '' }); q.value = ''; setTimeout(() => document.querySelector('tbody tr input')?.focus(), 30) }
function delCard(c) {
  const files = ['image', 'audio', 'exampleAudio'].filter(k => c[k])
  if ((c.front || files.length) && !confirm(`Удалить карточку «${c.front || 'без слова'}»?${files.length ? ' Её фото и озвучка удалятся из хранилища.' : ''}`)) return
  files.forEach(k => forget(c[k]))
  const i = deck.value.cards.findIndex(x => x.id === c.id); if (i >= 0) deck.value.cards.splice(i, 1)
}
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'карточка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'карточки' : 'карточек')
const back = () => router.push({ name: 'words' })
</script>

<template>
  <div class="st" @dragleave="dragLeave">
    <input ref="pick" type="file" hidden @change="picked" />
    <header class="bar">
      <button class="bk" @click="back"><AppIcon name="back" :size="20" /> Колоды</button>
      <template v-if="deck"><i class="vs" /><b class="dt">{{ deck.title }}</b><span class="cnt">{{ cards.length }} {{ word(cards.length) }}</span></template>
      <span class="sp" />
      <label v-if="deck" class="search"><AppIcon name="search" :size="16" /><input v-model="q" placeholder="Поиск…" /></label>
      <button v-if="deck" class="btn sm" @click="addCard"><AppIcon name="plus" :size="16" /> Карточка</button>
    </header>

    <div v-if="!deck" class="none"><b>Колода не найдена</b><button class="btn sm" @click="back">К колодам</button></div>
    <section v-else class="wrap" :class="{ over }" @dragover="dragOver" @drop="drop">
      <div class="tip"><AppIcon name="download" :size="18" /><span><b>Бросьте сюда пачку фото и аудио</b> — разойдутся по строкам по имени файла:
        <i>apple.jpg</i> → фото, <i>apple.mp3</i> → озвучка слова, <i>apple_ex.mp3</i> → озвучка примера. Или бросьте фото / звук прямо на строку нужного слова.
        Фото — от 450×300: обрежутся по центру до 450×300 и ужмутся до ~40 КБ.</span></div>
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
      <div class="tbl">
        <table>
          <thead><tr><th class="n">#</th>
            <th v-for="f in FIELDS" :key="f.k" :class="f.kind"><div class="hd"><span>{{ f.t }}<em v-if="f.need">*</em></span>
              <small :class="{ full: cards.length && filled(f.k) === cards.length, none: !filled(f.k) }">{{ filled(f.k) }} из {{ cards.length }}</small>
              <i class="fill"><b :style="{ width: (cards.length ? filled(f.k) / cards.length * 100 : 0) + '%' }" /></i></div></th>
            <th class="act" /></tr></thead>
          <tbody>
            <tr v-for="(c, i) in shown" :key="c.id" :class="{ bad: !c.front || !c.back, off: c.suspended, rowhot: overRow === c.id }">
              <td class="n">{{ i + 1 }}</td>
              <td v-for="f in FIELDS" :key="f.k" :class="[f.kind, { dz: f.kind !== 'text', hot: overCell === c.id + f.k }]"
                @dragover="cellOver($event, c, f)" @drop="dropCell($event, c, f)">
                <input v-if="f.kind === 'text'" v-model.trim="c[f.k]" :placeholder="f.need ? 'нужно заполнить' : '—'" :class="{ need: f.need && !c[f.k] }" />
                <span v-else-if="busy[c.id + f.k] != null" class="up"><i :style="{ '--p': busy[c.id + f.k] }" />{{ busy[c.id + f.k] }}%</span>
                <span v-else-if="f.kind === 'image'" class="cell">
                  <template v-if="c.image"><img :src="src(c.image)" alt="" :title="info[c.id + 'image'] ? 'сжато: ' + info[c.id + 'image'] + ' · нажмите — заменить' : 'Нажмите — заменить'" @click="choose(c, f)" />
                    <button class="rm" title="Убрать фото" @click="clearField(c, 'image')">✕</button></template>
                  <button v-else class="slot" @click="choose(c, f)">+ фото</button>
                </span>
                <span v-else class="cell au">
                  <template v-if="c[f.k]"><button class="play" title="Послушать" @click="play(c[f.k])">▶</button><button class="rm" title="Убрать озвучку" @click="clearField(c, f.k)">✕</button></template>
                  <template v-else-if="rec.id === c.id + f.k"><button class="recb" title="Остановить" @click="record(c, f.k)">■ {{ rec.t }} с</button></template>
                  <template v-else><button class="slot" title="Выбрать файл" @click="choose(c, f)">+ звук</button><button class="mic" title="Записать с микрофона" @click="record(c, f.k)">🎙</button></template>
                </span>
              </td>
              <td class="act"><button class="hide" :class="{ on: c.suspended }" :title="c.suspended ? 'Скрыта — ученики её не учат. Нажмите, чтобы вернуть' : 'Скрыть от учеников (не удалять)'" @click="c.suspended ? delete c.suspended : (c.suspended = true)">{{ c.suspended ? 'скрыта' : 'скрыть' }}</button><button class="del" title="Удалить карточку" @click="delCard(c)"><AppIcon name="trash" :size="16" /></button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!cards.length" class="empty">Карточек пока нет. Нажмите «+ Карточка» или бросьте сюда фото и аудио — слово возьмётся из имени файла.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.st { position: fixed; inset: 0; z-index: 30; display: grid; grid-template-rows: auto 1fr; background: #f5f5f5; font-family: var(--font) }
.bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--card); box-shadow: 0 1px 0 var(--border) }
.bk { display: flex; align-items: center; gap: 2px; border: 0; background: none; font: inherit; font-weight: 800; color: var(--text); cursor: pointer; padding: 6px 8px; border-radius: 10px } .bk:hover { background: var(--surface) }
.vs { width: 1px; height: 22px; background: var(--border) } .dt { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .cnt { color: var(--hint); font-size: 13px; font-weight: 700; white-space: nowrap } .sp { flex: 1 }
.search { display: flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 10px; background: var(--surface); color: var(--hint); width: 200px } .search input { margin: 0; border: 0; background: none; padding: 8px 0; font-size: 14px; min-width: 0 }
.none { display: grid; justify-items: center; align-content: center; gap: 12px }
.wrap { display: flex; flex-direction: column; gap: 10px; padding: 14px; min-height: 0; transition: background .12s }
.wrap.over { background: var(--blue-l); box-shadow: inset 0 0 0 3px var(--blue) }
.tip { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border: 2px dashed var(--border); border-radius: 14px; background: var(--card); color: var(--hint); font-size: 13px }
.tip b { color: var(--text) } .tip i, .rep i { font-style: normal; color: var(--blue); font-weight: 700; margin-right: 4px }
.rep { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 10px 14px; border-radius: 12px; background: var(--green-l); color: var(--green-d); font-size: 13px; font-weight: 600 }
.rep.warn { background: #fff4d6; color: #8a5b00 } .rep .x { margin-left: auto; border: 0; background: none; cursor: pointer; color: inherit; font-weight: 900 }
.tbl { flex: 1; overflow: auto; border-radius: 14px; background: var(--card); box-shadow: 0 0 0 1px var(--border) }
table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 1060px; font-size: 14px }
th { position: sticky; top: 0; z-index: 1; background: var(--card); text-align: left; padding: 10px 8px; border-bottom: 2px solid var(--border); vertical-align: top }
.hd { display: grid; gap: 4px } .hd span { font-weight: 900; font-size: 13px } .hd em { color: var(--red); font-style: normal }
.hd small { font-size: 11px; font-weight: 800; color: var(--orange-d) } .hd small.full { color: var(--green-d) } .hd small.none { color: var(--hint-2) }
.fill { display: block; height: 4px; border-radius: 3px; background: var(--surface); overflow: hidden } .fill b { display: block; height: 100%; background: var(--green) }
th.image, th.audio { width: 104px } th.n, td.n { width: 34px; color: var(--hint-2); text-align: center; font-size: 12px } th.act { width: 104px } td.act { white-space: nowrap; text-align: right }
td { padding: 4px 6px; border-bottom: 1px solid var(--border); vertical-align: middle }
tr:hover td { background: #fafafa } tr.rowhot td { background: var(--blue-l) !important } tr.rowhot td:first-child { box-shadow: inset 3px 0 0 var(--blue) } tr.bad td.n { color: var(--red) }
td input { margin: 0; padding: 6px 8px; width: 100%; box-sizing: border-box; border: 1px solid transparent; border-radius: 8px; background: none; font-size: 14px }
td input:hover { border-color: var(--border) } td input:focus { border-color: var(--blue); background: var(--card) } td input.need { background: #fff1f1 }
td.dz { text-align: center } td.hot { background: var(--blue-l) !important; box-shadow: inset 0 0 0 2px var(--blue) }
.cell { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 4px }
.cell img { width: 63px; height: 42px; object-fit: cover; border-radius: 8px; cursor: pointer; display: block }
.rm { position: absolute; right: -8px; top: -8px; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: var(--card); box-shadow: 0 1px 4px rgba(0, 0, 0, .25); color: var(--hint); font-size: 10px; font-weight: 900; cursor: pointer; opacity: 0; transition: opacity .1s }
.cell.au .rm { position: static; opacity: 0 } td:hover .rm, .rm:focus-visible { opacity: 1 } .rm:hover { color: var(--red-d) }
@media (hover: none) { .rm { opacity: 1 } }
.slot { width: 64px; height: 42px; border: 2px dashed var(--border); border-radius: 9px; background: none; font: inherit; font-size: 12px; font-weight: 800; color: var(--hint-2); cursor: pointer }
.cell.au .slot { width: 56px } .slot:hover { border-color: var(--blue); color: var(--blue) }
.mic { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: none; font-size: 14px; cursor: pointer; opacity: .55 } .mic:hover { opacity: 1; background: var(--surface) }
.recb { height: 34px; padding: 0 10px; border: 0; border-radius: 999px; background: var(--red); color: #fff; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.play { width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--blue-l); color: var(--blue); font-size: 13px; cursor: pointer }
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
.empty { padding: 30px; text-align: center; color: var(--hint) }
@media (max-width: 700px) { .tip { display: none } .search { width: 120px } .cnt { display: none } }
</style>

<script setup>
// Окно озвучки Gemini (20.11.2026) — только в редакторе курса. Затемнение, текст (можно поправить), голос, «Озвучить» —
// и видно, что происходит: какой ключ пробуется, сколько секунд ждём. Готово — послушать, «Ещё раз» или «Сохранить в экран».
// Запрос — ключами преподавателя из профиля (utils/tts.js), прямо из браузера.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import AudioPill from './AudioPill.vue'
import { VOICES, getVoice, setVoice, speak, getModel, setModel, ttsModels, knownModels, modelName, quotaUntil, SAMPLES, getSampleLang, setSampleLang, sampleGet, samplePut, sampleKeys } from '../utils/tts'
import { ai, addKey, removeKey, moveKey, mask, countToday } from '../utils/gemini'
import { aiIcon } from '../utils/ai'

const props = defineProps({ text: { type: String, default: '' }, what: { type: String, default: 'вопрос' } })
const emit = defineEmits(['close', 'save'])
const txt = ref(props.text), voice = ref(getVoice())
const st = ref('idle')                 // idle | busy | done | err
const err = ref(null), step = ref(null), t0 = ref(0), now = ref(0)
let ac = null, tm = 0
const sec = computed(() => ((now.value - t0.value) / 1000).toFixed(1).replace('.', ','))
const icon = aiIcon('Gemini')
const noKeys = computed(() => !ai.keys.length)

// модель озвучки: список — из первого ключа (кэш на сутки); у каждой модели свой суточный лимит
const model = ref(getModel()), models = ref(knownModels())
onMounted(async () => { if (ai.keys[0]) { const l = await ttsModels(ai.keys[0].key); if (l.length) { models.value = l; if (!l.includes(model.value)) pickModel(l[0]) } } })
function pickModel(m) { model.value = m; setModel(m); smpAu?.pause(); loadSaved?.() }
const modelList = computed(() => (models.value.includes(model.value) ? models.value : [model.value, ...models.value]))
const GROUPS = [['Женские', VOICES.filter(v => v[1] === 'женский')], ['Мужские', VOICES.filter(v => v[1] === 'мужской')]]
// ключи — та же таблица, что в профиле: какой сейчас пробуется, квота, запросы за сегодня; можно добавить, поднять, убрать
const fresh = ref(''), adding = ref(false)
const hm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const rows = computed(() => ai.keys.map((x) => {
  const m = mask(x.key), cur = st.value === 'busy' && step.value?.key === m, qu = quotaUntil(x.key, model.value), wait = qu > now.value
  return { key: x.key, m, n: countToday(x), err: x.err, cur,
    st: cur ? 'cur' : wait ? 'wait' : x.ok === true ? 'ok' : x.ok === false ? 'bad' : 'new',
    label: cur ? `озвучивает · ${sec.value} с` : wait ? `лимит модели до ${hm(qu)}` : x.ok === true ? 'работает' : x.ok === false ? 'ошибка' : 'не проверен' }
}))
function addK() { if (addKey(fresh.value)) { fresh.value = ''; adding.value = false } }
let clock = 0
onMounted(() => { now.value = Date.now(); clock = setInterval(() => { if (st.value !== 'busy') now.value = Date.now() }, 30_000) })
onBeforeUnmount(() => clearInterval(clock))
function pickVoice(v) { voice.value = v; setVoice(v) }

// образцы голосов: ▶ у голоса — одна фраза этим голосом; первый раз озвучивается (1 запрос), потом играет из браузера
// фраза образца — по-польски или по-английски (у каждой свои образцы); язык угадывается по тексту, выбор запоминается
const saved = ref(new Set()), smpBusy = ref(''), smpOn = ref(''), lang = ref(getSampleLang(props.text))
const phrase = computed(() => SAMPLES[lang.value])
const loadSaved = () => sampleKeys(phrase.value + '|' + model.value).then((v) => { saved.value = new Set(v) })
function setLang(l) { if (smpBusy.value) return; smpAu?.pause(); lang.value = l; setSampleLang(l); loadSaved() }
let smpAu = null
onMounted(loadSaved)
async function sample(v) {
  if (smpBusy.value || st.value === 'busy') return
  if (smpOn.value === v) { smpAu?.pause(); return }
  smpAu?.pause(); document.querySelectorAll('.tts .out audio').forEach((a) => a.pause())
  const ph = phrase.value + '|' + model.value
  let b = await sampleGet(v, ph)
  if (!b) {
    smpBusy.value = v; err.value = null
    try { b = (await speak(phrase.value, v, { model: model.value })).blob; await samplePut(v, b, ph); if (ph === phrase.value + '|' + model.value) saved.value = new Set([...saved.value, v]) }
    catch (e) { err.value = e; return } finally { smpBusy.value = '' }
  }
  const u = URL.createObjectURL(b)
  smpAu = new Audio(u); smpOn.value = v
  smpAu.onended = smpAu.onpause = () => { if (smpOn.value === v) smpOn.value = ''; URL.revokeObjectURL(u) }
  smpAu.play().catch(() => { smpOn.value = '' })
}

// результат: один; «Ещё раз» — заново (сравнивать голоса — образцами ▶, они бесплатные)
const res = ref(null)
async function go() {
  if (st.value === 'busy' || smpBusy.value || !txt.value.trim()) return
  smpAu?.pause()
  st.value = 'busy'; err.value = null; step.value = null; t0.value = now.value = Date.now()
  tm = setInterval(() => { now.value = Date.now() }, 100)
  ac = new AbortController()
  try {
    const r = await speak(txt.value, voice.value, { model: model.value, signal: ac.signal, onStep: (x) => { step.value = x } })
    if (res.value) URL.revokeObjectURL(res.value.url)
    res.value = { ...r, voice: voice.value, url: URL.createObjectURL(r.blob), took: sec.value, dur: r.sec.toFixed(1).replace('.', ',') + ' с' }; st.value = 'done'
  } catch (e) {
    if (e.cancel) { st.value = res.value ? 'done' : 'idle'; return }
    err.value = e; st.value = 'err'
  } finally { clearInterval(tm); ac = null }
}
function stop() { ac?.abort() }
function save() {
  const t = res.value; if (!t) return
  const f = new File([t.blob], `tts_${t.voice}_${Date.now().toString(36)}.wav`, { type: 'audio/wav' })
  emit('save', f); close(true)
}
function close(force = false) { if (st.value === 'busy' && force !== true) return; emit('close') }
const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (st.value === 'busy') stop(); else close() } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey, true); clearInterval(tm); ac?.abort(); smpAu?.pause(); if (res.value) URL.revokeObjectURL(res.value.url) })
</script>

<template>
  <Teleport to="body">
    <div class="tts-bg" @pointerdown.self="close" @keydown.stop @paste.stop @wheel.stop>
      <div class="tts" role="dialog" aria-modal="true" aria-label="Озвучка Gemini">
        <header>
          <img v-if="icon" :src="icon" alt="" /><b>Озвучить {{ what }}</b>
          <button type="button" class="x" title="Закрыть" :disabled="st === 'busy'" @click="close">✕</button>
        </header>

        <label class="lb" for="tts-t">Текст</label>
        <textarea id="tts-t" v-model="txt" rows="3" :readonly="st === 'busy'" spellcheck="false" />

        <div class="mrow"><label class="lb" for="tts-m">Модель</label>
          <select id="tts-m" :value="model" :disabled="st === 'busy' || !!smpBusy" @change="pickModel($event.target.value)"><option v-for="m in modelList" :key="m" :value="m">{{ modelName(m) }}</option></select>
          <small>у каждой модели свой лимит: 10 в сутки, 3 в минуту</small></div>

        <div class="vg2">
          <div v-for="[g, list] in GROUPS" :key="g" class="vgrp">
            <div class="lb">{{ g }}<span v-if="g === 'Женские'" class="smp">▶ образец:<button v-for="(t, l) in { pl: 'PL', en: 'EN' }" :key="l" type="button" class="lg" :class="{ on: lang === l }" :title="SAMPLES[l]" @click="setLang(l)">{{ t }}</button></span></div>
            <div class="vs">
              <div v-for="v in list" :key="v[0]" class="v" :class="{ on: voice === v[0] }">
                <button type="button" class="vn" :disabled="st === 'busy'" @click="pickVoice(v[0])"><b>{{ v[0] }}</b><small>{{ v[2] }}</small></button>
                <button type="button" class="vp" :class="{ has: saved.has(v[0]), play: smpOn === v[0] }" :disabled="st === 'busy' || (!!smpBusy && smpBusy !== v[0])"
                  :title="saved.has(v[0]) ? 'Образец голоса — из браузера, квоту не тратит' : 'Образец голоса — озвучить один раз (1 запрос), дальше бесплатно'" @click="sample(v[0])">
                  <span v-if="smpBusy === v[0]" class="spin sm" /><svg v-else-if="smpOn === v[0]" viewBox="0 0 24 24"><rect x="7" y="6" width="3.5" height="12" rx="1" /><rect x="13.5" y="6" width="3.5" height="12" rx="1" /></svg><svg v-else viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="kh"><span class="lb">Ключи Gemini</span><small>пробуются сверху вниз · кончилась квота — следующий</small><span class="sp" /><button type="button" class="lnk" @click="adding = !adding">{{ adding ? 'Отмена' : '＋ Ключ' }}</button></div>
        <form v-if="adding" class="kadd" @submit.prevent="addK"><input v-model="fresh" placeholder="AIzaSy…" autocomplete="off" spellcheck="false" aria-label="Новый ключ" /><button type="submit" class="ghost sm" :disabled="!fresh.trim()">Добавить</button><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Получить ключ</a></form>
        <div v-if="rows.length" class="kt" role="table" aria-label="Ключи Gemini">
          <div class="kr kth" role="row"><span /><span>Ключ</span><span>Статус</span><span class="num">Сегодня</span><span /></div>
          <div v-for="(r, i) in rows" :key="r.key" class="kr" :class="r.st" role="row" :title="r.err || ''">
            <i class="dot" /><span class="mono">{{ r.m }}</span><span class="stt">{{ r.label }}</span><span class="num">{{ r.n }}</span>
            <span class="act"><button type="button" title="Выше" :disabled="i === 0 || st === 'busy'" @click="moveKey(r.key, -1)">↑</button><button type="button" title="Ниже" :disabled="i === rows.length - 1 || st === 'busy'" @click="moveKey(r.key, 1)">↓</button><button type="button" title="Удалить ключ" :disabled="st === 'busy'" @click="removeKey(r.key)">✕</button></span>
          </div>
        </div>

        <div v-if="noKeys" class="msg bad">Нет ключей Gemini — добавьте ключ кнопкой «＋ Ключ».</div>

        <div v-if="st === 'busy'" class="prog">
          <span class="spin" /><div><b>Gemini озвучивает… {{ sec }} с</b>
            <small v-if="step">ключ {{ step.key }}<template v-if="step.n > 1"> · попытка {{ step.i + 1 }} из {{ step.n }}</template></small></div>
          <button type="button" class="ghost" @click="stop">Остановить</button>
          <i class="bar" />
        </div>
        <div v-else-if="st === 'err'" class="msg bad"><b>Не получилось.</b> {{ err?.message }}</div>
        <div v-if="res && st !== 'busy'" class="out">
          <AudioPill :key="res.url" :src="res.url" autoplay />
          <small>{{ res.dur }} · {{ modelName(res.model) }} · голос {{ res.voice }} · ответ за {{ res.took }} с · ключ {{ res.key }}</small>
        </div>

        <footer>
          <button v-if="res && st !== 'busy'" type="button" class="ghost" :disabled="noKeys" @click="go">Ещё раз · {{ voice }}</button>
          <button v-else type="button" class="pri" :disabled="st === 'busy' || !!smpBusy || noKeys || !txt.trim()" @click="go">{{ st === 'err' ? 'Попробовать ещё раз' : 'Озвучить' }}</button>
          <button v-if="res && st !== 'busy'" type="button" class="pri" @click="save">Сохранить в экран</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tts-bg { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 16px; background: rgba(10, 14, 20, .5); backdrop-filter: blur(2px) }
.tts { width: min(680px, 100%); max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box; padding: 18px 20px 16px; border-radius: 18px; background: var(--card, #fff); color: var(--text, #1a1a1a); box-shadow: 0 20px 60px rgba(0, 0, 0, .3); font-family: var(--font, system-ui) }
header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px }
header img { width: 22px; height: 22px }
header b { flex: 1; font-size: 17px }
.x { border: 0; background: none; color: var(--hint, #888); font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 8px }
.x:hover:not(:disabled) { background: var(--surface, #f1f1f1) }
.lb { display: block; margin: 0 0 6px; font-size: 12px; font-weight: 700; color: var(--hint, #777); text-transform: uppercase; letter-spacing: .04em }
textarea { width: 100%; box-sizing: border-box; margin-bottom: 14px; padding: 10px 12px; border: 1px solid var(--border, #e3e3e3); border-radius: 12px; background: var(--bg, #fff); color: inherit; font: inherit; font-size: 15px; line-height: 1.45; resize: vertical }
textarea:focus { outline: none; border-color: #4b8df8; box-shadow: 0 0 0 3px rgba(75, 141, 248, .18) }
.vg2 { display: grid; grid-template-columns: 4fr 6fr; gap: 16px; margin-bottom: 16px }
.vs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px }
.vgrp:last-child .vs { grid-template-columns: repeat(3, minmax(0, 1fr)) }
.v { display: flex; align-items: stretch; min-width: 0; border: 1px solid var(--border, #e3e3e3); border-radius: 9px; overflow: hidden }
.v.on { border-color: #4b8df8; box-shadow: inset 0 0 0 1px #4b8df8; background: rgba(75, 141, 248, .08) }
.vn { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 6px 4px 6px 9px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-align: left }
.vn b { font-size: 13px } .vn small { font-size: 11px; color: var(--hint, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100% }
.v:hover:not(.on) { border-color: #9bbcf5 }
.vp { flex: none; width: 26px; display: grid; place-items: center; padding: 0; border: 0; background: none; color: #b5b5b5; cursor: pointer }
.vp svg { width: 13px; height: 13px; fill: currentColor } .vp.has { color: #4b8df8 } .vp.play { color: #2f6fe0 } .vp:hover:not(:disabled) { background: rgba(75, 141, 248, .12) } .vp:disabled { opacity: .35; cursor: default }
.spin.sm { width: 11px; height: 11px; border-width: 2px }
.lg { margin-left: 4px; padding: 1px 6px; border: 1px solid var(--border, #ddd); border-radius: 6px; background: none; color: inherit; font: inherit; font-size: 10px; font-weight: 700; cursor: pointer } .lg.on { border-color: #4b8df8; background: rgba(75, 141, 248, .12); color: #2f6fe0 }
.lb .smp { margin-left: 8px; font-size: 10.5px; font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--hint, #999) }
.out { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px }
.out small { color: var(--hint, #777); font-size: 12px }
.mrow { display: flex; align-items: center; gap: 10px; margin-bottom: 14px } .mrow .lb { margin: 0 } .mrow small { font-size: 11px; color: var(--hint, #999) }
.mrow select { height: 32px; padding: 0 8px; border: 1px solid var(--border, #e3e3e3); border-radius: 8px; background: var(--bg, #fff); color: inherit; font: inherit; font-size: 13px }
.kh { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px } .kh .lb { margin: 0 } .kh small { font-size: 11px; color: var(--hint, #999) } .sp { flex: 1 }
.lnk { border: 0; background: none; padding: 0; color: #2f6fe0; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer }
.kadd { display: flex; align-items: center; gap: 8px; margin-bottom: 8px }
.kadd input { flex: 1; min-width: 0; height: 32px; padding: 0 10px; border: 1px solid var(--border, #e3e3e3); border-radius: 8px; background: var(--bg, #fff); color: inherit; font: 12px ui-monospace, Menlo, Consolas, monospace }
.kadd a { font-size: 12px; color: #2f6fe0; white-space: nowrap }
.kt { border: 1px solid var(--border, #e6e6e6); border-radius: 10px; overflow: hidden; margin-bottom: 14px; font-size: 12.5px }
.kr { display: grid; grid-template-columns: 22px minmax(0, 1.2fr) minmax(0, 1.5fr) 56px 76px; align-items: center; height: 32px; padding: 0 6px 0 4px; border-top: 1px solid var(--border, #eee) }
.kr:first-child { border-top: 0 }
.kth { height: 26px; background: var(--surface, #f7f7f7); font-size: 10.5px; font-weight: 700; color: var(--hint, #8a8a8a); text-transform: uppercase; letter-spacing: .04em }
.num { text-align: right; font-variant-numeric: tabular-nums; padding-right: 10px }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.stt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums }
.dot { justify-self: center; width: 7px; height: 7px; border-radius: 50%; background: #c4c4c4 }
.kr.ok .dot { background: #2fa36b } .kr.ok .stt { color: #1f8a4c }
.kr.bad .dot, .kr.wait .dot { background: #e05b5b } .kr.bad .stt, .kr.wait .stt { color: #c53030 }
.kr.cur { background: rgba(75, 141, 248, .09) } .kr.cur .stt, .kr.cur .mono { color: #2f6fe0 }
.kr.cur .dot { width: 9px; height: 9px; background: none; border: 2px solid #4b8df8; border-right-color: transparent; animation: s .7s linear infinite; box-sizing: border-box }
.act { display: flex; justify-content: flex-end; gap: 2px; opacity: .35; transition: opacity .15s } .kr:hover .act { opacity: 1 }
.act button { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: none; color: inherit; font-size: 12px; cursor: pointer }
.act button:hover:not(:disabled) { background: var(--surface, #f0f0f0) } .act button:disabled { opacity: .3; cursor: default }
.ghost.sm { height: 32px; padding: 0 12px; font-size: 13px }
@media (max-width: 560px) { .vg2 { grid-template-columns: 1fr } .kr { grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1.2fr) 40px 70px } .kh small { display: none } }
.prog { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(75, 141, 248, .1); overflow: hidden; margin-bottom: 12px }
.prog > div { flex: 1; display: flex; flex-direction: column } .prog small { color: var(--hint, #777); font-size: 12px }
.prog b { font-variant-numeric: tabular-nums }
.spin { width: 18px; height: 18px; flex: none; border: 2.5px solid #4b8df8; border-right-color: transparent; border-radius: 50%; animation: s .7s linear infinite }
.bar { position: absolute; left: 0; bottom: 0; height: 3px; width: 35%; background: linear-gradient(90deg, #4b8df8, #a35cf0); animation: b 1.4s ease-in-out infinite }
@keyframes s { to { transform: rotate(360deg) } }
@keyframes b { from { left: -35% } to { left: 100% } }
.msg { padding: 10px 14px; border-radius: 12px; font-size: 14px; margin-bottom: 12px; line-height: 1.4 }
.msg.bad { background: rgba(224, 70, 70, .1); color: #c53030 }
footer { display: flex; justify-content: flex-end; gap: 8px }
.pri, .ghost { height: 40px; padding: 0 18px; border: 0; border-radius: 12px; font: inherit; font-weight: 700; cursor: pointer }
.pri { background: linear-gradient(90deg, #4b8df8, #a35cf0); color: #fff }
.ghost { background: var(--surface, #f1f1f1); color: inherit }
.pri:disabled, .ghost:disabled { opacity: .45; cursor: not-allowed }
</style>

// Озвучка Gemini (20.11.2026) — по рабочей страничке автора «Gemini TTS Studio»: модель gemini-2.5-flash-preview-tts,
// тот же адрес и заголовок x-goog-api-key, что у проверки ключей; ответ — сырой PCM 16 бит моно (обычно 24 кГц), заворачиваем в WAV.
// Ключи — те же, что в профиле (utils/gemini.js): сверху вниз, кончилась квота (429) — ключ откладывается до времени,
// которое назвал Google, и сразу пробуется следующий. Любая другая ошибка — сразу наверх (менять ключ бессмысленно).
// Запрос идёт прямо из браузера преподавателя; ученику достаётся готовый файл экрана.
import { ai, mark, retryMs, errText, mask, listModels } from './gemini'

export const TTS_MODEL = 'gemini-2.5-flash-preview-tts'
// Модели озвучки (20.11.2026): у бесплатного проекта у КАЖДОЙ TTS-модели свой лимит (3 в минуту, 10 в сутки, сброс в 9:00 по Варшаве),
// поэтому модель выбирается в окне, а квота помнится отдельно для пары «ключ + модель». Список — из ключа (что Google ему отдаёт).
const MK = 'tma.tts.model', LK2 = 'tma.tts.models', QK = 'tma.tts.quota'
const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* приватный режим */ } }
export const getModel = () => rd(MK, TTS_MODEL)
export const setModel = (m) => wr(MK, m)
export const knownModels = () => rd(LK2, { at: 0, list: [] }).list
const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? [])[1] ?? '0')
/** «gemini-3.8-flash-tts» → «Gemini 3.8 Flash TTS» */
export const modelName = (m) => String(m).replace(/^gemini-/, 'Gemini ').replace(/-preview/, ' preview').replace(/-/g, ' ').replace(/\btts\b/i, 'TTS').replace(/\b(flash|pro|lite)\b/g, (x) => x[0].toUpperCase() + x.slice(1))
/** TTS-модели, которые видит ключ: новее — выше, Lite и Pro — ниже Flash. Кэш на сутки */
export async function ttsModels(key, fetcher = fetch, force = false) {
  const c = rd(LK2, { at: 0, list: [] })
  if (!force && c.list.length && Date.now() - c.at < 864e5) return c.list
  const list = (await listModels(key, fetcher).catch(() => [])).filter((n) => /tts/i.test(n))
    .sort((a, b) => (/lite|pro/i.test(a) ? 1 : 0) - (/lite|pro/i.test(b) ? 1 : 0) || ver(b) - ver(a) || a.length - b.length)
  if (list.length) wr(LK2, { at: Date.now(), list })
  return list.length ? list : c.list
}
/** Квота «ключ + модель»: до какого времени (мс) отдыхает */
export const quotaUntil = (key, model) => rd(QK, {})[key + '|' + model] ?? 0
function block(key, model, ms) { const q = rd(QK, {}), now = Date.now(); for (const k of Object.keys(q)) if (q[k] < now) delete q[k]; q[key + '|' + model] = now + ms; wr(QK, q) }
/** До 9:00 по Варшаве (= полночь в Калифорнии) — когда Google обнуляет суточный лимит */
export function untilReset(now = Date.now()) {
  const pt = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })), next = new Date(pt); next.setHours(24, 0, 30, 0)
  return next - pt
}
const API = 'https://generativelanguage.googleapis.com/v1beta/models/'
export const WAIT = 90_000                                  // длинный текст Google озвучивает десятки секунд
export const VOICES = [
  ['Kore', 'женский', 'уверенный'], ['Aoede', 'женский', 'лёгкий'], ['Leda', 'женский', 'молодой'], ['Zephyr', 'женский', 'яркий'],
  ['Puck', 'мужской', 'энергичный'], ['Charon', 'мужской', 'глубокий'], ['Fenrir', 'мужской', 'воодушевлённый'],
  ['Orpheus', 'мужской', 'мягкий'], ['Algenib', 'мужской', 'с хрипотцой'], ['Algieba', 'мужской', 'дикторский'],
]
const VK = 'tma.tts.voice'
export const getVoice = () => { try { const v = localStorage.getItem(VK); return VOICES.some(x => x[0] === v) ? v : 'Kore' } catch { return 'Kore' } }
export const setVoice = (v) => { try { localStorage.setItem(VK, v) } catch { /* приватный режим */ } }

/** PCM 16 бит моно → WAV */
export function pcmToWav(pcm, rate) {
  const n = pcm.length * 2, buf = new ArrayBuffer(44 + n), v = new DataView(buf)
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, n, true)
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true)
  return new Blob([buf], { type: 'audio/wav' })
}
const b64 = (s) => { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u }

/** Ответ Google → WAV-блоб и длительность */
export function wavFromResponse(data) {
  let part = null
  for (const c of data?.candidates ?? []) for (const x of c.content?.parts ?? []) if (x.inlineData?.data && !part) part = x.inlineData
  if (!part) throw new Error('Gemini не вернул звук — попробуйте ещё раз')
  const rate = +((part.mimeType || '').match(/rate=(\d+)/)?.[1] || 24000), bytes = b64(part.data)
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1)
  return { blob: pcmToWav(pcm, rate), sec: pcm.length / rate, pcm, rate }          // pcm — для нарезки пачки (utils/ttssplit.js)
}

/** Один запрос одним ключом */
async function once(key, text, voice, fetcher, signal, model = TTS_MODEL, wait = WAIT) {
  const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), wait)
  const stop = () => ac?.abort(); signal?.addEventListener?.('abort', stop)
  let r, raw          // таймаут — на весь ответ (заголовки + тело), не только на заголовки
  try { r = await fetcher(API + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), ...(ac ? { signal: ac.signal } : {}) }); raw = await r.text() }
  catch {
    if (signal?.aborted) { const e = new Error('Остановлено'); e.cancel = true; throw e }
    if (ac?.signal.aborted) { const e = new Error(`Gemini не ответил за ${Math.round(wait / 1000)} с`); e.status = 504; throw e }
    const e = new Error('Нет связи с Google'); e.net = true; throw e
  } finally { clearTimeout(tm); signal?.removeEventListener?.('abort', stop) }
  if (!r.ok) { let msg = raw; try { msg = JSON.parse(raw).error?.message ?? raw } catch { /* не JSON */ } const e = new Error(errText(r.status, msg, model)); e.status = r.status; e.wait = retryMs(raw); throw e }
  return JSON.parse(raw)
}

/** Озвучить текст: ключи по очереди. onStep({ key: 'AIzaSy…1234', i, n }) — какой ключ сейчас пробуется (для окна прогресса).
 *  Кончилась квота (429) — эта пара «ключ + модель» отдыхает (сколько сказал Google, иначе до 9:00), пробуется следующий ключ.
 *  → { blob, sec, key, model } */
export async function speak(text, voice = getVoice(), { fetcher = fetch, signal, onStep, model = getModel(), wait = WAIT } = {}) {
  const t = String(text ?? '').trim()
  if (!t) throw new Error('Нечего озвучивать — текст пустой')
  if (!ai.keys.length) { const e = new Error('Нет ключей Gemini — добавьте ключ'); e.nokeys = true; throw e }
  const now = Date.now(), free = ai.keys.filter((x) => !(quotaUntil(x.key, model) > now))
  if (!free.length) {
    const soon = Math.min(...ai.keys.map((x) => quotaUntil(x.key, model))), e = new Error(`У модели ${modelName(model)} кончился лимит на всех ключах (${ai.keys.length}) — освободится в ${new Date(soon).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}. Можно выбрать другую модель — у неё свой лимит`)
    e.quota = true; e.until = soon; throw e
  }
  let last = null
  for (let i = 0; i < free.length; i++) {
    const x = free[i]
    onStep?.({ key: mask(x.key), i, n: free.length })
    try { const data = await once(x.key, t, voice, fetcher, signal, model, wait); mark(x, true); return { ...wavFromResponse(data), key: mask(x.key), model } }
    catch (e) {
      if (e.cancel) throw e
      onStep?.({ key: mask(x.key), i, n: free.length, fail: e.message, status: e.status || 0 })          // для журнала: чем кончилась попытка
      if (e.status === 429) { block(x.key, model, e.wait > 0 && e.wait < 120e3 ? e.wait : untilReset()); x.err = `лимит ${modelName(model)}`; last = e; continue }   // ключ рабочий — лимит у этой модели
      if (e.status) mark(x, false, e)
      throw e
    }
  }
  const e = new Error(`У модели ${modelName(model)} кончился лимит на всех ключах (${free.length}). Можно выбрать другую модель — у неё свой лимит`); e.quota = true; throw e
}

// ---------- Образцы голосов (20.11.2026): одна и та же фраза каждым голосом, озвучивается один раз и хранится в этом браузере
// (IndexedDB), чтобы сравнивать голоса сколько угодно, не тратя квоту ----------
export const SAMPLES = { pl: 'Dzień dobry! Proszę opowiedzieć o polskich tradycjach świątecznych.', en: 'Hello! Today we are going to talk about your favourite hobbies and weekend plans.' }
export const SAMPLE = SAMPLES.pl
const LK = 'tma.tts.sampleLang'
export const getSampleLang = (text = '') => { try { const v = localStorage.getItem(LK); if (v in SAMPLES) return v } catch { /* нет */ } return /[ąćęłńóśźż]/i.test(text) || !/[a-z]/i.test(text) ? 'pl' : 'en' }
export const setSampleLang = (v) => { try { localStorage.setItem(LK, v) } catch { /* приватный режим */ } }
const DB = 'tma-tts', ST = 'samples'
function db() {
  return new Promise((ok, no) => {
    if (typeof indexedDB === 'undefined') return no(new Error('нет IndexedDB'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(ST)
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error)
  })
}
async function op(mode, fn) {
  const d = await db()
  return new Promise((ok, no) => { const t = d.transaction(ST, mode), q = fn(t.objectStore(ST)); t.oncomplete = () => ok(q?.result); t.onerror = () => no(t.error) })
}
const sk = (voice, phrase) => voice + '|' + phrase
export const sampleGet = (voice, phrase = SAMPLE) => op('readonly', (s) => s.get(sk(voice, phrase))).catch(() => null)
export const samplePut = (voice, blob, phrase = SAMPLE) => op('readwrite', (s) => s.put(blob, sk(voice, phrase))).catch(() => {})
export const sampleKeys = (phrase = SAMPLE) => op('readonly', (s) => s.getAllKeys()).then((ks) => (ks ?? []).filter((k) => String(k).endsWith('|' + phrase)).map((k) => String(k).split('|')[0])).catch(() => [])

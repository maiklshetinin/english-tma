// Озвучка Gemini (20.11.2026) — по рабочей страничке автора «Gemini TTS Studio»: модель gemini-2.5-flash-preview-tts,
// тот же адрес и заголовок x-goog-api-key, что у проверки ключей; ответ — сырой PCM 16 бит моно (обычно 24 кГц), заворачиваем в WAV.
// Ключи — те же, что в профиле (utils/gemini.js): сверху вниз, кончилась квота (429) — ключ откладывается до времени,
// которое назвал Google, и сразу пробуется следующий. Любая другая ошибка — сразу наверх (менять ключ бессмысленно).
// Запрос идёт прямо из браузера преподавателя; ученику достаётся готовый файл экрана.
import { ai, mark, retryMs, errText, mask } from './gemini'

export const TTS_MODEL = 'gemini-2.5-flash-preview-tts'
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
  return { blob: pcmToWav(pcm, rate), sec: pcm.length / rate }
}

/** Один запрос одним ключом */
async function once(key, text, voice, fetcher, signal) {
  const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), WAIT)
  const stop = () => ac?.abort(); signal?.addEventListener?.('abort', stop)
  let r
  try { r = await fetcher(API + TTS_MODEL + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), ...(ac ? { signal: ac.signal } : {}) }) }
  catch {
    if (signal?.aborted) { const e = new Error('Остановлено'); e.cancel = true; throw e }
    if (ac?.signal.aborted) { const e = new Error(`Gemini не ответил за ${WAIT / 1000} с — попробуйте ещё раз`); e.status = 504; throw e }
    const e = new Error('Нет связи с Google'); e.net = true; throw e
  } finally { clearTimeout(tm); signal?.removeEventListener?.('abort', stop) }
  const raw = await r.text()
  if (!r.ok) { let msg = raw; try { msg = JSON.parse(raw).error?.message ?? raw } catch { /* не JSON */ } const e = new Error(errText(r.status, msg, TTS_MODEL)); e.status = r.status; e.wait = retryMs(raw); throw e }
  return JSON.parse(raw)
}

/** Озвучить текст: ключи по очереди. onStep({ key: 'AIzaSy…1234', i, n }) — какой ключ сейчас пробуется (для окна прогресса).
 *  → { blob, sec, key } */
export async function speak(text, voice = getVoice(), { fetcher = fetch, signal, onStep } = {}) {
  const t = String(text ?? '').trim()
  if (!t) throw new Error('Нечего озвучивать — текст пустой')
  if (!ai.keys.length) { const e = new Error('Нет ключей Gemini — добавьте в профиле, раздел «Ключи Gemini»'); e.nokeys = true; throw e }
  const now = Date.now(), free = ai.keys.filter(x => !(x.until > now))
  if (!free.length) {
    const soon = Math.min(...ai.keys.map(x => x.until)), e = new Error(`Квота закончилась на всех ключах (${ai.keys.length}) — ближайший освободится в ${new Date(soon).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`)
    e.quota = true; throw e
  }
  let last = null
  for (let i = 0; i < free.length; i++) {
    const x = free[i]
    onStep?.({ key: mask(x.key), i, n: free.length })
    try { const data = await once(x.key, t, voice, fetcher, signal); mark(x, true); return { ...wavFromResponse(data), key: mask(x.key) } }
    catch (e) {
      if (e.cancel) throw e
      if (e.status) mark(x, false, e)
      if (e.status !== 429) throw e
      last = e
    }
  }
  const e = new Error(last?.message === 'Квота закончилась' ? `Квота закончилась на всех ключах (${free.length})` : last?.message || 'Не удалось озвучить'); e.quota = true; throw e
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

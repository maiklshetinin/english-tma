// Диктовка целым аудио (21.11.2026, тест — шаблон «Ответ по смыслу · целым аудио»): пишем голос целиком (WAV 16 кГц),
// после «Стоп» отправляем всю запись ОДНИМ запросом в Gemini (текстовая модель, слушает аудио) — обратно текст.
// Не Transcribe Live: та работает только потоком (кусками по 100 мс, черновик на лету), целый файл не принимает.
// Модель — свежая Flash Lite ключа (как у «Теста речи» и проверки «· Gemini API»), ключи — из профиля по очереди (квота — следующий).
import { WORKLET } from './live'
import { wavOf, LANG_NAME } from './speech'
import { ai, mark, retryMs, errText, mask } from './gemini'
import { checkModels } from './kpcheck'
import { STT, fill } from '../exercises/kp/defaults'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
export const FILE_MAX_SEC = 180          // дольше — запись останавливается сама
export const BARS = 36                   // столбиков «волны» в голосовом сообщении

const b64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s) }
const think = (m) => (/gemini-2\./.test(m) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' })          // как в kpcheck.js: без размышлений — быстрее

/** Громкости по 100 мс → BARS столбиков 0..1 (как волна голосового в Telegram) */
export function bars(levels, n = BARS) {
  if (!levels.length) return Array(n).fill(0.08)
  const out = []
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * levels.length / n), b = Math.max(a + 1, Math.floor((i + 1) * levels.length / n))
    out.push(Math.max(...levels.slice(a, b)))
  }
  const top = Math.max(...out) || 1
  return out.map((v) => Math.max(0.08, v / top))
}

/** Начать запись с микрофона. on: { level(0..1), max() — дошли до FILE_MAX_SEC }. → { stop() → { blob, sec, peaks } | null, cancel() } */
export async function recordMic({ on = {}, max = FILE_MAX_SEC } = {}) {
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })
  const ctx = new AudioContext({ sampleRate: 16000 })
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
  const src = ctx.createMediaStreamSource(mic), node = new AudioWorkletNode(ctx, 'tma-mic'); src.connect(node)
  const chunks = [], levels = []; let done = false
  node.port.onmessage = (e) => {
    if (done) return
    const f = e.data, pcm = new Int16Array(f.length); let sum = 0
    for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); sum += v * v; pcm[i] = v * 32767 }
    const lv = Math.min(1, Math.sqrt(sum / f.length) * 4)
    chunks.push(pcm); levels.push(lv); on.level?.(lv)
    if (chunks.length / 10 >= max) on.max?.()
  }
  const close = () => { if (done) return; done = true; mic.getTracks().forEach((t) => t.stop()); node.disconnect(); src.disconnect(); ctx.close().catch(() => {}) }
  return {
    stop() { if (done) return null; close(); if (!chunks.length) return null; const { blob, sec } = wavOf(chunks); return { blob, sec, peaks: bars(levels) } },
    cancel: close,
  }
}

/** Запись целиком → текст. → { text, model, key, ms }. prompt и ask — из JSON экрана (sttPrompt, sttAsk; 21.11.2026), {lang} — язык словами */
export async function transcribeFile({ blob, lang = 'pl-PL', prompt = STT.sttPrompt, ask = STT.sttAsk, fetcher = fetch }) {
  if (!ai.keys.length) throw new Error('Нужен ключ Gemini в профиле')
  const t0 = Date.now(), m = (await checkModels(ai.keys[0].key, fetcher))[0] || 'gemini-3.5-flash-lite'
  const data = await b64(blob)
  const body = (thinking) => JSON.stringify({ systemInstruction: { parts: [{ text: fill(prompt, { lang: LANG_NAME[lang] || 'польский' }) }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data } }, { text: ask }] }],
    generationConfig: { temperature: 0, ...(thinking ? { thinkingConfig: think(m) } : {}) } })
  let last = null
  for (const x of ai.keys) {
    let r, raw
    for (const thinking of [true, false]) {          // модель не знает настройки размышлений (400 про thinking) — повтор без неё
      try { r = await fetcher(`${API}/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': x.key }, body: body(thinking) }) }
      catch { r = null; break }
      raw = await r.text()
      if (!(r.status === 400 && /thinking/i.test(raw))) break
    }
    if (!r) { last = new Error('Нет связи с Google'); continue }
    if (!r.ok) {
      let msg = raw; try { msg = JSON.parse(raw).error?.message ?? raw } catch { /* */ }
      const e = new Error(errText(r.status, msg, m)); e.status = r.status; e.wait = retryMs(raw)
      if (r.status === 429) { last = e; continue }
      mark(x, false, e); throw e
    }
    mark(x, true)
    let text = ''; try { text = (JSON.parse(raw).candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim() } catch { last = new Error('Модель ответила непонятно — попробуйте ещё раз'); continue }
    return { text: text.replace(/^["«„]|["»”]$/g, '').trim(), model: m, key: mask(x.key), ms: Date.now() - t0 }
  }
  throw last || new Error('Не удалось распознать')
}

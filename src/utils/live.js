// Живой разговор с Gemini (Live API, 20.11.2026) — для упражнения «Разговор с Gemini» (exercises/talk).
// WebSocket прямо из браузера, ключ — из профиля (utils/gemini.js), как у озвучки; у Live-моделей на бесплатном уровне
// запросы в минуту и в сутки не ограничены (AI Studio → Rate limit), ограничены токены в минуту.
// Микрофон → PCM 16 бит 16 кГц кусками по 100 мс (realtimeInput.audio); ответ — PCM 24 кГц кусками (serverContent.modelTurn),
// играет очередью; перебили (serverContent.interrupted) — очередь глушится. Расшифровка обеих сторон — inputTranscription / outputTranscription.
import { ai } from './gemini'
const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key='
const LK = 'tma.live.models'
const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* приватный режим */ } }
const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? [])[1] ?? '0')

/** Live-модели ключа (умеют bidiGenerateContent): новее — выше, «думающие» — ниже. Кэш на сутки */
export async function liveModels(key, fetcher = fetch) {
  const c = rd(LK, { at: 0, list: [] })
  if (c.list.length && Date.now() - c.at < 864e5) return c.list
  try {
    const r = await fetcher(API + '?pageSize=1000', { headers: { 'x-goog-api-key': key } })
    if (!r.ok) return c.list
    const list = (JSON.parse(await r.text()).models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('bidiGenerateContent'))
      .map((m) => String(m.name).replace(/^models\//, '')).filter((n) => !/translate|transcribe/i.test(n))
      .sort((a, b) => (/think/i.test(a) ? 1 : 0) - (/think/i.test(b) ? 1 : 0) || ver(b) - ver(a) || a.length - b.length)
    if (list.length) wr(LK, { at: Date.now(), list })
    return list.length ? list : c.list
  } catch { return c.list }
}
export const liveName = (m) => String(m).replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ').replace(/\b(flash|live|native|audio|preview|dialog|lite)\b/g, (x) => x[0].toUpperCase() + x.slice(1))

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s) }
const unb64 = (s) => { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u }
// обработчик микрофона: копит 100 мс и отдаёт в основной поток (AudioWorklet из строки — без отдельного файла)
const WORKLET = `class Mic extends AudioWorkletProcessor { constructor() { super(); this.b = new Float32Array(1600); this.n = 0 }
  process(i) { const c = i[0] && i[0][0]; if (c) for (let k = 0; k < c.length; k++) { this.b[this.n++] = c[k]; if (this.n === 1600) { this.port.postMessage(this.b.slice()); this.n = 0 } } return true } }
registerProcessor('tma-mic', Mic)`

/** Начать разговор. on: { state(s, info), text(role: 'me'|'ai', chunk), turn(), level(0..1) }.
 *  state: connecting → live → ended | error. → { stop(), mute(bool) } */
/** tools — объявления функций (Live вызывает их молча, ответ — on.tool(name, args) → объект); micLater — микрофон не сразу (listen());
 *  quiet — не проигрывать голос (расшифровка всё равно идёт). Возврат: { stop, mute, quiet(v), send(text), listen() } */
export function startTalk({ key, model, system, voice, opener, lang = 'pl-PL', tools = null, micLater = false, quiet = false, rec = null, on = {} }) {          // rec(pcm, rms) — свой голос для «Теста речи»: только пока Gemini молчит
  let ws = null, ready = false, plain = false, hushed = !!quiet, mic = null, ctxIn = null, ctxOut = null, node = null, src = null, nextAt = 0, done = false, muted = false
  const playing = new Set()
  const say = (s, info) => { if (!done || s === 'ended' || s === 'error') on.state?.(s, info) }
  function stop(reason = '') {
    if (done) return; done = true
    try { ws?.close() } catch { /* уже закрыт */ }
    mic?.getTracks().forEach((t) => t.stop()); node?.disconnect(); src?.disconnect()
    playing.forEach((s) => { try { s.stop() } catch { /* */ } }); playing.clear()
    ctxIn?.close().catch(() => {}); ctxOut?.close().catch(() => {})
    on.state?.(reason ? 'error' : 'ended', reason)
  }
  function play(bytes, rate) {
    if (!ctxOut || hushed) return
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1), f = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768
    const buf = ctxOut.createBuffer(1, f.length, rate); buf.copyToChannel(f, 0)
    const s = ctxOut.createBufferSource(); s.buffer = buf; s.connect(ctxOut.destination)
    const at = Math.max(ctxOut.currentTime + 0.03, nextAt); s.start(at); nextAt = at + buf.duration
    playing.add(s); s.onended = () => playing.delete(s)
  }
  function hush() { playing.forEach((s) => { try { s.stop() } catch { /* */ } }); playing.clear(); nextAt = 0 }
  async function startMic() {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })          // шумодав браузера режет sz, cz, ś, ć — польскому вредит
    ctxIn = new AudioContext({ sampleRate: 16000 })
    await ctxIn.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
    src = ctxIn.createMediaStreamSource(mic); node = new AudioWorkletNode(ctxIn, 'tma-mic'); src.connect(node)
    node.port.onmessage = (e) => {
      if (done || ws?.readyState !== 1) return
      const f = e.data; let sum = 0; const pcm = new Int16Array(f.length)
      for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); sum += v * v; pcm[i] = muted ? 0 : v * 32767 }
      on.level?.(muted ? 0 : Math.min(1, Math.sqrt(sum / f.length) * 4))
      if (rec && !muted && !(ctxOut && ctxOut.currentTime < nextAt + 0.2)) rec(pcm, Math.sqrt(sum / f.length))          // пока звучит Gemini (и 0,2 с после) — не пишем
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } }))
    }
  }
  say('connecting')
  ctxOut = new AudioContext({ sampleRate: 24000 })
  // язык закреплён (20.11.2026: польский слышала плохо — модель сама угадывала язык и с акцентом «слышала» русский):
  // язык расшифровки и голоса — lang; пауза до «договорил» — 1,2 с (на собеседовании думают посреди фразы).
  // Не приняла настройку (старая модель) — переподключаемся без неё (plain)
  const setup = () => ({ setup: {
    model: 'models/' + model,
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { ...(voice ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } : {}), ...(lang && !plain ? { languageCode: lang } : {}) } },
    systemInstruction: { parts: [{ text: system }] },
    inputAudioTranscription: lang && !plain ? { languageCodes: [lang] } : {}, outputAudioTranscription: {},
    ...(plain ? {} : { realtimeInputConfig: { automaticActivityDetection: { endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', silenceDurationMs: 1200 } } }),
    ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
  } })
  function connect() {
    ws = new WebSocket(WS + encodeURIComponent(key))
    ws.onopen = () => ws.send(JSON.stringify(setup()))
    ws.onmessage = onMsg
    ws.onerror = () => {}
    ws.onclose = onClose
  }
  async function onMsg(e) {
    let m; try { m = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text()) } catch { return }
    if (m.setupComplete) {
      ready = true
      if (!micLater) try { await startMic() } catch (err) { return stop(err?.name === 'NotAllowedError' ? 'Нет доступа к микрофону — разрешите его в браузере' : 'Микрофон не запустился: ' + (err?.message || err)) }
      say('live')
      if (opener) ws.send(JSON.stringify({ realtimeInput: { text: opener } }))
      return
    }
    if (m.toolCall) {          // функция (оценка и т.п.) — молча: ответ в приложение, модели — «принято»
      const res = (m.toolCall.functionCalls ?? []).map((fc) => ({ id: fc.id, name: fc.name, response: { result: on.tool?.(fc.name, fc.args ?? {}) ?? { ok: true } } }))
      if (res.length && ws?.readyState === 1) ws.send(JSON.stringify({ toolResponse: { functionResponses: res } }))
    }
    const sc = m.serverContent
    if (sc) {
      if (sc.interrupted) hush()
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) play(unb64(p.inlineData.data), +((p.inlineData.mimeType || '').match(/rate=(\d+)/)?.[1] || 24000))
      if (sc.inputTranscription?.text) on.text?.('me', sc.inputTranscription.text)
      if (sc.outputTranscription?.text) on.text?.('ai', sc.outputTranscription.text)
      if (sc.turnComplete) on.turn?.()
    }
    if (m.goAway) on.state?.('live', 'Google скоро закроет разговор (лимит длины сессии)')
  }
  function onClose(e) {
    if (done) return
    const r = e.reason || ''
    if (!ready && !plain && e.code !== 1000 && !/API key|key not valid|quota|exhaust/i.test(r)) { plain = true; on.state?.('live', 'модель не приняла настройку языка — без неё'); return connect() }          // старая модель не знает languageCode и т.п.
    stop(e.code === 1000 ? '' : /API key|key not valid/i.test(r) ? 'Ключ не принят Google' : /quota|exhaust|limit/i.test(r) ? 'Лимит Live-модели исчерпан — попробуйте другую модель или ключ' : /model|not found|not supported/i.test(r) ? `Модель «${model}» недоступна для разговора: ${r}` : `Соединение закрылось (${e.code})${r ? ': ' + r : ''}`)
  }
  connect()
  return { stop: () => stop(''), mute: (v) => { muted = !!v }, quiet: (v) => { hushed = !!v; if (hushed) hush() },
    send: (text) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ realtimeInput: { text } })) },
    listen: async () => { if (mic || done) return; try { await startMic() } catch (err) { stop(err?.name === 'NotAllowedError' ? 'Нет доступа к микрофону — разрешите его в браузере' : 'Микрофон не запустился: ' + (err?.message || err)) } } }
}
/** Расшифровка речи (20.11.2026, эксперимент): Gemini 3.5 Transcribe Live — только распознавание, без собеседника.
 *  Звук — как в разговоре (PCM 16 кГц кусками по 100 мс). Сервер шлёт interimInputTranscription — черновик, пока говорят
 *  (заменяется), и inputTranscription — готовый кусок после паузы (дописывается). Сессия — до 10 минут.
 *  on: { state(s, info), interim(text), final(text), level(0..1) } → { stop() } */
export const STT_MODEL = 'gemini-3.5-transcribe-live'
export function startTranscribe({ key, model = STT_MODEL, lang = 'pl-PL', rec = null, on = {} }) {          // rec — массив: сюда же копятся куски звука (Int16Array) — для «Теста речи»
  let ws = null, mic = null, ctx = null, node = null, src = null, done = false, ready = false
  function stop(reason = '') {
    if (done) return; done = true
    try { if (ws?.readyState === 1) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })) } catch { /* */ }
    setTimeout(() => { try { ws?.close() } catch { /* */ } }, 600)          // последние слова успевают прийти
    mic?.getTracks().forEach((t) => t.stop()); node?.disconnect(); src?.disconnect(); ctx?.close().catch(() => {})
    on.state?.(reason ? 'error' : 'ended', reason)
  }
  async function startMic() {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })
    ctx = new AudioContext({ sampleRate: 16000 })
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
    src = ctx.createMediaStreamSource(mic); node = new AudioWorkletNode(ctx, 'tma-mic'); src.connect(node)
    node.port.onmessage = (e) => {
      if (done || ws?.readyState !== 1) return
      const f = e.data; let sum = 0; const pcm = new Int16Array(f.length)
      for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); sum += v * v; pcm[i] = v * 32767 }
      on.level?.(Math.min(1, Math.sqrt(sum / f.length) * 4))
      rec?.push(pcm)
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } }))
    }
  }
  on.state?.('connecting')
  ws = new WebSocket(WS + encodeURIComponent(key))
  ws.onopen = () => ws.send(JSON.stringify({ setup: { model: 'models/' + model, generationConfig: { responseModalities: ['TEXT'] }, inputAudioTranscription: { languageCodes: lang ? [lang] : [] } } }))
  ws.onmessage = async (e) => {
    let m; try { m = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text()) } catch { return }
    if (m.setupComplete) {
      ready = true
      try { await startMic() } catch (err) { return stop(err?.name === 'NotAllowedError' ? 'Нет доступа к микрофону — разрешите его в браузере' : 'Микрофон не запустился: ' + (err?.message || err)) }
      on.state?.('live'); return
    }
    const sc = m.serverContent
    if (sc?.interimInputTranscription?.text != null) on.interim?.(sc.interimInputTranscription.text)
    if (sc?.inputTranscription?.text) on.final?.(sc.inputTranscription.text)
    if (m.goAway) on.state?.('live', 'Google скоро закроет сессию — до 10 минут подряд')
  }
  ws.onerror = () => {}
  ws.onclose = (e) => {
    if (done) return
    const r = e.reason || ''
    stop(e.code === 1000 ? '' : /API key|key not valid/i.test(r) ? 'Ключ не принят Google' : /quota|exhaust|limit/i.test(r) ? 'Лимит модели расшифровки исчерпан' : !ready && /model|not found|not supported/i.test(r) ? `Модель «${model}» недоступна этому ключу: ${r}` : `Соединение закрылось (${e.code})${r ? ': ' + r : ''}`)
  }
  return { stop: () => stop('') }
}
/** Модель расшифровки из списка ключа (если Google назвал её иначе — например, с -preview) */
export async function sttModel(key, fetcher = fetch) {
  try {
    const r = await fetcher(API + '?pageSize=1000', { headers: { 'x-goog-api-key': key } })
    const list = (JSON.parse(await r.text()).models ?? []).map((m) => String(m.name).replace(/^models\//, '')).filter((n) => /transcribe/i.test(n) && /live/i.test(n))
    return list.sort((a, b) => ver(b) - ver(a))[0] || STT_MODEL
  } catch { return STT_MODEL }
}
export const firstKey = () => ai.keys.find((x) => !(x.until > Date.now()))?.key ?? ai.keys[0]?.key ?? ''

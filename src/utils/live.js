// Живой разговор с Gemini (Live API, 20.11.2026) — для упражнения «Разговор с Gemini» (exercises/talk).
// WebSocket прямо из браузера, ключ — из профиля (utils/gemini.js), как у озвучки; у Live-моделей на бесплатном уровне
// запросы в минуту и в сутки не ограничены (AI Studio → Rate limit), ограничены токены в минуту.
// Микрофон → PCM 16 бит 16 кГц кусками по 100 мс (realtimeInput.audio); ответ — PCM 24 кГц кусками (serverContent.modelTurn),
// играет очередью; перебили (serverContent.interrupted) — очередь глушится. Расшифровка обеих сторон — inputTranscription / outputTranscription.
import { ai } from './gemini'
import { overlay } from './overlay'
const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key='
// 24.11.2026: тела запросов — общими функциями: ими же собирается вкладка «Запрос в API» окна JSON (exercises/requests.ts), показ = отправка
export const LIVE_URL = WS.replace(/\?key=$/, '')
/** Первое сообщение Live-сессии (setup). plain — без настроек языка и пауз (старая модель их не приняла)
 *  @param {{ model: string, system: string, voice?: string, lang?: string, temperature?: number | null, silenceMs?: number, endSens?: string, manual?: boolean, tools?: any[] | null, plain?: boolean, extra?: object | null }} o */
export function liveSetup({ model, system, voice, lang, temperature = null, silenceMs = 1200, endSens = 'low', manual = false, tools = null, plain = false, noInterrupt = false, extra = null }) {          // extra — свои поля из JSON (request.…), поверх
  return { setup: overlay({
    model: 'models/' + model,
    generationConfig: { responseModalities: ['AUDIO'], ...(typeof temperature === 'number' ? { temperature } : {}), speechConfig: { ...(voice ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } : {}), ...(lang && !plain ? { languageCode: lang } : {}) } },
    systemInstruction: { parts: [{ text: system }] },
    inputAudioTranscription: lang && !plain ? { languageCodes: [lang] } : {}, outputAudioTranscription: {},
    // рация (manual): «договорил» решает не модель по паузе, а кнопка — шлём activityStart / activityEnd сами
    // noInterrupt (шар Live, 25.11.2026): новая речь не обрывает ответ модели — оценка по прошлой паузе доходит, пока ученик говорит дальше
    ...(manual ? { realtimeInputConfig: { automaticActivityDetection: { disabled: true }, ...(noInterrupt ? { activityHandling: 'NO_INTERRUPTION' } : {}) } } : plain ? {} : { realtimeInputConfig: { automaticActivityDetection: { endOfSpeechSensitivity: endSens === 'high' ? 'END_SENSITIVITY_HIGH' : 'END_SENSITIVITY_LOW', silenceDurationMs: silenceMs }, ...(noInterrupt ? { activityHandling: 'NO_INTERRUPTION' } : {}) } }),
    ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
  }, extra) }
}
/** setup модели расшифровки (…transcribe-live): только текст сказанного */
export const sttSetup = (/** @type {string} */ model, /** @type {string} */ lang, /** @type {object | null} */ extra = null) => ({ setup: overlay({ model: 'models/' + model, generationConfig: { responseModalities: ['TEXT'] }, inputAudioTranscription: { languageCodes: lang ? [lang] : [] } }, extra) })
/** Микрофон браузера (getUserMedia) — не API, но решает, что услышит модель */
export const micOpts = (noiseSuppression = false) => ({ audio: { echoCancellation: true, noiseSuppression: !!noiseSuppression, autoGainControl: true, channelCount: 1 } })
/** Кусок звука в Live — так идёт речь ученика, по 100 мс */
export const audioMsg = (data) => ({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } })
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
// обработчик микрофона: копит 100 мс и отдаёт в основной поток (AudioWorklet из строки — без отдельного файла); экспорт — и для записи целым аудио (sttfile.js)
export const WORKLET = `class Mic extends AudioWorkletProcessor { constructor() { super(); this.b = new Float32Array(1600); this.n = 0 }
  process(i) { const c = i[0] && i[0][0]; if (c) for (let k = 0; k < c.length; k++) { this.b[this.n++] = c[k]; if (this.n === 1600) { this.port.postMessage(this.b.slice()); this.n = 0 } } return true } }
registerProcessor('tma-mic', Mic)`

/** Начать разговор. on: { state(s, info), text(role: 'me'|'ai', chunk), turn(), level(0..1) }.
 *  state: connecting → live → ended | error. → { stop(), mute(bool) } */
/** tools — объявления функций (Live вызывает их молча, ответ — on.tool(name, args) → объект); micLater — микрофон не сразу (listen());
 *  quiet — не проигрывать голос (расшифровка всё равно идёт). Возврат: { stop, mute, quiet(v), send(text), listen() } */
/** silenceMs — пауза до «договорил», endSens — 'low' | 'high' (чувствительность конца речи), temperature — null: как у модели,
 *  noiseSuppression — шумодав браузера (по умолчанию выкл.: режет sz, cz, ś, ć). Умолчания — как было до 20.11.2026 (kp, kplive) */
export function startTalk({ key, model, system, voice, opener, lang = 'pl-PL', tools = null, micLater = false, quiet = false, rec = null, silenceMs = 1200, endSens = 'low', temperature = null, noiseSuppression = false, manual = false, gated = false, noInterrupt = false, extra = null, on = {} }) {          // gated — звук уходит только пока открыт gate(true) (рация-переключатель шара Live); rec(pcm, rms) — свой голос для «Теста речи»: только пока Gemini молчит
  let gateOn = false          // gated: микрофон включён кнопкой
  let talking = false          // manual (рация, 21.11.2026): голос уходит в модель только между talkStart() и talkEnd()
  let ws = null, ready = false, plain = false, hushed = !!quiet, mic = null, ctxIn = null, ctxOut = null, outAn = null, outBuf = null, node = null, src = null, nextAt = 0, done = false, muted = false
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
    if (ctxOut.state === 'suspended') ctxOut.resume().catch(() => {})
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1), f = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768
    const buf = ctxOut.createBuffer(1, f.length, rate); buf.copyToChannel(f, 0)
    const s = ctxOut.createBufferSource(); s.buffer = buf; s.connect(outAn || ctxOut.destination)
    const at = Math.max(ctxOut.currentTime + 0.03, nextAt); s.start(at); nextAt = at + buf.duration
    playing.add(s); s.onended = () => playing.delete(s)
  }
  function hush() { playing.forEach((s) => { try { s.stop() } catch { /* */ } }); playing.clear(); nextAt = 0 }
  async function startMic() {
    mic = await navigator.mediaDevices.getUserMedia(micOpts(noiseSuppression))          // шумодав браузера режет sz, cz, ś, ć — польскому вредит
    ctxIn = new AudioContext({ sampleRate: 16000 })
    await ctxIn.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
    src = ctxIn.createMediaStreamSource(mic); node = new AudioWorkletNode(ctxIn, 'tma-mic'); src.connect(node)
    node.port.onmessage = (e) => {
      if (done || ws?.readyState !== 1) return
      if (manual && !talking) return          // рация: кнопку не нажали — не шлём
      if (gated && !gateOn) return          // микрофон выключен кнопкой — не шлём
      const f = e.data; let sum = 0; const pcm = new Int16Array(f.length)
      for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); sum += v * v; pcm[i] = muted ? 0 : v * 32767 }
      on.level?.(muted ? 0 : Math.min(1, Math.sqrt(sum / f.length) * 4))
      if (rec && !muted && !(ctxOut && ctxOut.currentTime < nextAt + 0.2)) rec(pcm, Math.sqrt(sum / f.length))          // пока звучит Gemini (и 0,2 с после) — не пишем
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } }))
    }
  }
  say('connecting')
  ctxOut = new AudioContext({ sampleRate: 24000 })
  // громкость голоса Gemini — для персонажа (рот по голосу, 20.11.2026): звук идёт через анализатор в динамик, как раньше
  try { outAn = ctxOut.createAnalyser(); outAn.fftSize = 512; outAn.connect(ctxOut.destination); outBuf = new Float32Array(outAn.fftSize) } catch { outAn = null }
  // язык закреплён (20.11.2026: польский слышала плохо — модель сама угадывала язык и с акцентом «слышала» русский):
  // язык расшифровки и голоса — lang; пауза до «договорил» — silenceMs, по умолчанию 1,2 с (на собеседовании думают посреди фразы).
  // Не приняла настройку (старая модель) — переподключаемся без неё (plain)
  const setup = () => liveSetup({ model, system, voice, lang, temperature, silenceMs, endSens, manual, tools, plain, noInterrupt, extra })
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
      on.ready?.()
      return
    }
    if (m.toolCall) {          // функция (оценка и т.п.) — молча: ответ в приложение, модели — «принято»
      // $silent (25.11.2026, шар Live · текст): ответ функции — с scheduling SILENT: модель только принимает его к сведению и не начинает
      // новый ход (иначе она снова вызывает функцию — и так по кругу, каждые полсекунды)
      const res = (m.toolCall.functionCalls ?? []).map((fc) => { const r = on.tool?.(fc.name, fc.args ?? {}) ?? { ok: true }, { $silent, ...result } = r
        return { id: fc.id, name: fc.name, response: $silent ? { result, scheduling: 'SILENT' } : { result } } })
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
  /** Громкость голоса Gemini сейчас, 0..1 (нет звука или анализатора — 0) */
  function outLevel() { if (!outAn || done) return 0; outAn.getFloatTimeDomainData(outBuf); let sum = 0; for (let i = 0; i < outBuf.length; i++) sum += outBuf[i] * outBuf[i]; return Math.min(1, Math.sqrt(sum / outBuf.length) * 5) }
  /** Рация (manual): начало реплики — Gemini замолкает (звук обрывается сразу), голос идёт в модель; конец — модель отвечает */
  function talkStart() { if (!manual || talking || done || ws?.readyState !== 1) return; hush(); talking = true; ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } })) }
  function talkEnd() { if (!manual || !talking) return; talking = false; if (ws?.readyState === 1) ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } })) }
  /** Рация (manual): «срез» посреди речи — конец реплики и сразу начало новой, микрофон не прерывается: модель отвечает на сказанное, пока говорят дальше (шар Live, 25.11.2026; с noInterrupt ответ не обрывается) */
  function talkCut() { if (!manual || !talking || ws?.readyState !== 1) return; ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } })); ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } })) }
  /** gated: включить / выключить микрофон; выключили — audioStreamEnd: модель доделывает последнюю фразу сразу, без ожидания паузы */
  function gate(v) { v = !!v; if (!gated || v === gateOn) return; gateOn = v; if (!v && ws?.readyState === 1) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })) }
  return { stop: () => stop(''), mute: (v) => { muted = !!v }, quiet: (v) => { hushed = !!v; if (hushed) hush() }, outLevel, talkStart, talkEnd, talkCut, gate,
    send: (text) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ realtimeInput: { text } })) },
    listen: async () => { if (mic || done) return; try { await startMic() } catch (err) { stop(err?.name === 'NotAllowedError' ? 'Нет доступа к микрофону — разрешите его в браузере' : 'Микрофон не запустился: ' + (err?.message || err)) } } }
}
/** Расшифровка речи (20.11.2026, эксперимент): Gemini 3.5 Transcribe Live — только распознавание, без собеседника.
 *  Звук — как в разговоре (PCM 16 кГц кусками по 100 мс). Сервер шлёт interimInputTranscription — черновик, пока говорят
 *  (заменяется), и inputTranscription — готовый кусок после паузы (дописывается). Сессия — до 10 минут.
 *  on: { state(s, info), interim(text), final(text), level(0..1) } → { stop() } */
export const STT_MODEL = 'gemini-3.5-transcribe-live'
export function startTranscribe({ key, model = STT_MODEL, lang = 'pl-PL', rec = null, extra = null, on = {} }) {          // rec — массив: сюда же копятся куски звука (Int16Array) — для «Теста речи»
  let held = false
  let ws = null, mic = null, ctx = null, node = null, src = null, done = false, ready = false
  function stop(reason = '') {
    if (done) return; done = true
    try { if (ws?.readyState === 1) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })) } catch { /* */ }
    setTimeout(() => { try { ws?.close() } catch { /* */ } }, 600)          // последние слова успевают прийти
    mic?.getTracks().forEach((t) => t.stop()); node?.disconnect(); src?.disconnect(); ctx?.close().catch(() => {})
    on.state?.(reason ? 'error' : 'ended', reason)
  }
  async function startMic() {
    mic = await navigator.mediaDevices.getUserMedia(micOpts(false))
    ctx = new AudioContext({ sampleRate: 16000 })
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
    src = ctx.createMediaStreamSource(mic); node = new AudioWorkletNode(ctx, 'tma-mic'); src.connect(node)
    node.port.onmessage = (e) => {
      if (done || ws?.readyState !== 1 || held) return          // «Пауза» в «Live (голос)» — не шлём
      const f = e.data; let sum = 0; const pcm = new Int16Array(f.length)
      for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); sum += v * v; pcm[i] = v * 32767 }
      on.level?.(Math.min(1, Math.sqrt(sum / f.length) * 4))
      rec?.push(pcm)
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } }))
    }
  }
  on.state?.('connecting')
  ws = new WebSocket(WS + encodeURIComponent(key))
  ws.onopen = () => ws.send(JSON.stringify(sttSetup(model, lang, extra)))
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
  return { stop: () => stop(''), hold: (v) => { held = !!v },
    /** Звук кончился (рация: нажали «отправить») — распознать хвост сразу, не дожидаясь паузы; потом можно слать снова */
    flush: () => { if (ws?.readyState === 1) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })) } }
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

// ---------- Диктовка: чем распознавать (23.11.2026) ----------
// Выбор для «Надиктовать с Gemini» в «Ответе по смыслу»: auto — самая свежая …transcribe-live ключа (как было);
// модель расшифровки (…transcribe-live) — только распознаёт, черновик на лету; Live-собеседник (Gemini 3.8 Live, 3 Flash Live,
// 2.5 Native Audio…) — молча: его голос не играем и просим не отвечать, берём только расшифровку того, что сказали;
// browser — распознавание самого браузера (Web Speech, Chrome / Edge / Android; язык у него закреплён жёстко).
const TK = 'tma.stt.models'
/** Модели расшифровки потоком (…transcribe…live, умеют bidiGenerateContent): новее — выше. Кэш на сутки */
export async function sttModels(key, fetcher = fetch) {
  const c = rd(TK, { at: 0, list: [] })
  if (c.list.length && Date.now() - c.at < 864e5) return c.list
  try {
    const r = await fetcher(API + '?pageSize=1000', { headers: { 'x-goog-api-key': key } })
    if (!r.ok) return c.list
    const list = (JSON.parse(await r.text()).models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('bidiGenerateContent'))
      .map((m) => String(m.name).replace(/^models\//, '')).filter((n) => /transcribe/i.test(n) && /live/i.test(n))
      .sort((a, b) => ver(b) - ver(a) || a.length - b.length)
    if (list.length) wr(TK, { at: Date.now(), list })
    return list.length ? list : c.list
  } catch { return c.list }
}
export const DIC_BROWSER = 'browser'
const browserSR = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null)
export const hasBrowserStt = () => !!browserSR()
/** что это за выбор: 'auto' | 'stt' (модель расшифровки) | 'live' (собеседник, молча) | 'browser' */
export const dicKind = (id) => (!id || id === 'auto' ? 'auto' : id === DIC_BROWSER ? 'browser' : /transcribe/i.test(id) ? 'stt' : 'live')
/** имя для людей */
export const dicName = (id) => (dicKind(id) === 'auto' ? 'авто' : id === DIC_BROWSER ? 'Браузер (Web Speech)' : liveName(id).replace(/\bTranscribe\b/i, 'Transcribe'))
/** Варианты для списка: модели расшифровки, потом Live-собеседники, потом браузер. → [{ id, kind }] */
export async function dicChoices(key, fetcher = fetch) {
  const [s, l] = await Promise.all([key ? sttModels(key, fetcher) : [], key ? liveModels(key, fetcher) : []])
  return [...s.map((id) => ({ id, kind: 'stt' })), ...l.map((id) => ({ id, kind: 'live' })), ...(hasBrowserStt() ? [{ id: DIC_BROWSER, kind: 'browser' }] : [])]
}

export const STENO = 'Ты — стенографист. Тебя не слышат и не ждут ответа: никогда ничего не говори и не отвечай — молчи. ' +
  'Твоя задача только слушать; расшифровку сказанного делает система.'
/** Диктовка выбранным способом — тот же вид, что у startTranscribe: on { state(s, info), interim(text), final(text), level(0..1) } → { stop() }.
 *  model — уже не 'auto' (его разворачивает вызывающий через sttModel) */
export function startDictation({ key, model, lang = 'pl-PL', extra = null, on = {} }) {
  const k = dicKind(model)
  if (k === 'browser') return startBrowserStt({ lang, on })
  if (k !== 'live') return startTranscribe({ key, model, lang, extra, on })
  // Live-собеседник: голос не играем (quiet); куски расшифровки копим черновиком, конец реплики (turnComplete) — готовый кусок
  let buf = ''
  const s = startTalk({ key, model, system: STENO, lang, quiet: true, extra, on: {
    state: (st, info) => on.state?.(st, info),
    level: (v) => on.level?.(v),
    text: (role, t) => { if (role === 'me') { buf += t; on.interim?.(buf.trim()) } },
    turn: () => { const t = buf.trim(); buf = ''; if (t) on.final?.(t); on.interim?.('') },
  } })
  return { stop: () => s.stop() }
}
/** Распознавание браузера (Web Speech API): язык закреплён, черновик на лету. Chrome сам останавливается после паузы — перезапускаем */
export function startBrowserStt({ lang = 'pl-PL', on = {} }) {
  const SR = browserSR()
  let done = false, stopping = false
  const fin = (reason = '') => { if (done) return; done = true; on.state?.(reason ? 'error' : 'ended', reason) }
  on.state?.('connecting')
  if (!SR) { fin('Этот браузер не умеет распознавать речь — выберите Gemini'); return { stop: () => {} } }
  const r = new SR()
  r.lang = lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1
  let started = false
  r.onstart = () => { if (!started) { started = true; on.state?.('live') } }
  r.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) on.final?.(x[0].transcript); else interim += x[0].transcript }
    on.interim?.(interim.trim())
  }
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return
    stopping = true
    fin(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Нет доступа к микрофону — разрешите его в браузере' : e.error === 'network' ? 'Распознавание браузера: нет связи с сервером' : 'Распознавание браузера: ' + e.error)
  }
  r.onend = () => { if (!stopping && !done) { try { r.start(); return } catch { /* не перезапустился — закончим */ } } fin('') }
  try { r.start() } catch (e) { fin('Распознавание браузера не запустилось: ' + (e?.message || e)) }
  return { stop: () => { stopping = true; try { r.stop() } catch { fin('') } } }
}

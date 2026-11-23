// «Запрос в API» (24.11.2026): какие объекты уходят по сети из JSON экрана или курса — как их увидит программист.
// Собираются теми же функциями, что и при отправке (liveSetup, sttSetup, checkBody, evalBody, sttBody, bridgeBody…),
// с подставленными промптами и своими полями из request — показ не расходится с отправкой.
// Вместо ответа ученика, звука и т. п. — метки ‹…›; ключ API не показываем.
import { kpCfg, kpReady, kpApi, kpFile, fill, DIC_AUTO } from './kp/defaults'
import { talkCfg, talkSystem } from './talk/defaults'
import { liveSetup, sttSetup, micOpts, audioMsg, LIVE_URL, STENO, dicKind } from '../utils/live'
import { checkBody, checkText } from '../utils/kpcheck'
import { bridgeBody, bridgeChat, kpPlain } from '../utils/ai'
import { liveCheckText, gradeTool } from '../utils/kplive'
import { evalBody } from '../utils/speech'
import { sttBody } from '../utils/sttfile'
import { reqOf } from '../utils/overlay'

export interface Req { to: string; via: string; body: unknown; note?: string; own?: string }
const GEN = 'https://generativelanguage.googleapis.com/v1beta/models/'
const post = (m: string) => `POST ${GEN}${m}:generateContent  ·  x-goog-api-key: ‹ключ›`
const ws = `WebSocket ${LIVE_URL}?key=‹ключ› — первое сообщение`
const AUDIO = '‹звук WAV, base64›', PCM = '‹PCM 16 кГц, 100 мс, base64›'
const auto = (m: string, what: string) => (!m || m === 'auto' ? `‹${what}›` : m)

export function requests(raw: any): Req[] {
  const out: Req[] = []
  if (!raw || typeof raw !== 'object') return out
  if (raw.kind === 'kp') {
    const c: any = kpReady(kpCfg(raw))
    const q = { question: raw.text || '‹вопрос›', reference: raw.ideal || '‹эталон›', answer: '‹ответ ученика›' }
    if (!kpApi(raw)) {
      out.push({ to: 'Проверка через мост · экран → наш сервер', via: 'POST ‹сервер›/ai/check  ·  Authorization: Bearer ‹вход›', body: bridgeBody(c, q),
        note: 'Свои поля request тут не действуют: чат в браузере получает текст, а не объект API' })
      out.push({ to: 'Сервер → скрипт моста → в чат одним сообщением', via: 'GET ‹сервер›/ai/bridge/next (ответ)', body: bridgeChat(c, { ...q, reference: kpPlain(q.reference) }, 'k1a2b3') })
    } else if (c.model === 'live') {
      const t = liveCheckText(c, q)
      out.push({ to: 'Проверка голосом · Live API', via: ws, body: liveSetup({ model: auto(c.liveModel, 'auto: свежая Live-модель ключа'), system: t.system, voice: c.voice, lang: c.lang, tools: gradeTool(c.liveTool), extra: reqOf(c, 'liveCheck') }), own: 'liveCheck' })
      out.push({ to: 'Проверка голосом · следом — вопрос, эталон и ответ', via: 'WebSocket, второе сообщение', body: { realtimeInput: { text: t.data } } })
    } else {
      const m = auto(c.model, 'auto: модель из подвала или первая у ключа'), t = checkText(c, q)
      out.push({ to: 'Проверка · Gemini API', via: post(m), body: checkBody(m, t.prompt, t.user, { thinkOff: !c.thinking, temperature: c.temperature, extra: reqOf(c, 'check') }), own: 'check',
        note: 'Модель не знает thinkingConfig или responseSchema — повтор без них' })
    }
    if (kpApi(raw)) {
      const sys = fill(c.discussPrompt, { question: q.question, reference: kpPlain(q.reference), answer: q.answer, score: '‹процент›', missed: '‹чего не хватило›' })
      out.push({ to: '«Обсудить ответ голосом» · Live API', via: ws, body: liveSetup({ model: auto(c.liveModel, 'auto: свежая Live-модель ключа'), system: sys, voice: c.voice, lang: c.lang, extra: reqOf(c, 'discuss') }), own: 'discuss' })
      if (c.discussOpener) out.push({ to: '«Обсудить» · первая реплика', via: 'WebSocket, второе сообщение', body: { realtimeInput: { text: c.discussOpener } } })
    }
    if (kpFile(raw)) {
      out.push({ to: 'Расшифровка записи целиком · Gemini API', via: post('‹Flash Lite: первая у ключа›'), body: sttBody({ model: 'gemini-3.5-flash-lite', prompt: c.sttPrompt, ask: c.sttAsk, lang: c.lang, data: AUDIO, extra: reqOf(c, 'stt') }), own: 'stt',
        note: 'Модель не знает thinkingConfig — повтор без него' })
    } else {
      const dm = c.dicModel || DIC_AUTO, k = dicKind(dm)
      if (k === 'browser') out.push({ to: '«Надиктовать» · распознавание браузера', via: 'new SpeechRecognition() — не API, в Google не уходит', body: { lang: c.lang, continuous: true, interimResults: true, maxAlternatives: 1 } })
      else if (k === 'live') out.push({ to: '«Надиктовать» · Live-модель молча слушает', via: ws, body: liveSetup({ model: dm, system: STENO, lang: c.lang, extra: reqOf(c, 'dictation') }), own: 'dictation' })
      else out.push({ to: '«Надиктовать» · модель расшифровки', via: ws, body: sttSetup(auto(dm, 'auto: свежая …transcribe-live ключа'), c.lang, reqOf(c, 'dictation')), own: 'dictation' })
      if (k !== 'browser') out.push({ to: '«Надиктовать» · дальше — голос кусками', via: 'WebSocket, каждые 100 мс', body: audioMsg(PCM) })
    }
  } else if (raw.kind === 'talk') {
    const c: any = talkCfg(raw), ptt = raw.ptt === true
    out.push({ to: 'Разговор · Live API', via: ws, body: liveSetup({ model: auto(c.model, 'auto: модель из подвала или свежая Live-модель ключа'), system: talkSystem(c), voice: c.voice, lang: c.lang, temperature: c.temperature, silenceMs: c.silenceMs, endSens: c.endSens, manual: ptt, extra: reqOf(c, 'live') }), own: 'live',
      note: 'Модель не приняла язык и паузы — переподключаемся без них' })
    if (c.opener) out.push({ to: 'Первая реплика (чтобы Gemini начала)', via: 'WebSocket, второе сообщение', body: { realtimeInput: { text: c.opener } } })
    out.push({ to: 'Голос ученика', via: 'WebSocket, каждые 100 мс' + (ptt ? ' — пока зажата кнопка' : ''), body: ptt ? [{ realtimeInput: { activityStart: {} } }, audioMsg(PCM), { realtimeInput: { activityEnd: {} } }] : audioMsg(PCM) })
    out.push({ to: 'Микрофон браузера', via: 'navigator.mediaDevices.getUserMedia — не API, но решает, что услышит модель', body: micOpts(c.noiseSuppression) })
    if (ptt) {
      out.push({ to: 'Рация · расшифровка своей речи', via: ws, body: sttSetup('‹свежая …transcribe-live ключа›', c.lang, reqOf(c, 'transcribe')), own: 'transcribe' })
      if (c.guard) out.push({ to: 'Gemini ответила не на языке разговора', via: 'WebSocket, в тот же разговор', body: { realtimeInput: { text: c.guard } } })
    }
    out.push({ to: '«Оценивать речь» · Gemini API', via: post('‹модель оценки: выбор в подвале или первая у ключа›'), body: evalBody({ prompt: c.evalPrompt, ask: c.evalAsk, lang: c.lang, context: '‹реплики Gemini›', transcript: '‹что сказал ученик›', audio: AUDIO, extra: reqOf(c, 'eval') }), own: 'eval' })
  }
  return out
}

// «Тест речи» (20.11.2026, эксперимент): запись голоса (WAV 16 кГц из диктовки) + расшифровка → Gemini (текстовая модель, звук на вход)
// оценивает речь строго, как экзаменатор: уровень CEFR, понятность, словарь, грамматика, связность, беглость, произношение,
// ошибки с исправлениями (цитаты, которых нет в расшифровке, отбрасываются — модель любит выдумывать), сильные стороны, советы.
// Ключи — из профиля, по очереди (квота — следующий). Модель — Flash Lite по умолчанию (500 в сутки), выбор — в браузере.
import { ai, mark, retryMs, errText, mask } from './gemini'
import { pcmToWav } from './tts'
import { checkModels, checkName } from './kpcheck'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const PK = 'tma.speech.model'
export const MIN_SEC = 20
export const getSpeechPick = () => { try { return localStorage.getItem(PK) || '' } catch { return '' } }
export const setSpeechPick = (m) => { try { if (m) localStorage.setItem(PK, m); else localStorage.removeItem(PK) } catch { /* */ } }
export const LANG_NAME = { 'pl-PL': 'польский', 'en-US': 'английский', 'en-GB': 'английский', 'es-ES': 'испанский' }

/** Куски Int16Array (16 кГц) → { blob: WAV, sec } */
export function wavOf(chunks, rate = 16000) {
  const n = chunks.reduce((a, c) => a + c.length, 0), all = new Int16Array(n)
  let o = 0; for (const c of chunks) { all.set(c, o); o += c.length }
  return { blob: pcmToWav(all, rate), sec: n / rate }
}
const b64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s) }
const norm = (t) => String(t || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

const CRIT = { vocabulary: 'Словарь', grammar: 'Грамматика', coherence: 'Связность', fluency: 'Беглость', pronunciation: 'Произношение' }
export { CRIT }
const SCHEMA = { type: 'OBJECT', properties: {
  level: { type: 'STRING', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] }, level_plus: { type: 'BOOLEAN' }, confidence: { type: 'INTEGER' },
  intelligibility: { type: 'INTEGER' },
  scores: { type: 'OBJECT', properties: Object.fromEntries(Object.keys(CRIT).map((k) => [k, { type: 'INTEGER' }])), required: Object.keys(CRIT) },
  mistakes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { quote: { type: 'STRING' }, fix: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['quote', 'fix', 'why'] } },
  pronunciation_notes: { type: 'ARRAY', items: { type: 'STRING' } },
  read_aloud: { type: 'BOOLEAN' }, read_reason: { type: 'STRING' },
  strengths: { type: 'ARRAY', items: { type: 'STRING' } }, tips: { type: 'ARRAY', items: { type: 'STRING' } }, summary: { type: 'STRING' },
}, required: ['level', 'read_aloud', 'confidence', 'intelligibility', 'scores', 'mistakes', 'strengths', 'tips', 'summary'] }

const prompt = (lang) => `Ты строгий, но доброжелательный экзаменатор по устной речи (${LANG_NAME[lang] || 'польский'} язык), оцениваешь по шкале CEFR. ` +
  'Тебе дана ЗАПИСЬ голоса ученика и её автоматическая расшифровка. Слушай запись: беглость, паузы, темп, произношение и ударение оценивай по звуку, ' +
  'словарь, грамматику и связность — по сказанному. Расшифровка может содержать ошибки распознавания — не наказывай за них, если по звуку сказано верно. ' +
  'Описания уровней: A1 — отдельные заученные фразы; A2 — простые предложения о себе и быте, частые ошибки; B1 — связный рассказ об опыте и планах, ошибки не мешают пониманию; ' +
  'B2 — развёрнутые аргументированные ответы, разнообразный словарь, редкие ошибки; C1 — свободно, точно, гибко. Не завышай: модели склонны льстить — оценивай как на экзамене. ' +
  'Акцент сам по себе не снижает оценку, если речь понятна носителю. ' +
  'ЧТЕНИЕ: определи по звуку, читает ли ученик готовый текст или говорит заученное (ровный темп, интонация чтения, нет пауз на подбор слов, нет самоисправлений, книжная лексика, слишком гладко) — тогда read_aloud = true, ' +
  'read_reason — коротко по-русски, по каким признакам; и помни: при чтении уровень показывает сложность ТЕКСТА, а не разговорную речь — оценивай словарь и грамматику осторожно и снизь confidence. ' +
  'УВЕРЕННОСТЬ (confidence) будь честным: запись меньше 60 с — не выше 70; чтение или заученное — не выше 50; 85 и выше — только для длинной (2+ минуты) спонтанной речи. ' +
    'intelligibility — 0–100: насколько легко носитель поймёт речь (100 — без усилий). scores — 0–100 по каждому критерию. confidence — 0–100: насколько уверен в уровне (мало речи — низкая). ' +
  'mistakes — до 8 реальных ошибок: quote — ДОСЛОВНО фрагмент из расшифровки, fix — как правильно, why — коротко по-русски почему. Не выдумывай ошибок, которых нет. ' +
  'pronunciation_notes — до 4 замечаний по звукам/ударению (по-русски, с примерами слов). strengths — 2–3 сильные стороны, tips — 2–4 конкретных совета, summary — 1–2 предложения итога. Всё по-русски, кроме цитат и исправлений.'

/** → { level, plus, confidence, intelligibility, scores, mistakes, pron, strengths, tips, summary, model, sec, ms } */
export async function assessSpeech({ blob, sec, transcript, context = '', lang = 'pl-PL', model = '', fetcher = fetch }) {          // context — реплики собеседника в диалоге (не оцениваются)
  if (sec < MIN_SEC) { const e = new Error(`Мало речи для оценки: ${Math.round(sec)} с — нужно хотя бы ${MIN_SEC} с связного рассказа`); e.short = true; throw e }
  if (!ai.keys.length) throw new Error('Нужен ключ Gemini в профиле')
  const t0 = Date.now(), m = getSpeechPick() || model || (await checkModels(ai.keys[0].key, fetcher))[0] || 'gemini-3.5-flash-lite'
  const body = { systemInstruction: { parts: [{ text: prompt(lang) }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: await b64(blob) } }, { text: (context ? `Это фрагменты ДИАЛОГА: в записи — только голос ученика. Оценивай только ученика; реплики собеседника — для контекста (понимает ли ученик вопросы, отвечает ли по делу), цитаты — только из реплик ученика.\nРеплики собеседника:\n${context}\n\n` : '') + `Расшифровка речи ученика:\n${transcript || '(пусто)'}` }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA } }
  let last = null
  for (const x of ai.keys) {
    let r
    try { r = await fetcher(`${API}/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': x.key }, body: JSON.stringify(body) }) }
    catch { last = new Error('Нет связи с Google'); continue }
    const raw = await r.text()
    if (!r.ok) {
      let msg = raw; try { msg = JSON.parse(raw).error?.message ?? raw } catch { /* */ }
      const e = new Error(errText(r.status, msg, m)); e.status = r.status; e.wait = retryMs(raw)
      if (r.status === 429) { last = e; continue }
      mark(x, false, e); throw e
    }
    mark(x, true)
    let o; try { o = JSON.parse(JSON.parse(raw).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '') } catch { last = new Error('Модель ответила не JSON — попробуйте ещё раз'); continue }
    const tn = norm(transcript), clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
    const mistakes = (o.mistakes ?? []).filter((x2) => x2?.quote && norm(x2.quote) && tn.includes(norm(x2.quote))).slice(0, 8)          // цитаты только из того, что правда сказано
    const cap = o.read_aloud ? 50 : sec < 60 ? 70 : sec < 120 ? 85 : 100          // уверенность — не выше, чем позволяет запись (модели её завышают)
    return { level: String(o.level || '?'), plus: !!o.level_plus, confidence: Math.min(cap, clamp(o.confidence)), intelligibility: clamp(o.intelligibility),
      scores: Object.fromEntries(Object.keys(CRIT).map((k) => [k, clamp(o.scores?.[k])])), mistakes, dropped: (o.mistakes?.length ?? 0) - mistakes.length,
      pron: (o.pronunciation_notes ?? []).map(String).slice(0, 4), strengths: (o.strengths ?? []).map(String).slice(0, 3), tips: (o.tips ?? []).map(String).slice(0, 4),
      summary: String(o.summary ?? ''), read: !!o.read_aloud, readWhy: String(o.read_reason ?? ''), model: m, key: mask(x.key), sec, ms: Date.now() - t0 }
  }
  throw last || new Error('Не удалось оценить')
}
export { checkName }

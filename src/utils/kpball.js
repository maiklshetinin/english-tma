// «Ответ по смыслу · шар» (24.11.2026, тест; step.ball): эталон → смысловые блоки → шар из слов; речь ученика зажигает блоки.
// Всё про шар — в этом файле и в src/exercises/kp/KpBall.vue: не понравится — убрать их, флаг ball и шаблон kpball (lesson.ts).
//
// Алгоритм:
//  1. Блоки. Свои у экрана (step.keys: [{ label, words }]) — берём их. Нет — Gemini один раз режет эталон на 8–14 смысловых блоков
//     (splitBlocks), результат запоминается в браузере (по тексту вопроса и эталона), в правке — кнопкой пишется в экран (keys).
//     Пока Gemini режет — шар из «быстрых» блоков: выделения эталона (**жирное**, ==оранжевое==), иначе — начала предложений.
//  2. Пока говорят. Каждое новое слово расшифровки (Transcribe Live) — сразу локальная сверка (matchLocal): блок горит, если в речи
//     есть все его опорные слова (по первым 5 буквам: «świece» = «świec», «oczekiwania» = «oczekiwanie»). Мгновенно, без сети.
//  3. Смысл. Набралось 4+ новых слова и 2,5 с тишины — расшифровка и список блоков уходят в Gemini (coverBlocks): какие блоки
//     уже раскрыты по смыслу, своими словами тоже. Ответ — блоки загораются (шар поворачивается к ним). Пока запрос идёт — новый ждёт.
//  4. Итог. После «Проверить» — последняя сверка; нераскрытые блоки — «Не прозвучало», шар по очереди показывает их.
//  Процент на шаре — доля раскрытых блоков. Оценку «Проверить» ставит как раньше (мост / Gemini API) — шар её не меняет.
//  Статусы запросов (нарезка, сверка) — ballNet[id экрана], их рисует подвал «Ответа по смыслу» (Kp.vue), рядом с диктовкой.
import { reactive } from 'vue'
import { ai, mark } from './gemini'
import { checkModels, CHECK_DEFAULT, checkName } from './kpcheck'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const think = (m) => (/gemini-2\./.test(m) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' })

/** статусы для подвала: ballNet[id] = { split: { st, txt }, cover: { st, txt }, model } · st: off | busy | on | err */
export const ballNet = reactive({})
export const netOf = (id) => (ballNet[id] ??= { split: { st: 'off', txt: '' }, cover: { st: 'off', txt: 'ждёт речь' }, model: '' })

/** Слово → основа для сверки: строчные, только буквы, первые 5 */
export const stem = (w) => String(w).toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5)
const words = (t) => String(t || '').split(/\s+/).map(stem).filter((s) => s.length >= 3)

/** Быстрые блоки без сети: выделения эталона (**…**, ==…==), иначе — первые 3 слова каждого предложения */
export function quickBlocks(ideal) {
  const t = String(ideal || '')
  const hl = [...t.matchAll(/\*\*(.+?)\*\*|==(.+?)==/g)].map((m) => (m[1] || m[2]).trim()).filter(Boolean)
  const src = hl.length >= 3 ? hl : t.replace(/[*=_•]/g, ' ').split(/[.!?;\n]+/).map((x) => x.trim().split(/\s+/).slice(0, 3).join(' ')).filter((x) => x.length > 3)
  const seen = new Set()
  return src.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 14)
    .map((label) => ({ label: label.slice(0, 40), words: label.split(/\s+/).filter((w) => stem(w).length >= 4).slice(0, 3) }))
}

/** Локальная сверка: индексы блоков, все опорные слова которых есть в речи */
export function matchLocal(text, blocks) {
  const hs = new Set(words(text)), out = []
  blocks.forEach((b, i) => { const st = (b.words?.length ? b.words : b.label.split(/\s+/)).map(stem).filter((s) => s.length >= 3); if (st.length && st.every((s) => hs.has(s))) out.push(i) })
  return out
}

/** Один запрос generateContent с JSON-ответом — по ключам по очереди (лимит — следующий ключ) → { o, model } */
async function gen(system, user, schema) {
  if (!ai.keys.length) throw new Error('нет ключей Gemini')
  const m = (await checkModels(ai.keys[0].key))[0] || CHECK_DEFAULT
  const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, thinkingConfig: think(m) } }
  let last = null
  for (const x of ai.keys.filter((k) => !(k.until > Date.now()))) {
    try {
      const send = () => fetch(`${API}/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': x.key }, body: JSON.stringify(body) })
      let r = await send(), raw = await r.text()
      if (r.status === 400 && /think/i.test(raw)) { delete body.generationConfig.thinkingConfig; r = await send(); raw = await r.text() }
      if (!r.ok) {
        let msg = raw; try { msg = JSON.parse(raw).error?.message ?? raw } catch { /* */ }
        const e = new Error(`${r.status}: ${String(msg).slice(0, 140)}`); e.status = r.status
        if (r.status === 429) { last = e; continue }
        mark(x, false, e); throw e
      }
      mark(x, true)
      const o = JSON.parse(JSON.parse(raw).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '')
      return { o, model: m }
    } catch (e) { last = e; if (e instanceof SyntaxError || e.status === 429) continue; throw e }
  }
  throw last || new Error('Gemini не ответила')
}

const SPLIT_SYS = 'Ты готовишь упражнение для устного ответа на собеседовании. Разбей эталонный ответ на 8–14 ключевых смысловых блоков — ' +
  'отдельных фактов или мыслей, которые ученик должен назвать. Для каждого блока: label — короткая фраза на языке эталона, 2–5 слов, ' +
  'словами из эталона; words — 1–3 опорных слова из эталона (как они написаны в эталоне), по которым блок узнаётся в речи. ' +
  'Не дублируй блоки, не добавляй того, чего нет в эталоне.'
const SPLIT_SCHEMA = { type: 'OBJECT', properties: { blocks: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, words: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['label', 'words'] } } }, required: ['blocks'] }
const plain = (t) => String(t || '').replace(/\*\*|==|(^|\s)_|_(\s|$)/g, '$1$2').replace(/^• /gm, '- ')

/** Нарезка эталона на блоки (с кэшем в браузере). id — экран (статус в подвал) */
export async function splitBlocks({ id, question, ideal, force = false }) {          // force — мимо памяти браузера (кнопка в правке)
  const ck = 'tma.ball.' + hash(question + '|' + ideal)
  if (!force) try { const c = JSON.parse(localStorage.getItem(ck) || 'null'); if (Array.isArray(c) && c.length) { netOf(id).split = { st: 'on', txt: `${c.length} блоков · из памяти браузера` }; return c } } catch { /* */ }
  const n = netOf(id); n.split = { st: 'busy', txt: 'запрос ушёл — режет эталон на блоки' }
  const t0 = Date.now()
  try {
    const { o, model } = await gen(SPLIT_SYS, `Вопрос: ${question}\n\nЭталонный ответ:\n${plain(ideal)}`, SPLIT_SCHEMA)
    const b = (o?.blocks ?? []).map((x) => ({ label: String(x.label || '').trim().slice(0, 60), words: (x.words ?? []).map(String).filter(Boolean).slice(0, 3) })).filter((x) => x.label).slice(0, 16)
    if (!b.length) throw new Error('пустой ответ')
    n.model = checkName(model); n.split = { st: 'on', txt: `${b.length} блоков · ${((Date.now() - t0) / 1000).toFixed(1).replace('.', ',')} с` }
    try { localStorage.setItem(ck, JSON.stringify(b)) } catch { /* */ }
    return b
  } catch (e) { n.split = { st: 'err', txt: 'не нарезала: ' + (e.message || e) }; throw e }
}

const COVER_SYS = 'Ты сверяешь устный ответ ученика с ключевыми блоками эталона. Ответ — расшифровка речи, в ней бывают ошибки распознавания. ' +
  'Верни номера блоков, смысл которых ученик уже передал — своими словами, синонимами, с грамматическими ошибками тоже считается. ' +
  'Не засчитывай блок, если о нём ничего не сказано по смыслу.'
const COVER_SCHEMA = { type: 'OBJECT', properties: { covered: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['covered'] }

/** Сверка по смыслу: какие блоки раскрыты → индексы (с 0) */
export async function coverBlocks({ id, question, blocks, text }) {
  const n = netOf(id); n.cover = { st: 'busy', txt: 'запрос ушёл — сверяет речь с блоками' }
  const t0 = Date.now()
  try {
    const list = blocks.map((b, i) => `${i + 1}. ${b.label}`).join('\n')
    const { o, model } = await gen(COVER_SYS, `Вопрос: ${question}\n\nБлоки эталона:\n${list}\n\nРасшифровка ответа ученика:\n${text}`, COVER_SCHEMA)
    const got = [...new Set((o?.covered ?? []).map((v) => Math.round(Number(v)) - 1).filter((v) => v >= 0 && v < blocks.length))]
    n.model = checkName(model); n.cover = { st: 'on', txt: `раскрыто ${got.length} из ${blocks.length} · ${((Date.now() - t0) / 1000).toFixed(1).replace('.', ',')} с` }
    return got
  } catch (e) { n.cover = { st: 'err', txt: 'не сверила: ' + (e.message || e) }; throw e }
}

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }

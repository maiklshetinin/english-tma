// «Ответ по смыслу · шар» (24.11.2026, тест; step.ball): эталон → смысловые блоки → шар из слов; речь ученика зажигает блоки.
// Всё про шар — в этом файле и в src/exercises/kp/KpBall.vue: не понравится — убрать их, флаг ball и шаблон kpball (lesson.ts).
//
// Алгоритм:
//  0. Куда идут запросы (24.11.2026): только через МОСТ — в чат преподавателя (ChatGPT / Gemini / Claude во вкладке, server/ai.ts),
//     как проверка «Ответа по смыслу». API не используется: работал через раз. Мост не в сети — шар на быстрых блоках, статус — в подвале.
//  1. Блоки. Свои у экрана (step.keys: [{ label, words }]) — берём их. Нет — первым запросом чат режет эталон на 5–10 смысловых пунктов
//     (splitBlocks), результат запоминается в браузере (по тексту вопроса и эталона), в правке — кнопкой пишется в экран (keys).
//     Пока Gemini режет — шар из «быстрых» блоков: выделения эталона (**жирное**, ==оранжевое==), иначе — начала предложений.
//  2. Пока говорят. Каждое новое слово расшифровки (Transcribe Live) — сразу локальная сверка (matchLocal): блок горит, если в речи
//     есть все его опорные слова (по первым 5 буквам: «świece» = «świec», «oczekiwania» = «oczekiwanie»). Мгновенно, без сети.
//  3. Смысл — кнопкой «Отправить на проверку» (сказал кусок, помолчал — отправил). В чат уходят НЕ эталон, а готовые блоки из
//     первого запроса (уже засчитанные — с пометкой) и только НОВЫЙ кусок речи — то, что сказано после прошлой отправки
//     (coverBlocks). Чат отвечает, какие ещё блоки раскрыты по смыслу (своими словами тоже) — они загораются, процент растёт сразу,
//     шар по очереди поворачивается к каждому. Пока запрос идёт — следующий ждёт и уходит сразу после ответа.
//  4. Итог. После «Проверить» — последняя сверка; нераскрытые блоки — «Не прозвучало», шар по очереди показывает их.
//  Процент на шаре — доля раскрытых блоков. Оценку «Проверить» ставит как раньше (мост / Gemini API) — шар её не меняет.
//  Статусы запросов (нарезка, сверка) — ballNet[id экрана], их рисует подвал «Ответа по смыслу» (Kp.vue), рядом с диктовкой.
import { reactive } from 'vue'
import { apiRequest } from '../firebase'


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

/** Мост: текст — в чат преподавателя через наш сервер (/ai/check, как проверка «Ответа по смыслу»), ответ чата — целиком.
 *  Сервер ищет в ответе JSON со «score» и меткой {id} — поэтому в формате ответа они есть; нужное (blocks / covered) читаем из текста сами */
async function askBridge(prompt, message, format) {
  const r = await apiRequest('/ai/check', { method: 'POST', body: JSON.stringify({ prompt, message, format, question: '', reference: '', answer: '' }) })
  let b = null; try { b = await r.json() } catch { /* */ }
  if (!r.ok) { const e = new Error(b?.error || 'мост: ошибка ' + r.status); e.status = r.status; throw e }
  return { text: String(b?.text ?? ''), site: String(b?.site ?? '') }
}
/** Первый JSON-объект в тексте, где есть ключ key */
function jsonWith(text, key) {
  const s = String(text || '')
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    let d = 0, str = false, esc = false
    for (let j = i; j < s.length; j++) {
      const c = s[j]
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue }
      if (c === '"') str = true; else if (c === '{') d++
      else if (c === '}' && --d === 0) { try { const o = JSON.parse(s.slice(i, j + 1)); if (o && key in o) return o } catch { /* */ } break }
    }
  }
  return null
}
/** Запрос в чат через мост → объект из ответа (с ключом key) и какой чат ответил */
async function ask(system, user, key, fmt) {
  const { text, site } = await askBridge(system, user, fmt)
  const o = jsonWith(text, key); if (!o) throw new Error('чат ответил не в том формате')
  return { o, via: 'мост' + (site ? ' · ' + site : '') }
}

// v2 (24.11.2026): блок — целый факт («6 grudnia — dzień Mikołaja»), а не кусок фразы («w butach»): так экзаменатор и проверяет
const SPLIT_SYS = 'Ты готовишь устное упражнение к собеседованию. Разбей эталонный ответ на 5–10 смысловых пунктов — фактов, которые ' +
  'экзаменатор ждёт услышать: когда, кто, что делают, где, зачем, почему. Один пункт — одна законченная мысль. Не дроби мысль на кусочки ' +
  'и не делай отдельный пункт из каждого слова перечисления: «słodycze, zabawki lub książki» и «pod poduszką lub w butach» — части одного ' +
  'пункта о подарках. Для каждого пункта: label — суть пункта на языке эталона, 3–6 слов, понятная сама по себе, например ' +
  '«6 grudnia — dzień Mikołaja», «Mikołaj był biskupem z Miry», «prezenty pod poduszką lub w butach»; words — 1–3 самых характерных ' +
  'слова этого пункта, как они написаны в эталоне, по ним пункт узнаётся в речи. Не добавляй того, чего нет в эталоне.'
const plain = (t) => String(t || '').replace(/\*\*|==|(^|\s)_|_(\s|$)/g, '$1$2').replace(/^• /gm, '- ')

/** Нарезка эталона на блоки (с кэшем в браузере). id — экран (статус в подвал) */
export async function splitBlocks({ id, question, ideal, force = false }) {          // force — мимо памяти браузера (кнопка в правке)
  const ck = 'tma.ball2.' + hash(question + '|' + ideal)          // ball2 — нарезка v2 (старые кусочки в памяти браузера не берём)
  if (!force) try { const c = JSON.parse(localStorage.getItem(ck) || 'null'); if (Array.isArray(c) && c.length) { netOf(id).split = { st: 'on', txt: `${c.length} блоков · из памяти браузера` }; return c } } catch { /* */ }
  const n = netOf(id); n.split = { st: 'busy', txt: 'запрос ушёл в чат через мост — режет эталон на блоки' }
  const t0 = Date.now()
  try {
    const { o, via } = await ask(SPLIT_SYS, `Вопрос: ${question}\n\nЭталонный ответ:\n${plain(ideal)}`, 'blocks',
      'Ответь только JSON без пояснений: {"id":"{id}","score":0,"blocks":[{"label":"…","words":["…"]}]}')
    const b = (o?.blocks ?? []).map((x) => ({ label: String(x.label || '').trim().slice(0, 60), words: (x.words ?? []).map(String).filter(Boolean).slice(0, 3) })).filter((x) => x.label).slice(0, 16)
    if (!b.length) throw new Error('пустой ответ')
    n.model = via; n.split = { st: 'on', txt: `${b.length} блоков · ${((Date.now() - t0) / 1000).toFixed(1).replace('.', ',')} с` }
    try { localStorage.setItem(ck, JSON.stringify(b)) } catch { /* */ }
    return b
  } catch (e) { n.split = { st: 'err', txt: 'не нарезала: ' + (e.message || e) }; throw e }
}

// 24.11.2026: по каждому засчитанному блоку — что ученик сказал (цитата из расшифровки), правильно по-польски и короткое пояснение
const COVER_SYS = 'Ты сверяешь устный ответ ученика с ключевыми смысловыми блоками эталона. Ответ — расшифровка речи, в ней бывают ошибки распознавания. ' +
  'Засчитай блок, если ученик передал его смысл — своими словами, синонимами, с грамматическими ошибками тоже считается. Не засчитывай, если о нём ничего не сказано. ' +
  'Для каждого засчитанного блока: n — номер блока; said — дословная цитата из расшифровки, которой ученик это сказал (коротко, 2–10 слов); ' +
  'fix — как эту цитату правильно сказать по-польски, если в ней есть языковая ошибка (иначе пустая строка; ошибки распознавания речи не исправляй); ' +
  'note — если fix не пустой: одной короткой фразой по-русски, что исправлено, иначе пустая строка. ' +
  'Ответ приходит кусками: сверяй только новый кусок; блоки с пометкой «уже засчитан» не возвращай; said — цитата из нового куска.'

/** Сверка по смыслу → [{ i (с 0), said, fix, note }] — раскрытые блоки: что сказал ученик и исправление, если ошибся */
export async function coverBlocks({ id, question, blocks, text, done = [], before = '' }) {          // text — новый кусок речи; done — номера уже засчитанных; before — что говорил раньше (для связности)
  const n = netOf(id); n.cover = { st: 'busy', txt: 'запрос ушёл в чат — сверяет речь с блоками' }
  const t0 = Date.now()
  try {
    const dn = new Set(done), list = blocks.map((b, i) => `${i + 1}. ${b.label}${dn.has(i) ? ' — уже засчитан' : ''}`).join('\n')
    const ctx = before.trim() ? `\n\nРаньше ученик уже сказал (для связности, заново не засчитывай):\n${before.trim()}` : ''
    const { o, via } = await ask(COVER_SYS, `Вопрос: ${question}\n\nСмысловые блоки эталона (из нарезки):\n${list}${ctx}\n\nНовый кусок ответа ученика — сверь его с ещё не засчитанными блоками:\n${text}`, 'covered',
      'Ответь только JSON без пояснений: {"id":"{id}","score":<сколько процентов блоков раскрыто>,"covered":[{"n":<номер блока>,"said":"…","fix":"","note":""}]}')
    const seen = new Set(), got = []
    for (const v of o?.covered ?? []) {          // старый вид — просто номера
      const x = typeof v === 'object' && v ? v : { n: v }, i = Math.round(Number(x.n)) - 1
      if (i < 0 || i >= blocks.length || seen.has(i) || dn.has(i)) continue
      seen.add(i); got.push({ i, said: String(x.said ?? '').trim(), fix: String(x.fix ?? '').trim(), note: String(x.note ?? '').trim() })
    }
    n.model = via; n.cover = { st: 'on', txt: `раскрыто ${got.length} из ${blocks.length} · ${((Date.now() - t0) / 1000).toFixed(1).replace('.', ',')} с` }
    return got
  } catch (e) { n.cover = { st: 'err', txt: 'не сверила: ' + (e.message || e) }; throw e }
}

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }

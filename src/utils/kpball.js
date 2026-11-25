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
//  ШАР LIVE (step.ballLive, шаблон kpballive): без моста — одна Live-сессия (WebSocket) на экран. Эталон — в системной инструкции
//  (ballPrompt из JSON экрана). Микрофон — рация: нажал — слушает, нажал ещё раз — модель молча вызывает cover: какие куски эталона
//  ученик передал (ref — дословно, said — что сказал). Процент и «не прозвучало» — на фронте (refCover). Нарезки на блоки и «РЕЧЬ: …» текстом нет.
//  Статусы запросов (нарезка, сверка) — ballNet[id экрана], их рисует подвал «Ответа по смыслу» (Kp.vue), рядом с диктовкой.
import { reactive } from 'vue'
import { apiRequest } from '../firebase'
import { firstKey, startTalk, liveModels, liveName } from './live'


/** статусы для подвала: ballNet[id] = { split: { st, txt }, cover: { st, txt }, model } · st: off | busy | on | err */
export const ballNet = reactive({})
// lv — шар Live (25.11.2026): что сейчас — ph: '' | 'rec' (слушает, cut — время прошлого среза) | 'think' (кусок ушёл, at — когда; Gemini ищет совпадения);
//   last — итог прошлой сверки: { n — сколько засчитано, ms — сколько думала }
export const netOf = (id) => (ballNet[id] ??= { split: { st: 'off', txt: '' }, cover: { st: 'off', txt: 'ждёт речь' }, model: '', lv: { ph: '', at: 0, cut: 0, last: null }, log: [] })
// log — журнал Live-сессии шара (25.11.2026, для отладки): что ушло и что ответила модель — открывается нажатием на статус в подвале.
//   { t — с от начала, k — вид (mic | voice | pause | heard | cover | blocks | said | turn | err | send), x — текст }

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


// =====================================  ШАР LIVE  =====================================
// v3 (25.11.2026): БЕЗ нарезки на блоки — нарезка дробила мысли и путала засчитывание. Эталон целиком — в системной инструкции.
// Модель делает ОДНО: после каждой реплики присылает, какие куски эталона ученик передал (ref — дословно из эталона). Никаких процентов и итогов
// от модели (врут): процент и «не прозвучало» считает фронт — refCover() ниже: какие слова эталона покрыты найденными кусками
// Текст инструкции и описание функции — из JSON экрана (ballPrompt, ballTool; умолчания — exercises/kp/defaults.ts, BALL), 25.11.2026
/** Функция шара Live: имена и типы — здесь (их читает приложение), описание — из JSON экрана (ballTool) */
export const ballTools = (description, fix = false) => [          // fix — «· разбор ошибок» (kpballfix, 25.11.2026): ещё и как правильно сказать фразу ученика
  { name: 'cover', description,
    parameters: { type: 'OBJECT', properties: { found: { type: 'ARRAY', items: { type: 'OBJECT', properties: { ref: { type: 'STRING' }, said: { type: 'STRING' }, ...(fix ? { fix: { type: 'STRING' } } : {}) }, required: ['ref'] } } }, required: ['found'] } },
]
/** Слова эталона (как написаны) и их основы — для подсчёта на фронте */
export function refWords(ideal) { return plain(ideal).split(/\s+/).filter(Boolean).map((w) => ({ w, s: stem(w) })).filter((x) => x.s) }
/** Процент на фронте (25.11.2026): каждый найденный кусок (ref) ищем в эталоне — окно той же длины с наибольшим числом совпавших основ слов
 *  (первые 5 букв, как matchLocal); совпало ≥ 60 % — слова окна покрыты. pct — доля покрытых слов эталона; missed — непокрытые куски
 *  (подряд ≥ 3 слов), в порядке эталона. → { pct, hit: boolean[], words, missed: string[], placed: boolean[] (какие ref нашлись в эталоне) } */
export function refCover(ideal, refs) {
  const words = refWords(ideal), hit = words.map(() => false), placed = []
  for (const r of refs) {
    const rs = String(r).split(/\s+/).map(stem).filter(Boolean); if (!rs.length) { placed.push(false); continue }
    const L = rs.length; let best = -1, bm = []
    // окно — от слова i, длиной до L + 2, не дальше конца предложения; каждое слово куска засчитывается один раз (две «Kalendarz» подряд — не два совпадения)
    for (let i = 0; i < words.length; i++) {
      const left = new Map(); rs.forEach((x) => left.set(x, (left.get(x) || 0) + 1))
      const m = []; for (let k = 0; k < L + 2 && i + k < words.length; k++) { const st = words[i + k].s; if (left.get(st)) { left.set(st, left.get(st) - 1); m.push(i + k) } if (/[.!?]$/.test(words[i + k].w)) break }          // +2 слова запаса: модель пропустила или вставила слово
      if (m.length > best) { best = m.length; bm = m }
    }
    const ok = best >= Math.max(1, Math.ceil(L * 0.6)); placed.push(ok)
    if (ok) { bm.forEach((j) => { hit[j] = true }); for (let j = bm[0]; j < bm.at(-1); j++) hit[j] = true }          // дыры внутри куска (предлоги и т.п.) — тоже покрыты
  }
  const missed = []; let run = []
  const end = () => { if (run.length >= 3) missed.push(run.join(' ').replace(/[,;:]$/, '')); run = [] }
  words.forEach((x, i) => { if (hit[i]) end(); else { run.push(x.w); if (/[.!?]$/.test(x.w)) end() } }); end()
  const pct = words.length ? Math.round((hit.filter(Boolean).length / words.length) * 100) : 0
  return { pct, hit, words, missed, placed }
}
/** «Шар Live · текст» (kpballtext, 25.11.2026): засчитываются только СКАЗАННЫЕ слова. Кусок (ref) ищем в эталоне как refCover,
 *  но из его слов открываем лишь те, чьи основы есть в said (что сказал ученик): модель вернула кусок длиннее сказанного — лишнее
 *  остаётся размытым и в процент не идёт. said пустой — как раньше, весь кусок. → { pct, hit, words, missed, items: [{ idx: [номера слов эталона], parts: [{ w, on }] }] } */
export function saidCover(ideal, found) {
  const words = refWords(ideal), hit = words.map(() => false), items = []
  for (const f of found) {
    const one = refCover(ideal, [f.ref])
    if (!one.placed[0]) { items.push({ idx: [], parts: String(f.ref).split(/\s+/).filter(Boolean).map((w) => ({ w, on: false })) }); continue }
    const said = String(f.said || '').trim(), ss = new Set((said || f.ref).split(/\s+/).map(stem).filter(Boolean))
    const span = one.hit.map((h, j) => (h ? j : -1)).filter((j) => j >= 0), idx = [], parts = []
    for (let j = span[0]; j <= span.at(-1); j++) { const on = ss.has(words[j].s); parts.push({ w: words[j].w, on }); if (on) { idx.push(j); hit[j] = true } }
    items.push({ idx, parts })
  }
  const missed = []; let run = []
  const end = () => { if (run.length >= 3) missed.push(run.join(' ').replace(/[,;:]$/, '')); run = [] }
  words.forEach((x, i) => { if (hit[i]) end(); else { run.push(x.w); if (/[.!?]$/.test(x.w)) end() } }); end()
  const pct = words.length ? Math.round((hit.filter(Boolean).length / words.length) * 100) : 0
  return { pct, hit, words, missed, items }
}
/** Live-сессия шара. system, tool — из JSON экрана; onCover([{ ref, said }]) — найденные куски эталона; onTurn() — модель договорила.
 *  → { send(text), stop(), alive, model }. Сообщения до готовности сессии ждут в очереди */
const liveSessions = {}          // id экрана → api открытой Live-сессии (микрофон диктовки берёт её же)
export function openBallLive({ id, question, ideal, system, tool, fix = false, guard = false, extra = null, onCover, onTurn }) {          // guard — «· текст» (25.11.2026): засчитанное без речи отсекаем (см. ниже)          // system, tool — из JSON экрана (ballPrompt с подставленными вопросом и эталоном, ballTool); onCover([{ ref, said }])
  const n = netOf(id), key = firstKey()
  if (!key) throw new Error('Нужен ключ Gemini в профиле')
  let sess = null, ready = false, closed = false, modelName = '', modelId = '', t0 = Date.now()
  const queue = []
  const flush = () => { if (!ready || !sess) return; while (queue.length) { const t = queue.shift(); t0 = Date.now(); sess.send(t); lg('send', t.replace(/\n/g, ' ').slice(0, 160)) } }
  const fail = (txt) => { lg('err', txt); closed = true; n.cover = { st: 'err', txt } }
  // рация-переключатель (25.11.2026, вернули самый стабильный вариант): нажал — микрофон включён (manual: activityStart), говоришь сколько нужно;
  // нажал ещё раз — выключен (activityEnd): Live ОДИН раз сверяет всё сказанное и присылает cover. Выключен — в Live не уходит ни звука.
  // (Пробовали засчитывать на ходу — по паузам и срезами раз в 5 с — работало нестабильно, убрали.) wait — выключили, ждём ответ
  let hearH = null, hearUntil = 0, micOn = false, wait = false, waitTm = 0
  let talking = false, heardV = false
  // guard (kpballtext, 25.11.2026, v2): модель иногда сама «выплёвывает» засчитанное, когда ученик ничего не говорил. Принимаем куски
  // только в окне реплики: микрофон включён, или его выключили и ждём ответ (wait), или 3,5 с после ответа (hearUntil) — как устроено у
  // «нового вида». Вне окна (никто не нажимал микрофон) — отсекаем и пишем в журнал. Голос и расшифровку больше не требуем: у Live в этом
  // режиме их может не быть (v1 из-за этого отсекала настоящие ответы)
  let cuts = 0
  // v3 (25.11.2026): расшифровка реплики («облачко» — что услышала Live) копится за нажатие (heard) и уходит вместе с ответом —
  // KpBall хранит её сообщением. Куски модели сверяем с ней: в услышанном нет хотя бы половины слов куска (said) — кусок отбрасываем.
  // Расшифровка приходит чуть позже функции — ответ держим до конца хода + 0,6 с тишины расшифровки (не дольше 3 с)
  let heard = '', pend = null, pendTm = 0, turnDone = false
  const stems = (t) => String(t).split(/\s+/).map(stem).filter((x) => x.length >= 3)
  function deliver() {
    clearTimeout(pendTm); if (!pend) return
    const got = pend, h = heard.trim(); pend = null
    let ok = got, bad = []
    if (h) {
      const hs = new Set(stems(h)); ok = []; bad = []
      for (const x of got) { const ss = stems(x.said || x.ref); (ss.length && ss.filter((v) => hs.has(v)).length / ss.length >= 0.5 ? ok : bad).push(x) }
      if (bad.length) { cuts += bad.length; n.cut = cuts; lg('cut', `отсечено ${bad.length}: в услышанном этого нет · ` + bad.map((x) => x.said || x.ref).join(' | ')) }
    } else if (got.length) lg('app', 'расшифровки реплики нет — проверить нечем, засчитано как прислала модель')
    if (n.lv?.last) n.lv.last.n = ok.length
    onCover?.(ok, { heard: h, bad })
  }
  const later = (ms) => { clearTimeout(pendTm); pendTm = setTimeout(deliver, ms) }
  if (!n.lv) n.lv = { ph: '', at: 0, cut: 0, last: null }
  if (!n.log) n.log = []
  n.log.splice(0); const T0 = Date.now(); n.t0 = T0
  /** в журнал; same — дописать к прошлой строке того же вида (расшифровка идёт кусками) */
  const lg = (k, x, same = false, full = '') => { const t = +((Date.now() - T0) / 1000).toFixed(1), last = n.log.at(-1); if (same && last?.k === k) { last.x += x; return } n.log.push({ t, k, x: String(x), ...(full ? { full: String(full) } : {}) }); if (n.log.length > 120) n.log.splice(0, n.log.length - 120) }          // full — целиком (журнал колонкой, 25.11.2026)
  const L = n.lv          // реактивный — его рисует подвал (строка «слушает / ищет совпадения / засчитано»)
  const think = (at = Date.now()) => { L.ph = 'think'; L.at = t0 = at }
  const endWait = () => { clearTimeout(waitTm); if (wait) { wait = false; hearUntil = Date.now() + 3500; const h0 = hearH; setTimeout(() => { if (!talking && hearH === h0) hearH = null }, 2500) } }          // хвост расшифровки ещё 2,5 с идёт в поле; текстом не дублируем
  const api = {
    get model() { return modelName }, get modelId() { return modelId }, get alive() { return !closed },
    get hearing() { return !!hearH || wait || Date.now() < hearUntil },
    get pending() { return talking || wait },          // «Готово» ждёт: микрофон ещё включён или ответ на последнюю реплику не пришёл
    send(text) { if (closed) return; queue.push(text); flush() },
    stop() { closed = true; L.ph = ''; delete liveSessions[id]; try { sess?.stop() } catch { /* */ } },
    /** Голос — прямо в Live: h = { text(кусок расшифровки), turn(), level(0..1) } или null — выключить */
    async hear(h) {
      if (!h) {          // отпустили кнопку — конец реплики: модель отвечает сразу; хвост расшифровки и ответ ещё идут прежнему слушателю
        if (!sess || !talking) { hearH = null; return }
        talking = false; sess.talkEnd(); lg('mic', 'микрофон выключен — Live сверяет всё сказанное'); wait = true; think(); n.cover = { st: 'busy', txt: 'сверяет речь' }
        clearTimeout(waitTm); waitTm = setTimeout(endWait, 12_000)          // ответа нет 12 с — не держим
        return
      }
      if (closed || !sess || !ready) throw new Error('Live не подключён')
      hearH = h; if (!micOn) { micOn = true; await sess.listen() }
      if (hearH !== h) return          // отпустили, пока микрофон включался — реплики не было
      talking = true; L.ph = 'rec'; sess.talkStart(); lg('mic', 'микрофон включён — звук идёт в Live'); heardV = false; heard = ''; pend = null; turnDone = false; clearTimeout(pendTm); n.cover = { st: 'on', txt: 'слушает' }          // включили — звук пошёл в Live
    },
  }
  liveSessions[id] = api
  n.cover = { st: 'busy', txt: 'подключаюсь к Live-модели…' }
  ;(async () => {
    try {
      const m = (await liveModels(key))[0]
      if (!m) throw new Error('Google не дал ключу Live-модели')
      modelId = m; modelName = liveName(m); n.model = modelName + ' · Live'
      if (closed) return
      sess = startTalk({ key, model: m, system, lang: 'pl-PL', temperature: 0.2, tools: ballTools(tool, fix), extra, micLater: true, quiet: true, manual: true, on: {
        state: (st, info) => { if (st === 'live') { if (info) return; n.cover = { st: 'on', txt: 'Live на связи · ждёт речь' } } else if (st === 'error') fail('Live: ' + (info || 'ошибка')); else if (st === 'ended' && !closed) fail('Live: соединение закрыто') },
        ready: () => { ready = true; lg('send', 'соединение готово · ' + modelId + ' · инструкция (ballPrompt): ' + String(system).replace(/\s+/g, ' ').slice(0, 300) + '…', false, system); flush() },
        turn: () => { if (guard && pend) { turnDone = true; later(heard ? 600 : 1500) } lg('turn', 'модель закончила ход · ' + ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' с'); hearH?.turn?.(); if (L.ph === 'think') L.ph = talking ? 'rec' : ''; if (wait) endWait(); onTurn?.() },
        text: (role, t) => { if (role === 'me') { if (guard) { heard += t; if (pend && turnDone) later(600) } lg('heard', t, true); hearH?.text?.(t) } else lg('said', t, true) },          // said — модель заговорила вместо функции (не должна)
        level: (v) => { if (talking && v > 0.06 && !heardV) { heardV = true; lg('voice', 'микрофон слышит голос') } hearH?.level?.(v) },          // громкость микрофона (идёт только пока он включён) — по ней видно, что говорят
        tool: (name, args) => {
          const sec = ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' с'
          if (name === 'cover') {
            lg('cover', JSON.stringify(args).slice(0, 400) + ' · ' + sec, false, JSON.stringify(args, null, 1))
            const got = (Array.isArray(args?.found) ? args.found : []).map((x) => ({ ref: String(x?.ref ?? '').trim().slice(0, 120), said: String(x?.said ?? '').trim(), fix: String(x?.fix ?? '').trim() })).filter((x) => x.ref)
            n.cover = { st: 'on', txt: (got.length ? `найдено ${got.length}` : 'нового нет') + ` · ${sec}` }
            if (L.ph === 'think') L.last = { n: got.length, ms: Date.now() - L.at }
            if (guard && got.length && !(talking || wait || Date.now() < hearUntil)) {          // вне окна реплики — модель сама, без речи
              cuts += got.length; n.cut = cuts; lg('cut', `отсечено ${got.length}: микрофон не нажимали — модель прислала сама · ` + got.map((x) => x.ref).join(' | '))
              return { ok: true }
            }
            if (guard) { if (!(talking || wait || Date.now() < hearUntil)) return { ok: true }; if (got.length || !pend) { pend = [...(pend ?? []), ...got]; later(3000) } return { ok: true } }          // пустой вне окна — модель гоняет по кругу, молча          // ждём конец хода и расшифровку
            onCover?.(got); return { ok: true }
          }
          lg('err', 'неизвестная функция ' + name)
          return { ok: false, error: 'неизвестная функция' }
        },
      } })
    } catch (e) { fail('Live: ' + (e.message || e)) }
  })()
  return api
}

export const ballLiveOf = (id) => liveSessions[id]
/** Запись в журнал Live со стороны приложения (что сделали с ответом модели), 25.11.2026 */
export function ballLog(id, k, x) { const n = netOf(id); if (!n.log) n.log = []; n.log.push({ t: +((Date.now() - (n.t0 || Date.now())) / 1000).toFixed(1), k, x: String(x) }) }
/** Диктовка через Live-сессию шара — тот же вид, что у startDictation: on { state, interim, final, level } → { stop } */
export function startBallDictation({ id, on = {} }) {
  const lv = liveSessions[id]
  let buf = '', tm = 0, done = false
  const flush = () => { clearTimeout(tm); const t = buf.trim(); buf = ''; if (t) on.final?.(t); on.interim?.('') }
  const fin = (r = '') => { if (done) return; done = true; flush(); lv?.hear(null); on.state?.(r ? 'error' : 'ended', r) }          // хвост фразы, пришедший после — допишется сам (flush по таймеру)
  on.state?.('connecting')
  if (!lv?.alive) { on.state?.('error', 'Live ещё не подключился — секунду и нажмите снова'); return { stop() {} } }
  lv.hear({
    text: (t) => { buf += t; on.interim?.(buf.trim()); clearTimeout(tm); tm = setTimeout(flush, 1500) },          // кусок расшифровки: ждём ещё 1,5 с, потом в поле
    turn: flush,
    level: (v) => on.level?.(v),
  }).then(() => { if (!done) on.state?.('live') }, (e) => fin('Микрофон: ' + (e?.message || e)))
  return { stop: () => fin('') }
}

/** «· разбор ошибок» (25.11.2026): фраза ученика → исправленная, по словам. Кусочки: { t } — как было, { del, ins } — зачеркнуть del, сверху ins */
export function fixDiff(said, fix) {
  const a = String(said ?? '').split(/\s+/).filter(Boolean), b = String(fix ?? '').split(/\s+/).filter(Boolean)
  const k = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  if (!b.length || a.map(k).join(' ') === b.map(k).join(' ')) return a.length ? [{ t: a.join(' ') }] : []
  // LCS с конца: совпадения прижимаем к концу фразы — ошибка и исправление встают рядом одним кусочком
  const P = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) P[i][j] = k(a[i - 1]) === k(b[j - 1]) ? P[i - 1][j - 1] + 1 : Math.max(P[i - 1][j], P[i][j - 1])
  const ops = []
  let i = a.length, j = b.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && k(a[i - 1]) === k(b[j - 1])) { ops.push({ t: b[j - 1] }); i--; j-- }
    else if (j > 0 && (i === 0 || P[i][j - 1] >= P[i - 1][j])) { ops.push({ ins: b[j - 1] }); j-- }
    else { ops.push({ del: a[i - 1] }); i-- }
  }
  const out = [], push = (x) => { const p = out[out.length - 1]; if (x.t != null && p?.t != null) p.t += ' ' + x.t; else if (x.t == null && p && p.t == null) { if (x.del) p.del = (p.del ? p.del + ' ' : '') + x.del; if (x.ins) p.ins = (p.ins ? p.ins + ' ' : '') + x.ins } else out.push({ ...x }) }
  ops.reverse().forEach(push)
  return out
}

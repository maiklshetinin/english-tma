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
//  ШАР LIVE (24.11.2026, тест; step.ballLive, шаблон kpballive): то же самое, но без моста — одна Live-сессия (WebSocket) на упражнение.
//  Эталон — в системной инструкции; первое сообщение «РАЗБЕЙ» (или «БЛОКИ: …», если блоки уже есть) — модель молча вызывает функцию blocks;
//  дальше каждый новый кусок расшифровки уходит текстом «РЕЧЬ: …», модель молча вызывает cover(n, score 1 / 0.5, said). Голос модели не играет.
//  v3 (25.11.2026): без нарезки — эталон целиком, модель только присылает найденные в нём куски (cover: found[{ ref, said }]);
//  процент и «не прозвучало» — на фронте (refCover). Нарезка (blocks) у шара Live больше не используется.
//  Голос (25.11.2026) — рация-переключатель: нажал — микрофон включён, нажал ещё раз — выключен, и модель СРАЗУ один раз вызывает cover
//  (пустой — если нового нет). В подвале: слушает → Gemini ищет совпадения (секундомер от выключения) → засчитано за N с; нажатие — журнал.
//  Статусы — те же ballNet (подвал). Реализация — openBallLive внизу файла.
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
export const ballTools = (description) => [
  { name: 'cover', description,
    parameters: { type: 'OBJECT', properties: { found: { type: 'ARRAY', items: { type: 'OBJECT', properties: { ref: { type: 'STRING' }, said: { type: 'STRING' } }, required: ['ref'] } } }, required: ['found'] } },
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
/** «БЛОКИ: 1. … 2. …» — список для модели, когда блоки уже есть (свои у экрана или из памяти браузера) */
export const blocksMsg = (b) => 'БЛОКИ:\n' + b.map((x, i) => `${i + 1}. ${x.label}`).join('\n')
const lck = (q, i) => 'tma.ballL.' + hash(q + '|' + i)          // нарезка Live — своя память (ballL), чтобы не путать с мостом
/** Нарезка Live из памяти браузера (по тексту вопроса и эталона) или null */
export const liveCached = (q, i) => { try { const c = JSON.parse(localStorage.getItem(lck(q, i)) || 'null'); return Array.isArray(c) && c.length ? c : null } catch { return null } }
/** Live-сессия шара. cb: { onBlocks([{label, words}]), onCover([{ i (с 0), score 0..1, said }]), onTurn() — модель договорила }.
 *  → { send(text), stop(), alive, model }. Сообщения до готовности сессии ждут в очереди */
const liveSessions = {}          // id экрана → api открытой Live-сессии (микрофон диктовки берёт её же)
export function openBallLive({ id, question, ideal, system, tool, extra = null, onBlocks, onCover, onTurn }) {          // system, tool — из JSON экрана (ballPrompt с подставленными вопросом и эталоном, ballTool); onCover([{ ref, said }])
  const n = netOf(id), key = firstKey()
  if (!key) throw new Error('Нужен ключ Gemini в профиле')
  let sess = null, ready = false, closed = false, modelName = '', modelId = '', t0 = Date.now(), sentSplit = false
  const queue = []
  const flush = () => { if (!ready || !sess) return; while (queue.length) { const t = queue.shift(); if (/^РАЗБЕЙ/.test(t)) sentSplit = true; t0 = Date.now(); sess.send(t); lg('send', t.replace(/\n/g, ' ').slice(0, 160)) } }
  const fail = (txt) => { lg('err', txt); closed = true; n.cover = { st: 'err', txt }; if (sentSplit && n.split.st === 'busy') n.split = { st: 'err', txt } }
  // рация-переключатель (25.11.2026, вернули самый стабильный вариант): нажал — микрофон включён (manual: activityStart), говоришь сколько нужно;
  // нажал ещё раз — выключен (activityEnd): Live ОДИН раз сверяет всё сказанное и присылает cover. Выключен — в Live не уходит ни звука.
  // (Пробовали засчитывать на ходу — по паузам и срезами раз в 5 с — работало нестабильно, убрали.) wait — выключили, ждём ответ
  let hearH = null, hearUntil = 0, micOn = false, wait = false, waitTm = 0
  let talking = false, heardV = false
  if (!n.lv) n.lv = { ph: '', at: 0, cut: 0, last: null }
  if (!n.log) n.log = []
  n.log.splice(0); const T0 = Date.now()
  /** в журнал; same — дописать к прошлой строке того же вида (расшифровка идёт кусками) */
  const lg = (k, x, same = false) => { const t = +((Date.now() - T0) / 1000).toFixed(1), last = n.log.at(-1); if (same && last?.k === k) { last.x += x; return } n.log.push({ t, k, x: String(x) }); if (n.log.length > 80) n.log.splice(0, n.log.length - 80) }
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
      talking = true; L.ph = 'rec'; sess.talkStart(); lg('mic', 'микрофон включён — звук идёт в Live'); heardV = false; n.cover = { st: 'on', txt: 'слушает' }          // включили — звук пошёл в Live
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
      sess = startTalk({ key, model: m, system, lang: 'pl-PL', temperature: 0.2, tools: ballTools(tool), extra, micLater: true, quiet: true, manual: true, on: {
        state: (st, info) => { if (st === 'live') { if (info) return; n.cover = { st: 'on', txt: 'Live на связи · ждёт речь' } } else if (st === 'error') fail('Live: ' + (info || 'ошибка')); else if (st === 'ended' && !closed) fail('Live: соединение закрыто') },
        ready: () => { ready = true; lg('send', 'соединение готово · ' + modelId + ' · инструкция (ballPrompt): ' + String(system).replace(/\s+/g, ' ').slice(0, 300) + '…'); flush() },
        turn: () => { lg('turn', 'модель закончила ход · ' + ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' с'); hearH?.turn?.(); if (L.ph === 'think') L.ph = talking ? 'rec' : ''; if (wait) endWait(); onTurn?.() },
        text: (role, t) => { if (role === 'me') { lg('heard', t, true); hearH?.text?.(t) } else lg('said', t, true) },          // said — модель заговорила вместо функции (не должна)
        level: (v) => { if (talking && v > 0.06 && !heardV) { heardV = true; lg('voice', 'микрофон слышит голос') } hearH?.level?.(v) },          // громкость микрофона (идёт только пока он включён) — по ней видно, что говорят
        tool: (name, args) => {
          const sec = ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' с'
          if (name === 'blocks') {
            const b = (Array.isArray(args?.blocks) ? args.blocks : []).map((x) => ({ label: String(x?.label ?? '').trim().slice(0, 60), words: (Array.isArray(x?.words) ? x.words : []).map(String).filter(Boolean).slice(0, 3) })).filter((x) => x.label).slice(0, 16)
            lg('blocks', JSON.stringify(args).slice(0, 400))
            if (!b.length) return { ok: false, error: 'пустой список' }
            n.split = { st: 'on', txt: `${b.length} блоков · ${sec}` }
            try { localStorage.setItem(lck(question, ideal), JSON.stringify(b)) } catch { /* */ }
            onBlocks?.(b); return { ok: true, count: b.length }
          }
          if (name === 'cover') {
            lg('cover', JSON.stringify(args).slice(0, 400) + ' · ' + sec)
            const got = (Array.isArray(args?.found) ? args.found : []).map((x) => ({ ref: String(x?.ref ?? '').trim().slice(0, 120), said: String(x?.said ?? '').trim() })).filter((x) => x.ref)
            n.cover = { st: 'on', txt: (got.length ? `найдено ${got.length}` : 'нового нет') + ` · ${sec}` }
            if (L.ph === 'think') L.last = { n: got.length, ms: Date.now() - L.at }
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

// ==UserScript==
// @name         Tutor TMA — мост с чатом (ChatGPT / Gemini / Claude)
// @namespace    english-tma
// @version      1.6
// @description  Берёт с сервера Tutor TMA проверки «Ответ по смыслу», вставляет их в открытый чат, ждёт ответ и отправляет его обратно
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @match        https://claude.ai/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @updateURL    https://maiklshetinin.github.io/english-tma/ai-bridge.user.js
// @downloadURL  https://maiklshetinin.github.io/english-tma/ai-bridge.user.js
// @connect      onrender.com
// @connect      *
// ==/UserScript==

// Как работает: сервер (server/ai.ts) держит очередь проверок. Скрипт раз в ~25 с спрашивает «есть задание?» (долгий запрос),
// получает { id, text }, вставляет text в поле чата, отправляет, ждёт конца ответа и шлёт текст ответа на сервер. Сервер сам
// находит в нём JSON с нужным id. Запросы идут через GM_xmlhttpRequest — CSP чатов и CORS им не мешают.
// Включается отдельно в каждой вкладке (Alt+Shift+B или меню Tampermonkey) — чтобы два чата не брали одно задание.
// 1.6 (23.11.2026): выключили во вкладке (или закрыли её) — сразу говорим серверу «отключаюсь» (/ai/bridge/bye) и обрываем ожидание
// задания: приложение сразу видит «Мост не в сети», а не через минуту, и проверки не ждут зря по 100 с.

(function () {
  'use strict'

  const CFG = {
    pollMs: 30_000,        // таймаут долгого запроса (сервер отвечает пустым через 25 с)
    answerMs: 85_000,      // сколько ждём ответ чата (сервер ждёт 100 с)
    stableMs: 500,         // полный JSON с нашим id не менялся столько — ответ готов (кнопку «стоп» не ждём: 1.2)
    newChatEvery: 10,      // после стольких проверок — новый чат (старые сообщения замедляют ответы); 0 — никогда
    hotkey: { alt: true, shift: true, code: 'KeyB' },
  }

  // Поле, кнопка отправки и «чат отвечает» — как в скрипте автофокуса; reply — блоки ответов чата
  const SITES = [
    { name: 'ChatGPT', color: '#10a37f', test: (h) => h.includes('chatgpt.com') || h.includes('chat.openai.com'), fresh: '/',
      input: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'form textarea'],
      busy: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop"]', 'button[aria-label*="Остановить"]'],
      send: ['button[data-testid="send-button"]', '#composer-submit-button', 'button[aria-label*="Send"]', 'button[aria-label*="Отправить"]'],
      reply: ['[data-message-author-role="assistant"]', 'article[data-turn="assistant"]'] },
    { name: 'Gemini', color: '#4285f4', test: (h) => h.includes('gemini.google.com'), fresh: '/app',
      input: ['rich-textarea .ql-editor[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]', 'rich-textarea [contenteditable="true"]'],
      busy: ['button.send-button.stop', 'button[aria-label*="Stop"]', 'button[aria-label*="Остановить"]', 'button[aria-label*="Прекратить"]', 'mat-icon[fonticon="stop"]'],
      send: ['button.send-button:not(.stop)', 'button[aria-label*="Send"]', 'button[aria-label*="Отправить"]'],
      reply: ['model-response message-content', 'model-response .markdown', 'model-response'] },
    { name: 'Claude', color: '#d97757', test: (h) => h.includes('claude.ai'), fresh: '/new',
      input: ['div.ProseMirror[contenteditable="true"]', '[contenteditable="true"][role="textbox"]'],
      busy: ['button[aria-label*="Stop"]', 'button[aria-label*="Остановить"]'],
      send: ['button[aria-label*="Send"]', 'button[aria-label*="Отправить"]'],
      reply: ['.font-claude-response', '.font-claude-message', '[data-testid="assistant-message"]'] },
  ]
  const SITE = SITES.find((s) => s.test(location.hostname))
  if (!SITE) return

  // ───────── настройки: строка подключения «https://сервер#ключ» (берётся во вкладке «ИИ» панели разработчика) ─────────
  const conf = () => { const [api, token] = String(GM_getValue('line', '')).split('#'); return { api: (api || '').replace(/\/+$/, ''), token: token || '' } }
  const ON = 'tmaBridge.on'                                    // sessionStorage: включён в этой вкладке (переживает переход в новый чат)
  const isOn = () => sessionStorage.getItem(ON) === '1'
  let served = Number(sessionStorage.getItem('tmaBridge.n') || 0)

  // ───────── плашка внизу слева (без innerHTML — у Gemini Trusted Types) ─────────
  const pill = document.createElement('div')
  pill.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;gap:7px;padding:6px 11px;border-radius:99px;'
    + 'background:#222;color:#fff;font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none'
  const dot = document.createElement('span'); dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex:none'
  const label = document.createElement('span')
  pill.append(dot, label)
  pill.title = 'Мост Tutor TMA. Клик или Alt+Shift+B — включить/выключить в этой вкладке'
  pill.addEventListener('click', toggle)
  function show(text, color) { if (!document.body.contains(pill)) document.body.appendChild(pill); label.textContent = 'Мост · ' + text; dot.style.background = color }
  const idle = () => show(isOn() ? `ждёт · ответов отправлено: ${served}` : 'выкл', isOn() ? SITE.color : '#8e8e8e')

  // ───────── DOM чата ─────────
  const shown = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0)
  const first = (sels) => { for (const s of sels) for (const el of document.querySelectorAll(s)) if (shown(el)) return el; return null }
  const all = (sels) => { for (const s of sels) { const l = [...document.querySelectorAll(s)]; if (l.length) return l } return [] }
  // 1.1 (19.11.2026): в узком окне или после обновления сайта поле бывает в другой обёртке — тогда любое видимое поле ввода,
  // самое нижнее на странице (у чатов оно всегда внизу). Свою плашку моста не трогаем
  const anyInput = () => [...document.querySelectorAll('[contenteditable="true"], textarea')]
    .filter((el) => shown(el) && !pill.contains(el) && el.getBoundingClientRect().width > 120)
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null
  const input = () => first(SITE.input) || anyInput()
  const busy = () => !!first(SITE.busy)
  const textOf = (el) => (!el ? '' : 'value' in el && typeof el.value === 'string' ? el.value : el.innerText || el.textContent || '')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  async function until(fn, ms, step = 250) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(step) } return null }

  /** Текст в поле: textarea — через сеттер value; contenteditable (ProseMirror, Quill) — вставкой, запасной путь — insertText */
  async function fill(el, text) {
    el.focus()
    if (el.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, text)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    const sel = getSelection(), r = document.createRange()
    r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r)
    document.execCommand('delete')
    const dt = new DataTransfer(); dt.setData('text/plain', text)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    await sleep(150)
    if (!textOf(el).trim()) document.execCommand('insertText', false, text)
  }
  async function send(el) {
    const btn = await until(() => { const b = first(SITE.send); return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null }, 4000)
    if (btn) { btn.click(); return }
    const o = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }
    el.dispatchEvent(new KeyboardEvent('keydown', o)); el.dispatchEvent(new KeyboardEvent('keyup', o))
  }

  /** 1.5: подсветка найденного — рамка вокруг блока ответа и жёлтая заливка самого id (CSS Custom Highlight API, DOM не меняется) */
  try { GM_addStyle('::highlight(tma-id){background:#ffe14d;color:#000}') } catch { /* без стиля — только рамка */ }
  let marked = null
  function unmark() {
    if (marked) { marked.style.outline = ''; marked.style.outlineOffset = ''; marked = null }
    try { CSS.highlights.delete('tma-id') } catch { /* старый браузер */ }
  }
  function mark(el, id) {
    if (!el) return
    if (marked && marked !== el) { marked.style.outline = ''; marked.style.outlineOffset = '' }
    marked = el
    el.style.outline = '3px solid ' + SITE.color; el.style.outlineOffset = '4px'
    try {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n, hit = null
      while ((n = w.nextNode())) if (n.nodeValue.includes(id)) hit = n      // последнее вхождение — это внутри JSON ответа
      if (hit) {
        const i = hit.nodeValue.lastIndexOf(id), r = new Range()
        r.setStart(hit, i); r.setEnd(hit, i + id.length)
        CSS.highlights.set('tma-id', new Highlight(r))
      }
    } catch { /* без подсветки id */ }
  }
  let how = ''                                                   // чем найден ответ: «селектор» или «по id»

  /** 1.3 (22.11.2026): текст, где сервер будет искать JSON, — последний НОВЫЙ блок ответа чата (появившийся после отправки) с нашим id.
   *  before — сколько блоков ответа было в чате до отправки */
  function harvest(id, before) {
    const mine = new RegExp(`"id"\\s*:\\s*"${id}"`)
    const replies = all(SITE.reply).slice(before)
    for (let i = replies.length - 1; i >= 0; i--) { const t = textOf(replies[i]); if (mine.test(t)) { how = 'селектор'; mark(replies[i], id); return t } }
    return ''
  }

  /** 1.4 (22.11.2026): запасной путь без селекторов (у ChatGPT блоков ответа больше нет в DOM под прежними атрибутами).
   *  Ищем текстовый узел с нашим id и поднимаемся по родителям, пока блок не начнёт включать текст нашего запроса.
   *  Берём самый широкий блок с законченным валидным JSON. Эхо запроса (кусок нашего же текста) не считается ответом */
  function harvestAny(id, jobText) {
    const norm = (s) => s.replace(/\s+/g, '')
    const q = norm(jobText)
    const parts = [q.slice(0, 60), q.slice(-60)].filter(Boolean)
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    while ((n = w.nextNode())) {
      if (!n.nodeValue.includes(id) || pill.contains(n.parentNode)) continue
      let el = n.parentElement, best = '', bestEl = null
      for (let i = 0; el && el !== document.body && i < 8; i++, el = el.parentElement) {
        const t = el.innerText || el.textContent || ''
        const nt = norm(t)
        if (parts.some((p) => nt.includes(p))) break          // дошли до блока с нашим запросом — выше не идём
        if (q.includes(nt)) continue                           // кусок нашего же запроса — не ответ
        if (complete(t, id)) { best = t; bestEl = el }
      }
      if (best) { how = 'по id'; mark(bestEl, id); return best }
    }
    return ''
  }

  /** В тексте есть законченный JSON-объект с нашим id (чат дописал ответ) */
  function complete(t, id) {
    const at = t.search(new RegExp(`\\{\\s*"id"\\s*:\\s*"${id}"`)); if (at < 0) return false
    let depth = 0, str = false, esc = false
    for (let j = at; j < t.length; j++) {
      const c = t[j]
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue }
      if (c === '"') str = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { try { JSON.parse(t.slice(at, j + 1)); return true } catch { return false } }
    }
    return false
  }

  /** Одно задание: вставить, отправить, дождаться ответа с нашим id, пока он не перестанет меняться */
  async function run(job) {
    unmark(); how = ''
    show('проверяет…', '#f5a524')
    await until(() => !busy(), 30_000)                       // чат ещё дописывает прошлое — ждём
    const el = await until(input, 10_000)
    if (!el) throw new Error('не нашёл поле ввода чата — откройте обычный чат (не настройки) и не сворачивайте окно')
    const before = all(SITE.reply).length                    // сколько ответов чата уже было — смотрим только те, что появятся после отправки
    await fill(el, job.text)
    await send(el)
    // 1.2 (19.11.2026): ответ готов, как только в чате законченный JSON с нашим id и он полсекунды не меняется — кнопку «стоп» не ждём
    // (у Gemini она висела дольше ответа: проверка шла 25 с при ответе за 3–5 с); без JSON — по-старому: чат перестал отвечать
    const t0 = Date.now()
    let last = '', since = Date.now()
    while (Date.now() - t0 < CFG.answerMs) {
      await sleep(250)
      const t = harvest(job.id, before) || harvestAny(job.id, job.text)   // 1.4: если селекторы ничего не нашли — ищем по тексту страницы
      if (t !== last) { last = t; since = Date.now(); if (t) show(`читает ответ · найден ${how}`, '#f5a524'); continue }
      if (t && complete(t, job.id) && Date.now() - since >= CFG.stableMs) return t
      if (t && !busy() && Date.now() - since >= 2500) return t
    }
    throw new Error(last ? 'чат не закончил ответ вовремя' : 'чат не ответил (ответ на странице не найден)')
  }

  // ───────── связь с сервером ─────────
  let waitReq = null                                             // идущий долгий запрос «есть задание?» — оборвать при выключении
  function http(method, path, body) {
    const { api, token } = conf()
    return new Promise((resolve) => { const req = GM_xmlhttpRequest({
      method, url: api + path, timeout: CFG.pollMs,
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': token },
      data: body ? JSON.stringify(body) : undefined,
      onload: (r) => resolve({ status: r.status, text: r.responseText }),
      onerror: () => resolve({ status: 0 }), ontimeout: () => resolve({ status: 0 }), onabort: () => resolve({ status: 0 }),
    }); if (path.startsWith('/ai/bridge/next')) waitReq = req })
  }
  /** 1.6: «отключаюсь» — сервер сразу убирает этот чат; чатов не осталось — мост сразу не в сети */
  function bye() {
    try { waitReq?.abort() } catch { /* уже закончился */ }
    waitReq = null
    const { api, token } = conf()
    if (api && token) http('POST', '/ai/bridge/bye', { site: SITE.name })
  }

  let looping = false
  async function loop() {
    if (looping) return; looping = true
    try {
      while (isOn()) {
        const { api, token } = conf()
        if (!api || !token) { show('нет строки подключения', '#cf222e'); await sleep(3000); continue }
        idle()
        const r = await http('GET', '/ai/bridge/next?site=' + encodeURIComponent(SITE.name))
        if (!isOn()) break
        if (r.status === 204) continue
        if (r.status === 401) { show('неверный ключ — вставьте строку заново', '#cf222e'); await sleep(10_000); continue }
        if (r.status !== 200) { show('сервер не отвечает…', '#cf222e'); await sleep(5000); continue }
        let job = null
        try { job = JSON.parse(r.text) } catch { /* не JSON */ }
        if (!job?.id || !job.text) continue
        let text = '', error = ''
        try { text = await run(job) } catch (e) { error = String(e?.message || e) }
        await http('POST', '/ai/bridge/done', error ? { id: job.id, error } : { id: job.id, text })
        served++; sessionStorage.setItem('tmaBridge.n', String(served))
        show(error ? 'ошибка: ' + error : 'ответ отправлен', error ? '#cf222e' : SITE.color)
        await sleep(1200)
        if (CFG.newChatEvery && served % CFG.newChatEvery === 0) { leaving = true; location.href = SITE.fresh; return }          // сами уходим в новый чат — не «отключаемся»
      }
    } finally { looping = false; idle() }
  }

  let leaving = false
  function toggle() {
    if (isOn()) { sessionStorage.removeItem(ON); bye() } else sessionStorage.setItem(ON, '1')
    idle(); if (isOn()) loop()
  }
  // закрыли вкладку или ушли со страницы, а мост был включён — тоже «отключаюсь» (кроме нашего же перехода в новый чат)
  addEventListener('pagehide', () => { if (isOn() && !leaving) bye() })
  function setLine() {
    const v = prompt('Строка подключения из Tutor TMA (панель разработчика → ИИ → «Копировать»):', GM_getValue('line', ''))
    if (v == null) return
    if (!/^https:\/\/[^#\s]+#\S{10,}$/.test(v.trim())) { alert('Не похоже на строку подключения: нужна вида https://…#ключ'); return }
    GM_setValue('line', v.trim()); idle()
  }

  GM_registerMenuCommand('Мост: строка подключения', setLine)
  GM_registerMenuCommand('Мост: включить / выключить в этой вкладке', toggle)
  document.addEventListener('keydown', (e) => {
    const k = CFG.hotkey
    if (e.code === k.code && e.altKey === !!k.alt && e.shiftKey === !!k.shift && !e.ctrlKey) { e.preventDefault(); toggle() }
  }, true)

  idle()
  if (isOn()) loop()
})()
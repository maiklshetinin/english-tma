// «Ответ по смыслу · Gemini API» → проверка голосовой Live-моделью (20.11.2026, тест): быстро и без суточного лимита.
// Модель сначала МОЛЧА вызывает функцию submit_grade({ score, missed_points, feedback }) — это и есть оценка (JSON, как у моста),
// потом голосом говорит 1–2 предложения. Звук можно заглушить (🔇) — расшифровка всё равно видна. «Подробнее» — тот же разговор:
// развёрнутый разбор, микрофон включается, можно отвечать голосом. Нет оценки за 15 с — ошибка (плеер уходит в Flash Lite, потом мост).
// Состояние разговора экрана — kpLive[id экрана] (его показывает Kp.vue).
import { reactive } from 'vue'
import { startTalk, liveModels, liveName, firstKey, startTranscribe, sttModel } from './live'
import { kpPlain, SYSTEM, PASS } from './ai'

export const kpLive = reactive({})
const QK = 'tma.kp.quiet'
const getQuiet = () => { try { return localStorage.getItem(QK) === '1' } catch { return false } }
const TOOL = [{ name: 'submit_grade', description: 'Выставить оценку ответа ученика (обязательно, до любых слов)',
  parameters: { type: 'OBJECT', properties: { score: { type: 'INTEGER', description: '0–100: полнота передачи смысла эталона' },
    missed_points: { type: 'ARRAY', items: { type: 'STRING' }, description: 'важные факты эталона, которых нет в ответе, коротко по-русски' },
    feedback: { type: 'STRING', description: 'одно короткое предложение по-русски' } }, required: ['score', 'missed_points', 'feedback'] } }]

/** → Promise<{ score, missed, feedback, ok, site: 'Gemini', live: true, model, ms }>; разговор остаётся в kpLive[id] */
export async function checkLive(q, id) {
  kpLive[id]?.stop?.()
  const key = firstKey(); if (!key) throw new Error('нет ключей Gemini')
  const t0 = Date.now(), need = Number.isFinite(q.pass) ? q.pass : PASS
  let model = ''; try { model = localStorage.getItem('tma.live.pick') || '' } catch { /* */ }
  if (!model) model = (await liveModels(key))[0] || ''
  if (!model) throw new Error('у ключа нет Live-моделей')
  let voice = 'Kore'; try { voice = localStorage.getItem('tma.live.voice') || 'Kore' } catch { /* */ }
  const S = reactive({ lines: [], state: 'connecting', quiet: getQuiet(), listening: false, model, name: liveName(model), err: '' })
  const push = (role, chunk) => { const l = S.lines.at(-1); if (l && l.role === role && !l.closed) l.t += chunk; else S.lines.push({ role, t: chunk.replace(/^\s+/, ''), closed: false }) }
  const system = (q.prompt?.trim() || SYSTEM) + '\n\nТы проверяешь ответ голосом. Порядок строго такой: 1) СРАЗУ, ничего не говоря, вызови функцию submit_grade. ' +
    '2) Потом скажи по-польски 1–2 коротких предложения: что хорошо и чего не хватило. 3) Замолчи и жди. ' +
    'Если ученик попросит подробнее — разбери ответ подробно по-польски (простым языком), задай один наводящий вопрос и попроси ответить ещё раз полнее; новую попытку оцени коротко. ' +
    'Ученик говорит по-польски с акцентом — это польский; если он попросит по-русски — можно коротко пояснить по-русски.'
  const data = `Вопрос:\n${q.question}\n\nЭталон:\n${kpPlain(q.reference)}\n\nОтвет ученика:\n${q.answer}\n\nOceń moją odpowiedź.`
  return new Promise((ok, no) => {
    let got = false
    const tm = setTimeout(() => { if (!got) { got = true; sess.stop(); no(new Error('Live не прислала оценку за 15 с')) } }, 15_000)
    const sess = startTalk({ key, model, voice, lang: 'pl-PL', system, opener: data, tools: TOOL, micLater: true, quiet: S.quiet, on: {
      state: (s, info) => { if (s === 'live' && info) return; S.state = s; if (s === 'error') { S.err = info; if (!got) { got = true; clearTimeout(tm); no(new Error(info || 'ошибка Live')) } } },
      text: push, turn: () => { const l = S.lines.at(-1); if (l) l.closed = true },
      tool: (name, a) => {
        if (name !== 'submit_grade' || got) return { ok: true }
        got = true; clearTimeout(tm)
        const score = Math.max(0, Math.min(100, Math.round(Number(a.score) || 0)))
        ok({ score, missed: Array.isArray(a.missed_points) ? a.missed_points.map(String).filter(Boolean) : [], feedback: String(a.feedback ?? ''), ok: score >= need, site: 'Gemini', live: true, model, ms: Date.now() - t0 })
        return { ok: true }
      },
    } })
    Object.assign(S, {
      stop: () => sess.stop(),
      setQuiet: (v) => { S.quiet = !!v; sess.quiet(S.quiet); try { localStorage.setItem(QK, S.quiet ? '1' : '0') } catch { /* */ } },
      more: async () => { if (S.quiet) S.setQuiet(false); sess.send('Proszę omówić moją odpowiedź szczegółowo.'); S.listening = true; await sess.listen() },
    })
    kpLive[id] = S
  })
}

// ---------- «Ответ по смыслу · Live (голос)» (20.11.2026, отдельный шаблон, тест): Live получает ЗАПИСЬ ответа (из диктовки)
// и её расшифровку; во время ответа модель не слушает — не перебивает. Режим «рации»: модель не решает сама, что ученик договорил,
// звук отдаётся разом («начал» → запись → «закончил»). Оценка — функцией submit_grade; с «📊 Уровень языка» — ещё и речь:
// уровень CEFR, понятность, критерии, ошибки, произношение (в формате «Теста речи»). Без запасных путей — ошибка показывается как есть.
const LVL = { level: { type: 'STRING', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] }, level_plus: { type: 'BOOLEAN' }, confidence: { type: 'INTEGER' },
  intelligibility: { type: 'INTEGER', description: '0–100: насколько легко носитель поймёт речь' }, read_aloud: { type: 'BOOLEAN', description: 'похоже на чтение или заученный текст' },
  scores: { type: 'OBJECT', properties: { vocabulary: { type: 'INTEGER' }, grammar: { type: 'INTEGER' }, coherence: { type: 'INTEGER' }, fluency: { type: 'INTEGER' }, pronunciation: { type: 'INTEGER' } } },
  language_mistakes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { quote: { type: 'STRING' }, fix: { type: 'STRING' }, why: { type: 'STRING' } } } },
  pronunciation_notes: { type: 'ARRAY', items: { type: 'STRING' } }, tips: { type: 'ARRAY', items: { type: 'STRING' } } }
const toolOf = (level) => [{ ...TOOL[0], parameters: { ...TOOL[0].parameters,
  properties: { ...TOOL[0].parameters.properties, ...(level ? LVL : {}) },
  required: [...TOOL[0].parameters.required, ...(level ? ['level', 'intelligibility', 'scores'] : [])] } }]
const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

/** → Promise<{ score, missed, feedback, ok, site, live, voice: есть ли запись, model, ms, speech?: отчёт речи }> */
export async function checkLiveVoice(q, id, { chunks = [], level = false } = {}) {
  kpLive[id]?.stop?.()
  const key = firstKey(); if (!key) throw new Error('нет ключей Gemini')
  const t0 = Date.now(), need = Number.isFinite(q.pass) ? q.pass : PASS, sec = chunks.reduce((a, c) => a + c.length, 0) / 16000
  let model = ''; try { model = localStorage.getItem('tma.live.pick') || '' } catch { /* */ }
  if (!model) model = (await liveModels(key))[0] || ''
  if (!model) throw new Error('у ключа нет Live-моделей')
  let voice = 'Kore'; try { voice = localStorage.getItem('tma.live.voice') || 'Kore' } catch { /* */ }
  const S = reactive({ lines: [], state: 'connecting', quiet: getQuiet(), listening: false, model, name: liveName(model), err: '' })
  const push = (role, chunk) => { const l = S.lines.at(-1); if (l && l.role === role && !l.closed) l.t += chunk; else S.lines.push({ role, t: chunk.replace(/^\s+/, ''), closed: false }) }
  const hasAudio = sec >= 1
  const system = (q.prompt?.trim() || SYSTEM) +
    `\n\nВопрос:\n${q.question}\n\nЭталон:\n${kpPlain(q.reference)}\n\nРасшифровка ответа ученика (автоматическая, может ошибаться):\n${q.answer || '(пусто)'}\n\n` +
    (hasAudio ? 'Сейчас ты получишь ЗАПИСЬ голоса ученика — это его ответ. Оценивай по тому, что он СКАЗАЛ (по звуку); если расшифровка ошиблась — верь звуку. ' : 'Записи нет — оценивай по расшифровке. ') +
    'Порядок строго такой: 1) дослушай запись до конца; 2) СРАЗУ, ничего не говоря, вызови функцию submit_grade; 3) потом скажи по-польски 1–2 коротких предложения: что хорошо и чего не хватило; 4) замолчи. ' +
    (level ? 'В submit_grade заполни и оценку речи по шкале CEFR — строго, как экзаменатор, по звуку: level, intelligibility, scores (0–100: словарь, грамматика, связность, беглость, произношение), ' +
      'language_mistakes — реальные языковые ошибки (quote — дословно из расшифровки, fix — как правильно, why — по-русски), pronunciation_notes, tips; при чтении текста — read_aloud: true и низкая confidence; короткий ответ (меньше минуты) — confidence не выше 70. Акцент сам по себе не снижает оценку. ' : '') +
    'Ученик говорит по-польски с акцентом — это польский.'
  return new Promise((ok, no) => {
    let got = false
    const fail = (m) => { if (!got) { got = true; clearTimeout(tm); sess.stop(); no(new Error(m)) } }
    const tm = setTimeout(() => fail('Live не прислала оценку за 30 с'), 30_000)
    const sess = startTalk({ key, model, voice, lang: 'pl-PL', system, tools: toolOf(level), micLater: true, manualVad: true, quiet: S.quiet, on: {
      ready: () => { if (hasAudio) sess.sendAudio(chunks); else sess.send('Oceń moją odpowiedź.') },
      state: (s, info) => { if (s === 'live' && info) return; S.state = s; if (s === 'error') { S.err = info; fail(info || 'ошибка Live') } },
      text: push, turn: () => { const l = S.lines.at(-1); if (l) l.closed = true },
      tool: (name, a) => {
        if (name !== 'submit_grade' || got) return { ok: true }
        got = true; clearTimeout(tm)
        const score = clamp(a.score), out = { score, missed: Array.isArray(a.missed_points) ? a.missed_points.map(String).filter(Boolean) : [], feedback: String(a.feedback ?? ''), ok: score >= need,
          site: 'Gemini', live: true, voice: hasAudio, model, ms: Date.now() - t0 }
        if (level && a.level) {
          const tn = norm(q.answer), cap = a.read_aloud ? 50 : sec < 60 ? 70 : sec < 120 ? 85 : 100
          const ms = (a.language_mistakes ?? []).filter((x) => x?.quote && tn.includes(norm(x.quote))).slice(0, 8)
          out.speech = { level: String(a.level), plus: !!a.level_plus, confidence: Math.min(cap, clamp(a.confidence)), intelligibility: clamp(a.intelligibility), read: !!a.read_aloud, readWhy: '',
            scores: Object.fromEntries(['vocabulary', 'grammar', 'coherence', 'fluency', 'pronunciation'].map((k) => [k, clamp(a.scores?.[k])])),
            mistakes: ms, dropped: (a.language_mistakes?.length ?? 0) - ms.length, pron: (a.pronunciation_notes ?? []).map(String).slice(0, 4), strengths: [], tips: (a.tips ?? []).map(String).slice(0, 4),
            summary: '', model, sec, ms: Date.now() - t0 }
        }
        ok(out)
        return { ok: true }
      },
    } })
    Object.assign(S, {
      stop: () => sess.stop(),
      setQuiet: (v) => { S.quiet = !!v; sess.quiet(S.quiet); try { localStorage.setItem(QK, S.quiet ? '1' : '0') } catch { /* */ } },
    })
    kpLive[id] = S
  })
}
// запись ответа экрана «Live (голос)» — копится диктовкой (Kp.vue), уходит в проверку (LessonPlayer)
export const kpRec = {}

// ---------- «Live (голос)» вживую (20.11.2026, переделка): соединение открывается по «🎙 Ответить», дальше «рация» —
// говоришь прямо в Live (она слушает, но не отвечает), «Пауза» — подумать, «Проверить» — «закончил», и модель сразу вызывает
// submit_grade: она уже всё слышала, ждать нечего. Её расшифровка твоей речи пишется в поле ответа (onMe). Запись копится (rec)
// — для уровня языка (Flash Lite, параллельно, в LessonPlayer).
/** Открыть разговор-ответ экрана: → S в kpLive[id] с методами speak(), pause(), finish(text) → Promise<оценка>.
 *  Пока ученик говорит, параллельно идёт Transcribe Live — текст сразу в поле (onMe — готовые куски, S.draft — черновик);
 *  Gemini Live в это время слушает тот же голос (для оценки). Видно: S.ws — состояние WebSocket, S.sent — сколько секунд звука ушло в Live */
export async function openLiveAnswer(q, id, { onMe } = {}) {
  kpLive[id]?.stop?.()
  const key = firstKey(); if (!key) throw new Error('нет ключей Gemini')
  const need = Number.isFinite(q.pass) ? q.pass : PASS
  const model = (await liveModels(key))[0] || ''          // одна модель — самая свежая Live (20.11.2026: без выбора, тест)
  if (!model) throw new Error('у ключа нет Live-моделей')
  let voice = 'Kore'; try { voice = localStorage.getItem('tma.live.voice') || 'Kore' } catch { /* */ }
  const rec = []
  const S = reactive({ lines: [], state: 'connecting', ws: 'открывается…', quiet: getQuiet(), talking: false, model, name: liveName(model), err: '', level: 0, rec, sent: 0, draft: '', tr: 'нет', warn: '' })
  // черновик на «Паузе» сразу уходит в поле (flush) — а Google потом может прислать тот же кусок готовым или продолжить его
  // черновиком: уже записанные слова отрезаем (cut), чтобы в поле ничего не задвоилось. Не польский (кириллица) — в поле не пускаем
  let flushed = []
  const W = (t) => String(t || '').trim().split(/\s+/).filter(Boolean)
  const nw = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const cut = (t, eat) => { const tw = W(t); let k = 0; while (k < tw.length && k < flushed.length && nw(tw[k]) === nw(flushed[k])) k++; if (eat) flushed = flushed.slice(k); return tw.slice(k).join(' ') }
  const cyr = (t) => /[\u0400-\u04FF]/.test(t)
  const flush = () => { const d = S.draft.trim(); S.draft = ''; if (d) { flushed.push(...W(d)); onMe?.(d) } }
  let waiter = null, t0 = 0, tr = null
  const system = (q.prompt?.trim() || SYSTEM) + `\n\nВопрос:\n${q.question}\n\nЭталон:\n${kpPlain(q.reference)}\n\n` +
    'Ученик отвечает ГОЛОСОМ — его ответ ты слышишь. Пока он говорит — молчи. Когда реплика закончена (или пришёл текст ответа), порядок строго такой: ' +
    '1) СРАЗУ, ничего не говоря, вызови функцию submit_grade (оценивай по тому, что услышал); 2) потом скажи по-польски 1–2 коротких предложения: что хорошо и чего не хватило; 3) замолчи. ' +
    'Ученик говорит по-польски с акцентом — это польский. Язык разговора — ТОЛЬКО польский: говори только по-польски, даже если слышишь русские слова; на русский не переходи.'
  const sess = startTalk({ key, model, voice, lang: 'pl-PL', system, tools: TOOL, micLater: true, manualVad: true, quiet: S.quiet,
    rec: (pcm) => { rec.push(pcm); S.sent += pcm.length / 16000 }, on: {
      state: (s, info) => {
        if (s === 'live' && info) return
        S.state = s; S.ws = s === 'live' ? 'открыт' : s === 'connecting' ? 'открывается…' : s === 'error' ? 'ошибка' : 'закрыт'
        if (s === 'error') { S.err = info; waiter?.no(new Error(info || 'ошибка Live')); waiter = null }
        if (s === 'ended' || s === 'error') tr?.stop()
      },
      text: (role, t) => { if (role === 'me') return; const l = S.lines.at(-1); if (l && !l.closed) l.t += t; else S.lines.push({ role, t: t.replace(/^\s+/, ''), closed: false }) },          // свою речь в поле пишет Transcribe
      turn: () => { const l = S.lines.at(-1); if (l) l.closed = true },
      level: (v) => { S.level = S.level * 0.6 + v * 0.4 },
      tool: (name, a) => {
        if (name !== 'submit_grade' || !waiter) return { ok: true }
        const score = clamp(a.score), w = waiter; waiter = null; clearTimeout(w.tm)
        w.ok({ score, missed: Array.isArray(a.missed_points) ? a.missed_points.map(String).filter(Boolean) : [], feedback: String(a.feedback ?? ''), ok: score >= need,
          site: 'Gemini', live: true, voice: rec.length > 0, model, ms: Date.now() - t0 })
        return { ok: true }
      },
    } })
  async function startTr() {
    if (tr) return
    S.tr = 'подключается…'
    tr = startTranscribe({ key, model: await sttModel(key), lang: 'pl-PL', on: {
      state: (s, info) => { S.tr = s === 'live' ? 'пишет' : s === 'connecting' ? 'подключается…' : s === 'error' ? 'ошибка: ' + info : 'остановлена'; if (s === 'ended' || s === 'error') tr = null },
      interim: (t) => { if (cyr(t)) { S.warn = 'Расшифровка ушла не в польский — этот кусок в поле не пишу. Голос Gemini Live всё равно слышит'; return } S.warn = ''; S.draft = cut(t, false) },
      final: (t) => { S.draft = ''; if (cyr(t)) { S.warn = 'Кусок расшифровался не по-польски — в поле не попал'; return } const x = cut(t, true); if (x) onMe?.(x) },
    } })
  }
  Object.assign(S, {
    stop: () => { sess.stop(); tr?.stop() },
    setQuiet: (v) => { S.quiet = !!v; sess.quiet(S.quiet); try { localStorage.setItem(QK, S.quiet ? '1' : '0') } catch { /* */ } },
    speak: async () => { S.talking = true; tr?.hold(false); startTr(); await sess.talkStart() },
    pause: () => { S.talking = false; sess.talkPause(); tr?.hold(true); flush() },          // черновик — сразу в поле
    /** «Проверить»: конец реплики (или текст, если голоса не было) → оценка */
    finish: (text) => new Promise((ok, no) => {
      if (S.state !== 'live') return no(new Error(S.err || 'Live не подключена'))
      t0 = Date.now(); S.talking = false
      const t = tr; tr = null; if (t) setTimeout(() => t.stop(), 400)          // последние слова расшифровки успевают прийти
      flush()
      const tm = setTimeout(() => { if (waiter) { waiter = null; no(new Error('Live не прислала оценку за 20 с')) } }, 20_000)
      waiter = { ok, no, tm }
      if (!sess.talkEnd()) sess.send(`Moja odpowiedź (tekst):\n${text || '(pusto)'}\n\nOceń.`)          // голоса не было — ответ текстом
    }),
  })
  kpLive[id] = S
  return S
}

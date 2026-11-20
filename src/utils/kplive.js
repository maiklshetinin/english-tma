// «Ответ по смыслу · Gemini API» → проверка голосовой Live-моделью (20.11.2026, тест): быстро и без суточного лимита.
// Модель сначала МОЛЧА вызывает функцию submit_grade({ score, missed_points, feedback }) — это и есть оценка (JSON, как у моста),
// потом голосом говорит 1–2 предложения. Звук можно заглушить (🔇) — расшифровка всё равно видна. «Подробнее» — тот же разговор:
// развёрнутый разбор, микрофон включается, можно отвечать голосом. Нет оценки за 15 с — ошибка (плеер уходит в Flash Lite, потом мост).
// Состояние разговора экрана — kpLive[id экрана] (его показывает Kp.vue).
import { reactive } from 'vue'
import { startTalk, liveModels, liveName, firstKey } from './live'
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

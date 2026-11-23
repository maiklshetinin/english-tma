// «Ответ по смыслу · Gemini API» → проверка голосовой Live-моделью (20.11.2026, тест): быстро и без суточного лимита.
// Модель сначала МОЛЧА вызывает функцию submit_grade({ score, missed_points, feedback }) — это и есть оценка (JSON, как у моста),
// потом голосом говорит 1–2 предложения. Звук можно заглушить (🔇) — расшифровка всё равно видна. «Подробнее» — тот же разговор:
// развёрнутый разбор, микрофон включается, можно отвечать голосом. Нет оценки за 15 с — ошибка (плеер уходит в Flash Lite, потом мост).
// Состояние разговора экрана — kpLive[id экрана] (его показывает Kp.vue).
import { reactive } from 'vue'
import { startTalk, liveModels, liveName, firstKey } from './live'
import { kpPlain } from './ai'
import { kpCfg, kpReady, fill } from '../exercises/kp/defaults'

export const kpLive = reactive({})
const QK = 'tma.kp.quiet'
const getQuiet = () => { try { return localStorage.getItem(QK) === '1' } catch { return false } }
// функция оценки: описание (что модель читает) — из JSON экрана (liveTool, 21.11.2026); здесь только устройство: имена и типы полей
const tool = (description) => [{ name: 'submit_grade', description,
  parameters: { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, missed_points: { type: 'ARRAY', items: { type: 'STRING' } }, feedback: { type: 'STRING' } },
    required: ['score', 'missed_points', 'feedback'] } }]

/** → Promise<{ score, missed, feedback, ok, site: 'Gemini', live: true, model, ms }>; разговор остаётся в kpLive[id] */
export async function checkLive(q, id) {
  kpLive[id]?.stop?.()
  const key = firstKey(); if (!key) throw new Error('нет ключей Gemini')
  const c = kpReady(q.cfg ?? kpCfg({ prompt: q.prompt, pass: q.pass }))          // {topic}, {lang}, {langHow} — подставлены          // настройки экрана: livePrompt, message, liveAsk, liveMore
  const t0 = Date.now(), need = Number.isFinite(q.pass) ? q.pass : c.pass
  let model = c.liveModel !== 'auto' ? c.liveModel : ''          // Live-модель и голос — из JSON экрана (liveModel, voice)
  if (!model) model = (await liveModels(key))[0] || ''
  if (!model) throw new Error('у ключа нет Live-моделей')
  const voice = c.voice
  const S = reactive({ lines: [], state: 'connecting', quiet: getQuiet(), listening: false, model, name: liveName(model), err: '' })
  const push = (role, chunk) => { const l = S.lines.at(-1); if (l && l.role === role && !l.closed) l.t += chunk; else S.lines.push({ role, t: chunk.replace(/^\s+/, ''), closed: false }) }
  const system = [c.prompt.trim(), c.livePrompt.trim()].filter(Boolean).join('\n\n')
  const data = [fill(c.message, { question: q.question, reference: kpPlain(q.reference), answer: q.answer }), c.liveAsk.trim()].filter((x) => x.trim()).join('\n\n')
  return new Promise((ok, no) => {
    let got = false
    const tm = setTimeout(() => { if (!got) { got = true; sess.stop(); no(new Error('Live не прислала оценку за 15 с')) } }, 15_000)
    const sess = startTalk({ key, model, voice, lang: c.lang, system, opener: data, tools: tool(c.liveTool), micLater: true, quiet: S.quiet, on: {
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
      more: async () => { if (S.quiet) S.setQuiet(false); sess.send(c.liveMore); S.listening = true; await sess.listen() },
    })
    kpLive[id] = S
  })
}

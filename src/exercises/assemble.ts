// «Как собирается» (21.11.2026): что именно уйдёт в чат и в модели из JSON экрана — по форме упражнения (мост, Gemini API, голосом,
// целым аудио, разговор, рация). Те же функции, что и при проверке (kpCfg, fill, talkCfg, talkSystem), — показ не расходится с отправкой.
// Вместо ответа ученика и т. п. — метки ‹…›. warn — чего не хватает, чтобы работало как задумано.
import { kpCfg, kpApi, kpFile, kpShown, fill, langRu } from './kp/defaults'
import { talkCfg, talkSystem, LANGS } from './talk/defaults'

export interface Part { to: string; text: string }
const plain = (t: unknown) => String(t ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1').replace(/^• /gm, '- ')
const cut = (t: string, n = 240) => (t.length > n ? t.slice(0, n).trimEnd() + ' …' : t)
const join = (xs: string[], sep: string) => xs.map((x) => x.trim()).filter(Boolean).join(sep)

/** own — какие настройки у экрана свои (исключения); остальные — общие упражнения курса (плитка меню) или умолчания кода */
export function assemble(raw: any): { parts: Part[]; warn: string[]; own: string[] } {
  const parts: Part[] = [], warn: string[] = []
  if (!raw || typeof raw !== 'object') return { parts, warn, own: [] }
  const keys = raw.kind === 'kp' ? Object.keys(kpShown(raw)) : raw.kind === 'talk' ? Object.keys(talkCfg(raw)) : []
  const own = keys.filter((k) => raw[k] !== undefined)
  if (raw.kind === 'kp') {
    const c = kpCfg(raw)
    const v = { question: raw.text || '‹вопрос›', reference: raw.ideal ? cut(plain(raw.ideal)) : '‹эталон›', answer: '‹ответ ученика›', id: 'k1a2b3' }
    if (!c.message.includes('{answer}')) warn.push('В message нет {answer} — модель не увидит ответ ученика')
    if (!c.message.includes('{question}')) warn.push('В message нет {question} — модель не увидит вопрос')
    if (!c.message.includes('{reference}')) warn.push('В message нет {reference} — модель не увидит эталон')
    if (!raw.text) warn.push('Нет вопроса (text)')
    if (!raw.ideal) warn.push('Нет эталона (ideal) — сверять не с чем')
    if (!kpApi(raw)) {
      parts.push({ to: 'В чат через мост — одно сообщение: prompt + message + format', text: join([c.prompt, fill(c.message, v), fill(c.format, v)], '\n\n') })
    } else {
      parts.push({ to: 'Gemini API · роль (systemInstruction): prompt + format', text: join([c.prompt, c.format], ' ') })
      parts.push({ to: 'Gemini API · сообщение: message', text: fill(c.message, v) })
      parts.push({ to: 'Настройки запроса (не текст)', text: `модель: ${c.model} · температура: ${c.temperature ?? 'как у модели'} · размышления: ${c.thinking ? 'включены' : 'выключены'} · порог: ${c.pass} %` })
      if (c.model === 'live') {
        parts.push({ to: 'Проверка голосом · роль: prompt + livePrompt', text: join([c.prompt, c.livePrompt], '\n\n') })
        parts.push({ to: 'Проверка голосом · первая реплика: message + liveAsk', text: join([fill(c.message, v), c.liveAsk], '\n\n') })
        parts.push({ to: 'Проверка голосом · функция оценки submit_grade: liveTool', text: c.liveTool })
        parts.push({ to: '«Подробнее»: liveMore', text: c.liveMore })
      }
      parts.push({ to: '«Обсудить ответ голосом» · роль: discussPrompt', text: fill(c.discussPrompt, { ...v, score: '‹процент›', missed: `‹чего не хватило› (ничего — «${c.discussNone}»)` }) })
      parts.push({ to: '«Обсудить ответ голосом» · первая реплика: discussOpener', text: c.discussOpener })
      parts.push({ to: 'Голос и Live-модель (не текст)', text: `${c.voice} · ${c.liveModel} · ${c.lang}` })
    }
    if (kpFile(raw)) {
      parts.push({ to: 'Расшифровка записи · роль: sttPrompt', text: fill(c.sttPrompt, { lang: langRu(c.lang) }) })
      parts.push({ to: 'Расшифровка записи · рядом с аудио: sttAsk', text: c.sttAsk })
    }
  } else if (raw.kind === 'talk') {
    const c = talkCfg(raw)
    parts.push({ to: 'Gemini Live · роль (systemInstruction): lock + prompt', text: talkSystem(c) })
    parts.push({ to: 'Первая реплика (от ученика, чтобы Gemini начала): opener', text: c.opener || '‹нет — Gemini ждёт, пока ученик заговорит›' })
    parts.push({ to: 'Голос, модель, язык (не текст)', text: `${c.voice} · ${c.model} · ${c.lang}` })
    if (raw.ptt) parts.push({ to: 'Рация: Gemini ответила не на языке разговора — отправим guard', text: c.guard || '‹пусто — не просим›' })
    parts.push({ to: '«Оценивать речь» · роль: evalPrompt', text: fill(c.evalPrompt, { lang: LANGS[c.lang]?.ru ?? 'польский' }) })
    parts.push({ to: '«Оценивать речь» · рядом с записью: evalAsk', text: c.evalAsk.replace('{context}', '‹реплики Gemini›').replace('{transcript}', '‹что сказал ученик›') })
    if (!c.evalAsk.includes('{transcript}')) warn.push('В evalAsk нет {transcript} — оценка речи не увидит расшифровку')
    if (!talkSystem(c)) warn.push('Роль пустая (lock и prompt) — Gemini не знает, кого играть')
  }
  return { parts, warn, own }
}

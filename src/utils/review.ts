// Review (как в Busuu): слова и фразы, которые ученик встретил в уроках курса, и как хорошо он их помнит.
// Память считает FSRS (Free Spaced Repetition Scheduler, библиотека ts-fsrs — тот же алгоритм, что в Anki с 23.10):
//  • у слова две величины — стабильность S (за сколько дней вероятность вспомнить падает до 90 %) и сложность D (1–10);
//  • верный ответ — оценка «Хорошо», ошибка — «Снова»; экраны без проверки («Новое слово», «Подсказка», «Повтори») только
//    знакомят со словом (оценки нет); в «Парах» каждая пара — отдельный ответ;
//  • вероятность вспомнить сейчас — по кривой забывания R(t, S); следующий повтор — когда R упадёт до «желаемого
//    запоминания» (настройка преподавателя, по умолчанию 90 %), но не дальше «максимального интервала».
// Уровни по стабильности: < 3 дн — слабое, 3–20 дн — среднее, от 21 дн — сильное (как «зрелые» карточки в Anki).
// Здесь только расчёт (без хранения) — чтобы было легко проверить тестами.
import { fsrs, generatorParameters, createEmptyCard, forgetting_curve, Rating, State, type Card, type FSRS } from 'ts-fsrs'
import { gapParts, orderParts, KINDS, type Step } from './lesson'

const DAY = 86_400_000

/** Настройки алгоритма (меняет преподаватель: «Алгоритм повторений»; хранятся на сервере) */
export interface AlgoCfg { retention: number; maxDays: number; deckRetention: number; deckMaxDays: number }      // deck… — для колод (карточек)
export const ALGO_DEFAULT: AlgoCfg = { retention: 0.9, maxDays: 36500, deckRetention: 0.9, deckMaxDays: 36500 }
export const ALGO_LIMITS = { retention: [0.7, 0.97] as const, maxDays: [7, 36500] as const }
/** Пороги уровней по стабильности памяти (дни) */
export const LV_DAYS = { medium: 3, strong: 21 }

const cache = new Map<string, FSRS>()
export function schedulerOf(cfg: Pick<AlgoCfg, 'retention' | 'maxDays'> = ALGO_DEFAULT): FSRS {
  const k = cfg.retention + '/' + cfg.maxDays
  let f = cache.get(k)
  if (!f) cache.set(k, f = fsrs(generatorParameters({ request_retention: cfg.retention, maximum_interval: cfg.maxDays, enable_fuzz: false, enable_short_term: false })))
  return f
}
const W = schedulerOf().parameters.w                                       // веса FSRS-6 (их 21; последний — форма кривой забывания)

export type RKind = 'word' | 'phrase' | 'skill' | 'topic' | 'screen'      // skill / topic — навык и тема грамматики (utils/skills.ts)
export type RLevel = 'weak' | 'medium' | 'strong'
export interface RHist { t: number; ok: boolean | null; ex: string; lesson?: string }
/** Память слова по FSRS: стабильность (дни), сложность 1–10, последний ответ (мс), ответов, провалов, состояние (1 изучение, 2 повторение, 3 переучивание) */
export interface RMem { s: number; d: number; last: number; n: number; l: number; st: number }
export interface RItem {
  key: string; kind: RKind; text: string; tr: string; image?: string; audio?: string
  s: number; due: number; seen: number; ok: number; bad: number; hist: RHist[]
  course?: string; lesson?: string
  f?: RMem                       // нет — слово только встречалось (без проверки) или запись старая (тогда память пересчитаем из истории)
}
/** Что проверял экран: слово / фраза + как ответили (true / false; null — только показали, без оценки) */
export interface RHit { text: string; tr?: string; image?: string; audio?: string; kind?: RKind; key?: string; ok: boolean | null }      // key — свой ключ (у навыков и тем)

const clean = (v?: string) => (v ?? '').replace(/\s+/g, ' ').trim()
export const keyOf = (text: string) => clean(text).toLowerCase().replace(/[’‘`]/g, "'").replace(/[.!?…,;:]+$/g, '')
/** Слово — одно-два слова («Hello!», «a może…», «…a ty?», «to read»); длиннее — фраза (как в словаре Busuu) */
export const kindOf = (text: string): RKind => (clean(text).split(' ').length <= 2 ? 'word' : 'phrase')

/** Слова и фразы экрана + результат ответа. ok — экран решён верно; wrong — номера неверных пар (для «Пар») */
export function hitsOf(s: Step, res: { ok?: boolean | null; wrong?: number[] } = {}): RHit[] {
  const ok = res.ok ?? null, out: RHit[] = []
  const add = (h: RHit) => { if (clean(h.text)) out.push({ ...h, text: clean(h.text), tr: clean(h.tr) }) }
  if (s.kind === 'intro') add({ text: s.word ?? '', tr: s.tr, image: s.image, audio: s.audio, ok: null })
  if (s.kind === 'tip') for (const o of s.opts ?? []) add({ text: o.w, tr: o.t, audio: o.audio, ok: null })
  if (s.kind === 'choice') { const o = s.opts?.[s.ans ?? 0]; if (o) add({ text: o.w, tr: o.t, image: o.image ?? s.image, audio: o.audio ?? s.audio, ok }) }
  if (s.kind === 'pairs') (s.pairs ?? []).filter(p => p.a?.trim() && p.b?.trim()).forEach((p, k) => add({ text: p.a, tr: p.b, ok: ok == null ? null : !(res.wrong ?? []).includes(k) }))
  if (s.kind === 'order') add({ text: s.by === 'letters' ? orderParts(s).join('') : s.phrase ?? '', tr: s.tr, audio: s.audio, kind: s.by === 'letters' ? 'word' : undefined, ok })
  if (s.kind === 'gap') { const g = gapParts(s.phrase); add({ text: g.a + g.gap + g.b, tr: s.tr, image: s.image, audio: s.audio, ok }) }
  if (s.kind === 'speak') add({ text: s.phrase ?? '', tr: s.tr, image: s.image, audio: s.audio, ok: null })          // речь не проверяем — только «встречалось»
  return out
}

const cardOf = (m: RMem): Card => ({ due: new Date(m.last), stability: m.s, difficulty: m.d, elapsed_days: 0, scheduled_days: 0, learning_steps: 0,
  reps: m.n, lapses: m.l, state: m.st as State, last_review: new Date(m.last) })
const memOfCard = (c: Card, t: number): RMem => ({ s: Math.round(c.stability * 1000) / 1000, d: Math.round(c.difficulty * 1000) / 1000, last: t, n: c.reps, l: c.lapses, st: c.state })

/** Один ответ: память до (нет — первое знакомство) → память после */
export function rate(m: RMem | undefined, ok: boolean, t: number, cfg: Pick<AlgoCfg, 'retention' | 'maxDays'> = ALGO_DEFAULT): RMem {
  const at = m ? Math.max(t, m.last) : t
  const card = m ? cardOf(m) : createEmptyCard(new Date(at))
  return memOfCard(schedulerOf(cfg).next(card, new Date(at), ok ? Rating.Good : Rating.Again).card, at)
}
/** Записи до FSRS: память — из истории ответов (она хранится от новых к старым) */
export function replay(x: Pick<RItem, 'hist'>, cfg: Pick<AlgoCfg, 'retention' | 'maxDays'> = ALGO_DEFAULT): RMem | undefined {
  let m: RMem | undefined
  for (const h of [...x.hist].reverse()) if (h.ok !== null) m = rate(m, h.ok, h.t, cfg)
  return m
}
export const memOf = (x: Pick<RItem, 'f' | 'hist'>): RMem | undefined => x.f ?? replay(x)

/** Интервал (дни), через который вероятность вспомнить упадёт до желаемой */
export const intervalOf = (stab: number, cfg: Pick<AlgoCfg, 'retention' | 'maxDays'> = ALGO_DEFAULT) => schedulerOf(cfg).next_interval(stab, 0)
/** Вероятность вспомнить (0–1) через t дней после ответа при стабильности stab — кривая забывания FSRS */
export const recallAt = (stab: number, days: number) => forgetting_curve(W, Math.max(0, days), stab)
export const levelOf = (stab: number): RLevel => (stab < LV_DAYS.medium ? 'weak' : stab < LV_DAYS.strong ? 'medium' : 'strong')

export interface RState { level: RLevel; recall: number | null; stab: number; due: number | null; ivl: number | null; isNew: boolean; failed: boolean }
/** Сколько после ошибки показываем «не вспомнил» вместо процента (сразу после любого ответа FSRS даёт 100 % — после ошибки это сбивает) */
export const FAIL_SHOW = 3_600_000
/** Слово сейчас: уровень, вероятность вспомнить (%), стабильность, когда повторить (по текущим настройкам) */
export function stateOf(x: Pick<RItem, 'f' | 'hist'>, now = Date.now(), cfg: Pick<AlgoCfg, 'retention' | 'maxDays'> = ALGO_DEFAULT): RState {
  const m = memOf(x)
  if (!m) return { level: 'weak', recall: null, stab: 0, due: null, ivl: null, isNew: true, failed: false }
  const ivl = intervalOf(m.s, cfg)
  const h = x.hist.find(e => e.ok !== null), failed = !!h && h.ok === false && now - h.t < FAIL_SHOW
  return { level: levelOf(m.s), recall: Math.round(recallAt(m.s, (now - m.last) / DAY) * 100), stab: m.s, due: m.last + ivl * DAY, ivl, isNew: false, failed }
}

/** Записать ответы экрана в словарь (меняет items на месте). ctx — название упражнения, урока, курса */
export function applyHits(items: Record<string, RItem>, hits: RHit[], ctx: { ex: string; lesson?: string; course?: string }, now = Date.now(), cfg: Pick<AlgoCfg, 'retention' | 'maxDays'> = ALGO_DEFAULT) {
  for (const h of hits) {
    const key = h.key ?? keyOf(h.text); if (!key) continue
    let x = items[key]
    if (!x) x = items[key] = { key, kind: h.kind ?? kindOf(h.text), text: h.text, tr: h.tr ?? '', image: h.image, audio: h.audio, s: 0, due: now, seen: now, ok: 0, bad: 0, hist: [], course: ctx.course, lesson: ctx.lesson }
    if (!x.tr && h.tr) x.tr = h.tr
    if (!x.image && h.image) x.image = h.image
    if (!x.audio && h.audio) x.audio = h.audio
    if (h.ok !== null) {
      if (!x.f) { const m = replay(x, cfg); if (m) x.f = m }
      x.f = rate(x.f, h.ok, now, cfg)
      x.due = x.f.last + intervalOf(x.f.s, cfg) * DAY
      x.s = Math.round(recallAt(x.f.s, 0) * 100)                 // для старых версий сайта: «сила» = вероятность вспомнить сразу после ответа
      if (h.ok) x.ok++; else x.bad++
    }
    x.seen = now
    x.hist = [{ t: now, ok: h.ok, ex: ctx.ex, lesson: ctx.lesson }, ...x.hist].slice(0, 20)
  }
  return items
}
export const exName = (s: Step) => (s.kind === 'order' && s.by === 'letters' ? 'Собери слово' : KINDS[s.kind]?.t ?? s.kind)

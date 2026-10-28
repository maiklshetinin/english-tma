// Планировщик повторений как в Anki (FSRS-5 — алгоритм, который Anki использует при включённом FSRS) с шагами изучения Anki по умолчанию.
//
//  • Новая карточка проходит «шаги изучения» 1 мин → 10 мин (как в Anki): «Снова» — заново через 1 мин, «Трудно» — через ~6 мин,
//    «Хорошо» — следующий шаг, после последнего шага карточка «выпускается» в повторения на N дней; «Легко» — сразу в повторения.
//  • Повторение: интервал считается из «стабильности» памяти S (через сколько дней вероятность вспомнить упадёт до 90 %).
//    «Хорошо» растит S, «Трудно» — меньше, «Легко» — сильнее; «Снова» — ошибка (lapse), карточка уходит на «переучивание» (шаг 10 мин),
//    стабильность падает. Сложность D (1–10) слова тоже меняется от ответов.
//  • Интервалы «Трудно < Хорошо < Легко» всегда растут, как в Anki.
// Чисто вычисления, без хранилища. Время — в мс (Date.now()), дни — локальные календарные.
import type { SrsState } from '../../server/types'

/** Параметры FSRS-5 по умолчанию (как в Anki до оптимизации под пользователя). */
export const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621]
export const RETENTION = 0.9                       // желаемая вероятность вспомнить (Anki: Desired retention 0.90)
export const LEARN_STEPS = [1, 10]                 // минуты (Anki: Learning steps 1m 10m)
export const RELEARN_STEPS = [10]                  // минуты (Anki: Relearning steps 10m)
export const MAX_IVL = 36500                       // дней
export const LEARN_AHEAD = 20                      // минут: если больше нечего учить, карточку на шаге можно показать раньше (как в Anki)
const DECAY = -0.5, FACTOR = 19 / 81, MIN = 60_000, DAY = 86_400_000

export type Grade = 1 | 2 | 3 | 4                  // 1 Снова, 2 Трудно, 3 Хорошо, 4 Легко
export type Phase = 'new' | 'learning' | 'review' | 'relearning'

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const pad = (n: number) => String(n).padStart(2, '0')
export const ymdOf = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const dayStart = (ymd: string) => new Date(ymd + 'T00:00').getTime()
/** Полных календарных дней между двумя датами 'YYYY-MM-DD' (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((dayStart(b) - dayStart(a)) / DAY)
const addDaysYmd = (ymd: string, n: number) => { const d = new Date(ymd + 'T12:00'); d.setDate(d.getDate() + n); return ymdOf(d.getTime()) }

// ── формулы FSRS-5 ──
export const retrievability = (t: number, s: number) => Math.pow(1 + FACTOR * t / s, DECAY)
export const nextInterval = (s: number) => clamp(Math.round(s / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1)), 1, MAX_IVL)
const initS = (g: Grade) => W[g - 1]
const initD = (g: Grade) => W[4] - Math.exp(W[5] * (g - 1)) + 1
const nextD = (d: number, g: Grade) => {
  const d1 = d + (-W[6] * (g - 3)) * (10 - d) / 9                          // линейное затухание к 10
  return clamp(W[7] * initD(4) + (1 - W[7]) * d1, 1, 10)                    // возврат к среднему
}
const recallS = (d: number, s: number, r: number, g: Grade) =>
  s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1))
const forgetS = (d: number, s: number, r: number) =>
  Math.min(W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)), s / Math.exp(W[17] * W[18]))
const shortTermS = (s: number, g: Grade) => s * Math.exp(W[17] * (g - 3 + W[18]))   // повтор в тот же день (шаги изучения)

export const phaseOf = (s: SrsState | null): Phase => !s ? 'new' : s.phase ?? (s.interval === 0 ? 'learning' : 'review')

/** Память карточки (S, D) — у старых записей (до FSRS) оцениваем по интервалу и «лёгкости» SM-2. */
function memoryOf(s: SrsState): { stab: number; diff: number } {
  if (s.stab && s.diff) return { stab: s.stab, diff: s.diff }
  return { stab: Math.max(0.1, s.interval || W[2]), diff: clamp(1 + (3 - (s.ease || 2.5)) / 1.7 * 9, 1, 10) }
}

/** Новая память после ответа g в момент now. */
function memoryAfter(s: SrsState | null, g: Grade, now: number) {
  if (!s || (!s.stab && phaseOf(s) !== 'review' && !s.reps)) return { stab: initS(g), diff: clamp(initD(g), 1, 10) }
  const m = memoryOf(s), elapsed = daysBetween(s.last, ymdOf(now))
  if (elapsed <= 0) return { stab: shortTermS(m.stab, g), diff: nextD(m.diff, g) }
  const r = retrievability(elapsed, m.stab)
  return { stab: g === 1 ? forgetS(m.diff, m.stab, r) : recallS(m.diff, m.stab, r, g), diff: nextD(m.diff, g) }
}

/** Задержка шага «Трудно» (как в Anki): на первом шаге — среднее первых двух шагов (или ×1,5, если шаг один), дальше — текущий шаг. */
const hardDelay = (steps: number[], step: number) => step > 0 ? steps[step] : steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5

/** Что будет после ответа: фаза, шаг, задержка (минуты на шаге или дни в повторении). Без записи — для подписей на кнопках. */
export function plan(s: SrsState | null, g: Grade, now = Date.now()) {
  const ph = phaseOf(s), mem = memoryAfter(s, g, now)
  const ivl = (st: number) => nextInterval(st)
  // Интервалы трёх «успешных» ответов — чтобы соблюсти Трудно < Хорошо < Легко (как в Anki)
  const ivls = () => {
    const h = ivl(memoryAfter(s, 2, now).stab), gd = ivl(memoryAfter(s, 3, now).stab), e = ivl(memoryAfter(s, 4, now).stab)
    const hh = Math.min(h, gd), gg = Math.max(gd, hh + 1)
    return { 2: hh, 3: gg, 4: Math.max(e, gg + 1) } as Record<2 | 3 | 4, number>
  }
  if (ph === 'new' || ph === 'learning' || ph === 'relearning') {
    const steps = ph === 'relearning' ? RELEARN_STEPS : LEARN_STEPS, step = ph === 'new' ? 0 : s?.step ?? 0, phase = ph === 'relearning' ? 'relearning' : 'learning'
    if (g === 1) return { ...mem, phase, step: 0, minutes: steps[0], days: 0 }
    if (g === 2) return { ...mem, phase, step, minutes: hardDelay(steps, step), days: 0 }
    if (g === 3 && step + 1 < steps.length) return { ...mem, phase, step: step + 1, minutes: steps[step + 1], days: 0 }
    const good = ivl(memoryAfter(s, 3, now).stab)
    const days = g === 3 ? good : Math.max(ivl(mem.stab), good + 1)               // «выпуск» в повторения
    return { ...mem, phase: 'review' as const, step: 0, minutes: 0, days }
  }
  if (g === 1) return { ...mem, phase: 'relearning' as const, step: 0, minutes: RELEARN_STEPS[0], days: 0 }
  return { ...mem, phase: 'review' as const, step: 0, minutes: 0, days: ivls()[g] }
}

/** Ответ на карточку: новое состояние (q: 0 Снова … 3 Легко, как кнопки). Пишет и короткую историю ответов для графика. */
export function answer(s: SrsState | null, q: number, now = Date.now()): SrsState {
  const g = (q + 1) as Grade, p = plan(s, g, now), t = ymdOf(now), ph = phaseOf(s)
  const lapse = ph === 'review' && g === 1
  const due = p.minutes ? ymdOf(now + p.minutes * MIN) : addDaysYmd(t, p.days)
  const hist = [...(s?.hist ?? []).filter((h) => !Array.isArray(h)), { t: now, q, i: p.minutes ? -Math.round(p.minutes) : p.days }].slice(-12)
  return {
    ease: Math.round(clamp(3 - (p.diff - 1) / 9 * 1.7, 1.3, 5) * 100) / 100,         // для совместимости со старыми записями
    interval: p.minutes ? 0 : p.days,
    reps: (s?.reps ?? 0) + 1,
    lapses: (s?.lapses ?? 0) + (lapse ? 1 : 0),
    first: s?.first ?? t, last: t, due,
    phase: p.phase as Exclude<Phase, 'new'>, step: p.step,
    dueAt: p.minutes ? now + Math.round(p.minutes * MIN) : dayStart(due),
    stab: Math.round(p.stab * 1000) / 1000, diff: Math.round(p.diff * 1000) / 1000,
    lastAt: now, hist,
  }
}

/** Подпись срока как на кнопках Anki: «<1 мин.», «<10 мин.», «1 ч.», «3 дн.», «3,6 мес.», «1,2 г.». */
export function fmtSpan(minutes: number, days: number): string {
  const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('ru-RU')
  if (minutes) return minutes < 60 ? `<${Math.max(1, Math.round(minutes))} мин.` : `${n1(minutes / 60)} ч.`
  return days < 30 ? `${days} дн.` : days < 365 ? `${n1(days / 30)} мес.` : `${n1(days / 365)} г.`
}
export const label = (s: SrsState | null, q: number, now = Date.now()) => { const p = plan(s, (q + 1) as Grade, now); return fmtSpan(p.minutes, p.days) }

/** Когда карточку пора показывать (мс). */
export const dueMs = (s: SrsState) => s.dueAt ?? dayStart(s.due)
/** Сколько сейчас вероятность вспомнить (0–1) — для графика колоды. */
export function recallNow(s: SrsState, now = Date.now()) {
  const { stab } = memoryOf(s); return retrievability(Math.max(0, (now - (s.lastAt ?? dayStart(s.last))) / DAY), stab)
}
export { memoryOf }

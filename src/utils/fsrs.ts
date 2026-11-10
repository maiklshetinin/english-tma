// Планировщик колод как в Anki: FSRS-6 из библиотеки ts-fsrs (та же, что считает Review — utils/review.ts),
// с шагами изучения Anki по умолчанию.
//
//  • Новая карточка проходит «шаги изучения» 1 мин → 10 мин (как в Anki): «Снова» — заново через 1 мин, «Трудно» — через ~6 мин,
//    «Хорошо» — следующий шаг, после последнего шага карточка «выпускается» в повторения на N дней; «Легко» — сразу в повторения.
//  • Повторение: интервал считается из «стабильности» памяти S (через сколько дней вероятность вспомнить упадёт до 90 %) и
//    «желаемого запоминания» (настройка преподавателя для колод). «Хорошо» растит S, «Трудно» — меньше, «Легко» — сильнее;
//    «Снова» — ошибка (lapse), карточка уходит на «переучивание» (шаг 10 мин), стабильность падает. Сложность D (1–10) тоже меняется.
//  • Интервалы «Трудно < Хорошо < Легко» всегда растут, как в Anki (это делает библиотека).
// Своих формул здесь нет — только перевод состояния карточки (SrsState, как его хранит сервер) в карточку ts-fsrs и обратно.
// Время — в мс (Date.now()), дни — локальные календарные (повторение назначается на начало дня, как в Anki).
import { fsrs, generatorParameters, createEmptyCard, forgetting_curve, State, type Card, type FSRS, type Grade as FGrade } from 'ts-fsrs'
import type { SrsState } from '../../server/types'

export const LEARN_AHEAD = 20                      // минут: если больше нечего учить, карточку на шаге можно показать раньше (как в Anki)
const MIN = 60_000, DAY = 86_400_000

/** Настройки колод: желаемое запоминание и максимальный интервал (как в Anki: Desired retention 0.90) */
export interface DeckCfg { retention: number; maxDays: number }
export const DECK_DEFAULT: DeckCfg = { retention: 0.9, maxDays: 36500 }

export type Grade = 1 | 2 | 3 | 4                  // 1 Снова, 2 Трудно, 3 Хорошо, 4 Легко
export type Phase = 'new' | 'learning' | 'review' | 'relearning'

const cache = new Map<string, FSRS>()
function schedulerOf(cfg: DeckCfg = DECK_DEFAULT): FSRS {
  const k = cfg.retention + '/' + cfg.maxDays
  let f = cache.get(k)
  if (!f) cache.set(k, f = fsrs(generatorParameters({ request_retention: cfg.retention, maximum_interval: cfg.maxDays, enable_fuzz: false,
    enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] })))
  return f
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const pad = (n: number) => String(n).padStart(2, '0')
export const ymdOf = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const dayStart = (ymd: string) => new Date(ymd + 'T00:00').getTime()
const addDaysYmd = (ymd: string, n: number) => { const d = new Date(ymd + 'T12:00'); d.setDate(d.getDate() + n); return ymdOf(d.getTime()) }

export const phaseOf = (s: SrsState | null): Phase => !s ? 'new' : s.phase ?? (s.interval === 0 ? 'learning' : 'review')
const STATE: Record<Phase, State> = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning }

/** Память карточки (S, D) — у старых записей (до FSRS) оцениваем по интервалу и «лёгкости» SM-2. */
export function memoryOf(s: SrsState): { stab: number; diff: number } {
  if (s.stab && s.diff) return { stab: s.stab, diff: s.diff }
  return { stab: Math.max(0.1, s.interval || 3), diff: clamp(1 + (3 - (s.ease || 2.5)) / 1.7 * 9, 1, 10) }
}
/** Когда карточку пора показывать (мс). */
export const dueMs = (s: SrsState) => s.dueAt ?? dayStart(s.due)

/** Состояние, как его хранит сервер → карточка ts-fsrs */
function cardOf(s: SrsState | null, now: number): Card {
  if (!s) return createEmptyCard(new Date(now))
  const m = memoryOf(s), ph = phaseOf(s)
  return { due: new Date(dueMs(s)), stability: m.stab, difficulty: m.diff, elapsed_days: 0, scheduled_days: s.interval, learning_steps: s.step ?? 0,
    reps: s.reps, lapses: s.lapses, state: STATE[ph], last_review: new Date(Math.min(now, s.lastAt ?? dayStart(s.last))) }
}

/** Что будет после ответа: карточка ts-fsrs, минуты на шаге изучения или дни в повторении. Без записи — для подписей на кнопках. */
function plan(s: SrsState | null, g: Grade, now: number, cfg?: DeckCfg) {
  const c = schedulerOf(cfg).next(cardOf(s, now), new Date(now), g as FGrade).card
  const step = c.state === State.Learning || c.state === State.Relearning
  return { c, minutes: step ? Math.max(0, (c.due.getTime() - now) / MIN) : 0, days: step ? 0 : clamp(c.scheduled_days, 1, (cfg ?? DECK_DEFAULT).maxDays) }      // «Легко» библиотека может отодвинуть за максимум — держим
}

/** Ответ на карточку: новое состояние (q: 0 Снова … 3 Легко, как кнопки). Пишет и короткую историю ответов для графика. */
export function answer(s: SrsState | null, q: number, now = Date.now(), cfg?: DeckCfg): SrsState {
  const g = (q + 1) as Grade, { c, minutes, days } = plan(s, g, now, cfg), t = ymdOf(now)
  const due = minutes ? ymdOf(now + minutes * MIN) : addDaysYmd(t, days)
  const hist = [...(s?.hist ?? []).filter((h) => !Array.isArray(h)), { t: now, q, i: minutes ? -Math.round(minutes) : days }].slice(-12)
  const phase = c.state === State.Relearning ? 'relearning' : c.state === State.Review ? 'review' : 'learning'
  return {
    ease: Math.round(clamp(3 - (c.difficulty - 1) / 9 * 1.7, 1.3, 5) * 100) / 100,      // для совместимости со старыми записями
    interval: minutes ? 0 : days,
    reps: (s?.reps ?? 0) + 1,
    lapses: c.lapses,
    first: s?.first ?? t, last: t, due,
    phase, step: minutes ? c.learning_steps : 0,
    dueAt: minutes ? now + Math.round(minutes * MIN) : dayStart(due),
    stab: Math.round(c.stability * 1000) / 1000, diff: Math.round(clamp(c.difficulty, 1, 10) * 1000) / 1000,
    lastAt: now, hist,
  }
}

/** Подпись срока как на кнопках Anki: «<1 мин.», «<10 мин.», «1 ч.», «3 дн.», «3,6 мес.», «1,2 г.». */
export function fmtSpan(minutes: number, days: number): string {
  const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('ru-RU')
  if (minutes) return minutes < 60 ? `<${Math.max(1, Math.round(minutes))} мин.` : `${n1(minutes / 60)} ч.`
  return days < 30 ? `${days} дн.` : days < 365 ? `${n1(days / 30)} мес.` : `${n1(days / 365)} г.`
}
export const label = (s: SrsState | null, q: number, now = Date.now(), cfg?: DeckCfg) => { const p = plan(s, (q + 1) as Grade, now, cfg); return fmtSpan(p.minutes, p.days) }

/** Сколько сейчас вероятность вспомнить (0–1) — для графика колоды; кривая забывания FSRS-6. */
export function recallNow(s: SrsState, now = Date.now()) {
  const { stab } = memoryOf(s)
  return forgetting_curve(schedulerOf().parameters.w, Math.max(0, (now - (s.lastAt ?? dayStart(s.last))) / DAY), stab)
}



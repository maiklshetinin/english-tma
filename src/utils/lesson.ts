// Интерактивный урок (как в Busuu): задание курса «Урок» (и «Слова», «Домашка», «Тест») — это свой маленький рельс экранов.
// Экраны идут по порядку, последний пункт рельса всегда «Итог урока» (его не двигают и не удаляют — он не хранится в steps).
//  • intro  — «Новое слово»: своё видео / фото / аудио или карточка из колоды; слово, перевод, пример.
//  • choice — «Выбери ответ»: вопрос на слух или переводом, варианты картинками или текстом (2–4), один верный.
//  • pairs  — «Пары»: соединить слово с переводом (2–6 пар).
// Файл в поле image / audio / video: https-ссылка (фото и озвучка карточек), ключ файла курса в S3 (t/…/c/…)
// или «idb:<id>» — файл пока только в этом браузере (без сервера или до загрузки), на сервер такой не уходит.

export type StepKind = 'intro' | 'choice' | 'pairs'
export interface Opt { w: string; t?: string; image?: string; audio?: string }
export interface Pair { a: string; b: string }
export interface Step {
  id: string; kind: StepKind
  word?: string; tr?: string; ex?: string; exTr?: string            // «Новое слово»
  image?: string; audio?: string; video?: string                     // свои файлы или из карточки (в «Выбери ответ» audio — свой звук вопроса)
  ask?: 'audio' | 'tr'; show?: 'pics' | 'text'; opts?: Opt[]; ans?: number   // «Выбери ответ»
  pairs?: Pair[]                                                     // «Пары»
}

/** Задания курса, в которые можно собрать экраны */
export const INTERACTIVE = ['lesson', 'words', 'hw', 'test']
export const STEPS_MAX = 40, OPTS_MAX = 4, PAIRS_MAX = 6
/** Сколько места по вертикали занимает горизонтальный рельс урока с карточками экранов (редактор курса раздвигает рельс) */
export const RAIL_H = 420

export const KINDS: Record<StepKind, { t: string; d: string; c: string; dk: string; ic: string; head: string }> = {
  intro: { t: 'Новое слово', d: 'Видео, фото или аудио и слово с примером — знакомим с новой лексикой', c: 'var(--blue)', dk: 'var(--blue-d)', head: 'Смотрите, новое слово!',
    ic: '<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>' },
  choice: { t: 'Выбери ответ', d: 'Вопрос на слух или переводом, ответы картинками или текстом', c: 'var(--purple)', dk: 'var(--purple-d)', head: 'Выберите правильный вариант',
    ic: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><path d="M13.8 16.6l2.1 2.1 3.6-4.2"/>' },
  pairs: { t: 'Пары', d: 'Соединить слово с переводом — до 6 пар из карточек или своих', c: 'var(--orange)', dk: 'var(--orange-d)', head: 'Соедините пары',
    ic: '<rect x="3.5" y="5" width="7" height="5" rx="1.6"/><rect x="13.5" y="5" width="7" height="5" rx="1.6"/><rect x="3.5" y="14" width="7" height="5" rx="1.6"/><rect x="13.5" y="14" width="7" height="5" rx="1.6"/><path d="M10.5 7.5h3M10.5 16.5h3"/>' },
}
export const KIND_LIST = Object.keys(KINDS) as StepKind[]
export const FINAL = { t: 'Итог урока', c: 'var(--yellow)', dk: 'var(--yellow-d)',
  ic: '<path d="M8 4.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5v.8A3.7 3.7 0 0 0 8 11M16 6.5h3.5v.8A3.7 3.7 0 0 1 16 11"/><path d="M12 14v4M8.5 20h7"/>' }

let seq = Date.now() % 100000
export const stepId = () => 's' + Date.now().toString(36).slice(-4) + (++seq).toString(36)

export function newStep(kind: StepKind): Step {
  if (kind === 'choice') return { id: stepId(), kind, ask: 'audio', show: 'pics', opts: [], ans: 0 }
  if (kind === 'pairs') return { id: stepId(), kind, pairs: [] }
  return { id: stepId(), kind, word: '', tr: '', ex: '', exTr: '' }
}

/** Подпись экрана на рельсе: само слово, если оно уже есть */
export function stepTitle(s: Step): string {
  if (s.kind === 'intro') return s.word?.trim() || KINDS.intro.t
  if (s.kind === 'choice') return s.opts?.[s.ans ?? 0]?.w?.trim() || KINDS.choice.t
  const n = s.pairs?.filter(p => p.a.trim() && p.b.trim()).length ?? 0
  return n ? `${n} ${n === 1 ? 'пара' : n < 5 ? 'пары' : 'пар'}` : KINDS.pairs.t
}

/** Чего не хватает, чтобы экран можно было пройти (пусто — готов) */
export function stepIssue(s: Step): string {
  if (s.kind === 'intro') return s.word?.trim() || s.video || s.image ? '' : 'Нет слова и файла'
  if (s.kind === 'choice') {
    const o = s.opts ?? []
    if (o.length < 2) return 'Нужно хотя бы 2 варианта'
    const a = o[s.ans ?? 0]
    if (!a) return 'Не выбран верный ответ'
    if (s.ask === 'audio' && !(s.audio || a.audio)) return 'Нет звука для вопроса'
    if (s.ask === 'tr' && !a.t?.trim()) return 'Нет перевода у верного ответа'
    if (s.show === 'pics' && o.some(x => !x.image)) return 'Не у всех вариантов есть фото'
    return ''
  }
  return (s.pairs?.filter(p => p.a.trim() && p.b.trim()).length ?? 0) >= 2 ? '' : 'Нужно хотя бы 2 пары'
}

/** Карточка колоды → поля экрана */
export interface CardLike { id?: string; front: string; back: string; example?: string; exampleTr?: string; image?: string; audio?: string }
export const cardToIntro = (c: CardLike): Partial<Step> => ({ word: c.front, tr: c.back, ex: c.example ?? '', exTr: c.exampleTr ?? '', image: c.image || undefined, audio: c.audio || undefined })
export const cardToOpt = (c: CardLike): Opt => ({ w: c.front, t: c.back, ...(c.image ? { image: c.image } : {}), ...(c.audio ? { audio: c.audio } : {}) })
export const cardToPair = (c: CardLike): Pair => ({ a: c.front, b: c.back })

/** Все ссылки на файлы экрана (чтобы удалить из хранилища вместе с экраном) */
export const stepRefs = (s: Step): string[] => [s.image, s.audio, s.video, ...(s.opts ?? []).flatMap(o => [o.image, o.audio])].filter(Boolean) as string[]

/** Перемешать (для вариантов и пар у ученика) */
export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

/** Копия шагов для сервера и коллег: файлы «только в этом браузере» не отправляем */
export function stepsOut(steps: Step[] | undefined): Step[] {
  const ok = (v?: string) => (v && !v.startsWith('idb:') && !v.startsWith('blob:') ? v : undefined)
  return (steps ?? []).map(s => JSON.parse(JSON.stringify({ ...s, image: ok(s.image), audio: ok(s.audio), video: ok(s.video),
    ...(s.opts ? { opts: s.opts.map(o => ({ ...o, image: ok(o.image), audio: ok(o.audio) })) } : {}) })))
}

/** Пришли шаги с сервера / от коллеги: свои файлы, которые ещё только в браузере, не теряем */
export function keepLocalFiles(incoming: Step[] | undefined, local: Step[] | undefined): Step[] | undefined {
  if (!incoming || !local?.length) return incoming
  const mine = new Map(local.map(s => [s.id, s]))
  return incoming.map(s => {
    const m = mine.get(s.id); if (!m) return s
    const out = { ...s }
    for (const f of ['image', 'audio', 'video'] as const) if (!out[f] && m[f]?.startsWith('idb:')) out[f] = m[f]
    return out
  })
}

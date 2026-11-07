// Интерактивный урок (как в Busuu): задание курса «Урок» (и «Слова», «Домашка», «Тест») — это свой маленький рельс экранов.
// Экраны идут по порядку, последний пункт рельса всегда «Итог урока» (его не двигают и не удаляют — он не хранится в steps).
//  • intro  — «Новое слово»: своё видео / фото / аудио или карточка из колоды; слово, перевод, пример.
//  • choice — «Выбери ответ»: вопрос на слух или переводом, варианты картинками или текстом (2–4), один верный.
//  • pairs  — «Пары»: соединить слово с переводом (2–6 пар).
//  • order  — «Собери фразу»: слова фразы вразброс, ученик ставит их по порядку (звук, перевод, пояснение).
//  • tip    — «Подсказка»: мини-правило текстом (**жирное** — выделить) и табличка фраз с переводом и озвучкой (в opts).
//  • speak  — «Повтори за диктором»: видео (или фото со звуком) и фраза; ученик записывает себя и слушает.
//  • gap    — «Заполни пропуск»: фраза с пропуском в [квадратных скобках]; есть варианты (opts) — выбрать плашку, нет — вписать самому.
//  • answer — «Ответь на вопрос»: фото и вопрос, подсказка; ученик отвечает устно (запись) или письменно, пример ответа — в tr.
// «Аудиотест» — это «Выбери ответ» с фото вопроса (image) и звуком поверх, ответы текстом (шаблон в TEMPLATES).
// Файл в поле image / audio / video: https-ссылка (фото и озвучка карточек), ключ файла курса в S3 (t/…/c/…)
// или «idb:<id>» — файл пока только в этом браузере (без сервера или до загрузки), на сервер такой не уходит.

export type StepKind = 'intro' | 'choice' | 'pairs' | 'order' | 'tip' | 'speak' | 'gap' | 'answer'
export interface Opt { w: string; t?: string; image?: string; audio?: string }
export interface Pair { a: string; b: string }
export interface Step {
  id: string; kind: StepKind
  word?: string; tr?: string; ex?: string; exTr?: string            // «Новое слово»
  image?: string; audio?: string; video?: string; exAudio?: string   // свои файлы или из карточки (в «Выбери ответ» audio — свой звук вопроса; exAudio — озвучка примера)
  ask?: 'audio' | 'tr'; show?: 'pics' | 'text'; opts?: Opt[]; ans?: number   // «Выбери ответ»
  pairs?: Pair[]                                                     // «Пары»
  phrase?: string; note?: string                                     // «Собери фразу»: фраза (слова через пробел), перевод — в tr, пояснение
  text?: string                                                      // «Подсказка»: текст правила; фразы с переводом и звуком — в opts; «Ответь на вопрос»: вопрос
  min?: number                                                       // сколько минут примерно уходит на экран (нет — по типу экрана, KIND_MIN)
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
  order: { t: 'Собери фразу', d: 'Слова вразброс — ученик ставит их по порядку, на слух', c: 'var(--green)', dk: 'var(--green-d)', head: 'Расставьте слова в правильном порядке',
    ic: '<rect x="3" y="5" width="6" height="5" rx="1.5"/><rect x="10.5" y="5" width="4" height="5" rx="1.5"/><rect x="16" y="5" width="5" height="5" rx="1.5"/><path d="M4 16h16M16 13l4 3-4 3"/>' },
  tip: { t: 'Подсказка', d: 'Мини-правило и табличка фраз с переводом и озвучкой', c: 'var(--yellow)', dk: 'var(--yellow-d)', head: 'Подсказка!',
    ic: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>' },
  speak: { t: 'Повтори за диктором', d: 'Видео с фразой — ученик записывает себя и сравнивает', c: 'var(--red)', dk: 'var(--red-d)', head: 'Повтори за диктором',
    ic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>' },
  gap: { t: 'Заполни пропуск', d: 'Фраза с пропуском: вписать слово или выбрать из вариантов', c: 'var(--teal, #14b8a6)', dk: 'var(--teal-d, #0f8f80)', head: 'Закончи предложение',
    ic: '<path d="M3 17h4M17 17h4"/><path d="M9 17h6" stroke-dasharray="2 2"/><path d="M5 8h14"/>' },
  answer: { t: 'Ответь на вопрос', d: 'Фото и вопрос — ученик отвечает устно или письменно', c: 'var(--blue)', dk: 'var(--blue-d)', head: 'Ответь на вопрос',
    ic: '<path d="M4 5h16v10H9l-5 4z"/><path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9M12 13.2v.1"/>' },
}
export const KIND_LIST = Object.keys(KINDS) as StepKind[]

/** Примерное время экрана по типу, в минутах (как «11 MIN» у урока в Busuu); репетитор может поставить своё */
export const KIND_MIN: Record<StepKind, number> = { intro: 0.5, choice: 0.5, pairs: 1, order: 1, tip: 1, speak: 1, gap: 0.5, answer: 1.5 }
export const MIN_CHOICES = [0.5, 1, 1.5, 2, 3, 5, 10]
export const stepMin = (s: Step) => (typeof s.min === 'number' && s.min > 0 ? s.min : KIND_MIN[s.kind] ?? 1)
/** Время урока — сумма экранов, округлённая вверх до минуты (пустой урок — 0) */
export const lessonMin = (steps?: Step[]) => { const m = (steps ?? []).reduce((a, s) => a + stepMin(s), 0); return m ? Math.max(1, Math.ceil(m - 1e-9)) : 0 }
/** Время урока для ученика: своё (репетитор поставил у урока) или сумма экранов */
export const itemMin = (x: { min?: number; steps?: Step[] }, steps = x.steps) => (typeof x.min === 'number' && x.min >= 1 ? x.min : lessonMin(steps))
export const fmtMin = (m: number) => (m < 1 ? '½' : String(m).replace('.5', '½').replace(/^0½/, '½'))
export const FINAL = { t: 'Итог урока', c: 'var(--yellow)', dk: 'var(--yellow-d)',
  ic: '<path d="M8 4.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5v.8A3.7 3.7 0 0 0 8 11M16 6.5h3.5v.8A3.7 3.7 0 0 1 16 11"/><path d="M12 14v4M8.5 20h7"/>' }

let seq = Date.now() % 100000
export const stepId = () => 's' + Date.now().toString(36).slice(-4) + (++seq).toString(36)

export function newStep(kind: StepKind): Step {
  if (kind === 'choice') return { id: stepId(), kind, ask: 'audio', show: 'pics', opts: [], ans: 0 }
  if (kind === 'pairs') return { id: stepId(), kind, pairs: [] }
  if (kind === 'order') return { id: stepId(), kind, phrase: '', tr: '', note: '' }
  if (kind === 'tip') return { id: stepId(), kind, text: '', opts: [] }
  if (kind === 'speak') return { id: stepId(), kind, phrase: '', tr: '' }
  if (kind === 'gap') return { id: stepId(), kind, phrase: '', tr: '', opts: [] }
  if (kind === 'answer') return { id: stepId(), kind, text: '', note: '', tr: '' }
  return { id: stepId(), kind, word: '', tr: '', ex: '', exTr: '' }
}

/** «Рыба» — готовый к прохождению экран-образец, как в Busuu: добавили — сразу можно пройти, потом поправить под себя */
// Картинки и озвучка образцов лежат в самом приложении (public/fish): полный адрес на сайте, чтобы сервер принял ссылку (https)
const FISH_BASE = 'https://maiklshetinin.github.io/english-tma/'
export const fish = (name: string) => {
  try { return new URL(`${import.meta.env.BASE_URL ?? '/'}fish/${name}`, typeof location !== 'undefined' && location.protocol === 'https:' ? location.origin : FISH_BASE).href } catch { return `${FISH_BASE}fish/${name}` }
}
const OPT = {
  ok: () => ({ w: 'go ahead', t: 'давай, вперёд', audio: fish('go-ahead.mp3') }),
  good: () => ({ w: 'sounds good', t: 'звучит отлично', audio: fish('sounds-good.mp3'), image: fish('sounds-good.jpg') }),
  fine: () => ({ w: 'it’s fine', t: 'всё в порядке', audio: fish('its-fine.mp3'), image: fish('its-fine.jpg') }),
  np: () => ({ w: 'no problem', t: 'без проблем', audio: fish('no-problem.mp3'), image: fish('no-problem.jpg') }),
}
export function fishStep(kind: StepKind): Step {
  if (kind === 'choice') return { id: stepId(), kind, ask: 'audio', show: 'pics', ans: 2, opts: [OPT.good(), OPT.fine(), OPT.np()] }
  if (kind === 'order') return { id: stepId(), kind, phrase: 'See you later!', tr: 'Увидимся!', audio: fish('see-you-later.mp3'),
    note: '«See you» — ждём новой встречи с собеседником, поэтому обычно добавляется «later» или конкретное время.' }
  if (kind === 'tip') return { id: stepId(), kind,
    text: 'Можно сказать **see you later**, если знаешь, что скоро снова увидишь собеседника. Если же нет, то надо сказать **take care**, **bye** или **goodbye**.',
    opts: [{ w: 'See you later!', t: 'Увидимся!', audio: fish('see-you-later.mp3') }, { w: 'Take care!', t: 'Счастливо!', audio: fish('take-care.mp3') },
      { w: 'Goodbye!', t: 'До свидания!', audio: fish('goodbye.mp3') }, { w: 'Bye!', t: 'Пока!', audio: fish('bye.mp3') }] }
  if (kind === 'speak') return { id: stepId(), kind, phrase: 'Hello!', tr: 'Привет!', video: fish('hello.mp4') }
  if (kind === 'gap') return { id: stepId(), kind, phrase: 'I’m fine, thanks. And [you]?', tr: 'Хорошо, спасибо. А ты?', audio: fish('and-you.mp3'), opts: [] }
  if (kind === 'answer') return { id: stepId(), kind, text: 'What’s your name?', note: 'Начни с «My name’s…» или «I’m…»', tr: 'My name’s Anna.', image: fish('wave.jpg') }
  if (kind === 'pairs') return { id: stepId(), kind, pairs: [{ a: 'I approve', b: 'одобряю' }, { a: 'no problem', b: 'без проблем' }, { a: 'I have no objection', b: 'я не возражаю' }] }
  return { id: stepId(), kind, word: 'it’s fine', tr: 'всё в порядке', ex: 'Jim said it’s fine if we meet at 3 o’clock.', exTr: 'Джим сказал, что можно встретиться в 3 часа.',
    image: fish('its-fine.jpg'), audio: fish('its-fine.mp3'), exAudio: fish('its-fine-ex.mp3') }
}
/** Готовый урок-образец: два новых слова, два выбора ответа, пары, подсказка и «собери фразу» */
export function fishLesson(): Step[] {
  const a = fishStep('intro'), b = { ...fishStep('intro'), word: 'go ahead', tr: 'давай, вперёд', ex: 'Can I ask a question? — Sure, go ahead.', exTr: 'Можно вопрос? — Конечно, давай.',
    image: fish('go-ahead.jpg'), audio: fish('go-ahead.mp3'), exAudio: fish('go-ahead-ex.mp3') }
  const c = fishStep('choice'), d = { ...fishStep('choice'), ask: 'tr' as const, show: 'text' as const, ans: 1, opts: [OPT.np(), OPT.ok(), OPT.fine()] }
  return [a, b, c, d, fishStep('pairs'), fishStep('tip'), fishStep('order')]
}
/** Аудиотест: «Выбери ответ» с фото вопроса и звуком поверх, ответы текстом */
export const fishAudiotest = (): Step => ({ id: stepId(), kind: 'choice', ask: 'audio', show: 'text', ans: 1, image: fish('wave.jpg'), audio: fish('see-you-later.mp3'),
  opts: [{ w: 'How’s it going?' }, { w: 'See you later!', t: 'Увидимся!' }, { w: 'My name’s Lisa.' }] })
/** Пропуск с вариантами-плашками (по видео) */
export const fishFill = (): Step => ({ id: stepId(), kind: 'gap', phrase: '[Hello]!', tr: 'Привет!', video: fish('hello.mp4'), opts: [{ w: 'Halo' }, { w: 'Hello' }] })

/** Шаблоны в меню редактора: тип экрана + готовая «рыба» (у одного типа может быть несколько видов) */
export const TEMPLATES: { id: string; kind: StepKind; t: string; d: string; make: () => Step }[] = [
  { id: 'intro', kind: 'intro', t: 'Новое слово', d: 'Фото, звук, слово и пример', make: () => fishStep('intro') },
  { id: 'choice', kind: 'choice', t: 'Выбери ответ', d: 'На слух — ответы картинками', make: () => fishStep('choice') },
  { id: 'audiotest', kind: 'choice', t: 'Аудиотест', d: 'Фото со звуком — ответы текстом', make: fishAudiotest },
  { id: 'pairs', kind: 'pairs', t: 'Пары', d: 'Слово ↔ перевод', make: () => fishStep('pairs') },
  { id: 'order', kind: 'order', t: 'Собери фразу', d: 'Слова по порядку на слух', make: () => fishStep('order') },
  { id: 'tip', kind: 'tip', t: 'Подсказка', d: 'Мини-правило и фразы', make: () => fishStep('tip') },
  { id: 'speak', kind: 'speak', t: 'Повтори за диктором', d: 'Видео и запись голоса', make: () => fishStep('speak') },
  { id: 'type', kind: 'gap', t: 'Закончи предложение', d: 'Вписать пропущенное слово', make: () => fishStep('gap') },
  { id: 'fill', kind: 'gap', t: 'Заполни пропуск', d: 'Видео — выбрать слово', make: fishFill },
  { id: 'answer', kind: 'answer', t: 'Ответь на вопрос', d: 'Устно или письменно', make: () => fishStep('answer') },
]

/** Подпись экрана на рельсе: само слово, если оно уже есть */
export function stepTitle(s: Step): string {
  if (s.kind === 'intro') return s.word?.trim() || KINDS.intro.t
  if (s.kind === 'choice') return s.opts?.[s.ans ?? 0]?.w?.trim() || KINDS.choice.t
  if (s.kind === 'order') return s.phrase?.trim() || KINDS.order.t
  if (s.kind === 'tip') return KINDS.tip.t
  if (s.kind === 'speak') return s.phrase?.trim() || KINDS.speak.t
  if (s.kind === 'gap') return gapParts(s.phrase).gap || KINDS.gap.t
  if (s.kind === 'answer') return s.text?.trim() || KINDS.answer.t
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
  if (s.kind === 'order') return phraseWords(s.phrase).length >= 2 ? '' : 'Нужна фраза хотя бы из 2 слов'
  if (s.kind === 'tip') return s.text?.trim() || s.opts?.length ? '' : 'Нет текста подсказки'
  if (s.kind === 'speak') return s.phrase?.trim() || s.video ? '' : 'Нет фразы и видео'
  if (s.kind === 'gap') {
    const g = gapParts(s.phrase).gap
    if (!g) return 'Отметьте пропуск: слово в [скобках]'
    if (s.opts?.length && !s.opts.some(o => sameAnswer(o.w, g))) return 'Среди вариантов нет верного'
    return ''
  }
  if (s.kind === 'answer') return s.text?.trim() ? '' : 'Нет вопроса'
  return (s.pairs?.filter(p => p.a.trim() && p.b.trim()).length ?? 0) >= 2 ? '' : 'Нужно хотя бы 2 пары'
}
/** Текст подсказки → кусочки: обычные и **жирные** */
export const tipParts = (t?: string) => (t ?? '').split(/\*\*(.+?)\*\*/g).map((x, i) => ({ x, b: i % 2 === 1 })).filter(p => p.x)
/** Фраза с пропуском: «And [you]?» → до, пропуск, после */
export function gapParts(p?: string) {
  const m = /^(.*?)\[([^\]]+)\](.*)$/s.exec(p ?? '')
  return m ? { a: m[1], gap: m[2].trim(), b: m[3] } : { a: p ?? '', gap: '', b: '' }
}
/** Ответ верный без учёта регистра, апострофов и знаков препинания */
const norm = (v?: string) => (v ?? '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()
export const sameAnswer = (a?: string, b?: string) => !!norm(b) && norm(a) === norm(b)
/** Слова фразы для «Собери фразу» (по пробелам; знаки препинания остаются при словах) */
export const phraseWords = (p?: string) => (p ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 12)

/** Карточка колоды → поля экрана */
export interface CardLike { id?: string; front: string; back: string; example?: string; exampleTr?: string; image?: string; audio?: string; exampleAudio?: string }
export const cardToIntro = (c: CardLike): Partial<Step> => ({ word: c.front, tr: c.back, ex: c.example ?? '', exTr: c.exampleTr ?? '', image: c.image || undefined, audio: c.audio || undefined, exAudio: c.exampleAudio || undefined })
export const cardToOpt = (c: CardLike): Opt => ({ w: c.front, t: c.back, ...(c.image ? { image: c.image } : {}), ...(c.audio ? { audio: c.audio } : {}) })
export const cardToPair = (c: CardLike): Pair => ({ a: c.front, b: c.back })

/** Все ссылки на файлы экрана (чтобы удалить из хранилища вместе с экраном) */
export const stepRefs = (s: Step): string[] => [s.image, s.audio, s.video, s.exAudio, ...(s.opts ?? []).flatMap(o => [o.image, o.audio])].filter(Boolean) as string[]

/** Перемешать (для вариантов и пар у ученика) */
export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

/** Копия шагов для сервера и коллег: файлы «только в этом браузере» не отправляем */
export function stepsOut(steps: Step[] | undefined): Step[] {
  const ok = (v?: string) => (v && !v.startsWith('idb:') && !v.startsWith('blob:') ? v : undefined)
  return (steps ?? []).map(s => JSON.parse(JSON.stringify({ ...s, image: ok(s.image), audio: ok(s.audio), video: ok(s.video), exAudio: ok(s.exAudio),
    ...(s.opts ? { opts: s.opts.map(o => ({ ...o, image: ok(o.image), audio: ok(o.audio) })) } : {}) })))
}

/** Пришли шаги с сервера / от коллеги: свои файлы, которые ещё только в браузере, не теряем */
export function keepLocalFiles(incoming: Step[] | undefined, local: Step[] | undefined): Step[] | undefined {
  if (!incoming || !local?.length) return incoming
  const mine = new Map(local.map(s => [s.id, s]))
  return incoming.map(s => {
    const m = mine.get(s.id); if (!m) return s
    const out = { ...s }
    for (const f of ['image', 'audio', 'video', 'exAudio'] as const) if (!out[f] && m[f]?.startsWith('idb:')) out[f] = m[f]
    return out
  })
}

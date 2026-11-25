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
//  • odd    — «Найди лишнее» (книжный, экспериментальный): плитки слов (opts, цвет k), одна лишняя — ans; пояснение — note.
//  • kp     — «Ответ по смыслу» (Karta Polaka, 19.11.2026): вопрос (text) и эталон (ideal); ученик надиктовывает ответ в поле, Gemini
//             сверяет по смыслу через мост с чатом (utils/ai.js, server/ai.ts) — процент, «Не прозвучало», короткий отзыв; от 60 % — верно.
//  • sort   — «Распредели по колонкам» (книжный, экспериментальный): 2–3 колонки (cols), фразы (items: w, c — колонка, k — цвет).
// «Аудиотест» — это «Выбери ответ» с фото вопроса (image) и звуком поверх, ответы текстом (шаблон в TEMPLATES).
// Файл в поле image / audio / video: https-ссылка (фото и озвучка карточек), ключ файла курса в S3 (t/…/c/…)
// или «idb:<id>» — файл пока только в этом браузере (без сервера или до загрузки), на сервер такой не уходит.

import { talkFields, talkCfg, type EndSens } from '../exercises/talk/defaults'
import { kpFields, kpShown } from '../exercises/kp/defaults'
import { mfClean, mfFields, mfTpl, MF_OPTS } from '../exercises/mf/data'
import { MF_TPL } from '../exercises/mf/tpl'

export type StepKind = 'intro' | 'choice' | 'pairs' | 'order' | 'tip' | 'speak' | 'gap' | 'answer' | 'sort' | 'odd' | 'kp' | 'talk' | 'stt' | 'mf'
export interface Opt { w: string; t?: string; image?: string; audio?: string; k?: string }
export interface SortItem { w: string; c: number; k?: string; a?: string; ex?: boolean }          // «Заполни таблицу» (tw): a — что вписать (bag → bags, варианты через /), ex — образец (зачёркнут в банке, вписан в таблицу)
export interface Pair { a: string; b: string }
export interface Step {
  id: string; kind: StepKind
  word?: string; tr?: string; ex?: string; exTr?: string            // «Новое слово»
  image?: string; audio?: string; video?: string; exAudio?: string   // свои файлы или из карточки (в «Выбери ответ» audio — свой звук вопроса; exAudio — озвучка примера)
  ask?: 'audio' | 'tr'; show?: 'pics' | 'text'; opts?: Opt[]; ans?: number   // «Выбери ответ»
  pairs?: Pair[]                                                     // «Пары»
  phrase?: string; note?: string; by?: 'letters'                     // by: 'letters' — «Собери слово»: по буквам, а не по словам
                                     // «Собери фразу»: фраза (слова через пробел), перевод — в tr, пояснение
  text?: string                                                      // «Подсказка»: текст правила; фразы с переводом и звуком — в opts; «Ответь на вопрос»: вопрос
  ideal?: string                                                     // «Ответ по смыслу»: эталон; оформление как в домашке: **жирный**, ==оранжевый термин==, _курсив_, «• » — пункт (чату уходит без разметки)
  star?: boolean; n?: number; autoplay?: boolean; engine?: 'api' | 'live'; model?: string                                         // «Ответ по смыслу»: красная звезда (знать обязательно) и номер вопроса, как в домашке
  look?: 'lines' | 'cards'; plain?: boolean                          // «Ответ по смыслу»: вид (нет — как PDF), эталон без выделений
  prompt?: string; pass?: number                                     // «Ответ по смыслу»: свой промпт для чата и порог зачёта, % (нет — общие, utils/ai.js)
  min?: number                                                       // сколько минут примерно уходит на экран (нет — по типу экрана, KIND_MIN)
  head?: string                                                      // своё задание вверху экрана вместо стандартного (конструктор упражнений)
  tn?: string; td?: string                                           // своё упражнение из конструктора: название и описание плитки (вместо шаблона)
  bk?: string; bn?: number; bs?: 'page'                                           // из какого задания учебника (BOOK) — группа «Тест · упражнения Насти»; bn — свой номер задания, как в книге
  lang?: 'pl-PL' | 'en-US' | 'en-GB' | 'es-ES'; voice?: string                // «Транскрипция»: язык (нет — польский); «Разговор с Gemini»: голос Live-модели (нет — Kore)
  pv?: number          // пресет типа (24.11.2026): настройки «talkexam-2» из курса поверх базовых — src/exercises/presets.ts
  ball?: boolean; ballLive?: boolean; ballV2?: boolean; ballFix?: boolean;          // ballV2 — «шар Live · новый вид» (25.11.2026, тест): вопрос и процент в окне шара, темы на весь экран
  keys?: { label: string; words: string[] }[]          // «Ответ по смыслу · шар» (24.11.2026, тест): шар смысловых блоков; keys — свои блоки (иначе Gemini нарежет эталон)
  dic?: 'file'                                                         // «Ответ по смыслу · целым аудио» (тест): диктовка целой записью, не потоком
  exam?: boolean                                                      // «Собеседование · рация» (24.11.2026): консул спрашивает вопрос экрана (text), сверяет с эталоном (ideal); шаблон talkexam
  busuu?: boolean                                                     // копия «Разговор · рация» для вкладки «Как в Busuu» (22.11.2026): свой шаблон talkptt2 и свои общие настройки курса
  vn?: boolean                                                        // «Рация · голосовые» (24.11.2026, тест): реплики ученика — голосовыми как в Telegram, без распознавания
  ptt?: boolean                                                       // «Разговор · рация» (тест): нажал — говоришь, нажал — Gemini отвечает
  avatar?: boolean                                                    // «Разговор с персонажем» (тест): над разговором — анимированный персонаж, рот по голосу Gemini
  lock?: string; opener?: string; silenceMs?: number; endSens?: EndSens; temperature?: number; noiseSuppression?: boolean   // «Разговор с Gemini»: замок языка, первая реплика, пауза до «договорил», чувствительность конца речи, температура, шумодав (нет — умолчания, exercises/talk/defaults.ts)
  format?: string; message?: string; thinking?: boolean; livePrompt?: string; liveAsk?: string; liveMore?: string; discussPrompt?: string; discussOpener?: string; liveTool?: string; liveModel?: string; discussNone?: string; sttPrompt?: string; sttAsk?: string   // (21.11.2026: + описание функции оценки, Live-модель, «ничего не упущено», промпт и просьба расшифровки «целым аудио») «Ответ по смыслу · Gemini API»: промпты и настройки моделей проверки (нет — умолчания, exercises/kp/defaults.ts)
  mode?: string; no?: string; who?: string; post?: string; two?: boolean; inl?: boolean; copy?: boolean; below?: boolean; hints?: string[]          // «Красный Мерфи» (25.11.2026) — exercises/mf/data.ts
  banks?: { t: string; w: string[]; x: string[] }[]
  cols?: { t: string }[]; items?: SortItem[]; mix?: boolean; hint?: boolean; tw?: boolean; rows?: number | any[]; cs?: boolean; noEx?: boolean   // tw — «Заполни таблицу» (Настя, 18.11.2026): rows — строк, cs — с учётом регистра, noEx — без образцов; «Распредели по колонкам» / «Найди лишнее»: mix: false — не перемешивать, hint: false — без подсказки
}

/** Задания курса, в которые можно собрать экраны */
export const INTERACTIVE = ['lesson', 'checkpoint', 'words', 'hw', 'test']
export const STEPS_MAX = 40, OPTS_MAX = 4, PAIRS_MAX = 6, ODD_MAX = 6, SORT_MAX = 30, TW_ROWS_MAX = 8, GAP_OPTS_MAX = 8, SORT_COLS_MAX = 5
/** Сколько места по вертикали занимает горизонтальный рельс урока с карточками экранов (редактор курса раздвигает рельс) */
export const RAIL_H = 420
/** На сколько вправо от кружка урока начинается ветка экранов (за плашкой главы с подписями уроков) */
export const RAIL_X0 = 400          // = правый край плашки главы (340) + тот же промежуток, что между экранами (60)

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
  sort: { t: 'Распредели по колонкам', d: 'Фразы разложить по 2–3 колонкам', c: 'var(--purple)', dk: 'var(--purple-d)', head: 'Распределите фразы по колонкам',
    ic: '<rect x="3.5" y="9" width="7.5" height="11" rx="1.8"/><rect x="13" y="9" width="7.5" height="11" rx="1.8"/><rect x="5" y="3.5" width="5" height="3" rx="1.2"/><rect x="13.5" y="3.5" width="6" height="3" rx="1.2"/>' },
  kp: { t: 'Ответ по смыслу', d: 'Ответ своими словами — ИИ сверяет с эталоном по смыслу', c: '#b07a33', dk: '#8a5a22', head: 'Ответьте устно на вопрос',
    ic: '<path d="M4 5h12v9H8l-4 3.5z"/><path d="M18.5 3.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/><path d="M7.5 9h5M7.5 11.5h3"/>' },
  talk: { t: 'Разговор с Gemini', d: 'Живой голосовой диалог с ИИ (Live API) — например, собеседование на Карту поляка', c: '#4b8df8', dk: '#2f6fe0', head: 'Поговорите с Gemini голосом',
    ic: '<path d="M4 6h10v7H8l-4 3z"/><path d="M14 10h6v7h-2l-3 2.5V17h-1z"/><path d="M18.5 2.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>' },
  stt: { t: 'Транскрипция', d: 'Сказать вслух — Gemini пишет текстом, что услышал (Live API)', c: '#2fa36b', dk: '#1f7a4f', head: 'Скажите — и посмотрите, что услышал Gemini',
    ic: '<rect x="4" y="3" width="5" height="9" rx="2.5"/><path d="M2.5 9.5a4 4 0 0 0 8 0M6.5 14v3"/><path d="M13 7h8M13 11h8M13 15h6M13 19h4"/>' },
  mf: { t: 'Красный Мерфи', d: 'Объяснение A, B, C, D и упражнения как в English Grammar in Use', c: '#c8232c', dk: '#9e1820', head: 'Write the answers.',
    ic: '<path d="M5 4h11l3 3v13H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>' },
  odd: { t: 'Найди лишнее', d: 'Слово, которое не подходит к остальным', c: 'var(--pink, #ec4899)', dk: 'var(--pink-d, #be185d)', head: 'Найдите лишнее слово',
    ic: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><circle cx="16.5" cy="16.5" r="3.5"/><path d="M15 15l3 3M18 15l-3 3"/>' },
}
/** Цвета плиток книжных экранов: ключ → фон / текст (как у Насти: персик, мята, лимон, роза, небо) */
// Цвет плитки — шестизначный код фона #rrggbb (19.11.2026; раньше — буквы o, g, y, p, b: старые экраны переводятся в коды сами).
// Пять готовых цветов — с подобранным цветом текста; любой другой код — текст тем же цветом, но тёмным
export const TILE: Record<string, { bg: string; fg: string }> = { o: { bg: '#fbe1c8', fg: '#7a4314' }, g: { bg: '#cfeccf', fg: '#1f5c33' }, y: { bg: '#fbedb0', fg: '#6b5200' }, p: { bg: '#f8d3e2', fg: '#7a1f45' }, b: { bg: '#cfe6f7', fg: '#14507a' } }
export const TILE_K = Object.values(TILE).map((t) => t.bg)          // готовые цвета — коды: '#fbe1c8', '#cfeccf', …
/** Цвет плитки: свой — или по кругу по номеру */
export const HEX = /^#[0-9a-f]{6}$/i
/** Код цвета: '#E8D5FF' → '#e8d5ff', старая буква 'o' → '#fbe1c8', остальное — undefined */
export const tileHex = (k: unknown) => (typeof k === 'string' ? (TILE[k] ? TILE[k].bg : HEX.test(k) ? k.toLowerCase() : undefined) : undefined)
export const tileK = (k: string | undefined, i: number) => tileHex(k) ?? TILE_K[i % TILE_K.length]
/** Фон и текст плитки: готовый цвет — с подобранным текстом; свой код — текст тем же цветом, но тёмным */
export function tileOf(k: string | undefined, i: number): { bg: string; fg: string } {
  const t = tileK(k, i), own = Object.values(TILE).find((x) => x.bg === t)
  if (own) return own
  const n = parseInt(t.slice(1), 16), dark = (v: number) => Math.round(v * 0.32).toString(16).padStart(2, '0')
  return { bg: t, fg: '#' + dark(n >> 16) + dark((n >> 8) & 255) + dark(n & 255) }
}
export const KIND_LIST = Object.keys(KINDS) as StepKind[]

/** Примерное время экрана по типу, в минутах (как «11 MIN» у урока в Busuu); репетитор может поставить своё */
export const KIND_MIN: Record<StepKind, number> = { intro: 0.5, choice: 0.5, pairs: 1, order: 1, tip: 1, speak: 1, gap: 0.5, answer: 1.5, sort: 1, odd: 0.5, kp: 2, talk: 5, stt: 2, mf: 3 }
export const MIN_CHOICES = [0.5, 1, 1.5, 2, 3, 5, 10]
export const stepMin = (s: Step) => (typeof s.min === 'number' && s.min > 0 ? s.min : KIND_MIN[s.kind] ?? 1)
/** Время урока — только сумма экранов (своё время ставят у экранов), округлённая вверх до минуты (пустой урок — 0) */
export const lessonMin = (steps?: Step[]) => { const m = (steps ?? []).reduce((a, s) => a + stepMin(s), 0); return m ? Math.max(1, Math.ceil(m - 1e-9)) : 0 }
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
  if (kind === 'kp') return { id: stepId(), kind, text: '', ideal: '' }
  if (kind === 'talk') return { id: stepId(), kind, text: '' }
  if (kind === 'stt') return { id: stepId(), kind, text: '' }
  if (kind === 'mf') return { id: stepId(), kind, rows: [{ q: '', a: '' }] } as any
  if (kind === 'odd') return { id: stepId(), kind, opts: [], ans: 0 }
  if (kind === 'sort') return { id: stepId(), kind, cols: [{ t: '' }, { t: '' }], items: [] }
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
  if (kind === 'kp') return { id: stepId(), kind, text: 'Kiedy i jak obchodzimy Mikołajki?',
    ideal: '==Mikołajki== obchodzimy **6 grudnia** na cześć świętego Mikołaja, biskupa z Miry, który czynił cuda.\nTego dnia dzieci otrzymują ==drobne prezenty==, które zazwyczaj są ukrywane pod poduszką, w butach lub specjalnych skarpetach – najczęściej są to słodycze, zabawki lub książki.' }          // «рыба» — с оформлением, как в домашке (20.11.2026)
  if (kind === 'talk') return { id: stepId(), kind, text: 'Собеседование на Карту поляка: консул задаёт вопросы — отвечайте по-польски' }
  if (kind === 'stt') return { id: stepId(), kind, text: 'Расскажите о себе по-польски: 3–4 предложения' }
  if (kind === 'mf') return mfMake('mf171')
  if (kind === 'odd') return { id: stepId(), kind, ans: 1, note: 'Coffee — напиток, остальное — еда.', opts: [{ w: 'egg', k: '#fbedb0' }, { w: 'coffee', k: '#cfe6f7' }, { w: 'apple', k: '#cfeccf' }, { w: 'banana', k: '#fbe1c8' }] }
  if (kind === 'sort') return { id: stepId(), kind, cols: [{ t: 'Active voice' }, { t: 'Passive voice' }], items: [
    { w: 'Mike eats an apple', c: 0, k: '#cfeccf' }, { w: 'An apple is eaten by Mike', c: 1, k: '#fbe1c8' }, { w: 'Mike buys apples', c: 0, k: '#fbe1c8' },
    { w: 'Apples are bought by Mike', c: 1, k: '#fbedb0' }, { w: 'My sister tidies the room', c: 0, k: '#f8d3e2' }, { w: 'The room is tidied by my sister', c: 1, k: '#cfe6f7' }] }
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
/** Собери слово: буквы вразброс, на слух */
/** Повтори слово: фото, звук — ученик записывает себя */
export const fishSayWord = (): Step => ({ id: stepId(), kind: 'speak', phrase: 'go ahead', tr: 'давай, вперёд', image: fish('go-ahead.jpg'), audio: fish('go-ahead.mp3') })
/** Переведи фразу: звук (по-русски или по-английски) — ученик пишет фразу целиком; вся фраза — один пропуск */
export const fishTranslate = (): Step => ({ id: stepId(), kind: 'gap', head: 'Переведите фразу', phrase: '[See you later!/See you later]', tr: 'Увидимся!', audio: fish('see-you-later.mp3'), opts: [] })
/** Раскрой скобки: глагол в скобках после пропуска — вписать в нужной форме (несколько верных — через /) */
export const fishBrackets = (): Step => ({ id: stepId(), kind: 'gap', head: 'Раскройте скобки', phrase: 'She [has lost/’s lost] (lose) her keys. She can’t open the door.', tr: 'Она потеряла ключи. Она не может открыть дверь.', opts: [] })
export const fishFill = (): Step => ({ id: stepId(), kind: 'gap', phrase: '[Hello]!', tr: 'Привет!', video: fish('hello.mp4'), opts: [{ w: 'Halo' }, { w: 'Hello' }] })

/** Шаблоны в меню редактора: тип экрана + готовая «рыба» (у одного типа может быть несколько видов) */
export const TEMPLATES: { id: string; kind: StepKind; t: string; d: string; make: () => Step }[] = [
  { id: 'intro', kind: 'intro', t: 'Новое слово', d: 'Фото, звук, слово и пример', make: () => fishStep('intro') },
  { id: 'choice', kind: 'choice', t: 'Выбери ответ', d: 'На слух — ответы картинками', make: () => fishStep('choice') },
  { id: 'audiotest', kind: 'choice', t: 'Аудиотест', d: 'Фото со звуком — ответы текстом', make: fishAudiotest },
  { id: 'pairs', kind: 'pairs', t: 'Пары', d: 'Слово ↔ перевод', make: () => fishStep('pairs') },
  { id: 'sayword', kind: 'speak', t: 'Повтори слово', d: 'Фото или видео, звук и запись голоса', make: fishSayWord },          // «Повтори за диктором» (видео) — сюда же (17.11.2026)
  { id: 'order', kind: 'order', t: 'Собери фразу', d: 'Слова по порядку на слух', make: () => fishStep('order') },
  { id: 'tip', kind: 'tip', t: 'Подсказка', d: 'Мини-правило и фразы', make: () => fishStep('tip') },
  { id: 'type', kind: 'gap', t: 'Закончи предложение', d: 'Вписать пропущенное слово', make: () => fishStep('gap') },
  { id: 'fill', kind: 'gap', t: 'Заполни пропуск', d: 'Видео — выбрать слово', make: fishFill },
  { id: 'translate', kind: 'gap', t: 'Переведи фразу', d: 'Звук — вписать всю фразу', make: fishTranslate },          // 18.11.2026: из «Как в учебнике» — в «Как в Busuu» (это макет Насти, не задание из книги)
  { id: 'answer', kind: 'answer', t: 'Ответь на вопрос', d: 'Устно или письменно', make: () => fishStep('answer') },
  // Karta Polaka (19.11.2026): своя вкладка меню; ответ проверяет Gemini по эталону
  { id: 'kp', kind: 'kp', t: 'Ответ по смыслу', d: 'ИИ сверяет с эталоном', make: () => fishStep('kp') },
  { id: 'kpfile', kind: 'kp', t: 'Ответ по смыслу · целым аудио', d: 'Запись целиком → Gemini · тест', make: () => ({ ...fishStep('kp'), dic: 'file' }) },          // 21.11.2026, тест: копия «Ответа по смыслу» (мост), диктовка — целой записью (utils/sttfile.js)
  { id: 'kpball', kind: 'kp', t: 'Ответ по смыслу · шар', d: 'Шар смысловых блоков · тест', make: () => ({ ...fishStep('kp'), ball: true }) },          // 24.11.2026, тест: utils/kpball.js, exercises/kp/KpBall.vue
  { id: 'kpballive', kind: 'kp', t: 'Ответ по смыслу · шар Live', d: 'Шар слушает сам через Live, без моста · тест', make: () => ({ ...fishStep('kp'), ball: true, ballLive: true }) },
  { id: 'kpballive2', kind: 'kp', t: 'Шар Live · новый вид', d: 'Вопрос и процент в окне шара, три темы · тест', make: () => ({ ...fishStep('kp'), ball: true, ballLive: true, ballV2: true }) },          // 25.11.2026, тест: макет «Шар Live — экран ответа»          // 24.11.2026, тест: utils/kpball.js (openBallLive), exercises/kp/KpBall.vue
  { id: 'kpballfix', kind: 'kp', t: 'Шар Live · разбор ошибок', d: 'Как новый вид + ошибки зачёркнуты, сверху — как правильно · тест', make: () => ({ ...fishStep('kp'), ball: true, ballLive: true, ballV2: true, ballFix: true }) },          // 25.11.2026, тест: cover присылает ещё fix (exercises/kp/defaults.ts BALL3)
  { id: 'kpapi', kind: 'kp', t: 'Ответ по смыслу · Gemini API', d: 'Без моста, напрямую · тест', make: () => ({ ...fishStep('kp'), engine: 'api' }) },          // 20.11.2026, эксперимент: utils/kpcheck.js
  { id: 'talk', kind: 'talk', t: 'Разговор с Gemini', d: 'Живой диалог голосом', make: () => fishStep('talk') },          // 20.11.2026, эксперимент: Live API
  { id: 'talkptt', kind: 'talk', t: 'Разговор · рация', d: 'Нажал — говоришь, нажал — ответ · тест', make: () => ({ ...fishStep('talk'), avatar: true, ptt: true }) },          // 21.11.2026, тест: Transcribe пишет, Live отвечает по кнопке
  { id: 'talkptt2', kind: 'talk', t: 'Разговор · рация (Busuu)', d: 'Нажал — говоришь, нажал — ответ · тест', make: () => ({ ...fishStep('talk'), avatar: true, ptt: true, busuu: true }) },          // 22.11.2026: копия «рации» для «Как в Busuu» — настройки курса у неё свои (не зависят от «рации» в Karta Polaka)
  { id: 'talkvn', kind: 'talk', t: 'Рация · голосовые', d: 'Реплики — голосовыми, как в Telegram · тест', make: () => ({ ...fishStep('talk'), avatar: true, ptt: true, vn: true }) },          // 24.11.2026, тест: Live слышит голос, в чат — голосовое (▶ переслушать), без расшифровки
  { id: 'talkexam', kind: 'talk', t: 'Собеседование · рация', d: 'Консул задаёт вопрос из домашки · тест', make: () => ({ ...fishStep('talk'), avatar: true, ptt: true, exam: true, text: 'Kiedy i jak obchodzimy Mikołajki?', ideal: (fishStep('kp') as any).ideal }) },          // 24.11.2026: рация на ОДИН вопрос Karta Polaka — вопрос и эталон у экрана, роль — шаблон курса (EXAM_PROMPT)
  { id: 'talkava', kind: 'talk', t: 'Разговор с персонажем', d: 'Говорит и шевелит губами · тест', make: () => ({ ...fishStep('talk'), avatar: true }) },          // 20.11.2026, тест: тот же разговор + анимированный персонаж (exercises/talk/TalkAvatar.vue)
  { id: 'es_talk', kind: 'talk', t: 'Разговор с Gemini', d: 'Живой диалог голосом, по-испански', make: () => ({ ...fishStep('talk'), lang: 'es-ES' }) },          // 24.11.2026: вкладка «Испанский» — язык зашит в тип (es-talk)
  { id: 'es_talkptt', kind: 'talk', t: 'Разговор · рация', d: 'Нажал — говоришь, нажал — ответ, по-испански', make: () => ({ ...fishStep('talk'), avatar: true, ptt: true, lang: 'es-ES' }) },
  { id: 'stt', kind: 'stt', t: 'Транскрипция', d: 'Сказать — увидеть текст', make: () => fishStep('stt') },          // 20.11.2026, эксперимент: Gemini 3.5 Transcribe Live
  // ---- Тест · упражнения Насти по учебнику (18.11.2026): отдельная группа меню, плашка — как задание в учебнике (BOOK) ----
  { id: 'bkword', kind: 'gap', t: 'Впиши слово', d: 'His, men, идиомы, do/does', make: () => ({ id: stepId(), kind: 'gap', bk: 'bkword', head: 'Write the possessive adjectives', phrase: '(He) [His] father is a doctor.', tr: 'Его отец — врач.', opts: [] }) },
  { id: 'brackets', kind: 'gap', t: 'Раскрой скобки', d: 'Глагол в нужной форме, общее фото', make: () => ({ id: stepId(), kind: 'gap', bk: 'brackets', head: 'Put the verbs into the present simple or the present continuous', image: fish('wave.jpg'), phrase: 'Tom: What [are you doing] (you/do), Tina?', tr: 'Том: Что ты делаешь, Тина?', opts: [] }) },          // диалог — по реплике на экран, фото одно: копия экрана (⧉) его сохраняет
  { id: 'bkpick', kind: 'gap', t: 'Выбери в пропуске', d: 'Подчеркни верное слово', make: () => ({ id: stepId(), kind: 'gap', bk: 'bkpick', head: 'Underline the correct word / phrase', phrase: 'Pat usually cooks dinner [in the evening].', tr: 'Пэт обычно готовит ужин вечером.', opts: [{ w: 'now' }, { w: 'in the evening' }] }) },
  { id: 'bkpic', kind: 'gap', t: 'Дополни по картинке', d: 'Фото и банк слов (до 8)', make: () => ({ id: stepId(), kind: 'gap', bk: 'bkpic', head: 'Complete the sentences', image: fish('wave.jpg'), phrase: 'She is [in] the room.', tr: 'Она в комнате.', opts: ['on', 'between', 'in', 'at', 'under', 'next to', 'behind', 'in front of'].map(w => ({ w })) }) },
  { id: 'bkqa', kind: 'gap', t: 'Ответь по картинке', d: 'Фото и короткий ответ', make: () => ({ id: stepId(), kind: 'gap', bk: 'bkqa', head: 'Answer the questions', image: fish('wave.jpg'), phrase: 'Is she a teacher? [Yes, she is./Yes, she is/Yes she is]', tr: 'Она учитель? Да.', opts: [] }) },
  { id: 'bkfree', kind: 'answer', t: 'Свободный ответ', d: 'Про себя, без автопроверки', make: () => ({ id: stepId(), kind: 'answer', bk: 'bkfree', head: 'Answer the questions about you', text: 'Do you like pizza?', note: 'Yes, I do. / No, I don’t.', tr: 'Yes, I do. I love pizza!' }) },
  { id: 'odd', kind: 'odd', t: 'Найди лишнее', d: 'Одно слово не подходит', make: () => ({ id: stepId(), kind: 'odd', bk: 'odd', head: 'Circle the uncountable noun', ans: 2, note: 'Sugar — неисчисляемое, остальное можно посчитать.', opts: [{ w: 'potato', k: '#fbe1c8' }, { w: 'biscuit', k: '#fbedb0' }, { w: 'sugar', k: '#cfe6f7' }, { w: 'cherry', k: '#f8d3e2' }] }) },
  // «Заполни таблицу» — как нарисовала Настя (18.11.2026): банк слов сверху (образцы зачёркнуты), ученик вписывает форму в нужную колонку
  { id: 'sort', kind: 'sort', t: 'Заполни таблицу', d: 'Распредели слова по колонкам', make: () => ({ id: stepId(), kind: 'sort', bk: 'sort', tw: true, head: 'Complete the table', cols: ['-s', '-es', '-ies', '-ves', 'other'].map(t => ({ t })), rows: 4,
    items: ([['bag', 'bags', 0, 1], ['child', 'children', 4, 1], ['boy', 'boys', 0], ['box', 'boxes', 1], ['baby', 'babies', 2], ['knife', 'knives', 3], ['man', 'men', 4], ['tomato', 'tomatoes', 1], ['leaf', 'leaves', 3],
      ['cherry', 'cherries', 2], ['owl', 'owls', 0], ['foot', 'feet', 4], ['wolf', 'wolves', 3], ['strawberry', 'strawberries', 2], ['watch', 'watches', 1]] as [string, string, number, number?][])
      .map(([w, a, c, ex]) => ({ w, a, c, ...(ex ? { ex: true } : {}) })) }) },
]
// «Красный Мерфи» (25.11.2026): своя вкладка меню — объяснение и упражнения (exercises/mf)
function mfMake(id: string): Step { const t = MF_TPL.find((x) => x.id === id)!; return { id: stepId(), kind: 'mf', ...JSON.parse(JSON.stringify(t.s)) } }
for (const t of MF_TPL) TEMPLATES.push({ id: t.id, kind: 'mf', t: t.t, d: t.d, make: () => mfMake(t.id) })
export const MF_IDS = MF_TPL.map((t) => t.id)
/** Задания учебника: номер в кружке и задание как в книге — на плашке меню и миниатюре (ExerciseMini); also — какие ещё задания закрывает */
export const BOOK: Record<string, { n: number; en: string; also?: string; pic?: boolean }> = {
  bkword: { n: 5, en: 'Write the possessive adjectives.', also: 'Write the plurals · Fill in the correct idiom · Write do, does and short answers' },
  brackets: { n: 3, en: 'Put the verbs into the present simple or the present continuous.', also: 'Диалог по картинке — по реплике на экран', pic: true },
  bkpick: { n: 6, en: 'Underline the correct word / phrase.', also: 'Write ’s or ’' },
  bkpic: { n: 4, en: 'Complete the sentences.', also: 'Write This, That, These or Those · предлоги по картинкам: on, between, in…', pic: true },
  bkqa: { n: 7, en: 'Answer the questions.', also: 'Is he a teacher? — Yes, he is.', pic: true },
  bkfree: { n: 12, en: 'Answer the questions about you.' },
  odd: { n: 2, en: 'Circle the uncountable noun in each group.' },
  sort: { n: 7, en: 'Complete the table. Listen and check.' },
}
/** Тест · упражнения Насти — отдельная группа меню */
export const BOOK_TPL = Object.keys(BOOK)
// «Учебник 1:1» (18.11.2026): те же 8 типов, но оформление точно как в книге — отдельная вкладка меню; у экрана bs: 'page'
export const PAGE_TPL = BOOK_TPL.map(id => 'pg_' + id)
for (const id of BOOK_TPL) {
  const b = TEMPLATES.find(x => x.id === id)!
  TEMPLATES.push({ ...b, id: 'pg_' + id, make: () => ({ ...b.make(), bs: 'page' }) })
}

// Навыки упражнений (для меню «Exercise» и тегов на ветке урока): Слух, Чтение, Письмо, Речь — по id шаблона
export const SKILL_T: Record<string, string> = { L: 'Слух', R: 'Чтение', W: 'Письмо', S: 'Речь' }
/** Цвета тегов — как плашки в меню упражнений (.chip.L … в CourseEditor / LessonRail) */
export const SKILL_C: Record<string, string> = { L: '#1cb0f6', R: '#a560e8', W: '#ff9600', S: '#58cc02' }
export const SKILLS: Record<string, string[]> = { choice: ['L'], audiotest: ['L'], pairs: ['R'], sayword: ['S'], fill: ['L'], type: ['W'], order: ['W'], answer: ['S', 'W'], kp: ['S'], kpfile: ['S'], kpball: ['S'], kpballive: ['S'], kpballive2: ['S'], kpballfix: ['S'], kpapi: ['S'], talk: ['S', 'L'], talkava: ['S', 'L'], talkptt: ['S', 'L'], talkptt2: ['S', 'L'], talkvn: ['S', 'L'], talkexam: ['S', 'L'], es_talk: ['S', 'L'], es_talkptt: ['S', 'L'], stt: ['S'], translate: ['W'], brackets: ['W'], sort: ['W'], odd: ['R'], bkword: ['W'], bkpick: ['R'], bkpic: ['R'], bkqa: ['W'], bkfree: ['W'] }
for (const id of BOOK_TPL) SKILLS['pg_' + id] = SKILLS[id]
for (const id of MF_IDS) SKILLS[id] = id === 'mfinfo' || id === 'mf314' ? ['R'] : ['W']          // «Учебник 1:1» — те же навыки
/** Какой это шаблон из меню «Exercise» (TEMPLATES) — по типу экрана и его настройкам: для миниатюры и тегов на ветке урока */
// Язык — в самом типе (24.11.2026), только у упражнений с ИИ: «pl-kp», «en-talkptt2», «es-talk». Язык берётся только из типа, менять его нельзя.
// Карта поляка (Ответ по смыслу, разговоры, транскрипция) — польский; рация Busuu — английский; es_… — испанский. Остальные (choice, pairs…) — без языка, как были.
// Внутри (экраны в курсах, пресеты в базе) — прежние ID без языка (kp, talkptt-1): старые курсы и JSON читаются как раньше.
export type TplLang = 'pl' | 'en' | 'es' | ''
const PL_TPL = new Set(['kp', 'kpfile', 'kpball', 'kpballive', 'kpballive2', 'kpballfix', 'kpapi', 'talk', 'talkava', 'talkptt', 'talkvn', 'talkexam', 'stt'])
export const tplLang = (id: string): TplLang => (id.startsWith('es_') ? 'es' : PL_TPL.has(id) ? 'pl' : id === 'talkptt2' ? 'en' : '')
/** ID шаблона → ID с языком: kp → pl-kp, es_talk → es-talk, talkptt2 → en-talkptt2; без ИИ — как есть (choice) */
export const typeId = (id: string) => (id.startsWith('es_') ? 'es-' + id.slice(3) : tplLang(id) ? tplLang(id) + '-' + id : id)
/** «pl-kp», «es-talkptt», старое «kp» → ID шаблона; язык не тот — null */
export function tplFromType(t: string): string | null {
  const m = /^(pl|en|es)-(.+)$/.exec(String(t))
  if (!m) return TEMPLATES.some((x) => x.id === t) ? t : null
  const id = m[1] === 'es' ? 'es_' + m[2] : m[2]
  return TEMPLATES.some((x) => x.id === id) && tplLang(id) === m[1] ? id : null
}
export function tplOf(s: Step): string {
  if (s.bk && BOOK[s.bk]) return (s.bs === 'page' ? 'pg_' : '') + s.bk          // экран из группы «Тест · упражнения Насти» / «Учебник 1:1»
  if (s.kind === 'choice') return s.show === 'text' ? 'audiotest' : 'choice'
  // «Собери слово» (по буквам) и «Повтори за диктором» убраны из меню как дубли (17.11.2026): старые такие экраны работают как раньше,
  // а в меню и на ветке — «Собери фразу» и «Повтори слово»
  if (s.kind === 'order') return 'order'
  if (s.kind === 'speak') return 'sayword'
  if (s.kind === 'kp' && s.ball && s.ballLive) return s.ballFix ? 'kpballfix' : s.ballV2 ? 'kpballive2' : 'kpballive'
  if (s.kind === 'kp' && s.ball) return 'kpball'
  if (s.kind === 'kp' && (s.engine === 'api' || s.engine === 'live')) return 'kpapi'
  if (s.kind === 'talk' && s.lang === 'es-ES') return s.ptt ? 'es_talkptt' : 'es_talk'          // испанский — свой тип (24.11.2026)
  if (s.kind === 'talk' && s.exam) return 'talkexam'
  if (s.kind === 'talk' && s.ptt) return s.vn ? 'talkvn' : s.busuu ? 'talkptt2' : 'talkptt'
  if (s.kind === 'talk' && s.avatar) return 'talkava'
  if (s.kind === 'kp' && s.dic === 'file') return 'kpfile'
  if (s.kind === 'mf') return mfTpl(s)
  if (s.kind === 'gap') return s.opts?.length ? 'fill' : isWhole(s.phrase) ? 'translate' : hasHint(s.phrase) ? 'brackets' : 'type'
  return s.kind
}
export const tplTitle = (s: Step) => s.tn || (TEMPLATES.find((t) => t.id === tplOf(s))?.t ?? KINDS[s.kind].t)
export const tplDesc = (s: Step) => s.td ?? (TEMPLATES.find((t) => t.id === tplOf(s))?.d ?? '')
/** Навыки экрана: по шаблону, а у своих упражнений из конструктора — ещё «Слух», если добавлены аудио или видео */
export function skillsOf(s: Step): string[] {
  const k = [...(SKILLS[tplOf(s)] ?? [])]
  if (s.tn && (s.audio || s.video) && !k.includes('L') && s.kind !== 'intro' && s.kind !== 'tip') k.unshift('L')
  return k
}
/** Подпись экрана на рельсе: само слово, если оно уже есть */
export function stepTitle(s: Step): string {
  if (s.kind === 'intro') return s.word?.trim() || KINDS.intro.t
  if (s.kind === 'choice') return s.opts?.[s.ans ?? 0]?.w?.trim() || KINDS.choice.t
  if (s.kind === 'order') return s.phrase?.trim() || KINDS.order.t
  if (s.kind === 'tip') return KINDS.tip.t
  if (s.kind === 'speak') return s.phrase?.trim() || KINDS.speak.t
  if (s.kind === 'gap') return gapParts(s.phrase).gap || KINDS.gap.t
  if (s.kind === 'answer') return s.text?.trim() || KINDS.answer.t
  if (s.kind === 'kp') return s.text?.trim() || KINDS.kp.t
  if (s.kind === 'talk') return KINDS.talk.t
  if (s.kind === 'stt') return s.text?.trim() || KINDS.stt.t
  if (s.kind === 'mf') return [s.no, (s.head ?? '').replace(/\*\*|==|!!|__/g, '')].filter(Boolean).join(' ').trim() || KINDS.mf.t
  if (s.kind === 'odd') return s.opts?.[s.ans ?? 0]?.w?.trim() || KINDS.odd.t
  if (s.kind === 'sort') return s.cols?.map(c => c.t).filter(Boolean).join(' / ') || KINDS.sort.t
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
    if (s.ask === 'audio' && !(s.audio || a.audio) && s.show !== 'text') return 'Нет звука для вопроса'          // текстом можно и без звука: «Circle the uncountable noun» — вопрос в заголовке
    if (s.ask === 'tr' && !a.t?.trim()) return 'Нет перевода у верного ответа'
    if (s.show === 'pics' && o.some(x => !x.image)) return 'Не у всех вариантов есть фото'
    return ''
  }
  if (s.kind === 'order') return orderParts(s).length >= 2 ? '' : s.by === 'letters' ? 'Нужно слово хотя бы из 2 букв' : 'Нужна фраза хотя бы из 2 слов'
  if (s.kind === 'tip') return s.text?.trim() || s.opts?.length ? '' : 'Нет текста подсказки'
  if (s.kind === 'speak') return s.phrase?.trim() || s.video ? '' : 'Нет фразы и видео'
  if (s.kind === 'gap') {
    const g = gapParts(s.phrase).gap
    if (!g) return 'Отметьте пропуск: слово в [скобках]'
    if (s.opts?.length && !s.opts.some(o => gapOk(o.w, g))) return 'Среди вариантов нет верного'
    if (gapList(s.phrase).filter(x => x.g != null).length > (s.opts?.length ? 1 : GAPS_MAX)) return s.opts?.length ? 'С вариантами — только один пропуск' : 'Не больше 2 пропусков'
    return ''
  }
  if (s.kind === 'answer') return s.text?.trim() ? '' : 'Нет вопроса'
  if (s.kind === 'kp') return !s.text?.trim() ? 'Нет вопроса' : !s.ideal?.trim() ? 'Нет эталона' : ''
  if (s.kind === 'talk' && s.exam) return !s.text?.trim() ? 'Нет вопроса' : !s.ideal?.trim() ? 'Нет эталона' : ''          // собеседование: без вопроса консулу нечего спросить
  if (s.kind === 'mf') return s.mode === 'info' ? ((s.opts?.length ?? 0) ? '' : 'Нет разделов') : !mfFields(s).length ? 'Нет строк для ответа' : mfFields(s).some((f) => !f.a.trim()) ? 'Не у всех строк есть ответ' : ''
  if (s.kind === 'talk' || s.kind === 'stt') return ''          // роль Gemini необязательна — по умолчанию консул на Карту поляка
  if (s.kind === 'odd') { const o = (s.opts ?? []).filter(x => x.w?.trim()); return o.length < 3 ? 'Нужно хотя бы 3 слова' : !s.opts?.[s.ans ?? 0]?.w?.trim() ? 'Не отмечено лишнее' : '' }
  if (s.kind === 'sort') {
    const c = s.cols ?? [], it = (s.items ?? []).filter(x => x.w?.trim())
    if (c.length < 2 || c.some(x => !x.t?.trim())) return 'Подпишите колонки'
    if (s.tw) { const f = (s.items ?? []).filter(x => x.a?.trim()); return f.some(x => !x.w?.trim()) ? 'У каждого ответа — слово для банка' : f.filter(x => !x.ex || s.noEx).length < 1 ? 'Нужен хотя бы один ответ' : '' }
    return it.length < 2 ? 'Нужно хотя бы 2 фразы' : ''
  }
  return (s.pairs?.filter(p => p.a.trim() && p.b.trim()).length ?? 0) >= 2 ? '' : 'Нужно хотя бы 2 пары'
}
/** «Повтори за диктором» голосом: какие слова фразы распознались (порядок не важен, повторы считаются), score — доля угаданных.
 *  Сокращения сравниваем как полные формы: «I'm» = «I am» (распознавание пишет и так, и так). */
const SR_FULL: Record<string, string> = { "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is', "what's": 'what is', "there's": 'there is',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', "cannot": 'can not', "won't": 'will not', "isn't": 'is not', "aren't": 'are not', "i'll": 'i will', "you'll": 'you will', "i've": 'i have', "let's": 'let us', "i'd": 'i would' }
const srWords = (s?: string) => (s ?? '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean).flatMap(w => (SR_FULL[w] ?? w.replace(/^'+|'+$/g, '')).split(' '))
export function speechMatch(phrase?: string, heard?: string) {
  const left = srWords(heard), words = (phrase ?? '').split(/\s+/).filter(Boolean).map(w => {
    const need = srWords(w), ok = need.length > 0 && need.every(x => { const k = left.indexOf(x); if (k < 0) return false; left.splice(k, 1); return true })
    return { w, ok }
  })
  const n = words.filter(x => srWords(x.w).length).length
  return { words, score: n ? words.filter(x => x.ok).length / n : 0 }
}
/** «Заполни таблицу»: колонки → образцы (вписаны заранее) и сколько клеток вписывать; строк — не меньше rows */
export function twLayout(s: Step) {
  const it = (s.items ?? []).filter(x => x.w?.trim() || x.a?.trim()), cols = (s.cols ?? []).map((_, ci) => {
    const all = it.filter(x => x.c === ci && x.a?.trim()), ex = s.noEx ? [] : all.filter(x => x.ex)
    return { ex, need: all.length - ex.length }
  })
  const rows = Math.max((s.rows as number) ?? 0, ...cols.map(c => c.ex.length + c.need), 1)
  return { cols, rows, bank: it.filter(x => x.w?.trim()) }
}
/** Проверка таблицы: в колонке порядок не важен — каждое вписанное слово ищем среди ещё не найденных ответов колонки (a: «leaves/leafs») */
export function twCheck(s: Step, typed: string[][]) {
  const n = (v?: string) => { const x = (v ?? '').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim(); return s.cs ? x : x.toLowerCase() }
  const miss: string[] = []
  const ok = (s.cols ?? []).map((_, ci) => {
    const left = (s.items ?? []).filter(x => x.c === ci && x.a?.trim() && (s.noEx || !x.ex)).map(x => ({ w: x.a!.split('/')[0].trim(), a: x.a!.split('/').map(n).filter(Boolean) }))
    const res = (typed[ci] ?? []).map(v => { if (!n(v)) return null; const k = left.findIndex(a => a.a.includes(n(v))); if (k < 0) return false; left.splice(k, 1); return true })
    miss.push(...left.map(a => a.w))
    return res
  })
  return { ok, miss, all: !miss.length && ok.every(c => c.every(v => v !== false)) }
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
// Упражнения по учебнику (17.11.2026): в пропуске можно несколько верных через «/» — [isn't/is not];
// пропусков в фразе — до двух (вписать); подсказка в скобках — просто текст фразы: «(He) [His] father is a doctor.»
export const GAPS_MAX = 2
/** Верные ответы пропуска: «isn't/is not» → ['isn't', 'is not'] */
export const gapAlts = (g?: string) => (g ?? '').split('/').map(x => x.trim()).filter(Boolean)
/** Ответ подходит к пропуску — к любому из вариантов через «/» */
export const gapOk = (a?: string, g?: string) => gapAlts(g).some(x => sameAnswer(a, x))
/** Фраза → кусочки: текст и пропуски по порядку. «Do[es] he [like] it?» → [{t:'Do'},{g:'es',i:0},{t:' he '},{g:'like',i:1},{t:' it?'}] */
export function gapList(p?: string): { t?: string; g?: string; i?: number }[] {
  const out: { t?: string; g?: string; i?: number }[] = []; let i = 0, last = 0
  for (const m of (p ?? '').matchAll(/\[([^\]]+)\]/g)) {
    if (m.index! > last) out.push({ t: p!.slice(last, m.index) })
    out.push({ g: m[1].trim(), i: i++ }); last = m.index! + m[0].length
  }
  if (last < (p ?? '').length) out.push({ t: p!.slice(last) })
  return out
}
/** После пропуска — подсказка в скобках: «[has lost] (lose)» → «Раскрой скобки» */
export const hasHint = (p?: string) => /\]\s*\([^)]+\)/.test(p ?? '')
/** Текст фразы → кусочки: обычный и (подсказка в скобках) — у ученика подсказка синяя */
export const hintParts = (t?: string) => (t ?? '').split(/(\([^)]+\))/g).filter(Boolean).map(x => ({ x, h: /^\(.*\)$/.test(x) }))
/** Вся фраза — один пропуск: «Переведи фразу» */
export const isWhole = (p?: string) => /^\s*\[[^\]]+\]\s*$/.test(p ?? '')
/** Фраза с первым верным ответом в каждом пропуске — для «Правильный ответ: …» */
export const gapFull = (p?: string) => gapList(p).map(x => x.t ?? gapAlts(x.g)[0]).join('')
/** Слова фразы для «Собери фразу» (по пробелам; знаки препинания остаются при словах) */
export const phraseWords = (p?: string) => (p ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 12)
/** Кусочки «Собери фразу / слово»: слова — или буквы (by: 'letters') */
export const orderParts = (s?: Partial<Step> | null) => (s?.by === 'letters' ? [...(s.phrase ?? '').replace(/\s+/g, '')].slice(0, 14) : phraseWords(s?.phrase))

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
    ...(s.opts ? { opts: s.opts.map(o => ({ ...o, image: ok(o.image), audio: ok(o.audio), k: tileHex(o.k) })) } : {}),
    ...(s.items ? { items: s.items.map(x => ({ ...x, k: tileHex(x.k) })) } : {}) })))          // цвет плитки — всегда кодом #rrggbb
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

// ---------- JSON экранов (17.11.2026): скопировать экран как JSON (образец для ИИ, обмен) и собрать экраны из JSON ----------
/** Экран → JSON для копирования: без id и без файлов «только в этом браузере» */
export function stepJson(s: Step): Omit<Step, 'id'> {
  const { id: _id, ...rest } = stepsOut([s])[0]
  // 23.11.2026: как на плитке — у «Ответа по смыслу» и «Разговора» все настройки упражнения с действующими значениями
  // (своё экрана ← курс ← умолчание): видно, что можно поменять. «Применить» оставит у экрана только то, что отличается от курса
  // (kpFields / talkFields) — не трогали, значит экран и дальше берёт общее из курса
  if (s.kind === 'kp') return { ...rest, ...kpShown(s) } as any
  if (s.kind === 'talk') { const { ptt: _p, avatar: _a, busuu: _b, vn: _v, exam: _e, ...c } = talkCfg(s) as any; return { ...rest, ...c } }
  return rest
}
/** Правка экрана его JSON-ом (кнопка «{ }» → «Править», 19.11.2026): экран s получает поля из текста, id остаётся.
 *  Файлы, ещё не загруженные на сервер (idb: / blob:), сохраняются, если в JSON то же значение. Ошибка — текст, иначе '' */
export function applyStepJson(s: Step, text: string): string {
  let raw: any = null
  try { raw = JSON.parse(text) } catch { return 'Не JSON — проверьте кавычки, запятые и скобки' }
  if (Array.isArray(raw)) return 'Здесь один экран — нужен один объект { … }, а не список [ … ]'
  if (!raw || typeof raw !== 'object') return 'Нужен объект { … }'
  if (!(raw.kind in KINDS)) return `Неизвестный kind${raw.kind ? ` «${raw.kind}»` : ''} — можно: ${Object.keys(KINDS).join(', ')}`
  // 21.11.2026: в JSON экрана — своё (вопрос, эталон, исключения). Нет поля — общее упражнения курса (плитка меню); "" — пусто, без подстановки
  if (raw.kind === 'kp' && !(raw.engine === 'api' || raw.engine === 'live') && raw.format !== undefined && !(typeof raw.format === 'string' && raw.format.includes('{id}')))
    return 'В format моста нужна метка {id} — по ней мост находит ответ в чате. Добавьте {id} (например: «Первое поле — id со значением {id}»)'
  const r = stepsFromJson(text)
  if (!r?.steps.length) return 'Экран не собрался — проверьте поля'
  const ns: any = r.steps[0], old: any = s
  for (const k of ['image', 'audio', 'video', 'exAudio']) if (typeof old[k] === 'string' && /^(idb|blob):/.test(old[k]) && raw[k] === old[k]) ns[k] = old[k]
  for (const k of Object.keys(old)) if (k !== 'id') delete old[k]
  Object.assign(old, { ...ns, id: s.id })
  return ''
}

const STR = ['head', 'word', 'tr', 'ex', 'exTr', 'image', 'audio', 'video', 'exAudio', 'phrase', 'note', 'text', 'ideal', 'prompt'] as const          // head — задание экрана («Write the possessive adjectives»; 19.11.2026: раньше терялось при вставке JSON)
const str = (v: unknown) => (typeof v === 'string' && v.trim() && !v.startsWith('idb:') && !v.startsWith('blob:') ? v : undefined)
/** Один экран из «сырого» объекта: тип должен быть известным, остальные поля — только знакомые и нужного вида (лишнее отбрасываем) */
/** Эталон из HTML домашки → разметка экрана: <b class="acc"> — ==оранжевый==, <b> — **жирный**, <i> — _курсив_, <p> — абзац, <li> — «• » */
export function kpFromHtml(h: string) {
  const un = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  return un(h
    .replace(/<b class="acc">([\s\S]*?)<\/b>/g, '==$1==')
    .replace(/<b class="[^"]*">([\s\S]*?)<\/b>/g, '**$1**')          // красное («nie odprawia się mszy», урок 6) и прочие цветные — жирным
    .replace(/<(b|strong)>([\s\S]*?)<\/\1>/g, '**$2**')
    .replace(/<(i|em)>([\s\S]*?)<\/\1>/g, (_, _t, x) => (/[\p{L}\d]/u.test(x) ? '_' + x + '_' : x))          // курсивные кавычки без букв — просто кавычки
    .replace(/<li>/g, '\n• ').replace(/<\/(p|li|ul)>|<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

// JSON «только данные» (24.11.2026, tools/make-json.py): { "type": "talkvn", "text": вопрос, "ideal": эталон } — тип упражнения по ID шаблона
// (TEMPLATES); kind и флаги (ptt, vn, exam, dic, engine, ball…) приложение берёт из шаблона. Промпты — тоже из шаблона, не из JSON
const TPL_FLAGS = ['kind', 'ptt', 'avatar', 'busuu', 'vn', 'exam', 'dic', 'engine', 'ball', 'ballLive', 'ballV2', 'ballFix', 'bk', 'bs', 'lang'] as const
function fromType(o: any): any {
  if (!o || typeof o !== 'object' || o.kind || typeof o.type !== 'string') return o
  const m = /^(.+?)-([1-9]\d?)$/.exec(o.type)          // «pl-talkexam-2» — тип talkexam, пресет 2 (24.11.2026); язык впереди — по желанию (старое «talkexam»)
  const id = tplFromType(o.type) ?? (m ? tplFromType(m[1]) : null)
  const t = id ? TEMPLATES.find((x) => x.id === id) : undefined; if (!t) return o
  const b: any = t.make(), f: any = {}
  for (const k of TPL_FLAGS) if (b[k] !== undefined) f[k] = b[k]
  if (m && !tplFromType(o.type) && t.id === tplFromType(m[1])) f.pv = +m[2]
  const { type: _t, ...rest } = o
  return { ...f, ...rest }
}
function stepFrom(o: any): Step | null {
  o = fromType(o)
  if (!o || typeof o !== 'object' || !(o.kind in KINDS)) return null
  const s: any = { id: stepId(), kind: o.kind }
  for (const k of STR) { const v = str(o[k]); if (v) s[k] = v }
  if (o.ask === 'audio' || o.ask === 'tr') s.ask = o.ask
  if (o.show === 'pics' || o.show === 'text') s.show = o.show
  if (o.by === 'letters') s.by = 'letters'
  if (Number.isInteger(o.ans) && o.ans >= 0) s.ans = o.ans
  if (typeof o.min === 'number' && o.min > 0 && o.min <= 60) s.min = o.min
  if ((o.kind === 'kp' || o.kind === 'talk') && Number.isInteger(o.pv) && o.pv > 0 && o.pv < 100) s.pv = o.pv          // пресет типа (24.11.2026)
  if ((o.kind === 'kp' || o.kind === 'talk') && o.star === true) s.star = true          // звезда и номер — у «Ответа по смыслу» и у всех разговоров (24.11.2026)
  if ((o.kind === 'kp' || o.kind === 'talk') && Number.isInteger(o.n) && o.n > 0 && o.n < 100) s.n = o.n
  if (o.kind === 'kp' && (o.look === 'lines' || o.look === 'cards')) s.look = o.look
  if (o.kind === 'kp' && o.plain === true) s.plain = true
  if (o.kind === 'kp' && o.autoplay === true) s.autoplay = true
  if (o.kind === 'kp') { delete s.prompt; Object.assign(s, kpFields(o)); if (o.dic === 'file') s.dic = 'file'; if (o.ball === true) s.ball = true; if (o.ballLive === true) s.ballLive = true; if (o.ballV2 === true) s.ballV2 = true; if (o.ballFix === true) s.ballFix = true; if (Array.isArray(o.keys)) s.keys = o.keys.filter((k: any) => k && typeof k.label === 'string').map((k: any) => ({ label: String(k.label).slice(0, 60), words: (Array.isArray(k.words) ? k.words : []).map(String).slice(0, 3) })).slice(0, 16) }          // промпт, порог, модель и промпты проверки — только отличия от умолчаний (exercises/kp/defaults.ts; модель раньше терялась при «Применить»)
  if (o.kind === 'talk') { delete s.prompt; Object.assign(s, talkFields(o)); if (o.avatar === true) s.avatar = true; if (o.ptt === true) s.ptt = true; if (o.busuu === true) s.busuu = true; if (o.vn === true) s.vn = true; if (o.exam === true) { s.exam = true; s.ptt = true } }          // только отличия от умолчаний (exercises/talk/defaults.ts)
  if (o.kind === 'kp' && (o.engine === 'api' || o.engine === 'live')) s.engine = 'api'          // 'live' («Live (голос)») убран 20.11.2026 — такие экраны идут как «Gemini API»
  if (Array.isArray(o.opts)) {
    const opts = o.opts.map((x: any) => (typeof x === 'string' ? { w: x } : x)).filter((x: any) => str(x?.w))
      .map((x: any) => ({ w: x.w.trim(), ...(tileHex(x.k) ? { k: tileHex(x.k) } : {}), ...(str(x.t) ? { t: x.t } : {}), ...(str(x.image) ? { image: x.image } : {}), ...(str(x.audio) ? { audio: x.audio } : {}) }))
    if (opts.length) s.opts = o.kind === 'tip' ? opts : opts.slice(0, o.kind === 'odd' ? ODD_MAX : o.kind === 'gap' ? GAP_OPTS_MAX : o.kind === 'mf' ? MF_OPTS : OPTS_MAX)
    if (s.ans != null && s.opts && s.ans >= s.opts.length) delete s.ans
  }
  if (o.kind === 'mf') { Object.assign(s, mfClean(o)) }          // «Красный Мерфи»: свои поля (exercises/mf/data.ts)
  if (o.mix === false) s.mix = false
  if (o.hint === false) s.hint = false
  if (Array.isArray(o.cols)) s.cols = o.cols.map((x: any) => ({ t: String(typeof x === 'string' ? x : x?.t ?? '').trim() })).slice(0, SORT_COLS_MAX)
  if (typeof o.bk === 'string' && BOOK[o.bk]) s.bk = o.bk
  if (Number.isInteger(o.bn) && o.bn > 0 && o.bn < 100) s.bn = o.bn
  if (o.bs === 'page') s.bs = 'page'
  if (o.tw === true) s.tw = true
  if (o.cs === true) s.cs = true
  if (o.noEx === true) s.noEx = true
  if (Number.isInteger(o.rows) && o.rows > 0) s.rows = Math.min(o.rows, TW_ROWS_MAX)
  if (Array.isArray(o.items)) s.items = o.items.filter((x: any) => str(x?.w)).map((x: any) => ({ w: x.w.trim(), c: Number.isInteger(x.c) && x.c >= 0 ? Math.min(x.c, (s.cols?.length ?? 2) - 1) : 0, ...(tileHex(x.k) ? { k: tileHex(x.k) } : {}), ...(str(x.a) ? { a: x.a.trim() } : {}), ...(x.ex === true ? { ex: true } : {}) })).slice(0, SORT_MAX)
  if (Array.isArray(o.pairs)) {
    const pairs = o.pairs.map((x: any) => (Array.isArray(x) ? { a: x[0], b: x[1] } : x)).filter((x: any) => str(x?.a) && str(x?.b)).map((x: any) => ({ a: x.a.trim(), b: x.b.trim() }))
    if (pairs.length) s.pairs = pairs.slice(0, PAIRS_MAX)
  }
  return s as Step
}
/** Текст (от ИИ или скопированный) → экраны. Понимает: один экран, массив экранов, { steps: [...] } (урок),
 *  и текст с JSON внутри (```json … ``` или пояснения вокруг). null — это не JSON экранов. bad — сколько пропущено (незнакомый тип). */
/** Все JSON-объекты верхнего уровня из текста — 19.11.2026: Gemini отдаёт экраны по одному, каждый в своём ```json и с «[cite: 1]» */
function jsonObjects(t: string) {
  const out: any[] = []
  for (let i = t.indexOf('{'); i >= 0; ) {
    let depth = 0, str = false, esc = false, end = -1
    for (let j = i; j < t.length; j++) {
      const c = t[j]
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue }
      if (c === '"') str = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { end = j; break }
    }
    if (end < 0) break
    try { out.push(JSON.parse(t.slice(i, end + 1))) } catch { /* не JSON — дальше */ }
    i = t.indexOf('{', end + 1)
  }
  return out
}

export function stepsFromJson(text: string): { steps: Step[]; bad: number } | null {
  if (!text || !/[[{]/.test(text)) return null
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  let v: any
  try { v = JSON.parse(t) } catch {
    const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'))      // вокруг JSON есть текст — берём от первой скобки до последней
    if (a < 0 || b <= a) return null
    try { v = JSON.parse(t.slice(a, b + 1)) } catch { v = jsonObjects(t); if (!v.length) return null }
  }
  // вопросы урока Karta Polaka (как присылает Gemini): { questions: [{ question, reference }] } → экраны «Ответ по смыслу»
  // промпт и порог из api_config / pass_threshold — каждому экрану (можно потом поправить в JSON экрана)
  // 19.11.2026: оформление из домашки — reference_html (оранжевые термины, жирный, курсив, списки) → разметка эталона; star — красная звезда, id — номер
  if (Array.isArray(v?.questions)) {
    // 20.11.2026: engine / model в корне (или у вопроса) — экраны сразу «· Gemini API» (tools/kp-json.py → json/gemini-live/: "engine": "api", "model": "live")
    const pr = str(v.api_config?.system_prompt), pass = v.pass_threshold, eng = v.engine, mdl = v.model
    v = v.questions.filter((q: any) => str(q?.question)).map((q: any) => {
      const ideal = str(q.reference_html) ? kpFromHtml(q.reference_html) : str(q.reference)
      const engine = q.engine ?? eng, model = q.model ?? mdl
      return { kind: 'kp', text: q.question, ...(ideal ? { ideal } : {}), ...(q.star === true ? { star: true } : {}), ...(Number.isInteger(q.id) ? { n: q.id } : {}), ...(pr ? { prompt: pr } : {}), ...(pass != null ? { pass } : {}), ...(engine != null ? { engine } : {}), ...(model != null ? { model } : {}) }
    })
  }
  const root = typeof v?.type === 'string' && Array.isArray(v?.steps) ? v.type : ''          // { "type": "kpball", "steps": [{ "text", "ideal" }] } — тип на все экраны
  const list0 = Array.isArray(v) ? v : Array.isArray(v?.steps) ? v.steps : v?.kind || v?.type ? [v] : null
  const list = list0?.map((o: any) => (root && o && typeof o === 'object' && !o.kind && !o.type ? { ...o, type: root } : o))
  if (!list?.length || !list.some((o: any) => o?.kind || o?.type)) return null
  const steps = list.map(stepFrom).filter(Boolean) as Step[]
  return { steps: steps.slice(0, STEPS_MAX), bad: list.length - steps.length }
}

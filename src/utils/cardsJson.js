// Карточки ⇄ JSON (20.11.2026): скопировать карточку или всю колоду текстом и добавить карточки, вставив JSON
// (например, ответ нейросети). Понимает массив, { cards: [...] }, один объект, несколько ```json-блоков и лишний текст вокруг.
// Поля: front (слово), back (перевод), example, exampleTr; файлы — image, audio, exampleAudio (ссылки).
// Синонимы ключей — как у нейросетей бывает: word / translation / sentence / example_translation …
export const CARD_KEYS = ['front', 'back', 'example', 'exampleTr', 'image', 'audio', 'exampleAudio']
const ALIAS = {
  front: ['front', 'word', 'term', 'phrase', 'слово', 'en', 'pl', 'english', 'polish'],
  back: ['back', 'translation', 'tr', 'meaning', 'перевод', 'ru', 'russian'],
  example: ['example', 'sentence', 'ex', 'пример'],
  exampleTr: ['exampleTr', 'example_tr', 'exampleTranslation', 'example_translation', 'sentenceTranslation', 'sentence_translation', 'exTr', 'перевод примера'],
  image: ['image', 'img', 'photo', 'picture'], audio: ['audio', 'sound'], exampleAudio: ['exampleAudio', 'example_audio'],
}
const pick = (o, k) => { for (const a of ALIAS[k]) { const v = o[a]; if (typeof v === 'string' && v.trim()) return v.trim() } return '' }

/** Карточка → объект для JSON (пустые поля не пишем; служебные — id, расписание, длительности — не нужны) */
export function cardJson(c) {
  const o = {}
  for (const k of CARD_KEYS) if (typeof c?.[k] === 'string' && c[k].trim()) o[k] = c[k]
  return o
}
/** Все объекты из текста: JSON целиком, иначе каждый ```-блок, иначе первый [...] / {...} */
function blobs(text) {
  const t = String(text ?? '').trim()
  const tryP = (x) => { try { return JSON.parse(x) } catch { return undefined } }
  const whole = tryP(t); if (whole !== undefined) return [whole]
  const fenced = [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => tryP(m[1].trim())).filter((x) => x !== undefined)
  if (fenced.length) return fenced
  const a = t.indexOf('['), b = t.lastIndexOf(']'); if (a >= 0 && b > a) { const x = tryP(t.slice(a, b + 1)); if (x !== undefined) return [x] }
  const c = t.indexOf('{'), d = t.lastIndexOf('}'); if (c >= 0 && d > c) { const x = tryP(t.slice(c, d + 1)); if (x !== undefined) return [x] }
  return []
}
const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === 'object' ? (Array.isArray(x.cards) ? x.cards.flatMap(flat) : Array.isArray(x.words) ? x.words.flatMap(flat) : [x]) : [])
/** Текст → карточки { front, back, … }; без слова или перевода — пропускаются. → { cards, skipped } ; не JSON — cards: null */
export function cardsFromJson(text) {
  const bs = blobs(text); if (!bs.length) return { cards: null, skipped: 0 }
  let skipped = 0
  const cards = bs.flatMap(flat).map((o) => {
    const c = {}
    for (const k of CARD_KEYS) { const v = pick(o, k); if (v) c[k] = v }
    if (!c.front || !c.back) { skipped++; return null }
    return c
  }).filter(Boolean)
  return { cards, skipped }
}
/** Карточки → TSV с заголовками (для окна импорта колоды — то же, что Excel/CSV: предпросмотр, «Отменить») */
const HEAD = { front: 'Слово', back: 'Перевод', example: 'Пример', exampleTr: 'Перевод примера', image: 'Фото', audio: 'Озвучка слова', exampleAudio: 'Озвучка примера' }
export function cardsToTsv(cards) {
  const ks = CARD_KEYS.filter((k) => cards.some((c) => c[k]))
  const cell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ')
  return [ks.map((k) => HEAD[k]).join('\t'), ...cards.map((c) => ks.map((k) => cell(c[k])).join('\t'))].join('\n')
}

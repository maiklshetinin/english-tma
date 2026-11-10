// Навыки и темы грамматики (вкладка Review «Грамматика и навыки», как «Твоя грамматика» в Busuu).
// Память считается так же, как у слов (FSRS, utils/review.ts): каждый проверенный ответ на экран — оценка «Хорошо» / «Снова»
// для его навыков и темы урока. Записи живут в том же словаре Review: ключ «skill:listening», «topic:present-perfect».
//  • Навыки — по типу экрана, сами (разметка не нужна): «Выбери ответ» на слух — слушание, переводом — лексика; «Пары» — лексика;
//    «Собери фразу» и «Заполни пропуск» — грамматика; «Собери слово» (по буквам) — письмо; «Повтори за диктором» — говорение
//    (не проверяется — только «встречалось»).
//  • Тема грамматики — у урока (поле в редакторе курса); не задана — угадываем по названию урока / Chapter («Present Perfect» → тема).
import type { Step } from './lesson'

export const SKILLS = {
  vocab: 'Лексика',
  grammar: 'Грамматика',
  listening: 'Слушание',
  writing: 'Письмо',
  speaking: 'Говорение',
} as const
export type SkillId = keyof typeof SKILLS

export interface Topic { id: string; t: string; lvl: string; re?: RegExp }
/** Темы грамматики A1–B2 (порядок — как обычно проходят); re — как узнать тему по названию урока */
export const TOPICS: Topic[] = [
  { lvl: 'A1', id: 'to-be', t: 'Глагол to be', re: /\bto be\b|\bam\s*\/\s*is\s*\/\s*are\b|глагол be/i },
  { lvl: 'A1', id: 'present-simple', t: 'Present Simple', re: /present simple/i },
  { lvl: 'A1', id: 'present-continuous', t: 'Present Continuous', re: /present continuous|present progressive/i },
  { lvl: 'A1', id: 'articles', t: 'Артикли a / an / the', re: /артикл|\barticles?\b|\ba\s*\/\s*an\b/i },
  { lvl: 'A1', id: 'plurals', t: 'Множественное число', re: /множественн|plurals?/i },
  { lvl: 'A1', id: 'there-is', t: 'There is / There are', re: /there (is|are)/i },
  { lvl: 'A1', id: 'can', t: 'Can / can’t', re: /\bcan\s*\/\s*can.?t\b/i },
  { lvl: 'A1', id: 'pronouns', t: 'Местоимения', re: /местоимени|pronouns?|possessive/i },
  { lvl: 'A1', id: 'prepositions-place', t: 'Предлоги места и времени', re: /предлог|prepositions?/i },
  { lvl: 'A2', id: 'past-simple', t: 'Past Simple', re: /past simple/i },
  { lvl: 'A2', id: 'irregular-verbs', t: 'Неправильные глаголы', re: /неправильн|irregular/i },
  { lvl: 'A2', id: 'going-to', t: 'Going to', re: /going to/i },
  { lvl: 'A2', id: 'future-will', t: 'Future Simple (will)', re: /future simple|\bwill\s*\/\s*won.?t\b/i },
  { lvl: 'A2', id: 'comparatives', t: 'Сравнительная степень', re: /сравнительн|превосходн|comparative|superlative/i },
  { lvl: 'A2', id: 'much-many', t: 'Much / many / a lot of', re: /much\s*\/\s*many|a lot of|countable|исчисляем/i },
  { lvl: 'A2', id: 'some-any', t: 'Some / any', re: /\bsome\s*\/\s*any\b/i },
  { lvl: 'A2', id: 'present-perfect', t: 'Present Perfect', re: /present perfect(?! continuous)/i },
  { lvl: 'B1', id: 'pp-vs-ps', t: 'Present Perfect vs Past Simple', re: /present perfect\s*(vs|или|и)\s*past simple/i },
  { lvl: 'B1', id: 'past-continuous', t: 'Past Continuous', re: /past continuous|past progressive/i },
  { lvl: 'B1', id: 'conditionals-01', t: 'Условные 0 и 1 типа', re: /zero conditional|first conditional|условн.*\b[01]\b/i },
  { lvl: 'B1', id: 'modals', t: 'Модальные: must, have to, should', re: /модальн|modal verbs?|must\s*\/\s*have to/i },
  { lvl: 'B1', id: 'passive', t: 'Страдательный залог', re: /passive|пассив|страдательн/i },
  { lvl: 'B1', id: 'gerund-infinitive', t: 'Герундий и инфинитив', re: /gerund|герунди|infinitive|инфинитив/i },
  { lvl: 'B1', id: 'pp-continuous', t: 'Present Perfect Continuous', re: /present perfect continuous/i },
  { lvl: 'B2', id: 'conditionals-23', t: 'Условные 2 и 3 типа', re: /second conditional|third conditional|mixed conditional|условн.*\b[23]\b/i },
  { lvl: 'B2', id: 'reported-speech', t: 'Косвенная речь', re: /reported speech|indirect speech|косвенн/i },
  { lvl: 'B2', id: 'past-perfect', t: 'Past Perfect', re: /past perfect/i },
  { lvl: 'B2', id: 'future-perfect', t: 'Future Continuous / Perfect', re: /future (continuous|perfect)/i },
  { lvl: 'B2', id: 'relative-clauses', t: 'Придаточные: who / which / that', re: /relative|придаточн/i },
]
export const topicById = (id?: string) => TOPICS.find(x => x.id === id)

/** Тема по названию урока / Chapter: самое длинное совпадение («Present Perfect Continuous» важнее «Present Perfect») */
export function detectTopic(...titles: (string | undefined)[]): Topic | undefined {
  for (const title of titles) {
    if (!title) continue
    const hit = TOPICS.filter(x => x.re?.test(title)).sort((a, b) => b.t.length - a.t.length)[0]
    if (hit) return hit
  }
  return undefined
}

/** Навыки экрана по его типу */
export function skillsOf(s: Step): SkillId[] {
  if (s.kind === 'choice') return [s.ask === 'tr' ? 'vocab' : 'listening']
  if (s.kind === 'pairs') return ['vocab']
  if (s.kind === 'order') return s.by === 'letters' ? ['writing'] : ['grammar']
  if (s.kind === 'gap') return ['grammar']
  if (s.kind === 'speak') return ['speaking']
  return []
}

export const skillKey = (id: string) => 'skill:' + id
export const topicKey = (id: string) => 'topic:' + id
export const isTagKey = (k: string) => k.startsWith('skill:') || k.startsWith('topic:')
export const isTag = (x: { kind?: string }) => x.kind === 'skill' || x.kind === 'topic'

/** Ответ на экран → оценки навыкам и теме (ok null — только «встречалось»; знакомство и подсказка тем не оцениваются) */
export function tagHits(s: Step, res: { ok?: boolean | null }, topic?: Topic) {
  const sk = skillsOf(s); if (!sk.length) return []
  const ok = s.kind === 'speak' ? null : res.ok ?? null
  const out: { key: string; kind: 'skill' | 'topic'; text: string; tr: string; ok: boolean | null }[] = sk.map(id => ({ key: skillKey(id), kind: 'skill', text: SKILLS[id], tr: '', ok }))
  if (topic && s.kind !== 'speak') out.push({ key: topicKey(topic.id), kind: 'topic' as const, text: topic.t, tr: topic.lvl, ok })
  return out
}

/** Словарь без навыков и тем — для «слов» (таблица Review, графики слов) */
export const isWord = (x: { kind?: string }) => !x.kind || x.kind === 'word' || x.kind === 'phrase'
export const wordsOnly = <T extends { kind?: string }>(items: Record<string, T>): Record<string, T> => { const o: Record<string, T> = {}; for (const k in items) if (isWord(items[k])) o[k] = items[k]; return o }
/** Экран урока в словаре Review (память упражнения — для «Повторения» Chapter): ключ «screen:курс:урок:экран» */
export const screenKey = (course: string, lesson: string, step: string) => `screen:${course}:${lesson}:${step}`
/** Только навыки и темы */
export const tagsOnly = <T extends { kind?: string }>(items: Record<string, T>): Record<string, T> => { const o: Record<string, T> = {}; for (const k in items) if (isTag(items[k])) o[k] = items[k]; return o }

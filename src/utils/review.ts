// Review (как в Busuu): слова и фразы, которые ученик встретил в уроках курса, и их «сила».
// Сила 0–100: новое — 20 (слабое), верно +15, ошибка −20, со временем тает (−5 в день после срока повторения).
// Уровни: < 40 — слабое, 40–74 — среднее, 75+ — сильное. Срок повторения: слабое — через день, среднее — через 4, сильное — через 14.
// Здесь только расчёт (без хранения) — чтобы было легко проверить тестами и подкрутить числа.
import { gapParts, orderParts, KINDS, type Step } from './lesson'

export const R = { NEW: 20, OK: 15, BAD: -20, DECAY: 5, WEAK: 40, STRONG: 75, DUE: { weak: 1, medium: 4, strong: 14 } }
const DAY = 86_400_000

export type RKind = 'word' | 'phrase'
export type RLevel = 'weak' | 'medium' | 'strong'
export interface RHist { t: number; ok: boolean | null; ex: string; lesson?: string }
export interface RItem {
  key: string; kind: RKind; text: string; tr: string; image?: string; audio?: string
  s: number; due: number; seen: number; ok: number; bad: number; hist: RHist[]
  course?: string; lesson?: string
}
/** Что проверял экран: слово / фраза + как ответили (true / false; null — только показали, без оценки) */
export interface RHit { text: string; tr?: string; image?: string; audio?: string; kind?: RKind; ok: boolean | null }

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

export const levelOf = (s: number): RLevel => (s < R.WEAK ? 'weak' : s < R.STRONG ? 'medium' : 'strong')
const dueAfter = (s: number, now: number) => now + R.DUE[levelOf(s)] * DAY
/** Сила сейчас — с учётом забывания: после срока повторения −5 в день */
export const strengthNow = (x: Pick<RItem, 's' | 'due'>, now = Date.now()) => Math.max(0, x.s - Math.max(0, Math.floor((now - x.due) / DAY)) * R.DECAY)

/** Записать ответы экрана в словарь (меняет items на месте). ctx — название упражнения, урока, курса */
export function applyHits(items: Record<string, RItem>, hits: RHit[], ctx: { ex: string; lesson?: string; course?: string }, now = Date.now()) {
  for (const h of hits) {
    const key = keyOf(h.text); if (!key) continue
    let x = items[key]
    if (!x) x = items[key] = { key, kind: h.kind ?? kindOf(h.text), text: h.text, tr: h.tr ?? '', image: h.image, audio: h.audio, s: R.NEW, due: dueAfter(R.NEW, now), seen: now, ok: 0, bad: 0, hist: [], course: ctx.course, lesson: ctx.lesson }
    if (!x.tr && h.tr) x.tr = h.tr
    if (!x.image && h.image) x.image = h.image
    if (!x.audio && h.audio) x.audio = h.audio
    if (h.ok !== null) {
      const cur = strengthNow(x, now)
      x.s = Math.max(0, Math.min(100, cur + (h.ok ? R.OK : R.BAD)))
      x.due = h.ok ? dueAfter(x.s, now) : now + DAY
      if (h.ok) x.ok++; else x.bad++
    }
    x.seen = now
    x.hist = [{ t: now, ok: h.ok, ex: ctx.ex, lesson: ctx.lesson }, ...x.hist].slice(0, 20)
  }
  return items
}
export const exName = (s: Step) => (s.kind === 'order' && s.by === 'letters' ? 'Собери слово' : KINDS[s.kind]?.t ?? s.kind)

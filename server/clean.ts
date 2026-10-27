// Проверка и очистка данных, которые присылает сайт: оставляем только известные поля нужных типов и размеров.
// Всё, что не подходит, — ошибка 400 с понятным текстом. Файл чистый (без Firebase), его легко тестировать.
import { fail } from './errors.js'
import { isMediaUrl } from './media.js'
import { NODE_TYPES } from './types.js'
import type { Card, DeckInput, NodeType, PathNode, PathUnit, PresetInput, SrsRateInput, SrsState } from './types.js'

export const LIMITS = { units: 60, nodes: 80, cards: 4000, assigned: 500, cardsTotal: 20000, deckBytes: 900_000 }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const YMD = /^\d{4}-\d{2}-\d{2}$/

export function str(v: unknown, what: string, max: number, required = false): string {
  if (v == null || v === '') { if (required) throw fail(400, `${what} required`); return '' }
  if (typeof v !== 'string') throw fail(400, `${what} must be text`)
  const s = v.trim()
  if (required && !s) throw fail(400, `${what} required`)
  if (s.length > max) throw fail(400, `${what} too long (max ${max})`)
  return s
}
export function id(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^[\w-]{1,40}$/.test(v)) throw fail(400, `bad ${what}`)
  return v
}
export function ymd(v: unknown, what: string): string {
  if (typeof v !== 'string' || !YMD.test(v) || Number.isNaN(Date.parse(v))) throw fail(400, `bad ${what}`)
  return v
}
const int = (v: unknown, what: string, min: number, max: number, fallback: number): number => {
  if (v == null) return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) throw fail(400, `bad ${what}`)
  return Math.min(max, Math.max(min, Math.round(n)))
}
const num = (v: unknown, what: string, min: number, max: number): number => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw fail(400, `bad ${what}`)
  return n
}

function cleanNode(x: unknown, seen: Set<string>): PathNode {
  if (!isObj(x)) throw fail(400, 'bad node')
  const nodeId = id(x.id, 'node id')
  if (seen.has(nodeId)) throw fail(400, 'duplicate node id')
  seen.add(nodeId)
  if (!NODE_TYPES.includes(x.type as NodeType)) throw fail(400, 'bad node type')
  const n: PathNode = { id: nodeId, type: x.type as NodeType, title: str(x.title, 'node title', 120, true), xp: int(x.xp, 'xp', 0, 1000, 0), done: x.done === true }
  const desc = str(x.desc, 'desc', 2000); if (desc) n.desc = desc
  if (x.date != null && x.date !== '') n.date = ymd(x.date, 'node date')
  if (x.time != null && x.time !== '') { if (typeof x.time !== 'string' || !/^\d{2}:\d{2}$/.test(x.time)) throw fail(400, 'bad node time'); n.time = x.time }
  if (x.deckId != null && x.deckId !== '') n.deckId = id(x.deckId, 'deck id')
  return n
}

/** Юниты пути (или пресета): список юнитов со списками кружков. */
export function cleanUnits(input: unknown): PathUnit[] {
  if (!Array.isArray(input)) throw fail(400, 'units must be a list')
  if (input.length > LIMITS.units) throw fail(400, `too many units (max ${LIMITS.units})`)
  const seen = new Set<string>(), unitIds = new Set<string>()
  return input.map((u) => {
    if (!isObj(u)) throw fail(400, 'bad unit')
    const uid = id(u.id, 'unit id')
    if (unitIds.has(uid)) throw fail(400, 'duplicate unit id')
    unitIds.add(uid)
    if (!Array.isArray(u.nodes)) throw fail(400, 'nodes must be a list')
    if (u.nodes.length > LIMITS.nodes) throw fail(400, `too many nodes (max ${LIMITS.nodes})`)
    return { id: uid, title: str(u.title, 'unit title', 120, true), sub: str(u.sub, 'unit subtitle', 160), nodes: u.nodes.map((n) => cleanNode(n, seen)) }
  })
}

export function cleanPreset(input: unknown): PresetInput {
  if (!isObj(input)) throw fail(400, 'bad preset')
  return { name: str(input.name, 'preset name', 80, true), units: cleanUnits(input.units) }
}

function cleanCard(x: unknown, seen: Set<string>): Card {
  if (!isObj(x)) throw fail(400, 'bad card')
  const cardId = id(x.id, 'card id')
  if (seen.has(cardId)) throw fail(400, 'duplicate card id')
  seen.add(cardId)
  const c: Card = { id: cardId, front: str(x.front, 'card word', 300, true), back: str(x.back, 'card translation', 300, true) }
  const example = str(x.example, 'card example', 600); if (example) c.example = example
  const exampleTr = str(x.exampleTr, 'card example translation', 600); if (exampleTr) c.exampleTr = exampleTr
  for (const k of ['image', 'audio'] as const) {
    const url = str(x[k], `card ${k}`, 400)
    if (url && !isMediaUrl(url)) throw fail(400, `card ${k}: must be an https link`)
    if (url) c[k] = url
  }
  if (x.suspended === true) c.suspended = true
  return c
}

export function cleanDeck(input: unknown): DeckInput {
  if (!isObj(input)) throw fail(400, 'bad deck')
  if (!Array.isArray(input.cards)) throw fail(400, 'cards must be a list')
  if (input.cards.length > LIMITS.cards) throw fail(400, `too many cards (max ${LIMITS.cards})`)
  const assigned = input.assigned ?? []
  if (!Array.isArray(assigned) || assigned.length > LIMITS.assigned) throw fail(400, 'bad assigned list')
  const src = isObj(input.source) ? input.source : {}
  const seen = new Set<string>()
  const deck: DeckInput = {
    title: str(input.title, 'deck title', 80, true),
    forAll: input.forAll === true,
    assigned: [...new Set(assigned.map((a) => id(a, 'student id')))],
    newPerDay: int(input.newPerDay, 'newPerDay', 0, 500, 20),
    source: { url: str(src.url, 'source url', 500), lastSync: typeof src.lastSync === 'string' && !Number.isNaN(Date.parse(src.lastSync)) ? src.lastSync : null },
    cards: input.cards.map((c) => cleanCard(c, seen)),
  }
  if (JSON.stringify(deck).length > LIMITS.deckBytes) throw fail(413, 'deck too large')
  return deck
}

export function cleanSrsState(x: unknown): SrsState {
  if (!isObj(x)) throw fail(400, 'bad srs state')
  return {
    ease: num(x.ease, 'ease', 1.3, 5), interval: Math.round(num(x.interval, 'interval', 0, 36500)), reps: Math.round(num(x.reps, 'reps', 0, 100000)), lapses: Math.round(num(x.lapses, 'lapses', 0, 100000)),
    first: ymd(x.first, 'first'), last: ymd(x.last, 'last'), due: ymd(x.due, 'due'),
    ...srsExtra(x),
  }
}
// Поля планировщика как в Anki (FSRS): все необязательные, у старых записей их нет
const PHASES = ['learning', 'review', 'relearning'] as const
function srsExtra(x: Record<string, unknown>): Partial<SrsState> {
  const o: Partial<SrsState> = {}
  if (x.phase != null) { if (!PHASES.includes(x.phase as any)) throw fail(400, 'bad phase'); o.phase = x.phase as SrsState['phase'] }
  if (x.step != null) o.step = Math.round(num(x.step, 'step', 0, 20))
  if (x.dueAt != null) o.dueAt = Math.round(num(x.dueAt, 'dueAt', 0, 1e13))
  if (x.lastAt != null) o.lastAt = Math.round(num(x.lastAt, 'lastAt', 0, 1e13))
  if (x.stab != null) o.stab = num(x.stab, 'stab', 0, 1e6)
  if (x.diff != null) o.diff = num(x.diff, 'diff', 1, 10)
  if (x.hist != null) {
    if (!Array.isArray(x.hist) || x.hist.length > 12) throw fail(400, 'bad hist')
    o.hist = x.hist.map((h) => {
      if (!Array.isArray(h) || h.length !== 3) throw fail(400, 'bad hist')
      return [Math.round(num(h[0], 'hist', 0, 1e13)), Math.round(num(h[1], 'hist', 0, 3)), Math.round(num(h[2], 'hist', -100000, 36500))] as [number, number, number]
    })
  }
  return o
}

export function cleanRate(input: unknown): SrsRateInput {
  if (!isObj(input)) throw fail(400, 'bad body')
  if (input.delta !== 1 && input.delta !== -1) throw fail(400, 'bad delta')
  return { cardId: id(input.cardId, 'card id'), state: input.state == null ? null : cleanSrsState(input.state), date: ymd(input.date, 'date'), delta: input.delta }
}

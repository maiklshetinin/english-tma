// Чистые функции над путём (юнитами и кружками): конструктор, прогресс, копирование для пресетов. Без состояния — состояние в stores/path.ts.
import type { NodeType, PathNode, PathUnit } from '../../server/types'
import { iso } from './dates'
import { newId } from './id'

/** Подписи типов кружков, которые можно добавлять вручную (урок с учителем — из расписания, его вручную не добавляют). */
export const NODE_TYPES: Record<string, string> = { hw: 'Домашнее задание', cards: 'Повторение слов', combo: 'Слова + ДЗ' }
const NODE_DEFAULTS: Record<string, [string, number]> = { hw: ['Новое ДЗ', 20], cards: ['Повторение слов', 15], combo: ['Слова + ДЗ', 30] }

export const flat = (units: PathUnit[]): PathNode[] => units.flatMap((u) => u.nodes)
export const currentIdOf = (units: PathUnit[]): string | undefined => flat(units).find((n) => !n.done)?.id
export const pctOf = (units: PathUnit[]): number => { const a = flat(units); return a.length ? Math.round(a.filter((n) => n.done).length / a.length * 100) : 0 }
export const unitOf = (units: PathUnit[]): string => !units.length ? 'Путь не создан' : units.find((u) => u.nodes.some((n) => !n.done))?.title ?? 'Курс завершён'

// --- Конструктор: меняют переданный массив на месте (его потом сохраняет автосохранение стора) ---
export function addNode(units: PathUnit[], ui: number, type: NodeType = 'hw', dated = true): void {      // dated=false — для пресетов (без дат)
  const [title, xp] = NODE_DEFAULTS[type] ?? NODE_DEFAULTS.hw
  const n: PathNode = { id: newId('n'), type, title, xp, done: false, desc: '' }
  if (dated) n.date = iso(1)
  units[ui].nodes.push(n)
}
export const moveNode = (units: PathUnit[], ui: number, i: number, dir: number): void => { const a = units[ui].nodes, j = i + dir; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]] }
export const removeNode = (units: PathUnit[], ui: number, i: number): PathNode[] => units[ui].nodes.splice(i, 1)
export const addUnit = (units: PathUnit[]): number => units.push({ id: newId('u'), title: 'Новый юнит', sub: '', nodes: [] })
export const moveUnit = (units: PathUnit[], ui: number, dir: number): void => { const j = ui + dir; if (j >= 0 && j < units.length) [units[ui], units[j]] = [units[j], units[ui]] }
export const removeUnit = (units: PathUnit[], ui: number): PathUnit => units.splice(ui, 1)[0]
export const sortAll = (units: PathUnit[]): void => units.forEach((u) => u.nodes.sort((a, b) => ((a.date ?? '') + (a.time || '')).localeCompare((b.date ?? '') + (b.time || ''))))

/** Глубокая копия юнитов с новыми id и снятыми отметками «выполнено» (для пресетов и «добавить пресет в путь»). */
export const clonePath = (units: PathUnit[]): PathUnit[] =>
  (JSON.parse(JSON.stringify(units)) as PathUnit[]).map((u) => ({ ...u, id: newId('u'), nodes: u.nodes.map((n) => ({ ...n, id: newId('n'), done: false })) }))

/** Пресет из пути: уроки (tutor) привязаны к расписанию — в пресет не попадают, даты и время убираются. */
export const presetUnits = (units: PathUnit[]): PathUnit[] =>
  clonePath(units).map((u) => ({ ...u, nodes: u.nodes.filter((n) => n.type !== 'tutor').map(({ date, time, ...n }) => n) }))

/** Датирует кружки новых юнитов через день, начиная после последнего уже датированного кружка пути (но не раньше завтрашнего дня). */
export function dateAfter(existing: PathUnit[], added: PathUnit[]): void {
  const last = flat(existing).map((n) => n.date).filter(Boolean).sort().pop()
  let off = last ? Math.round((new Date(last + 'T00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5) + 1 : 1
  off = Math.max(1, off)
  added.forEach((u) => u.nodes.forEach((n) => { n.date = iso(off); off += 2 }))
}

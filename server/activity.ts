// Учёт активности (19.11.2026) — для разработчика. Включается в «Профиле → Для разработчика → Учёт активности»
// отдельно для преподавателей и для учеников (по умолчанию выключен); смотреть — панель разработчика → «Активность».
// Считает само приложение (src/composables/useActivity.js): каждые 15 с — какая вкладка на экране и было ли за это время действие
// (мышь, нажатие, касание, клавиатура, прокрутка). «Открыто» — вкладка на экране, «Активен» — из этого времени с действиями.
// Шлёт раз в 5 минут и при сворачивании; здесь — один документ на человека в день: activity/<uid>_<день>
//   { uid, name, role (teacher | student | dev), day, visits, open, act, first, last, tabs: { <вкладка>: { open, act } }, spans: [{ tab, a, b, act }] }
// open / act — секунды; spans — лента: кусок времени на одной вкладке (a, b — мс), соседние куски одной вкладки склеиваются.
// Запись — транзакция (1 чтение + 1 запись) раз в 5 минут на активного человека: на лимитах Spark это незаметно.
import type { Firestore } from 'firebase-admin/firestore'
import { fail } from './errors.js'

export interface ActSettings { teachers: boolean; students: boolean }
export interface Span { tab: string; a: number; b: number; act: number }
export interface Tabs { [tab: string]: { open: number; act: number } }
export interface Chunk { day: string; visits: number; tabs: Tabs; spans: Span[] }
export interface DayDoc { uid: string; name: string; role: string; day: string; visits: number; open: number; act: number; first: number; last: number; tabs: Tabs; spans: Span[] }

const DAY = /^\d{4}-\d{2}-\d{2}$/, TAB = /^[a-z][a-z-]{0,23}$/
export const MAX_SPANS = 500          // за день на человека — с запасом (документ остаётся маленьким)
const GLUE = 45_000                   // соседние куски одной вкладки с разрывом до 45 с — один кусок
const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0)

/** Проверить кусок от приложения: всё лишнее и странное — выбросить. null — если это вообще не кусок. */
export function clean(body: unknown, now = Date.now()): Chunk | null {
  const b = body as Partial<Record<keyof Chunk, unknown>> | null
  if (!b || typeof b !== 'object' || typeof b.day !== 'string' || !DAY.test(b.day)) return null
  const tabs: Tabs = {}
  for (const [k, v] of Object.entries((b.tabs && typeof b.tabs === 'object' ? b.tabs : {}) as Record<string, { open?: unknown; act?: unknown }>).slice(0, 30)) {
    if (!TAB.test(k) || !v || typeof v !== 'object') continue
    const open = num(v.open, 6 * 3600), act = Math.min(open, num(v.act, 6 * 3600))
    if (open) tabs[k] = { open, act }
  }
  const spans: Span[] = []
  for (const s of (Array.isArray(b.spans) ? b.spans : []).slice(0, 120) as Partial<Span>[]) {
    if (!s || typeof s !== 'object' || typeof s.tab !== 'string' || !TAB.test(s.tab)) continue
    const a = num(s.a, 9e15), e = num(s.b, 9e15)
    if (!(e > a) || e - a > 6 * 3600_000 || a < now - 3 * 86400_000 || e > now + 3600_000) continue
    spans.push({ tab: s.tab, a, b: e, act: Math.min(num(s.act, 6 * 3600), Math.ceil((e - a) / 1000)) })
  }
  const visits = num(b.visits, 50)
  if (!visits && !Object.keys(tabs).length && !spans.length) return null
  return { day: b.day, visits, tabs, spans }
}

/** Добавить кусок к дню: сложить счётчики, ленту — по времени, склеить соседние куски одной вкладки */
export function merge(prev: DayDoc | undefined, c: Chunk, who: { uid: string; name: string; role: string }): DayDoc {
  const d: DayDoc = prev ? structuredClone(prev) : { ...who, day: c.day, visits: 0, open: 0, act: 0, first: 0, last: 0, tabs: {}, spans: [] }
  d.name = who.name || d.name; d.role = who.role || d.role
  d.visits += c.visits
  for (const [k, v] of Object.entries(c.tabs)) {
    const t = d.tabs[k] ?? { open: 0, act: 0 }
    t.open += v.open; t.act += v.act; d.tabs[k] = t
    d.open += v.open; d.act += v.act
  }
  const all = [...d.spans, ...c.spans].sort((x, y) => x.a - y.a), out: Span[] = []
  for (const s of all) {
    const p = out.at(-1)
    if (p && p.tab === s.tab && s.a - p.b <= GLUE) { p.b = Math.max(p.b, s.b); p.act += s.act } else out.push({ ...s })
  }
  d.spans = out.slice(-MAX_SPANS)
  if (d.spans.length) { d.first = d.first ? Math.min(d.first, d.spans[0].a) : d.spans[0].a; d.last = Math.max(d.last, d.spans.at(-1)!.b) }
  return d
}

export function makeActivity({ db }: { db: Firestore }) {
  const settings: ActSettings = { teachers: false, students: false }
  const setDoc = () => db.collection('settings').doc('activity')
  const col = () => db.collection('activity')
  const on = (role: unknown) => (role === 'teacher' ? settings.teachers : role === 'student' ? settings.students : false)
  return {
    settings,
    /** Прочитать выключатели при запуске сервера */
    async load() { const d = await setDoc().get(); settings.teachers = d.get('teachers') === true; settings.students = d.get('students') === true },
    on,
    async set(s: Partial<ActSettings>) {
      if (typeof s.teachers === 'boolean') settings.teachers = s.teachers
      if (typeof s.students === 'boolean') settings.students = s.students
      await setDoc().set({ ...settings }, { merge: true })
      return { ...settings }
    },
    /** Кусок от приложения. Учёт для этой роли выключен — ничего не пишем, приложение остановит учёт. */
    async record(user: { uid: string; role?: unknown; dev?: unknown; tgName?: unknown; name?: unknown }, body: unknown): Promise<{ on: boolean }> {
      if (!on(user.role)) return { on: false }
      const c = clean(body)
      if (!c) throw fail(400, 'bad chunk')
      const ref = col().doc(`${user.uid}_${c.day}`)
      const who = { uid: user.uid, name: String(user.tgName || user.name || ''), role: user.dev === true ? 'dev' : String(user.role) }      // разработчик — отдельной подписью (по правам он преподаватель)
      await db.runTransaction(async (tx) => {
        const s = await tx.get(ref)
        tx.set(ref, merge(s.exists ? (s.data() as DayDoc) : undefined, c, who))
      })
      return { on: true }
    },
    /** Дни с from по to включительно (YYYY-MM-DD) — все люди */
    async range(from: string, to: string): Promise<DayDoc[]> {
      if (!DAY.test(from) || !DAY.test(to) || from > to) throw fail(400, 'from / to: YYYY-MM-DD')
      const q = await col().where('day', '>=', from).where('day', '<=', to).get()
      return q.docs.map((d) => d.data() as DayDoc)
    },
  }
}

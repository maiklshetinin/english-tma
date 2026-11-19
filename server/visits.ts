// Лог заходов (19.11.2026) — пишется ВСЕГДА, независимо от выключателя «Учёт активности»: кто, когда и с чего открыл приложение.
// Приложение шлёт отметку при запуске и при возвращении после 30+ минут в фоне (src/composables/useVisits.js).
// Один документ на человека в день: visits/<uid>_<день> { uid, name, photo, role, day, n, list: [{ t, dev, app, pf }] }
//   dev — phone | desktop, app — tg (Telegram) | web (сайт в браузере), pf — платформа Telegram (ios, android, tdesktop, macos, weba…).
// Запись — транзакция (1 чтение + 1 запись) на заход: на лимитах Spark незаметно. Очистка — разработчиком (clean).
import type { Firestore } from 'firebase-admin/firestore'
import { fail } from './errors.js'

export interface Visit { t: number; dev: 'phone' | 'desktop'; app: 'tg' | 'web'; pf: string }
export interface VisitDay { uid: string; name: string; photo?: string; role: string; day: string; n: number; list: Visit[] }
const DAY = /^\d{4}-\d{2}-\d{2}$/
export const MAX_LIST = 300

/** Проверить отметку от приложения */
export function cleanVisit(b: unknown, now = Date.now()): { day: string; v: Visit } | null {
  const x = b as Record<string, unknown> | null
  if (!x || typeof x !== 'object' || typeof x.day !== 'string' || !DAY.test(x.day)) return null
  const dev = x.dev === 'phone' ? 'phone' : 'desktop', app = x.app === 'tg' ? 'tg' : 'web'
  const pf = typeof x.pf === 'string' ? x.pf.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) : ''
  return { day: x.day, v: { t: now, dev, app, pf } }
}

export function addVisit(prev: VisitDay | undefined, day: string, v: Visit, who: { uid: string; name: string; role: string; photo?: string }): VisitDay {
  const d: VisitDay = prev ? structuredClone(prev) : { ...who, day, n: 0, list: [] }
  d.name = who.name || d.name; d.role = who.role || d.role; if (who.photo) d.photo = who.photo
  d.n += 1
  d.list = [...d.list, v].slice(-MAX_LIST)
  return d
}

export function makeVisits({ db }: { db: Firestore }) {
  const col = (c: string) => db.collection(c)
  return {
    async record(user: { uid: string; role?: unknown; dev?: unknown; tgName?: unknown; tgPhoto?: unknown }, body: unknown) {
      const c = cleanVisit(body)
      if (!c) throw fail(400, 'bad visit')
      const ref = col('visits').doc(`${user.uid}_${c.day}`)
      const who = { uid: user.uid, name: String(user.tgName || ''), photo: String(user.tgPhoto || ''), role: user.dev === true ? 'dev' : String(user.role ?? '') }
      await db.runTransaction(async (tx) => {
        const s = await tx.get(ref)
        tx.set(ref, addVisit(s.exists ? (s.data() as VisitDay) : undefined, c.day, c.v, who))
      })
      return { ok: true }
    },
    async range(from: string, to: string): Promise<VisitDay[]> {
      if (!DAY.test(from) || !DAY.test(to) || from > to) throw fail(400, 'from / to: YYYY-MM-DD')
      const q = await col('visits').where('day', '>=', from).where('day', '<=', to).get()
      return q.docs.map((d) => d.data() as VisitDay)
    },
    /** Очистка логов: what — visits | activity; before — удалить дни раньше этой даты (YYYY-MM-DD), без неё — всё. → сколько документов удалено */
    async clean(what: string, before?: string): Promise<number> {
      if (what !== 'visits' && what !== 'activity') throw fail(400, 'what: visits | activity')
      if (before !== undefined && !DAY.test(before)) throw fail(400, 'before: YYYY-MM-DD')
      const q = before ? await col(what).where('day', '<=', prevDay(before)).get() : await col(what).get()
      for (let i = 0; i < q.docs.length; i += 400) {
        const b = db.batch()
        for (const d of q.docs.slice(i, i + 400)) b.delete(d.ref)
        await b.commit()
      }
      return q.docs.length
    },
  }
}
const prevDay = (day: string) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }

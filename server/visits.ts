// Лог заходов (19.11.2026) — пишется ВСЕГДА, независимо от выключателя «Учёт активности»: кто, когда и с чего открыл приложение.
// Приложение шлёт отметку при запуске и при возвращении после 30+ минут в фоне (src/composables/useVisits.js).
// Один документ на человека в день: visits/<uid>_<день> { uid, name, photo, role, day, n, list: [{ t, dev, app, pf, ver? }] }
// Версия сайта (коммит сборки) ещё и в записи человека: users/<uid> { ver, verAt } — «Версии в приложении» видят её и без сети (19.11.2026).
//   dev — phone | desktop, app — tg (Telegram) | web (сайт в браузере), pf — платформа Telegram (ios, android, tdesktop, macos, weba…).
// Запись — ОДНА запись на заход, без чтения (19.11.2026): set с merge, счётчик — FieldValue.increment, список — arrayUnion. Очистка — разработчиком (clean).
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import { fail } from './errors.js'

export interface Visit { t: number; dev: 'phone' | 'desktop'; app: 'tg' | 'web'; pf: string; ver?: string }
export interface VisitDay { uid: string; name: string; photo?: string; role: string; day: string; n: number; list: Visit[] }
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Проверить отметку от приложения */
export function cleanVisit(b: unknown, now = Date.now()): { day: string; v: Visit } | null {
  const x = b as Record<string, unknown> | null
  if (!x || typeof x !== 'object' || typeof x.day !== 'string' || !DAY.test(x.day)) return null
  const dev = x.dev === 'phone' ? 'phone' : 'desktop', app = x.app === 'tg' ? 'tg' : 'web'
  const pf = typeof x.pf === 'string' ? x.pf.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) : ''
  const ver = typeof x.ver === 'string' && /^[0-9a-z._-]{1,40}$/i.test(x.ver) ? x.ver : ''          // коммит сборки сайта (или dev)
  return { day: x.day, v: { t: now, dev, app, pf, ...(ver ? { ver } : {}) } }
}

export function makeVisits({ db, FieldValue }: { db: Firestore; FieldValue: typeof FV }) {
  const col = (c: string) => db.collection(c)
  return {
    async record(user: { uid: string; role?: unknown; dev?: unknown; tgName?: unknown; tgPhoto?: unknown }, body: unknown) {
      const c = cleanVisit(body)
      if (!c) throw fail(400, 'bad visit')
      const ref = col('visits').doc(`${user.uid}_${c.day}`)
      const who = { uid: user.uid, name: String(user.tgName || ''), role: user.dev === true ? 'dev' : String(user.role ?? ''), ...(user.tgPhoto ? { photo: String(user.tgPhoto) } : {}) }
      await ref.set({ ...who, day: c.day, n: FieldValue.increment(1), list: FieldValue.arrayUnion(c.v) }, { merge: true })          // без чтения
      if (c.v.ver) await col('users').doc(user.uid).set({ ver: c.v.ver, verAt: c.v.t }, { merge: true })          // какая версия сейчас у человека — в его записи (тоже без чтения)
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

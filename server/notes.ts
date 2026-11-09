// Заметки на общем экране — мини-чат преподавателей: заметка приклеена к месту на странице (как комментарий в Figma),
// под ней — ответы и реакции. Всё мгновенно идёт через WebSocket /live (live.ts), а здесь — хранение:
// заметки держим в памяти (их немного) и сразу записываем в Firestore (коллекция notes), чтобы пережили перезапуск сервера.
// Привязка к месту — как у общих курсоров: путь страницы (path), путь к элементу внутри неё (sel) и место в элементе (rx, ry);
// x, y — запасные координаты страницы, если элемента у человека нет.
import type { Firestore } from 'firebase-admin/firestore'

export interface NoteAuthor { uid: string; name: string; photo: string; color: string }
export interface NoteMsg extends NoteAuthor { id: string; text: string; at: number; react: Record<string, string[]> }      // react: реакция → uid тех, кто поставил
// seen: uid → когда человек последний раз прочитал заметку (закрыл всплывающее уведомление или открыл её) — для «Прочитано»
export interface Note { id: string; path: string; where: string; sel: string; rx: number; ry: number; x: number; y: number; at: number; done: boolean; by: string; msgs: NoteMsg[]; seen: Record<string, number> }

export const NOTE_TEXT = 1000, NOTE_MSGS = 200, NOTES_MAX = 300
export const REACTIONS = ['👍', '❤️', '😂', '🔥', '✅', '👀'] as const
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const frac = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(-1, Math.min(2, v)) * 1000) / 1000 : 0)
const px = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(1e6, v))) : 0)
const text = (v: unknown) => str(v, NOTE_TEXT).trim()

export function makeNotes({ db, now = () => Date.now() }: { db?: Firestore; now?: () => number } = {}) {
  const notes = new Map<string, Note>()
  let seq = 0
  const id = (p: string) => `${p}${now().toString(36)}${(++seq).toString(36)}`
  const save = (n: Note) => { db?.collection('notes').doc(n.id).set(n).catch((e) => console.error('notes: не сохранилось', e)) }
  const msg = (u: NoteAuthor, t: string): NoteMsg => ({ id: id('m'), uid: u.uid, name: u.name, photo: u.photo, color: u.color, text: t, at: now(), react: {} })

  return {
    /** Загрузить из Firestore при старте сервера */
    async load() {
      if (!db) return
      const s = await db.collection('notes').orderBy('at', 'desc').limit(NOTES_MAX).get()
      for (const d of s.docs) notes.set(d.id, d.data() as Note)
    },
    /** Все заметки, новые сверху */
    all: (): Note[] => [...notes.values()].sort((a, b) => b.at - a.at),
    get: (nid: string) => notes.get(nid) ?? null,
    /** Новая заметка: место на странице + первое сообщение. null — пустой текст или мусор */
    create(u: NoteAuthor, m: Record<string, unknown>): Note | null {
      const t = text(m.text), path = str(m.path, 200)
      if (!t || !path.startsWith('/')) return null
      const n: Note = { id: id('n'), path, where: str(m.where, 40), sel: str(m.sel, 600), rx: frac(m.rx), ry: frac(m.ry), x: px(m.x), y: px(m.y), at: now(), done: false, by: u.uid, msgs: [msg(u, t)], seen: { [u.uid]: now() } }
      notes.set(n.id, n); save(n)
      if (notes.size > NOTES_MAX) { const old = this.all().at(-1); if (old) { notes.delete(old.id); db?.collection('notes').doc(old.id).delete().catch(() => {}) } }
      return n
    },
    /** Ответ под заметкой (решённая заметка снова открывается) */
    reply(u: NoteAuthor, nid: unknown, m: Record<string, unknown>): Note | null {
      const n = notes.get(str(nid, 64)), t = text(m.text)
      if (!n || !t || n.msgs.length >= NOTE_MSGS) return null
      n.msgs.push(msg(u, t)); n.done = false; n.seen = { ...n.seen, [u.uid]: now() }; save(n); return n
    },
    /** Реакция на сообщение: поставить / снять (повторное нажатие) */
    react(u: NoteAuthor, nid: unknown, mid: unknown, e: unknown): Note | null {
      const n = notes.get(str(nid, 64)), r = str(e, 8)
      const mm = n?.msgs.find((x) => x.id === str(mid, 64))
      if (!n || !mm || !(REACTIONS as readonly string[]).includes(r)) return null
      const who = mm.react[r] ?? []
      mm.react[r] = who.includes(u.uid) ? who.filter((x) => x !== u.uid) : [...who, u.uid]
      if (!mm.react[r].length) delete mm.react[r]
      save(n); return n
    },
    /** Прочитал: закрыл всплывающее уведомление или открыл заметку — у автора появится «Прочитано» */
    seen(u: NoteAuthor, nid: unknown): Note | null {
      const n = notes.get(str(nid, 64)); if (!n) return null
      n.seen = { ...n.seen, [u.uid]: now() }; save(n); return n
    },
    /** Перенести булавку на другое место (той же или другой страницы) — любой преподаватель */
    move(nid: unknown, m: Record<string, unknown>): Note | null {
      const n = notes.get(str(nid, 64)), path = str(m.path, 200) || n?.path || ''
      if (!n || !path.startsWith('/')) return null
      Object.assign(n, { path, sel: str(m.sel, 600), rx: frac(m.rx), ry: frac(m.ry), x: px(m.x), y: px(m.y) }); save(n); return n
    },
    /** «Готово» — заметка решена (булавка прячется), или снова открыта */
    done(nid: unknown, on: unknown): Note | null {
      const n = notes.get(str(nid, 64)); if (!n) return null
      n.done = on === true; save(n); return n
    },
    /** Удалить заметку целиком — только тот, кто её оставил */
    remove(u: NoteAuthor, nid: unknown): string | null {
      const n = notes.get(str(nid, 64)); if (!n || n.by !== u.uid) return null
      notes.delete(n.id); db?.collection('notes').doc(n.id).delete().catch(() => {}); return n.id
    },
  }
}
export type Notes = ReturnType<typeof makeNotes>

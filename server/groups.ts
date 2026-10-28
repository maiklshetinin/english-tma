// Группы учеников — отдельная сущность (не выводится из уроков). Только преподаватель.
//  • groups/<id> — { studentIds: [2–12 учеников], createdAt, updatedAt }. Создаётся только из панели учеников (кнопка «группа +»),
//    состав меняется только через меню группы. Урок — это урок: в него ставят либо группу целиком, либо одного ученика.
//  • meta/groups — { seeded: true }: разовый перенос старых групп (раньше их собирали из расписания) уже был.
// Ученик, которого потом удалили или архивировали, может остаться в studentIds — сайт его просто не показывает.
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import { fail } from './login.js'
import type { Group } from './types.js'

export interface GroupsDeps { db: Firestore; FieldValue: Pick<typeof FV, 'serverTimestamp'> }
export const GROUP_MIN = 2, GROUP_MAX = 12, GROUPS_MAX = 200
const ID = /^[\w-]{1,64}$/

export function makeGroups({ db, FieldValue }: GroupsDeps) {
  const col = () => db.collection('groups'), students = () => db.collection('students'), meta = () => db.collection('meta').doc('groups')
  const pub = (id: string, x: { studentIds?: unknown }): Group => ({ id, studentIds: Array.isArray(x.studentIds) ? x.studentIds.map(String) : [] })
  // Состав: 2–12 разных живых (не архивных) учеников
  const membersOf = async (raw: unknown): Promise<string[]> => {
    if (!Array.isArray(raw)) throw fail(400, 'studentIds required')
    const ids = [...new Set(raw.map(String))]
    if (ids.length < GROUP_MIN || ids.length > GROUP_MAX || ids.some((x) => !ID.test(x))) throw fail(400, `studentIds: ${GROUP_MIN}–${GROUP_MAX}`)
    for (const id of ids) { const st = await students().doc(id).get(); if (!st.exists || st.get('archived')) throw fail(404, 'student not found') }
    return ids
  }
  const groupId = (raw: unknown) => { const id = String(raw ?? ''); if (!ID.test(id)) throw fail(400, 'bad id'); return id }

  return {
    async list(): Promise<{ groups: Group[]; seeded: boolean }> {
      const docs = (await col().get()).docs
      return { groups: docs.map((d) => pub(d.id, d.data())), seeded: (await meta().get()).get('seeded') === true }
    },

    async create(input: unknown): Promise<Group> {
      const ids = await membersOf((input as { studentIds?: unknown } | null)?.studentIds)
      if ((await col().get()).size >= GROUPS_MAX) throw fail(413, 'too many groups')
      const ref = col().doc()
      await ref.set({ studentIds: ids, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
      return { id: ref.id, studentIds: ids }
    },

    async update(rawId: unknown, input: unknown): Promise<Group> {
      const id = groupId(rawId), ids = await membersOf((input as { studentIds?: unknown } | null)?.studentIds), ref = col().doc(id)
      if (!(await ref.get()).exists) throw fail(404, 'group not found')
      await ref.update({ studentIds: ids, updatedAt: FieldValue.serverTimestamp() })
      return { id, studentIds: ids }
    },

    async remove(rawId: unknown): Promise<void> {
      await col().doc(groupId(rawId)).delete()
    },

    // Разовый перенос: группы, которые сайт раньше собирал из расписания, становятся настоящими. Второй раз — ничего не делает.
    async seed(input: unknown): Promise<{ groups: Group[]; seeded: boolean }> {
      const raw = (input as { groups?: unknown } | null)?.groups
      if (!Array.isArray(raw) || raw.length > GROUPS_MAX) throw fail(400, 'groups required')
      if ((await meta().get()).get('seeded') !== true) {
        await meta().set({ seeded: true, at: FieldValue.serverTimestamp() })
        for (const g of raw) {
          let ids: string[]
          try { ids = await membersOf(g) } catch { continue }          // кривую или устаревшую группу просто пропускаем
          await col().doc().set({ studentIds: ids, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
        }
      }
      return this.list()
    },
  }
}

// Вход пользователя. Вынесено из index.js, чтобы логику ролей можно было проверять тестами (server/login.test.mjs).
//  • преподаватель — Telegram id есть в TEACHER_IDS;
//  • ученик — уже есть в базе (users/tg:<id>) либо открыл одноразовую ссылку-приглашение на запись students/<id>;
//  • остальным — 403.
import type { Auth } from 'firebase-admin/auth'
import type { Firestore, FieldValue as FV } from 'firebase-admin/firestore'
import type { Verified } from './telegram.js'
import type { AuthResponse, SessionClaims, UserDoc } from './types.js'

export { fail } from './errors.js'
export type { HttpError } from './errors.js'
import { fail } from './errors.js'

export interface LoginDeps { db: Firestore; auth: Pick<Auth, 'createCustomToken'>; FieldValue: Pick<typeof FV, 'serverTimestamp'>; teacherIds: string[]; devIds?: string[] }

export function makeLogin({ db, auth, FieldValue, teacherIds, devIds = [] }: LoginDeps) {
  const isDev = (id: number) => devIds.includes(String(id))
  return async function login({ user: u, startParam }: Verified): Promise<AuthResponse> {
    const uid = `tg:${u.id}`, ref = db.collection('users').doc(uid)
    const code = /^invite_([\w-]{8,64})$/.exec(startParam)?.[1]
    const ts = FieldValue.serverTimestamp()
    const profile = { tgId: u.id, name: u.first_name || '', username: u.username || '', photoUrl: u.photo_url || '', lastLoginAt: ts }
    let role: UserDoc['role'] | null = null, studentId: string | null = null
    await db.runTransaction(async (tx) => {
      role = null; studentId = null                       // транзакция может выполниться повторно
      // Сначала все чтения, потом записи (требование Firestore)
      const snap = await tx.get(ref)
      const inv = code ? await tx.get(db.collection('invites').doc(code)) : null
      const useInvite = !!inv?.exists && !inv.get('usedBy')
      const oldSid: string | null = snap.exists && snap.get('role') === 'student' ? String(snap.get('studentId') ?? '') || null : null
      const invSid: string | null = useInvite ? String(inv!.get('studentId')) : null
      const oldRef = oldSid ? db.collection('students').doc(oldSid) : null
      const invRef = invSid && invSid !== oldSid ? db.collection('students').doc(invSid) : oldRef
      const oldSt = oldRef ? await tx.get(oldRef) : null
      const invSt = invRef && invRef !== oldRef ? await tx.get(invRef) : oldSt
      const isAlive = (d: typeof oldSt) => !!d?.exists && !d.get('archived')      // запись ученика есть и не в архиве

      if (isDev(u.id) || teacherIds.includes(String(u.id))) {          // разработчик — тоже преподаватель (+ dev в токене)
        role = 'teacher'; tx.set(ref, { ...profile, role }, { merge: true })
      } else if (useInvite && isAlive(invSt)) {
        // Свежая ссылка-приглашение важнее старой привязки: так ученик снова войдёт, даже если его прежнюю запись
        // удалили (в т. ч. вручную в базе) или преподаватель завёл для него новую запись.
        role = 'student'; studentId = invSid
        const old = invSt!.get('tgId')                     // запись уже была привязана к другому аккаунту → старый теряет доступ
        if (old && old !== u.id) tx.delete(db.collection('users').doc(`tg:${old}`))
        if (oldSid && oldSid !== invSid && isAlive(oldSt) && oldSt!.get('tgId') === u.id) tx.update(oldRef!, { tgId: null, status: 'invited' })   // прежняя запись этого аккаунта снова «ждёт приглашения»
        tx.update(inv!.ref, { usedBy: uid, usedAt: ts })
        tx.update(invRef!, { tgId: u.id, status: 'active', photoUrl: profile.photoUrl || invSt!.get('photoUrl') || '', username: profile.username, joinedAt: ts })
        tx.set(ref, { ...profile, role, studentId, createdAt: snap.exists ? snap.get('createdAt') ?? ts : ts })
      } else if (snap.exists) {
        const r = snap.get('role')
        if (r === 'student' && !isAlive(oldSt)) return      // запись ученика удалена или в архиве — вход закрыт (поможет новая ссылка-приглашение)
        role = r; studentId = snap.get('studentId') ?? null
        tx.update(ref, profile)
        if (r === 'student') tx.update(oldRef!, { photoUrl: profile.photoUrl || oldSt!.get('photoUrl') || '', username: profile.username, lastLoginAt: ts })
      }
    })
    if (!role) throw fail(403, 'no access')
    const dev = role === 'teacher' && isDev(u.id)
    console.log(`  → вход: tg:${u.id} @${u.username || '-'} как ${dev ? 'разработчик' : role}`)
    // Данные профиля кладём в токен, чтобы фронту не нужен был отдельный запрос (лимит клеймов — 1000 байт)
    const token = await auth.createCustomToken(uid, { role, studentId, tgName: profile.name, tgUsername: profile.username, tgPhoto: profile.photoUrl, ...(dev ? { dev } : {}) } satisfies SessionClaims)
    return { token }
  }
}

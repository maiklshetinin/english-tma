// Вход и «кто я»: статус входа, профиль из Telegram, роль (преподаватель / ученик) и id ученика, чьими глазами смотрим приложение.
// Схема входа: Telegram подписывает данные пользователя → наш сервер (Render) проверяет подпись, находит роль в базе и выдаёт
// Firebase custom token → фронт входит в Firebase. Имя, ник, фото и роль приходят в клеймах токена (SessionClaims, см. server/login.ts).
//  • Внутри Telegram — автоматически, без кнопок (initData).
//  • В обычном браузере — кнопка «Войти через Telegram» (Login Widget); сессия сохраняется Firebase.
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { signInWithCustomToken, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import type { AuthResponse, Role, SessionClaims } from '../../server/types'
import { API, fb, isDemo, tg } from '../firebase'
import { showToast } from '../composables/useToast'
import { session } from './session'
import { useContentStore } from './content'
import { useStudentsStore } from './students'
import { useScheduleStore } from './schedule'

export type AuthStatus = 'loading' | 'login' | 'ready' | 'error'
/** Профиль из Telegram (поля названы так, как их называет Telegram). */
export interface TgProfile { id: number; first_name?: string; username?: string; photo_url?: string }

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('loading')
  const user = ref<TgProfile | null>(null)
  const error = ref('')
  const isTeacher = ref(false)                  // настоящий преподаватель (а не просто «смотрит глазами преподавателя»)
  const role = ref<Role>('student')             // в каком режиме сейчас показано приложение
  const currentStudentId = ref<string | null>(null)   // чьими глазами показан режим «ученик»
  /** Карточка преподавателя для учеников (подпись и ссылка «Написать учителю»); фото подтягивается из Telegram. */
  const teacher = reactive({ name: 'Анна', username: 'your_teacher_username', color: '#58cc02', photoUrl: '' })

  /** Режим «ученик» возможен, только если есть чьими глазами смотреть: преподаватель без учеников остаётся в своём режиме. */
  function setRole(r: Role): boolean {
    const students = useStudentsStore()
    if (r === 'student' && !students.byId(currentStudentId.value)) {
      if (!students.list.length) return false
      currentStudentId.value = students.list[0].id
    }
    role.value = r
    return true
  }

  // Своя аватарка берётся из Telegram: кладём её в запись преподавателя / ученика, чтобы она показывалась везде
  function syncAvatar() {
    const u = user.value; if (!u?.photo_url) return
    const me: any = role.value === 'teacher' ? teacher : useStudentsStore().byId(currentStudentId.value)
    if (me) { me.photoUrl = u.photo_url; if (u.id) me.tgId = u.id }
  }

  async function applySession(fbUser: User) {
    const c = (await fbUser.getIdTokenResult()).claims as unknown as SessionClaims
    user.value = { id: Number(String(fbUser.uid).replace('tg:', '')), first_name: c.tgName, username: c.tgUsername, photo_url: c.tgPhoto }
    if (c.role === 'student') currentStudentId.value = c.studentId
    const students = useStudentsStore(), schedule = useScheduleStore(), content = useContentStore()
    await students.load()                                   // ученики с сервера (для ученика — только его запись)
    students.startRefresh()
    if (c.role === 'student' && !students.list.length) throw new Error('Ваша запись не найдена или в архиве. Попросите преподавателя прислать новое приглашение.')
    // Что сохранять на сервер: только преподаватель правит путь, колоды и пресеты; прогресс повторений — свой собственный
    session.canEdit = c.role === 'teacher'; session.ownKey = c.role === 'teacher' ? 'teacher' : c.studentId
    await content.load().catch((e: Error) => showToast(e.message, null, 'bad'))          // путь, колоды, пресеты и прогресс слов
    content.startRefresh()
    schedule.load().catch(() => showToast('Не удалось загрузить расписание', null, 'bad'))      // уроки двух недель (для ученика — только его)
    schedule.startRefresh()
    setRole(c.role); isTeacher.value = c.role === 'teacher'
    syncAvatar()
  }

  async function exchange(path: string, init: RequestInit) {
    let r: Response
    try { r = await fetch(`${API}${path}`, { method: 'POST', ...init }) } catch { throw new Error('Сервер не отвечает. Если он спал — подождите полминуты и повторите.') }
    if (r.status === 403) throw new Error('Нет доступа. Попросите преподавателя прислать ссылку-приглашение.')
    if (!r.ok) throw new Error(`Не удалось подтвердить вход (${r.status})`)
    await signInWithCustomToken(fb!, ((await r.json()) as AuthResponse).token)
    await applySession(fb!.currentUser!)
  }

  async function authenticate() {
    status.value = 'loading'; error.value = ''
    try {
      if (isDemo) { user.value = { id: 0, first_name: 'Demo', username: 'demo' }; currentStudentId.value = '1'; (await import('../store/demo')).loadDemo() }      // локальная разработка без Telegram: данные в памяти
      else if (!fb || !API) throw new Error('Не настроены переменные сервера и Firebase (см. README)')
      else if (tg?.initData) await exchange('/auth/telegram', { headers: { Authorization: `tma ${tg.initData}` } })
      else {
        await fb.authStateReady()                            // обычный браузер: восстанавливаем сохранённую сессию
        if (fb.currentUser) await applySession(fb.currentUser)
        else { status.value = 'login'; return }
      }
      status.value = 'ready'
    } catch (e) { error.value = (e as Error).message; status.value = 'error' }
  }

  /** Вызывается кнопкой «Войти через Telegram». */
  async function loginWithWidget(data: unknown) {
    status.value = 'loading'; error.value = ''
    try { await exchange('/auth/telegram-widget', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); status.value = 'ready' }
    catch (e) { error.value = (e as Error).message; status.value = 'error' }
  }

  async function logout() {
    await signOut(fb!); useStudentsStore().clear(); useScheduleStore().clear(); useContentStore().clear()
    session.canEdit = false; session.ownKey = null
    user.value = null; isTeacher.value = false; status.value = 'login'
  }

  return { status, user, error, isTeacher, role, currentStudentId, teacher, setRole, authenticate, loginWithWidget, logout }
})

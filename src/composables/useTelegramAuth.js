// Вход. Схема: Telegram подписывает данные пользователя → наш сервер (Render) проверяет подпись, находит роль в базе и выдаёт
// Firebase custom token → фронт входит в Firebase. Имя, ник, фото и роль приходят в клеймах токена (см. server/index.js).
//  • Внутри Telegram — автоматически, без кнопок (initData).
//  • В обычном браузере — кнопка «Войти через Telegram» (Login Widget); сессия сохраняется Firebase.
import { reactive } from 'vue'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth'
import { state, setRole } from '../store/mock'

const tg = window.Telegram?.WebApp
const env = import.meta.env
const API = env.VITE_API_URL                                 // https://….onrender.com
export const BOT_USERNAME = env.VITE_BOT_USERNAME            // для кнопки входа в браузере
const fb = env.VITE_FIREBASE_API_KEY
  ? getAuth(initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID }))
  : null
export const auth = reactive({ status: 'loading', user: null, error: '', teacher: false })   // status: loading | login | ready | error

// Запросы к нашему серверу с Firebase ID-токеном (он сам обновляется)
export const apiFetch = async (path, opts = {}) => {
  const token = await fb?.currentUser?.getIdToken()
  return fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...opts.headers } })
}

// Своя аватарка берётся из Telegram: кладём её в запись преподавателя / ученика, чтобы она показывалась везде
function syncAvatar() {
  const u = auth.user; if (!u?.photo_url) return
  const me = state.role === 'teacher' ? state.teacher : state.students.find(x => x.id === state.currentStudentId)
  if (me) { me.photo_url = u.photo_url; if (u.id) me.tgId = u.id }
}
async function applySession(fbUser) {
  const c = (await fbUser.getIdTokenResult()).claims
  auth.user = { id: Number(String(fbUser.uid).replace('tg:', '')), first_name: c.tgName, username: c.tgUsername, photo_url: c.tgPhoto }
  setRole(c.role); auth.teacher = c.role === 'teacher'
  if (c.studentId) state.currentStudentId = c.studentId
  syncAvatar()
}
async function exchange(path, init) {
  let r
  try { r = await fetch(`${API}${path}`, { method: 'POST', ...init }) } catch { throw new Error('Сервер не отвечает. Если он спал — подождите полминуты и повторите.') }
  if (r.status === 403) throw new Error('Нет доступа. Попросите преподавателя прислать ссылку-приглашение.')
  if (!r.ok) throw new Error(`Не удалось подтвердить вход (${r.status})`)
  await signInWithCustomToken(fb, (await r.json()).token)
  await applySession(fb.currentUser)
}

export async function authenticate() {
  auth.status = 'loading'; auth.error = ''
  try {
    if (!tg?.initData && env.DEV) { auth.user = { id: 0, first_name: 'Demo', username: 'demo' } }      // локальная разработка без Telegram
    else if (!fb || !API) throw new Error('Не настроены переменные сервера и Firebase (см. README)')
    else if (tg?.initData) await exchange('/auth/telegram', { headers: { Authorization: `tma ${tg.initData}` } })
    else {
      await fb.authStateReady()                            // обычный браузер: восстанавливаем сохранённую сессию
      if (fb.currentUser) await applySession(fb.currentUser)
      else { auth.status = 'login'; return }
    }
    auth.status = 'ready'
  } catch (e) { auth.error = e.message; auth.status = 'error' }
}
export async function loginWithWidget(data) {              // вызывается кнопкой «Войти через Telegram»
  auth.status = 'loading'; auth.error = ''
  try { await exchange('/auth/telegram-widget', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); auth.status = 'ready' }
  catch (e) { auth.error = e.message; auth.status = 'error' }
}
export async function logout() { await signOut(fb); auth.user = null; auth.teacher = false; auth.status = 'login' }
export const canLogout = !tg?.initData && !!fb            // выход нужен только в браузере: в Telegram вход автоматический

// Ссылка-приглашение ученику (только преподаватель)
export async function createInvite(studentId) {
  const r = await apiFetch('/invites', { method: 'POST', body: JSON.stringify({ studentId }) })
  if (!r.ok) throw new Error(`Не удалось создать приглашение (${r.status})`)
  return (await r.json()).url
}

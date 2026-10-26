// Связь с внешним миром: Firebase (вход по токену), адрес нашего сервера и запросы к нему.
// Вынесено отдельно, чтобы сторы и composables могли им пользоваться, не импортируя друг друга по кругу.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const env = import.meta.env
export const tg = window.Telegram?.WebApp
export const API: string | undefined = env.VITE_API_URL            // https://….onrender.com
export const BOT_USERNAME: string | undefined = env.VITE_BOT_USERNAME   // для кнопки входа в браузере
export const fb = env.VITE_FIREBASE_API_KEY
  ? getAuth(initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID }))
  : null
/** Локальная разработка без Telegram: сервера нет, данные — демо в памяти. */
export const isDemo = !tg?.initData && !!env.DEV

/** Выход нужен только в браузере: в Telegram вход автоматический. */
export const canLogout = !tg?.initData && !!fb

/** Запрос к нашему серверу с Firebase ID-токеном (он сам обновляется). */
export const apiFetch = async (path: string, opts: RequestInit = {}): Promise<Response> => {
  const token = await fb?.currentUser?.getIdToken()
  return fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...opts.headers } })
}

/** То же, но сетевая ошибка превращается в понятное сообщение (бесплатный Render может спать до ~30 с). */
export async function apiRequest(path: string, opts?: RequestInit): Promise<Response> {
  try { return await apiFetch(path, opts) } catch { throw new Error('Сервер не отвечает. Если он спал — подождите полминуты и повторите.') }
}

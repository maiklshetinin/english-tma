import { reactive } from 'vue'
import { state, setRole } from '../store/mock'

const tg = window.Telegram?.WebApp
const API = import.meta.env.VITE_API_URL          // напр. https://api.example.com ; без него — «мягкий» режим без бэкенда
export const auth = reactive({ status: 'loading', user: null, error: '', teacher: false })

// Роль без бэкенда: Telegram-id или @username преподавателя(ей) в VITE_TEACHERS (через запятую), напр. "123456789,@my_username".
// Это только удобство интерфейса — настоящая проверка роли должна быть на сервере (см. /auth/telegram).
const TEACHERS = (import.meta.env.VITE_TEACHERS || '').split(',').map(x => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)
const isListedTeacher = (u) => !!u && TEACHERS.some(t => t === String(u.id) || t === (u.username || '').toLowerCase())

// Каждый запрос подписывается сырой строкой initData — токены и логины хранить не нужно.
export const apiFetch = (path, opts = {}) => fetch(`${API}${path}`, {
  ...opts, headers: { 'Content-Type': 'application/json', Authorization: `tma ${tg?.initData ?? ''}`, ...opts.headers },
})

// Своя аватарка берётся из Telegram: кладём её в запись преподавателя / ученика, чтобы она показывалась везде (список, таблица, профиль)
function syncAvatar() {
  const u = auth.user; if (!u?.photo_url) return
  const me = state.role === 'teacher' ? state.teacher : state.students.find(x => x.id === state.currentStudentId)
  if (me) { me.photo_url = u.photo_url; if (u.id) me.tgId = u.id }
}
export async function authenticate() {
  auth.status = 'loading'; auth.error = ''
  try {
    if (!tg?.initData) {                                   // открыто не из Telegram
      if (!import.meta.env.DEV) throw new Error('Откройте приложение через Telegram-бота')
      auth.user = { id: 0, first_name: 'Demo', username: 'demo' }
    } else {
      auth.user = tg.initDataUnsafe.user                   // только для мгновенного UI, ему доверять нельзя
      if (API) {                                           // источник истины — проверка подписи на сервере
        const r = await apiFetch('/auth/telegram', { method: 'POST' })
        if (!r.ok) throw new Error(`Не удалось подтвердить вход (${r.status})`)
        const { role, studentId } = await r.json()
        setRole(role); auth.teacher = role === 'teacher'
        if (studentId) state.currentStudentId = studentId
      } else if (isListedTeacher(auth.user)) { setRole('teacher'); auth.teacher = true }   // без бэкенда: преподаватель из списка VITE_TEACHERS
    }
    syncAvatar()
    auth.status = 'ready'
  } catch (e) { auth.error = e.message; auth.status = 'error' }
}

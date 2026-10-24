import { reactive } from 'vue'
import { state, setRole } from '../store/mock'

const tg = window.Telegram?.WebApp
const API = import.meta.env.VITE_API_URL          // напр. https://api.example.com ; без него — «мягкий» режим без бэкенда
export const auth = reactive({ status: 'loading', user: null, error: '' })

// Каждый запрос подписывается сырой строкой initData — токены и логины хранить не нужно.
export const apiFetch = (path, opts = {}) => fetch(`${API}${path}`, {
  ...opts, headers: { 'Content-Type': 'application/json', Authorization: `tma ${tg?.initData ?? ''}`, ...opts.headers },
})

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
        setRole(role)
        if (studentId) state.currentStudentId = studentId
      }
    }
    auth.status = 'ready'
  } catch (e) { auth.error = e.message; auth.status = 'error' }
}

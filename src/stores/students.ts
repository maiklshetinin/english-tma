// Ученики. Сайт НЕ обращается к Firestore напрямую: всё идёт через наш сервер (Render), а он проверяет роль и работает с базой.
// Форма данных — `Student` из server/types.ts (то, что отдаёт сервер). Realtime нет, поэтому список перечитывается:
// после входа, после каждого действия, при возврате в приложение и при открытии вкладки «Ученики».
// Путь, колоды и повторения — в stores/path.ts, decks.ts, srs.ts; расписание — в stores/schedule.ts.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CreateStudentResponse, InviteResponse, Student, StudentInput } from '../../server/types'
import { apiRequest } from '../firebase'
import { useScheduleStore } from './schedule'

// Сервер уже отдаёт нужную форму; здесь только значения по умолчанию на случай неполных данных
const normalize = (x: Student): Student => ({
  ...x, name: x.name || 'Без имени', level: x.level || 'A1', username: x.username || '', streak: x.streak ?? 0, coins: x.coins ?? 0,
  status: x.status || 'invited', tgId: x.tgId ?? null, photoUrl: x.photoUrl || '',
})

async function call<T>(path: string, opts: RequestInit | undefined, what: string): Promise<T> {
  const r = await apiRequest(path, opts)
  if (!r.ok) throw new Error(r.status === 403 ? 'Нет прав на это действие' : r.status === 404 ? 'Ученик не найден (возможно, уже в архиве)' : `${what} (${r.status})`)
  return r.json() as Promise<T>
}

export const useStudentsStore = defineStore('students', () => {
  const list = ref<Student[]>([])

  const byId = (id: string | null | undefined) => list.value.find((s) => s.id === id)
  const set = (items: Student[]) => { list.value = [...items].sort((a, b) => a.name.localeCompare(b.name, 'ru')) }
  const clear = () => { stopRefresh(); list.value = [] }

  async function load(): Promise<Student[]> {
    set((await call<Student[]>('/students', undefined, 'Не удалось загрузить учеников')).map(normalize))
    return list.value
  }

  let onVisible: (() => void) | null = null
  function startRefresh() {                      // обновлять список, когда пользователь возвращается в приложение
    stopRefresh()
    onVisible = () => { if (document.visibilityState === 'visible') load().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)
  }
  function stopRefresh() { if (onVisible) document.removeEventListener('visibilitychange', onVisible); onVisible = null }

  /** Новый ученик: сервер создаёт запись и сразу ссылку-приглашение. Telegram-аккаунт привяжется, когда он откроет ссылку. */
  async function add({ name, level, packageSize }: StudentInput): Promise<string> {
    const { url } = await call<CreateStudentResponse>('/students', { method: 'POST', body: JSON.stringify({ name, level, packageSize }) }, 'Не удалось добавить ученика')
    await load().catch(() => {})
    return url
  }
  /** Новая одноразовая ссылка для существующего ученика (в т.ч. чтобы привязать другой аккаунт). */
  async function invite(studentId: string): Promise<string> {
    return (await call<InviteResponse>('/invites', { method: 'POST', body: JSON.stringify({ studentId }) }, 'Не удалось создать приглашение')).url
  }
  async function archive(studentId: string): Promise<void> {
    await call(`/students/${encodeURIComponent(studentId)}/archive`, { method: 'POST' }, 'Не удалось архивировать')
    await Promise.all([load().catch(() => {}), useScheduleStore().load().catch(() => {})])      // сервер заодно убирает ученика из уроков
  }

  return { list, byId, set, clear, load, startRefresh, stopRefresh, add, invite, archive }
})

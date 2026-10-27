// Ученики. Сайт НЕ обращается к Firestore напрямую: всё идёт через наш сервер (Render), а он проверяет роль и работает с базой.
// Форма данных — `Student` из server/types.ts (то, что отдаёт сервер). Realtime нет, поэтому список перечитывается:
// после входа, после каждого действия, при возврате в приложение и при открытии вкладки «Ученики».
// Путь, колоды и повторения — в stores/path.ts, decks.ts, srs.ts; расписание — в stores/schedule.ts.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ArchivedStudent, CreateStudentResponse, InviteResponse, Student, StudentInput } from '../../server/types'
import { apiRequest } from '../firebase'
import { useScheduleStore } from './schedule'

// Сервер уже отдаёт нужную форму; здесь только значения по умолчанию на случай неполных данных
const normalize = (x: Student): Student => ({
  ...x, name: x.name || 'Без имени', level: x.level || 'A1', username: x.username || '', streak: x.streak ?? 0, coins: x.coins ?? 0,
  status: x.status || 'invited', tgId: x.tgId ?? null, photoUrl: x.photoUrl || '', price: x.price ?? 0, priceHistory: x.priceHistory ?? [{ from: '', price: x.price ?? 0 }],
})

async function call<T>(path: string, opts: RequestInit | undefined, what: string): Promise<T> {
  const r = await apiRequest(path, opts)
  if (!r.ok) throw new Error(r.status === 403 ? 'Нет прав на это действие' : r.status === 404 ? 'Ученик не найден (возможно, уже в архиве)' : `${what} (${r.status})`)
  return r.json() as Promise<T>
}

export const useStudentsStore = defineStore('students', () => {
  const list = ref<Student[]>([])
  const archived = ref<ArchivedStudent[]>([])        // раздел «Архив» (грузится на вкладке «Ученики»)

  const byId = (id: string | null | undefined) => list.value.find((s) => s.id === id)
  const set = (items: Student[]) => { list.value = [...items].sort((a, b) => a.name.localeCompare(b.name, 'ru')) }
  const clear = () => { stopRefresh(); list.value = []; archived.value = [] }

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

  /** Новый ученик: сервер создаёт запись (если указан ник — сразу ищет фото в Telegram) и ссылку-приглашение. Telegram-аккаунт привяжется, когда он откроет ссылку. */
  async function add({ name, level, packageSize, username, price }: StudentInput): Promise<string> {
    const { url } = await call<CreateStudentResponse>('/students', { method: 'POST', body: JSON.stringify({ name, level, packageSize, username, price }) }, 'Не удалось добавить ученика')
    await load().catch(() => {})
    return url
  }
  /** Новая одноразовая ссылка для существующего ученика (в т.ч. чтобы привязать другой аккаунт). */
  async function invite(studentId: string): Promise<string> {
    return (await call<InviteResponse>('/invites', { method: 'POST', body: JSON.stringify({ studentId }) }, 'Не удалось создать приглашение')).url
  }
  /** Ник Telegram у уже созданного ученика (пока он не открыл приглашение): сервер заново ищет фото по нику. */
  async function setUsername(studentId: string, username: string): Promise<void> {
    const r = await apiRequest(`/students/${encodeURIComponent(studentId)}/username`, { method: 'POST', body: JSON.stringify({ username }) })
    if (!r.ok) throw new Error(r.status === 400 ? 'Ник в Telegram: 5–32 символа, латиница, цифры и _, начинается с буквы' : r.status === 409 ? 'Ученик уже вошёл в приложение — ник и фото берутся из его Telegram' : r.status === 404 ? 'Ученик не найден (возможно, уже в архиве)' : `Не удалось сохранить ник (${r.status})`)
    await load().catch(() => {})
  }
  /** Новая цена урока: действует для уроков со следующего часа, прошедшие остаются по старой (история цен хранится на сервере). */
  async function setPrice(studentId: string, price: number): Promise<void> {
    const r = await apiRequest(`/students/${encodeURIComponent(studentId)}/price`, { method: 'POST', body: JSON.stringify({ price }) })
    if (!r.ok) throw new Error(r.status === 400 ? 'Цена — число от 0 до 100000' : r.status === 404 ? 'Ученик не найден (возможно, уже в архиве)' : `Не удалось сохранить цену (${r.status})`)
    await load().catch(() => {})
  }
  async function archive(studentId: string): Promise<void> {
    await call(`/students/${encodeURIComponent(studentId)}/archive`, { method: 'POST' }, 'Не удалось архивировать')
    await Promise.all([load().catch(() => {}), loadArchived().catch(() => {}), useScheduleStore().load().catch(() => {})])      // сервер заодно убирает ученика из уроков
  }

  async function loadArchived(): Promise<ArchivedStudent[]> {
    archived.value = (await call<ArchivedStudent[]>('/students/archived', undefined, 'Не удалось загрузить архив')).map((x) => ({ ...normalize(x), archivedAt: x.archivedAt ?? null }))
    return archived.value
  }
  /** Вернуть из архива: ученик снова в списке и «ждёт приглашения». Возвращает новую ссылку-приглашение (старый аккаунт доступ потерял). */
  async function restore(studentId: string): Promise<string> {
    const { url } = await call<CreateStudentResponse>(`/students/${encodeURIComponent(studentId)}/restore`, { method: 'POST' }, 'Не удалось вернуть ученика')
    archived.value = archived.value.filter((x) => x.id !== studentId)
    await Promise.all([load().catch(() => {}), loadArchived().catch(() => {})])
    return url
  }
  /** Удалить навсегда (только из архива): запись, путь, прогресс слов; будущие уроки — без него, проведённые остаются с его именем. */
  async function purge(studentId: string): Promise<void> {
    await call(`/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' }, 'Не удалось удалить ученика')
    archived.value = archived.value.filter((x) => x.id !== studentId)
    await Promise.all([loadArchived().catch(() => {}), useScheduleStore().load().catch(() => {})])
  }

  return { list, archived, byId, set, clear, load, loadArchived, startRefresh, stopRefresh, add, invite, setUsername, setPrice, archive, restore, purge }
})

// Ученики. Сайт НЕ обращается к Firestore напрямую: всё идёт через наш сервер (Render), а он проверяет роль и работает с базой.
// Realtime нет, поэтому список перечитывается: после входа, после каждого действия, при возврате в приложение и при открытии вкладки «Ученики».
// Путь, расписание и колоды пока в mock.js (в памяти): у новых учеников они пустые.
import { state } from '../store/mock'
import { apiFetch } from './useTelegramAuth'

const fromApi = (x) => ({
  id: x.id, name: x.name || 'Без имени', level: x.level || 'A1', color: x.color, username: x.username || '', streak: x.streak ?? 0, coins: x.coins ?? 0,
  status: x.status || 'invited', tgId: x.tgId ?? null, photo_url: x.photoUrl || '', payment: x.payment,
})
function apply(list) {
  list.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  for (const s of list) if (!state.paths[s.id]) state.paths[s.id] = []     // чтобы правки пути у нового ученика сохранялись в state
  state.students.splice(0, state.students.length, ...list)
}
// Запрос к серверу с понятной ошибкой (сервер на бесплатном Render может спать до ~30 с)
async function call(path, opts, what) {
  let r
  try { r = await apiFetch(path, opts) } catch { throw new Error('Сервер не отвечает. Если он спал — подождите полминуты и повторите.') }
  if (!r.ok) throw new Error(r.status === 403 ? 'Нет прав на это действие' : r.status === 404 ? 'Ученик не найден (возможно, уже в архиве)' : `${what} (${r.status})`)
  return r.json()
}

export async function loadStudents() {
  const list = (await call('/students', {}, 'Не удалось загрузить учеников')).map(fromApi)
  apply(list); return list
}
let onVisible
export function startRefresh() {                      // обновлять список, когда пользователь возвращается в приложение
  stopRefresh()
  onVisible = () => { if (document.visibilityState === 'visible') loadStudents().catch(() => {}) }
  document.addEventListener('visibilitychange', onVisible)
}
export function stopRefresh() { if (onVisible) document.removeEventListener('visibilitychange', onVisible); onVisible = null }
export const clearStudents = () => { stopRefresh(); state.students.splice(0) }

// Новый ученик: сервер создаёт запись и сразу ссылку-приглашение. Telegram-аккаунт привяжется, когда он откроет ссылку.
export async function addStudent({ name, level, packageSize }) {
  const { url } = await call('/students', { method: 'POST', body: JSON.stringify({ name, level, packageSize }) }, 'Не удалось добавить ученика')
  await loadStudents().catch(() => {})
  return url
}
// Новая одноразовая ссылка для существующего ученика (в т.ч. чтобы привязать другой аккаунт)
export async function createInvite(studentId) {
  return (await call('/invites', { method: 'POST', body: JSON.stringify({ studentId }) }, 'Не удалось создать приглашение')).url
}
export async function archiveStudent(studentId) {
  await call(`/students/${encodeURIComponent(studentId)}/archive`, { method: 'POST' }, 'Не удалось архивировать')
  await loadStudents().catch(() => {})
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const t = Object.assign(document.createElement('textarea'), { value: text }); document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy'); t.remove(); return ok
  }
}
// «Поделиться» — окно выбора контакта в Telegram с готовым текстом и ссылкой
export function shareInvite(url) {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Ссылка для входа в приложение для занятий английским 👇')}`
  const tg = window.Telegram?.WebApp
  tg?.initData ? tg.openTelegramLink(link) : window.open(link, '_blank')
}

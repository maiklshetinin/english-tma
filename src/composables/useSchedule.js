// Расписание: уроки лежат в state.lessons, а сохраняются на сервере (Render → Firestore: коллекция lessons + документы недель schedule/<понедельник>).
// Правки применяются на экране сразу, а запросы уходят на сервер по очереди — чтобы порядок на сервере совпал с порядком действий.
// Если сервер отказал (слот уже занят, нет связи), показывается ошибка и расписание перечитывается с сервера.
// В демо-режиме (`npm run dev` вне Telegram) сервера нет — всё остаётся в памяти.
import { state, nextId } from '../store/mock'
import { apiFetch, isDemo } from './useTelegramAuth'
import { showToast } from './useToast'

const TMP = 'tmp-'                                          // временный id урока, пока сервер не вернул настоящий
const isTmp = (id) => String(id).startsWith(TMP)

async function call(path, opts, what) {
  let r
  try { r = await apiFetch(path, opts) } catch { throw new Error('Сервер не отвечает. Если он спал — подождите полминуты и повторите.') }
  if (!r.ok) throw new Error(r.status === 409 ? 'Это время уже занято' : r.status === 404 ? 'Урок или ученик не найден — расписание обновлено' : r.status === 403 ? 'Нет прав на это действие' : `${what} (${r.status})`)
  return r.json()
}

let pending = 0, rev = 0, dirty = false, chain = Promise.resolve()

// Загрузка двух недель с сервера. Ответ не применяется, если за это время на экране что-то поменялось или ещё идёт сохранение.
export async function loadSchedule() {
  if (isDemo) return
  const was = rev
  const d = await call('/schedule', {}, 'Не удалось загрузить расписание')
  if (pending || rev !== was) return
  state.lessons.splice(0, state.lessons.length, ...[...d.current.lessons, ...d.next.lessons])
}
export const clearSchedule = () => { stopScheduleRefresh(); state.lessons.splice(0) }

let onVisible
export function startScheduleRefresh() {                  // перечитывать, когда пользователь возвращается в приложение
  stopScheduleRefresh()
  onVisible = () => { if (document.visibilityState === 'visible') loadSchedule().catch(() => {}) }
  document.addEventListener('visibilitychange', onVisible)
}
export function stopScheduleRefresh() { if (onVisible) document.removeEventListener('visibilitychange', onVisible); onVisible = null }

function sync(task) {                                      // поставить запрос в очередь; при ошибке — тост и перечитывание, когда очередь опустеет
  if (isDemo) return
  pending++
  chain = chain.then(task).catch((e) => { dirty = true; showToast(e.message, null, 'bad') }).then(async () => {
    if (--pending === 0 && dirty) { dirty = false; await loadSchedule().catch(() => {}) }
  })
}
const post = (path, body, what) => call(path, { method: 'POST', body: JSON.stringify(body) }, what)
const live = (l) => state.lessons.find(x => x.id === l.id)

// Новый урок: studentIds — один ученик или несколько (группа). Возвращает урок, который уже лежит в state.lessons.
export function createLesson(studentIds, date, hour) {
  rev++
  state.lessons.push({ id: `${TMP}${nextId()}`, date, hour, studentIds: [...studentIds] })
  const lesson = state.lessons[state.lessons.length - 1]
  sync(async () => { lesson.id = (await post('/lessons', { studentIds: [...lesson.studentIds], date, hour }, 'Не удалось сохранить урок')).id })
  return lesson
}
export function moveLesson(lesson, date, hour) {
  const l = live(lesson) ?? lesson; rev++
  l.date = date; l.hour = hour
  sync(async () => { if (!isTmp(l.id)) await post(`/lessons/${encodeURIComponent(l.id)}/move`, { date, hour }, 'Не удалось перенести урок') })
}
export function swapLessons(a, b) {
  const [x, y] = [live(a) ?? a, live(b) ?? b]; rev++
  ;[x.date, x.hour, y.date, y.hour] = [y.date, y.hour, x.date, x.hour]
  sync(async () => { if (!isTmp(x.id) && !isTmp(y.id)) await post('/lessons/swap', { a: x.id, b: y.id }, 'Не удалось поменять уроки') })
}
export function removeLesson(lesson) {
  const i = state.lessons.findIndex(x => x.id === lesson.id); rev++
  if (i >= 0) state.lessons.splice(i, 1)
  sync(async () => { if (!isTmp(lesson.id)) await call(`/lessons/${encodeURIComponent(lesson.id)}`, { method: 'DELETE' }, 'Не удалось убрать урок') })
}

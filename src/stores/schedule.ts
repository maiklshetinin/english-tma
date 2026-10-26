// Расписание: уроки лежат в сторе, а сохраняются на сервере (Render → Firestore: коллекция lessons + документы недель schedule/<понедельник>).
// Правки применяются на экране сразу, а запросы уходят на сервер по очереди — чтобы порядок на сервере совпал с порядком действий.
// Если сервер отказал (слот уже занят, нет связи), показывается ошибка и расписание перечитывается с сервера.
// В демо-режиме (`npm run dev` вне Telegram) сервера нет — всё остаётся в памяти.
// Форма данных — `Lesson` из server/types.ts.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Lesson, ScheduleResponse } from '../../server/types'
import { apiRequest, isDemo } from '../firebase'
import { showToast } from '../composables/useToast'

const TMP = 'tmp-'                                          // временный id урока, пока сервер не вернул настоящий
const isTmp = (id: string) => id.startsWith(TMP)
let tmpSeq = 0

/** Ключ ячейки таблицы на экране: «дата|час» (у сервера свой формат ключа слота — «дата_час»). */
export const slotKey = (date: string, hour: number) => `${date}|${hour}`

async function call<T>(path: string, opts: RequestInit | undefined, what: string): Promise<T> {
  const r = await apiRequest(path, opts)
  if (!r.ok) throw new Error(r.status === 409 ? 'Это время уже занято' : r.status === 404 ? 'Урок или ученик не найден — расписание обновлено' : r.status === 403 ? 'Нет прав на это действие' : `${what} (${r.status})`)
  return r.json() as Promise<T>
}

export const useScheduleStore = defineStore('schedule', () => {
  const lessons = ref<Lesson[]>([])

  // слот → уроки (обычно один; если больше — в ячейке показывается значок)
  const lessonMap = computed(() => {
    const m = new Map<string, Lesson[]>()
    for (const l of lessons.value) { const k = slotKey(l.date, l.hour); m.set(k, [...(m.get(k) ?? []), l]) }
    return m
  })

  let pending = 0, rev = 0, dirty = false, chain: Promise<unknown> = Promise.resolve()

  /** Загрузка двух недель с сервера. Ответ не применяется, если за это время на экране что-то поменялось или ещё идёт сохранение. */
  async function load(): Promise<void> {
    if (isDemo) return
    const was = rev
    const d = await call<ScheduleResponse>('/schedule', undefined, 'Не удалось загрузить расписание')
    if (pending || rev !== was) return
    lessons.value = [...d.current.lessons, ...d.next.lessons]
  }
  const set = (items: Lesson[]) => { lessons.value = items }
  const clear = () => { stopRefresh(); lessons.value = [] }

  let onVisible: (() => void) | null = null
  function startRefresh() {                  // перечитывать, когда пользователь возвращается в приложение
    stopRefresh()
    onVisible = () => { if (document.visibilityState === 'visible') load().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)
  }
  function stopRefresh() { if (onVisible) document.removeEventListener('visibilitychange', onVisible); onVisible = null }

  function sync(task: () => Promise<unknown>) {      // поставить запрос в очередь; при ошибке — тост и перечитывание, когда очередь опустеет
    if (isDemo) return
    pending++
    chain = chain.then(task).catch((e: Error) => { dirty = true; showToast(e.message, null, 'bad') }).then(async () => {
      if (--pending === 0 && dirty) { dirty = false; await load().catch(() => {}) }
    })
  }
  const post = <T>(path: string, body: unknown, what: string) => call<T>(path, { method: 'POST', body: JSON.stringify(body) }, what)
  const live = (l: Lesson) => lessons.value.find((x) => x.id === l.id)

  /** Новый урок: studentIds — один ученик или несколько (группа). Возвращает урок, который уже лежит в сторе. */
  function create(studentIds: string[], date: string, hour: number): Lesson {
    rev++
    lessons.value.push({ id: `${TMP}${++tmpSeq}`, date, hour, studentIds: [...studentIds] })
    const lesson = lessons.value[lessons.value.length - 1]
    sync(async () => { lesson.id = (await post<Lesson>('/lessons', { studentIds: [...lesson.studentIds], date, hour }, 'Не удалось сохранить урок')).id })
    return lesson
  }
  function move(lesson: Lesson, date: string, hour: number) {
    const l = live(lesson) ?? lesson; rev++
    l.date = date; l.hour = hour
    sync(async () => { if (!isTmp(l.id)) await post(`/lessons/${encodeURIComponent(l.id)}/move`, { date, hour }, 'Не удалось перенести урок') })
  }
  function swap(a: Lesson, b: Lesson) {
    const [x, y] = [live(a) ?? a, live(b) ?? b]; rev++
    ;[x.date, x.hour, y.date, y.hour] = [y.date, y.hour, x.date, x.hour]
    sync(async () => { if (!isTmp(x.id) && !isTmp(y.id)) await post('/lessons/swap', { a: x.id, b: y.id }, 'Не удалось поменять уроки') })
  }
  function remove(lesson: Lesson) {
    const i = lessons.value.findIndex((x) => x.id === lesson.id); rev++
    if (i >= 0) lessons.value.splice(i, 1)
    sync(async () => { if (!isTmp(lesson.id)) await call(`/lessons/${encodeURIComponent(lesson.id)}`, { method: 'DELETE' }, 'Не удалось убрать урок') })
  }

  return { lessons, lessonMap, load, set, clear, startRefresh, stopRefresh, create, move, swap, remove }
})

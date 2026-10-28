// Прогресс повторений слов у каждого пользователя: userKey ('teacher' или id ученика) → состояние карточек и журнал ответов по дням.
// Одну колоду видят многие, а прогресс у каждого свой. Ответ уходит на сервер сразу (POST /srs/rate), и сервер пишет его только в документ
// самого пользователя. Чужой прогресс (преподаватель смотрит ученика, или «глазами ученика») на сервер не отправляется.
// Форма данных — SrsState, SrsUser из server/types.ts. Сам алгоритм повторений — composables/useSrs.ts.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SrsRateInput, SrsState, SrsUser } from '../../server/types'
import { isDemo } from '../firebase'
import { showToast } from '../composables/useToast'
import { fetchSrs, post } from './api'
import { session } from './session'

export const useSrsStore = defineStore('srs', () => {
  const users = ref<Record<string, SrsUser>>({})
  let pending = 0, rev = 0, dirty = false
  let chain: Promise<unknown> = Promise.resolve()

  const of = (userKey: string | null | undefined): SrsUser | undefined => (userKey ? users.value[userKey] : undefined)
  const ensure = (userKey: string): SrsUser => (users.value[userKey] ??= { cards: {}, log: {} })

  function send(input: SrsRateInput) {
    pending++
    chain = chain.then(() => post('/srs/rate', input, 'Не удалось сохранить ответ')).catch((e: Error) => { dirty = true; showToast(e.message, null, 'bad') })
      .then(async () => { if (--pending === 0 && dirty) { dirty = false; await fetchSrs().then((r) => apply(r.users)).catch(() => {}) } })
  }
  /** Записать ответ: новое состояние карточки (null — вернуть в «новые») и +1 / −1 к счётчику дня. */
  function set(userKey: string, cardId: string, state: SrsState | null, day: string, delta: 1 | -1) {
    const u = ensure(userKey); rev++
    if (state) u.cards[cardId] = state; else delete u.cards[cardId]
    u.log[day] = Math.max(0, (u.log[day] ?? 0) + delta)
    if (!isDemo && userKey === session.ownKey) send({ cardId, state: state ? { ...state } : null, date: day, delta })
  }

  /** «Сбросить колоду»: карточки снова «новые» (только у этого пользователя; на сервер — только свой прогресс). */
  function reset(userKey: string, cardIds: string[]) {
    const u = ensure(userKey); rev++
    for (const id of cardIds) delete u.cards[id]
    if (isDemo || userKey !== session.ownKey) return
    pending++
    chain = chain.then(() => post('/srs/reset', { cardIds }, 'Не удалось сбросить колоду')).catch((e: Error) => { dirty = true; showToast(e.message, null, 'bad') })
      .then(async () => { if (--pending === 0 && dirty) { dirty = false; await fetchSrs().then((r) => apply(r.users)).catch(() => {}) } })
  }

  /** Применить ответ сервера (если за время запроса ответов не прибавилось). */
  function apply(all: Record<string, SrsUser>, was?: number) {
    if (was !== undefined && (pending > 0 || rev !== was)) return
    users.value = all
  }
  const getRev = () => rev
  const clear = () => { users.value = {}; rev++ }

  return { users, of, ensure, set, reset, apply, rev: getRev, clear }
})

// Колоды слов вместе с карточками. Преподаватель правит их «на месте», автосохранение (sync.ts) шлёт PUT /decks/<id> / DELETE /decks/<id>.
// Ученик получает с сервера только доступные ему колоды (для всех или назначенные ему). Форма данных — Deck, Card из server/types.ts.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Deck } from '../../server/types'
import { isDemo } from '../firebase'
import { newId } from '../utils/id'
import { del, enc, fetchContent, put } from './api'
import { session } from './session'
import { createDocSync, onHide } from './sync'

export const useDecksStore = defineStore('decks', () => {
  const list = ref<Deck[]>([])
  const byIdRecord = () => Object.fromEntries(list.value.map((d) => [d.id, d]))
  async function reload() { apply((await fetchContent()).decks) }

  const sync = createDocSync<Deck>({ what: 'Колоды', snapshot: byIdRecord, enabled: () => session.canEdit && !isDemo, reload,
    save: (id, d) => put(`/decks/${enc(id)}`, { title: d.title, forAll: d.forAll, assigned: d.assigned, newPerDay: d.newPerDay, source: d.source, cards: d.cards }, 'Не удалось сохранить колоду'),
    remove: (id) => del(`/decks/${enc(id)}`, 'Не удалось удалить колоду') })
  watch(list, sync.touch, { deep: true })
  onHide(sync.flushNow)

  const byId = (id: string | null | undefined) => list.value.find((d) => d.id === id)
  /** Колоды пользователя: преподаватель ('teacher') видит все, ученик — для всех и назначенные ему. */
  const forUser = (userKey: string | null | undefined): Deck[] => userKey === 'teacher' ? list.value : list.value.filter((d) => d.forAll || (!!userKey && d.assigned.includes(userKey)))

  function apply(decks: Deck[], was?: number) {
    if (was !== undefined && !sync.settled(was)) return
    list.value = decks; sync.accept(byIdRecord())
  }
  const rev = () => sync.rev()
  function clear() { list.value = []; sync.accept({}) }

  function add(title: string, url = ''): Deck {
    const id = newId('d')
    list.value.push({ id, title, forAll: false, assigned: [], newPerDay: 20, source: { url, lastSync: null }, cards: [] })
    return byId(id)!
  }
  function remove(deck: Deck) { const i = list.value.findIndex((d) => d.id === deck.id); return i < 0 ? null : { deck: list.value.splice(i, 1)[0], index: i } }
  const restore = ({ deck, index }: { deck: Deck; index: number }) => { list.value.splice(Math.min(index, list.value.length), 0, deck) }

  return { list, byId, forUser, apply, rev, clear, add, remove, restore }
})

<script setup>
// «Слова» = мини-Anki. Одинаковый для преподавателя и ученика; разница в правах:
//  преподаватель (canManage) создаёт колоды (по ссылке на Google Таблицу), правит карточки, назначает колоды ученикам;
//  ученик только учит назначенные ему колоды. Прогресс у каждого свой (stores/srs.ts).
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { deckCounts, buildQueue } from '../composables/useSrs'
import AppIcon from './AppIcon.vue'
import StudySession from './StudySession.vue'
import CardBrowser from './CardBrowser.vue'
import DeckChart from './DeckChart.vue'
import DeckSheet from './DeckSheet.vue'
import { useStudentsStore } from '../stores/students'
import { useDecksStore } from '../stores/decks'
const deckStore = useDecksStore()
const router = useRouter()
const studentStore = useStudentsStore()
const props = defineProps({ userKey: { type: [String, Number], required: true }, canManage: Boolean })

const screen = ref('list'), deckId = ref(null), sheet = ref(null)
const decks = computed(() => deckStore.forUser(props.userKey))
const deck = computed(() => deckStore.byId(deckId.value))
const open = (s, d) => { deckId.value = d.id; screen.value = s }
// Стопка «на сегодня»: сколько карточек ждёт — столько слоёв (толще стопка — больше работы). Сверху — первое слово очереди.
const MAXL = 20
const pile = (d) => { const q = buildQueue(d, props.userKey); return { n: q.length, top: q[0], layers: Math.min(q.length, MAXL) } }
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'карточка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'карточки' : 'карточек')
const back = () => { screen.value = 'list'; deckId.value = null }
const audience = (d) => {
  if (d.forAll) return 'всем ученикам'
  const n = d.assigned.map(id => studentStore.list.find(s => s.id === id)?.name).filter(Boolean)
  return !n.length ? 'никому не назначена' : n.length <= 2 ? n.join(', ') : `${n[0]} и ещё ${n.length - 1}`
}
</script>

<template>
  <div class="page" :class="{ wide: canManage }">
    <StudySession v-if="screen === 'study' && deck" :key="deck.id" :deck="deck" :user-key="userKey" :can-edit="canManage" @finish="back" @exit="back" />
    <DeckChart v-else-if="screen === 'chart' && deck" :deck="deck" :user-key="userKey" @back="back" />
    <CardBrowser v-else-if="screen === 'browse' && deck" :deck="deck" :user-key="userKey" :can-manage="canManage" @back="back" />
    <template v-else>
      <div v-if="canManage" class="top"><button class="btn sm add" @click="sheet = { create: true }"><AppIcon name="plus" :size="16" /> Добавить</button></div>

      <div v-for="d in decks" :key="d.id" class="card deck" title="Учить" @click="open('study', d)">
        <div v-for="p in [pile(d)]" :key="'p'" class="pile" :class="{ none: !p.n }" :style="{ '--l': p.layers }">
          <i v-for="k in Math.max(0, p.layers - 1)" :key="k" class="ly" :style="{ '--k': k - 1 }" />
          <span v-if="p.top" class="face" :style="p.top.image ? { backgroundImage: `url(&quot;${p.top.image}&quot;)` } : null"><b>{{ p.top.front }}</b></span>
          <span v-else class="face done">✓</span>
        </div>
        <div class="info">
          <h3>{{ d.title }}</h3>
          <div class="hint"><b v-if="pile(d).n" class="today">{{ pile(d).n }} {{ word(pile(d).n) }} на сегодня</b><span v-else>на сегодня всё</span> · {{ d.cards.length }} в колоде<template v-if="canManage"> · {{ audience(d) }}</template></div>
        </div>
        <div class="cnt">
          <b class="n" title="Новые" :class="{ z: !deckCounts(d, userKey).new }">{{ deckCounts(d, userKey).new }}</b>
          <b class="l" title="Изучаю" :class="{ z: !deckCounts(d, userKey).learn }">{{ deckCounts(d, userKey).learn }}</b>
          <b class="d" title="К повторению" :class="{ z: !deckCounts(d, userKey).due }">{{ deckCounts(d, userKey).due }}</b>
        </div>
        <div class="acts" @click.stop>
          <button class="ib" aria-label="График колоды" title="График: когда повторять каждое слово" @click="open('chart', d)"><AppIcon name="chart" :size="18" /></button>
          <button class="ib" aria-label="Карточки колоды" title="Карточки" @click="canManage ? router.push({ name: 'cards-studio', query: { id: d.id } }) : open('browse', d)"><AppIcon name="list" :size="18" /></button>
          <button v-if="canManage" class="ib" aria-label="Настройки колоды" title="Настройки" @click="sheet = { deck: d }"><AppIcon name="sliders" :size="18" /></button>
        </div>
      </div>
      <div v-if="!decks.length" class="card hint" style="text-align:center">
        {{ canManage ? 'Колод пока нет. Нажмите «+ Добавить» и вставьте ссылку на Google Таблицу.' : 'Преподаватель пока не добавил вам колоды.' }}
      </div>
    </template>
    <DeckSheet v-if="sheet" :deck="sheet.deck" :create="!!sheet.create" @close="sheet = null" />
  </div>
</template>

<style scoped>
.top { display: flex; justify-content: flex-end }
.add { display: inline-flex; align-items: center; gap: 6px }
/* Стопка карточек: слои сдвинуты вверх-вправо, верхняя — фото первого слова */
.pile { --w: 72px; --h: 48px; --st: 1.7px; --dx: .7px; position: relative; flex: none; width: calc(var(--w) + var(--l) * var(--dx)); height: calc(var(--h) + var(--l) * var(--st)); margin-right: 4px }
.ly, .face { position: absolute; left: 0; bottom: 0; width: var(--w); height: var(--h); border-radius: 6px; background: var(--card); border: 1px solid var(--border) }
.ly { transform: translate(calc(var(--k) * var(--dx)), calc(var(--k) * var(--st) * -1)); border-color: #d5dae0 }
.face { display: flex; align-items: flex-end; overflow: hidden; transform: translate(calc((var(--l) - 1) * var(--dx)), calc((var(--l) - 1) * var(--st) * -1)); background: var(--surface) center / cover no-repeat; box-shadow: 0 2px 6px rgba(0, 0, 0, .14) }
.face b { width: 100%; padding: 10px 6px 4px; font-size: 12px; line-height: 1.1; color: #fff; background: linear-gradient(transparent, rgba(0, 0, 0, .55)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.face:not([style]) { align-items: center; justify-content: center } .face:not([style]) b { color: var(--text); background: none; padding: 0 6px; text-align: center }
.face.done { align-items: center; justify-content: center; color: var(--hint-2); font-size: 20px; background: var(--card); border-style: dashed; box-shadow: none }
.today { color: var(--text) }
.n { color: var(--blue) } .l { color: var(--red) } .d { color: var(--green-d) }
.deck { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; transition: background .12s } .deck:hover { background: var(--surface) } .info { flex: 1; min-width: 0 } .info h3 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cnt { display: flex; gap: 12px; font-size: 18px } .cnt b { min-width: 18px; text-align: center } .cnt b.z { color: var(--hint-2); font-weight: 700 }
.acts { display: flex; align-items: center; gap: 6px }
.ib { border: 1px solid var(--border); background: var(--card); color: var(--hint); border-radius: 12px; padding: 6px 8px; cursor: pointer; display: grid }
@media (max-width: 520px) { .deck { flex-wrap: wrap } .info { flex-basis: calc(100% - 124px) }  .cnt { margin-right: auto } }
</style>

<script setup>
// «Слова» = мини-Anki. Одинаковый для преподавателя и ученика; разница в правах:
//  преподаватель (canManage) создаёт колоды (по ссылке на Google Таблицу), правит карточки, назначает колоды ученикам;
//  ученик только учит назначенные ему колоды. Прогресс у каждого свой (stores/srs.ts).
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { deckCounts, buildQueue } from '../composables/useSrs'
import AppIcon from './AppIcon.vue'
import { showToast } from '../composables/useToast'
import { imageSrc } from '../utils/media'
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
const MAXL = 30
const pile = (d) => { const q = buildQueue(d, props.userKey); return { n: q.length, top: q[0], cards: q.slice(0, MAXL) } }
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'карточка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'карточки' : 'карточек')
// Удаление — сразу, с «Отменить» в уведомлении (как в Telegram), без лишнего окна подтверждения
function removeDeck(d) { const gone = deckStore.remove(d); if (gone) showToast(`Колода удалена: ${d.title}`, () => deckStore.restore(gone)) }
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
        <div class="info">
          <h3>{{ d.title }}<sup class="tot" :title="`В колоде ${d.cards.length}`">{{ d.cards.length }}</sup></h3>
          <div class="hint"><b v-if="pile(d).n" class="today">{{ pile(d).n }} {{ word(pile(d).n) }} на сегодня</b><span v-else>на сегодня всё</span><template v-if="canManage"> · {{ audience(d) }}</template></div>
        </div>
        <!-- Стопка на сегодня: карточки разложены внахлёст слева направо, первая (сверху) — следующее слово.
             Длина ряда = сколько карточек ждёт; больше 30 не рисуем (число — в подписи). -->
        <div v-for="p in [pile(d)]" :key="'p'" class="row-pile" :style="{ '--n': p.cards.length }">
          <span v-for="(c, i) in p.cards" :key="c.id" class="rc" :class="{ top: !i, ph: c.image }" :style="{ '--i': i, zIndex: p.cards.length - i, backgroundImage: c.image ? `url(&quot;${imageSrc(c.image)}&quot;)` : null }">
            <b v-if="!i || !c.image">{{ c.front }}</b></span>
          <span v-if="!p.n" class="rc done">✓</span>
        </div>
        <div class="cnt">
          <b class="n" title="Новые" :class="{ z: !deckCounts(d, userKey).new }">{{ deckCounts(d, userKey).new }}</b>
          <b class="l" title="Изучаю" :class="{ z: !deckCounts(d, userKey).learn }">{{ deckCounts(d, userKey).learn }}</b>
          <b class="d" title="К повторению" :class="{ z: !deckCounts(d, userKey).due }">{{ deckCounts(d, userKey).due }}</b>
        </div>
        <div class="acts" @click.stop>
          <template v-if="canManage">
            <button class="icon-btn" aria-label="Редактировать колоду" title="Редактировать" @click="router.push({ name: 'cards-studio', query: { id: d.id } })"><AppIcon name="pencil" :size="18" /></button>
            <button class="icon-btn danger" aria-label="Удалить колоду" title="Удалить" @click="removeDeck(d)"><AppIcon name="trash" :size="18" /></button>
          </template>
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
/* Ряд карточек внахлёст в середине строки */
.row-pile { --w: 90px; --h: 60px; --step: min(30px, (100% - var(--w)) / max(1, var(--n) - 1)); position: relative; flex: 1; min-width: 80px; height: var(--h) }
.rc { position: absolute; top: 0; left: calc(var(--i) * var(--step)); width: var(--w); height: var(--h); display: flex; align-items: flex-end; overflow: hidden; border-radius: 6px; border: 1.5px solid var(--card); background: var(--surface) center / cover no-repeat; box-shadow: 0 1px 4px rgba(0, 0, 0, .18) }
.rc:not(.ph) { align-items: center; justify-content: center; background-color: #eef0f3 }
.rc b { width: 100%; padding: 0 5px; font-size: 12px; line-height: 1.1; color: var(--text); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.rc.top.ph b { padding: 10px 5px 3px; color: #fff; text-align: left; background: linear-gradient(transparent, rgba(0, 0, 0, .6)) }
.rc:not(.top) b { visibility: hidden }
.rc.done { position: static; align-items: center; justify-content: center; color: var(--hint-2); font-size: 18px; background: var(--card); border: 1px dashed var(--border); box-shadow: none }
.today { color: var(--text) }
.tot { margin-left: 6px; font-size: 12px; font-weight: 800; color: var(--hint-2); vertical-align: super }
.n { color: var(--blue) } .l { color: var(--red) } .d { color: var(--green-d) }
.deck { display: flex; align-items: center; gap: 12px; padding: 10px 16px; cursor: pointer; transition: background .12s } .deck:hover { background: var(--surface) } .info { flex: none; width: 260px; min-width: 0 } .info h3 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cnt { display: flex; gap: 12px; font-size: 18px } .cnt b { min-width: 18px; text-align: center } .cnt b.z { color: var(--hint-2); font-weight: 700 }
.acts { display: flex; align-items: center; gap: 6px }
@media (max-width: 520px) { .deck { flex-wrap: wrap } .info { flex-basis: 100% } .row-pile { flex-basis: 100% }  .cnt { margin-right: auto } }
</style>

<script setup>
// «Слова» = мини-Anki. Одинаковый для преподавателя и ученика; разница в правах:
//  преподаватель (canManage) создаёт колоды (по ссылке на Google Таблицу), правит карточки, назначает колоды ученикам;
//  ученик только учит назначенные ему колоды. Прогресс у каждого свой (stores/srs.ts).
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { deckCounts, deckForecast } from '../composables/useSrs'
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
const DAY = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const fc = (d) => {                                         // мини-график «что подходит» на 14 дней — видно без захода в колоду
  const f = deckForecast(d, props.userKey, 14), max = Math.max(1, ...f.map(x => x.n)), week = f.slice(0, 7).reduce((a, x) => a + x.n, 0)
  return { bars: f.map((x, i) => ({ ...x, h: x.n ? 4 + Math.round(x.n / max * 22) : 2, day: i ? DAY[new Date(x.date + 'T00:00').getDay()] : 'сегодня' })), week, today: f[0].n }
}
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
          <h3>{{ d.title }}</h3>
          <div class="hint">{{ d.cards.length }} карт.<template v-if="canManage"> · {{ audience(d) }}</template></div>
        </div>
        <div v-for="f in [fc(d)]" :key="'f'" class="fc" :title="`Подойдут к повторению: сегодня ${f.today}, за 7 дней ${f.week}`">
          <div class="fb"><i v-for="(b, i) in f.bars" :key="b.date" :class="{ t: !i, z: !b.n }" :style="{ height: b.h + 'px' }" :title="`${b.day}: ${b.n}`" /></div>
          <small>{{ f.week ? `${f.week} за неделю` : 'на неделе пусто' }}</small>
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
.n { color: var(--blue) } .l { color: var(--red) } .d { color: var(--green-d) }
.deck { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; transition: background .12s } .deck:hover { background: var(--surface) } .info { flex: 1; min-width: 0 } .info h3 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cnt { display: flex; gap: 12px; font-size: 18px } .cnt b { min-width: 18px; text-align: center } .cnt b.z { color: var(--hint-2); font-weight: 700 }
.fc { flex: none; display: grid; justify-items: end; gap: 3px; width: 150px }
.fb { display: flex; align-items: flex-end; gap: 2px; height: 26px; width: 100% }
.fb i { flex: 1; border-radius: 2px; background: var(--blue); opacity: .55 } .fb i.t { opacity: 1 } .fb i.z { background: var(--border); opacity: 1 }
.fc small { font-size: 11px; font-weight: 700; color: var(--hint) }
.acts { display: flex; align-items: center; gap: 6px }
.ib { border: 1px solid var(--border); background: var(--card); color: var(--hint); border-radius: 12px; padding: 6px 8px; cursor: pointer; display: grid }
@media (max-width: 520px) { .deck { flex-wrap: wrap } .info { flex-basis: 100% } .fc { display: none } .cnt { margin-right: auto } }
</style>

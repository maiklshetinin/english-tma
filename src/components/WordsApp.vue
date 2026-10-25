<script setup>
// «Слова» = мини-Anki. Одинаковый для преподавателя и ученика; разница в правах:
//  преподаватель (canManage) создаёт колоды (по ссылке на Google Таблицу), правит карточки, назначает колоды ученикам;
//  ученик только учит назначенные ему колоды. Прогресс у каждого свой (state.srs[userKey]).
import { ref, computed } from 'vue'
import { state, decksFor } from '../store/mock'
import { deckCounts, userStats } from '../composables/useSrs'
import AppIcon from './AppIcon.vue'
import StudySession from './StudySession.vue'
import CardBrowser from './CardBrowser.vue'
import DeckSheet from './DeckSheet.vue'
const props = defineProps({ userKey: { type: [String, Number], required: true }, canManage: Boolean })

const screen = ref('list'), deckId = ref(null), sheet = ref(null)
const decks = computed(() => decksFor(props.userKey))
const deck = computed(() => state.decks.find(d => d.id === deckId.value))
const stats = computed(() => userStats(props.userKey, decks.value))
const max = computed(() => Math.max(1, ...stats.value.week.map(w => w.n)))
const open = (s, d) => { deckId.value = d.id; screen.value = s }
const back = () => { screen.value = 'list'; deckId.value = null }
const DAY = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const dayName = (d) => DAY[new Date(d + 'T00:00').getDay()]
const audience = (d) => {
  if (d.forAll) return 'всем ученикам'
  const n = d.assigned.map(id => state.students.find(s => s.id === id)?.name).filter(Boolean)
  return !n.length ? 'никому не назначена' : n.length <= 2 ? n.join(', ') : `${n[0]} и ещё ${n.length - 1}`
}
</script>

<template>
  <div class="page" :class="{ wide: canManage }">
    <StudySession v-if="screen === 'study' && deck" :key="deck.id" :deck="deck" :user-key="userKey" :can-edit="canManage" @finish="back" @exit="back" />
    <CardBrowser v-else-if="screen === 'browse' && deck" :deck="deck" :user-key="userKey" :can-manage="canManage" @back="back" />
    <template v-else>
      <div class="card stats">
        <div class="nums">
          <div><b>{{ stats.today }}</b><span class="hint">ответов сегодня</span></div>
          <div><b>{{ stats.learned }}<small>/{{ stats.total }}</small></b><span class="hint">слов начато</span></div>
          <div><b>{{ stats.mature }}</b><span class="hint">выучено (21+ дн.)</span></div>
        </div>
        <div class="bars" aria-label="Ответы за 7 дней">
          <div v-for="w in stats.week" :key="w.date" class="bw"><i :style="{ height: Math.max(4, w.n / max * 44) + 'px' }" :class="{ z: !w.n }" :title="w.n + ' ответов'" /><small>{{ dayName(w.date) }}</small></div>
        </div>
      </div>

      <div class="row">
        <div class="legend"><span class="n">Новые</span><span class="l">Изучаю</span><span class="d">К повторению</span></div>
        <button v-if="canManage" class="btn sm" @click="sheet = { create: true }"><AppIcon name="plus" :size="16" /> Колода</button>
      </div>

      <div v-for="d in decks" :key="d.id" class="card deck">
        <div class="info">
          <h3>{{ d.title }}</h3>
          <div class="hint">{{ d.cards.length }} карт.<template v-if="canManage"> · {{ audience(d) }}</template></div>
        </div>
        <div class="cnt">
          <b class="n" :class="{ z: !deckCounts(d, userKey).new }">{{ deckCounts(d, userKey).new }}</b>
          <b class="l" :class="{ z: !deckCounts(d, userKey).learn }">{{ deckCounts(d, userKey).learn }}</b>
          <b class="d" :class="{ z: !deckCounts(d, userKey).due }">{{ deckCounts(d, userKey).due }}</b>
        </div>
        <div class="acts">
          <button class="btn sm" @click="open('study', d)">Учить</button>
          <button class="ib" aria-label="Карточки колоды" title="Карточки" @click="open('browse', d)"><AppIcon name="list" :size="18" /></button>
          <button v-if="canManage" class="ib" aria-label="Настройки колоды" title="Настройки" @click="sheet = { deck: d }"><AppIcon name="sliders" :size="18" /></button>
        </div>
      </div>
      <div v-if="!decks.length" class="card hint" style="text-align:center">
        {{ canManage ? 'Колод пока нет. Нажмите «+ Колода» и вставьте ссылку на Google Таблицу.' : 'Преподаватель пока не добавил вам колоды.' }}
      </div>
    </template>
    <DeckSheet v-if="sheet" :deck="sheet.deck" :create="!!sheet.create" @close="sheet = null" />
  </div>
</template>

<style scoped>
.stats { display: grid; gap: 14px } .nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center }
.nums b { display: block; font-size: 24px; line-height: 1.1 } .nums small { font-size: 14px; color: var(--hint-2) } .nums .hint { font-size: 12px }
.bars { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; height: 64px }
.bw { flex: 1; display: grid; justify-items: center; gap: 3px } .bw i { display: block; width: 100%; max-width: 28px; border-radius: 6px 6px 3px 3px; background: var(--green) } .bw i.z { background: var(--border) } .bw small { font-size: 11px; color: var(--hint-2); font-weight: 800 }
.legend { display: flex; gap: 14px; font-size: 13px; font-weight: 900 }
.n { color: var(--blue) } .l { color: var(--red) } .d { color: var(--green-d) }
.deck { display: flex; align-items: center; gap: 12px; padding: 14px 16px } .info { flex: 1; min-width: 0 } .info h3 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.cnt { display: flex; gap: 12px; font-size: 18px } .cnt b { min-width: 18px; text-align: center } .cnt b.z { color: var(--hint-2); font-weight: 700 }
.acts { display: flex; align-items: center; gap: 6px }
.ib { border: 2px solid var(--border); background: var(--card); color: var(--hint); border-radius: 12px; padding: 6px 8px; cursor: pointer; display: grid }
@media (max-width: 520px) { .deck { flex-wrap: wrap } .info { flex-basis: 100% } .cnt { margin-right: auto } }
</style>

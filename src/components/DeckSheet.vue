<script setup>
// Шторка преподавателя: создание колоды по ссылке на Google Таблицу или настройки существующей
// (название, лимит новых в день, кому назначена, синхронизация, удаление).
import { ref, computed } from 'vue'
import { showToast } from '../composables/useToast'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import SheetLink from './SheetLink.vue'
import { useStudentsStore } from '../stores/students'
import { useDecksStore } from '../stores/decks'
const deckStore = useDecksStore()
const studentStore = useStudentsStore()
const props = defineProps({ deck: Object, create: Boolean })
const emit = defineEmits(['close'])
const d = ref(props.deck || null), name = ref(''), url = ref(''), auto = ref(false), sure = ref(false)

function createDeck() {
  const link = url.value.trim()
  d.value = deckStore.add(name.value.trim() || 'Новая колода', link)
  auto.value = !!link                                  // с ссылкой — сразу подтягиваем слова
}
const has = (id) => d.value.assigned.includes(id)
// Выбор учеников — сеткой по 4, как «Поделиться» в Telegram; поиск по имени и нику
const wq = ref('')
const whoList = computed(() => { const k = wq.value.trim().toLowerCase().replace(/^@/, ''); return studentStore.list.filter(s => !k || (s.name + ' ' + (s.username || '')).toLowerCase().includes(k)) })
const toggle = (id) => { const a = d.value.assigned; const i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id) }
function remove() {
  const gone = deckStore.remove(d.value); emit('close')
  showToast(`Колода удалена: ${gone.deck.title}`, () => deckStore.restore(gone))
}
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')">
    <div class="sheet-box" role="dialog" aria-modal="true">
      <template v-if="!d">
        <h2 style="margin:0">Новая колода</h2>
        <p class="hint" style="margin:0">Вставьте ссылку на Google Таблицу — слова загрузятся сами. Ссылку можно добавить и позже.</p>
        <label class="lab">Название</label><input v-model="name" placeholder="Например, Travel" @keyup.enter="createDeck" />
        <label class="lab">Ссылка на Google Таблицу</label><input v-model="url" placeholder="https://docs.google.com/spreadsheets/d/…" @keyup.enter="createDeck" />
        <button class="btn" @click="createDeck">Создать колоду</button>
        <button class="btn ghost" style="color:var(--hint)" @click="emit('close')">Отмена</button>
      </template>
      <template v-else>
        <h2 style="margin:0">Колода</h2>
        <label class="lab">Название</label><input v-model="d.title" />
        <label class="lab">Новых карточек в день</label><input v-model.number="d.newPerDay" type="number" min="0" max="500" />
        <label class="lab">Кому назначена</label>
        <label class="chk"><input v-model="d.forAll" type="checkbox" /> Всем ученикам</label>
        <template v-if="!d.forAll">
          <div class="wbox">
            <label class="wsearch"><AppIcon name="search" :size="16" /><input v-model="wq" placeholder="Поиск ученика" aria-label="Поиск ученика" /><span class="wn">{{ d.assigned.length }} выбрано</span></label>
            <div class="wgrid">
              <button v-for="s in whoList" :key="s.id" class="who" :class="{ on: has(s.id) }" :aria-pressed="has(s.id)" :title="s.name" @click="toggle(s.id)">
                <span class="wa"><Avatar :s="s" :size="56" /><i v-if="has(s.id)" class="ok"><AppIcon name="check" :size="14" /></i></span><b>{{ s.name }}</b>
              </button>
              <p v-if="!whoList.length" class="hint" style="grid-column:1/-1;text-align:center;margin:8px 0">Никого не нашли</p>
            </div>
          </div>
          <p class="hint" style="margin:0">Ученика можно добавить и из его профиля.</p>
        </template>
        <SheetLink :deck="d" :auto="auto" />
        <button v-if="!sure" class="btn ghost" style="color:var(--red)" @click="sure = true"><AppIcon name="trash" :size="16" /> Удалить колоду</button>
        <button v-else class="btn danger" @click="remove">Точно удалить ({{ d.cards.length }} карт.)</button>
        <button class="btn" @click="emit('close')">Готово</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.chk { display: flex; align-items: center; gap: 10px; font-weight: 800 } .chk input { width: auto; margin: 0 }
/* Выбор учеников — как «Поделиться» в Telegram: поиск сверху, сетка 4 в ряд с прокруткой, выбранный — зелёное кольцо и галочка */
.wbox { display: grid; border: 2px solid var(--border); border-radius: 16px; overflow: hidden }
.wsearch { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--border); color: var(--hint-2) }
.wsearch input { flex: 1; margin: 0; padding: 10px 0; border: 0; border-radius: 0; background: none } .wsearch input:focus { background: none } .wsearch input:focus-visible { outline: none }
.wn { flex: none; font-size: 12px; font-weight: 800; color: var(--green-d) }
.wgrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 2px; max-height: 320px; overflow-y: auto; padding: 10px 6px; overscroll-behavior: contain }
.who { display: grid; justify-items: center; align-content: start; gap: 5px; padding: 4px 2px; border: 0; border-radius: 14px; background: none; color: var(--text); font: inherit; cursor: pointer; min-width: 0 }
.who:hover { background: var(--surface) }
.wa { position: relative; display: grid; border-radius: 50%; padding: 3px; box-shadow: inset 0 0 0 2px transparent; transition: box-shadow .12s }
.who.on .wa { box-shadow: inset 0 0 0 3px var(--green) }
.ok { position: absolute; right: 0; bottom: 0; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--green); color: #fff; box-shadow: 0 0 0 2px var(--card) }
.who b { width: 100%; font-size: 12px; font-weight: 700; line-height: 1.2; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word }
.who.on b { color: var(--green-d) }
</style>

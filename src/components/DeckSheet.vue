<script setup>
// Шторка преподавателя: создание колоды по ссылке на Google Таблицу или настройки существующей
// (название, лимит новых в день, кому назначена, синхронизация, удаление).
import { ref } from 'vue'
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
          <button v-for="s in studentStore.list" :key="s.id" class="who" :class="{ on: has(s.id) }" @click="toggle(s.id)">
            <Avatar :s="s" :size="28" /><b>{{ s.name }}</b><AppIcon v-if="has(s.id)" name="check" :size="18" />
          </button>
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
.who { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; border: 2px solid var(--border); border-radius: 12px; background: var(--card); color: var(--text); font: inherit; text-align: left; cursor: pointer }
.who b { flex: 1 } .who.on { border-color: var(--green); background: var(--green-l); color: var(--green-d) }
</style>

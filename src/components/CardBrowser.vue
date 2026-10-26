<script setup>
// «Обозреватель» карточек колоды (как Browse в Anki): поиск, фильтр по состоянию, статус для данного пользователя.
// Преподаватель (canManage) может добавлять, править, скрывать и удалять карточки.
import { ref, reactive, computed } from 'vue'
import { relDay } from '../store/app'
import { newId } from '../utils/id'
import { srsOf, kindOf, today } from '../composables/useSrs'
import { showToast } from '../composables/useToast'
import AppIcon from './AppIcon.vue'
import CardEditor from './CardEditor.vue'
const props = defineProps({ deck: { type: Object, required: true }, userKey: { type: [String, Number], required: true }, canManage: Boolean })
defineEmits(['back'])

const q = ref(''), filter = ref('all'), edit = ref(null)
const f = reactive({ front: '', back: '', example: '' })
const FILTERS = [['all', 'Все'], ['new', 'Новые'], ['learn', 'Изучаю'], ['due', 'К повтору']]
function status(c) {
  const s = srsOf(props.userKey, c)
  if (c.suspended) return { t: 'Скрыта', cls: 'warn', k: 'susp' }
  const k = kindOf(s)
  if (k === 'new') return { t: 'Новая', cls: 'new', k }
  if (k === 'learn') return { t: 'Изучаю', cls: 'bad', k }
  return s.due <= today() ? { t: 'К повторению', cls: 'ok', k: 'due' } : { t: relDay(s.due), cls: '', k }
}
const rows = computed(() => {
  const k = q.value.trim().toLowerCase()
  return props.deck.cards.filter(c => (!k || (c.front + ' ' + c.back + ' ' + (c.example || '')).toLowerCase().includes(k))
    && (filter.value === 'all' || status(c).k === filter.value))
})
function add() {
  if (!f.front.trim() || !f.back.trim()) return
  props.deck.cards.push({ id: newId('c'), front: f.front.trim(), back: f.back.trim(), example: f.example.trim() })
  f.front = f.back = f.example = ''
}
function del(c) {
  const i = props.deck.cards.findIndex(x => x.id === c.id); if (i < 0) return
  const [gone] = props.deck.cards.splice(i, 1); edit.value = null
  showToast(`Карточка удалена: ${gone.front}`, () => props.deck.cards.splice(Math.min(i, props.deck.cards.length), 0, gone))
}
</script>

<template>
  <div class="cb">
    <div class="row">
      <button class="btn ghost sm" @click="$emit('back')"><AppIcon name="back" :size="18" /> Колоды</button>
      <b class="dt">{{ deck.title }} · {{ deck.cards.length }}</b>
    </div>
    <div v-if="canManage" class="card">
      <h3>Добавить карточку</h3>
      <div class="row2"><input v-model="f.front" placeholder="Слово" style="flex:1;margin:0" @keyup.enter="add" /><input v-model="f.back" placeholder="Перевод" style="flex:1;margin:0" @keyup.enter="add" /></div>
      <input v-model="f.example" placeholder="Пример (необязательно)" style="margin-top:10px" @keyup.enter="add" />
      <button class="btn" :disabled="!f.front.trim() || !f.back.trim()" @click="add">Добавить</button>
    </div>
    <div class="card list">
      <label class="search"><AppIcon name="search" :size="16" /><input v-model="q" placeholder="Поиск по карточкам…" aria-label="Поиск по карточкам" /></label>
      <div class="seg fl"><button v-for="x in FILTERS" :key="x[0]" :class="{ on: filter === x[0] }" @click="filter = x[0]">{{ x[1] }}</button></div>
      <div v-for="c in rows" :key="c.id" class="r" :class="{ off: c.suspended }">
        <div class="tx"><b>{{ c.front }}</b> — {{ c.back }}<div v-if="c.example" class="hint">{{ c.example }}</div></div>
        <span class="badge" :class="status(c).cls">{{ status(c).t }}</span>
        <template v-if="canManage">
          <button class="ib" :aria-label="c.suspended ? 'Показать карточку' : 'Скрыть карточку'" :title="c.suspended ? 'Вернуть в обучение' : 'Скрыть из обучения'" @click="c.suspended = !c.suspended"><AppIcon name="lock" :size="16" /></button>
          <button class="ib" aria-label="Править" @click="edit = c"><AppIcon name="pencil" :size="16" /></button>
        </template>
      </div>
      <p v-if="!rows.length" class="hint" style="text-align:center;margin:8px 0">{{ deck.cards.length ? 'Ничего не найдено' : 'В колоде пока нет карточек' }}</p>
    </div>
    <CardEditor v-if="edit" :card="edit" deletable @close="edit = null" @delete="del(edit)" />
  </div>
</template>

<style scoped>
.cb { display: grid; gap: 14px } .dt { font-size: 17px }
.list { display: grid; gap: 10px }
.search { display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 2px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--hint-2) }
.search:focus-within { border-color: var(--blue); background: var(--card) } .search input { border: 0; background: none; margin: 0; padding: 9px 0; min-width: 0 }
.fl { flex-wrap: wrap; justify-self: start }
.r { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 2px solid var(--surface) } .r.off { opacity: .55 }
.tx { flex: 1; min-width: 0; overflow-wrap: anywhere }
.badge.new { background: var(--blue-l); color: var(--blue-d) }
.ib { border: 2px solid var(--border); background: var(--card); color: var(--hint); border-radius: 10px; padding: 5px 7px; cursor: pointer; display: grid }
</style>

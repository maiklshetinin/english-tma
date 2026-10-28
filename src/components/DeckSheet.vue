<script setup>
// Шторка преподавателя: создание колоды по ссылке на Google Таблицу или настройки существующей
// (название, лимит новых в день, кому назначена, синхронизация, удаление).
import { ref, computed } from 'vue'
import { showToast } from '../composables/useToast'
import AvatarStack from './AvatarStack.vue'
import AppIcon from './AppIcon.vue'
import SheetLink from './SheetLink.vue'
import StudentGrid from './StudentGrid.vue'
import { useGroups } from '../composables/useGroups'
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
// Выбор учеников — строка «Кому назначена ›» открывает отдельную страницу окна: поиск и сетка как в панели учеников
// (группы подложкой, меню группы — вся или по одному), выбранные — с зелёной галочкой
const wq = ref(''), page = ref('main')
const chosen = computed(() => d.value ? studentStore.list.filter(s => d.value.assigned.includes(s.id)) : [])
const step = (n) => { d.value.newPerDay = Math.min(500, Math.max(0, (Number(d.value.newPerDay) || 0) + n)) }
const groups = useGroups()
const whoMatch = (s) => { const k = wq.value.trim().toLowerCase().replace(/^@/, ''); return !k || (s.name + ' ' + (s.username || '')).toLowerCase().includes(k) }
const whoGroups = computed(() => groups.value.filter(g => g.members.some(whoMatch)))
const whoSolo = computed(() => { const inGroup = new Set(groups.value.flatMap(g => g.members.map(m => m.id))); return studentStore.list.filter(s => !inGroup.has(s.id) && whoMatch(s)) })
// «Вся группа»: все выбраны — снять всех, иначе — выбрать недостающих
const toggleGroup = (g) => { const a = d.value.assigned, ids = g.members.map(m => m.id); if (ids.every(id => a.includes(id))) d.value.assigned = a.filter(id => !ids.includes(id)); else for (const id of ids) if (!a.includes(id)) a.push(id) }
const toggle = (id) => { const a = d.value.assigned; const i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id) }
function remove() {
  const gone = deckStore.remove(d.value); emit('close')
  showToast(`Колода удалена: ${gone.deck.title}`, () => deckStore.restore(gone))
}
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')">
    <!-- Компактно, как настройки в Telegram: шапка с названием, строки с иконками, выбор учеников — отдельной страницей, опасное — красным внизу -->
    <div class="sheet-box ds" role="dialog" aria-modal="true">
      <template v-if="!d">
        <div class="hd"><b>Новая колода</b><button class="x" aria-label="Закрыть" @click="emit('close')"><AppIcon name="x" :size="18" /></button></div>
        <div class="sec">
          <div class="r"><span class="ic"><AppIcon name="cards" :size="20" /></span><input v-model="name" class="in" placeholder="Название, например Travel" @keyup.enter="createDeck" /></div>
          <div class="r"><span class="ic sh"><AppIcon name="sheet" :size="20" /></span><input v-model="url" class="in" placeholder="Ссылка на Google Таблицу (можно позже)" @keyup.enter="createDeck" /></div>
        </div>
        <div class="ft"><button class="lnk grey" @click="emit('close')">Отмена</button><button class="lnk" @click="createDeck">Создать</button></div>
      </template>

      <template v-else-if="page === 'who'">
        <div class="hd"><button class="x" aria-label="Назад" @click="page = 'main'; wq = ''"><AppIcon name="back" :size="18" /></button><b>Кому назначить</b><span class="wn">{{ d.forAll ? 'все' : d.assigned.length + ' выбрано' }}</span></div>
        <label class="r tap"><span class="ic"><AppIcon name="users" :size="20" /></span><span class="lb">Всем ученикам</span><input v-model="d.forAll" type="checkbox" class="sw" role="switch" /></label>
        <label class="psearch"><AppIcon name="search" :size="16" /><input v-model="wq" placeholder="Поиск" aria-label="Поиск ученика" /></label>
        <!-- Как панель учеников: группы подложкой (нажатие — меню: вся группа или по одному), выбранные — с зелёной галочкой -->
        <div class="plist">
          <StudentGrid :groups="whoGroups" :students="whoSolo" :selected="d.forAll ? studentStore.list.map(s => s.id) : d.assigned" :disabled="d.forAll" all-label="Вся группа" @pick="toggle" @group="toggleGroup" />
          <p v-if="!whoGroups.length && !whoSolo.length" class="none">Никого не нашли</p>
        </div>
        <div class="ft"><span /><button class="lnk" @click="page = 'main'; wq = ''">Готово</button></div>
      </template>

      <template v-else>
        <div class="hd">
          <span class="dicon"><AppIcon name="cards" :size="22" /></span>
          <div class="tt"><input v-model="d.title" class="title" aria-label="Название колоды" /><small>{{ d.cards.length }} карт. · {{ d.forAll ? 'всем ученикам' : d.assigned.length ? `${d.assigned.length} учен.` : 'никому не назначена' }}</small></div>
          <button class="x" aria-label="Закрыть" @click="emit('close')"><AppIcon name="x" :size="18" /></button>
        </div>

        <div class="sec">
          <div class="r"><span class="ic"><AppIcon name="plus" :size="20" /></span><span class="lb">Новых карточек в день</span>
            <span class="stp"><button aria-label="Меньше" @click="step(-5)">−</button><input v-model.number="d.newPerDay" type="number" min="0" max="500" aria-label="Новых карточек в день" /><button aria-label="Больше" @click="step(5)">+</button></span></div>
          <!-- Одна строка: выбранные — аватарками, сам выбор — на отдельной странице окна -->
          <button class="r tap" @click="page = 'who'"><span class="ic"><AppIcon name="users" :size="20" /></span><span class="lb">Кому назначена</span>
            <AvatarStack v-if="!d.forAll && chosen.length" :students="chosen" :size="26" :max="4" />
            <span class="val">{{ d.forAll ? 'всем ученикам' : chosen.length ? '' : 'никому' }}</span><span class="chev">›</span></button>
          <div class="r sl"><SheetLink :deck="d" :auto="auto" /></div>
        </div>

        <div class="ft">
          <button v-if="!sure" class="lnk red" @click="sure = true"><AppIcon name="trash" :size="15" /> Удалить</button>
          <button v-else class="lnk red on" @click="remove">Точно удалить ({{ d.cards.length }} карт.)?</button>
          <button class="lnk" @click="emit('close')">Готово</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Окно как настройки в Telegram: узкое, без внешних отступов, строки 44px с иконкой слева */
.sheet-box.ds { max-width: 440px; padding: 0; gap: 0; display: block; overflow-y: auto }
.hd { display: flex; align-items: center; gap: 12px; padding: 14px 10px 12px 16px; border-bottom: 1px solid var(--border) }
.hd > b { flex: 1; font-size: 18px }
.dicon { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--green); color: #fff }
.tt { flex: 1; display: grid; min-width: 0 } .tt small { font-size: 12px; font-weight: 600; color: var(--hint) }
.title { margin: 0; padding: 2px 0; border: 0; border-bottom: 1px dashed transparent; border-radius: 0; background: none; font-size: 18px; font-weight: 800 }
.title:hover { border-bottom-color: var(--border) } .title:focus { background: none; border-bottom-color: var(--hint-2) } .title:focus-visible { outline: none }
.x { flex: none; align-self: flex-start; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .x:hover { background: var(--surface) }
.sec { display: grid; padding: 4px 0 }
.r { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 46px; padding: 4px 14px 4px 16px; border: 0; background: none; font: inherit; color: var(--text); text-align: left }
.r.tap { cursor: pointer } .r.tap:hover { background: var(--surface) }
.ic { flex: none; display: grid; place-items: center; width: 28px; color: var(--hint) } .ic.sh { color: var(--green-d) }
.lb { flex: 1; font-size: 15px; font-weight: 700 } .val { font-size: 14px; font-weight: 600; color: var(--blue) }
.chev { font-size: 20px; color: var(--hint-2); }
.in { flex: 1; margin: 0; padding: 8px 10px; font-size: 14px; border-width: 1px; border-radius: 10px }
.stp { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 10px; overflow: hidden }
.stp button { width: 30px; height: 30px; border: 0; background: var(--surface); color: var(--text); font: inherit; font-size: 17px; font-weight: 900; cursor: pointer } .stp button:hover { background: var(--blue-l); color: var(--blue) }
.stp input { width: 46px; margin: 0; padding: 4px 0; border: 0; border-radius: 0; background: var(--card); text-align: center; font-size: 14px; -moz-appearance: textfield }
.stp input::-webkit-outer-spin-button, .stp input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0 }
/* Переключатель как в Telegram */
.sw { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 38px; height: 22px; margin: 0; padding: 0; border: 0; border-radius: 99px; background: var(--border); cursor: pointer; transition: background .15s }
.sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .15s }
.sw:checked { background: var(--blue) } .sw:checked::after { transform: translateX(16px) }
.r.sl { display: block; padding-top: 8px; padding-bottom: 8px; border-top: 1px solid var(--border) }
.ft { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--border) }
.lnk { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border: 0; border-radius: 10px; background: none; font: inherit; font-size: 15px; font-weight: 800; color: var(--blue); cursor: pointer }
.lnk:hover { background: var(--surface) } .lnk.grey { color: var(--hint) } .lnk.red { color: var(--red-d); font-size: 14px } .lnk.red.on { background: var(--red); color: #fff }
/* Страница выбора учеников: поиск, список с аватарками, круглая галочка справа */
.wn { flex: none; font-size: 12px; font-weight: 800; color: var(--green-d) }
.psearch { display: flex; align-items: center; gap: 10px; padding: 0 16px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); color: var(--hint-2) }
.psearch input { flex: 1; margin: 0; padding: 10px 0; border: 0; border-radius: 0; background: none; font-size: 14px } .psearch input:focus { background: none }
.plist { display: grid; max-height: 360px; overflow-y: auto; padding: 8px 10px 10px } .none { margin: 8px 0; text-align: center; font-size: 13px; color: var(--hint) }
.hd .wn { margin-left: auto; padding-right: 8px }
</style>

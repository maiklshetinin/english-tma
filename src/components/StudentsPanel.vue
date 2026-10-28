<script setup>
// Список учеников — компактная сетка кружков (как «Поделиться» в Telegram): аватарка, имя под ней.
// Кружок можно перетащить в таблицу, группу — только целиком (урок сразу всей группе); урок из таблицы, брошенный сюда, снимается с расписания.
// Группы — сверху отдельными блоками: ученики, которые вместе стоят в групповом уроке (по расписанию), подпись — день и время урока.
// Ниже — «Индивидуально»: остальные по алфавиту.
import { ref, computed } from 'vue'
import { isOnline } from '../utils/online'
import { useRouter } from 'vue-router'
import { handle } from '../store/app'
import { useGroups } from '../composables/useGroups'
import { dnd, pressStart } from '../composables/useDnd'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import AddStudent from './AddStudent.vue'
import { useStudentsStore } from '../stores/students'
const studentStore = useStudentsStore()
const q = ref('')
const adding = ref(false)                       // «+» — форма «Новый ученик» в шторке (та же, что во вкладке «Ученики»)
const list = computed(() => { const k = q.value.trim().toLowerCase(); return studentStore.list.filter(s => !k || (s.name + ' ' + (s.username || '')).toLowerCase().includes(k)) })
const groups = useGroups()                     // группы по расписанию (composables/useGroups)
const match = (s) => { const k = q.value.trim().toLowerCase(); return !k || (s.name + ' ' + (s.username || '')).toLowerCase().includes(k) }
const shownGroups = computed(() => groups.value.map(g => ({ ...g, members: g.members.filter(match) })).filter(g => g.members.length))
const solo = computed(() => { const inGroup = new Set(groups.value.flatMap(g => g.members.map(s => s.id))); return list.value.filter(s => !inGroup.has(s.id)) })
const trash = computed(() => dnd.active && dnd.payload?.kind === 'lesson')
const trashOver = computed(() => trash.value && dnd.over?.kind === 'panel')
const router = useRouter()
const open = (id) => { router.push({ name: 'home', params: { id } }) }      // панель живёт на «Главной»: карточка открывается там же
</script>

<template>
  <aside class="panel card" :class="{ trash, over: trashOver }" data-drop="panel">
    <header class="ph">
      <label class="search"><AppIcon name="search" :size="16" /><input v-model="q" :placeholder="`Поиск · ${studentStore.list.length} учеников`" aria-label="Поиск ученика" /></label>
      <button class="addb" title="Добавить ученика" aria-label="Добавить ученика" @click="adding = true"><AppIcon name="plus" :size="18" /></button></header>
    <div class="list">
      <!-- Одна сетка на 4 колонки: группа занимает столько колонок, сколько в ней учеников; остальные ученики заполняют свободные клетки рядом -->
      <div class="mix">
      <section v-for="g in shownGroups" :key="g.key" class="grp" :style="{ '--n': Math.min(4, g.members.length) }" :title="`Группа · ${g.label} — перетащите в таблицу, чтобы назначить урок всей группе`"
        @pointerdown="pressStart($event, { kind: 'student', ids: g.members.map(m => m.id) })" @dragstart.prevent>
        <i class="gi" aria-hidden="true"><AppIcon name="users" :size="10" /></i>
        <div class="tiles">
          <div v-for="s in g.members" :key="s.id" class="st" role="button" tabindex="0" :title="`${s.name}${handle(s) ? ' · ' + handle(s) : ''}`" :aria-label="`${s.name}, группа ${g.label}. Группа перетаскивается целиком`"
            @click="open(s.id)" @keydown.enter="open(s.id)">
            <span class="ava"><Avatar :s="s" :size="54" :online="isOnline(s)" /></span><span class="nm">{{ s.name }}</span>
          </div>
        </div>
      </section>
      <div v-for="s in solo" :key="s.id" class="st solo" role="button" tabindex="0" :title="`${s.name}${handle(s) ? ' · ' + handle(s) : ''}`" :aria-label="`${s.name}. Перетащите в таблицу, чтобы назначить урок`"
        @pointerdown="pressStart($event, { kind: 'student', ids: [s.id] })" @click="open(s.id)" @keydown.enter="open(s.id)" @dragstart.prevent>
        <span class="ava"><Avatar :s="s" :size="54" :online="isOnline(s)" /></span><span class="nm">{{ s.name }}</span>
      </div>
      </div>
      <p v-if="!list.length" class="hint empty">Никого не нашли</p>
    </div>
    <Teleport to="body"><div v-if="adding" class="sheet-bg" @click.self="adding = false"><div class="sheet-box"><AddStudent @close="adding = false" /></div></div></Teleport>
    <div v-if="trash" class="drophint"><AppIcon name="trash" :size="22" />Отпустите, чтобы снять урок</div>
  </aside>
</template>

<style scoped>
/* Высота — по содержимому (не на весь экран); если учеников много — список прокручивается внутри */
.panel { position: relative; padding: 0 0 6px; display: grid; grid-template-rows: auto minmax(0, 1fr); max-height: 100%; overflow: hidden }
/* Верх панели: поиск и «+» в одну строку, без заголовка */
.ph { display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px }
.addb { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 10px; background: var(--card); color: var(--green-d); cursor: pointer }
.addb:hover { border-color: var(--green); background: var(--green-l) }
.search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; margin: 0; padding: 0 12px; border: 2px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--hint-2) }
.search:focus-within { border-color: var(--hint-2); background: var(--card) } .search input { border: 0; background: none; margin: 0; padding: 7px 0; min-width: 0; font-size: 14px }
.search input:focus-visible { outline: none }      /* рамку при фокусе даёт сам .search — без второй обводки */
/* Сетка кружков: аватарка 54px — максимум для 4 в ряд и имя под ней, по 4 в ряд; группы — блоками в рамке с подписью, ниже «Индивидуально» */
.list { display: grid; gap: 8px; align-content: start; overflow-y: auto; padding: 2px 6px 8px }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px 0 }
.mix { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-flow: row dense; gap: 6px 0 }

/* Значок группы — маленький кружок в левом верхнем углу подложки, в свободном месте у аватарки */
.gi { position: absolute; top: 3px; left: 5px; z-index: 2; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--card); color: var(--hint); font-style: normal; box-shadow: 0 0 0 1.5px var(--surface) }
/* Группа — только серая подложка под кружками (без подписи и рамки, клетки того же размера — сетка ровная); день и время — во всплывающей подсказке.
   Подложка чуть уже блока (::before) — соседние группы не сливаются, а сетка не сдвигается */
.grp { position: relative; grid-column: span var(--n); min-width: 0; cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none } .grp:active { cursor: grabbing }
.grp::before { content: ''; position: absolute; inset: 0 2px; border-radius: 14px; background: var(--surface); z-index: 0 } .grp .tiles { position: relative }
.grp .tiles { grid-template-columns: repeat(var(--n), minmax(0, 1fr)) }
.st { display: grid; justify-items: center; align-content: start; gap: 3px; padding: 4px 0; border-radius: 14px; min-width: 0;
  cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: background .1s }
.st:hover { background: var(--blue-l) } .st:active { cursor: grabbing } .st:active .ava { transform: scale(.94) }
.ava { position: relative; display: inline-grid; transition: transform .08s }
.nm { width: 100%; text-align: center; font-size: 11px; font-weight: 700; line-height: 1.2; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.empty { text-align: center; margin: 8px 0 }
.drophint { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 6px; text-align: center; padding: 12px; font-weight: 800; font-size: 14px;
  background: color-mix(in srgb, var(--card) 92%, transparent); color: var(--red); border: 3px dashed var(--red); border-radius: 14px }
.panel.over .drophint { background: var(--red-l) }

/* Телефон: панель превращается в полоску учеников, прикреплённую к верху экрана */
@media (max-width: 1023px) {
  .panel { height: auto; grid-template-rows: auto; border-bottom-width: 4px }
  .ph { display: none }
  .list { display: flex; overflow-x: auto; overflow-y: hidden; padding: 6px 6px 4px; gap: 6px; scrollbar-width: none } .list::-webkit-scrollbar { display: none }
  .tiles { display: flex; gap: 2px } .gi { top: 1px; left: 3px } .grp, .solo { flex: none } .mix { display: contents }
  .st { flex: none; width: 64px; padding: 4px 2px } .nm { font-size: 11px; -webkit-line-clamp: 1; white-space: nowrap; text-overflow: ellipsis; display: block }
  .st :deep(.av) { width: 44px !important; height: 44px !important; font-size: 20px !important }
  .drophint { flex-direction: row; display: flex; justify-content: center; align-items: center; gap: 8px; border-radius: 12px }
}
</style>

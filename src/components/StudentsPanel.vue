<script setup>
// Список учеников. Карточку можно перетащить в таблицу; урок из таблицы, брошенный сюда, снимается с расписания.
import { ref, computed } from 'vue'
import { state } from '../store/mock'
import { dnd, pressStart } from '../composables/useDnd'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
const q = ref('')
const list = computed(() => { const k = q.value.trim().toLowerCase(); return state.students.filter(s => !k || (s.name + ' ' + s.username).toLowerCase().includes(k)) })
const trash = computed(() => dnd.active && dnd.payload?.kind === 'lesson')
const trashOver = computed(() => trash.value && dnd.over?.kind === 'panel')
const open = (id) => { state.selectedStudentId = id }
const attention = (s) => s.payment.status !== 'paid'
</script>

<template>
  <aside class="panel card" :class="{ trash, over: trashOver }" data-drop="panel">
    <header class="ph"><AppIcon name="users" :size="20" /><b>Ученики</b><span class="cnt">{{ state.students.length }}</span></header>
    <label class="search"><AppIcon name="search" :size="16" /><input v-model="q" placeholder="Поиск ученика…" aria-label="Поиск ученика" /></label>
    <div class="list">
      <div v-for="s in list" :key="s.id" class="st" role="button" tabindex="0" :aria-label="`${s.name}. Перетащите в таблицу, чтобы назначить урок`"
        @pointerdown="pressStart($event, { kind: 'student', id: s.id })" @click="open(s.id)" @keydown.enter="open(s.id)" @dragstart.prevent>
        <Avatar :s="s" :size="36" />
        <span class="nm"><b>{{ s.name }}</b><small>@{{ s.username }}</small></span>
        <i v-if="attention(s)" class="dot" title="Нужна оплата" />
        <AppIcon name="grip" :size="18" class="grip" />
      </div>
      <p v-if="!list.length" class="hint empty">Никого не нашли</p>
    </div>
    <footer class="ft">Всего: <b>{{ state.students.length }}</b></footer>
    <div v-if="trash" class="drophint"><AppIcon name="trash" :size="22" />Отпустите, чтобы снять урок</div>
  </aside>
</template>

<style scoped>
.panel { position: relative; padding: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; height: 100%; overflow: hidden }
.ph { display: flex; align-items: center; gap: 8px; padding: 14px 14px 8px; font-size: 17px; font-weight: 800 }
.cnt { background: var(--surface); border: 2px solid var(--border); border-radius: 99px; font-size: 12px; padding: 0 8px; color: var(--hint) }
.search { display: flex; align-items: center; gap: 8px; margin: 0 12px 10px; padding: 0 12px; border: 2px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--hint-2) }
.search:focus-within { border-color: var(--blue); background: var(--card) } .search input { border: 0; background: none; margin: 0; padding: 9px 0; min-width: 0 }
.list { display: grid; gap: 8px; align-content: start; overflow-y: auto; padding: 4px 12px 12px }
.st { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 14px; background: var(--card);
  cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: border-color .1s, background .1s }
.st:hover { border-color: var(--blue); background: var(--blue-l) } .st:active { cursor: grabbing }
.nm { display: grid; min-width: 0; flex: 1; line-height: 1.2 } .nm b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .nm small { color: var(--hint-2); font-size: 12px; font-weight: 700 }
.grip { color: var(--hint-2); flex: none } .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--red); flex: none }
.empty { text-align: center; margin: 8px 0 }
.ft { border-top: 2px solid var(--border); background: var(--surface); text-align: center; padding: 10px; font-size: 12px; color: var(--hint) }
.drophint { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 6px; text-align: center; padding: 12px; font-weight: 800; font-size: 14px;
  background: color-mix(in srgb, var(--card) 92%, transparent); color: var(--red); border: 3px dashed var(--red); border-radius: 14px }
.panel.over .drophint { background: var(--red-l) }

/* Телефон: панель превращается в полоску учеников, прикреплённую к верху экрана */
@media (max-width: 1023px) {
  .panel { height: auto; grid-template-rows: auto; border-bottom-width: 4px }
  .ph, .search, .ft, .nm small, .grip { display: none }
  .list { display: flex; overflow-x: auto; overflow-y: hidden; padding: 8px; gap: 8px; scrollbar-width: none } .list::-webkit-scrollbar { display: none }
  .st { flex: none; padding: 5px 12px 5px 6px } .nm b { font-size: 13px }
  .drophint { flex-direction: row; display: flex; justify-content: center; align-items: center; gap: 8px; border-radius: 12px }
}
</style>

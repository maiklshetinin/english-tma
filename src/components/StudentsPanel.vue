<script setup>
// Список учеников — компактная сетка кружков (как «Поделиться» в Telegram): аватарка, имя под ней.
// Кружок можно перетащить в таблицу; урок из таблицы, брошенный сюда, снимается с расписания. Красная точка — нужна оплата.
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { handle } from '../store/app'
import { dnd, pressStart } from '../composables/useDnd'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import { useStudentsStore } from '../stores/students'
const studentStore = useStudentsStore()
const q = ref('')
const list = computed(() => { const k = q.value.trim().toLowerCase(); return studentStore.list.filter(s => !k || (s.name + ' ' + (s.username || '')).toLowerCase().includes(k)) })
const trash = computed(() => dnd.active && dnd.payload?.kind === 'lesson')
const trashOver = computed(() => trash.value && dnd.over?.kind === 'panel')
const router = useRouter()
const open = (id) => { router.push({ name: 'home', params: { id } }) }      // панель живёт на «Главной»: карточка открывается там же
const attention = (s) => s.payment.status !== 'paid'
</script>

<template>
  <aside class="panel card" :class="{ trash, over: trashOver }" data-drop="panel">
    <header class="ph"><AppIcon name="users" :size="20" /><b>Ученики</b><span class="cnt">{{ studentStore.list.length }}</span></header>
    <label class="search"><AppIcon name="search" :size="16" /><input v-model="q" placeholder="Поиск ученика…" aria-label="Поиск ученика" /></label>
    <div class="list">
      <div v-for="s in list" :key="s.id" class="st" role="button" tabindex="0" :title="`${s.name}${handle(s) ? ' · ' + handle(s) : ''}`" :aria-label="`${s.name}. Перетащите в таблицу, чтобы назначить урок`"
        @pointerdown="pressStart($event, { kind: 'student', id: s.id })" @click="open(s.id)" @keydown.enter="open(s.id)" @dragstart.prevent>
        <span class="ava"><Avatar :s="s" :size="48" /><i v-if="attention(s)" class="dot" title="Нужна оплата" /></span>
        <span class="nm">{{ s.name }}</span>
      </div>
      <p v-if="!list.length" class="hint empty">Никого не нашли</p>
    </div>
    <footer class="ft">Всего: <b>{{ studentStore.list.length }}</b></footer>
    <div v-if="trash" class="drophint"><AppIcon name="trash" :size="22" />Отпустите, чтобы снять урок</div>
  </aside>
</template>

<style scoped>
.panel { position: relative; padding: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; height: 100%; overflow: hidden }
.ph { display: flex; align-items: center; gap: 8px; padding: 14px 14px 8px; font-size: 17px; font-weight: 800 }
.cnt { background: var(--surface); border: 2px solid var(--border); border-radius: 99px; font-size: 12px; padding: 0 8px; color: var(--hint) }
.search { display: flex; align-items: center; gap: 8px; margin: 0 12px 10px; padding: 0 12px; border: 2px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--hint-2) }
.search:focus-within { border-color: var(--blue); background: var(--card) } .search input { border: 0; background: none; margin: 0; padding: 9px 0; min-width: 0 }
/* Сетка кружков: аватарка 48px и имя (до 2 строк) под ней, по 3 в ряд */
.list { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 10px 4px; align-content: start; overflow-y: auto; padding: 4px 10px 12px }
.st { display: grid; justify-items: center; align-content: start; gap: 4px; padding: 6px 2px; border-radius: 14px; min-width: 0;
  cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: background .1s }
.st:hover { background: var(--blue-l) } .st:active { cursor: grabbing } .st:active .ava { transform: scale(.94) }
.ava { position: relative; display: inline-grid; transition: transform .08s }
.nm { width: 100%; text-align: center; font-size: 12px; font-weight: 700; line-height: 1.2; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word }
.dot { position: absolute; top: 0; right: 0; width: 12px; height: 12px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 2px var(--card) }
.empty { text-align: center; margin: 8px 0 }
.ft { border-top: 2px solid var(--border); background: var(--surface); text-align: center; padding: 10px; font-size: 12px; color: var(--hint) }
.drophint { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 6px; text-align: center; padding: 12px; font-weight: 800; font-size: 14px;
  background: color-mix(in srgb, var(--card) 92%, transparent); color: var(--red); border: 3px dashed var(--red); border-radius: 14px }
.panel.over .drophint { background: var(--red-l) }

/* Телефон: панель превращается в полоску учеников, прикреплённую к верху экрана */
@media (max-width: 1023px) {
  .panel { height: auto; grid-template-rows: auto; border-bottom-width: 4px }
  .ph, .search, .ft { display: none }
  .list { display: flex; overflow-x: auto; overflow-y: hidden; padding: 6px 6px 4px; gap: 2px; scrollbar-width: none } .list::-webkit-scrollbar { display: none }
  .st { flex: none; width: 64px; padding: 4px 2px } .nm { font-size: 11px; -webkit-line-clamp: 1; white-space: nowrap; text-overflow: ellipsis; display: block }
  .st :deep(.av) { width: 44px !important; height: 44px !important; font-size: 20px !important }
  .drophint { flex-direction: row; display: flex; justify-content: center; align-items: center; gap: 8px; border-radius: 12px }
}
</style>

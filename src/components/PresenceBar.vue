<script setup>
// Кто сейчас в приложении — кружки вверху, как во Figma / Google Таблицах: у каждого своё фото из Telegram и свой цвет
// (тем же цветом в редакторе курсов — его курсор и выделение). Нажатие — список: кто и где сейчас (вкладка, курс).
// inline — внутри панели редактора курсов; иначе — на компьютере плавает в правом верхнем углу, на телефоне — тонкая строка
// над страницей (и только если в приложении есть кто-то ещё). Без соединения (демо) — не видно.
import { ref, computed } from 'vue'
import { live, people, WHERE, shared, setSharedCursors } from '../composables/useLive'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { notesState, unreadCount, unread, openNote } from '../composables/useNotes'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const props = defineProps({ inline: Boolean })
const open = ref(false)
const shown = computed(() => people.value.slice(-5))                 // больше пяти — «+N»
const more = computed(() => Math.max(0, people.value.length - 5))
const bad = ref({})
const ini = (n) => (n || '?').trim()[0]?.toUpperCase() || '?'
// Заметки на экране: список (новые сверху), нажатие — перейти к месту и открыть; «Новая заметка» — нажать на экран
const router = useRouter()
const list = ref(false)
const notes = computed(() => notesState.list.filter((n) => notesState.showDone || !n.done))
const whereN = (n) => n.where || 'приложение'
function go(n) { list.value = false; if (router.currentRoute.value.fullPath !== n.path) router.push(n.path); setTimeout(() => openNote(n.id), 60) }
function newNote() { list.value = false; notesState.open = null; notesState.placing = true }
const label = (p) => (p.where === 'courses' ? 'в редакторе курсов' : WHERE[p.where] ? `«${WHERE[p.where]}»` : 'в приложении')
</script>
<template>
  <div v-if="live.on && people.length" class="pb" :class="{ inline, solo: people.length < 2 }">
    <!-- Разработчику: общие курсоры на всех экранах — вкл/выкл сразу у всех (то же, что переключатель в «Профиле») -->
    <button v-if="auth.isDev && !inline" class="cur" :class="{ on: shared.cursors }" :aria-pressed="shared.cursors"
      :title="shared.cursors ? 'Общие курсоры включены — нажмите, чтобы выключить у всех' : 'Включить общие курсоры: все увидят курсоры друг друга'" @click="setSharedCursors(!shared.cursors)">
      <svg viewBox="0 0 16 16"><path d="M2 1.5l5 13 1.9-5.4L14.5 7z" /></svg></button>
    <button v-if="!inline" class="nt" :class="{ on: list }" :aria-expanded="list" :title="`Заметки на экране${unreadCount ? ' — новых: ' + unreadCount : ''}`" aria-label="Заметки" @click="list = !list; open = false">
      <AppIcon name="chat" :size="16" /><em v-if="unreadCount">{{ unreadCount }}</em></button>
    <button class="row" :title="people.map(p => (p.me ? 'Вы' : p.name) + ' — ' + label(p)).join('\n')" @click="open = !open">
      <span v-for="p in shown" :key="p.uid" class="av" :style="{ '--c': p.color }">
        <img v-if="p.photo && !bad[p.uid]" :src="p.photo" alt="" referrerpolicy="no-referrer" @error="bad[p.uid] = true" />
        <b v-else :style="{ background: p.color }">{{ ini(p.name) }}</b>
      </span>
      <span v-if="more" class="av more">+{{ more }}</span>
    </button>
    <div v-if="list" class="bg" @click="list = false" />
    <div v-if="list" class="menu nl" role="dialog" aria-label="Заметки">
      <div class="mh nh"><span>Заметки · {{ notes.length }}</span><button type="button" @click="notesState.showDone = !notesState.showDone">{{ notesState.showDone ? 'Скрыть решённые' : 'Показать решённые' }}</button></div>
      <button v-for="n in notes" :key="n.id" class="ni" :class="{ dn: n.done }" type="button" @click="go(n)">
        <span class="av sm" :style="{ '--c': n.msgs[0].color }"><img v-if="n.msgs[0].photo" :src="n.msgs[0].photo" alt="" referrerpolicy="no-referrer" /><b v-else :style="{ background: n.msgs[0].color }">{{ ini(n.msgs[0].name) }}</b></span>
        <span class="tx"><b>{{ n.msgs[0].text }}</b><small>{{ whereN(n) }}<template v-if="n.msgs.length > 1"> · ответов: {{ n.msgs.length - 1 }}</template><template v-if="n.done"> · решено ✓</template></small></span>
        <i v-if="unread(n)" class="dot" />
      </button>
      <p v-if="!notes.length" class="empty">Заметок нет. Правый клик на экране (или клавиша C) → «Оставить заметку здесь»</p>
      <button class="add" type="button" @click="newNote"><AppIcon name="plus" :size="16" />Новая заметка</button>
    </div>
    <div v-if="open" class="bg" @click="open = false" />
    <div v-if="open" class="menu" role="dialog" aria-label="Кто сейчас в приложении">
      <div class="mh">Сейчас в приложении</div>
      <div v-for="p in people" :key="p.uid" class="mi">
        <span class="av sm" :style="{ '--c': p.color }"><img v-if="p.photo && !bad[p.uid]" :src="p.photo" alt="" referrerpolicy="no-referrer" /><b v-else :style="{ background: p.color }">{{ ini(p.name) }}</b></span>
        <span class="tx"><b>{{ p.name }}<i v-if="p.me"> (вы)</i><em v-if="p.dev" class="dv">разработчик</em></b><small>{{ label(p) }}<template v-if="p.cids.length > 1"> · {{ p.cids.length }} окна</template></small></span>
      </div>
    </div>
  </div>
</template>
<style scoped>
.pb { position: fixed; top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px) + 12px); right: 14px; z-index: 25 }
.pb.inline { position: relative; top: auto; right: auto; z-index: 6 }
.pb:not(.inline) { display: flex; align-items: center; gap: 6px }
.cur { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: var(--card); color: var(--hint); box-shadow: 0 2px 10px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04); cursor: pointer; transition: background .12s, color .12s }
.cur svg { width: 16px; height: 16px; fill: currentColor; stroke: currentColor; stroke-width: 1.2; stroke-linejoin: round }
.cur:hover { color: var(--text) } .cur.on { background: #0d99ff; color: #fff }
.nt { position: relative; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: var(--card); color: var(--hint); box-shadow: 0 2px 10px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04); cursor: pointer }
.nt:hover, .nt.on { color: var(--blue) }
.nt em { position: absolute; right: -4px; top: -4px; min-width: 17px; height: 17px; padding: 0 4px; box-sizing: border-box; border-radius: 99px; background: var(--red); color: #fff; font-style: normal; font-size: 10px; font-weight: 900; line-height: 17px; text-align: center; box-shadow: 0 0 0 2px var(--card) }
.nl { width: 320px; max-height: 70vh; overflow: auto; display: grid }
.nh { display: flex; justify-content: space-between; align-items: center } .nh button { padding: 0; border: 0; background: none; font: inherit; color: var(--blue); text-transform: none; letter-spacing: 0; cursor: pointer }
.ni { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px; border: 0; border-radius: 10px; background: none; font: inherit; text-align: left; cursor: pointer } .ni:hover { background: var(--surface) }
.ni .tx { flex: 1; min-width: 0 } .ni .tx b { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .ni.dn { opacity: .55 }
.ni .dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--blue) }
.empty { margin: 4px 8px 8px; font-size: 12px; font-weight: 700; color: var(--hint); line-height: 1.4 }
.add { display: flex; align-items: center; gap: 8px; margin-top: 4px; padding: 9px 8px; border: 0; border-top: 1px solid var(--border); border-radius: 0 0 10px 10px; background: none; font: inherit; font-size: 14px; font-weight: 800; color: var(--blue); cursor: pointer }
.row { display: flex; align-items: center; padding: 3px 4px 3px 8px; border: 0; border-radius: 999px; background: var(--card); box-shadow: 0 2px 10px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04); cursor: pointer }
.inline .row { padding: 0; background: none; box-shadow: none }
.av { position: relative; display: grid; place-items: center; width: 30px; height: 30px; margin-left: -6px; border-radius: 50%; box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--c); overflow: hidden; background: var(--surface); flex: none }
.av:first-child { margin-left: 0 } .av + .av { margin-left: 2px }
.av img { width: 100%; height: 100%; object-fit: cover } .av b { display: grid; place-items: center; width: 100%; height: 100%; color: #fff; font-size: 13px; font-weight: 900 }
.av.more { --c: var(--border); font-size: 11px; font-weight: 800; color: var(--hint) }
.bg { position: fixed; inset: 0; z-index: 1 }
.menu { position: absolute; right: 0; top: calc(100% + 8px); z-index: 2; min-width: 220px; padding: 6px; border-radius: 14px; background: var(--card); box-shadow: 0 10px 30px rgba(0, 0, 0, .16), 0 0 0 1px rgba(0, 0, 0, .04) }
.mh { padding: 6px 8px; font-size: 11px; font-weight: 900; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.mi { display: flex; align-items: center; gap: 10px; padding: 6px 8px } .av.sm { width: 28px; height: 28px; margin: 0 }
.tx { display: grid; line-height: 1.2 } .tx b { font-size: 14px } .tx i { font-style: normal; color: var(--hint); font-weight: 700 } .dv { margin-left: 6px; padding: 1px 6px; border-radius: 5px; background: #f1e6ff; color: var(--purple-d); font-size: 10px; font-style: normal; font-weight: 800; vertical-align: 2px }
.tx small { font-size: 12px; color: var(--hint); font-weight: 600 }
/* Телефон: экран узкий — кружки показываем, только когда в приложении есть кто-то ещё, и помельче */
@media (max-width: 719px) {
  /* в потоке страницы, тонкой строкой сверху (а не поверх содержимого) */
  .pb:not(.inline) { position: relative; top: auto; right: auto; display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 8px 10px 0 }
  .pb:not(.inline)::before { content: 'Сейчас здесь'; font-size: 12px; font-weight: 800; color: var(--hint) }
  .pb.solo:not(.inline) { display: none }
  .av { width: 24px; height: 24px } .av b { font-size: 11px } .cur { width: 30px; height: 30px }
}
</style>

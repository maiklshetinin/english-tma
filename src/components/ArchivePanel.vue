<script setup>
// Раздел «Архив» на вкладке «Ученики»: архивные ученики, «Вернуть» и «Удалить навсегда».
//  • Вернуть: ученик снова в списке и «ждёт приглашения» — сразу показываем новую ссылку (старый аккаунт доступ потерял при архивации).
//  • Удалить навсегда: двойное нажатие. Сервер удаляет запись, путь и прогресс слов; будущие уроки — без него,
//    проведённые остаются в истории с его именем и ценой.
import { computed, onMounted, ref } from 'vue'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import { useStudentsStore } from '../stores/students'
import { showToast } from '../composables/useToast'
import { copyText, shareInvite } from '../composables/useShare'
const studentStore = useStudentsStore()
const open = ref(false), busy = ref(''), confirmId = ref(''), back = ref(null)      // back: { name, url } — кого только что вернули
const items = computed(() => studentStore.archived)
onMounted(() => { studentStore.loadArchived().catch(() => {}) })
const since = (iso) => iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : ''

async function restore(st) {
  busy.value = st.id
  try {
    const url = await studentStore.restore(st.id)
    back.value = { name: st.name, url }
    showToast((await copyText(url)) ? `${st.name} снова в списке — ссылка скопирована` : `${st.name} снова в списке`)
  } catch (e) { showToast(e.message, null, 'bad') } finally { busy.value = '' }
}
async function purge(st) {
  if (confirmId.value !== st.id) { confirmId.value = st.id; return }          // первое нажатие — просим подтвердить
  busy.value = st.id; confirmId.value = ''
  try { await studentStore.purge(st.id); showToast(`${st.name} удалён(а) навсегда. Проведённые уроки остались в истории`) }
  catch (e) { showToast(e.message, null, 'bad') } finally { busy.value = '' }
}
</script>

<template>
  <div v-if="items.length || back" class="card arch">
    <button class="head" :aria-expanded="open" @click="open = !open">
      <AppIcon name="layers" :size="18" /><b>Архив</b><span class="cnt">{{ items.length }}</span>
      <span class="hint grow">{{ open ? '' : 'вернуть или удалить навсегда' }}</span><span class="chev" :class="{ up: open }">›</span>
    </button>
    <template v-if="open">
      <div v-if="back" class="back">
        <div><b>{{ back.name }}</b> снова в списке. Отправьте новую ссылку-приглашение — по старой войти уже нельзя.</div>
        <div class="row2"><input :value="back.url" readonly aria-label="Ссылка-приглашение" @focus="$event.target.select()" /><button class="btn ghost sm" @click="shareInvite(back.url)">Отправить в Telegram</button><button class="btn ghost sm" @click="back = null">Скрыть</button></div>
      </div>
      <div v-for="st in items" :key="st.id" class="it">
        <span class="av"><Avatar :s="st" :size="40" /></span>
        <span class="who"><b>{{ st.name }}</b><small class="hint">{{ st.level }}<template v-if="since(st.archivedAt)"> · в архиве с {{ since(st.archivedAt) }}</template></small></span>
        <span class="acts">
          <button class="btn ghost sm" :disabled="busy === st.id" @click="restore(st)"><AppIcon name="undo" :size="14" /> Вернуть</button>
          <button class="btn ghost sm del" :class="{ sure: confirmId === st.id }" :disabled="busy === st.id" @click="purge(st)" @blur="confirmId = ''">
            <AppIcon name="trash" :size="14" /> {{ confirmId === st.id ? 'Точно удалить?' : 'Удалить' }}</button>
        </span>
      </div>
      <p v-if="items.length" class="hint note">«Удалить» стирает ученика, его путь и прогресс слов без возврата. Проведённые уроки с ценой остаются в истории под его именем.</p>
    </template>
  </div>
</template>

<style scoped>
.arch { padding: 6px 8px; display: grid; gap: 4px }
.head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px; border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; border-radius: 12px }
.head:hover { background: var(--surface) }
.cnt { min-width: 22px; padding: 1px 7px; border-radius: 99px; background: var(--surface); border: 1px solid var(--border); font-size: 12px; font-weight: 900; text-align: center; color: var(--hint) }
.grow { flex: 1; font-size: 13px } .chev { font-size: 22px; line-height: 1; color: var(--hint-2); transition: transform .15s; transform: rotate(90deg) } .chev.up { transform: rotate(-90deg) }
.it { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-top: 1px solid var(--border) }
.av { filter: grayscale(1); opacity: .7; display: inline-grid }
.who { display: grid; flex: 1; min-width: 0 } .who b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .who small { font-size: 12px }
.acts { display: flex; gap: 6px; flex: none }
.del { color: var(--red) } .del.sure { background: var(--red); color: #fff; border-color: var(--red) }
.back { display: grid; gap: 8px; margin: 4px 0; padding: 10px 12px; border-radius: 14px; background: var(--green-l); font-size: 14px }
.back input { flex: 1; min-width: 160px; margin: 0; padding: 8px 10px; font-size: 13px }
.note { margin: 4px 10px 8px; font-size: 12px }
@media (max-width: 480px) { .it { flex-wrap: wrap } .acts { width: 100%; padding-left: 50px } .acts .btn { flex: 1 } }
</style>

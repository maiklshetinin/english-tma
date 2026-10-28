<script setup>
// Колода из Google Таблицы: вставляете ссылку → слова подтягиваются. Повторная синхронизация добавляет новые слова
// и обновляет переводы, прогресс учеников сохраняется. Запасной путь — вставить скопированные ячейки.
import { ref, onMounted } from 'vue'
import { fetchSheetCsv, parseCards, mergeCards } from '../composables/useSheetImport'
import AppIcon from './AppIcon.vue'
const props = defineProps({ deck: { type: Object, required: true }, auto: Boolean })
const url = ref(props.deck.source?.url || ''), raw = ref(''), msg = ref(''), bad = ref(false), busy = ref(false), help = ref(false), paste = ref(false)

function apply(rows, withUrl) {
  if (!rows.length) { bad.value = true; msg.value = 'Не найдено пар «слово — перевод». Колонки: A — слово, B — перевод, C — пример, D — перевод примера, E — фото, F — озвучка.'; return }
  const { added, updated, badLinks } = mergeCards(props.deck, rows)
  if (withUrl) props.deck.source = { url: url.value.trim(), lastSync: new Date().toISOString() }
  bad.value = false
  msg.value = (added || updated ? `Добавлено слов: ${added}, обновлено: ${updated}` : 'Всё уже актуально — новых слов нет')
    + (badLinks ? `. Ссылок пропущено: ${badLinks} — ссылки должны начинаться с https://` : '')
  bad.value = badLinks > 0
}
async function sync() {
  msg.value = ''; busy.value = true
  try { apply(parseCards(await fetchSheetCsv(url.value.trim())), true) }
  catch (e) { bad.value = true; msg.value = e.message } finally { busy.value = false }
}
const fromText = () => { apply(parseCards(raw.value), false); if (!bad.value) { raw.value = ''; paste.value = false } }
onMounted(() => { if (props.auto && url.value.trim()) sync() })
</script>

<template>
  <!-- Одна строка, как в настройках Telegram: значок таблицы, ссылка, кнопка «обновить». Подсказка про колонки — по «?» -->
  <div class="sl">
    <div class="row">
      <span class="ic"><AppIcon name="sheet" :size="20" /></span>
      <input v-model="url" class="u" placeholder="Ссылка на Google Таблицу" aria-label="Ссылка на Google Таблицу" @keyup.enter="sync" />
      <button class="rb" :disabled="busy || !url.trim()" :title="deck.source?.lastSync ? 'Обновить из таблицы' : 'Загрузить слова'" :aria-label="deck.source?.lastSync ? 'Обновить из таблицы' : 'Загрузить слова'" @click="sync">
        <AppIcon name="refresh" :size="16" :class="{ spin: busy }" /><span>{{ busy ? 'Загрузка' : deck.source?.lastSync ? 'Обновить' : 'Загрузить' }}</span></button>
    </div>
    <div class="sub">
      <span v-if="deck.source?.lastSync">обновлено {{ new Date(deck.source.lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</span>
      <button class="lk" @click="help = !help">{{ help ? 'скрыть' : 'какие колонки?' }}</button>
      <button class="lk" @click="paste = !paste">вставить ячейки</button>
    </div>
    <p v-if="help" class="hint tip">A — слово, B — перевод, C — пример, D — перевод примера, E — ссылка на фото (450×300), F — ссылка на озвучку (https://). Доступ к таблице и файлам: «Все, у кого есть ссылка».</p>
    <p v-if="msg" class="msg" :class="{ bad }">{{ msg }}</p>
    <div v-if="paste" class="pst"><textarea v-model="raw" rows="3" placeholder="слово&#9;перевод&#9;пример" /><button class="btn sm ghost" :disabled="!raw.trim()" @click="fromText">Добавить из текста</button></div>
  </div>
</template>
<style scoped>
.sl { display: grid; gap: 2px }
.row { display: flex; align-items: center; gap: 12px }
.ic { flex: none; display: grid; place-items: center; width: 28px; color: var(--green-d) }
.u { flex: 1; min-width: 0; margin: 0; padding: 8px 10px; font-size: 14px; border-width: 1px; border-radius: 10px }
.rb { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 7px 10px; border: 0; border-radius: 10px; background: var(--blue-l); color: var(--blue); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.rb:disabled { opacity: .45; cursor: default } .spin { animation: spin 1s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }
.sub { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; padding-left: 40px; font-size: 12px; font-weight: 600; color: var(--hint) }
.lk { border: 0; background: none; padding: 2px 0; font: inherit; font-size: 12px; font-weight: 700; color: var(--blue); cursor: pointer }
.tip { margin: 2px 0 0 40px; font-size: 12px }
.msg { margin: 2px 0 0 40px; font-size: 13px; font-weight: 800; color: var(--green-d) } .msg.bad { color: var(--red-d) }
.pst { display: grid; gap: 6px; margin: 4px 0 0 40px } .pst textarea { margin: 0; font-size: 13px }
</style>

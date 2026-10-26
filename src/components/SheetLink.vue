<script setup>
// Колода из Google Таблицы: вставляете ссылку → слова подтягиваются. Повторная синхронизация добавляет новые слова
// и обновляет переводы, прогресс учеников сохраняется. Запасной путь — вставить скопированные ячейки.
import { ref, onMounted } from 'vue'
import { fetchSheetCsv, parseCards, mergeCards } from '../composables/useSheetImport'
import AppIcon from './AppIcon.vue'
const props = defineProps({ deck: { type: Object, required: true }, auto: Boolean })
const url = ref(props.deck.source?.url || ''), raw = ref(''), msg = ref(''), bad = ref(false), busy = ref(false)

function apply(rows, withUrl) {
  if (!rows.length) { bad.value = true; msg.value = 'Не найдено пар «слово — перевод». Колонки: A — слово, B — перевод, C — пример, D — перевод примера, E — фото, F — озвучка.'; return }
  const { added, updated, badLinks } = mergeCards(props.deck, rows)
  if (withUrl) props.deck.source = { url: url.value.trim(), lastSync: new Date().toISOString() }
  bad.value = false
  msg.value = (added || updated ? `Добавлено слов: ${added}, обновлено: ${updated}` : 'Всё уже актуально — новых слов нет')
    + (badLinks ? `. Ссылок пропущено: ${badLinks} — нужны https-ссылки на Google Диск или Cloud Storage` : '')
  bad.value = badLinks > 0
}
async function sync() {
  msg.value = ''; busy.value = true
  try { apply(parseCards(await fetchSheetCsv(url.value.trim())), true) }
  catch (e) { bad.value = true; msg.value = e.message } finally { busy.value = false }
}
const fromText = () => { apply(parseCards(raw.value), false); if (!bad.value) raw.value = '' }
onMounted(() => { if (props.auto && url.value.trim()) sync() })
</script>

<template>
  <div class="sl">
    <h3 class="h"><AppIcon name="sheet" /> Google Таблица</h3>
    <p class="hint" style="margin:0 0 10px">Колонки: A — слово, B — перевод, C — пример, D — перевод примера, E — ссылка на фото (450×300), F — ссылка на озвучку. Доступ к таблице и к файлам на Диске: «Все, у кого есть ссылка» (просмотр).</p>
    <input v-model="url" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Ссылка на Google Таблицу" />
    <button class="btn" :disabled="busy || !url.trim()" @click="sync">
      <AppIcon v-if="deck.source?.lastSync" name="refresh" :size="16" /> {{ busy ? 'Загрузка…' : deck.source?.lastSync ? 'Обновить из таблицы' : 'Загрузить слова' }}
    </button>
    <p v-if="deck.source?.lastSync" class="hint" style="margin:8px 0 0">Последняя синхронизация: {{ new Date(deck.source.lastSync).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) }}</p>
    <p v-if="msg" class="msg" :class="{ bad }">{{ msg }}</p>
    <details style="margin-top:10px"><summary class="hint">Не открывается? Вставьте скопированные ячейки</summary>
      <textarea v-model="raw" rows="4" placeholder="слово&#9;перевод&#9;пример" style="margin-top:8px" /><button class="btn ghost" :disabled="!raw.trim()" @click="fromText">Добавить из текста</button></details>
  </div>
</template>
<style scoped>
.h { display: flex; gap: 8px; align-items: center; margin: 0 0 6px; font-size: 17px }
.msg { margin: 10px 0 0; font-size: 14px; font-weight: 800; color: var(--green-d) } .msg.bad { color: var(--red-d) }
</style>

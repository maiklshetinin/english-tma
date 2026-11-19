<script setup>
// Вкладка «ИИ» панели разработчика (19.11.2026): мост с чатом для упражнения «Ответ по смыслу» (src/exercises/kp).
// Ключей Gemini больше нет: проверку делает открытый чат (ChatGPT / Gemini / Claude) в браузере преподавателя — скрипт Tampermonkey
// public/ai-bridge.user.js забирает задания с сервера (server/ai.ts) и отдаёт ответ чата. Здесь — в сети ли мост и строка подключения.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { request, post } from '../stores/api'
import { API } from '../firebase'
import { showToast } from '../composables/useToast'
import { ask } from '../composables/useDialog'

const st = ref(null), err = ref(''), show = ref(false), now = ref(Date.now())
const SCRIPT = location.origin + import.meta.env.BASE_URL + 'ai-bridge.user.js'
const line = computed(() => (st.value?.token ? `${API}#${st.value.token}` : ''))
const masked = computed(() => (line.value ? `${API}#${st.value.token.slice(0, 4)}…${st.value.token.slice(-4)}` : ''))

async function load() {
  try { st.value = await request('/dev/ai', undefined, 'Мост'); err.value = '' } catch (e) { err.value = e.message }
  now.value = Date.now()
}
let tm = 0
onMounted(() => { load(); tm = setInterval(load, 5000) })
onBeforeUnmount(() => clearInterval(tm))

async function renew() {
  if (st.value?.token && !(await ask('Новый ключ моста?', { text: 'Старый перестанет работать — строку подключения нужно будет вставить в скрипт заново.', ok: 'Создать' }))) return
  try { await post('/dev/ai/token', {}, 'Ключ моста'); await load(); show.value = true; showToast('Ключ моста создан') } catch (e) { showToast(e.message) }
}
async function copy() {
  try { await navigator.clipboard.writeText(line.value); showToast('Строка подключения скопирована') } catch { show.value = true; showToast('Не удалось скопировать — выделите строку вручную') }
}
const ago = (t) => { const s = Math.max(0, Math.round((now.value - t) / 1000)); return s < 60 ? `${s} с назад` : s < 3600 ? `${Math.round(s / 60)} мин назад` : new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }
</script>

<template>
  <div class="dai">
    <div class="hd"><b>Мост с чатом</b><a :href="SCRIPT" target="_blank" rel="noopener">Установить скрипт</a></div>
    <p class="nt">Проверку «Ответ по смыслу» делает открытый у вас чат (ChatGPT, Gemini или Claude). Скрипт во вкладке с чатом забирает задания с сервера, вставляет их в чат и возвращает ответ. Вкладка закрыта — проверки нет, ученик сравнивает ответ с эталоном сам.</p>

    <p v-if="err" class="e">{{ err }}</p>
    <div v-else-if="st" class="sts">
      <span class="s" :class="st.online ? 'ok' : 'bad'"><i />{{ st.online ? `в сети${st.site ? ' · ' + st.site : ''}` : 'не в сети' }}</span>
      <span v-if="st.seenAt && !st.online" class="m">был {{ ago(st.seenAt) }}</span>
      <span class="m">проверок: <b>{{ st.served }}</b></span>
      <span v-if="st.queue" class="m">в очереди: <b>{{ st.queue }}</b></span>
      <span v-if="st.lastAt" class="m">последняя {{ ago(st.lastAt) }}, за {{ (st.lastMs / 1000).toFixed(1) }} с</span>
      <span v-if="st.lastError" class="e">{{ st.lastError }}</span>
    </div>

    <div class="row">
      <span class="lb">Строка подключения</span>
      <code v-if="line" class="k">{{ show ? line : masked }}</code><span v-else class="m">ключа ещё нет</span>
      <button v-if="line" class="tb" @click="show = !show">{{ show ? 'Скрыть' : 'Показать' }}</button>
      <button v-if="line" class="tb" @click="copy">Копировать</button>
      <button class="tb" @click="renew">{{ line ? 'Новый ключ' : 'Создать ключ' }}</button>
    </div>

    <ol class="how">
      <li>Поставьте в браузер расширение Tampermonkey.</li>
      <li>Нажмите «Установить скрипт» и подтвердите установку.</li>
      <li>Откройте чат (ChatGPT, Gemini или Claude) в отдельной вкладке. В меню Tampermonkey выберите «Мост: строка подключения» и вставьте строку отсюда.</li>
      <li>Там же — «Мост: включить в этой вкладке» (или Alt+Shift+B). Внизу слева появится плашка «Мост», а здесь — «в сети».</li>
    </ol>
    <p class="nt">Мост работает в одной вкладке. Пока он проверяет ответ, в этом чате лучше ничего не писать. Раз в 10 проверок скрипт сам открывает новый чат, чтобы старые сообщения не замедляли ответы.</p>
  </div>
</template>

<style scoped>
.dai { display: grid; gap: 10px; min-width: 0 }
.hd { display: flex; align-items: baseline; gap: 8px } .hd > b { flex: 1; font-size: 16px; font-weight: 600 } .hd a { font-size: 12.5px; font-weight: 700; color: var(--g-acc, #1a73e8); text-decoration: none }
.nt { margin: 0; font-size: 12px; color: var(--hint) }
.sts, .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 9px 10px; border-radius: 9px; background: var(--surface); font-size: 13px }
.s { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; white-space: nowrap } .s i { width: 9px; height: 9px; border-radius: 50% }
.s.ok { color: #1f883d } .s.ok i { background: #1f883d } .s.bad { color: #cf222e } .s.bad i { background: #cf222e }
.m { color: var(--hint) } .m b { color: var(--text); font-variant-numeric: tabular-nums }
.e { margin: 0; font-size: 12.5px; color: #cf222e }
.lb { font-size: 11px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.k { flex: 1; min-width: 0; overflow-wrap: anywhere; font: 12.5px ui-monospace, Menlo, Consolas, monospace }
.tb { height: 28px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer }
.how { margin: 0; padding-left: 20px; display: grid; gap: 4px; font-size: 13px }
</style>

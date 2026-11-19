<script setup>
// Вкладка «ИИ» панели разработчика (19.11.2026): ключи Gemini для упражнения «Ответ по смыслу» (src/exercises/kp).
// Ключи — только в этом браузере (utils/gemini.js), на сервер не уходят. Пробуются сверху вниз; кончилась квота — следующий,
// исчерпанный пропускается до времени, которое назвал Google. «Проверить» — крошечный запрос к модели проверки.
import { ref, computed, watch } from 'vue'
import { ai, addKey, removeKey, moveKey, setModel, testKey, mask, countToday } from '../utils/gemini'

const fresh = ref(''), busy = ref(''), now = ref(Date.now()), modelIn = ref(ai.model)
watch(() => ai.model, (m) => { modelIn.value = m })          // модель подобралась сама (Google ответил «нет такой модели») — видно в поле
const hm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
function add() { if (addKey(fresh.value)) { const k = fresh.value.trim(); fresh.value = ''; test(k) } }
async function test(k) { busy.value = k; try { await testKey(k) } finally { busy.value = ''; now.value = Date.now() } }
const rows = computed(() => ai.keys.map(x => {
  const wait = x.until > now.value
  return { ...x, m: mask(x.key), n: countToday(x), st: wait ? 'wait' : x.ok === true ? 'ok' : x.ok === false ? 'bad' : 'new',
    label: wait ? `квота до ${hm(x.until)}` : x.ok === true ? 'работает' : x.ok === false ? 'ошибка' : 'не проверен' }
}))
</script>

<template>
  <div class="dai">
    <div class="hd"><b>Ключи Gemini</b><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Получить ключ</a></div>
    <p class="nt">Хранятся только в этом браузере. Нужны для упражнения «Ответ по смыслу» (Karta Polaka).</p>
    <form class="add" @submit.prevent="add">
      <label class="sr" for="dai-key">Новый ключ</label>
      <input id="dai-key" v-model="fresh" placeholder="AIzaSy…" autocomplete="off" spellcheck="false" />
      <button type="submit" :disabled="!fresh.trim()">Добавить</button>
    </form>
    <label class="mdl"><span>Модель проверки</span><input v-model="modelIn" spellcheck="false" @change="setModel(modelIn); modelIn = ai.model" /></label>
    <p class="nt">Если Google ответит «нет такой модели», приложение само возьмёт свежую текстовую Flash из списка моделей вашего ключа.</p>
    <p v-if="!rows.length" class="nt">Ключей пока нет — без ключа упражнение покажет эталон без процента.</p>
    <table v-else class="kt">
      <thead><tr><th>Ключ</th><th>Проверка</th><th title="Запросов к Gemini сегодня">Сегодня</th><th>Последняя ошибка</th><th /></tr></thead>
      <tbody>
        <tr v-for="(x, i) in rows" :key="x.key" :class="{ bad: x.st === 'bad' }">
          <td class="k">{{ x.m }}</td>
          <td><span class="s" :class="x.st"><i aria-hidden="true" />{{ busy === x.key ? 'проверяю…' : x.label }}</span></td>
          <td class="n">{{ x.n }}</td>
          <td class="e">{{ x.err || '—' }}</td>
          <td class="a">
            <button type="button" class="ib" :disabled="i === 0" aria-label="Выше" title="Выше — пробовать раньше" @click="moveKey(x.key, -1)">↑</button>
            <button type="button" class="tb" :disabled="busy === x.key" @click="test(x.key)">Проверить</button>
            <button type="button" class="ib" aria-label="Удалить ключ" title="Удалить ключ" @click="removeKey(x.key)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="nt">Ключи пробуются сверху вниз: закончилась квота — берётся следующий, исчерпанный пропускается до сброса. Совет: в Google Cloud ограничьте ключ только Gemini API.</p>
  </div>
</template>

<style scoped>
.dai { display: grid; gap: 10px; min-width: 0 }
.hd { display: flex; align-items: baseline; gap: 8px } .hd > b { flex: 1; font-size: 16px; font-weight: 600 } .hd a { font-size: 12.5px; font-weight: 700; color: var(--g-acc, #1a73e8); text-decoration: none }
.nt { margin: 0; font-size: 12px; color: var(--hint) }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0) }
.add { display: flex; gap: 6px }
.add input, .mdl input { flex: 1; min-width: 0; height: 34px; box-sizing: border-box; padding: 0 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--card); color: var(--text); font: 13px ui-monospace, Menlo, Consolas, monospace; outline: none }
.add input:focus, .mdl input:focus { border-color: var(--g-acc, #1a73e8) }
.add button { height: 34px; padding: 0 14px; border: 0; border-radius: 9px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .add button:disabled { opacity: .5; cursor: default }
.mdl { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px } .mdl input { text-transform: none; letter-spacing: 0 }
.kt { width: 100%; border-collapse: separate; border-spacing: 0 4px; font-size: 13px }
.kt th { padding: 0 8px; text-align: left; font-size: 11px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.kt td { padding: 7px 8px; background: var(--surface); vertical-align: middle } .kt td:first-child { border-radius: 9px 0 0 9px } .kt td:last-child { border-radius: 0 9px 9px 0 }
.kt tr.bad td { background: color-mix(in srgb, #e8453c 12%, transparent) }
.k { font: 12.5px ui-monospace, Menlo, Consolas, monospace; white-space: nowrap }
.s { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; white-space: nowrap } .s i { width: 9px; height: 9px; border-radius: 50% }
.s.ok { color: #1f883d } .s.ok i { background: #1f883d } .s.bad { color: #cf222e } .s.bad i { background: #cf222e }
.s.wait { color: #9a6700 } .s.wait i { background: #ff9600 } .s.new { color: var(--hint) } .s.new i { background: var(--border) }
.n { font-weight: 700; font-variant-numeric: tabular-nums } .e { font-size: 12px; color: var(--hint); max-width: 260px }
.a { white-space: nowrap; text-align: right }
.tb { height: 28px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer } .tb:disabled { opacity: .5 }
.ib { width: 28px; height: 28px; margin-left: 4px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--hint); font: inherit; font-size: 12px; cursor: pointer } .ib:first-child { margin: 0 4px 0 0 } .ib:disabled { opacity: .35; cursor: default }
@container (max-width: 460px) { .e { display: none } }
.dai { container-type: inline-size }
</style>

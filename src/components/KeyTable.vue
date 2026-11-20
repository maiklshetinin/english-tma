<script setup>
// Таблица ключей Gemini для пакетной озвучки (20.11.2026) — как в окне одиночной озвучки: какой ключ сейчас отвечает
// (и сколько секунд ждём), у какого лимит этой модели и до какого времени, какой с ошибкой (текст ошибки — в строке),
// сколько запросов сегодня. Ключи пробуются сверху вниз; можно добавить, поднять, убрать.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ai, addKey, removeKey, moveKey, mask, countToday } from '../utils/gemini'
import { quotaUntil } from '../utils/tts'

const props = defineProps({ model: { type: String, required: true }, cur: { type: String, default: '' }, sec: { type: Number, default: 0 }, busy: Boolean })
const now = ref(Date.now()); let clock = 0
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 15_000) })
onBeforeUnmount(() => clearInterval(clock))
const hm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const rows = computed(() => { void now.value; void props.sec; return ai.keys.map((x) => {          // now/sec — чтобы статусы обновлялись (квота хранится вне Vue)
  const m = mask(x.key), cur = props.busy && props.cur === m, qu = quotaUntil(x.key, props.model), wait = qu > Date.now()
  return { key: x.key, m, n: countToday(x), cur,
    st: cur ? 'cur' : wait ? 'wait' : x.ok === true ? 'ok' : x.ok === false ? 'bad' : 'new',
    label: cur ? `отвечает · ждём ${props.sec} с` : wait ? `лимит модели до ${hm(qu)}` : x.ok === true ? 'работает' : x.ok === false ? 'ошибка' : 'не проверен',
    err: wait || x.ok === false ? x.err || '' : '' }
}) })
const free = computed(() => rows.value.filter((r) => r.st !== 'wait' && r.st !== 'bad').length)
const fresh = ref(''), adding = ref(false)
function addK() { if (addKey(fresh.value)) { fresh.value = ''; adding.value = false } }
</script>

<template>
  <div class="kt-w">
    <div class="kh"><span class="lb">Ключи Gemini</span><small>{{ free }} из {{ rows.length }} доступны для этой модели · пробуются сверху вниз</small><span class="sp" /><button type="button" class="lnk" :disabled="busy" @click="adding = !adding">{{ adding ? 'Отмена' : '＋ Ключ' }}</button></div>
    <form v-if="adding" class="kadd" @submit.prevent="addK"><input v-model="fresh" placeholder="AIzaSy…" autocomplete="off" spellcheck="false" aria-label="Новый ключ" /><button type="submit" class="sm" :disabled="!fresh.trim()">Добавить</button><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Получить ключ</a></form>
    <div v-if="rows.length" class="kt" role="table" aria-label="Ключи Gemini">
      <div class="kr kth" role="row"><span /><span>Ключ</span><span>Статус</span><span class="num">Сегодня</span><span /></div>
      <div v-for="(r, i) in rows" :key="r.key" class="kr" :class="r.st" role="row" :title="r.err">
        <i class="dot" /><span class="mono">{{ r.m }}</span><span class="stt">{{ r.label }}<em v-if="r.err && r.st === 'bad'"> — {{ r.err }}</em></span><span class="num">{{ r.n }}</span>
        <span class="act"><button type="button" title="Выше" :disabled="i === 0 || busy" @click="moveKey(r.key, -1)">↑</button><button type="button" title="Ниже" :disabled="i === rows.length - 1 || busy" @click="moveKey(r.key, 1)">↓</button><button type="button" title="Удалить ключ" :disabled="busy" @click="removeKey(r.key)">✕</button></span>
      </div>
    </div>
    <p v-else class="none">Нет ключей Gemini — добавьте ключ кнопкой «＋ Ключ».</p>
  </div>
</template>

<style scoped>
.kt-w { margin-top: 10px }
.kh { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px } .lb { font-size: 11px; font-weight: 800; color: var(--hint, #888); text-transform: uppercase; letter-spacing: .04em } .kh small { font-size: 11.5px; color: var(--hint, #999) } .sp { flex: 1 }
.lnk { border: 0; background: none; padding: 0; color: #2f6fe0; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .lnk:disabled { opacity: .4; cursor: default }
.kadd { display: flex; align-items: center; gap: 8px; margin-bottom: 8px }
.kadd input { flex: 1; min-width: 0; height: 32px; padding: 0 10px; border: 1px solid var(--border, #e3e3e3); border-radius: 8px; background: var(--bg, #fff); color: inherit; font: 12px ui-monospace, Menlo, Consolas, monospace }
.kadd a { font-size: 12px; color: #2f6fe0; white-space: nowrap }
.sm { height: 32px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--surface, #f1f1f1); color: inherit; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer } .sm:disabled { opacity: .45 }
.kt { border: 1px solid var(--border, #e6e6e6); border-radius: 10px; overflow: hidden; font-size: 12.5px; max-height: 150px; overflow-y: auto }
.kr { display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, 2.4fr) 56px 76px; align-items: center; height: 30px; padding: 0 6px 0 4px; border-top: 1px solid var(--border, #eee) }
.kr:first-child { border-top: 0 }
.kth { height: 24px; background: var(--surface, #f7f7f7); font-size: 10.5px; font-weight: 700; color: var(--hint, #8a8a8a); text-transform: uppercase; letter-spacing: .04em; position: sticky; top: 0 }
.num { text-align: right; font-variant-numeric: tabular-nums; padding-right: 10px }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.stt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums } .stt em { font-style: normal; font-weight: 400 }
.dot { justify-self: center; width: 7px; height: 7px; border-radius: 50%; background: #c4c4c4 }
.kr.ok .dot { background: #2fa36b } .kr.ok .stt { color: #1f8a4c }
.kr.bad .dot, .kr.wait .dot { background: #e05b5b } .kr.bad .stt, .kr.wait .stt { color: #c53030 }
.kr.cur { background: rgba(75, 141, 248, .09) } .kr.cur .stt, .kr.cur .mono { color: #2f6fe0; font-weight: 700 }
.kr.cur .dot { width: 9px; height: 9px; background: none; border: 2px solid #4b8df8; border-right-color: transparent; animation: s .7s linear infinite; box-sizing: border-box } @keyframes s { to { transform: rotate(360deg) } }
.act { display: flex; justify-content: flex-end; gap: 2px; opacity: .35; transition: opacity .15s } .kr:hover .act { opacity: 1 }
.act button { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: none; color: inherit; font-size: 12px; cursor: pointer }
.act button:hover:not(:disabled) { background: var(--surface, #f0f0f0) } .act button:disabled { opacity: .3; cursor: default }
.none { margin: 0; font-size: 13px; color: #c53030; font-weight: 700 }
@media (max-width: 560px) { .kr { grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1.4fr) 40px 70px } .kh small { display: none } }
</style>

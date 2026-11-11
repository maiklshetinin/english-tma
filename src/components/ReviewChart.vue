<script setup>
// График Review «Где сейчас слова» — тот же график, что у колод (PileChart.vue): каждое слово урока — мини-карточка
// (фото слова или текст) в стопке дня, когда его пора повторять; цвет карточки без фото — уровень (слабое / среднее / сильное).
//  • Наведение / нажатие на стопку — её слова: перевод и когда повтор; нажатие на слово — emit('pick', key)
//    (Review открывает это слово с кривой памяти; сверху урока — кривая открывается прямо под графиком).
//  • В реальном времени: слово получило ответ (свой урок или — у преподавателя — ответ ученика с сервера) → над графиком
//    строка «go ahead · верно → повтор завтра», карточка падает в свою стопку и подсвечивается.
//  • Фильтр: все / слова / фразы / один урок. Слова без ответов («новые») — в стопки не попадают, их число — снизу.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { stateOf } from '../utils/review'
import PileChart from './PileChart.vue'
import WordCurve from './WordCurve.vue'

const props = defineProps({
  items: { type: Object, required: true },             // словарь { ключ: RItem }
  cfg: { type: Object, required: true },               // { retention, maxDays }
  lesson: { type: String, default: '' },               // сразу показать только слова этого урока
  dock: Boolean,                                       // компактно — сверху урока
  tall: Boolean,                                       // высокий, без своего заголовка (счётчики — в шапке Review)
})
const emit = defineEmits(['pick'])
const DAY = 86_400_000
const now = ref(Date.now()); let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 30_000) }); onUnmounted(() => clearInterval(clock))

const filter = ref(props.lesson ? 'lesson:' + props.lesson : 'all')
watch(() => props.lesson, (v) => { if (v) filter.value = 'lesson:' + v })
const lessons = computed(() => [...new Set(Object.values(props.items).map(x => x.lesson).filter(Boolean))].sort())
const pass = (x) => filter.value === 'all' || x.kind === filter.value || (filter.value.startsWith('lesson:') && (x.lesson === filter.value.slice(7) || x.hist.some(h => h.lesson === filter.value.slice(7))))
const startOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const rel = (t) => { const d = Math.round((startOf(t) - startOf(now.value)) / DAY); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн` }

const states = computed(() => Object.values(props.items).filter(pass).map(x => ({ x, st: stateOf(x, now.value, props.cfg) })))
const fresh = computed(() => states.value.filter(r => r.st.isNew).length)
const rows = computed(() => states.value.filter(r => !r.st.isNew).map(({ x, st }) => ({
  id: x.key, front: x.text, back: x.tr, image: x.image, k: st.failed ? 'weak' : st.level, at: st.due,
  when: st.failed ? 'ошибка' : `${st.recall}% · ${rel(st.due)}`,
})))
const count = computed(() => { const o = { weak: 0, medium: 0, strong: 0 }; for (const r of rows.value) o[r.k]++; return o })

// ── в реальном времени: какое слово только что получило ответ ──
const flash = ref(null), hotId = ref(null); let flashT = null
const sig = () => Object.fromEntries(Object.values(props.items).map(x => [x.key, x.hist[0]?.t ?? 0]))
let seen = sig()
watch(() => props.items, () => {
  const cur = sig(), first = !Object.keys(seen).length, changed = Object.keys(cur).filter(k => cur[k] > (seen[k] ?? 0)); seen = cur
  if (!changed.length || first) return                    // первая загрузка словаря — это не «ответ», не подсвечиваем
  const x = props.items[changed[0]], h = x.hist[0], st = stateOf(x, Date.now(), props.cfg)
  flash.value = { text: x.text, more: changed.length - 1, ok: h.ok, what: h.ok === null ? 'встретилось — новое' : `${h.ok ? 'верно' : 'ошибка'} → повтор ${rel(st.due)}` }
  if (!st.isNew && !pass(x)) filter.value = 'all'
  hotId.value = st.isNew ? null : x.key
  clearTimeout(flashT); flashT = setTimeout(() => { flash.value = null; hotId.value = null }, 4000)
}, { deep: true })
onUnmounted(() => clearTimeout(flashT))

// сверху урока нажатое слово открывает свою кривую прямо под графиком
const sel = ref(null)
const pickW = (k) => { emit('pick', k); if (props.dock) sel.value = sel.value === k ? null : k }
</script>

<template>
  <div class="rc" :class="{ dock }">
    <div class="fl" :class="{ on: flash }" aria-live="polite"><template v-if="flash"><i :class="flash.ok === true ? 'y' : flash.ok === false ? 'x' : 'n'" /><b>{{ flash.text }}</b> · {{ flash.what }}<span v-if="flash.more"> · и ещё {{ flash.more }}</span></template></div>
    <PileChart :items="rows" :dock="dock" :tall="tall" :fresh="hotId" :order="['strong', 'medium', 'weak']" @pick="pickW">
      <template #top>
        <!-- в панели урока — одна строка, как у «Памяти словаря» и «Слово сейчас»: название + счётчики · фильтр · масштаб справа -->
        <div v-if="dock" class="hb"><b class="ttl2">Где сейчас слова</b><span class="cnt">{{ count.weak }} слаб. · {{ count.medium }} сред. · {{ count.strong }} сильн.<template v-if="fresh"> · {{ fresh }} нов.</template></span></div>
        <template v-else-if="!tall"><b class="ttl2">Где сейчас слова</b>
        <span class="cnt">{{ count.weak }} слабых · {{ count.medium }} средних · {{ count.strong }} сильных<template v-if="fresh"> · {{ fresh }} новых без ответа</template></span></template>
        <span v-else-if="fresh" class="cnt">{{ fresh }} новых без ответа</span>
        <select v-model="filter" aria-label="Какие слова"><option value="all">Все</option><option value="word">Слова</option><option value="phrase">Фразы</option><option v-for="l in lessons" :key="l" :value="'lesson:' + l">Урок: {{ l }}</option></select>
      </template>
    </PileChart>
    <p v-if="!rows.length" class="em">Пока пусто — слова появятся здесь после первого ответа в уроке.</p>
    <div v-if="dock && sel && items[sel]" class="cv"><WordCurve :item="items[sel]" :cfg="cfg" /></div>
  </div>
</template>

<style scoped>
.rc { display: grid; gap: 8px; min-width: 0; padding: 12px; border-radius: 16px; background: var(--card, #fff); box-shadow: inset 0 0 0 1px var(--border, #eef0f3) }
.rc.dock { padding: 12px 14px; border-radius: 8px; box-shadow: none; border: 1px solid var(--border) }      /* в панели «Графики» курса — строже, как остальные графики панели */
.hb { display: grid; min-width: 0; padding-right: 14px; border-right: 1px solid var(--border) }
.rc.dock .ttl2 { font-size: 16px; font-weight: 700; line-height: 1.2; white-space: nowrap } .rc.dock .cnt { font-size: 11.5px; font-weight: 500; white-space: nowrap }
.rc.dock :deep(.ttl) { display: flex; align-items: center; gap: 12px; min-width: 0 } .rc.dock select { border-radius: 6px; font-weight: 600; font-size: 12px; padding: 4px 8px }
.rc.dock :deep(.scl) { padding: 0; gap: 0; border-radius: 6px; background: none; overflow: hidden } .rc.dock :deep(.scl button) { border-radius: 0; padding: 4px 10px; font-size: 12px; font-weight: 600; color: var(--hint) }
.rc.dock :deep(.scl button + button) { border-left: 1px solid var(--border) } .rc.dock :deep(.scl button.on) { background: var(--g-seg, #f3f4f6); color: var(--text) }
.ttl2 { font-size: 15px; font-weight: 900; color: var(--text) }
.cnt { font-size: 12px; font-weight: 700; color: var(--hint) }
select { justify-self: start; width: auto; max-width: 220px; font: inherit; font-size: 12.5px; font-weight: 700; padding: 3px 8px; border-radius: 9px; border: 1px solid var(--border, #e3e6ea); background: var(--card, #fff); color: var(--text) }
.fl { height: 0; overflow: hidden; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; border-radius: 10px; background: var(--card, #fff); transition: height .2s; padding: 0 10px }
.fl.on { height: 30px; box-shadow: 0 0 0 1.5px #1cb0f6 } .fl i { flex: none; width: 9px; height: 9px; border-radius: 50% } .fl .y { background: #58cc02 } .fl .x { background: #ff4b4b } .fl .n { background: #b5bac1 }
.em { margin: 0; font-size: 13px; color: var(--hint); text-align: center }
.cv { padding: 10px; border-radius: 12px; background: var(--card, #fff); box-shadow: inset 0 0 0 1px var(--border, #eef0f3) }
</style>

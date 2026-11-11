<script setup>
// «Слово сейчас» (как в макете): слева слова ученика (вспомнит сейчас, %), справа — кривая памяти выбранного слова (WordCurve).
// В реальном времени: слово получило ответ (свой урок / ответ ученика с сервера) → оно само выбирается, и кривая сразу меняется:
// верно — подъём до 100 % и пологий спад, ошибка — то же, но память короче и повтор ближе. Нажать слово в списке — смотреть его.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { stateOf } from '../utils/review'
import WordCurve from './WordCurve.vue'

const props = defineProps({
  items: { type: Object, required: true },             // словарь { ключ: RItem }
  cfg: { type: Object, required: true },               // { retention, maxDays }
  lesson: { type: String, default: '' },               // сверху урока — слова этого урока первыми
  dock: Boolean,
  focus: { type: String, default: '' },                // ключ слова экрана, открытого в уроке сейчас — кривая сразу на нём
})
const now = ref(Date.now()); let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 30_000) }); onUnmounted(() => clearInterval(clock))
const last = (x) => x.hist[0]?.t ?? x.seen ?? 0
const inLesson = (x) => props.lesson && (x.lesson === props.lesson || x.hist.some(h => h.lesson === props.lesson))
const list = computed(() => { now.value; return Object.values(props.items).map(x => ({ x, st: stateOf(x, now.value, props.cfg) }))
  .sort((a, b) => (inLesson(b.x) - inLesson(a.x)) || last(b.x) - last(a.x)) })
const sel = ref(null)
const cur = computed(() => props.items[sel.value] ?? list.value.find(r => !r.st.isNew)?.x ?? list.value[0]?.x ?? null)
const tone = (st) => (st.isNew ? 'nw' : st.failed ? 'bad' : st.recall >= Math.round(props.cfg.retention * 100) + 3 ? 'ok' : st.recall >= Math.round(props.cfg.retention * 100) ? 'mid' : 'bad')

// новый ответ → это слово выбирается само и подсвечивается
const hot = ref(null); let t = null
const sig = () => Object.fromEntries(Object.values(props.items).map(x => [x.key, x.hist[0]?.t ?? 0]))
let seen = sig()
watch(() => props.items, () => {
  const c = sig(), first = !Object.keys(seen).length, ch = Object.keys(c).filter(k => c[k] > (seen[k] ?? 0)); seen = c
  if (first || !ch.length) return
  const k = ch.sort((a, b) => c[b] - c[a])[0]
  sel.value = k; hot.value = k; clearTimeout(t); t = setTimeout(() => { hot.value = null }, 2500)
}, { deep: true })
onUnmounted(() => clearTimeout(t))
watch(() => props.focus, (k) => { if (k && props.items[k]) sel.value = k }, { immediate: true })
const lastH = computed(() => cur.value?.hist[0])
</script>

<template>
  <div class="wnc"><div class="wn" :class="{ dock }">
    <aside class="ls">
      <b class="lt">Слова ученика</b>
      <button v-for="r in list" :key="r.x.key" class="li" :class="{ on: cur && cur.key === r.x.key, hot: hot === r.x.key }" @click="sel = r.x.key">
        <span class="t"><b>{{ r.x.text }}</b><small>{{ r.x.tr }}</small></span>
        <em :class="tone(r.st)">{{ r.st.isNew ? 'новое' : r.st.failed ? 'ошибка' : r.st.recall + '%' }}</em>
      </button>
      <p v-if="!list.length" class="em">Пока пусто — слова появятся после уроков.</p>
    </aside>
    <section v-if="cur" class="rt">
      <div class="wh"><b>{{ cur.text }}</b><small>{{ cur.tr }}<template v-if="lastH"> · последний ответ: <span :class="lastH.ok === true ? 'y' : lastH.ok === false ? 'x' : ''">{{ lastH.ok === true ? 'верно' : lastH.ok === false ? 'ошибка' : 'встретилось' }}</span> ({{ lastH.ex }})</template></small></div>
      <WordCurve :key="cur.key" :item="cur" :cfg="cfg" :fill="dock" />
    </section>
  </div></div>
</template>

<style scoped>
.wn { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 14px; min-width: 0; padding: 12px 14px; border-radius: 8px; background: var(--g-bg, #fff); color: var(--g-tx, #1f2328); border: 1px solid var(--g-bd, #e5e7eb) }
.ls { display: grid; align-content: start; gap: 6px; max-height: 470px; overflow: auto; padding-right: 2px }
.dock .ls { max-height: 330px }
/* в панели «Графики» курса: график на всю ширину, список слов — под ним плиткой */
.wn.dock { grid-template-columns: minmax(0, 1fr) } .dock .rt { order: 1 } .dock .ls { order: 2; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); max-height: 220px } .dock .lt { grid-column: 1 / -1 }
.lt { font-size: 10.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--g-mu, #6b7280); padding: 2px 4px }
.li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--g-bd, #e5e7eb); border-radius: 6px; background: var(--g-bg, #fff); color: var(--g-tx, #1f2328); font: inherit; text-align: left; cursor: pointer; transition: background .3s, border-color .3s }
.li:hover { background: var(--g-sub, #f6f7f9) } .li.on { border-color: var(--g-sel, #2563eb); box-shadow: inset 0 0 0 1px var(--g-sel, #2563eb) } .li.hot { background: rgba(245, 158, 11, .18) }
.t { display: grid; min-width: 0; flex: 1 } .t b { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .t small { font-size: 11px; font-weight: 500; color: var(--g-mu, #6b7280); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
em { font-style: normal; font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums } em.ok { color: #16a34a } em.mid { color: #d97706 } em.bad { color: #ef4444 } em.nw { color: var(--g-mu, #9aa0a8); font-size: 11px; font-weight: 500 }
.rt { display: grid; align-content: start; gap: 8px; min-width: 0 }
.wh { display: grid } .wh b { font-size: 18px; font-weight: 700 } .wh small { font-size: 12px; font-weight: 500; color: var(--g-mu, #6b7280) } .wh .y { color: #16a34a } .wh .x { color: #ef4444 }
.em { margin: 0; font-size: 13px; color: var(--g-mu, #6b7280) }
.wnc { container-type: inline-size; min-width: 0 }
@container (max-width: 600px) {
  .wn { grid-template-columns: minmax(0, 1fr) } .ls { display: flex; overflow-x: auto; max-height: none; padding-bottom: 4px } .lt { display: none }
  .li { flex: none; max-width: 170px } .dock .ls { max-height: none }
}
</style>

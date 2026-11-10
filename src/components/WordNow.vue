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
const tone = (st) => (st.isNew ? 'nw' : st.recall >= Math.round(props.cfg.retention * 100) + 3 ? 'ok' : st.recall >= Math.round(props.cfg.retention * 100) ? 'mid' : 'bad')

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
        <em :class="tone(r.st)">{{ r.st.isNew ? 'новое' : r.st.recall + '%' }}</em>
      </button>
      <p v-if="!list.length" class="em">Пока пусто — слова появятся после уроков.</p>
    </aside>
    <section v-if="cur" class="rt">
      <div class="wh"><b>{{ cur.text }}</b><small>{{ cur.tr }}<template v-if="lastH"> · последний ответ: <span :class="lastH.ok === true ? 'y' : lastH.ok === false ? 'x' : ''">{{ lastH.ok === true ? 'верно' : lastH.ok === false ? 'ошибка' : 'встретилось' }}</span> ({{ lastH.ex }})</template></small></div>
      <WordCurve :key="cur.key" :item="cur" :cfg="cfg" />
    </section>
  </div></div>
</template>

<style scoped>
.wn { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 14px; min-width: 0; padding: 12px; border-radius: 16px; background: #fff; box-shadow: inset 0 0 0 1px #eef0f3 }
.ls { display: grid; align-content: start; gap: 6px; max-height: 470px; overflow: auto; padding-right: 2px }
.dock .ls { max-height: 330px }
.lt { font-size: 12px; font-weight: 900; color: var(--hint); padding: 2px 4px }
.li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 0; border-radius: 12px; background: #f6f7f9; font: inherit; text-align: left; cursor: pointer; transition: background .3s, box-shadow .3s }
.li:hover { background: #eef4fb } .li.on { background: #eaf6fe; box-shadow: inset 0 0 0 2px #1cb0f6 } .li.hot { background: #fff3c4 }
.t { display: grid; min-width: 0; flex: 1 } .t b { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .t small { font-size: 11px; font-weight: 600; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
em { font-style: normal; font-size: 13px; font-weight: 900 } em.ok { color: #46a302 } em.mid { color: #e08600 } em.bad { color: #e53935 } em.nw { color: #9aa0a8; font-size: 11px }
.rt { display: grid; align-content: start; gap: 8px; min-width: 0 }
.wh { display: grid } .wh b { font-size: 22px; font-weight: 900 } .wh small { font-size: 12.5px; font-weight: 700; color: var(--hint) } .wh .y { color: #46a302 } .wh .x { color: #e53935 }
.em { margin: 0; font-size: 13px; color: var(--hint) }
.wnc { container-type: inline-size; min-width: 0 }
@container (max-width: 600px) {
  .wn { grid-template-columns: minmax(0, 1fr) } .ls { display: flex; overflow-x: auto; max-height: none; padding-bottom: 4px } .lt { display: none }
  .li { flex: none; max-width: 170px } .dock .ls { max-height: none }
}
</style>

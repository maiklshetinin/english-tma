<script setup>
// «Грамматика и навыки» (вкладка Review, как «Твоя грамматика» в Busuu): как ученик держит навыки и темы грамматики.
//  • Кольцо — статусы: «Необходима отработка» (пора повторить или только что ошибся), «В фазе шлифовки» (память < 21 дн),
//    «Хороший контроль» (21–89 дн), «Полностью усвоено» (от 90 дн). Это те же уровни FSRS, что у слов.
//  • Навыки (лексика, грамматика, слушание, письмо, говорение) — по типу экранов, сами; темы — из урока (utils/skills.ts).
//  • Строка — статус, вероятность вспомнить сейчас, когда повторить; нажал — кривая памяти темы (WordCurve, как у слова).
import { ref, computed } from 'vue'
import { stateOf } from '../utils/review'
import { SKILLS, TOPICS, skillKey } from '../utils/skills'
import WordCurve from './WordCurve.vue'

const props = defineProps({
  items: { type: Object, required: true },             // навыки и темы из словаря Review { ключ: RItem }
  cfg: { type: Object, required: true },               // { retention, maxDays }
})
const MASTER = 90                                      // дней памяти — «полностью усвоено»
const ST = {
  need: { t: 'Необходима отработка', c: '#ff7a7a' },
  polish: { t: 'В фазе шлифовки', c: '#ffc94a' },
  good: { t: 'Хороший контроль', c: '#7fb2f5' },
  master: { t: 'Полностью усвоено', c: '#2fd59a' },
}
function status(st) {
  if (st.isNew) return null
  if (st.failed || st.recall < Math.round(props.cfg.retention * 100)) return 'need'
  return st.stab < 21 ? 'polish' : st.stab < MASTER ? 'good' : 'master'
}
const row = (x) => { const st = stateOf(x, Date.now(), props.cfg); return { x, st, s: status(st) } }
const skills = computed(() => Object.keys(SKILLS).map(id => ({ id, t: SKILLS[id], r: props.items[skillKey(id)] ? row(props.items[skillKey(id)]) : null })))
const topics = computed(() => Object.values(props.items).filter(x => x.kind === 'topic').map(row)
  .sort((a, b) => TOPICS.findIndex(t => 'topic:' + t.id === a.x.key) - TOPICS.findIndex(t => 'topic:' + t.id === b.x.key)))
const all = computed(() => [...skills.value.map(s => s.r).filter(Boolean), ...topics.value].filter(r => r.s))
const counts = computed(() => { const o = { need: 0, polish: 0, good: 0, master: 0 }; for (const r of all.value) o[r.s]++; return o })
// кольцо: дуги по статусам
const R = 52, C = 2 * Math.PI * R
const arcs = computed(() => {
  const n = all.value.length; if (!n) return []
  let off = 0
  return Object.keys(ST).filter(k => counts.value[k]).map(k => { const len = counts.value[k] / n * C; const a = { k, len, off }; off += len; return a })
})
const open = ref(null)
const rel = (t) => { const d = Math.round((t - Date.now()) / 86_400_000); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн` }
const how = ref(false)
</script>

<template>
  <div class="sp">
    <div class="card top">
      <div class="hd"><h2>Твоя грамматика и навыки</h2><button class="lnk" @click="how = !how">Как это считается? <span>{{ how ? '▴' : '▾' }}</span></button></div>
      <div v-if="how" class="how">
        <p>Каждый проверенный ответ в уроке — оценка «верно» или «ошибка» не только словам, но и <b>навыку</b> экрана и <b>теме грамматики</b> урока. Навык — по типу экрана: «Выбери ответ» на слух — слушание, переводом — лексика; «Пары» — лексика; «Собери фразу» и «Заполни пропуск» — грамматика; «Собери слово» — письмо; «Повтори за диктором» — говорение (не проверяется — только «встречалось»). Тему урока задаёт преподаватель в редакторе курса (или она угадывается по названию урока).</p>
        <p>Дальше — как у слов: память по FSRS тает со временем и растёт от ответов через паузу. Статус: <b>отработка</b> — вероятность вспомнить ниже {{ Math.round(cfg.retention * 100) }} % или только что ошибка; <b>шлифовка</b> — память меньше 21 дня; <b>хороший контроль</b> — 21–89 дней; <b>усвоено</b> — от {{ MASTER }} дней.</p>
      </div>
      <div class="grid">
        <div class="box">
          <b class="big">{{ all.length }}</b><span>навыков и тем в работе</span>
          <small>Темы появляются, когда ученик отвечает на экраны урока с темой грамматики.</small>
        </div>
        <div class="box ring">
          <b class="rt">Освоение</b>
          <div class="rw">
            <svg viewBox="0 0 140 140" class="donut" role="img" :aria-label="Object.keys(ST).map(k => `${ST[k].t}: ${counts[k]}`).join(', ')">
              <circle cx="70" cy="70" :r="R" fill="none" stroke="#eef0f3" stroke-width="18" />
              <circle v-for="a in arcs" :key="a.k" cx="70" cy="70" :r="R" fill="none" :stroke="ST[a.k].c" stroke-width="18" :stroke-dasharray="`${a.len} ${C - a.len}`" :stroke-dashoffset="-a.off" transform="rotate(-90 70 70)" />
            </svg>
            <ul><li v-for="(v, k) in ST" :key="k"><i :style="{ background: v.c }" /><span>{{ v.t }}</span><b>{{ counts[k] }}</b></li></ul>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Навыки</h3>
      <template v-for="s in skills" :key="s.id">
        <button class="tr" :class="{ on: open === skillKey(s.id), off: !s.r }" :disabled="!s.r || !s.r.s" @click="open = open === skillKey(s.id) ? null : skillKey(s.id)">
          <span class="nm">{{ s.t }}</span>
          <template v-if="s.r && s.r.s"><span class="chip" :style="{ background: ST[s.r.s].c }">{{ ST[s.r.s].t }}</span><span class="bar"><i :style="{ width: (s.r.st.failed ? 4 : s.r.st.recall) + '%', background: ST[s.r.s].c }" /></span><b class="pc">{{ s.r.st.failed ? 'ошибка' : s.r.st.recall + '%' }}</b><small class="dd">{{ rel(s.r.st.due) }}</small></template>
          <small v-else class="na">{{ s.id === 'speaking' && s.r ? 'не проверяется — только «встречалось»' : 'ещё нет ответов' }}</small>
        </button>
        <div v-if="open === skillKey(s.id) && s.r" class="cv"><WordCurve :item="s.r.x" :cfg="cfg" /></div>
      </template>
    </div>

    <div class="card">
      <h3>Темы грамматики</h3>
      <p v-if="!topics.length" class="em">Пока нет. Тема появится после ответов на экраны урока с темой — её задаёт преподаватель в редакторе курса (у урока, рядом с названием) или она угадывается по названию урока, например «Present Perfect».</p>
      <template v-for="r in topics" :key="r.x.key">
        <button class="tr" :class="{ on: open === r.x.key }" :disabled="!r.s" @click="open = open === r.x.key ? null : r.x.key">
          <span class="nm">{{ r.x.text }}<small>{{ r.x.tr }}</small></span>
          <template v-if="r.s"><span class="chip" :style="{ background: ST[r.s].c }">{{ ST[r.s].t }}</span><span class="bar"><i :style="{ width: (r.st.failed ? 4 : r.st.recall) + '%', background: ST[r.s].c }" /></span><b class="pc">{{ r.st.failed ? 'ошибка' : r.st.recall + '%' }}</b><small class="dd">{{ rel(r.st.due) }}</small></template>
          <small v-else class="na">встречалась, ответов ещё нет</small>
        </button>
        <div v-if="open === r.x.key" class="cv"><WordCurve :item="r.x" :cfg="cfg" /></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sp { display: grid; gap: 12px; min-width: 0 }
.card { background: #fff; border-radius: 18px; padding: 18px; box-shadow: 0 1px 0 rgba(0, 0, 0, .04), 0 6px 22px rgba(0, 0, 0, .05); display: grid; gap: 8px; min-width: 0 }
.hd { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap }
h2 { margin: 0; font-size: 24px; font-weight: 900 } h3 { margin: 0 0 4px; font-size: 18px; font-weight: 900 }
.lnk { all: unset; cursor: pointer; font-size: 13px; font-weight: 800; color: #1278b0; text-decoration: underline } .lnk span { font-size: 11px; text-decoration: none }
.how { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; background: #f6f8fa } .how p { margin: 0; font-size: 13px; line-height: 1.5; color: #444 }
.grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 12px }
.box { display: grid; align-content: start; gap: 6px; padding: 16px; border-radius: 14px; box-shadow: inset 0 0 0 1px #e8eaee }
.big { font-size: 40px; font-weight: 900; line-height: 1 } .box > span { font-size: 15px; font-weight: 700; color: #444 } .box > small { font-size: 12.5px; font-weight: 600; color: var(--hint); line-height: 1.45 }
.rt { font-size: 16px; font-weight: 900 }
.rw { display: flex; align-items: center; gap: 18px; flex-wrap: wrap }
.donut { width: 140px; height: 140px; flex: none }
.rw ul { flex: 1; min-width: 170px; margin: 0; padding: 0; list-style: none; display: grid; gap: 8px }
.rw li { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: #444 } .rw li i { flex: none; width: 13px; height: 13px; border-radius: 50% } .rw li span { flex: 1 } .rw li b { font-size: 14px }
.tr { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 10px; border: 0; border-radius: 12px; background: none; font: inherit; text-align: left; cursor: pointer; border-top: 1px solid #f0f1f3 }
.tr:hover:not(:disabled), .tr.on { background: #f4f8fd } .tr:disabled { cursor: default }
.nm { width: 34%; min-width: 120px; display: grid; font-size: 14.5px; font-weight: 800 } .nm small { font-size: 11px; font-weight: 700; color: var(--hint) }
.chip { flex: none; font-size: 11px; font-weight: 900; color: #2f2f2f; padding: 2px 8px; border-radius: 8px }
.bar { flex: 1; min-width: 60px; height: 8px; border-radius: 99px; background: #eef0f3; overflow: hidden } .bar i { display: block; height: 100% }
.pc { width: 54px; text-align: right; font-size: 14px; font-weight: 900 } .dd { width: 76px; text-align: right; font-size: 12px; font-weight: 700; color: var(--hint) }
.na { font-size: 12.5px; font-weight: 600; color: var(--hint) } .tr.off .nm { color: #9aa0a8 }
.cv { padding: 10px; border-radius: 12px; background: #fafbfc; box-shadow: inset 0 0 0 1px #eef0f3 }
.em { margin: 0; font-size: 13px; color: var(--hint); line-height: 1.5 }
@media (max-width: 600px) { .grid { grid-template-columns: minmax(0, 1fr) } .nm { width: 100% } .dd { width: auto } h2 { font-size: 20px } }
</style>

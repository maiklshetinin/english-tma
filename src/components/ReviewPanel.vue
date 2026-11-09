<script setup>
// Review — как «Your vocabulary» в Busuu: слова и фразы из пройденных уроков, сила каждого (слабое / среднее / сильное).
// Нажал на строку — история: где встречалось, верно / ошибка, когда повторить. Пока — данные этого браузера (stores/review.ts).
import { ref, computed } from 'vue'
import { review, resetReview } from '../stores/review'
import { strengthNow, levelOf } from '../utils/review'

const props = defineProps({ resolve: { type: Function, required: true } })
const LV = { weak: { t: 'Слабое', n: 1 }, medium: { t: 'Среднее', n: 2 }, strong: { t: 'Сильное', n: 3 } }
const filter = ref('all'), openKey = ref(null)
const list = computed(() => Object.values(review.items).map(x => { const s = strengthNow(x); return { ...x, now: s, lv: levelOf(s) } })
  .sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })))
const count = (lv) => list.value.filter(x => x.lv === lv).length
const max = computed(() => Math.max(1, ...['weak', 'medium', 'strong'].map(count)))
const shown = computed(() => list.value.filter(x => filter.value === 'all' || x.kind === filter.value || x.lv === filter.value))
const FILTERS = computed(() => [['all', 'Все'], ['word', 'Слова'], ['phrase', 'Фразы'], ['weak', 'Слабые'], ['medium', 'Средние'], ['strong', 'Сильные']]
  .map(([k, t]) => ({ k, t: `${t} (${k === 'all' ? list.value.length : list.value.filter(x => x.kind === k || x.lv === k).length})` })))
let au = null
const play = (x) => { if (!x.audio) return; au?.pause(); au = new Audio(props.resolve(x.audio, 'audio')); au.play().catch(() => {}) }
const days = (t) => { const d = Math.round((t - Date.now()) / 86_400_000); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн.` }
const when = (t) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const reset = () => { resetReview(); openKey.value = null }
</script>

<template>
  <div class="rv">
    <div class="rcard">
      <h2>Твой словарь</h2>
      <div class="lv3">
        <div v-for="lv in ['weak', 'medium', 'strong']" :key="lv" class="lvc" :class="lv" role="button" tabindex="0" @click="filter = filter === lv ? 'all' : lv">
          <span class="jar"><i :style="{ height: (count(lv) ? Math.max(8, count(lv) / max * 100) : 0) + '%' }" /></span>
          <span><b>{{ count(lv) }}</b>{{ { weak: 'слабых', medium: 'средних', strong: 'сильных' }[lv] }}</span>
        </div>
      </div>
    </div>

    <div class="rcard">
      <div class="rbar">
        <label for="rv-filter">Показать:</label>
        <select id="rv-filter" v-model="filter"><option v-for="f in FILTERS" :key="f.k" :value="f.k">{{ f.t }}</option></select>
        <span class="sp" />
        <button class="ghost" title="Только для проверки алгоритма" @click="reset">Очистить</button>
        <button class="go" disabled title="Следующим шагом: короткая тренировка из слабых слов">Повторить сейчас</button>
      </div>
      <p v-if="!list.length" class="empty">Пока пусто. Пройдите урок курса — слова и фразы из его экранов появятся здесь: новые — слабыми, верные ответы делают их сильнее.</p>
      <div v-else class="tbl">
        <div class="th"><span /><span>Английский</span><span>Перевод</span><span>Сила</span></div>
        <template v-for="x in shown" :key="x.key">
          <div class="tr" :class="{ on: openKey === x.key }" role="button" tabindex="0" @click="openKey = openKey === x.key ? null : x.key">
            <span class="pic"><img v-if="x.image && resolve(x.image, 'image')" :src="resolve(x.image, 'image')" alt="" /><i v-else>{{ x.kind === 'phrase' ? 'Фр' : 'Сл' }}</i></span>
            <span class="w"><button v-if="x.audio" class="pl" title="Послушать" @click.stop="play(x)"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg></button>{{ x.text }}</span>
            <span class="t">{{ x.tr }}</span>
            <span class="str" :class="x.lv"><i v-for="n in 3" :key="n" :class="{ f: n <= LV[x.lv].n }" />{{ LV[x.lv].t }}</span>
          </div>
          <div v-if="openKey === x.key" class="det">
            <p><b>Сила {{ x.now }}/100</b> · верно {{ x.ok }}, ошибок {{ x.bad }} · повторить {{ days(x.due) }} · {{ x.kind === 'phrase' ? 'фраза' : 'слово' }}</p>
            <ul><li v-for="(h, k) in x.hist" :key="k"><span :class="h.ok === null ? 'n' : h.ok ? 'y' : 'x'">{{ h.ok === null ? 'встретилось' : h.ok ? 'верно' : 'ошибка' }}</span>{{ h.ex }}<template v-if="h.lesson"> · {{ h.lesson }}</template><small>{{ when(h.t) }}</small></li></ul>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rv { width: 100%; max-width: 760px; margin: 0 auto; display: grid; gap: 12px }
.rcard { background: #fff; border-radius: 18px; padding: 18px; box-shadow: 0 1px 0 rgba(0, 0, 0, .04), 0 6px 22px rgba(0, 0, 0, .05); display: grid; gap: 14px }
h2 { margin: 0; font-size: 24px; font-weight: 900 }
.lv3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px }
.lvc { display: flex; align-items: flex-end; gap: 10px; cursor: pointer; border-radius: 12px; padding: 4px }
.lvc:hover { background: #f5f6f8 }
.jar { position: relative; flex: none; width: 54px; height: 72px; border-radius: 10px; border: 2px solid #e3e6ea; overflow: hidden; background: #fff }
.jar i { position: absolute; left: 0; right: 0; bottom: 0; transition: height .3s }
.weak .jar i { background: #ff4b4b } .medium .jar i { background: #ff9600 } .strong .jar i { background: #58cc02 }
.lvc > span:last-child { display: grid; font-size: 13px; font-weight: 700; color: var(--hint) } .lvc b { font-size: 24px; font-weight: 900; color: var(--text) }
.rbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; font-weight: 700 }
.rbar select { width: auto; font: inherit; padding: 5px 8px; border-radius: 9px; border: 1.5px solid #e3e6ea; background: #fff }
.sp { flex: 1 }
.go, .ghost { border: 0; border-radius: 12px; padding: 8px 14px; font: inherit; font-weight: 900; cursor: pointer }
.go { background: #1cb0f6; color: #fff } .go:disabled { opacity: .45; cursor: default } .ghost { background: #f0f1f3; color: #555 }
.empty { margin: 0; color: var(--hint); font-weight: 600; font-size: 14px; line-height: 1.45 }
.tbl { display: grid; font-size: 14px }
.th, .tr { display: grid; grid-template-columns: 52px minmax(0, 1.3fr) minmax(0, 1fr) 118px; gap: 10px; align-items: center; padding: 8px 4px; border-bottom: 1px solid #eef0f2 }
.th { font-size: 12px; font-weight: 700; color: var(--hint) }
.tr { cursor: pointer; border-radius: 10px } .tr:hover, .tr.on { background: #f3f8fd }
.pic { width: 52px; height: 36px; border-radius: 7px; overflow: hidden; background: #eef0f2; display: grid; place-items: center }
.pic img { width: 100%; height: 100%; object-fit: cover } .pic i { font-style: normal; font-size: 11px; font-weight: 900; color: #9aa0a8 }
.w { display: flex; align-items: center; gap: 8px; font-weight: 800; min-width: 0; overflow-wrap: anywhere }
.pl { flex: none; width: 26px; height: 26px; border-radius: 50%; border: 0; background: #1cb0f6; display: grid; place-items: center; cursor: pointer; padding: 0 }
.pl svg { width: 13px; height: 13px; fill: #fff }
.t { color: var(--hint); font-weight: 600; min-width: 0; overflow-wrap: anywhere }
.str { display: flex; align-items: flex-end; gap: 2px; font-size: 13px; font-weight: 700 }
.str i { width: 4px; border-radius: 1px; background: #dfe2e6 } .str i:nth-child(1) { height: 6px } .str i:nth-child(2) { height: 9px } .str i:nth-child(3) { height: 12px; margin-right: 6px }
.str.weak i.f { background: #ff4b4b } .str.medium i.f { background: #ff9600 } .str.strong i.f { background: #58cc02 }
.det { padding: 8px 12px 12px 66px; display: grid; gap: 6px; font-size: 13px; border-bottom: 1px solid #eef0f2 }
.det p { margin: 0 } .det ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px }
.det li { display: flex; gap: 8px; align-items: center; font-weight: 600 } .det li small { margin-left: auto; color: var(--hint) }
.det li span { font-size: 11px; font-weight: 900; padding: 1px 7px; border-radius: 7px; color: #fff } .det .y { background: #58cc02 } .det .x { background: #ff4b4b } .det .n { background: #b5bac1 }
@media (max-width: 520px) { .th, .tr { grid-template-columns: 40px minmax(0, 1fr) 88px } .th span:nth-child(3), .tr .t { display: none } .pic { width: 40px } .det { padding-left: 8px } }
</style>

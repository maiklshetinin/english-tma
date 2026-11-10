<script setup>
// Review — как «Your vocabulary» в Busuu: слова и фразы из пройденных уроков, сила каждого (слабое / среднее / сильное).
// Нажал на строку — история: где встречалось, верно / ошибка, когда повторить. Пока — данные этого браузера (stores/review.ts).
import { ref, computed } from 'vue'
import { review, resetReview } from '../stores/review'
import { ask } from '../composables/useDialog'
import { showToast } from '../composables/useToast'
import { stateOf, LV_DAYS } from '../utils/review'
import { algo } from '../stores/review'
import WordCurve from './WordCurve.vue'
import ReviewChart from './ReviewChart.vue'
import { nextTick } from 'vue'

const props = defineProps({
  resolve: { type: Function, required: true },
  items: { type: Object, default: null },            // словарь ученика (карточка ученика у преподавателя); нет — свой
  readonly: Boolean,                                  // только посмотреть: без «Очистить» и «Повторить сейчас»
  title: { type: String, default: 'Твой словарь' },
})
const LV = { weak: { t: 'Слабое', n: 1 }, medium: { t: 'Среднее', n: 2 }, strong: { t: 'Сильное', n: 3 } }
const filter = ref('all'), openKey = ref(null), how = ref(false)
const chartOn = ref((() => { try { return localStorage.getItem('tma.review.chart') !== '0' } catch { return true } })())
const toggleChart = () => { chartOn.value = !chartOn.value; try { localStorage.setItem('tma.review.chart', chartOn.value ? '1' : '0') } catch { /* приватный режим */ } }
const cfgNow = computed(() => ({ retention: algo.retention, maxDays: algo.maxDays }))
// нажали слово на графике — открыть его строку с кривой памяти
async function pick(key) { filter.value = 'all'; openKey.value = key; await nextTick(); document.querySelector(`[data-rk="${CSS.escape(key)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
const list = computed(() => { const now = Date.now(), cfg = { ...algo }; return Object.values(props.items ?? review.items).map(x => { const st = stateOf(x, now, cfg); return { ...x, st, lv: st.level } })
  .sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })) })
const count = (lv) => list.value.filter(x => x.lv === lv).length
const max = computed(() => Math.max(1, ...['weak', 'medium', 'strong'].map(count)))
const shown = computed(() => list.value.filter(x => filter.value === 'all' || x.kind === filter.value || x.lv === filter.value))
const FILTERS = computed(() => [['all', 'Все'], ['word', 'Слова'], ['phrase', 'Фразы'], ['weak', 'Слабые'], ['medium', 'Средние'], ['strong', 'Сильные']]
  .map(([k, t]) => ({ k, t: `${t} (${k === 'all' ? list.value.length : list.value.filter(x => x.kind === k || x.lv === k).length})` })))
let au = null
const play = (x) => { if (!x.audio) return; au?.pause(); au = new Audio(props.resolve(x.audio, 'audio')); au.play().catch(() => {}) }
const dd = (d) => d < 1 ? 'меньше дня' : d < 31 ? `${Math.round(d)} дн.` : d < 365 ? `${Math.round(d / 30.4)} мес.` : `${(d / 365).toFixed(1).replace('.0', '')} г.`
const days = (t) => { const d = Math.round((t - Date.now()) / 86_400_000); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн.` }
const when = (t) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
// «Очистить» — с подтверждением; удаляется весь словарь (и на сервере), прохождение курса не меняется
async function reset() {
  if (!(await ask('Очистить словарь?', { text: 'Все слова и фразы и их сила удалятся — и на сервере, на всех устройствах. Прохождение курса не меняется.', ok: 'Очистить', danger: true }))) return
  openKey.value = null
  if (await resetReview()) showToast('Словарь очищен')
  else showToast('Не удалось очистить на сервере — попробуйте ещё раз', null, 'bad')
}
</script>

<template>
  <div class="rv">
    <div class="rcard">
      <h2>{{ title }}<small v-if="!items && review.sync !== 'local'" class="sy" :class="review.sync">{{ { loading: 'загрузка…', synced: 'сохранено', error: 'не сохранено — повторим' }[review.sync] }}</small></h2>
      <div class="lv3">
        <div v-for="lv in ['weak', 'medium', 'strong']" :key="lv" class="lvc" :class="lv" role="button" tabindex="0" @click="filter = filter === lv ? 'all' : lv">
          <span class="jar"><i :style="{ height: (count(lv) ? Math.max(8, count(lv) / max * 100) : 0) + '%' }" /></span>
          <span><b>{{ count(lv) }}</b>{{ { weak: 'слабых', medium: 'средних', strong: 'сильных' }[lv] }}</span>
        </div>
      </div>
      <template v-if="chartOn && list.length">
        <ReviewChart :items="items ?? review.items" :cfg="cfgNow" @pick="pick" />
      </template>
      <div class="hbs"><button class="howb" :aria-expanded="chartOn" @click="toggleChart">График <span>{{ chartOn ? '▴' : '▾' }}</span></button>
      <button class="howb" :aria-expanded="how" @click="how = !how">Как это работает <span>{{ how ? '▴' : '▾' }}</span></button></div>
      <div v-if="how" class="how">
        <p><b>1. Что сюда попадает.</b> Каждое слово и фраза из экранов уроков, которые ты прошёл: «Новое слово», «Подсказка», «Выбери ответ», «Пары», «Собери слово / фразу», «Заполни пропуск», «Повтори». Одно-два слова — это <i>слово</i>, длиннее — <i>фраза</i>. Одинаковые записи (без учёта регистра и точки в конце) — одна строка.</p>
        <p><b>2. Память по FSRS</b> — тот же алгоритм, что в Anki. У слова есть стабильность (за сколько дней вероятность вспомнить падает до 90 %) и сложность. Верный ответ — оценка «Хорошо», ошибка — «Снова». Экраны без проверки («Новое слово», «Подсказка», «Повтори») только знакомят — слово «новое». В «Парах» каждая пара считается отдельно. Повтор в тот же день память почти не растит — укрепляют повторы через паузу.</p>
        <p><b>3. Уровни.</b> Стабильность меньше {{ LV_DAYS.medium }} дней — слабое, {{ LV_DAYS.medium }}–{{ LV_DAYS.strong - 1 }} — среднее, от {{ LV_DAYS.strong }} — сильное. Банки сверху показывают, сколько слов в каждом; нажми банку — список отфильтруется.</p>
        <p><b>4. Когда повторить.</b> Когда вероятность вспомнить упадёт до {{ Math.round(algo.retention * 100) }} % (настройка преподавателя). После первого верного ответа это пара дней, дальше — недели и месяцы.</p>
        <p><b>5. Забывание.</b> Вероятность вспомнить тает каждый день по кривой забывания; ошибка снижает стабильность, и повтор приближается.</p>
        <p><b>6. Ошибка в уроке.</b> Экран повторяется в конце урока, пока не ответишь верно (каждая попытка записывается сюда), и попадает в чекпоинт своей Chapter — чекпоинт собирается сам, когда его открываешь.</p>
        <p><b>7. Чекпоинт.</b> Итог Chapter собирается сам, когда его открываешь: экраны её уроков, где ты ошибался; ошибок не было — до 8 проверяемых заданий из её уроков; в уроках нет проверяемых экранов — чекпоинт проходится кнопкой «Готово — дальше». Пока засчитывается при любом результате (порог 80 % — в планах). </p>
        <p><b>8. Нажми на строку</b> — увидишь историю: где встречалось, верно или ошибка, когда повторить.</p>
        <p><router-link :to="{ name: 'review-algo' }" class="al">Алгоритм повторений — настройки, описание и история ›</router-link></p>
        <p class="nt">Словарь хранится на сервере у каждого ученика (без сети ответы ждут в браузере и уходят потом); преподаватель видит его в карточке ученика → «Review». «Повторить сейчас» — короткая тренировка из слабых слов — следующим шагом.</p>
      </div>
    </div>

    <div class="rcard">
      <div class="rbar">
        <label for="rv-filter">Показать:</label>
        <select id="rv-filter" v-model="filter"><option v-for="f in FILTERS" :key="f.k" :value="f.k">{{ f.t }}</option></select>
        <span class="sp" />
        <slot name="actions" />          <!-- карточка ученика: «Сбросить прогресс» -->
        <template v-if="!readonly"><button class="ghost" title="Только для проверки алгоритма" @click="reset">Очистить</button>
        <button class="go" disabled title="Следующим шагом: короткая тренировка из слабых слов">Повторить сейчас</button></template>
      </div>
      <p v-if="!list.length && readonly" class="empty">Пока пусто — слова появятся, когда ученик пройдёт уроки курса.</p>
      <p v-else-if="!list.length" class="empty">Пока пусто. Пройдите урок курса — слова и фразы из его экранов появятся здесь: новые — слабыми, верные ответы делают их сильнее.</p>
      <div v-else class="tbl">
        <div class="th"><span /><span>Английский</span><span>Перевод</span><span>Сила</span></div>
        <template v-for="x in shown" :key="x.key">
          <div class="tr" :data-rk="x.key" :class="{ on: openKey === x.key }" role="button" tabindex="0" @click="openKey = openKey === x.key ? null : x.key">
            <span class="pic"><img v-if="x.image && resolve(x.image, 'image')" :src="resolve(x.image, 'image')" alt="" /><i v-else>{{ x.kind === 'phrase' ? 'Фр' : 'Сл' }}</i></span>
            <span class="w"><button v-if="x.audio" class="pl" title="Послушать" @click.stop="play(x)"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg></button><span class="wt">{{ x.text }}<small v-if="x.tr" class="mt">{{ x.tr }}</small></span></span>
            <span class="t">{{ x.tr }}</span>
            <span class="str" :class="x.lv"><i v-for="n in 3" :key="n" :class="{ f: !x.st.isNew && n <= LV[x.lv].n }" />{{ x.st.isNew ? 'Новое' : LV[x.lv].t }}</span>
          </div>
          <div v-if="openKey === x.key" class="det">
            <p v-if="x.st.isNew"><b>Новое</b> — только встречалось; первый ответ в уроке запустит отсчёт · {{ x.kind === 'phrase' ? 'фраза' : 'слово' }}</p>
            <p v-else><b>{{ x.st.failed ? 'Только что: ошибка' : `Вспомнит сейчас: ${x.st.recall} %` }}</b> · память ~{{ dd(x.st.stab) }} · повторить {{ days(x.st.due) }} · верно {{ x.ok }}, ошибок {{ x.bad }} · {{ x.kind === 'phrase' ? 'фраза' : 'слово' }}</p>
            <WordCurve v-if="!x.st.isNew" :item="x" :cfg="cfgNow" />
            <ul><li v-for="(h, k) in x.hist" :key="k"><span :class="h.ok === null ? 'n' : h.ok ? 'y' : 'x'">{{ h.ok === null ? 'встретилось' : h.ok ? 'верно' : 'ошибка' }}</span>{{ h.ex }}<template v-if="h.lesson"> · {{ h.lesson }}</template><small>{{ when(h.t) }}</small></li></ul>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sy { margin-left: 10px; font-size: 12px; font-weight: 800; color: var(--hint); vertical-align: middle } .sy.synced { color: #1fbe78 } .sy.error { color: #ff9600 }
.al { color: #1cb0f6; font-weight: 800; text-decoration: none }
.vt { display: flex; gap: 4px; padding: 3px; border-radius: 12px; background: #f2f3f5; width: max-content; max-width: 100% }
.vt button { font: inherit; font-size: 13px; font-weight: 800; border: 0; border-radius: 9px; padding: 6px 14px; background: none; color: #5f6368; cursor: pointer } .vt button.on { background: #fff; color: #1278b0; box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.hbs { display: flex; gap: 18px; flex-wrap: wrap }
.howb { all: unset; cursor: pointer; margin-top: 4px; font-size: 13px; font-weight: 800; color: #1cb0f6 } .howb span { font-size: 11px }
.how { margin-top: 10px; display: grid; gap: 7px; padding: 12px 14px; border-radius: 12px; background: #f6f8fa } .how p { margin: 0; font-size: 13px; line-height: 1.45; color: #444 } .how b { color: #222 } .how .nt { color: #777; font-size: 12px }
.rv { width: 100%; max-width: 760px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0 }          /* minmax(0) — на телефоне ничего не распирает за край */
.rcard { min-width: 0; background: #fff; border-radius: 18px; padding: 18px; box-shadow: 0 1px 0 rgba(0, 0, 0, .04), 0 6px 22px rgba(0, 0, 0, .05); display: grid; gap: 14px }
h2 { margin: 0; font-size: 24px; font-weight: 900 }
.lv3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px }
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
.wt { display: grid; min-width: 0 } .mt { display: none; font-size: 12px; font-weight: 600; color: var(--hint) }          /* перевод под словом — на телефоне, где колонки «Перевод» нет */
.t { color: var(--hint); font-weight: 600; min-width: 0; overflow-wrap: anywhere }
.str { display: flex; align-items: flex-end; gap: 2px; font-size: 13px; font-weight: 700 }
.str i { width: 4px; border-radius: 1px; background: #dfe2e6 } .str i:nth-child(1) { height: 6px } .str i:nth-child(2) { height: 9px } .str i:nth-child(3) { height: 12px; margin-right: 6px }
.str.weak i.f { background: #ff4b4b } .str.medium i.f { background: #ff9600 } .str.strong i.f { background: #58cc02 }
.det { padding: 8px 12px 12px 66px; display: grid; gap: 6px; font-size: 13px; border-bottom: 1px solid #eef0f2 }
.det p { margin: 0 } .det ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px }
.det li { display: flex; gap: 8px; align-items: center; font-weight: 600 } .det li small { margin-left: auto; color: var(--hint) }
.det li span { font-size: 11px; font-weight: 900; padding: 1px 7px; border-radius: 7px; color: #fff } .det .y { background: #58cc02 } .det .x { background: #ff4b4b } .det .n { background: #b5bac1 }
@media (max-width: 520px) {
  .rcard { padding: 14px; gap: 12px } h2 { font-size: 21px }
  .lv3 { gap: 6px } .lvc { gap: 6px; padding: 2px } .jar { width: 34px; height: 48px; border-radius: 8px } .lvc b { font-size: 19px } .lvc > span:last-child { font-size: 11.5px }
  .rbar .sp { flex-basis: 100%; height: 0 } .rbar .go, .rbar .ghost { flex: 1; padding: 9px 10px }
  .mt { display: block }
  .th, .tr { grid-template-columns: 40px minmax(0, 1fr) 88px } .th span:nth-child(3), .tr .t { display: none } .pic { width: 40px } .det { padding-left: 8px } }
</style>

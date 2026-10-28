<script setup>
// Сессия повторения как в Anki: очередь пересчитывается после каждого ответа (изучаю, чьё время пришло → к повторению → новые),
// карточка на шаге «1 мин / 10 мин» возвращается сама, когда подойдёт её время; «Показать ответ», 4 оценки с интервалами,
// счётчики «новые / изучаю / к повторению». Сверху — общая панель: график колоды и ✏️ правка карточки. Клавиши: Пробел — ответ/«Хорошо», 1–4 — оценка, R — звук.
// Используется и во вкладке «Слова», и внутри кружка пути (embedded).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { buildQueue, srsOf, kindOf, rate, intervalLabel, nextDueInfo, deckCounts, nextLearnAt } from '../composables/useSrs'
import { imageSrc, audioSrc } from '../utils/media'
import AppIcon from './AppIcon.vue'
import CardEditor from './CardEditor.vue'
import DeckChart from './DeckChart.vue'
const props = defineProps({ deck: { type: Object, required: true }, userKey: { type: [String, Number], required: true }, canEdit: Boolean, embedded: Boolean })
const emit = defineEmits(['finish', 'exit'])

const queue = ref(buildQueue(props.deck, props.userKey))
const flipped = ref(false), answered = ref(0), editing = ref(false)
const card = computed(() => queue.value[0])
const kind = (c) => kindOf(srsOf(props.userKey, c))
const counts = computed(() => { tick.value; const c = deckCounts(props.deck, props.userKey); return { new: c.new, learn: c.learn, due: c.due } })
// Часы сессии: раз в секунду — чтобы карточка на шаге изучения вернулась сама, когда подойдёт её время, и шёл обратный отсчёт
const tick = ref(Date.now()); let clock = null
const refill = () => { if (!card.value) queue.value = buildQueue(props.deck, props.userKey) }
const waitAt = computed(() => { tick.value; return card.value ? null : nextLearnAt(props.deck, props.userKey) })
const waitLeft = computed(() => { if (!waitAt.value) return ''; const s = Math.max(0, Math.round((waitAt.value - tick.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
const cur = computed(() => card.value && { new: 'new', learn: 'learn', review: 'due' }[kind(card.value)])
const GRADES = [{ q: 0, t: 'Снова' }, { q: 1, t: 'Трудно' }, { q: 2, t: 'Хорошо' }, { q: 3, t: 'Легко' }]
const next = computed(() => nextDueInfo(props.deck, props.userKey))

// Фото и озвучка (необязательны). Озвучка слова включается сама при показе карточки (можно выключить), 🔊 — повторить.
const hasAudio = computed(() => props.deck.cards.some((c) => c.audio))
const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v) } catch { return null } }
// График колоды — сверху, над карточкой: видно, куда ответ «отбросил» слово. Открыт/закрыт — запоминается
const chartOpen = ref(store('tma.chartOpen') === '1')
watch(chartOpen, (v) => store('tma.chartOpen', v ? '1' : '0'))
const autoplay = ref(store('tma.autoplay') !== 'off')
const toggleAuto = () => { autoplay.value = !autoplay.value; store('tma.autoplay', autoplay.value ? 'on' : 'off') }
const imgBad = ref(false)
// Пример: после ответа показан перевод; клик по примеру переключает его на английский и обратно
const exAlt = ref(false)
const sentText = computed(() => {
  const c = card.value; if (!c) return ''
  return flipped.value && c.exampleTr && !exAlt.value ? c.exampleTr : c.example
})
const canToggleEx = computed(() => flipped.value && !!card.value?.exampleTr && !!card.value?.example)
const toggleEx = () => { if (canToggleEx.value) exAlt.value = !exAlt.value }
watch([card, flipped], () => { exAlt.value = false })
let au = null
function play() {
  const c = card.value; if (!c?.audio) return
  try { au?.pause(); au = new Audio(audioSrc(c.audio)); au.play().catch(() => {}) } catch { /* звук необязателен */ }      // автозапуск может быть запрещён браузером — не страшно
}
watch(card, (c) => {
  imgBad.value = false
  if (autoplay.value && c?.audio) play()
  const n = queue.value[1]; if (n?.image) new Image().src = imageSrc(n.image)       // следующее фото грузится заранее
}, { immediate: true })

function answer(q) {
  const c = card.value; if (!c || !flipped.value) return
  rate(props.userKey, c, q); answered.value++; flipped.value = false
  queue.value = buildQueue(props.deck, props.userKey)                              // как в Anki: «Снова» вернётся через 1 мин, «Хорошо» на шаге — через 10 мин
}
function onKey(e) {
  if (editing.value || e.metaKey || e.ctrlKey || e.altKey) return
  const tag = e.target?.tagName
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return
  if ((e.key === 'r' || e.key === 'к') && card.value?.audio) return play()
  if (!card.value) return
  if (e.key === ' ' || e.key === 'Enter') {
    if (tag === 'BUTTON') return                                  // фокус на кнопке — пусть сработает сама кнопка
    e.preventDefault(); flipped.value ? answer(2) : (flipped.value = true)
  } else if (flipped.value && /^[1-4]$/.test(e.key)) answer(+e.key - 1)
}
onMounted(() => { addEventListener('keydown', onKey); clock = setInterval(() => { tick.value = Date.now(); refill() }, 1000) })
onUnmounted(() => { removeEventListener('keydown', onKey); au?.pause(); clearInterval(clock) })
</script>

<template>
  <div class="ss">
    <header class="bar">
      <button class="btn ghost sm" @click="emit('exit')"><AppIcon name="back" :size="18" /> {{ embedded ? 'Закрыть' : 'Колоды' }}</button>
      <b class="dt">{{ deck.title }}</b>
      <!-- Общая панель инструментов: график колоды и правка текущей карточки -->
      <span class="tb">
        <button class="ib" :class="{ on: chartOpen }" :aria-pressed="chartOpen" aria-label="График колоды" title="График: когда повторять каждое слово" @click="chartOpen = !chartOpen"><AppIcon name="chart" :size="18" /></button>
        <button v-if="canEdit && card" class="ib" aria-label="Править карточку" title="Править карточку" @click="editing = true"><AppIcon name="pencil" :size="17" /></button>
      </span>
      <span class="cnt" aria-label="Новые, изучаю, к повторению">
        <b class="n" :class="{ on: cur === 'new' }">{{ counts.new }}</b><b class="l" :class="{ on: cur === 'learn' }">{{ counts.learn }}</b><b class="d" :class="{ on: cur === 'due' }">{{ counts.due }}</b>
      </span>
    </header>
    <!-- График колоды — сверху, над карточкой (как статистика в списке колод): ответили — видно, куда ушло слово -->
    <DeckChart v-if="chartOpen" :deck="deck" :user-key="userKey" :current-id="card?.id ?? null" dock @back="chartOpen = false" @reset="queue = buildQueue(deck, userKey); flipped = false" />

    <template v-if="card">
      <!-- Как в Anki: слово и перевод — над фото, пример — под ним. Все блоки на месте до и после «Показать ответ», поэтому ничего не прыгает -->
      <div class="card face" @click="flipped = true">
        <div class="head">
          <div class="wd"><div class="q">{{ card.front }}</div><button v-if="card.audio" class="spk" aria-label="Озвучить слово" title="Озвучить (R)" @click.stop="play">🔊</button></div>
          <div class="a" :class="{ hid: !flipped }">{{ card.back }}</div>
        </div>
        <div v-if="card.image && !imgBad" class="media"><img :key="card.id" class="pic" :src="imageSrc(card.image)" alt="" @error="imgBad = true" /></div>
        <div class="sent" :class="{ tap: canToggleEx }" :title="canToggleEx ? 'Нажмите, чтобы переключить язык примера' : ''" @click.stop="toggleEx">{{ sentText }}</div>
      </div>
      <!-- «Показать ответ» и четыре оценки — в одном месте и одной высоты: нажатие меняет кнопки, но ничего не двигает -->
      <div class="dock">
        <button v-if="!flipped" class="btn show" @click="flipped = true">Показать ответ</button>
        <div v-else class="grades">
          <button v-for="g in GRADES" :key="g.q" :class="['g', 'g' + g.q]" @click="answer(g.q)">{{ g.t }}<small>{{ intervalLabel(userKey, card, g.q) }}</small></button>
        </div>
      </div>
      <div class="tools" :class="{ only: !hasAudio }">
        <button v-if="hasAudio" @click="toggleAuto">🔊 Автозвук: {{ autoplay ? 'вкл' : 'выкл' }}</button>
        <span class="hint keys">Пробел · 1–4<template v-if="hasAudio"> · R</template></span>
      </div>
    </template>

    <div v-else class="card done">
      <template v-if="waitAt"><h3>Перерыв ⏳</h3><p class="hint">Карточки на шагах изучения вернутся через <b class="wl">{{ waitLeft }}</b> — как в Anki. Можно подождать здесь.</p></template>
      <h3 v-else>{{ answered ? 'Готово! 🎉' : 'Повторять пока нечего' }}</h3>
      <p class="hint">{{ answered ? `Повторено карточек: ${answered}` : 'На сегодня всё выучено' }}</p>
      <p v-if="next && !waitAt" class="hint">{{ next }}</p>
      <div class="row2" style="justify-content:center">
        <button class="btn" @click="emit('finish')">{{ embedded ? 'Завершить' : 'Готово' }}</button>
      </div>
    </div>
    <CardEditor v-if="editing && card" :card="card" @close="editing = false" />
  </div>
</template>

<style scoped>
.ss { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px }      /* колонка не шире экрана — длинное название сжимается с «…» */
.bar { display: flex; align-items: center; gap: 10px } .dt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; text-align: center }
.cnt { display: flex; gap: 10px; font-size: 16px } .cnt b { min-width: 14px; text-align: center; opacity: .55; border-bottom: 3px solid transparent } .cnt b.on { opacity: 1; border-bottom-color: currentColor }
.n { color: var(--blue) } .l { color: var(--red) } .d { color: var(--green-d) }
.face { height: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 6px 4px; border: 0; background: none; box-shadow: none; cursor: pointer; overflow: hidden; box-sizing: border-box }      /* компактно и без рамки: слово, перевод, фото и пример прямо на странице */
.head { flex: none; width: 100%; display: grid; align-content: center; justify-items: center; gap: 0; overflow: hidden }      /* слово + перевод: перевод скрыт до ответа, но место за ним занято — ничего не прыгает */
.q { font-size: 32px; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.a { font-size: 26px; font-weight: 800; line-height: 1.2; color: var(--blue); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden } .a.hid { visibility: hidden }      /* место под перевод занято и до ответа */
.sent.tap { cursor: pointer }
.sent { flex: none; width: 100%; min-height: 1.3em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; font-size: 17px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere }      /* пример под фото: до ответа — на одном языке, после — на другом, в том же месте */
.wd { display: flex; align-items: center; justify-content: center; gap: 10px; max-width: 100% }
.spk { border: 2px solid var(--border); background: var(--card); border-radius: 50%; width: 40px; height: 40px; font-size: 18px; cursor: pointer; flex: none }
.media { position: relative; flex: none; width: 100%; max-width: 380px; aspect-ratio: 3 / 2; overflow: hidden; border-radius: 14px }      /* фото — только если оно есть (без фото — пустого места нет) */
.pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 14px; background: transparent }      /* фото вписывается в слот и не может наехать на пример */
.dock { height: 58px; min-height: 54px; flex: none; display: grid; overflow: hidden }      /* одна высота для «Показать ответ» и для оценок */
.show { width: 100%; height: 54px; padding: 0 }
.grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px }
.g { height: 54px; display: grid; align-content: center; border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 14px; padding: 0 4px; font: inherit; font-weight: 800; cursor: pointer; background: var(--card); color: var(--text) }
.g:active { transform: translateY(2px); border-bottom-width: 2px } .g small { display: block; font-weight: 600; color: var(--hint); font-size: 11px }
.g0 { color: var(--red) } .g1 { color: var(--orange-d) } .g2 { color: var(--green-d) } .g3 { color: var(--blue) }
.tools { height: 36px; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: none }      /* одна строка фиксированной высоты — ничего не прыгает */
.tools button { flex: none; white-space: nowrap }
.tools button { display: inline-flex; align-items: center; gap: 6px; border: 2px solid var(--border); background: var(--card); color: var(--hint); font: inherit; font-weight: 800; font-size: 13px; border-radius: 12px; padding: 6px 10px; cursor: pointer }
.tools button:disabled { opacity: .45; cursor: default } .keys { margin-left: auto; font-size: 12px; white-space: nowrap }
.done { text-align: center; display: grid; gap: 6px } .done p { margin: 0 } .wl { color: var(--blue); font-variant-numeric: tabular-nums }
.tb { flex: none; display: inline-flex; border: 2px solid var(--border); border-bottom-width: 3px; border-radius: 12px; background: var(--card); overflow: hidden }      /* кнопки-значки одной плашкой */
.ib { display: grid; place-items: center; width: 34px; height: 31px; border: 0; background: none; color: var(--blue); cursor: pointer } .ib + .ib { border-left: 1px solid var(--border) }
.ib:hover { background: var(--surface) } .ib.on { background: var(--blue-l) }
@media (max-width: 600px) { .keys { display: none } .tools.only { display: none } .q { font-size: 28px } .a { font-size: 24px } }

</style>

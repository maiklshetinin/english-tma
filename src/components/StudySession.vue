<script setup>
// Сессия повторения в стиле Anki: очередь (изучаю → к повторению → новые), «Показать ответ», 4 оценки с интервалами,
// отмена последнего ответа, счётчики «новые / изучаю / к повторению». Клавиши: Пробел — ответ/«Хорошо», 1–4 — оценка, Z — отмена.
// Используется и во вкладке «Слова», и внутри кружка пути (embedded).
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { buildQueue, srsOf, kindOf, rate, restore, snapshot, intervalLabel, nextDueInfo } from '../composables/useSrs'
import AppIcon from './AppIcon.vue'
import CardEditor from './CardEditor.vue'
const props = defineProps({ deck: { type: Object, required: true }, userKey: { type: [String, Number], required: true }, canEdit: Boolean, embedded: Boolean })
const emit = defineEmits(['finish', 'exit'])

const queue = ref(buildQueue(props.deck, props.userKey))
const flipped = ref(false), answered = ref(0), hist = ref([]), editing = ref(false)
const card = computed(() => queue.value[0])
const kind = (c) => kindOf(srsOf(props.userKey, c))
const counts = computed(() => { const o = { new: 0, learn: 0, due: 0 }; for (const c of queue.value) o[{ new: 'new', learn: 'learn', review: 'due' }[kind(c)]]++; return o })
const cur = computed(() => card.value && { new: 'new', learn: 'learn', review: 'due' }[kind(card.value)])
const GRADES = [{ q: 0, t: 'Снова' }, { q: 1, t: 'Трудно' }, { q: 2, t: 'Хорошо' }, { q: 3, t: 'Легко' }]
const next = computed(() => nextDueInfo(props.deck, props.userKey))

function answer(q) {
  const c = card.value; if (!c || !flipped.value) return
  hist.value.push({ c, prev: snapshot(props.userKey, c), queue: queue.value.slice() })
  rate(props.userKey, c, q); answered.value++; flipped.value = false
  queue.value = q === 0 ? [...queue.value.slice(1), c] : queue.value.slice(1)     // «Снова» возвращает карточку в конец очереди
}
function undo() {
  const h = hist.value.pop(); if (!h) return
  restore(props.userKey, h.c, h.prev); queue.value = h.queue; answered.value--; flipped.value = false
}
function onKey(e) {
  if (editing.value || e.metaKey || e.ctrlKey || e.altKey) return
  const tag = e.target?.tagName
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return
  if ((e.key === 'z' || e.key === 'я') && hist.value.length) return undo()
  if (!card.value) return
  if (e.key === ' ' || e.key === 'Enter') {
    if (tag === 'BUTTON') return                                  // фокус на кнопке — пусть сработает сама кнопка
    e.preventDefault(); flipped.value ? answer(2) : (flipped.value = true)
  } else if (flipped.value && /^[1-4]$/.test(e.key)) answer(+e.key - 1)
}
onMounted(() => addEventListener('keydown', onKey))
onUnmounted(() => removeEventListener('keydown', onKey))
</script>

<template>
  <div class="ss">
    <header class="bar">
      <button class="btn ghost sm" @click="emit('exit')"><AppIcon name="back" :size="18" /> {{ embedded ? 'Закрыть' : 'Колоды' }}</button>
      <b class="dt">{{ deck.title }}</b>
      <span class="cnt" aria-label="Новые, изучаю, к повторению">
        <b class="n" :class="{ on: cur === 'new' }">{{ counts.new }}</b><b class="l" :class="{ on: cur === 'learn' }">{{ counts.learn }}</b><b class="d" :class="{ on: cur === 'due' }">{{ counts.due }}</b>
      </span>
    </header>

    <template v-if="card">
      <div class="card face" @click="flipped = true">
        <div class="q">{{ card.front }}</div>
        <template v-if="flipped"><hr /><div class="a">{{ card.back }}</div><div v-if="card.example" class="hint ex">{{ card.example }}</div></template>
      </div>
      <button v-if="!flipped" class="btn show" @click="flipped = true">Показать ответ</button>
      <div v-else class="grades">
        <button v-for="g in GRADES" :key="g.q" :class="['g', 'g' + g.q]" @click="answer(g.q)">{{ g.t }}<small>{{ intervalLabel(userKey, card, g.q) }}</small></button>
      </div>
      <div class="tools">
        <button :disabled="!hist.length" @click="undo"><AppIcon name="undo" :size="16" /> Отменить</button>
        <button v-if="canEdit" @click="editing = true"><AppIcon name="pencil" :size="16" /> Править</button>
        <span class="hint keys">Пробел · 1–4 · Z</span>
      </div>
    </template>

    <div v-else class="card done">
      <h3>{{ answered ? 'Готово! 🎉' : 'Повторять пока нечего' }}</h3>
      <p class="hint">{{ answered ? `Повторено карточек: ${answered}` : 'На сегодня всё выучено' }}</p>
      <p v-if="next" class="hint">{{ next }}</p>
      <div class="row2" style="justify-content:center">
        <button v-if="hist.length" class="btn ghost" @click="undo"><AppIcon name="undo" :size="16" /> Отменить</button>
        <button class="btn" @click="emit('finish')">{{ embedded ? 'Завершить' : 'Готово' }}</button>
      </div>
    </div>
    <CardEditor v-if="editing && card" :card="card" @close="editing = false" />
  </div>
</template>

<style scoped>
.ss { display: grid; gap: 14px }
.bar { display: flex; align-items: center; gap: 10px } .dt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; text-align: center }
.cnt { display: flex; gap: 10px; font-size: 16px } .cnt b { min-width: 14px; text-align: center; opacity: .55; border-bottom: 3px solid transparent } .cnt b.on { opacity: 1; border-bottom-color: currentColor }
.n { color: var(--blue) } .l { color: var(--red) } .d { color: var(--green-d) }
.face { min-height: 220px; display: grid; align-content: center; justify-items: center; gap: 12px; text-align: center; padding: 24px 18px; cursor: pointer }
.q { font-size: 32px; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere }
hr { width: 100%; border: 0; border-top: 2px solid var(--border); margin: 4px 0 }
.a { font-size: 26px; font-weight: 800; color: var(--blue); overflow-wrap: anywhere } .ex { font-style: italic; margin: 0 }
.show { width: 100%; padding: 16px }
.grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px }
.g { border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 14px; padding: 10px 4px; font: inherit; font-weight: 800; cursor: pointer; background: var(--card); color: var(--text) }
.g:active { transform: translateY(2px); border-bottom-width: 2px } .g small { display: block; font-weight: 600; color: var(--hint); font-size: 11px }
.g0 { color: var(--red) } .g1 { color: var(--orange-d) } .g2 { color: var(--green-d) } .g3 { color: var(--blue) }
.tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.tools button { display: inline-flex; align-items: center; gap: 6px; border: 2px solid var(--border); background: var(--card); color: var(--hint); font: inherit; font-weight: 800; font-size: 13px; border-radius: 12px; padding: 6px 10px; cursor: pointer }
.tools button:disabled { opacity: .45; cursor: default } .keys { margin-left: auto; font-size: 12px }
.done { text-align: center; display: grid; gap: 6px } .done p { margin: 0 }
@media (max-width: 600px) { .keys { display: none } .q { font-size: 28px } }
</style>

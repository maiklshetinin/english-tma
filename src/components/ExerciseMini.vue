<script setup>
// Миниатюра экрана (меню «Exercise», плитки на ветке урока, конструктор): тот же шаблон экрана, что у ученика (src/exercises),
// с «рыбой» шаблона (TEMPLATES в utils/lesson.ts) — уменьшенная копия окна. Поменяли шаблон — поменялась и миниатюра (18.11.2026).
// Нажатия выключены, звук и видео не грузятся. size: 'tray' / 'rail' — 124×156 (18.11.2026: экран виден целиком, с полоской прогресса, фото 16:9 как у ученика).
// Не шаблон экрана (например, «Готовый урок») — стопка карточек, как раньше.
import { computed, reactive } from 'vue'
import { EX } from '../exercises'
import { providePlay } from '../exercises/ctx'
import { TEMPLATES, BOOK, orderParts, twLayout } from '../utils/lesson'
const props = defineProps({ id: { type: String, required: true }, size: { type: String, default: 'tray' } })
const ALIAS = { spell: 'order', speak: 'sayword' }          // старые id шаблонов
const bid = computed(() => { const b = props.id.replace(/^pg_/, ''); return ALIAS[b] ?? b })
const page = computed(() => props.id.startsWith('pg_'))
const step = computed(() => { const t = TEMPLATES.find(x => x.id === bid.value); if (!t) return null; const s = t.make(); if (page.value) s.bs = 'page'; return s })
const ex = computed(() => (step.value ? EX[step.value.kind] : null))
// кнопка внизу — как в начале экрана у ученика: «Новое слово» и «Подсказка» — сразу «Продолжить» (синяя), где ответ проверяют кнопкой — «Проверить», остальные — серая «Продолжить»
const goOn = computed(() => ['intro', 'tip'].includes(step.value?.kind))
const goT = computed(() => { const s = step.value; return s && ((s.kind === 'gap' && !s.opts?.length) || s.kind === 'odd' || s.kind === 'sort') ? 'Проверить' : 'Продолжить' })
const book = computed(() => !!step.value?.bk && !!BOOK[step.value.bk])
// состояние экрана «как в начале»: всё по порядку, ничего не отвечено
const idx = (a) => (a ?? []).map((_, k) => k)
const st = computed(() => {
  const s = step.value ?? {}, full = (s.pairs ?? []).filter(x => x.a?.trim() && x.b?.trim())
  return reactive({ done: false, picked: null, res: null, left: null, right: null, matched: [], bad: [], wrong: [], built: [], typed: '', tys: [], showTr: false, hint: false, text: '', place: {}, sel: null, twr: null,
    mode: s.kind === 'answer' && s.bk && s.bs === 'page' ? 'write' : '',
    order: idx(s.kind === 'sort' ? s.items : s.opts), L: idx(full), R: idx(full), pool: s.kind === 'order' ? idx(orderParts(s)) : [],
    tw: s.kind === 'sort' && s.tw ? twLayout(s).cols.map(c => Array(c.need).fill('')) : [] })
})
const no = () => {}
providePlay(reactive({
  st, src: (v, k) => (k === 'image' ? v : ''), say: no, pick: no, tap: no, put: no, back: no, fill: no, check: no, gapOkAt: () => false, sendText: no,
  sortPick: no, sortPut: no, sortBack: no, sortOkAt: () => false, recToggle: no, again: no, setVid: no, favToggle: no,
  rec: { on: false, heard: '', err: '', miss: false }, said: null, right: false, later: false, answer: null, favKey: '', favOn: false,
  edit: false, single: true, embedded: true, track: false,
}))
</script>

<template>
  <span v-if="ex" class="mini xmt" :class="size" inert aria-hidden="true">
    <span class="sc">
      <span class="lp embedded single" :class="{ book, bkpg: book && page, bkqa: book && page && step.bk === 'bkqa' }">
        <span class="top"><span class="pb"><i /></span></span>          <!-- полоска прогресса — как у ученика, будто идут первые экраны урока -->
        <span v-if="book" class="bkh"><b>{{ step.bn || BOOK[step.bk].n }}</b><span>{{ step.head || BOOK[step.bk].en }}</span></span>
        <span class="body" :class="['x-' + step.kind, { tw: step.kind === 'sort' && step.tw }]"><component :is="ex.view" :step="step" /></span>
      </span>
    </span>
    <!-- подвал с кнопкой — прижат к низу, как у ученика на телефоне (экран выше значка уходит под него) -->
    <span class="ft" :style="{ '--k': size === 'tray' || size === 'rail' ? 122 / 400 : 148 / 400 }"><b class="go" :class="{ on: goOn }">{{ goT }}</b></span>
  </span>
  <span v-else class="mini" :class="[id, size]"><span class="ms"><i /><i /><i /></span></span>
</template>

<style scoped>
.mini { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; width: 150px; height: 104px; box-sizing: border-box; padding: 8px 12px; border: 1px solid #e3e3e3; border-radius: 10px; background: var(--card); transition: transform .15s, box-shadow .15s }
/* размер «как в меню Exercise» (CourseEditor → .tray.inter .mini) */
.mini.tray, .mini.rail { width: 124px; height: 156px; padding: 6px 9px 16px; gap: 4px; overflow: hidden }
/* уменьшенная копия экрана: экран шириной 400 px целиком, в тех же пропорциях, что у ученика */
.mini.xmt { display: block; padding: 0 !important; overflow: hidden; pointer-events: none; user-select: none }
.sc { position: absolute; left: 0; top: 0; width: 400px; transform: scale(calc(122 / 400)); transform-origin: 0 0 }
.mini.xmt:not(.tray):not(.rail) .sc { transform: scale(calc(148 / 400)) }
.lp { display: flex; flex-direction: column; width: 400px; background: var(--card); color: var(--text); font-family: var(--font); text-align: left }
.body { display: flex; flex-direction: column; align-items: stretch; gap: 10px; padding: 8px 14px 16px; box-sizing: border-box }
.lp.book { background: #fffdf6; font-family: Arial, Helvetica, sans-serif; color: #2c2c2a } .mini.xmt:has(.lp.book) { background: #fffdf6; border-color: #eadfc4 }
.lp.book.bkpg { background: #fff; color: #231f20 } .mini.xmt:has(.lp.bkpg) { background: #fff; border-color: #d3d1c7 }
.ft { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: flex; justify-content: flex-end; align-items: center; height: calc(58px * var(--k)); padding: 0 calc(14px * var(--k)); border-top: 1px solid var(--border); background: var(--card); box-sizing: border-box }
.mini.xmt:has(.lp.book) .ft { background: #fffdf6 } .mini.xmt:has(.lp.bkpg) .ft { background: #fff }
.ft .go { padding: calc(9px * var(--k)) calc(22px * var(--k)); border-radius: 99px; background: var(--border); color: var(--hint-2); font: 800 calc(14px * var(--k)) / 1.2 var(--font) }
.ft .go.on { background: var(--blue); color: #fff }
.top { display: block; padding: 14px 95px 2px }
.pb { display: block; height: 10px; border-radius: 6px; background: #e8e8e8; overflow: hidden } .pb i { display: block; width: 30%; height: 100%; border-radius: 6px; background: #1fbe78 }
.lp.book .pb { background: #ece6d6 }
.bkh { display: flex; align-items: flex-start; gap: 9px; padding: 8px 14px 0; font-size: 16px; font-weight: 700; line-height: 1.3 }
.bkh b { flex: none; display: grid; place-items: center; width: 26px; height: 26px; margin-top: -2px; border-radius: 50%; background: #f0997b; color: #4a1b0c; font-size: 14px }
.lp.bkpg .bkh b { border: 1.5px solid #d85a30; color: #231f20 }
.lp.book .body { padding-top: 10px }
/* «Готовый урок» и прочее — стопка карточек */
.mini .ms { position: relative; width: 120px; height: 90px; transform: scale(.82); transform-origin: top center }
.mini .ms i { position: absolute; display: block; width: 84px; height: 62px; border: 1px solid #e3e3e3; border-radius: 8px; background: var(--card); box-shadow: 0 2px 5px rgba(0, 0, 0, .08) }
.mini .ms i:nth-child(1) { left: 0; top: 0; background: linear-gradient(#fff 20%, #8fb8e8 20% 60%, #fff 60%) } .mini .ms i:nth-child(2) { left: 18px; top: 13px; background: linear-gradient(#fff 35%, #8ff0c8 35% 70%, #fff 70%) } .mini .ms i:nth-child(3) { left: 36px; top: 26px; background: radial-gradient(circle at 50% 40%, #ffc800 12px, #fff 13px) }
.mini.lesson { background: none; border: 0; padding: 4px; overflow: visible }
</style>

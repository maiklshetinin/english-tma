<script setup>
// Призрак перетаскивания (useDnd). Им и целимся: цель — ячейка под его центром.
//  • Ученик / группа из панели: появляется ровно на месте взятого (кружки того же размера) и за мгновение сжимается
//    до размера ячейки — кружки уменьшаются и наезжают друг на друга, получается та же карточка, что будет в таблице.
//  • Урок из таблицы: копия карточки того же размера поверх оригинала, едет за курсором.
// Над призраком — подсказка, что будет, если отпустить сейчас (те же правила, что у броска в TeacherHome):
// зелёная — назначить / перенести, оранжевая — поменять местами, красная — нельзя и почему (или «снять урок» над панелью).
import { lessonStyle } from '../utils/gridStyle'
import { computed, ref, watch, nextTick } from 'vue'
import { dnd } from '../composables/useDnd'
import Avatar from './Avatar.vue'
import AvatarStack from './AvatarStack.vue'
import { useStudentsStore } from '../stores/students'
import { useScheduleStore, slotKey } from '../stores/schedule'
import { fmtSlot, slotPast } from '../utils/dates'
const studentStore = useStudentsStore()
const p = computed(() => dnd.payload)
const lesson = computed(() => p.value?.kind === 'lesson')
const people = computed(() => {
  if (!p.value) return []
  const ids = lesson.value ? p.value.lesson.studentIds : p.value.ids ?? [p.value.id]
  return ids.map(id => studentStore.findAny(id)).filter(Boolean)
})
// Сжатие: первый кадр — как в панели, следующий — размер ячейки (переход в CSS)
const small = ref(false)
watch(() => dnd.active, (on) => { small.value = false; if (on) nextTick(() => requestAnimationFrame(() => { small.value = true })) })
const g = computed(() => dnd.grab), b = computed(() => dnd.box)
const W = computed(() => (lesson.value || small.value || !g.value ? b.value?.W : g.value.w) || 110)
const H = computed(() => (lesson.value || small.value || !g.value ? b.value?.H : g.value.h) || 44)
const fx = computed(() => b.value?.fx ?? 0.5), fy = computed(() => b.value?.fy ?? 0.5)
const box = computed(() => ({ width: W.value + 'px', height: H.value + 'px', left: -fx.value * W.value + 'px', top: -fy.value * H.value + 'px' }))
// Кружки: в панели — по одному в клетке сетки; в ячейке — внахлёст, как у урока в таблице
const shown = computed(() => people.value.slice(0, 4))
const avEnd = computed(() => (lesson.value ? Math.max(20, Math.min(38, H.value - 10)) : Math.max(26, Math.min(47, H.value + 9))))      // кружки в полёте — как в ячейке, чуть крупнее
const av = computed(() => (small.value || !g.value?.av ? avEnd.value : Math.round(g.value.av)))
const ml = (i) => {
  const n = shown.value.length
  if (small.value || !g.value) {                                   // в конце — только кружки внахлёст, по центру призрака
    const step = Math.round(av.value * 0.65), total = av.value + (n - 1) * step
    return i ? step - av.value + 'px' : Math.round((W.value - total) / 2) + 'px'
  }
  const col = g.value.w / n
  return Math.round(i ? col - av.value : (col - av.value) / 2) + 'px'
}
const one = computed(() => people.value.length === 1)
// Подсказка: что будет, если отпустить здесь
const scheduleStore = useScheduleStore()
const firstName = (l) => studentStore.findAny(l.studentIds[0])?.name ?? 'ученик'
const who = (l) => (l.studentIds.length > 1 ? `группа (${l.studentIds.length})` : firstName(l))
const hint = computed(() => {
  const o = dnd.over, pl = p.value
  if (!pl || !o) return null
  if (o.kind === 'panel' || o.kind === 'out') return lesson.value ? { k: 'bad', t: 'Отпустите — урок снимется' } : null
  if (o.kind !== 'cell') return null
  const occ = scheduleStore.lessonMap.get(slotKey(o.date, o.hour))?.[0], at = fmtSlot(o.date, o.hour)
  if (!lesson.value) {
    if (occ) return { k: 'bad', t: 'Занято. Добавить в этот урок — откройте его → «Добавить ученика»' }
    return { k: 'ok', t: one.value ? `Урок: ${people.value[0].name} · ${at}` : `Урок группе · ${at}` }
  }
  const a = pl.lesson
  if (occ?.id === a.id) return null
  if (a.done) return { k: 'bad', t: 'Урок проведён — сначала снимите отметку' }
  if (occ?.done) return { k: 'bad', t: 'Здесь проведённый урок — не меняется' }
  if (occ && occ.studentIds.length && occ.studentIds.every(id => occ.canceled?.[id])) return { k: 'bad', t: 'Здесь отменённый урок — не меняется' }
  if (slotPast(o.date, o.hour)) return { k: 'bad', t: 'Это время уже прошло' }
  if (occ) return { k: 'swap', t: `Поменять местами: ${who(occ)}` }
  return { k: 'ok', t: `Перенести · ${at}` }
})
// Подсказка — над призраком, по центру (на тачскрине призрак над пальцем, так что и подсказку палец не закрывает)
// …но не за краем экрана: центр подсказки прижимается так, чтобы она целиком помещалась (ширину меряем после показа)
const hintEl = ref(null), hintW = ref(0)
watch(() => hint.value?.t, () => nextTick(() => { hintW.value = hintEl.value?.offsetWidth ?? 0 }))
const hintPos = computed(() => {
  const want = dnd.x + (0.5 - fx.value) * W.value, half = hintW.value / 2 + 8
  const at = hintW.value ? Math.min(Math.max(want, half), innerWidth - half) : want
  return { left: at - dnd.x + 'px', top: -fy.value * H.value - 8 + 'px' }
})
</script>
<template>
  <div v-if="dnd.active && people.length" class="gw" :style="{ transform: `translate(${dnd.x}px, ${dnd.y}px)` }">
    <div class="ghost" :class="[{ lesson, small: small || lesson, one, gone: lesson && (dnd.over?.kind === 'out' || dnd.over?.kind === 'panel') }, lesson ? `ls-${lessonStyle}` : '']" :style="box">
      <template v-if="lesson">
        <AvatarStack v-if="!one" :students="people" :size="47" :max="3" ring="var(--surface)" />
        <template v-else><Avatar :s="people[0]" :size="47" /><span class="nm">{{ people[0].name }}</span></template>
      </template>
      <template v-else>
        <Avatar v-for="(s, i) in shown" :key="s.id" :s="s" :size="av" :style="{ marginLeft: ml(i), zIndex: 10 - i }" />
      </template>
    </div>
    <Transition name="hint"><div v-if="hint" ref="hintEl" :key="hint.k + hint.t" class="dhint" :class="hint.k" :style="hintPos">{{ hint.t }}</div></Transition>
  </div>
</template>
<style scoped>
.gw { position: fixed; left: 0; top: 0; z-index: 100; pointer-events: none; width: 0; height: 0 }
/* Ученик / группа: сначала как в панели (без рамки), потом — карточка урока, как в ячейке */
.ghost { position: absolute; box-sizing: border-box; display: flex; align-items: center; overflow: hidden; white-space: nowrap;
  border: 2px solid transparent; border-radius: 14px; background: color-mix(in srgb, var(--surface) 70%, transparent); color: var(--text); font-size: 13px; font-weight: 800;
  transition: width .18s ease, height .18s ease, left .18s ease, top .18s ease, border-color .18s, background .18s, box-shadow .18s }
.ghost :deep(.avw) { flex: none; transition: margin .18s ease } .ghost :deep(.av) { transition: width .18s ease, height .18s ease, font-size .18s ease }
.ghost :deep(.avw + .avw .av) { box-shadow: 0 0 0 2px var(--card) }
/* Ученик / группа в полёте — только кружки (группа — внахлёст), без карточки; тень — будто приподняты */
.ghost.small:not(.lesson) { background: transparent; border-color: transparent; overflow: visible }
.ghost.small:not(.lesson) :deep(.av) { filter: drop-shadow(0 6px 10px rgba(0, 0, 0, .28)) }
.nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; margin-left: 6px; opacity: 0; transition: opacity .15s .1s }
.ghost.small .nm { opacity: 1 }
@media (max-width: 719px) { .nm.pn { display: none } }
/* Урок из таблицы: копия карточки поверх оригинала */
/* Урок из таблицы — точная копия плашки в ячейке (WeekGrid .chip): серая, кружок во всю высоту, имя рядом */
.ghost.lesson { gap: 5px; justify-content: center; padding: 0; border: 0; border-radius: 10px; background: var(--surface); color: var(--text); opacity: .97; transition: none; box-shadow: 0 8px 20px rgba(0, 0, 0, .2); overflow: visible }
.ghost.lesson :deep(.av) { width: 31px !important; height: 31px !important; font-size: 13px !important }
.ghost.lesson .nm { display: none; margin: 0; font-size: 13px; font-weight: 700; opacity: .85 }
@media (min-width: 720px) { .ghost.lesson .nm { display: block } .ghost.lesson { justify-content: flex-start; padding: 0 6px 0 1px; gap: 7px } .ghost.lesson :deep(.av) { width: 39px !important; height: 39px !important; font-size: 17px !important } }
@media (max-width: 420px) { .ghost.lesson :deep(.av) { width: 29px !important; height: 29px !important } }
/* Урок в руке выглядит так же, как в таблице (настройка «Урок»: плашка / хвостик / стикер / голубой) */
.ghost.lesson { isolation: isolate }
.ghost.lesson.ls-plain { box-shadow: inset 0 0 0 1px #d0d7de, 0 8px 20px rgba(0, 0, 0, .2) }
@media (min-width: 720px) {
  .ghost.lesson.ls-tail { background: transparent; box-shadow: none; filter: drop-shadow(0 8px 14px rgba(0, 0, 0, .2)) }
  .ghost.lesson.ls-tail::before { content: ''; position: absolute; z-index: -1; left: 20px; right: 0; top: 0; bottom: 0; border-radius: 0 10px 10px 0; background: var(--surface); box-shadow: inset 0 0 0 1px #d0d7de }
  .ghost.lesson.ls-sticker { padding-left: 0; border-radius: 999px 3px 3px 999px }
  .ghost.lesson.ls-blue { padding-left: 0; border-radius: 999px } .ghost.lesson.ls-blue .nm { color: #1a5b8a }
}
.ghost.lesson.ls-sticker { background: #fff4b8 } .ghost.lesson.ls-blue { background: var(--blue-l) }
.dhint { position: absolute; transform: translate(-50%, -100%); width: max-content; max-width: 260px; padding: 5px 10px; border-radius: 10px; color: #fff; font-size: 12px; font-weight: 800; line-height: 1.3; text-align: center;
  white-space: normal; box-shadow: 0 6px 16px rgba(0, 0, 0, .18); background: var(--green-d) }
/* Урок вытащили за таблицу — снимется: бледнеет и краснеет рамка */
.ghost.lesson.gone { opacity: .55; box-shadow: 0 0 0 2px var(--red), 0 8px 20px rgba(0, 0, 0, .2) !important }
.dhint.swap { background: var(--orange-d) } .dhint.bad { background: var(--red) }
.hint-enter-active { transition: opacity .12s } .hint-enter-from { opacity: 0 }
</style>

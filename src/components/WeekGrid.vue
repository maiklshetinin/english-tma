<script setup>
// Одна неделя: время × дни. Ячейка — цель для drop, урок — «чип» (аватарка ученика), который можно тащить дальше.
import { computed } from 'vue'
import { HOURS, DAYS, hh, slotKey, nowTick, nowIn, tz, setTz, tzShort, TIMEZONES, slotPast } from '../store/app'
import { dnd, pressStart } from '../composables/useDnd'
import { gridStyle, gridFrame, lessonStyle, pastShade } from '../utils/gridStyle'
import Avatar from './Avatar.vue'
import { sumMoney, fmtMoney, fmtMoneyK } from '../utils/price'
import AvatarStack from './AvatarStack.vue'
import { useStudentsStore } from '../stores/students'
import { useScheduleStore } from '../stores/schedule'
const studentStore = useStudentsStore()
const scheduleStore = useScheduleStore()
const props = defineProps({ dates: { type: Array, required: true } })
const emit = defineEmits(['cell', 'lesson'])
// «Сейчас»: сегодняшний день и текущий час (обновляется раз в минуту). Подсвечивается только в той таблице, где есть сегодняшний день.
// «Сейчас» — по выбранному поясу (уголок таблицы), а не по часам компьютера; минуты идут в метке текущего часа и линией в ячейке
const now = computed(() => nowIn(tz.value, nowTick.value))
const hasToday = computed(() => props.dates.includes(now.value.date))
const rowNow = (h) => hasToday.value && h === now.value.hour
const cellNow = (d, h) => d === now.value.date && h === now.value.hour
const stu = (id) => studentStore.findAny(id)                               // и архивные: в проведённых уроках они остаются (серые, «в архиве»)
const at = (d, h) => scheduleStore.lessonMap.get(slotKey(d, h)) ?? []
// Деньги дня: факт — проведённые уроки (зафиксированные цены), план — все уроки дня (utils/price.ts)
const moneyByDay = computed(() => Object.fromEntries(props.dates.map(d => [d, sumMoney(scheduleStore.lessons.filter(l => l.date === d), studentStore.byId)])))
const money = (d) => moneyByDay.value[d]

function dropState(d, h) {                       // подсветка ячейки под призраком: ok / swap / bad (в обеих таблицах одинаково)
  const o = dnd.over
  if (!dnd.active || o?.kind !== 'cell' || o.date !== d || o.hour !== h) return ''
  const occ = at(d, h)[0], p = dnd.payload
  if (p.kind === 'lesson') return occ?.id === p.lesson.id ? '' : slotPast(d, h, now.value) || occ?.done || (occ && allOff(occ)) ? 'bad' : occ ? 'swap' : 'ok'      // в прошлое не переносим
  if (!occ) return 'ok'
  return 'bad'      // ученик / группа — только на свободную ячейку: из урока группу не собираем
}
// Ученики урока, которые есть в списке. Ученика могли удалить из базы или архивировать — его id остаётся в уроке, но показывать некого.
const group = (l) => l.studentIds.map(stu).filter(Boolean)                 // участники группы — аватарки внахлёст (AvatarStack)
const isGroup = (l) => group(l).length > 1
const ringOf = () => 'var(--card)'                 // кольцо стопки аватарок — цвет фона под уроком
const orphan = (l) => !group(l).length                                      // урок, в котором не осталось известных учеников: показываем серым «?», чтобы его можно было убрать
// «Отменил ученик»: все отменили — карточка красная и зачёркнутая; в группе часть — красный значок «✕N»
const offCount = (l) => group(l).filter(s => l.canceled?.[s.id]).length
const allOff = (l) => !orphan(l) && offCount(l) === group(l).length
const goneName = (l) => Object.values(l.names ?? {})[0] ?? ''             // имя удалённого навсегда (у проведённых уроков)
const lifted = (l) => dnd.active && dnd.payload?.kind === 'lesson' && dnd.payload.lesson.id === l.id
const down = (e, l) => { if (!l.done && !allOff(l) && !orphan(l)) pressStart(e, { kind: 'lesson', lesson: l }) }      // проведённый, отменённый (и «пустой») урок не перетаскиваем
// Подпись урока: ученик или участники группы; у «пустого» урока — подсказка, что его ученика больше нет
const first = (l) => group(l)[0]
const label = (l) => allOff(l) ? `Отменил ученик: ${group(l).map(s => s.name).join(', ')}, ${hh(l.hour, l.minute)} — без оплаты` : orphan(l) ? (goneName(l) ? `${goneName(l)} (удалён), ${hh(l.hour, l.minute)}` : `Урок без ученика (удалён или в архиве), ${hh(l.hour, l.minute)} — нажмите, чтобы убрать`) : isGroup(l) ? `Группа: ${group(l).map(s => s.name).join(', ')}, ${hh(l.hour, l.minute)}` : `${first(l).name}, ${hh(l.hour, l.minute)}`
const clickCell = (d, h) => { if (!at(d, h).length) emit('cell', { date: d, hour: h }) }
</script>

<template>
  <div class="card wk" :class="[`gs-${gridStyle}`, `ls-${lessonStyle}`, { noframe: !gridFrame, shade: pastShade }]">
    <div class="g head">
      <label class="corner" :title="`Часовой пояс расписания: ${TIMEZONES.find(z => z.id === tz)?.label ?? tz}`">
        <span>{{ tzShort(tz) }}</span>
        <select :value="tz" aria-label="Часовой пояс расписания" @change="setTz($event.target.value)"><option v-for="z in TIMEZONES" :key="z.id" :value="z.id">{{ z.label }}</option></select>
      </label>
      <span v-for="(d, i) in dates" :key="d" class="dh" :class="{ we: i > 4, today: d === now.date }"><span class="dn"><b>{{ DAYS[i] }}</b><small>{{ +d.slice(8) }}</small></span>
        <span class="dsum" :class="{ ok: money(d).plan && money(d).real === money(d).plan, zero: !money(d).plan }" :title="money(d).plan ? `Факт ${fmtMoney(money(d).real)} из ${fmtMoney(money(d).plan)}` : 'Уроков нет'">{{ money(d).plan ? fmtMoneyK(money(d).plan) : 0 }}</span>
        <span v-if="money(d).lost" class="dlost" :title="`Потеряно из-за отмен: ${fmtMoney(money(d).lost)}`">−{{ fmtMoneyK(money(d).lost) }}</span></span>
    </div>
    <div v-for="h in HOURS" :key="h" class="g">
      <span class="tm" :class="{ now: rowNow(h) }">{{ rowNow(h) ? hh(h, now.minute) : hh(h) }}</span>
      <div v-for="d in dates" :key="d" class="cell" :class="[dropState(d, h), { free: !at(d, h).length, now: cellNow(d, h), past: slotPast(d, h, now) }]" :style="cellNow(d, h) ? { '--fill': (now.minute / 60 * 100) + '%' } : null"
        data-drop="cell" :data-date="d" :data-hour="h" @click="clickCell(d, h)">
        <i v-if="cellNow(d, h)" class="nowline" :style="{ top: (now.minute / 60 * 100) + '%' }" aria-hidden="true" />
        <template v-for="l in at(d, h).slice(0, 1)" :key="l.id">
          <button class="chip" :class="{ lifted: lifted(l), done: l.done, group: isGroup(l), orphan: orphan(l), canceled: allOff(l), up: !l.done && !allOff(l) && !orphan(l) }" :title="label(l)" :aria-label="label(l)"
            @pointerdown="down($event, l)" @click.stop="emit('lesson', l)" @dragstart.prevent>
            <template v-if="isGroup(l)">
              <AvatarStack class="st-lg" :students="group(l)" :size="39" :max="3" :ring="ringOf(l)" /><AvatarStack class="st-sm" :students="group(l)" :size="26" :max="2" :ring="ringOf(l)" />
              <span v-if="l.done" class="tick" title="Проведён"><svg viewBox="0 0 16 16"><path d="M4.5 8.2l2.3 2.3 4.7-4.9" /></svg></span>
            </template>
            <template v-else-if="orphan(l)"><span class="q">?</span><span class="nm">{{ goneName(l) || 'Нет ученика' }}</span></template>
            <template v-else><Avatar :s="first(l)" :size="39" /><span class="nm">{{ first(l).name }}</span><span v-if="l.done" class="tick" title="Проведён"><svg viewBox="0 0 16 16"><path d="M4.5 8.2l2.3 2.3 4.7-4.9" /></svg></span></template>
            <span v-if="allOff(l)" class="tick x" title="Отменён"><svg viewBox="0 0 16 16"><path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" /></svg></span><i v-else-if="offCount(l)" class="off" :title="`Отменили: ${offCount(l)}`">✕{{ offCount(l) }}</i>
            <i v-if="l.minute" class="min" :title="`Начало в ${hh(l.hour, l.minute)}`">:{{ String(l.minute).padStart(2, '0') }}</i>
            <i v-if="l.note" class="note" :title="l.note" aria-label="Есть заметка" />
            <i v-if="at(d, h).length > 1" class="more">+{{ at(d, h).length - 1 }}</i>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ячейки на всю ширину колонки; на телефоне в ячейке только аватарка, на широком экране — аватарка и имя */
.wk { padding: 10px; display: grid; gap: 4px; overflow: hidden }
.g { display: grid; grid-template-columns: 34px repeat(7, minmax(0, 1fr)); gap: 4px; align-items: stretch }
.head { margin-bottom: 2px }
/* Уголок: часовой пояс расписания (по умолчанию МСК). Видна аббревиатура, поверх — прозрачный select */
.corner { position: relative; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); font-size: 10px; font-weight: 900; color: var(--hint); cursor: pointer; min-height: 30px; align-self: center }
.corner:hover { border-color: var(--blue); color: var(--blue) }
.corner select { position: absolute; inset: 0; opacity: 0; margin: 0; padding: 0; cursor: pointer; width: 100% }
/* Линия «сейчас» внутри текущей ячейки: высота = минуты часа */
/* Как в Google Календаре, только зелёным (как «задеплоено» в GitHub): тонкая линия с точкой, без рамок и плашек */
.nowline { position: absolute; left: -2px; right: -2px; height: 2px; margin-top: -1px; background: var(--green-d); z-index: 6; pointer-events: none; border-radius: 2px }
.nowline::before { content: ''; position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--green-d); box-shadow: 0 0 0 2px var(--card) }
.tm { display: grid; place-items: center; font-size: 11px; font-weight: 800; color: var(--hint-2) }
.dh { display: grid; justify-items: center; padding: 4px 0; border-radius: 12px; font-size: 13px; color: var(--hint) }
.dn { display: grid; justify-items: center }
.dh small { font-weight: 800; font-size: 12px; color: var(--hint-2) }      /* дни без цвета — не спорят с суммой под датой */
/* Деньги дня — одна цифра под датой: сумма уроков дня; зелёная, когда все проведены */
.dsum { margin-top: 2px; line-height: 1.25; font-size: 12px; font-weight: 900; color: var(--hint-2); white-space: nowrap } .dsum.ok { color: var(--green-d) }
html[data-theme='dark'] .dsum.ok { color: var(--green) }
.dsum.zero { opacity: .45 }      /* место под доход есть всегда (0) — шапка не меняет высоту, когда появляется первый урок */
.dh { position: relative }
.dlost { position: absolute; left: 50%; top: calc(100% - 7px); transform: translateX(-50%); z-index: 2; padding: 0 4px; border-radius: 6px; background: var(--card); font-size: 10px; font-weight: 800; color: var(--red-d); line-height: 14px; white-space: nowrap; pointer-events: none }      /* потеряно из-за отмен — мелко красным под суммой, поверх зазора: шапка не прыгает */
@media (min-width: 720px) { .dn { display: flex; align-items: baseline; gap: 5px } .dn small { font-size: 13px } .dh { padding: 6px 8px } .dsum { font-size: 13px } }
/* «Сегодня» и текущее время — серой подложкой, текст обычный */
.dh.today { background: var(--group) } .dh.today b, .dh.today small { color: var(--text) }
.cell { position: relative; height: 38px; border-radius: 10px; background: var(--card); box-shadow: inset 0 0 0 1px var(--border); transition: background .1s, box-shadow .1s }      /* белые ячейки с тонкой рамкой */
.cell.free { cursor: pointer } .cell.free:hover { background: var(--blue-l) }
.tm.now { background: var(--group); border-radius: 10px; color: var(--text); font-weight: 900 }
.cell.ok { background: var(--green-l); box-shadow: inset 0 0 0 2px var(--green) }
.cell.swap { background: var(--orange-l); box-shadow: inset 0 0 0 2px var(--orange) }
.cell.bad { background: var(--red-l); box-shadow: inset 0 0 0 2px var(--red) }
.chip { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 0 4px; min-width: 0;
  border: 0; border-radius: 10px; background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 1px #d0d7de;      /* предстоящий — серая плашка с серой окантовкой */
  font: inherit; font-size: 12px; font-weight: 800; cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; transition: opacity .1s }
.chip.done { box-shadow: none; background: transparent; color: var(--hint); cursor: pointer }      /* проведённый — серый, только зелёная галочка */ .chip .tick { font-weight: 900 }
/* Цвета карточек: запланирован — серый, проведён — зелёный, отменён учеником — красный. Группу видно по стопке аватарок. */
/* Группа: аватарки внахлёст без подписи — на телефоне две (вторая может быть «+N»), на широком экране до четырёх */
.chip .st-lg { display: none } .chip .st-sm { display: inline-flex }
@media (min-width: 720px) { .chip .st-lg { display: inline-flex } .chip .st-sm { display: none } }
.cell.join { box-shadow: inset 0 0 0 2px var(--green) }
/* Урок, ученика которого больше нет (удалён из базы / архив): серый пунктир с «?» — нажать и убрать */
.chip.orphan { border: 2px dashed var(--hint-2); background: var(--surface); color: var(--hint); cursor: pointer }
.chip .q { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--hint-2); color: #fff; font-weight: 900; font-size: 12px; flex: none }
/* Отменил ученик (без оплаты): красная карточка, имя зачёркнуто; значок ✕ — в углу слева */
.chip.canceled { box-shadow: none; background: transparent; color: var(--hint) }      /* отменён — серый, зачёркнут, красный кружок с крестиком (как упавшая сборка в GitHub) */
.chip.canceled .nm { text-decoration: line-through } .chip.canceled :deep(.av), .chip.canceled :deep(.stack) { opacity: .45 }
.chip.done .nm, .chip.canceled .nm { color: var(--hint-2); opacity: 1 }      /* имя у прошедших — тоже бледное */      /* прошедший урок — бледнее, как отменённый (статус видно по кружку) */
.off { position: absolute; top: -6px; right: -4px; font-style: normal; font-size: 10px; font-weight: 900; background: var(--red); color: #fff; border-radius: 99px; padding: 1px 5px; line-height: 1.3 }
/* Начало внутри часа — бирка «:30» в правом нижнем углу; заметка — жёлтая точка в правом верхнем */
.min { position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%); font-style: normal; font-size: 11px; font-weight: 900; line-height: 1.3; padding: 0 5px; border-radius: 99px; background: var(--blue); color: #fff; box-shadow: 0 0 0 2px var(--card); z-index: 2 }
.note { position: absolute; right: -3px; top: -3px; width: 9px; height: 9px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 2px var(--card); z-index: 2 }
.chip:active { cursor: grabbing } .chip.lifted { opacity: .3 }
/* Кружок ученика — почти во всю высоту карточки, как аватарка в списке чатов Telegram */
.chip :deep(.av) { width: 39px !important; height: 39px !important; font-size: 17px !important }      /* на компьютере — 39px, влезает в ячейку таблицы */
@media (max-width: 719px) { .chip :deep(.av) { width: 31px !important; height: 31px !important; font-size: 13px !important } }
@media (max-width: 420px) { .chip :deep(.av) { width: 29px !important; height: 29px !important } }
.chip .nm { display: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; opacity: .85 }
/* Галочка «проведён» — как в GitHub: белая галочка в зелёном кружке */
.chip .tick { flex: none; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: #1f883d } .chip .tick.x { background: #cf222e } .chip .tick svg { width: 12px; height: 12px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }  /* время в ячейке не пишем — только бирка «:30», если урок не с начала часа */
.more { position: absolute; top: -6px; right: -4px; font-style: normal; font-size: 10px; font-weight: 900; background: var(--orange); color: #fff; border-radius: 99px; padding: 1px 5px }
@media (min-width: 720px) { .chip .nm { display: block } .chip { justify-content: flex-start; padding: 0 6px 0 1px; gap: 7px; font-size: 13px } .cell { height: 46px } .g { grid-template-columns: 52px repeat(7, minmax(0, 1fr)) } }
@media (max-width: 420px) { .wk { padding: 6px } .g { gap: 3px; grid-template-columns: 30px repeat(7, minmax(0, 1fr)) } .chip { padding: 0 } .cell { height: 36px } }

/* На телефоне галочку «проведён» не показываем — кружок крупный, проведённый урок и так зелёный */
/* Статус — в левом верхнем углу урока (на аватарке), на всех экранах */
.chip .tick { position: absolute; top: -5px; left: -4px; z-index: 2; box-shadow: 0 0 0 2px var(--card) }
@media (max-width: 719px) { .chip .tick { width: 14px; height: 14px } .chip .tick svg { width: 10px; height: 10px } }
/* Прошедшее время (настройка): прошлые часы — серые, текущий час закрашивается сверху по минутам */
.wk.shade .cell.past:not(.ok):not(.bad):not(.swap) { background: var(--surface) }
.wk.shade .cell.now:not(.ok):not(.bad):not(.swap) { background: linear-gradient(var(--surface) var(--fill), var(--card) var(--fill)) }
/* Вид будущего урока (настройка «Урок»): только у запланированных — у прошедших подложки нет */
.wk .chip.up { isolation: isolate }
@media (min-width: 720px) {
  .wk.ls-tail .chip.up { background: transparent; box-shadow: none }
  .wk.ls-tail .chip.up::before { content: ''; position: absolute; z-index: -1; left: 20px; right: 0; top: 0; bottom: 0; border-radius: 0 10px 10px 0; background: var(--surface); box-shadow: inset 0 0 0 1px #d0d7de }
  /* Стикер-закладка: ровный жёлтый, без теней */
  .wk.ls-sticker .chip.up { padding-left: 0; border-radius: 999px 3px 3px 999px; background: transparent; box-shadow: none }
  .wk.ls-sticker .chip.up::before { content: ''; position: absolute; z-index: -1; inset: 0; border-radius: inherit; background: #fff4b8 }
  .wk.ls-blue .chip.up { padding-left: 0; border-radius: 999px; background: var(--blue-l); box-shadow: 0 2px 5px rgba(28, 120, 200, .18) }
  .wk.ls-blue .chip.up .nm { color: #1a5b8a }
}
.wk.ls-sticker .chip.up { background: #fff4b8 } .wk.ls-blue .chip.up { background: var(--blue-l) }
/* Вид сетки (utils/gridStyle.js, кнопка с решёткой над таблицей): клетки — по умолчанию (выше) */
/* «Клетки» — простая таблица: прямые ячейки без промежутков, тонкие линии 1px; скруглены только внешние углы таблицы */
.wk.gs-cells { gap: 0 } .wk.gs-cells .g { gap: 0 } .wk.gs-cells .g.head { margin-bottom: 0 } .wk.gs-cells .dh { margin: 0 2px }
.wk.gs-cells .cell { border-radius: 0; box-shadow: inset -1px -1px 0 var(--border) }
.wk.gs-cells .g > .cell:nth-child(2) { box-shadow: inset 1px 0 0 var(--border), inset -1px -1px 0 var(--border) }
.wk.gs-cells .g.head + .g > .cell { box-shadow: inset 0 1px 0 var(--border), inset -1px -1px 0 var(--border) }
.wk.gs-cells .g.head + .g > .cell:nth-child(2) { box-shadow: inset 1px 1px 0 var(--border), inset -1px -1px 0 var(--border); border-top-left-radius: 10px }
.wk.gs-cells .g.head + .g > .cell:last-child { border-top-right-radius: 10px }
.wk.gs-cells .g:last-child > .cell:nth-child(2) { border-bottom-left-radius: 10px } .wk.gs-cells .g:last-child > .cell:last-child { border-bottom-right-radius: 10px }
@media (min-width: 720px) { .wk.gs-cells .tm { margin-right: 6px } }
.wk.gs-cells .chip { inset: 3px; border-radius: 7px }
@media (max-width: 420px) { .wk.gs-cells .g { grid-template-columns: 36px repeat(7, minmax(0, 1fr)) } .wk.gs-cells .tm { font-size: 10px; margin-right: 3px } }
@media (max-width: 719px) { .wk.gs-cells .chip { inset: 2px } }
.wk.noframe { border-color: transparent; box-shadow: none }      /* без внешней рамки (кнопка с решёткой → «Рамка») */
.wk.gs-gray .cell { background: var(--surface); box-shadow: none }
.wk.gs-gray .chip:not(.done):not(.canceled):not(.orphan) { background: var(--card) }      /* на серой ячейке урок — белый, иначе сольётся */
.wk.gs-none .cell { background: transparent; box-shadow: none }      /* без линий: чистый фон, только уроки */
.wk.gs-lines { gap: 0 } .wk.gs-lines .g.head { margin-bottom: 4px }
.wk.gs-lines .g:not(.head) { box-shadow: inset 0 -1px 0 var(--border); padding: 2px 0 }      /* линия под каждым часом во всю ширину */
.wk.gs-lines .cell { background: transparent; box-shadow: none; border-radius: 8px }
.wk.gs-gray .cell.free:hover, .wk.gs-lines .cell.free:hover, .wk.gs-none .cell.free:hover { background: var(--blue-l) }
.wk.gs-lines .cell.ok, .wk.gs-gray .cell.ok, .wk.gs-none .cell.ok { background: var(--green-l); box-shadow: inset 0 0 0 2px var(--green) }
.wk.gs-lines .cell.swap, .wk.gs-gray .cell.swap, .wk.gs-none .cell.swap { background: var(--orange-l); box-shadow: inset 0 0 0 2px var(--orange) }
.wk.gs-lines .cell.bad, .wk.gs-gray .cell.bad, .wk.gs-none .cell.bad { background: var(--red-l); box-shadow: inset 0 0 0 2px var(--red) }
.wk.gs-lines .cell.join, .wk.gs-gray .cell.join, .wk.gs-none .cell.join { box-shadow: inset 0 0 0 2px var(--green) }
</style>

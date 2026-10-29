<script setup>
// Шторка: либо карточка урока (состав, цена, отметка «проведён», убрать урок), либо выбор ученика для пустого слота.
// Урок — это урок: в него ставят группу целиком или одного ученика. Здесь можно добавить ученика ТОЛЬКО В ЭТОТ урок (разовый гость —
// в группу он не попадает: группы — только в панели учеников) и убрать из урока (✕, тоже только этот урок).
// Цена урока = сумма цен всех учеников (у каждого своя, на время урока; у проведённого — зафиксированная).
// Ученики показаны компактной сеткой кружков (как «Поделиться» в Telegram): аватарка, имя под ней; выбор — через поиск.
// «Отменил ученик» — по его причине, без оплаты: урок остаётся в ячейке, ученик не входит в цену, его сумма — «потеряно».
// В группе отмечается каждый ученик отдельно. Ученик видит у себя статус «Отменён вами».
import { computed, ref, watch } from 'vue'
import { isOnline } from '../utils/online'
import { fmtSlot, hh, handle } from '../store/app'
import Avatar from './Avatar.vue'
import AvatarStack from './AvatarStack.vue'
import AppIcon from './AppIcon.vue'
import { useStudentsStore } from '../stores/students'
import { priceAt } from '../utils/price'
import { useGroups } from '../composables/useGroups'
import StudentGrid from './StudentGrid.vue'
const MAX_GROUP = 12                                              // как на сервере (server/schedule.ts)
const studentStore = useStudentsStore()
const props = defineProps({ lesson: Object, slot: Object })
const emit = defineEmits(['close', 'remove', 'open', 'pick', 'done', 'students', 'cancel', 'details'])
const members = computed(() => (props.lesson?.studentIds ?? []).map(id => studentStore.findAny(id)).filter(Boolean))   // и архивные (в проведённых уроках остаются, серые)
const cost = (st) => (!props.lesson ? 0 : props.lesson.done && props.lesson.prices?.[st.id] != null ? props.lesson.prices[st.id] : priceAt(st, props.lesson.date, props.lesson.hour))      // цена на время урока: прошедшие уроки не пересчитываются
// Ученики урока, которых нет в списке: удалённые навсегда (у проведённого урока имя сохранено в names) или удалённые из базы вручную
const gone = computed(() => (props.lesson?.studentIds ?? []).filter(id => !studentStore.findAny(id)).map(id => ({ id, name: props.lesson.names?.[id] || '', price: props.lesson.done ? props.lesson.prices?.[id] ?? 0 : 0 })))
const size = computed(() => members.value.length + gone.value.filter(g => g.name).length)      // все ученики урока, включая удалённых навсегда
const isGroup = computed(() => size.value > 1)
// В уроке есть удалённый навсегда или архивный ученик: отметку не снять, иначе урок (и деньги) потеряются
const locked = computed(() => !!props.lesson?.done && (gone.value.length > 0 || members.value.some(st => st.archived)))
const off = (id) => !!props.lesson?.canceled?.[id]                                                  // отменил ученик
const total = computed(() => members.value.filter(st => !off(st.id)).reduce((sum, st) => sum + cost(st), 0) + gone.value.reduce((sum, g) => sum + g.price, 0))
const lost = computed(() => members.value.filter(st => off(st.id)).reduce((sum, st) => sum + priceAt(st, props.lesson.date, props.lesson.hour), 0))
const allOff = computed(() => members.value.length > 0 && members.value.every(st => off(st.id)))
const cancelable = computed(() => !!props.lesson && !props.lesson.done && members.value.length > 0)
const when = computed(() => props.lesson ? fmtSlot(props.lesson.date, props.lesson.hour, props.lesson.minute) : fmtSlot(props.slot.date, props.slot.hour))
// Начало внутри часа (18:00 / 18:15 / 18:30 / 18:45) и заметка преподавателя (ученик её не видит)
const MINUTES = [0, 15, 30, 45]
const note = ref(props.lesson?.note ?? '')
watch(() => props.lesson?.note, (v) => { note.value = v ?? '' })
const noteDirty = computed(() => !!props.lesson && note.value.trim() !== (props.lesson.note ?? ''))
const saveNote = () => { if (noteDirty.value) emit('details', props.lesson, { note: note.value }) }

// Правка состава: проведённый урок не меняется (цены уже зафиксированы), последнего ученика не убрать — для этого «Убрать урок»
const editable = computed(() => !!props.lesson && !props.lesson.done)
const adding = ref(false), q = ref('')
// Только известные ученики: id удалённых из базы / архивных в уроке могут остаться, но сервер их не примет
const ids = computed(() => members.value.filter(st => !st.archived).map(st => st.id))
const match = (st) => { const s = q.value.trim().toLowerCase().replace(/^@/, ''); return !s || st.name.toLowerCase().includes(s) || (st.username || '').toLowerCase().includes(s) }
const drop = (id) => emit('students', props.lesson, ids.value.filter(x => x !== id))
// Пустая ячейка — «Кого назначить?»: сверху группы (нажатие — урок сразу всей группе), ниже все ученики; сеткой по 4, как панель учеников
const groups = useGroups()
const shownGroups = computed(() => { const s = q.value.trim().toLowerCase(); return groups.value.filter(g => !s || g.label.toLowerCase().includes(s) || g.members.some(match)) })
const soloFound = computed(() => { const inGroup = new Set(groups.value.flatMap(g => g.members.map(m => m.id))); return studentStore.list.filter(st => !inGroup.has(st.id) && match(st)) })      // ученики из групп — в меню группы
const pickGroup = (g) => emit('pick', g.members.map(m => m.id).slice(0, MAX_GROUP))
// Добавить в этот урок (не в группу): только известные ученики, которых ещё нет в уроке
const full = computed(() => ids.value.length >= MAX_GROUP)
const others = computed(() => studentStore.list.filter(st => !props.lesson?.studentIds.includes(st.id)))
const found = computed(() => others.value.filter(match))
const add = (id) => { if (!full.value) emit('students', props.lesson, [...ids.value, id]) }
const openAdd = () => { q.value = ''; adding.value = true }
const sub = (st) => [st.level, handle(st)].filter(Boolean).join(' · ') || 'ученик'      // вторая строка в списке, как «last seen» в Telegram
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'ученик' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'ученика' : 'учеников')
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')">
    <div class="sheet-box" :class="lesson ? 'tgbox lsn' : 'tgbox'" role="dialog" aria-modal="true">
      <template v-if="lesson">
        <!-- Шапка как «Информация» в Telegram: крупный кружок, имя, под ним время и статус текстом; закрыть — крестик справа -->
        <div class="head">
          <AvatarStack v-if="members.length > 1" :students="members" :size="52" :max="3" />
          <Avatar v-else-if="members[0]" :s="members[0]" :size="56" />
          <div class="ttl"><h2 :title="isGroup ? `Групповой урок: ${size} ${word(size)}` : ''">{{ isGroup ? `Группа · ${size}` : members[0]?.name || gone.find(g => g.name)?.name || 'Урок' }}</h2>
            <div class="hint">{{ when }} · <span class="badge" :class="allOff ? 'bad' : lesson.done ? 'ok' : 'warn'">{{ allOff ? 'Отменён' : lesson.done ? 'Проведён' : 'Запланирован' }}</span></div></div>
          <button class="close" aria-label="Закрыть" @click="emit('close')"><AppIcon name="x" :size="18" /></button>
        </div>

        <div v-if="!members.length && !gone.some(g => g.name)" class="hint orphan">Ученика этого урока больше нет в списке (удалён или в архиве). Добавьте ученика или уберите урок.</div>
        <!-- Ученики урока — строками, как участники группы в Telegram -->
        <div class="sec box" :class="{ group: isGroup }">
          <div class="stitle">{{ isGroup ? `${size} ${word(size)}` : 'Ученик' }}</div>
          <div v-for="st in members" :key="st.id" class="tile" :class="{ off: off(st.id) }">
            <button class="ava" :disabled="st.archived" :title="st.archived ? `${st.name} — в архиве` : `Открыть: ${st.name}`" @click="emit('open', st.id)"><Avatar :s="st" :size="42" :online="isOnline(st)" /></button>
            <span class="tx"><b class="nm">{{ st.name }}</b>
              <small v-if="st.archived" class="arch-l">в архиве{{ cost(st) ? ` · ${cost(st)}` : '' }}</small>
              <small v-else-if="off(st.id)" class="pr offtxt">отменил — без оплаты</small>
              <small v-else class="pr">{{ cost(st) ? `${cost(st)} за урок` : 'цена не указана' }}</small></span>
            <button v-if="cancelable && isGroup && !st.archived" class="chipbtn" :class="{ on: off(st.id) }" :aria-pressed="off(st.id)" :aria-label="`${st.name}: ${off(st.id) ? 'вернуть в урок' : 'отменил'}`" @click="emit('cancel', lesson, st.id, !off(st.id))">{{ off(st.id) ? 'Вернуть' : 'Отменил' }}</button>
            <button v-if="editable && members.length > 1 && !st.archived" class="x" :aria-label="`Убрать из урока: ${st.name}`" :title="`Убрать из урока: ${st.name}`" @click="drop(st.id)"><AppIcon name="x" :size="14" /></button>
          </div>
          <div v-for="g in gone.filter(x => x.name)" :key="g.id" class="tile gone" :title="`${g.name} — удалён(а), урок сохранён в истории`">
            <span class="ava"><span class="q">?</span></span><span class="tx"><b class="nm">{{ g.name }} (удалён)</b><small v-if="g.price" class="pr">{{ g.price }}</small></span>
          </div>
          <button v-if="editable && !adding" class="tile plus" :disabled="full || !others.length" aria-label="Добавить ученика в этот урок" @click="openAdd">
            <span class="pic"><AppIcon name="plus" :size="22" /></span><span class="tx"><b>Добавить ученика</b><small>только в этот урок{{ isGroup ? ' — в группу не добавится' : '' }}</small></span></button>
          <div v-if="total" class="total"><span>{{ isGroup ? 'Итого за урок' : 'Цена урока' }}</span><b>{{ total }}</b></div>
          <div v-if="lost" class="total lostrow"><span>Потеряно — отменил ученик</span><b>−{{ lost }}</b></div>
        </div>

        <div v-if="editable && adding" class="add">
          <div class="search"><AppIcon name="search" :size="16" /><input v-model="q" placeholder="Поиск ученика" aria-label="Поиск ученика" /><button v-if="q" class="clr" aria-label="Очистить" @click="q = ''"><AppIcon name="x" :size="14" /></button></div>
          <div class="rows scroll">
            <button v-for="st in found" :key="st.id" class="prow" :disabled="full" @click="add(st.id)">
              <Avatar :s="st" :size="42" :online="isOnline(st)" /><span class="tx"><b>{{ st.name }}</b><small :class="{ onl: isOnline(st) }">{{ isOnline(st) ? 'в сети' : sub(st) }}</small></span>
            </button>
          </div>
          <div v-if="!found.length" class="hint empty">{{ others.length ? 'Никого не нашли' : 'Все ученики уже в этом уроке' }}</div>
          <div class="foot"><span class="hint">{{ full ? `Не больше ${MAX_GROUP} в уроке` : 'Только в этот урок — состав группы не меняется' }}</span><button class="link" @click="adding = false">Готово</button></div>
        </div>
        <div v-if="!editable && !locked" class="hint note-l">Состав проведённого урока не меняется — сначала снимите отметку.</div>
        <div v-if="locked" class="hint note-l">В уроке есть {{ members.some(st => st.archived) ? 'ученик из архива' : 'удалённый ученик' }}: урок сохранён в истории, его состав и отметку «проведён» не изменить.</div>

        <!-- Время и заметка -->
        <div class="sec meta">
          <div class="mrow"><span class="ic"><AppIcon name="calendar" :size="20" /></span><span class="lab">Начало</span>
            <div class="seg mins" role="radiogroup" aria-label="Начало урока">
              <button v-for="m in MINUTES" :key="m" role="radio" :aria-checked="(lesson.minute || 0) === m" :class="{ on: (lesson.minute || 0) === m }" @click="emit('details', lesson, { minute: m })">{{ hh(lesson.hour, m) }}</button>
            </div></div>
          <div class="mrow notes"><span class="ic"><AppIcon name="pencil" :size="20" /></span>
            <textarea v-model="note" rows="1" maxlength="300" placeholder="Заметка — видите только вы" aria-label="Заметка к уроку" @blur="saveNote" @keydown.enter.exact.prevent="saveNote(); $event.target.blur()" />
            <button v-if="noteDirty" class="link save" @mousedown.prevent @click="saveNote">Сохранить</button></div>
        </div>

        <!-- Действия — строками меню, как в Telegram: иконка и текст; опасное — красным внизу -->
        <div class="sec menu">
          <button class="mi" :class="lesson.done ? 'grey' : 'green'" :disabled="locked || (allOff && !lesson.done)" @click="emit('done', lesson)">
            <AppIcon :name="lesson.done ? 'undo' : 'check'" :size="20" />{{ lesson.done ? 'Снять отметку «проведён»' : 'Урок проведён' }}</button>
          <button v-if="cancelable && members.length === 1" class="mi cancel" :class="off(members[0].id) ? 'green' : 'orange'" @click="emit('cancel', lesson, members[0].id, !off(members[0].id))">
            <AppIcon :name="off(members[0].id) ? 'undo' : 'x'" :size="20" />{{ off(members[0].id) ? 'Вернуть урок (ученик придёт)' : 'Ученик отменил — без оплаты' }}</button>
          <button class="mi red" :disabled="lesson.done" @click="emit('remove', lesson)"><AppIcon name="trash" :size="20" />Убрать урок</button>
        </div>
      </template>

      <template v-else>
        <div class="tg">
          <h2>Кого назначить?</h2>
          <div class="when">{{ when }}</div>
          <label class="tsearch"><AppIcon name="search" :size="18" /><input v-model="q" placeholder="Поиск" aria-label="Поиск ученика" /><button v-if="q" class="clr" aria-label="Очистить" @click="q = ''"><AppIcon name="x" :size="14" /></button></label>
          <div class="pick scroll">
            <!-- Как панель учеников: группы подложкой, нажатие на группу — меню («Всей группе» или любой её ученик), остальные — кружками -->
            <StudentGrid :groups="shownGroups" :students="soloFound" @pick="emit('pick', [$event])" @group="pickGroup" />
            <div v-if="!soloFound.length && !shownGroups.length" class="hint empty">Никого не нашли</div>
          </div>
          <div class="tfoot"><button class="link" @click="emit('close')">Отмена</button></div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Карточка урока в стиле Telegram («Информация о группе»): узкое окно без внешних отступов, разделы через серые полосы, строки во всю ширину */
.sheet-box.lsn { display: block; overflow-y: auto; background: var(--surface) }
.lsn > * { background: var(--card) }
.lsn .sec, .lsn .add, .lsn .note-l, .lsn .orphan { margin-top: 8px }
.head { display: flex; align-items: center; gap: 14px; padding: 18px 14px 16px 20px }
.ttl { flex: 1; min-width: 0 } .ttl h2 { margin: 0; font-size: 19px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .ttl .hint { margin-top: 2px; font-size: 14px; font-weight: 600 }
.head .badge { padding: 0; background: none; border: 0; font-size: 14px; font-weight: 700 }
.close { flex: none; align-self: flex-start; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .close:hover { background: var(--surface) }
.stitle { padding: 12px 20px 4px; font-size: 14px; font-weight: 800; color: var(--blue) }
/* Строка ученика: кружок 42px, имя и серая подпись (цена / «отменил»), справа — «Отменил» и ✕ (убрать из группы) */
.tile { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 56px; padding: 6px 12px 6px 20px; border: 0; background: none; font: inherit; color: var(--text); text-align: left }
.ava { flex: none; position: relative; display: grid; place-items: center; width: 42px; height: 42px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer }
.ava:disabled { cursor: default }
.tx { flex: 1; display: grid; min-width: 0; line-height: 1.25 } .nm, .tx b { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.pr, .arch-l { font-size: 13px; font-weight: 500; color: var(--hint) }
.x { flex: none; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--hint-2); cursor: pointer } .x:hover { background: var(--red-l); color: var(--red-d) }
.pickable { cursor: pointer; border-radius: 14px } .pickable:hover:not(:disabled) { background: var(--blue-l) } .pickable:disabled { opacity: .45; cursor: not-allowed }
.gone .q { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: var(--hint-2); color: #fff; font-size: 20px; font-weight: 900 } .gone .nm { color: var(--hint) }
.tile.off .ava { opacity: .45 } .tile.off .nm { text-decoration: line-through; color: var(--hint) }
.offtxt { color: var(--red-d) !important } html[data-theme='dark'] .offtxt { color: var(--red) !important }
.orphan, .note-l { padding: 12px 20px; font-size: 13px }
.total { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; border-top: 1px solid var(--border); font-size: 14px; font-weight: 600; color: var(--hint) }
.total b { font-size: 17px; font-weight: 900; color: var(--text) }
.lostrow { border-top: 0 !important; padding-top: 0 } .lostrow b { color: var(--red-d); font-size: 15px } html[data-theme='dark'] .lostrow b { color: var(--red) }
/* Время и заметка: строки с иконкой слева, как настройки в Telegram */
.meta { display: grid; padding: 4px 0 }
.mrow { display: flex; align-items: center; gap: 14px; padding: 8px 14px 8px 20px } .ic { flex: none; display: grid; place-items: center; width: 42px; color: var(--hint) }
.mrow .lab { flex: none; margin: 0; font-size: 15px; font-weight: 700 }
.mins { margin-left: auto; display: grid; grid-template-columns: repeat(4, auto); padding: 2px; border-width: 1px; border-radius: 10px } .mins button { padding: 4px 8px; font-size: 13px }
.notes { position: relative; align-items: flex-start } .notes .ic { padding-top: 8px }
.notes textarea { flex: 1; margin: 0; resize: vertical; min-height: 38px; font-size: 14px; padding: 8px 10px; border-width: 1px; border-radius: 10px }
.save { position: absolute; right: 18px; bottom: -4px; padding: 2px 4px; font-size: 13px }
/* Меню действий */
.menu { display: grid; padding: 4px 0 }
.mi { display: flex; align-items: center; gap: 24px; width: 100%; padding: 13px 20px 13px 29px; border: 0; background: none; font: inherit; font-size: 15px; font-weight: 700; text-align: left; cursor: pointer; color: var(--text) }
.mi:hover:not(:disabled) { background: var(--surface) } .mi:disabled { opacity: .4; cursor: not-allowed }
.mi.green { color: var(--green-d) } .mi.orange { color: var(--orange-d) } .mi.red { color: var(--red-d) } .mi.grey { color: var(--hint) }
html[data-theme='dark'] .mi.green { color: var(--green) } html[data-theme='dark'] .mi.red { color: var(--red) }
.chipbtn { flex: none; padding: 4px 10px; border: 1px solid var(--border); border-radius: 99px; background: var(--card); color: var(--hint); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.chipbtn:hover { border-color: var(--red); color: var(--red-d) } .chipbtn.on { border-color: var(--green); background: var(--green-l); color: var(--green-d) }
.lsn .add { border: 0; border-radius: 0; padding: 8px 12px }

/* Выбор ученика — как «Поделиться» в Telegram: поиск сверху, сетка с прокруткой, действия справа внизу */
.add { display: grid; gap: 8px; border: 1px solid var(--border); border-radius: 16px; padding: 8px }
.search { display: flex; align-items: center; gap: 8px; padding: 0 10px; border-bottom: 1px solid var(--border); color: var(--hint-2) }
.search input { margin: 0; padding: 10px 0; border: 0; background: none; border-radius: 0 }
.search input:focus { background: none } .search input:focus-visible { outline: none }
.clr { display: grid; place-items: center; padding: 4px; border: 0; background: none; color: var(--hint-2); cursor: pointer }
.scroll { max-height: 300px; overflow-y: auto; overscroll-behavior: contain }
.empty { text-align: center; padding: 8px 0 }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 2px 6px 0 }
.foot .hint { font-size: 12px }
.link { border: 0; background: none; padding: 6px 4px; font: inherit; font-size: 15px; font-weight: 800; color: var(--blue); cursor: pointer }
.sheet-box { grid-template-columns: minmax(0, 1fr) }

/* Список учеников — как «Переслать» в Telegram: строка = аватарка 42px, имя и серая подпись; подсветка строки при наведении */
.rows { display: grid; align-content: start }
.prow { display: flex; align-items: center; gap: 12px; width: 100%; padding: 6px 12px; border: 0; border-radius: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; min-width: 0 }
.prow:hover:not(:disabled) { background: var(--surface) } .prow:disabled { opacity: .45; cursor: not-allowed }
.prow :deep(.av) { flex: none }
.tx { flex: 1; display: grid; justify-items: start; min-width: 0; line-height: 1.25; text-align: left } .tx b { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tx small.onl { color: var(--blue) }
.tx small { font-size: 13px; font-weight: 500; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.add .rows { margin: 0 -8px }
/* полоса прокрутки — общая для всего приложения, styles/theme.css */

/* Окно «Кого назначить?» — пропорции Telegram: узкое, заголовок, поиск во всю ширину с тонкой линией, длинный список, «Отмена» справа внизу */
.sheet-box.tgbox { max-width: 420px; padding: 0; gap: 0; overflow: hidden }
.tg { display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto; max-height: min(640px, 86vh) }
.tg h2 { margin: 0; padding: 20px 20px 0; font-size: 19px; font-weight: 800 }
.tg .when { padding: 2px 20px 10px; font-size: 13px; font-weight: 600; color: var(--hint) }
.tsearch { display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid var(--border); color: var(--hint-2) }
.tsearch input { margin: 0; padding: 12px 0; border: 0; border-radius: 0; background: none; font-weight: 500; font-size: 15px } .tsearch input:focus { background: none } .tsearch input:focus-visible { outline: none }
.tg .rows { max-height: none; min-height: 0; padding: 6px 0 }
/* «Добавить ученика» — только в этот урок */
.plus { cursor: pointer; color: var(--blue) } .plus .pic { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: var(--blue-l); color: var(--blue) } .plus b { color: var(--blue) }
.plus:hover:not(:disabled) { background: var(--surface) } .plus:disabled { opacity: .4; cursor: not-allowed }
/* Сетка учеников — StudentGrid (как панель учеников) */
.pick { display: grid; gap: 8px; align-content: start; min-height: 0; overflow-y: auto; padding: 8px 10px 10px }
.tg .prow { padding: 7px 20px; gap: 14px } .tg .prow :deep(.av) { width: 46px !important; height: 46px !important }
.tfoot { display: flex; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid var(--border) }
.tfoot .link { font-size: 15px; font-weight: 700; padding: 6px 10px }                        /* ничто не распирает шторку шире экрана */
.acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px } .acts .btn { min-width: 0; padding-left: 6px; padding-right: 6px; font-size: 14px; letter-spacing: .3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
</style>

<script setup>
// Шторка: либо карточка урока (состав, цена, отметка «проведён», убрать урок), либо выбор ученика для пустого слота.
// Урок — сущность со списком учеников: здесь можно добавить учеников (урок становится групповым) и убрать их.
// Цена урока = сумма цен всех учеников (у каждого своя, на время урока; у проведённого — зафиксированная).
// Ученики показаны компактной сеткой кружков (как «Поделиться» в Telegram): аватарка, имя под ней; выбор — через поиск.
import { computed, ref } from 'vue'
import { fmtSlot } from '../store/app'
import Avatar from './Avatar.vue'
import AvatarStack from './AvatarStack.vue'
import AppIcon from './AppIcon.vue'
import { useStudentsStore } from '../stores/students'
import { priceAt } from '../utils/price'
const MAX_GROUP = 12                                              // как на сервере (server/schedule.ts)
const studentStore = useStudentsStore()
const props = defineProps({ lesson: Object, slot: Object })
const emit = defineEmits(['close', 'remove', 'open', 'pick', 'done', 'students'])
const members = computed(() => (props.lesson?.studentIds ?? []).map(id => studentStore.list.find(x => x.id === id)).filter(Boolean))   // архивных учеников в списке нет
const cost = (st) => (!props.lesson ? 0 : props.lesson.done && props.lesson.prices?.[st.id] != null ? props.lesson.prices[st.id] : priceAt(st, props.lesson.date, props.lesson.hour))      // цена на время урока: прошедшие уроки не пересчитываются
// Ученики урока, которых нет в списке: удалённые навсегда (у проведённого урока имя сохранено в names) или удалённые из базы вручную
const gone = computed(() => (props.lesson?.studentIds ?? []).filter(id => !studentStore.byId(id)).map(id => ({ id, name: props.lesson.names?.[id] || '', price: props.lesson.done ? props.lesson.prices?.[id] ?? 0 : 0 })))
const size = computed(() => members.value.length + gone.value.filter(g => g.name).length)      // все ученики урока, включая удалённых навсегда
const isGroup = computed(() => size.value > 1)
const locked = computed(() => !!props.lesson?.done && gone.value.some(g => g.name))       // в уроке есть удалённый навсегда: отметку не снять, иначе пропадёт история
const total = computed(() => members.value.reduce((sum, st) => sum + cost(st), 0) + gone.value.reduce((sum, g) => sum + g.price, 0))
const when = computed(() => props.lesson ? fmtSlot(props.lesson.date, props.lesson.hour) : fmtSlot(props.slot.date, props.slot.hour))

// Правка состава: проведённый урок не меняется (цены уже зафиксированы), последнего ученика не убрать — для этого «Убрать урок»
const editable = computed(() => !!props.lesson && !props.lesson.done)
const adding = ref(false), q = ref('')
// Только известные ученики: id удалённых из базы / архивных в уроке могут остаться, но сервер их не примет
const ids = computed(() => members.value.map(st => st.id))
const full = computed(() => ids.value.length >= MAX_GROUP)
const others = computed(() => studentStore.list.filter(st => !props.lesson?.studentIds.includes(st.id)))
const match = (st) => { const s = q.value.trim().toLowerCase().replace(/^@/, ''); return !s || st.name.toLowerCase().includes(s) || (st.username || '').toLowerCase().includes(s) }
const found = computed(() => (props.lesson ? others.value : studentStore.list).filter(match))
const add = (id) => { if (!full.value) emit('students', props.lesson, [...ids.value, id]) }
const drop = (id) => emit('students', props.lesson, ids.value.filter(x => x !== id))
const openAdd = () => { q.value = ''; adding.value = true }
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'ученик' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'ученика' : 'учеников')
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')">
    <div class="sheet-box" role="dialog" aria-modal="true">
      <template v-if="lesson">
        <div class="head">
          <AvatarStack v-if="members.length > 1" :students="members" :size="36" :max="3" />
          <Avatar v-else-if="members[0]" :s="members[0]" :size="36" />
          <div class="ttl"><h2 :title="isGroup ? `Групповой урок: ${size} ${word(size)}` : ''">{{ isGroup ? `Группа · ${size}` : members[0]?.name || gone.find(g => g.name)?.name || 'Урок' }}</h2><div class="hint">{{ when }}</div></div>
          <span class="badge" :class="lesson.done ? 'ok' : 'warn'">{{ lesson.done ? 'Проведён' : 'Запланирован' }}</span>
        </div>

        <div v-if="!members.length && !gone.some(g => g.name)" class="hint orphan">Ученика этого урока больше нет в списке (удалён или в архиве). Добавьте ученика или уберите урок.</div>
        <div class="box" :class="{ group: isGroup }">
          <div class="tiles">
            <div v-for="st in members" :key="st.id" class="tile">
              <button class="ava" :title="`Открыть: ${st.name}`" @click="emit('open', st.id)"><Avatar :s="st" :size="48" /></button>
              <button v-if="editable && members.length > 1" class="x" :aria-label="`Убрать из урока: ${st.name}`" @click="drop(st.id)"><AppIcon name="x" :size="12" /></button>
              <span class="nm">{{ st.name }}</span><span v-if="cost(st)" class="pr">{{ cost(st) }}</span>
            </div>
            <div v-for="g in gone.filter(x => x.name)" :key="g.id" class="tile gone" :title="`${g.name} — удалён(а), урок сохранён в истории`">
              <span class="ava"><span class="q">?</span></span><span class="nm">{{ g.name }} (удалён)</span><span v-if="g.price" class="pr">{{ g.price }}</span>
            </div>
            <div v-if="editable && !adding" class="tile">
              <button class="ava plus" :disabled="full || !others.length" aria-label="Добавить ученика" @click="openAdd"><AppIcon name="plus" :size="22" /></button>
              <span class="nm">Добавить</span>
            </div>
          </div>
          <div v-if="total" class="total"><span>{{ isGroup ? 'Итого за урок' : 'Цена урока' }}</span><b>{{ total }}</b></div>
        </div>

        <div v-if="editable && adding" class="add">
          <div class="search"><AppIcon name="search" :size="16" /><input v-model="q" placeholder="Поиск ученика" aria-label="Поиск ученика" /><button v-if="q" class="clr" aria-label="Очистить" @click="q = ''"><AppIcon name="x" :size="14" /></button></div>
          <div class="tiles scroll">
            <button v-for="st in found" :key="st.id" class="tile pickable" :disabled="full" @click="add(st.id)">
              <span class="ava"><Avatar :s="st" :size="48" /></span><span class="nm">{{ st.name }}</span>
            </button>
          </div>
          <div v-if="!found.length" class="hint empty">{{ others.length ? 'Никого не нашли' : 'Все ученики уже в этом уроке' }}</div>
          <div class="foot"><span class="hint">{{ full ? `Не больше ${MAX_GROUP} в группе` : 'Нажмите, чтобы добавить' }}</span><button class="link" @click="adding = false">Готово</button></div>
        </div>
        <div v-if="!editable && !locked" class="hint">Состав проведённого урока не меняется — сначала снимите отметку.</div>

        <div v-if="locked" class="hint">В уроке есть удалённый ученик: урок сохранён в истории, его состав и отметку «проведён» не изменить.</div>
        <button class="btn" :class="{ ghost: lesson.done }" :disabled="locked" @click="emit('done', lesson)">{{ lesson.done ? 'Снять отметку «проведён»' : 'Урок проведён' }}</button>
        <div class="row2 acts">
          <button class="btn ghost" style="color:var(--red)" :disabled="lesson.done" @click="emit('remove', lesson)"><AppIcon name="trash" :size="16" /> Убрать урок</button>
          <button class="btn ghost" style="color:var(--hint)" @click="emit('close')">Закрыть</button>
        </div>
      </template>

      <template v-else>
        <div class="ttl"><h2>Кого назначить?</h2><div class="hint">{{ when }} · группу можно собрать, открыв урок после назначения</div></div>
        <div class="add">
          <div class="search"><AppIcon name="search" :size="16" /><input v-model="q" placeholder="Поиск ученика" aria-label="Поиск ученика" /><button v-if="q" class="clr" aria-label="Очистить" @click="q = ''"><AppIcon name="x" :size="14" /></button></div>
          <div class="tiles scroll">
            <button v-for="st in found" :key="st.id" class="tile pickable" @click="emit('pick', st.id)">
              <span class="ava"><Avatar :s="st" :size="48" /></span><span class="nm">{{ st.name }}</span>
            </button>
          </div>
          <div v-if="!found.length" class="hint empty">Никого не нашли</div>
          <div class="foot"><span /><button class="link" @click="emit('close')">Отмена</button></div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 12px }
.ttl { flex: 1; min-width: 0 } .ttl h2 { margin: 0; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .ttl .hint { font-size: 13px }
.head .badge { flex: none; padding: 3px 8px; font-size: 12px }

/* Сетка кружков: аватарка и имя под ней (2 строки), 4–5 в ряд */
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 10px 4px }
.tile { position: relative; display: grid; justify-items: center; align-content: start; gap: 4px; padding: 4px 2px; border: 0; background: none; font: inherit; color: var(--text); text-align: center; min-width: 0 }
.ava { position: relative; display: grid; place-items: center; width: 52px; height: 52px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; transition: transform .08s }
.ava:active:not(:disabled) { transform: scale(.94) }
.nm { width: 100%; font-size: 12px; font-weight: 700; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word }
.pr { font-size: 12px; font-weight: 900; color: var(--hint) }
.x { position: absolute; top: 0; left: calc(50% + 12px); display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 2px solid var(--card); border-radius: 50%; background: var(--red); color: #fff; cursor: pointer; z-index: 1 }
.plus { border: 2px dashed var(--hint-2); color: var(--hint) }
.plus:hover:not(:disabled) { border-color: var(--green); color: var(--green); background: var(--green-l) }
.plus:disabled { opacity: .4; cursor: not-allowed }
.pickable { cursor: pointer; border-radius: 14px } .pickable:hover:not(:disabled) { background: var(--blue-l) }
.pickable:disabled { opacity: .45; cursor: not-allowed }

.box { display: grid; gap: 8px; padding: 10px 6px 8px; border-radius: 16px; border: 2px solid var(--border) }
/* Групповой урок — фиолетовый, как его карточка в расписании (WeekGrid.vue) */
.box.group { background: var(--purple-l); border-color: var(--purple) }
.box.group .x { border-color: var(--purple-l) }
.orphan { padding: 10px 12px; border: 2px dashed var(--border); border-radius: 14px }
.total { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px 0; border-top: 2px solid var(--border); font-size: 14px; color: var(--hint) }
.box.group .total { border-color: rgba(165, 96, 232, .3) }
.gone .ava { cursor: default } .gone .q { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--hint-2); color: #fff; font-size: 22px; font-weight: 900 }
.gone .nm { color: var(--hint) }
.total b { font-size: 18px; font-weight: 900; color: var(--text) }

/* Выбор ученика — как «Поделиться» в Telegram: поиск сверху, сетка с прокруткой, действия справа внизу */
.add { display: grid; gap: 8px; border: 2px solid var(--border); border-radius: 16px; padding: 8px }
.search { display: flex; align-items: center; gap: 8px; padding: 0 10px; border-bottom: 2px solid var(--border); color: var(--hint-2) }
.search input { margin: 0; padding: 10px 0; border: 0; background: none; border-radius: 0 }
.search input:focus { background: none }
.clr { display: grid; place-items: center; padding: 4px; border: 0; background: none; color: var(--hint-2); cursor: pointer }
.scroll { max-height: 236px; overflow-y: auto; overscroll-behavior: contain; padding-right: 2px }
.empty { text-align: center; padding: 8px 0 }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 2px 6px 0 }
.foot .hint { font-size: 12px }
.link { border: 0; background: none; padding: 6px 4px; font: inherit; font-size: 15px; font-weight: 800; color: var(--blue); cursor: pointer }
.sheet-box { grid-template-columns: minmax(0, 1fr) }                        /* ничто не распирает шторку шире экрана */
.acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px } .acts .btn { min-width: 0; padding-left: 6px; padding-right: 6px; font-size: 14px; letter-spacing: .3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
</style>

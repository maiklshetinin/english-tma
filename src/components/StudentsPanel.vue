<script setup>
// Список учеников — компактная сетка кружков (как «Поделиться» в Telegram): аватарка, имя под ней.
// Группы — отдельная сущность (stores/groups): создаются только здесь (кнопка «группа +»), состав — только через меню группы.
// Кружок можно перетащить в таблицу, группу — только целиком (урок всей группе); урок из таблицы, брошенный сюда, снимается с расписания.
// Нажатие на группу — меню (как в iOS): её ученики (потянуть — урок только ему, нажать — карточка, ✕ — убрать из группы),
// «Добавить ученика», «Расформировать». Ученик может быть в нескольких группах — в списках у таких пометка «уже в группе …». Изменения — с подтверждением; состав группы меняется и в её будущих уроках.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { isOnline } from '../utils/online'
import { useRouter } from 'vue-router'
import { handle } from '../store/app'
import { useGroups, lessonsOfGroup } from '../composables/useGroups'
import { dnd, pressStart } from '../composables/useDnd'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import AddStudent from './AddStudent.vue'
import { useStudentsStore } from '../stores/students'
import { useScheduleStore } from '../stores/schedule'
import { useGroupsStore } from '../stores/groups'
import { showToast } from '../composables/useToast'
const studentStore = useStudentsStore()
const q = ref('')
const adding = ref(false)                       // «+» — форма «Новый ученик» в шторке (та же, что во вкладке «Ученики»)
const list = computed(() => { const k = q.value.trim().toLowerCase(); return studentStore.list.filter(s => !k || (s.name + ' ' + (s.username || '')).toLowerCase().includes(k)) })
const groups = useGroups()                     // группы учеников (composables/useGroups)
const match = (s) => { const k = q.value.trim().toLowerCase(); return !k || (s.name + ' ' + (s.username || '')).toLowerCase().includes(k) }
const shownGroups = computed(() => groups.value.map(g => ({ ...g, members: g.members.filter(match) })).filter(g => g.members.length))
const solo = computed(() => { const inGroup = new Set(groups.value.flatMap(g => g.members.map(s => s.id))); return list.value.filter(s => !inGroup.has(s.id)) })
const trash = computed(() => dnd.active && dnd.payload?.kind === 'lesson')
const trashOver = computed(() => trash.value && dnd.over?.kind === 'panel')
// Меню (группы или «Новая группа»): где показать — под элементом (не влезает — над ним), прижато к краям экрана
const pop = ref(null)
const POP_W = 260
function place(e, h) {
  const r = e.currentTarget.getBoundingClientRect()
  const left = Math.min(Math.max(8, r.left + r.width / 2 - POP_W / 2), innerWidth - POP_W - 8)
  const below = r.bottom + 6 + h < innerHeight - 8
  return { style: { left: left + 'px', width: POP_W + 'px', ...(below ? { top: r.bottom + 6 + 'px' } : { bottom: innerHeight - r.top + 6 + 'px' }) }, up: !below }
}
function openPop(sg, e) {
  const g = groups.value.find(x => x.key === sg.key) ?? sg                    // в меню — вся группа, даже если поиск оставил не всех
  pop.value = { g, view: 'list', aq: '', sel: [], ...place(e, 44 + (g.members.length + 2) * 52) }
}
const openNew = (e) => { pop.value = { g: null, view: 'new', aq: '', sel: [], ...place(e, 420) } }
const closePop = () => { pop.value = null }
watch(() => dnd.active, (on) => { if (on) closePop() })                      // потянули ученика из меню — меню закрывается, тащим дальше
const onKey = (e) => { if (e.key === 'Escape') closePop() }
onMounted(() => { addEventListener('keydown', onKey); addEventListener('resize', closePop) })
onUnmounted(() => { removeEventListener('keydown', onKey); removeEventListener('resize', closePop) })

// Состав группы меняется в группе (сервер) и в её будущих уроках: убрали — уходит из них, добавили — появляется во всех.
// Проведённые уроки не меняются. Перед изменением — подтверждение в том же меню, после — тост с «Отменить».
const scheduleStore = useScheduleStore(), groupsStore = useGroupsStore()
const MAX_GROUP = 12
const alive = (id) => !!studentStore.byId(id)
const known = (l) => l.studentIds.filter(alive)
const futureOf = (g) => lessonsOfGroup(g.members.map(m => m.id), scheduleStore.lessons, alive, true)
const gname = (g) => (g.label === 'без урока' ? 'группы' : `группы ${g.label}`)      // «из группы Пт 20:00» / «из группы»
const lessonsWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'урок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'урока' : 'уроков')
const inPop = computed(() => new Set(pop.value?.g ? pop.value.g.members.map(m => m.id) : []))
// Ученик может быть в нескольких группах (как в Telegram): в списках — все, кого нет в этой группе; у состоящих в других — пометка
const otherGroups = (s) => groups.value.filter(g => g.key !== pop.value?.g?.key && g.members.some(m => m.id === s.id))
// «в группе Пт 20:00» — если у группы есть урок, иначе «в группе: Егор Т., Леня С.»
const candSub = (s) => {
  const o = otherGroups(s); if (!o.length) return sub(s)
  return o.map(g => g.label !== 'без урока' ? `в группе ${g.label}` : `в группе: ${g.members.filter(m => m.id !== s.id).slice(0, 2).map(m => m.name).join(', ')}${g.members.length > 3 ? '…' : ''}`).join(' · ')
}
const candidates = computed(() => {
  if (!pop.value) return []
  const k = pop.value.aq.trim().toLowerCase().replace(/^@/, '')
  return studentStore.list.filter(s => !inPop.value.has(s.id) && (!k || (s.name + ' ' + (s.username || '')).toLowerCase().includes(k)))
})
const pickNew = (id) => { const sel = pop.value.sel; const i = sel.indexOf(id); i >= 0 ? sel.splice(i, 1) : sel.length < MAX_GROUP && sel.push(id) }
const ask = (kind, s = null) => {
  const g = pop.value.g, n = kind === 'remove' ? futureOf(g).filter(l => l.studentIds.includes(s.id)).length : kind === 'add' ? futureOf(g).length : 0
  pop.value = { ...pop.value, view: 'confirm', kind, s, n, last: kind === 'remove' && g.members.length <= 2 }
}
function applyChange() {
  const { g, kind, s, last } = pop.value, was = [], group = groupsStore.byId(g.id), before = group ? group.studentIds.slice() : []
  if (kind === 'dissolve') {
    groupsStore.remove(group); closePop()
    return showToast(`Группа расформирована — уроки остались`, () => groupsStore.set([...groupsStore.list, { id: g.id, studentIds: before }]))
  }
  for (const l of futureOf(g)) {
    const ids = known(l)
    if (kind === 'remove' && ids.includes(s.id)) { was.push([l, l.studentIds.slice()]); scheduleStore.setStudents(l, ids.filter(id => id !== s.id)) }
    if (kind === 'add' && !ids.includes(s.id) && ids.length < MAX_GROUP) { was.push([l, l.studentIds.slice()]); scheduleStore.setStudents(l, [...ids, s.id]) }
  }
  if (kind === 'remove' && last) groupsStore.remove(group)                                   // остался один — группы больше нет
  else groupsStore.setMembers(group, kind === 'remove' ? before.filter(id => id !== s.id) : [...before, s.id])
  closePop()
  const undo = () => {
    for (const [l, ids] of was) scheduleStore.setStudents(l, ids.filter(alive))
    if (groupsStore.byId(g.id)) groupsStore.setMembers(groupsStore.byId(g.id), before); else groupsStore.create(before)
  }
  showToast(kind === 'remove' ? (last ? `${s.name} убран(а), группа расформирована` : `${s.name} убран(а) из ${gname(g)}`) : `${s.name} добавлен(а) в ${gname(g).replace('группы', 'группу')}`, undo)
}
function createGroup() {
  const ids = pop.value.sel.slice(); if (ids.length < 2) return
  const g = groupsStore.create(ids); closePop()
  showToast(`Группа создана: ${ids.map(id => studentStore.byId(id)?.name).join(', ')}`, () => groupsStore.remove(g))
}
const sub = (s) => (isOnline(s) ? 'в сети' : [s.level, handle(s)].filter(Boolean).join(' · '))
const router = useRouter()
const open = (id) => { router.push({ name: 'home', params: { id } }) }      // панель живёт на «Главной»: карточка открывается там же
</script>

<template>
  <aside class="panel card" :class="{ trash, over: trashOver }" data-drop="panel">
    <header class="ph">
      <label class="search"><AppIcon name="search" :size="16" /><input v-model="q" :placeholder="`Поиск · ${studentStore.list.length}`" aria-label="Поиск ученика" /></label>
      <button class="addb grpb" title="Новая группа" aria-label="Новая группа" @click="openNew"><AppIcon name="users" :size="17" /><i>+</i></button>
      <button class="addb" title="Добавить ученика" aria-label="Добавить ученика" @click="adding = true"><AppIcon name="plus" :size="18" /></button></header>
    <div class="list">
      <!-- Одна сетка на 4 колонки: группа занимает столько колонок, сколько в ней учеников; остальные ученики заполняют свободные клетки рядом -->
      <div class="mix">
      <section v-for="g in shownGroups" :key="g.key" class="grp" :style="{ '--n': Math.min(4, g.members.length) }" :title="`Группа · ${g.label} — перетащите в таблицу, чтобы назначить урок всей группе`"
        role="button" tabindex="0" @pointerdown="pressStart($event, { kind: 'student', ids: g.members.map(m => m.id) })" @click="openPop(g, $event)" @keydown.enter="openPop(g, $event)" @dragstart.prevent>
        <i class="gi" aria-hidden="true"><AppIcon name="users" :size="10" /></i>
        <div class="tiles">
          <div v-for="s in g.members" :key="s.id" class="st">
            <span class="ava"><Avatar :s="s" :size="54" :online="isOnline(s)" /></span><span class="nm">{{ s.name }}</span>
          </div>
        </div>
      </section>
      <div v-for="s in solo" :key="s.id" class="st solo" role="button" tabindex="0" :title="`${s.name}${handle(s) ? ' · ' + handle(s) : ''}`" :aria-label="`${s.name}. Перетащите в таблицу, чтобы назначить урок`"
        @pointerdown="pressStart($event, { kind: 'student', ids: [s.id] })" @click="open(s.id)" @keydown.enter="open(s.id)" @dragstart.prevent>
        <span class="ava"><Avatar :s="s" :size="54" :online="isOnline(s)" /></span><span class="nm">{{ s.name }}</span>
      </div>
      </div>
      <p v-if="!list.length" class="hint empty">Никого не нашли</p>
    </div>
    <Teleport to="body"><div v-if="adding" class="sheet-bg" @click.self="adding = false"><div class="sheet-box"><AddStudent @close="adding = false" /></div></div></Teleport>
    <!-- Меню группы (как в iOS): ученики списком — потянуть любого в таблицу (урок только ему), нажать — его карточка -->
    <Teleport to="body">
      <div v-if="pop" class="gpop-bg" @click.self="closePop">
        <div class="gpop" :class="{ up: pop.up }" :style="pop.style" role="menu" :aria-label="pop.g ? `Группа · ${pop.g.label}` : 'Новая группа'">
          <!-- Состав: потянуть — урок только ему, нажать — карточка, ✕ — убрать из группы; внизу — добавить ученика -->
          <template v-if="pop.view === 'list'">
            <div class="gph"><AppIcon name="users" :size="14" /> Группа · {{ pop.g.label }}</div>
            <div v-for="s in pop.g.members" :key="s.id" class="gpr" role="menuitem" tabindex="0" :title="`${s.name}: перетащите в таблицу — урок только ему; нажмите — карточка`"
              @pointerdown="pressStart($event, { kind: 'student', ids: [s.id] })" @click="closePop(); open(s.id)" @keydown.enter="closePop(); open(s.id)" @dragstart.prevent>
              <Avatar :s="s" :size="36" :online="isOnline(s)" /><span class="gtx"><b>{{ s.name }}</b><small :class="{ onl: isOnline(s) }">{{ sub(s) }}</small></span>
              <button class="gx" :aria-label="`Убрать ${s.name} из группы`" title="Убрать из группы" @pointerdown.stop @click.stop="ask('remove', s)"><AppIcon name="x" :size="14" /></button>
            </div>
            <button class="gpr gadd" role="menuitem" :disabled="pop.g.members.length >= MAX_GROUP" @click="pop = { ...pop, view: 'add', aq: '' }"><span class="gic"><AppIcon name="plus" :size="18" /></span><b>Добавить ученика</b></button>
            <button class="gpr gadd red" role="menuitem" @click="ask('dissolve')"><span class="gic"><AppIcon name="trash" :size="17" /></span><b>Расформировать</b></button>
          </template>
          <!-- Новая группа: выбрать 2–12 учеников -->
          <template v-else-if="pop.view === 'new'">
            <div class="gph"><AppIcon name="users" :size="14" /> Новая группа<span v-if="pop.sel.length" class="gcnt">{{ pop.sel.length }}</span></div>
            <label class="gsearch"><AppIcon name="search" :size="14" /><input v-model="pop.aq" placeholder="Поиск" aria-label="Поиск ученика" /></label>
            <div class="glist">
              <button v-for="s in candidates" :key="s.id" class="gpr" :aria-pressed="pop.sel.includes(s.id)" @click="pickNew(s.id)"><Avatar :s="s" :size="36" :online="isOnline(s)" /><span class="gtx"><b>{{ s.name }}</b><small :class="{ onl: isOnline(s) && !otherGroups(s).length, og: otherGroups(s).length }">{{ candSub(s) }}</small></span>
                <i class="chk" :class="{ on: pop.sel.includes(s.id) }"><AppIcon v-if="pop.sel.includes(s.id)" name="check" :size="13" /></i></button>
              <p v-if="!candidates.length" class="gnone">{{ pop.aq ? 'Никого не нашли' : 'Все ученики уже в этой группе' }}</p>
            </div>
            <div class="gbt pad"><button class="lnk" @click="closePop">Отмена</button><button class="gok" :disabled="pop.sel.length < 2" @click="createGroup">Создать{{ pop.sel.length > 1 ? ` (${pop.sel.length})` : '' }}</button></div>
          </template>
          <!-- Добавить: свободные ученики с поиском -->
          <template v-else-if="pop.view === 'add'">
            <div class="gph"><button class="gback" aria-label="Назад" @click="pop = { ...pop, view: 'list' }"><AppIcon name="back" :size="14" /></button> В группу · {{ pop.g.label }}</div>
            <label class="gsearch"><AppIcon name="search" :size="14" /><input v-model="pop.aq" placeholder="Поиск" aria-label="Поиск ученика" /></label>
            <div class="glist">
              <button v-for="s in candidates" :key="s.id" class="gpr" @click="ask('add', s)"><Avatar :s="s" :size="36" :online="isOnline(s)" /><span class="gtx"><b>{{ s.name }}</b><small :class="{ onl: isOnline(s) && !otherGroups(s).length, og: otherGroups(s).length }">{{ candSub(s) }}</small></span></button>
              <p v-if="!candidates.length" class="gnone">{{ pop.aq ? 'Никого не нашли' : 'Все ученики уже в этой группе' }}</p>
            </div>
          </template>
          <!-- Подтверждение -->
          <div v-else class="gcf">
            <Avatar v-if="pop.s" :s="pop.s" :size="44" /><span v-else class="gic big"><AppIcon name="users" :size="22" /></span>
            <b>{{ pop.kind === 'remove' ? `Убрать ${pop.s.name} из ${gname(pop.g)}?` : pop.kind === 'add' ? `Добавить ${pop.s.name} в ${gname(pop.g).replace('группы', 'группу')}?` : `Расформировать ${gname(pop.g).replace('группы', 'группу')}?` }}</b>
            <small>{{ pop.kind === 'dissolve' ? 'Ученики станут по одному. Уроки группы останутся в расписании.'
              : pop.kind === 'remove' ? (pop.last ? 'В группе останется один ученик — группа расформируется. ' : '') + (pop.n ? `Уйдёт из ${pop.n} ${lessonsWord(pop.n)} группы. Проведённые не меняются.` : 'Будущих уроков у группы нет.')
              : pop.n ? `Появится во всех будущих уроках группы: ${pop.n}.` : 'Будущих уроков у группы пока нет — появится в новых.' }}</small>
            <div class="gbt"><button class="lnk" @click="pop = { ...pop, view: pop.kind === 'add' ? 'add' : 'list' }">Отмена</button>
              <button class="gok" :class="{ red: pop.kind !== 'add' }" @click="applyChange">{{ pop.kind === 'remove' ? 'Убрать' : pop.kind === 'add' ? 'Добавить' : 'Расформировать' }}</button></div>
          </div>
        </div>
      </div>
    </Teleport>
    <div v-if="trash" class="drophint"><AppIcon name="trash" :size="22" />Отпустите, чтобы снять урок</div>
  </aside>
</template>

<style scoped>
/* Высота — по содержимому (не на весь экран); если учеников много — список прокручивается внутри */
.panel { position: relative; padding: 0 0 6px; display: grid; grid-template-rows: auto minmax(0, 1fr); max-height: 100%; overflow: hidden }
/* Верх панели: поиск и «+» в одну строку, без заголовка */
.ph { display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px }
.addb { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--green-d); cursor: pointer }
.addb:hover { border-color: var(--green); background: var(--green-l) }
.search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; margin: 0; padding: 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--hint-2) }
.search:focus-within { border-color: var(--hint-2); background: var(--card) } .search input { border: 0; background: none; margin: 0; padding: 7px 0; min-width: 0; font-size: 14px }
.search input:focus-visible { outline: none }      /* рамку при фокусе даёт сам .search — без второй обводки */
/* Сетка кружков: аватарка 54px — максимум для 4 в ряд и имя под ней, по 4 в ряд; группы — блоками в рамке с подписью, ниже «Индивидуально» */
.list { display: grid; gap: 8px; align-content: start; overflow-y: auto; padding: 2px 6px 8px }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px 0 }
.mix { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-flow: row dense; gap: 6px 0 }

/* Значок группы — маленький кружок в левом верхнем углу подложки, в свободном месте у аватарки */
.gi { position: absolute; top: 3px; left: 5px; z-index: 2; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--card); color: var(--hint); font-style: normal; box-shadow: 0 0 0 1.5px var(--surface) }
/* Группа — только серая подложка под кружками (без подписи и рамки, клетки того же размера — сетка ровная); день и время — во всплывающей подсказке.
   Подложка чуть уже блока (::before) — соседние группы не сливаются, а сетка не сдвигается */
.grp { position: relative; grid-column: span var(--n); min-width: 0; cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none } .grp:active { cursor: grabbing }
.grp::before { content: ''; position: absolute; inset: 0 2px; border-radius: 14px; background: var(--surface); z-index: 0; transition: background .1s } .grp .tiles { position: relative }
.grp:hover::before, .grp:focus-visible::before { background: var(--blue-l) } .grp .st { cursor: inherit } .grp .st:hover { background: none } .grp:active .ava { transform: scale(.94) }      /* подсвечивается вся группа */
.grp .tiles { grid-template-columns: repeat(var(--n), minmax(0, 1fr)) }
.st { display: grid; justify-items: center; align-content: start; gap: 3px; padding: 4px 0; border-radius: 14px; min-width: 0;
  cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: background .1s }
.st:hover { background: var(--blue-l) } .st:active { cursor: grabbing } .st:active .ava { transform: scale(.94) }
.ava { position: relative; display: inline-grid; transition: transform .08s }
.nm { width: 100%; text-align: center; font-size: 11px; font-weight: 700; line-height: 1.2; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.empty { text-align: center; margin: 8px 0 }
.drophint { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 6px; text-align: center; padding: 12px; font-weight: 800; font-size: 14px;
  background: color-mix(in srgb, var(--card) 92%, transparent); color: var(--red); border: 3px dashed var(--red); border-radius: 14px }
.panel.over .drophint { background: var(--red-l) }

/* Телефон: панель превращается в полоску учеников, прикреплённую к верху экрана */
@media (max-width: 1023px) {
  .panel { height: auto; grid-template-rows: auto }
  .ph { display: none }
  .list { display: flex; overflow-x: auto; overflow-y: hidden; padding: 6px 6px 4px; gap: 6px; scrollbar-width: none } .list::-webkit-scrollbar { display: none }
  .tiles { display: flex; gap: 2px } .gi { top: 1px; left: 3px } .grp, .solo { flex: none } .mix { display: contents }
  .st { flex: none; width: 64px; padding: 4px 2px } .nm { font-size: 11px; -webkit-line-clamp: 1; white-space: nowrap; text-overflow: ellipsis; display: block }
  .st :deep(.av) { width: 44px !important; height: 44px !important; font-size: 20px !important }
  .drophint { flex-direction: row; display: flex; justify-content: center; align-items: center; gap: 8px; border-radius: 12px }
}
/* Меню группы — как контекстное меню iOS: карточка со скруглением, строки 52px, лёгкое затемнение вокруг */
.gpop-bg { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .06) }
.gpop { position: fixed; display: grid; padding: 4px 0; border-radius: 16px; background: var(--card); box-shadow: 0 12px 40px rgba(0, 0, 0, .22), 0 0 0 1px rgba(0, 0, 0, .04); overflow: hidden;
  transform-origin: top center; animation: gpop .16s ease-out }
.gpop.up { transform-origin: bottom center } @keyframes gpop { from { opacity: 0; transform: scale(.92) } }
.gph { display: flex; align-items: center; gap: 6px; padding: 8px 14px 6px; font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.gpr { display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 12px 0 14px; cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none }
.gpr + .gpr { box-shadow: inset 0 1px 0 var(--border) } .gpr:hover { background: var(--surface) } .gpr:active { cursor: grabbing }
.gtx { flex: 1; display: grid; min-width: 0; line-height: 1.25 } .gtx b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.gtx small { font-size: 12px; font-weight: 600; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .gtx small.onl { color: var(--blue) }
.gx { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 50%; background: none; color: var(--hint-2); cursor: pointer } .gx:hover { background: var(--red-l); color: var(--red-d) }
.gadd { width: 100%; border: 0; background: none; font: inherit; color: var(--blue); cursor: pointer; text-align: left } .gadd b { font-size: 15px } .gadd:disabled { opacity: .4; cursor: default }
.gadd.red { color: var(--red-d) } .gadd.red .gic { background: var(--red-l); color: var(--red-d) } .gic.big { width: 44px; height: 44px; background: var(--red-l); color: var(--red-d) }
.gcnt { margin-left: auto; min-width: 20px; padding: 1px 6px; border-radius: 99px; background: var(--green); color: #fff; text-align: center; letter-spacing: 0 }
.chk { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border); color: #fff } .chk.on { background: var(--green); border-color: var(--green) }
.gbt.pad { padding: 8px 10px 6px; margin: 0; box-shadow: inset 0 1px 0 var(--border) }
/* «Новая группа» — значок группы с плюсом */
.grpb { position: relative; color: var(--blue) } .grpb i { position: absolute; right: 1px; bottom: -1px; font-style: normal; font-size: 13px; font-weight: 900; line-height: 1; color: var(--green-d) } .grpb:hover { border-color: var(--blue); background: var(--blue-l) }
.gic { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--blue-l); color: var(--blue) }
.gback { display: grid; place-items: center; width: 24px; height: 24px; margin-left: -6px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .gback:hover { background: var(--surface) }
.gsearch { display: flex; align-items: center; gap: 8px; margin: 0 10px 4px; padding: 0 10px; border-radius: 10px; background: var(--surface); color: var(--hint-2) }
.gsearch input { flex: 1; min-width: 0; margin: 0; padding: 7px 0; border: 0; background: none; font-size: 14px } .gsearch input:focus { background: none } .gsearch input:focus-visible { outline: none }
.glist { display: grid; max-height: 260px; overflow-y: auto } .glist .gpr { width: 100%; border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer } .glist .gpr:hover { background: var(--surface) }
.gtx small.og { color: var(--hint-2); font-style: italic }
.gnone { margin: 8px 0; text-align: center; font-size: 13px; color: var(--hint) }
/* Подтверждение — как алерт iOS: аватарка, вопрос, пояснение, две кнопки */
.gcf { display: grid; justify-items: center; gap: 6px; padding: 14px 14px 10px; text-align: center }
.gcf b { font-size: 15px; line-height: 1.3 } .gcf small { font-size: 12px; font-weight: 600; color: var(--hint); line-height: 1.35 }
.gbt { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; margin-top: 6px }
.gbt .lnk { height: 38px; border: 0; border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; font-weight: 800; cursor: pointer }
.gok { height: 38px; border: 0; border-radius: 10px; background: var(--blue); color: #fff; font: inherit; font-weight: 800; cursor: pointer } .gok.red { background: var(--red) } .gok:disabled { opacity: .4; cursor: default }
</style>

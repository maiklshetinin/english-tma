<script setup>
// Ученики сеткой на 4 — как панель учеников на «Главной»: группа — серая подложка под кружками того же размера
// (значок в углу, при наведении подсвечивается вся), ученики без группы заполняют свободные клетки.
// Нажатие на ученика — pick(id). Нажатие на группу — небольшое меню под ней (как в iOS): «Всей группе» — group(g),
// её ученики — pick(id). С selected — режим выбора: у выбранных зелёная галочка, меню не закрывается после нажатия.
// Используется в «Кого назначить?» (LessonSheet) и в «Кому назначить» колоды (DeckSheet).
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { handle } from '../store/app'
import { isOnline } from '../utils/online'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({
  groups: { type: Array, default: () => [] },           // [{ key, label, members }]
  students: { type: Array, default: () => [] },         // ученики без группы
  selected: { type: Array, default: null },             // id выбранных (режим выбора) или null
  disabled: Boolean,
  allLabel: { type: String, default: 'Всей группе' },
})
const emit = defineEmits(['pick', 'group'])
const sel = (id) => !!props.selected?.includes(id)
const allSel = (g) => g.members.every(m => sel(m.id))
const sub = (s) => (isOnline(s) ? 'в сети' : [s.level, handle(s)].filter(Boolean).join(' · '))

const pop = ref(null), POP_W = 260
function openPop(g, e) {
  if (props.disabled) return
  const r = e.currentTarget.getBoundingClientRect(), h = 44 + (g.members.length + 1) * 52
  const left = Math.min(Math.max(8, r.left + r.width / 2 - POP_W / 2), innerWidth - POP_W - 8)
  const below = r.bottom + 6 + h < innerHeight - 8
  pop.value = { key: g.key, style: { left: left + 'px', width: POP_W + 'px', ...(below ? { top: r.bottom + 6 + 'px' } : { bottom: innerHeight - r.top + 6 + 'px' }) }, up: !below }
}
const popGroup = computed(() => pop.value && props.groups.find(g => g.key === pop.value.key))
const closePop = () => { pop.value = null }
const choose = (fn) => { fn(); if (!props.selected) closePop() }      // выбор — меню остаётся открытым, назначение — закрывается
const onKey = (e) => { if (e.key === 'Escape' && pop.value) { e.stopPropagation(); closePop() } }
onMounted(() => { addEventListener('keydown', onKey, true); addEventListener('resize', closePop) })
onUnmounted(() => { removeEventListener('keydown', onKey, true); removeEventListener('resize', closePop) })
</script>

<template>
  <div class="sg" :class="{ off: disabled, picking: !!selected }">
    <button v-for="g in groups" :key="g.key" class="grp" :class="{ on: selected && allSel(g) }" :style="{ '--n': Math.min(4, g.members.length) }" :disabled="disabled"
      :title="`Группа · ${g.label}: ${g.members.map(m => m.name).join(', ')}`" @click="openPop(g, $event)">
      <i class="gi" aria-hidden="true"><AppIcon name="users" :size="10" /></i>
      <span class="tiles"><span v-for="s in g.members" :key="s.id" class="st">
        <span class="ava"><Avatar :s="s" :size="54" :online="!selected && isOnline(s)" /><i v-if="sel(s.id)" class="ok"><AppIcon name="check" :size="11" /></i></span><span class="nm">{{ s.name }}</span></span></span>
    </button>
    <button v-for="s in students" :key="s.id" class="st solo" :class="{ on: sel(s.id) }" :disabled="disabled" :title="`${s.name} · ${sub(s)}`" @click="emit('pick', s.id)">
      <span class="ava"><Avatar :s="s" :size="54" :online="!selected && isOnline(s)" /><i v-if="sel(s.id)" class="ok"><AppIcon name="check" :size="11" /></i></span><span class="nm">{{ s.name }}</span>
    </button>
  </div>
  <!-- Меню группы (как в iOS): «Всей группе» и её ученики по одному -->
  <Teleport to="body">
    <div v-if="popGroup" class="gpop-bg" @click.self="closePop">
      <div class="gpop" :class="{ up: pop.up }" :style="pop.style" role="menu" :aria-label="`Группа · ${popGroup.label}`">
        <div class="gph"><AppIcon name="users" :size="14" /> Группа · {{ popGroup.label }}</div>
        <button class="gpr all" role="menuitem" @click="choose(() => emit('group', popGroup))">
          <span class="gic"><AppIcon name="users" :size="18" /></span><span class="gtx"><b>{{ allLabel }}</b><small>{{ popGroup.members.length }} {{ popGroup.members.length < 5 ? 'ученика' : 'учеников' }}</small></span>
          <i v-if="selected" class="chk" :class="{ on: allSel(popGroup) }"><AppIcon v-if="allSel(popGroup)" name="check" :size="13" /></i></button>
        <button v-for="s in popGroup.members" :key="s.id" class="gpr" role="menuitem" @click="choose(() => emit('pick', s.id))">
          <Avatar :s="s" :size="36" :online="isOnline(s)" /><span class="gtx"><b>{{ s.name }}</b><small :class="{ onl: isOnline(s) }">{{ sub(s) }}</small></span>
          <i v-if="selected" class="chk" :class="{ on: sel(s.id) }"><AppIcon v-if="sel(s.id)" name="check" :size="13" /></i></button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sg { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-flow: row dense; gap: 6px 0 }
.sg.off { opacity: .55 }
.st { display: grid; justify-items: center; align-content: start; gap: 3px; min-width: 0; padding: 4px 0; border: 0; border-radius: 14px; background: none; font: inherit; color: var(--text) }
button.st { cursor: pointer } button.st:hover:not(:disabled) { background: var(--blue-l) } button.st:active:not(:disabled) .ava { transform: scale(.94) } button:disabled { cursor: default }
.ava { position: relative; display: inline-grid; transition: transform .08s }
.nm { width: 100%; text-align: center; font-size: 11px; font-weight: 700; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
/* Выбран: зелёная галочка на кружке, имя зелёным */
.ok { position: absolute; right: 0; bottom: 0; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--green); color: #fff; box-shadow: 0 0 0 2px var(--card) }
.st.on .nm, .grp .st:has(.ok) .nm { color: var(--green-d) }
/* Группа — серая подложка (чуть уже блока, соседние не сливаются), подсвечивается целиком */
.grp { position: relative; grid-column: span var(--n); min-width: 0; padding: 0; border: 0; background: none; font: inherit; color: var(--text); cursor: pointer }
.grp::before { content: ''; position: absolute; inset: 0 2px; border-radius: 14px; background: var(--surface); transition: background .1s }
.grp:hover:not(:disabled)::before { background: var(--blue-l) } .grp.on::before { background: var(--green-l) } .grp:active:not(:disabled) .ava { transform: scale(.94) }
.grp .tiles { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)) }
.gi { position: absolute; top: 3px; left: 5px; z-index: 2; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--card); color: var(--hint); font-style: normal; box-shadow: 0 0 0 1.5px var(--surface) }
/* Меню группы — как контекстное меню iOS */
.gpop-bg { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .06) }
.gpop { position: fixed; display: grid; padding: 4px 0; border-radius: 16px; background: var(--card); box-shadow: 0 12px 40px rgba(0, 0, 0, .22), 0 0 0 1px rgba(0, 0, 0, .04); overflow: hidden; transform-origin: top center; animation: gpop .16s ease-out }
.gpop.up { transform-origin: bottom center } @keyframes gpop { from { opacity: 0; transform: scale(.92) } }
.gph { display: flex; align-items: center; gap: 6px; padding: 8px 14px 6px; font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.gpr { display: flex; align-items: center; gap: 12px; width: 100%; height: 52px; padding: 0 14px; border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer }
.gpr + .gpr { box-shadow: inset 0 1px 0 var(--border) } .gpr:hover { background: var(--surface) }
.gic { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--blue-l); color: var(--blue) }
.gpr.all b { color: var(--blue) }
.gtx { flex: 1; display: grid; min-width: 0; line-height: 1.25 } .gtx b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.gtx small { font-size: 12px; font-weight: 600; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .gtx small.onl { color: var(--blue) }
.chk { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border); color: #fff } .chk.on { background: var(--green); border-color: var(--green) }
</style>

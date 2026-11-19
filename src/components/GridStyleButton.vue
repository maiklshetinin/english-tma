<script setup>
// Кнопка с решёткой над таблицей недели: меню (как в iOS) — рамка, прошедшее время и вид урока (серый / голубой). См. utils/gridStyle.js.
// 19.11.2026: сюда же переехал выключатель «Автоподстановка» (был отдельной кнопкой «авто» в шапке): props auto / autoTo, событие auto.
// И выбор «Деньги»: две плашки или одна в две строки (как привидение — плитками с превью).
// Пока автоподстановка включена — на решётке синяя точка, чтобы не забыть.
import { ref, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'
import GhostIcon from './GhostIcon.vue'
import { gridFrame, setGridFrame, LESSON_STYLES, lessonStyle, setLessonStyle, pastShade, setPastShade, GHOST_ICONS, ghostIcon, setGhostIcon, MONEY_STYLES, moneyStyle, setMoneyStyle } from '../utils/gridStyle'
defineProps({ auto: { type: Boolean, default: null }, autoTo: { type: String, default: '' } })
const emit = defineEmits(['auto'])
const open = ref(null)
function flipAuto() { open.value = null; emit('auto') }          // меню закрываем: выключатель может спросить подтверждение
function toggle(e) {
  if (open.value) { open.value = null; return }
  const r = e.currentTarget.getBoundingClientRect(), W = 280
  open.value = { left: Math.min(Math.max(8, r.left + r.width / 2 - W / 2), innerWidth - W - 8) + 'px', top: r.bottom + 6 + 'px', width: W + 'px' }
}
const onKey = (e) => { if (e.key === 'Escape') open.value = null }
onMounted(() => { addEventListener('keydown', onKey); addEventListener('resize', () => { open.value = null }) })
onUnmounted(() => removeEventListener('keydown', onKey))
</script>

<template>
  <button class="gsb" :class="{ on: open }" :title="auto ? `Вид сетки · автоподстановка включена (${autoTo})` : 'Вид сетки'" aria-label="Вид сетки" :aria-expanded="!!open" @click="toggle"><AppIcon name="grid" :size="18" /><i v-if="auto" class="gs-dot" aria-hidden="true" /></button>
  <Teleport to="body">
    <div v-if="open" class="gs-bg" @click.self="open = null">
      <div class="gs-pop" :style="open" role="menu" aria-label="Вид сетки">
        <div class="gs-h">Таблица</div>
        <label class="gs-r" role="menuitemcheckbox" :aria-checked="gridFrame">
          <span class="gs-pv frm" :class="{ off: !gridFrame }"><i v-for="n in 6" :key="n" /></span>
          <span class="gs-tx"><b>Рамка</b><small>обводка вокруг таблицы</small></span>
          <input type="checkbox" class="sw" :checked="gridFrame" @change="setGridFrame($event.target.checked)" />
        </label>
        <label class="gs-r" role="menuitemcheckbox" :aria-checked="pastShade">
          <span class="gs-pv past"><i v-for="n in 6" :key="n" :class="{ p: n < 4, h: n === 4 }" /></span>
          <span class="gs-tx"><b>Прошедшее время</b><small>закрашивать серым</small></span>
          <input type="checkbox" class="sw" :checked="pastShade" @change="setPastShade($event.target.checked)" />
        </label>
        <template v-if="auto !== null">
          <div class="gs-h sep">Расписание</div>
          <label class="gs-r" role="menuitemcheckbox" :aria-checked="auto">
            <span class="gs-pv auto"><i v-for="n in 6" :key="n" :class="{ a: n % 3 === 1 }" /></span>
            <span class="gs-tx"><b>Автоподстановка</b><small>уроки этой недели — на 4 недели вперёд{{ autoTo ? ', ' + autoTo : '' }}</small></span>
            <input type="checkbox" class="sw" :checked="auto" @change.prevent="flipAuto" />
          </label>
        </template>
        <div class="gs-h sep">Урок</div>
        <button v-for="s in LESSON_STYLES" :key="s.id" class="gs-r" role="menuitemradio" :aria-checked="lessonStyle === s.id" @click="setLessonStyle(s.id)">
          <span class="ls-pv" :class="s.id"><i /><b /></span>
          <span class="gs-tx"><b>{{ s.title }}</b><small>{{ s.sub }}</small></span>
          <span v-if="lessonStyle === s.id" class="gs-ok"><AppIcon name="check" :size="16" /></span>
        </button>
        <div class="gs-h sep">Деньги</div>
        <div class="mn-row" role="radiogroup" aria-label="Деньги над таблицей">
          <button v-for="m in MONEY_STYLES" :key="m.id" class="gh-it mn-it" :class="{ on: moneyStyle === m.id }" role="radio" :aria-checked="moneyStyle === m.id" @click="setMoneyStyle(m.id)">
            <span class="mn-pv" :class="m.id" aria-hidden="true"><i /><i /></span><small>{{ m.title }}</small>
          </button>
        </div>
        <div class="gs-h sep">Привидение</div>
        <div class="gh-row" role="radiogroup" aria-label="Значок подсказок следующей недели">
          <button v-for="g in GHOST_ICONS" :key="g.id" class="gh-it" :class="{ on: ghostIcon === g.id }" role="radio" :aria-checked="ghostIcon === g.id" :title="g.title" @click="setGhostIcon(g.id)"><GhostIcon :variant="g.id" :size="30" /><small>{{ g.title }}</small></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gsb { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: var(--hint); cursor: pointer }
.gsb { position: relative } .gs-dot { position: absolute; top: 5px; right: 5px; width: 7px; height: 7px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 2px var(--card) }
.gsb:hover, .gsb.on { color: var(--blue); border-color: var(--blue); background: var(--blue-l) }
.gs-bg { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .06) }
.gs-pop { position: fixed; display: grid; padding: 4px 0; border-radius: 16px; background: var(--card); box-shadow: 0 12px 40px rgba(0, 0, 0, .22), 0 0 0 1px rgba(0, 0, 0, .04); overflow: hidden; transform-origin: top center; animation: gsp .16s ease-out }
@keyframes gsp { from { opacity: 0; transform: scale(.92) } }
.gs-h { padding: 8px 14px 6px; font-size: 12px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.gs-r { display: flex; align-items: center; gap: 12px; width: 100%; height: 52px; padding: 0 14px; border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer }
.gs-r + .gs-r { box-shadow: inset 0 1px 0 var(--border) } .gs-r:hover { background: var(--surface) }
.gs-tx { flex: 1; display: grid; line-height: 1.25 } .gs-tx b { font-size: 15px } .gs-tx small { font-size: 12px; font-weight: 600; color: var(--hint) }
.gs-ok { color: var(--blue); display: grid }
/* Превью */
.gs-pv { flex: none; display: grid; grid-template-columns: repeat(3, 10px); gap: 2px; padding: 3px; border-radius: 6px; background: var(--card); box-shadow: 0 0 0 1px var(--border) }
.gs-pv i { height: 8px; border-radius: 2px } .gs-pv i.les { background: var(--blue) !important; box-shadow: none !important; border-radius: 2px !important }
.gs-pv.cells i { background: var(--card); box-shadow: inset 0 0 0 1px var(--hint-2) }
.gs-pv.gray i { background: var(--border) }
.gs-pv.none i { background: transparent }
.gs-pv.lines { gap: 0 2px } .gs-pv.lines i { border-radius: 0; box-shadow: inset 0 -1px 0 var(--hint-2); height: 9px }
.gs-pv.frm { box-shadow: 0 0 0 2px var(--hint-2) } .gs-pv.frm.off { box-shadow: none; background: transparent } .gs-pv.frm i { background: var(--border) }
.gs-h.sep { margin-top: 2px; padding-top: 10px; box-shadow: inset 0 1px 0 var(--border) }
.gs-pv.bgd { width: 38px; height: 25px; padding: 0; background-color: #f4f4f4; background-image: radial-gradient(circle, #bdbdbd .9px, transparent 1.2px); background-size: 5px 5px }
/* Превью «автоподстановка»: уроки в первом столбце повторяются вниз */
.gs-pv.auto i { background: var(--card); box-shadow: inset 0 0 0 1px var(--hint-2) } .gs-pv.auto i.a { background: var(--blue); box-shadow: none }
/* Превью «прошедшее время» и вида урока */
.gs-pv.past i { background: var(--card); box-shadow: inset 0 0 0 1px var(--hint-2) } .gs-pv.past i.p { background: var(--border) } .gs-pv.past i.h { background: linear-gradient(var(--border) 50%, var(--card) 50%) }
.ls-pv { flex: none; position: relative; display: flex; align-items: center; width: 38px; height: 20px }
.ls-pv i { position: relative; z-index: 1; width: 16px; height: 16px; border-radius: 50%; background: var(--blue) }
.ls-pv b { position: absolute; left: 0; right: 0; top: 2px; bottom: 2px; border-radius: 5px; background: var(--surface); box-shadow: inset 0 0 0 1px #d0d7de }
.ls-pv.gray b { background: var(--group); box-shadow: 0 1px 3px rgba(0, 0, 0, .14); border-radius: 99px }
.ls-pv.blue b { background: var(--blue-l); box-shadow: 0 1px 3px rgba(28, 120, 200, .25); border-radius: 99px }
/* «Привидение» — четыре значка в одну строку; выбранный — синяя рамка */
.gh-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 4px 10px 10px }
.gh-it { display: grid; justify-items: center; gap: 3px; padding: 7px 2px 5px; border: 0; border-radius: 12px; background: var(--surface); font: inherit; color: var(--hint); cursor: pointer; --gi-bg: var(--surface) }
.gh-it small { font-size: 10px; font-weight: 700; white-space: nowrap } .gh-it:hover { background: var(--border) } .gh-it:hover { --gi-bg: var(--border) }
.gh-it.on { box-shadow: inset 0 0 0 2px var(--blue); background: var(--blue-l); color: var(--blue); --gi-bg: var(--blue-l) }
/* «Деньги» — две плитки: превью двух плашек рядом или одной в две строки */
.mn-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; padding: 4px 10px 6px }
.mn-it { padding: 9px 2px 6px }
.mn-pv { display: flex; gap: 3px; height: 22px } .mn-pv i { width: 30px; border-radius: 5px; background: var(--card); box-shadow: inset 0 0 0 1px var(--hint-2), inset 0 -4px 0 -2px #009300 }
.mn-pv.one { flex-direction: column; gap: 0; width: 46px; padding: 2px 5px; box-sizing: border-box; border-radius: 5px; background: var(--card); box-shadow: inset 0 0 0 1px var(--hint-2) }
.mn-pv.one i { flex: 1; width: auto; border-radius: 0; background: none; box-shadow: inset 0 -2px 0 -1px #009300 }
/* Переключатель как в Telegram */
.sw { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 38px; height: 22px; margin: 0; padding: 0; border: 0; border-radius: 99px; background: var(--border); cursor: pointer; transition: background .15s }
.sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .15s }
.sw:checked { background: var(--blue) } .sw:checked::after { transform: translateX(16px) }
</style>

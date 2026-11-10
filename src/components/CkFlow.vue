<script setup>
// Курс по горизонтали: Chapter за Chapter — уроки (точки) → чекпоинт, и что в него попадёт прямо сейчас.
//  • Точка урока: зелёная — пройден, синяя обводка — «сейчас», серая — впереди; красная цифра — сколько экранов с ошибкой.
//  • Под чекпоинтом — экраны, из которых он соберётся: «из ошибок» (где ошибся ученик) или, если ошибок нет, «авто» —
//    до 8 проверяемых экранов из уроков Chapter; экраны учителя — отдельной строкой.
//  • В реальном времени: ошибка в открытом уроке → экран сразу появляется под своим чекпоинтом и подсвечивается,
//    сверху — «no problem (Выбери ответ) → «Чекпоинт» · Chapter 1».
// Данные считает CourseViewer (ckParts — та же сборка, что при открытии чекпоинта), здесь только показ.
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  chapters: { type: Array, required: true },          // [{ id, title, lessons: [{ id, title, state, miss, live }], cks: [{ id, title, state, fromErrors, own, items: [{ id, ex, w, from }] }] }]
  dock: Boolean,
})
const hot = ref(new Set()), flash = ref(null); let t = null
const sig = () => new Map(props.chapters.flatMap(c => c.cks.flatMap(k => k.fromErrors ? k.items.map(i => [k.id + ':' + i.id, { c, k, i }]) : [])))
let seen = sig()
watch(() => props.chapters, () => {
  const cur = sig(), fresh = [...cur.keys()].filter(k => !seen.has(k)); seen = cur
  if (!fresh.length) return
  const { c, k, i } = cur.get(fresh[0])
  flash.value = `${i.w || i.ex} (${i.ex}) → «${k.title}»${c.title ? ' · ' + c.title : ''}${fresh.length > 1 ? ` · и ещё ${fresh.length - 1}` : ''}`
  hot.value = new Set(fresh)
  clearTimeout(t); t = setTimeout(() => { hot.value = new Set(); flash.value = null }, 4500)
}, { deep: true })
onUnmounted(() => clearTimeout(t))
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'экран' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'экрана' : 'экранов')
</script>

<template>
  <div class="ckf" :class="{ dock }">
    <div class="hd"><b v-if="dock">Чекпоинты: что в них попадёт</b><small>ошибка в уроке → экран уходит в чекпоинт своей Chapter</small></div>
    <div class="fl" :class="{ on: flash }" aria-live="polite"><i />{{ flash }}</div>
    <div class="track">
      <section v-for="c in chapters" :key="c.id" class="ch">
        <div class="ct">{{ c.title || 'Без Chapter' }}</div>
        <div class="line">
          <span v-for="l in c.lessons" :key="l.id" class="ls" :class="[l.state, { live: l.live }]" :title="l.title + (l.miss ? ` — ошибок: ${l.miss}` : '')"><i /><em v-if="l.miss">{{ l.miss }}</em><small>{{ l.title }}</small></span>
          <template v-for="k in c.cks" :key="k.id">
            <span class="arr" aria-hidden="true" />
            <span class="ck" :class="[k.state, { err: k.fromErrors }]" :title="k.title"><svg viewBox="0 0 24 24"><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></svg><b>{{ k.items.length + k.own }}</b></span>
          </template>
        </div>
        <div v-for="k in c.cks" :key="'l' + k.id" class="cl">
          <div class="clh"><b>{{ k.title }}</b><span class="tag" :class="{ err: k.fromErrors }">{{ k.fromErrors ? 'из ошибок' : k.items.length ? 'ошибок нет — авто' : 'пусто' }}</span><small>{{ k.items.length + k.own }} {{ word(k.items.length + k.own) }}</small></div>
          <p v-if="k.own" class="own">Экраны учителя: {{ k.own }}</p>
          <ul><li v-for="i in k.items" :key="i.id" :class="{ hot: hot.has(k.id + ':' + i.id), au: !k.fromErrors }"><b>{{ i.w || '—' }}</b><span>{{ i.ex }}<template v-if="i.from"> · {{ i.from }}</template></span></li></ul>
          <p v-if="!k.items.length && !k.own" class="em">В уроках нет проверяемых экранов — чекпоинт пройдётся кнопкой «Готово — дальше».</p>
        </div>
        <p v-if="!c.cks.length" class="em">В этой Chapter нет чекпоинта.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ckf { display: grid; gap: 8px; min-width: 0; padding: 12px 14px; border-radius: 16px; background: #f7f4ff }
.hd { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px } .hd b { font-size: 15px; font-weight: 900 } .hd small { font-size: 12px; font-weight: 700; color: var(--hint) }
.fl { height: 0; overflow: hidden; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; border-radius: 10px; background: #fff; transition: height .2s; padding: 0 10px }
.fl.on { height: 30px; box-shadow: 0 0 0 1.5px #9747ff } .fl i { width: 9px; height: 9px; border-radius: 50%; background: #ff4b4b; flex: none }
.track { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x proximity }
.ch { flex: none; width: min(320px, 82vw); scroll-snap-align: start; display: grid; align-content: start; gap: 8px; padding: 10px 12px; border-radius: 14px; background: #fff; box-shadow: 0 1px 0 rgba(0, 0, 0, .04) }
.ct { font-size: 13px; font-weight: 900; color: #6b3fd1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.line { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding: 4px 0 2px }
.ls { position: relative; display: grid; justify-items: center; width: 34px }
.ls i { width: 18px; height: 18px; border-radius: 50%; background: #e3e6ea; box-shadow: 0 0 0 2px #fff }
.ls.done i { background: #58cc02 } .ls.current i { background: #fff; box-shadow: 0 0 0 3px #1cb0f6 } .ls.live i { animation: pl 1.2s ease-in-out infinite }
@keyframes pl { 50% { box-shadow: 0 0 0 6px rgba(28, 176, 246, .35) } }
.ls em { position: absolute; top: -6px; right: 0; min-width: 15px; height: 15px; padding: 0 3px; box-sizing: border-box; border-radius: 8px; background: #ff4b4b; color: #fff; font-size: 10px; font-style: normal; font-weight: 900; display: grid; place-items: center }
.ls small { max-width: 34px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-weight: 700; color: var(--hint) }
.arr { width: 14px; height: 2px; background: #c9b6f5; position: relative; margin-bottom: 12px } .arr::after { content: ''; position: absolute; right: -1px; top: -3px; border: 4px solid transparent; border-left-color: #c9b6f5; border-right: 0 }
.ck { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 10px; background: #efe8ff; color: #6b3fd1; margin-bottom: 12px }
.ck svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linejoin: round } .ck b { font-size: 13px; font-weight: 900 }
.ck.err { background: #9747ff; color: #fff } .ck.done { opacity: .6 }
.cl { display: grid; gap: 5px; border-top: 1px solid #f0edf7; padding-top: 6px }
.clh { display: flex; align-items: center; gap: 6px; flex-wrap: wrap } .clh b { font-size: 13px } .clh small { margin-left: auto; font-size: 11.5px; font-weight: 700; color: var(--hint) }
.tag { font-size: 10.5px; font-weight: 900; padding: 1px 7px; border-radius: 7px; background: #eceef1; color: #666 } .tag.err { background: #ffe1e1; color: #d32f2f }
.own { margin: 0; font-size: 12px; font-weight: 700; color: #6b3fd1 }
ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; max-height: 180px; overflow: auto }
li { display: grid; padding: 4px 8px; border-radius: 8px; background: #fff5f5; box-shadow: inset 3px 0 0 #ff4b4b; transition: background .3s } li.au { background: #f6f7f9; box-shadow: inset 3px 0 0 #b5bac1 }
li b { font-size: 13px } li span { font-size: 11px; font-weight: 600; color: var(--hint) }
li.hot { background: #fff0c2; animation: pop .5s ease-out }
@keyframes pop { from { transform: scale(.94) } }
.em { margin: 0; font-size: 12px; color: var(--hint); font-weight: 600 }
.dock .ch { width: min(300px, 80vw) }
</style>

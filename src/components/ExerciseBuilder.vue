<script setup>
// Конструктор упражнений (17.11.2026): своё упражнение собирается из наших же блоков, как в Figma.
//  • Основа — один из типов меню «Exercise» (что делает ученик: собирает фразу, выбирает, пишет, говорит…) — ровно одна, она проверяет ответ.
//  • Добавки — «Задание» (свой текст вверху экрана), «Фото», «Видео», «Аудио» — к любой основе.
//  • Блоки перетаскиваются слева на экран (или нажатием); в центре — настоящий экран, как его увидит ученик (LessonPlayer).
//  • Справа — плитка, как в меню и на ветке: миниатюра, название, описание и навыки собираются сами.
// Сохранить → упражнение курса (doc.templates) в меню «Exercise» → «Мои»; тянется на ветку, как обычные. Содержимое (слова, фразы,
// файлы) — потом карандашом на самом экране, как всегда.
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { TEMPLATES, tplOf, skillsOf, SKILL_T, sampleMedia, stepId } from '../utils/lesson'
import LessonPlayer from './LessonPlayer.vue'
import ExerciseMini from './ExerciseMini.vue'

const props = defineProps({ tpl: { type: Object, default: null }, resolve: { type: Function, required: true } })
const emit = defineEmits(['save', 'del', 'close'])

const BASES = TEMPLATES
const EXTRAS = [
  { k: 'head', t: 'Задание', d: 'свой текст вверху', ic: 'M5 6h14M5 12h9M5 18h12' },
  { k: 'image', t: 'Фото', d: 'картинка к заданию', ic: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01' },
  { k: 'video', t: 'Видео', d: 'ролик к заданию', ic: 'M4 6h12v12H4zM16 10l4-2v8l-4-2' },
  { k: 'audio', t: 'Аудио', d: 'звук к заданию', ic: 'M5 9.5h3l4-3.5v12l-4-3.5H5zM15.5 9a4 4 0 0 1 0 6' },
]
const clone = (o) => JSON.parse(JSON.stringify(o))
const step = ref(props.tpl ? { ...clone(props.tpl.step), id: stepId() } : TEMPLATES.find(t => t.id === 'order').make())
const name = ref(props.tpl?.t ?? 'Моё упражнение'), desc = ref(props.tpl?.d ?? '')
const base = computed(() => tplOf(step.value))
const baseT = computed(() => TEMPLATES.find(t => t.id === base.value))
const has = (k) => !!step.value[k]
const key = ref(0)                  // перерисовать экран после правки
const bump = () => { key.value++ }

// основа меняется — добавки (задание, фото, видео, аудио, если их добавили) остаются
const added = reactive(new Set(props.tpl ? EXTRAS.map(x => x.k).filter(k => props.tpl.step[k]) : []))
function setBase(id) {
  const s = TEMPLATES.find(t => t.id === id).make()
  for (const k of added) if (step.value[k]) s[k] = step.value[k]
  if (s.video && s.image && added.has('video')) delete s.image
  step.value = s; bump()
}
function addExtra(k) {
  const m = sampleMedia()
  if (k === 'head') step.value.head = step.value.head || baseT.value?.t || 'Задание'
  else { step.value[k] = step.value[k] || m[k]; if (k === 'video') { delete step.value.image; added.delete('image') } if (k === 'image') { delete step.value.video; added.delete('video') } }
  added.add(k); bump()
}
function removeExtra(k) { delete step.value[k]; added.delete(k); bump() }

// перетаскивание блоков на экран (и нажатие — то же самое)
const over = ref(false), dragK = ref('')
function dragStart(e, kind, id) { dragK.value = kind + ':' + id; e.dataTransfer.setData('text/x-block', kind + ':' + id); e.dataTransfer.effectAllowed = 'copy' }
function drop(e) {
  over.value = false
  const v = e.dataTransfer.getData('text/x-block') || dragK.value; dragK.value = ''
  if (!v) return
  const [kind, id] = v.split(':'); kind === 'base' ? setBase(id) : addExtra(id)
}
let depth = 0
const enter = () => { depth++; over.value = true }
const leave = () => { if (--depth <= 0) { depth = 0; over.value = false } }

const tags = computed(() => skillsOf({ ...step.value, tn: name.value || 'x' }))
function save() {
  const s = { ...clone(step.value), tn: name.value.trim() || 'Моё упражнение', td: desc.value.trim() }
  if (!s.head) delete s.head
  emit('save', { id: props.tpl?.id, t: s.tn, d: s.td, step: s })
}
const onKey = (e) => { if (e.key === 'Escape') emit('close') }
onMounted(() => addEventListener('keydown', onKey)); onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<template>
  <div class="xb" @pointerdown.self="emit('close')">
    <div class="win" role="dialog" aria-label="Конструктор упражнений">
      <header class="hd">
        <b>Конструктор упражнений</b><small>перетащите блоки слева на экран</small><span class="sp" />
        <button v-if="tpl?.id" type="button" class="bt del" @click="emit('del', tpl.id)">Удалить</button>
        <button type="button" class="bt" @click="emit('close')">Отмена</button>
        <button type="button" class="bt pri" @click="save">{{ tpl?.id ? 'Сохранить' : 'Сохранить в «Мои»' }}</button>
      </header>
      <div class="cols">
        <!-- блоки -->
        <aside class="pal">
          <h4>Основа <small>что делает ученик — одна</small></h4>
          <button v-for="t in BASES" :key="t.id" type="button" class="pb" :class="{ on: base === t.id }" draggable="true" :title="t.d" @dragstart="dragStart($event, 'base', t.id)" @click="setBase(t.id)">
            <ExerciseMini :id="t.id" size="rail" class="pm" /><span><b>{{ t.t }}</b><small>{{ t.d }}</small></span>
          </button>
          <h4>Добавить <small>к любой основе</small></h4>
          <button v-for="x in EXTRAS" :key="x.k" type="button" class="pb ex" :class="{ on: has(x.k) }" draggable="true" @dragstart="dragStart($event, 'extra', x.k)" @click="addExtra(x.k)">
            <svg viewBox="0 0 24 24"><path :d="x.ic" /></svg><span><b>{{ x.t }}</b><small>{{ x.d }}</small></span>
          </button>
        </aside>

        <!-- экран -->
        <main class="mid" :class="{ over }" @dragenter.prevent="enter" @dragover.prevent @dragleave="leave" @drop.prevent="drop">
          <div class="phone"><LessonPlayer :key="key" embedded single :steps="[step]" :start="0" :resolve="resolve" /></div>
          <div v-if="over" class="drop">Отпустите — добавится на экран</div>
          <div class="comp">
            <span class="cc base">Основа: <b>{{ baseT?.t }}</b></span>
            <span v-for="x in EXTRAS.filter(e => has(e.k))" :key="x.k" class="cc">{{ x.t }}<button type="button" title="Убрать" @click="removeExtra(x.k)">✕</button></span>
          </div>
        </main>

        <!-- плитка и свойства -->
        <aside class="side">
          <h4>Плитка в меню и на ветке</h4>
          <div class="tile">
            <span class="tm"><ExerciseMini :id="base" size="tray" /><span class="bd"><i v-if="has('image')">фото</i><i v-if="has('video')">видео</i><i v-if="has('audio')">звук</i></span></span>
            <b>{{ name || 'Моё упражнение' }}</b><small>{{ desc || baseT?.d }}</small>
            <span class="skl"><i v-for="k in tags" :key="k" class="chip" :class="k">{{ SKILL_T[k] }}</i><em v-if="!tags.length">без навыков</em></span>
          </div>
          <label class="fld">Название<input v-model="name" maxlength="60" placeholder="Фраза по фото" /></label>
          <label class="fld">Описание<input v-model="desc" maxlength="120" :placeholder="baseT?.d" /></label>
          <label v-if="has('head')" class="fld">Задание вверху экрана<input v-model="step.head" maxlength="160" @change="bump" /></label>
          <p class="hn">Навыки собираются сами: у основы свои, аудио и видео добавляют «Слух». Слова, фразы и файлы меняются потом карандашом прямо на экране — как у обычных упражнений.</p>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.xb { position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center; padding: 24px; background: rgba(20, 22, 26, .45) }
.win { display: flex; flex-direction: column; width: min(1180px, 100%); height: min(820px, 100%); border-radius: 18px; background: var(--card); box-shadow: 0 20px 60px rgba(0, 0, 0, .3); overflow: hidden }
.hd { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border) } .hd b { font-size: 16px } .hd small { color: var(--hint); font-size: 12px } .sp { flex: 1 }
.bt { padding: 8px 14px; border: 0; border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .bt.pri { background: #1cb0f6; color: #fff } .bt.del { background: none; color: #d93025 }
.cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 250px minmax(0, 1fr) 270px }
.pal, .side { overflow: auto; padding: 12px; background: var(--surface) } .side { border-left: 1px solid var(--border) } .pal { border-right: 1px solid var(--border) }
h4 { margin: 10px 0 6px; font-size: 12px; font-weight: 800; color: var(--text) } h4:first-child { margin-top: 0 } h4 small { font-weight: 600; color: var(--hint) }
.pb { display: flex; align-items: center; gap: 8px; width: 100%; margin-bottom: 5px; padding: 6px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); font: inherit; text-align: left; cursor: grab }
.pb:hover { border-color: #9ec0ef } .pb.on { border-color: #1cb0f6; box-shadow: inset 0 0 0 1px #1cb0f6 } .pb:active { cursor: grabbing }
.pb > span:last-child { display: grid; min-width: 0 } .pb b { font-size: 12.5px } .pb small { overflow: hidden; color: var(--hint); font-size: 11px; text-overflow: ellipsis; white-space: nowrap }
.pm { flex: none; zoom: .55 }
.pb.ex svg { flex: none; width: 34px; height: 34px; padding: 7px; box-sizing: border-box; border-radius: 8px; background: var(--surface); fill: none; stroke: #1a73e8; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.mid { position: relative; overflow: auto; display: grid; justify-items: center; align-content: start; gap: 12px; padding: 18px; background: repeating-linear-gradient(0deg, transparent 0 19px, color-mix(in srgb, var(--border) 60%, transparent) 19px 20px), repeating-linear-gradient(90deg, transparent 0 19px, color-mix(in srgb, var(--border) 60%, transparent) 19px 20px) }
.mid.over .phone { outline: 3px dashed #1cb0f6; outline-offset: 6px }
.phone { width: 420px; max-width: 100%; border-radius: 22px; background: var(--card); box-shadow: 0 2px 14px rgba(0, 0, 0, .1); overflow: hidden }
.drop { position: absolute; top: 10px; left: 50%; translate: -50% 0; padding: 6px 12px; border-radius: 10px; background: #1cb0f6; color: #fff; font-size: 12.5px; font-weight: 700; pointer-events: none }
.comp { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px } .cc { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border-radius: 9px; background: var(--card); box-shadow: 0 0 0 1px var(--border); font-size: 12px; font-weight: 600 }
.cc.base { padding-right: 10px; background: color-mix(in srgb, #1cb0f6 12%, var(--card)) } .cc button { width: 20px; height: 20px; border: 0; border-radius: 6px; background: none; color: var(--hint); cursor: pointer } .cc button:hover { background: var(--surface); color: #d93025 }
.tile { display: grid; justify-items: center; gap: 4px; padding: 12px; border-radius: 14px; background: var(--card); text-align: center } .tile > b { margin-top: 6px; font-size: 13px } .tile > small { color: var(--hint); font-size: 11.5px }
.tm { position: relative } .bd { position: absolute; left: 0; right: 0; bottom: -8px; display: flex; justify-content: center; gap: 3px } .bd i { padding: 0 5px; border-radius: 6px; background: #202124; color: #fff; font-size: 9.5px; font-style: normal; font-weight: 700 }
.skl { display: flex; gap: 3px; margin-top: 4px } .skl em { color: var(--hint); font-size: 11px; font-style: normal }
.chip { padding: 1px 7px; border-radius: 8px; color: #fff; font-size: 10.5px; font-style: normal; font-weight: 900 } .chip.L { background: #1cb0f6 } .chip.R { background: #a560e8 } .chip.W { background: #ff9600 } .chip.S { background: #58cc02 }
.fld { display: grid; gap: 4px; margin-top: 10px; font-size: 12px; font-weight: 700; color: var(--hint) } .fld input { font-size: 13px }
.hn { margin: 12px 0 0; color: var(--hint); font-size: 11.5px; line-height: 1.45 }
</style>

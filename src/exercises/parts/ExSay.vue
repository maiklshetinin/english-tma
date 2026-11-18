<script setup>
// Динамик перед текстом (пример у «Нового слова», строки подсказки): у ученика — есть озвучка, есть и кнопка.
// В правке: озвучка есть — синий (нажать — заменить, ✕ — убрать); нет — серый за краем текста, чтобы текст стоял там же, где у ученика.
//  obj — где лежит звук (сам экран или строка/вариант), field — поле, opt — номер строки (для загрузки файла в неё)
import { computed } from 'vue'
import { usePlay, useEdit } from '../ctx'
const props = defineProps({ step: { type: Object, required: true }, obj: { type: Object, default: null }, field: { type: String, default: 'audio' }, opt: { type: Number, default: null } })
const p = usePlay(), ed = useEdit()
const o = computed(() => props.obj ?? props.step)
const a = computed(() => o.value[props.field] || '')
const pc = computed(() => ed.pct(props.step, props.field, props.opt))
</script>

<template>
  <button v-if="!p.edit && a" type="button" class="exs" title="Послушать" @click="p.say(a)"><svg viewBox="0 0 24 24"><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg></button>
  <span v-else-if="p.edit" class="exs ed" :class="{ on: a }" @dragover.prevent.stop @drop.prevent.stop="ed.drop($event, step, ['audio'], opt, field)">
    <button type="button" class="sb" :title="a ? 'Озвучка есть — нажмите, чтобы заменить' : 'Добавить озвучку (или перетащите файл сюда)'" @click.stop="ed.pick(step, ['audio'], opt, field)"><svg viewBox="0 0 24 24"><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg></button>
    <button v-if="a" type="button" class="sx" title="Убрать озвучку" @click.stop="ed.clear(o, field)">✕</button>
    <em v-if="pc != null">{{ pc }}%</em>
  </span>
</template>

<style scoped>
.exs { position: relative; flex: none; display: grid; place-items: center; width: 22px; height: 22px; margin-top: -1px; border: 0; padding: 0; background: none; color: #1a73e8; cursor: pointer }
.exs svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.exs.ed:not(.on) { position: absolute; left: -28px; top: 50%; translate: 0 -50%; margin: 0 }          /* без озвучки — за краем: текст там же, где у ученика */
.sb { display: grid; place-items: center; width: 100%; height: 100%; padding: 0; border: 0; background: none; color: #c4c4c4; cursor: pointer }
.exs.on .sb, .sb:hover { color: #1a73e8 }
.sx { position: absolute; right: -7px; top: -7px; width: 14px; height: 14px; padding: 0; border: 0; border-radius: 50%; background: var(--surface); color: var(--hint); font-size: 8px; line-height: 1; cursor: pointer; opacity: 0 }
.exs:hover .sx { opacity: 1 }
@media (hover: none) { .sx { opacity: 1 } }
.exs em { position: absolute; left: 100%; top: 50%; translate: 4px -50%; font-size: 10px; font-weight: 800; font-style: normal; color: var(--blue-d); white-space: nowrap }
@media (min-width: 900px) { .lp:not(.embedded):not(.single) .exs { width: 26px; height: 26px } .lp:not(.embedded):not(.single) .exs svg { width: 22px; height: 22px } }
</style>

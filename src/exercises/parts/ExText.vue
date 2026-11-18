<script setup>
// Текст экрана: у ученика — просто текст в своём теге (b, span, p…), в правке — поле в том же теге.
// Поэтому стили типа (.word b, .ex p …) действуют и на поле: тот же шрифт, то же место — окно не меняет размер.
//  v-model — строка в данных экрана; ph — подсказка в пустом поле; multi — можно с новой строки (иначе Enter не переносит);
//  empty — что показать ученику, если текста нет.
import { usePlay, useEdit } from '../ctx'
defineProps({ modelValue: { type: String, default: '' }, tag: { type: String, default: 'span' }, ph: { type: String, default: '' }, multi: Boolean, empty: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
const p = usePlay(), ed = useEdit()
function input(e) { emit('update:modelValue', e.target.value); ed.changed() }
</script>

<template>
  <component :is="tag" v-if="!p.edit"><slot>{{ modelValue || empty }}</slot></component>
  <component :is="tag" v-else class="ext"><slot name="before" /><textarea class="exf" rows="1" :value="modelValue" :placeholder="ph" spellcheck="false" @input="input" @keydown.enter="!multi && $event.preventDefault()" @pointerdown.stop /></component>
</template>

<style scoped>
.ext { display: flex; align-items: flex-start; gap: inherit }
.ext > .exf { flex: 1; min-width: 4ch }
</style>

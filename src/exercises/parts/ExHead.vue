<script setup>
// Задание вверху экрана («Выберите правильный вариант»). Своё — step.head, нет — по типу (def).
// В правке — то же место и тот же шрифт, текст правится прямо тут.
import { usePlay, useEdit } from '../ctx'
const props = defineProps({ step: { type: Object, required: true }, def: { type: String, default: '' } })
const p = usePlay(), ed = useEdit()
function input(e) { const v = e.target.value; if (v.trim()) props.step.head = v; else delete props.step.head; ed.changed() }
</script>

<template>
  <h3 v-if="!p.edit" class="hd">{{ step.head || def }}</h3>
  <h3 v-else class="hd"><textarea class="exf" rows="1" :value="step.head ?? ''" :placeholder="def" @input="input" @keydown.enter.prevent /></h3>
</template>

<style scoped>
.hd { margin: 8px 0 4px; text-align: center; font-size: 15px; font-weight: 800 }
.hd .exf::placeholder { color: var(--text); opacity: 1 }          /* задание по умолчанию — как у ученика, не серым */
.lp.book .hd { display: none }          /* у книжных задание — в шапке учебника */
@media (min-width: 900px) { .lp:not(.embedded):not(.single) .hd { font-size: 19px; margin-bottom: 6px } }
</style>

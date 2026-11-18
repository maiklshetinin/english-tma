<script setup>
// Кнопка в подвале правки с окошком над подвалом: то, чего у ученика на экране нет (перевод, пояснение после ответа).
// Окно не растёт — поле всплывает поверх. Заполнено — на кнопке «✓».
//  label — надпись кнопки, hint — подпись над полем, ph — пример в поле, multi — несколько строк (textarea)
import { ref } from 'vue'
import ExTool from './ExTool.vue'
import { useEdit } from '../ctx'
defineProps({ modelValue: { type: String, default: '' }, label: { type: String, required: true }, hint: { type: String, default: '' }, ph: { type: String, default: '' }, multi: Boolean })
const emit = defineEmits(['update:modelValue'])
const ed = useEdit(), open = ref(false)
function input(e) { emit('update:modelValue', e.target.value); ed.changed() }
</script>

<template>
  <span class="epw">
    <ExTool :on="open" @click="open = !open">{{ label }}{{ modelValue?.trim() ? ' ✓' : '' }}</ExTool>
    <span v-if="open" class="ep" @pointerdown.stop>
      <small>{{ hint }}</small>
      <textarea v-if="multi" class="exf ef" rows="3" :value="modelValue" :placeholder="ph" @input="input" />
      <input v-else class="exf ef" :value="modelValue" :placeholder="ph" @input="input" @keydown.enter="open = false" />
    </span>
  </span>
</template>

<style scoped>
.epw { position: relative; display: inline-flex }
.ep { position: absolute; left: 0; bottom: calc(100% + 12px); z-index: 6; display: grid; gap: 5px; width: 280px; padding: 9px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); box-shadow: 0 6px 20px rgba(0, 0, 0, .12); font-family: var(--font) }
.ep small { font-size: 11px; font-weight: 700; color: var(--hint) }
.ef { padding: 6px 8px; font-size: 14px; font-weight: 600; line-height: 1.4; text-align: left }
textarea.ef { font-size: 13px }
</style>

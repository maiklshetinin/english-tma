<script setup>
// Кнопка в подвале правки («＋ Строка», «Из карточек», «↺»): голубая, маленькая — в одну строку с «Сохранить».
//  deck — «из карточек» (заливка), un — белая (отменить), on — включено
defineProps({ deck: Boolean, un: Boolean, on: Boolean })
</script>

<template>
  <button type="button" class="ext" :class="{ deck, un, on }"><slot /></button>
</template>

<style scoped>
.ext { flex: none; padding: 4px 7px; border: 1px solid transparent; border-radius: 9px; background: rgba(13, 153, 255, .07); font: inherit; font-family: var(--font); font-size: 10.5px; font-weight: 800; color: var(--blue-d); white-space: nowrap; cursor: pointer }
.ext:hover, .ext.on { background: var(--blue-l) }
.ext.deck { border-color: var(--blue-l); background: var(--blue-l) }
.ext.un { border-color: var(--border); background: var(--card); color: var(--text) }
</style>

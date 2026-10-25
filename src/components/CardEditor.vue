<script setup>
// Шторка правки карточки: поля редактируются «вживую», карточка — реактивный объект из колоды.
import AppIcon from './AppIcon.vue'
defineProps({ card: { type: Object, required: true }, deletable: Boolean })
defineEmits(['close', 'delete'])
</script>
<template>
  <div class="sheet-bg" @click.self="$emit('close')">
    <div class="sheet-box" role="dialog" aria-modal="true">
      <h2 style="margin:0">Карточка</h2>
      <label class="lab">Слово</label><input v-model="card.front" />
      <label class="lab">Перевод</label><input v-model="card.back" />
      <label class="lab">Пример (необязательно)</label><input v-model="card.example" />
      <div class="row2">
        <button v-if="deletable" class="btn ghost" style="color:var(--red)" @click="$emit('delete')"><AppIcon name="trash" :size="16" /> Удалить</button>
        <button class="btn" style="margin-left:auto" @click="$emit('close')">Готово</button>
      </div>
    </div>
  </div>
</template>

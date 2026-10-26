<script setup>
// Шторка правки карточки: поля редактируются «вживую», карточка — реактивный объект из колоды.
// Ссылки на фото и озвучку записываются в карточку только когда они подходят (https + Google), иначе сервер отклонил бы всю колоду.
import { ref, watch } from 'vue'
import { isMediaUrl, imageSrc, audioSrc } from '../utils/media'
import AppIcon from './AppIcon.vue'
const props = defineProps({ card: { type: Object, required: true }, deletable: Boolean })
defineEmits(['close', 'delete'])

const link = (k) => {
  const v = ref(props.card[k] || '')
  watch(v, (x) => { const t = x.trim(); if (!t) delete props.card[k]; else if (isMediaUrl(t)) props.card[k] = t })
  return v
}
const image = link('image'), audio = link('audio')
const wrong = (v) => v.trim() && !isMediaUrl(v)
const imgBad = ref(false)
watch(image, () => { imgBad.value = false })
</script>
<template>
  <div class="sheet-bg" @click.self="$emit('close')">
    <div class="sheet-box" role="dialog" aria-modal="true">
      <h2 style="margin:0">Карточка</h2>
      <label class="lab">Слово</label><input v-model="card.front" />
      <label class="lab">Перевод</label><input v-model="card.back" />
      <label class="lab">Пример (необязательно)</label><input v-model="card.example" />
      <label class="lab">Перевод примера (необязательно)</label><input v-model="card.exampleTr" />
      <label class="lab">Фото — ссылка Google Диск / Cloud Storage (450×300)</label><input v-model="image" placeholder="https://drive.google.com/file/d/…" />
      <p v-if="wrong(image)" class="hint bad">Нужна https-ссылка на Google Диск или Cloud Storage — пока она не сохраняется.</p>
      <img v-else-if="card.image && !imgBad" class="prev" :src="imageSrc(card.image)" alt="" @error="imgBad = true" />
      <p v-else-if="card.image && imgBad" class="hint bad">Фото не открылось. Проверьте доступ: «Все, у кого есть ссылка».</p>
      <label class="lab">Озвучка слова — ссылка (mp3 и т. п.)</label><input v-model="audio" placeholder="https://drive.google.com/file/d/…" />
      <p v-if="wrong(audio)" class="hint bad">Нужна https-ссылка на Google Диск или Cloud Storage — пока она не сохраняется.</p>
      <audio v-else-if="card.audio" class="prev" :src="audioSrc(card.audio)" controls preload="none" />
      <div class="row2">
        <button v-if="deletable" class="btn ghost" style="color:var(--red)" @click="$emit('delete')"><AppIcon name="trash" :size="16" /> Удалить</button>
        <button class="btn" style="margin-left:auto" @click="$emit('close')">Готово</button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.prev { display: block; width: 100%; max-width: 450px; border-radius: 12px; margin: 6px 0 }
img.prev { aspect-ratio: 3 / 2; object-fit: contain; background: var(--surface) }
.bad { color: var(--red); margin: 4px 0 }
</style>

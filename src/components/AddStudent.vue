<script setup>
// «Добавить ученика»: имя + уровень → запись в Firestore → сразу ссылка-приглашение (скопировать / отправить в Telegram).
// Ник вводить не нужно: ученик привяжется по ссылке, а не по нику.
import { ref } from 'vue'
import { addStudent, copyText, shareInvite } from '../composables/useStudents'
import { showToast } from '../composables/useToast'
const emit = defineEmits(['close'])
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const name = ref(''), level = ref('A1'), pack = ref(8)
const busy = ref(false), error = ref(''), url = ref(''), added = ref('')

async function submit() {
  if (!name.value.trim() || busy.value) return
  busy.value = true; error.value = ''
  try { url.value = await addStudent({ name: name.value, level: level.value, packageSize: pack.value }); added.value = name.value.trim() }
  catch (e) { error.value = e.message }
  busy.value = false
}
const copy = async () => showToast((await copyText(url.value)) ? 'Ссылка скопирована' : 'Не удалось скопировать — выделите её вручную')
</script>
<template>
  <div class="card add">
    <template v-if="!added">
      <h3 style="margin:0 0 10px">Новый ученик</h3>
      <label class="lab" for="sn">Имя</label>
      <input id="sn" v-model="name" placeholder="Например, Мария" maxlength="40" @keydown.enter="submit" />
      <div class="row2" style="margin-top:8px">
        <div style="flex:1"><label class="lab" for="sl">Уровень</label><select id="sl" v-model="level" style="margin:0"><option v-for="l in LEVELS" :key="l">{{ l }}</option></select></div>
        <div style="flex:1"><label class="lab" for="sp">Уроков в пакете</label><input id="sp" v-model.number="pack" type="number" min="1" max="100" style="margin:0" /></div>
      </div>
      <p v-if="error" class="hint" style="color:var(--red)">{{ error }}</p>
      <div class="row2" style="margin-top:12px">
        <button class="btn" :disabled="!name.trim() || busy" @click="submit">{{ busy ? 'Добавляем…' : 'Добавить' }}</button>
        <button class="btn ghost" @click="emit('close')">Отмена</button>
      </div>
    </template>
    <template v-else>
      <h3 style="margin:0 0 6px">{{ added }} добавлен(а)</h3>
      <template v-if="url">
        <p class="hint" style="margin:0 0 10px">Отправьте ссылку ученику в Telegram. Она одноразовая: по ней он привяжет свой аккаунт к этой записи.</p>
        <input :value="url" readonly aria-label="Ссылка-приглашение" @focus="$event.target.select()" />
        <div class="row2" style="margin-top:10px">
          <button class="btn" @click="copy">Копировать</button>
          <button class="btn ghost" @click="shareInvite(url)">Отправить в Telegram</button>
        </div>
      </template>
      <button class="btn ghost" style="margin-top:12px" @click="emit('close')">Готово</button>
    </template>
  </div>
</template>

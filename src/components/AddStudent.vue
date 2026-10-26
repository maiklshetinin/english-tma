<script setup>
// «Добавить ученика»: имя, уровень, пакет, цена урока и (по желанию) ник Telegram → запись в Firestore → ссылка-приглашение.
// Ник нужен только ради фото и подписи: ученик привязывается к записи по ссылке, а не по нику.
import { ref } from 'vue'
import { showToast } from '../composables/useToast'
import { useStudentsStore } from '../stores/students'
import { copyText, shareInvite } from '../composables/useShare'
const studentStore = useStudentsStore()
const emit = defineEmits(['close'])
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const name = ref(''), level = ref('A1'), pack = ref(8), nick = ref(''), price = ref(null)
const NICK = /^[A-Za-z][A-Za-z0-9_]{4,31}$/
const cleanNick = () => nick.value.trim().replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0]
const busy = ref(false), error = ref(''), url = ref(''), added = ref('')

async function submit() {
  if (!name.value.trim() || busy.value) return
  const username = cleanNick()
  if (username && !NICK.test(username)) { error.value = 'Ник в Telegram: 5–32 символа, латиница, цифры и _, начинается с буквы'; return }
  busy.value = true; error.value = ''
  try { url.value = await studentStore.add({ name: name.value, level: level.value, packageSize: pack.value, username, price: price.value || 0 }); added.value = name.value.trim() }
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
      <label class="lab" for="su" style="margin-top:8px">Ник в Telegram (необязательно)</label>
      <input id="su" v-model="nick" placeholder="@maria" maxlength="60" autocapitalize="off" autocomplete="off" @keydown.enter="submit" />
      <p class="hint" style="margin:4px 0 0">Фото подтянется из Telegram, если в профиле оно открыто для всех.</p>
      <div class="row2" style="margin-top:8px">
        <div style="flex:1"><label class="lab" for="sl">Уровень</label><select id="sl" v-model="level" style="margin:0"><option v-for="l in LEVELS" :key="l">{{ l }}</option></select></div>
        <div style="flex:1"><label class="lab" for="sp">Уроков в пакете</label><input id="sp" v-model.number="pack" type="number" min="1" max="100" style="margin:0" /></div>
      </div>
      <label class="lab" for="spr" style="margin-top:8px">Цена урока</label>
      <input id="spr" v-model.number="price" type="number" min="0" max="100000" step="any" inputmode="decimal" placeholder="Например, 120" @keydown.enter="submit" />
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

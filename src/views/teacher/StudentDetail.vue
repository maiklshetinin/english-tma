<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { pctOf } from '../../store/app'
import { showToast } from '../../composables/useToast'
import { useTelegram } from '../../composables/useTelegram'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import PathEditor from '../../components/PathEditor.vue'
import StudentDecks from '../../components/StudentDecks.vue'
import LessonsList from '../../components/LessonsList.vue'
import { useStudentsStore } from '../../stores/students'
import { copyText, shareInvite } from '../../composables/useShare'
import { usePathStore } from '../../stores/path'
const pathStore = usePathStore()
const route = useRoute(), router = useRouter()
const studentStore = useStudentsStore()
const props = defineProps({ id: { type: [String, Number], required: true }, backLabel: { type: String, default: 'Ученики' } })
defineEmits(['back'])
const { notify, haptic } = useTelegram()
const s = computed(() => studentStore.list.find(x => x.id === props.id))
const tab = ref('lessons')                                       // «Уроки» (как у ученика + отметка «проведён») · «Путь и слова»
const PRESETS = ['Урок скоро', 'Сделай ДЗ', 'Пора оплатить', 'Повтори слова']
const remind = (t) => { haptic('medium'); notify(`Отправлено: ${s.value.name} — ${t}`) }   // TODO: бэкенд → Bot API sendMessage

// Ссылка-приглашение: ученик открывает её в Telegram, и его аккаунт привязывается к этой записи (одноразовая).
// Если запись уже привязана, новая ссылка переключит её на другой аккаунт — старый потеряет доступ.
// Ник Telegram: можно добавить или поменять, пока ученик не открыл приглашение (потом ник и фото приходят из его аккаунта)
const nick = ref(''), nickBusy = ref(false)
const NICK = /^[A-Za-z][A-Za-z0-9_]{4,31}$/
const cleanNick = () => nick.value.trim().replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0]
async function saveNick() {
  const u = cleanNick()
  if (!NICK.test(u)) return notify('Ник в Telegram: 5–32 символа, латиница, цифры и _, начинается с буквы')
  nickBusy.value = true
  try { await studentStore.setUsername(s.value.id, u); nick.value = ''; showToast(s.value.photoUrl ? 'Ник сохранён, фото найдено' : 'Ник сохранён, фото в Telegram не найдено') }
  catch (e) { notify(e.message) } finally { nickBusy.value = false }
}
// Цена урока: новая действует для уроков со следующего часа, прошедшие остаются по старой цене
const priceIn = ref(''), priceBusy = ref(false)
async function savePrice() {
  const n = Number(String(priceIn.value).replace(',', '.'))
  if (priceIn.value === '' || !Number.isFinite(n) || n < 0 || n > 100000) return notify('Цена — число от 0 до 100000')
  if (n === s.value.price) { priceIn.value = ''; return }
  priceBusy.value = true
  try { await studentStore.setPrice(s.value.id, n); priceIn.value = ''; showToast('Цена сохранена: действует для следующих уроков, прошедшие не меняются') }
  catch (e) { notify(e.message) } finally { priceBusy.value = false }
}
const inviteUrl = ref(''), inviteBusy = ref(false), confirmArchive = ref(false)
async function invite() {
  inviteBusy.value = true
  try { inviteUrl.value = await studentStore.invite(s.value.id); showToast((await copyText(inviteUrl.value)) ? 'Ссылка скопирована — отправьте её ученику' : 'Ссылка создана') }
  catch (e) { notify(e.message) } finally { inviteBusy.value = false }
}
async function archive() {                                    // два нажатия: первое просит подтверждение
  if (!confirmArchive.value) { confirmArchive.value = true; return }
  try { const id = s.value.id; router.replace({ name: route.name }); await studentStore.archive(id); showToast('Ученик в архиве, доступ закрыт') }
  catch (e) { notify(e.message) }
}

// Пресеты пути: добавить в путь ученика / сохранить его путь как новый пресет
const pid = ref(pathStore.presets[0]?.id ?? null), pname = ref('')
const addToPath = () => {
  const p = pathStore.presets.find(x => x.id === pid.value); if (!p) return
  const { from, count } = pathStore.applyPreset(props.id, p); haptic('light')
  showToast(`Пресет «${p.name}» добавлен в путь`, () => pathStore.of(props.id).splice(from, count))
}
const saveAsPreset = () => {
  const p = pathStore.presetFromPath(pname.value.trim() || `Путь: ${s.value.name}`, pathStore.of(props.id))
  pid.value = p.id; pname.value = ''; showToast(`Сохранено как пресет «${p.name}»`)
}
</script>
<template>
  <div v-if="s" class="page wide">
    <button class="btn ghost" style="justify-self:start" @click="$emit('back')"><AppIcon name="back" :size="18" /> {{ backLabel }}</button>
    <div class="card">
      <div class="row2"><Avatar :s="s" :size="56" /><div><h3 style="margin:0">{{ s.name }}</h3><div class="hint">Уровень {{ s.level }} · прогресс {{ pctOf(pathStore.of(s.id)) }}%</div></div></div>
      <div class="row2" style="margin-top:12px">
        <span class="badge ok">🔥 {{ s.streak }}</span><span class="badge ok">{{ s.coins }} монет</span>
        <span class="badge" :class="s.payment.status === 'paid' ? 'ok' : 'warn'">Уроков осталось: {{ s.payment.lessonsLeft }}</span>
        <span v-if="s.price" class="badge ok">Цена урока: {{ s.price }}</span>
      </div>
      <div class="row2" style="margin-top:12px">
        <span class="badge" :class="s.status === 'active' ? 'ok' : 'warn'">{{ s.status === 'active' ? 'В приложении' : 'Ждёт приглашения' }}</span>
        <button class="btn ghost" :disabled="inviteBusy" @click="invite">{{ s.status === 'active' ? 'Привязать другой аккаунт' : 'Пригласить в приложение' }}</button>
      </div>
      <div v-if="inviteUrl" class="row2" style="margin-top:8px">
        <input :value="inviteUrl" readonly aria-label="Ссылка-приглашение" style="flex:1;min-width:180px;margin:0" @focus="$event.target.select()" />
        <button class="btn ghost" @click="shareInvite(inviteUrl)">Отправить в Telegram</button>
      </div>
      <div class="row2" style="margin-top:12px">
        <input v-model="priceIn" type="number" min="0" max="100000" step="any" inputmode="decimal" :placeholder="s.price ? 'Сейчас: ' + s.price : 'Цена урока'" aria-label="Цена урока" style="flex:1;min-width:180px;margin:0" @keydown.enter="savePrice" />
        <button class="btn ghost" :disabled="priceIn === '' || priceBusy" @click="savePrice">{{ s.price ? 'Изменить цену' : 'Указать цену' }}</button>
      </div>
      <p class="hint" style="margin:4px 0 0">Новая цена — для уроков со следующего часа. Прошедшие остаются по старой.</p>
      <div v-if="s.status === 'invited'" class="row2" style="margin-top:12px">
        <input v-model="nick" :placeholder="s.username ? '@' + s.username : 'Ник в Telegram, например @maria'" aria-label="Ник в Telegram" autocapitalize="off" autocomplete="off" maxlength="60" style="flex:1;min-width:180px;margin:0" @keydown.enter="saveNick" />
        <button class="btn ghost" :disabled="!nick.trim() || nickBusy" @click="saveNick">{{ s.username ? 'Сменить ник' : 'Добавить ник' }}</button>
      </div>
      <div class="row2" style="margin-top:12px"><AppIcon name="bell" :size="18" />
        <button v-for="p in PRESETS" :key="p" class="btn ghost" @click="remind(p)">{{ p }}</button></div>
    </div>
    <div class="seg" style="justify-self:start"><button :class="{ on: tab === 'lessons' }" @click="tab = 'lessons'">Уроки</button><button :class="{ on: tab === 'path' }" @click="tab = 'path'">Путь и слова</button></div>
    <LessonsList v-if="tab === 'lessons'" :student-id="s.id" can-mark />
    <template v-else>
    <StudentDecks :student-id="s.id" />
    <div class="card">
      <h3>Путь ученика</h3>
      <p class="hint" style="margin:0 0 10px">Добавьте готовый пресет или соберите путь вручную ниже: режим «Правка» — кружки (ДЗ, слова, слова + ДЗ) и юниты.</p>
      <div class="row2"><select v-model="pid" style="flex:1;min-width:140px;margin:0"><option v-for="p in pathStore.presets" :key="p.id" :value="p.id">{{ p.name }}</option></select>
        <button class="btn" :disabled="!pid" @click="addToPath">Добавить пресет</button></div>
      <div class="row2" style="margin-top:10px"><input v-model="pname" placeholder="Название нового пресета" style="flex:1;min-width:140px;margin:0" />
        <button class="btn ghost" @click="saveAsPreset">Сохранить путь как пресет</button></div>
    </div>
    <PathEditor :units="pathStore.of(s.id)" :student-id="s.id" />
    </template>
    <div class="card row2" style="justify-content:space-between"><span class="hint">Архив скрывает ученика и закрывает ему вход в приложение.</span>
      <button class="btn ghost" style="color:var(--red)" @click="archive" @blur="confirmArchive = false">{{ confirmArchive ? 'Точно архивировать?' : 'Архивировать ученика' }}</button></div>
  </div>
  <div v-else class="page wide">      <!-- старая ссылка или ученик в архиве -->
    <button class="btn ghost" style="justify-self:start" @click="$emit('back')"><AppIcon name="back" :size="18" /> {{ backLabel }}</button>
    <div class="card" style="text-align:center"><b>Ученик не найден</b><p class="hint" style="margin:6px 0 0">Возможно, он в архиве.</p></div>
  </div>
</template>

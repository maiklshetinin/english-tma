<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { pctOf } from '../../store/app'
import { fmtMoney } from '../../utils/price'
import { showToast } from '../../composables/useToast'
import { useTelegram } from '../../composables/useTelegram'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import PathEditor from '../../components/PathEditor.vue'
import StudentDecks from '../../components/StudentDecks.vue'
import LessonCalendar from '../../components/LessonCalendar.vue'
import { useScheduleStore } from '../../stores/schedule'
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
// Имя и уровень: «Изменить» → форма в карточке
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const editing = ref(false), ename = ref(''), elevel = ref('A1'), editBusy = ref(false)
const startEdit = () => { ename.value = s.value.name; elevel.value = s.value.level; editing.value = true }
async function saveEdit() {
  const patch = {}
  if (ename.value.trim() !== s.value.name) patch.name = ename.value.trim()
  if (elevel.value !== s.value.level) patch.level = elevel.value
  if (!Object.keys(patch).length) return
  editBusy.value = true
  try { await studentStore.update(s.value.id, patch); showToast('Сохранено') }
  catch (e) { notify(e.message) } finally { editBusy.value = false }
}
const tab = ref('lessons')
const PAY = { paid: ['оплачено', 'ok'], due: ['ждёт оплаты', 'warn'], overdue: ['просрочено', 'bad'] }
const panel = ref(null)                                   // что раскрыто в шапке: 'edit' (все правки) | 'remind' | null
const openEdit = () => { if (panel.value === 'edit') { panel.value = null; editing.value = false; return } startEdit(); panel.value = 'edit' }
// История уроков этого ученика — для календаря (все месяцы)
watch(() => props.id, (id) => { if (id) useScheduleStore().loadHistory(String(id)).catch(() => {}) }, { immediate: true })                                       // «Уроки» (как у ученика + отметка «проведён») · «Путь и слова»
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
  <!-- Карточка ученика — одна колонка блоками: шапка (данные и все правки), календарь уроков, внизу — архив -->
  <div v-if="s" class="page sd">
    <div class="pcard hd">
      <div class="top">
        <button class="ib" :aria-label="`Назад: ${backLabel}`" :title="backLabel" @click="$emit('back')"><AppIcon name="back" :size="20" /></button>
        <Avatar :s="s" :size="56" />
        <div class="who"><h2>{{ s.name }}</h2>
          <div class="sub">{{ s.level }} · <span :class="s.status === 'active' ? 'on' : 'wait'">{{ s.status === 'active' ? 'в приложении' : 'ждёт приглашения' }}</span><template v-if="s.username"> · @{{ s.username }}</template></div></div>
        <button class="ib" :class="{ on: panel === 'remind' }" aria-label="Напомнить" title="Напомнить" @click="panel = panel === 'remind' ? null : 'remind'"><AppIcon name="bell" :size="19" /></button>
        <button class="ib" :class="{ on: panel === 'edit' }" aria-label="Изменить" title="Изменить" @click="openEdit"><AppIcon name="pencil" :size="18" /></button>
      </div>
      <!-- Приборы: всё главное одной строкой -->
      <div class="stats">
        <div><b>{{ s.price ? fmtMoney(s.price) : '—' }}</b><small>цена</small></div>
        <div><b :class="'p-' + PAY[s.payment.status][1]">{{ s.payment.lessonsLeft }}</b><small :title="`Оплата: ${PAY[s.payment.status][0]}`">уроков осталось</small></div>
        <div><b>{{ pctOf(pathStore.of(s.id)) }}%</b><small>прогресс</small></div>
        <div><b>🔥{{ s.streak }}</b><small>серия</small></div>
        <div><b>{{ s.coins }}</b><small>монет</small></div>
      </div>

      <div v-if="panel === 'remind'" class="pan"><span class="pl">Напомнить в Telegram</span>
        <div class="chips"><button v-for="p in PRESETS" :key="p" class="chipb" @click="remind(p)">{{ p }}</button></div></div>

      <!-- Все правки — здесь, по карандашу -->
      <div v-if="panel === 'edit'" class="pan">
        <form class="fr" @submit.prevent="saveEdit"><span class="pl">Имя</span>
          <input v-model="ename" maxlength="40" aria-label="Имя ученика" /><button class="btn sm" :disabled="editBusy || !ename.trim()">Сохранить</button></form>
        <div class="fr"><span class="pl">Уровень</span>
          <div class="seg lv" role="radiogroup" aria-label="Уровень"><button v-for="l in LEVELS" :key="l" type="button" role="radio" :aria-checked="elevel === l" :class="{ on: elevel === l }" @click="elevel = l; saveEdit()">{{ l }}</button></div></div>
        <div class="fr"><span class="pl">Цена урока</span>
          <input v-model="priceIn" type="number" min="0" max="100000" step="any" inputmode="decimal" :placeholder="s.price ? 'Сейчас: ' + s.price : 'Цена урока'" aria-label="Цена урока" @keydown.enter="savePrice" />
          <button class="btn sm" :disabled="priceIn === '' || priceBusy" @click="savePrice">Сохранить</button>
          <small class="hint">Для уроков со следующего часа, прошедшие — по старой цене.</small></div>
        <div v-if="s.status === 'invited'" class="fr"><span class="pl">Ник</span>
          <input v-model="nick" :placeholder="s.username ? '@' + s.username : '@maria'" aria-label="Ник в Telegram" autocapitalize="off" autocomplete="off" maxlength="60" @keydown.enter="saveNick" />
          <button class="btn sm" :disabled="!nick.trim() || nickBusy" @click="saveNick">Сохранить</button></div>
        <div class="fr"><span class="pl">Вход</span>
          <button class="btn ghost sm" :disabled="inviteBusy" @click="invite"><AppIcon name="link" :size="15" /> {{ s.status === 'active' ? 'Привязать другой аккаунт' : 'Ссылка-приглашение' }}</button>
          <template v-if="inviteUrl"><input :value="inviteUrl" readonly aria-label="Ссылка-приглашение" @focus="$event.target.select()" /><button class="btn sm" @click="shareInvite(inviteUrl)">Отправить</button></template></div>
      </div>
    </div>

    <div class="seg tabs"><button :class="{ on: tab === 'lessons' }" @click="tab = 'lessons'">Уроки</button><button :class="{ on: tab === 'path' }" @click="tab = 'path'">Путь и слова</button></div>
    <LessonCalendar v-if="tab === 'lessons'" :student-id="s.id" teacher compact />
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

    <button class="arch" @click="archive" @blur="confirmArchive = false"><AppIcon name="trash" :size="18" />{{ confirmArchive ? 'Точно архивировать? Ученик потеряет вход' : 'Архивировать ученика' }}</button>
  </div>
  <div v-else class="page wide">      <!-- старая ссылка или ученик в архиве -->
    <button class="btn ghost" style="justify-self:start" @click="$emit('back')"><AppIcon name="back" :size="18" /> {{ backLabel }}</button>
    <div class="card" style="text-align:center"><b>Ученик не найден</b><p class="hint" style="margin:6px 0 0">Возможно, он в архиве.</p></div>
  </div>
</template>

<style scoped>
/* Одна колонка, ширина как у обычной страницы */
.sd { max-width: 640px }
.pcard { background: var(--card); border: 2px solid var(--border); border-bottom-width: 4px; border-radius: 18px; overflow: hidden }
.top { display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 4px }
.who { flex: 1; min-width: 0 } .who h2 { margin: 0; font-size: 19px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.sub { font-size: 13px; font-weight: 600; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .sub .on { color: var(--blue) } .sub .wait { color: var(--orange-d) }
.ib { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .ib:hover, .ib.on { background: var(--blue-l); color: var(--blue) }
.stats { display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid var(--border) }
.stats div { display: grid; justify-items: center; gap: 1px; padding: 8px 2px; min-width: 0 } .stats div + div { border-left: 1px solid var(--border) }
.stats b { font-size: 16px; font-weight: 900; white-space: nowrap } .stats small { font-size: 11px; font-weight: 700; color: var(--hint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100% }
.p-ok { color: var(--green-d) } .p-warn { color: var(--orange-d) } .p-bad { color: var(--red-d) }
.pan { display: grid; gap: 10px; padding: 12px 14px 14px; border-top: 1px solid var(--border); background: var(--surface) }
.pl { flex: none; width: 92px; font-size: 13px; font-weight: 800; color: var(--hint) }
.fr { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px } .fr input { flex: 1; min-width: 120px; margin: 0; padding: 7px 10px; font-size: 14px; background: var(--card) }
.fr .hint { flex-basis: 100%; padding-left: 100px; font-size: 12px }
.lv { flex: 1; display: grid; grid-template-columns: repeat(6, 1fr); padding: 2px; background: var(--card) } .lv button { padding: 4px 0; font-size: 13px }
.chips { display: flex; flex-wrap: wrap; gap: 6px }
.chipb { padding: 6px 12px; border: 1px solid var(--border); border-radius: 99px; background: var(--card); color: var(--blue); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer } .chipb:hover { background: var(--blue-l); border-color: var(--blue) }
.tabs { justify-self: start }
.arch { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border: 0; border-radius: 14px; background: none; color: var(--red-d); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer } .arch:hover { background: var(--red-l) }
@media (max-width: 480px) { .pl { width: 100% } .fr .hint { padding-left: 0 } }
</style>

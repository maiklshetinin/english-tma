<script setup>
import StudentReview from '../../components/StudentReview.vue'
import StudentCourses from '../../components/StudentCourses.vue'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { isOnline, seenLabel } from '../../utils/online'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { fmtMoney } from '../../utils/price'
import { showToast } from '../../composables/useToast'
import { ask } from '../../composables/useDialog'
import { useTelegram } from '../../composables/useTelegram'
import Avatar from '../../components/Avatar.vue'
import PhotoZoom from '../../components/PhotoZoom.vue'
import AppIcon from '../../components/AppIcon.vue'
import BackButton from '../../components/BackButton.vue'
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
const tab = ref('lessons')
const panel = ref(null)                                   // что раскрыто в шапке: 'edit' (все правки) | 'remind' | null
// История уроков этого ученика — для календаря (все месяцы)
watch(() => props.id, (id) => { if (id) useScheduleStore().loadHistory(String(id)).catch(() => {}) }, { immediate: true })                                       // «Уроки» (как у ученика + отметка «проведён») · «Путь и слова»
const PRESETS = ['Урок скоро', 'Сделай ДЗ', 'Пора оплатить', 'Повтори слова']
const remind = (t) => { haptic('medium'); notify(`Отправлено: ${s.value.name} — ${t}`) }   // TODO: бэкенд → Bot API sendMessage

// Ссылка-приглашение: ученик открывает её в Telegram, и его аккаунт привязывается к этой записи (одноразовая).
// Если запись уже привязана, новая ссылка переключит её на другой аккаунт — старый потеряет доступ.
// Ник Telegram: можно добавить или поменять, пока ученик не открыл приглашение (потом ник и фото приходят из его аккаунта)
// ---------- Правка (карандаш): имя, уровень, цена, ник — одна форма, одна кнопка «Сохранить» и «Отмена» ----------
// Ушли с несохранёнными правками (другой раздел, назад, нажатие мимо карточки) — спрашиваем: сохранить или нет.
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const NICK = /^[A-Za-z][A-Za-z0-9_]{4,31}$/
const f = ref({ name: '', level: 'A1', price: '', nick: '' }), saving = ref(false)
const fill = () => { f.value = { name: s.value.name, level: s.value.level, price: s.value.price ? String(s.value.price) : '', nick: s.value.username ? '@' + s.value.username : '' } }
const cleanNick = (v) => v.trim().replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0]
const priceNum = () => Number(String(f.value.price).replace(',', '.'))
const changes = computed(() => {
  if (panel.value !== 'edit' || !s.value) return {}
  const c = {}
  if (f.value.name.trim() && f.value.name.trim() !== s.value.name) c.name = f.value.name.trim()
  if (f.value.level !== s.value.level) c.level = f.value.level
  if (String(f.value.price).trim() !== '' && priceNum() !== (s.value.price || 0)) c.price = priceNum()
  if (s.value.status === 'invited' && cleanNick(f.value.nick) && cleanNick(f.value.nick) !== (s.value.username || '')) c.username = cleanNick(f.value.nick)
  return c
})
const dirty = computed(() => Object.keys(changes.value).length > 0)
function closeEdit() { panel.value = null }
async function saveAll() {
  const c = changes.value
  if (!dirty.value) { closeEdit(); return true }
  if ('price' in c && (!Number.isFinite(c.price) || c.price < 0 || c.price > 100000)) { notify('Цена — число от 0 до 100000'); return false }
  if ('username' in c && !NICK.test(c.username)) { notify('Ник в Telegram: 5–32 символа, латиница, цифры и _, начинается с буквы'); return false }
  saving.value = true
  try {
    const id = s.value.id, patch = {}
    if (c.name) patch.name = c.name
    if (c.level) patch.level = c.level
    if (Object.keys(patch).length) await studentStore.update(id, patch)
    if ('price' in c) await studentStore.setPrice(id, c.price)
    if (c.username) await studentStore.setUsername(id, c.username)
    showToast('price' in c ? 'Сохранено. Новая цена — для уроков со следующего часа' : 'Сохранено')
    closeEdit(); return true
  } catch (e) { notify(e.message); return false } finally { saving.value = false }
}
// Несохранённые правки: «Сохранить» / «Не сохранять». true — можно уходить.
async function leaveEdit() {
  if (!dirty.value) { closeEdit(); return true }
  if (await ask('Сохранить изменения?', { text: `Вы поменяли данные ученика «${s.value.name}».`, ok: 'Сохранить', cancel: 'Не сохранять' })) return saveAll()
  closeEdit(); return true
}
const openEdit = async () => { if (panel.value === 'edit') { await leaveEdit(); return } fill(); panel.value = 'edit' }
onBeforeRouteLeave(() => leaveEdit())
onBeforeRouteUpdate(() => leaveEdit())
// Нажатие мимо карточки (не по ссылке — там спросит переход) при несохранённых правках
const hd = ref(null)
const outside = (e) => { if (dirty.value && !hd.value?.contains(e.target) && !e.target.closest?.('a, .dov, .toast')) leaveEdit() }
onMounted(() => addEventListener('pointerdown', outside, true)); onUnmounted(() => removeEventListener('pointerdown', outside, true))
// Ник в Telegram — по нажатию копируется (как в профиле Telegram)
async function copyNick() { haptic('light'); showToast((await copyText('@' + s.value.username)) ? 'Ник скопирован' : 'Не удалось скопировать') }
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

const zoom = ref(false)      // фото ученика крупно (как в Telegram — нажатие на аватарку)
</script>
<template>
  <!-- Карточка ученика — одна колонка блоками: шапка (данные и все правки), календарь уроков, внизу — архив -->
  <div v-if="s" class="page sd">
    <div ref="hd" class="pcard hd">
      <div class="top">
        <BackButton :to="backLabel" @click="$emit('back')" />
        <button class="avb" :aria-label="`Фото: ${s.name}`" title="Открыть фото" @click="zoom = true"><Avatar :s="s" :size="56" :online="isOnline(s)" /></button>
        <div class="who"><h2>{{ s.name }}</h2>
          <div class="sub"><span class="st">{{ s.level }}<template v-if="s.price"> · {{ fmtMoney(s.price) }} за урок</template> · <span :class="s.status !== 'active' ? 'wait' : isOnline(s) ? 'on' : ''">{{ s.status !== 'active' ? 'ждёт приглашения' : seenLabel(s) || 'в приложении' }}</span></span><button v-if="s.username" class="nick" :title="`Скопировать @${s.username}`" @click="copyNick"><span>@{{ s.username }}</span><AppIcon name="copy" :size="14" /></button></div></div>
        <button class="ib" :class="{ on: panel === 'remind' }" aria-label="Напомнить" title="Напомнить" @click="panel = panel === 'remind' ? null : 'remind'"><AppIcon name="bell" :size="24" /></button>
        <button class="ib" :class="{ on: panel === 'edit' }" aria-label="Изменить" title="Изменить" @click="openEdit"><AppIcon name="pencil" :size="23" /></button>
      </div>
      <div v-if="panel === 'remind'" class="pan"><span class="pl">Напомнить в Telegram</span>
        <div class="chips"><button v-for="p in PRESETS" :key="p" class="chipb" @click="remind(p)">{{ p }}</button></div></div>

      <!-- Все правки — здесь, по карандашу: одна форма, внизу «Отмена» и «Сохранить» -->
      <form v-if="panel === 'edit'" class="pan" @submit.prevent="saveAll">
        <div class="fr"><span class="pl">Имя</span><input v-model="f.name" maxlength="40" aria-label="Имя ученика" /></div>
        <div class="fr"><span class="pl">Уровень</span>
          <div class="seg lv" role="radiogroup" aria-label="Уровень"><button v-for="l in LEVELS" :key="l" type="button" role="radio" :aria-checked="f.level === l" :class="{ on: f.level === l }" @click="f.level = l">{{ l }}</button></div></div>
        <div class="fr"><span class="pl">Цена урока</span>
          <input v-model="f.price" type="number" min="0" max="100000" step="any" inputmode="decimal" placeholder="Цена урока" aria-label="Цена урока" />
          <small v-if="'price' in changes" class="hint">Для уроков со следующего часа, прошедшие — по старой цене.</small></div>
        <div v-if="s.status === 'invited'" class="fr"><span class="pl">Ник</span>
          <input v-model="f.nick" placeholder="@maria" aria-label="Ник в Telegram" autocapitalize="off" autocomplete="off" maxlength="60" /></div>
        <div class="fr"><span class="pl">Вход</span>
          <button type="button" class="btn ghost sm" :disabled="inviteBusy" @click="invite"><AppIcon name="link" :size="15" /> {{ s.status === 'active' ? 'Привязать другой аккаунт' : 'Ссылка-приглашение' }}</button>
          <template v-if="inviteUrl"><input :value="inviteUrl" readonly aria-label="Ссылка-приглашение" @focus="$event.target.select()" /><button type="button" class="btn sm" @click="shareInvite(inviteUrl)">Отправить</button></template></div>
        <div class="acts"><button type="button" class="btn" @click="closeEdit">Отмена</button><button class="btn primary" :disabled="!dirty || saving">{{ saving ? 'Сохраняю…' : 'Сохранить' }}</button></div>
      </form>
    </div>

    <div class="seg tabs"><button :class="{ on: tab === 'lessons' }" @click="tab = 'lessons'">Уроки</button><button :class="{ on: tab === 'path' }" @click="tab = 'path'">Путь и слова</button><button :class="{ on: tab === 'review' }" @click="tab = 'review'">Review</button></div>
    <LessonCalendar v-if="tab === 'lessons'" :student-id="s.id" teacher compact />
    <StudentReview v-else-if="tab === 'review'" :student-id="s.id" />
    <template v-else>
    <StudentCourses :student-id="s.id" />
    <StudentDecks :student-id="s.id" />
    <div class="card">
      <h3>Путь ученика</h3>
      <p class="hint" style="margin:0">Соберите путь ниже: режим «Правка» — кружки (ДЗ, слова, слова + ДЗ) и юниты.</p>
    </div>
    <PathEditor :units="pathStore.of(s.id)" :student-id="s.id" />
    </template>

    <button class="arch" @click="archive" @blur="confirmArchive = false"><AppIcon name="trash" :size="18" />{{ confirmArchive ? 'Точно архивировать? Ученик потеряет вход' : 'Архивировать ученика' }}</button>
    <PhotoZoom v-if="zoom" :s="s" @close="zoom = false" />
  </div>
  <div v-else class="page wide">      <!-- старая ссылка или ученик в архиве -->
    <BackButton :to="backLabel" style="justify-self:start" @click="$emit('back')" />
    <div class="card" style="text-align:center"><b>Ученик не найден</b><p class="hint" style="margin:6px 0 0">Возможно, он в архиве.</p></div>
  </div>
</template>

<style scoped>
.avb { flex: none; padding: 0; border: 0; border-radius: 50%; background: none; cursor: zoom-in; transition: transform .08s } .avb:active { transform: scale(.94) }
/* Одна колонка, ширина как у обычной страницы */
.sd { max-width: 640px }      /* шапка и вкладки — обычной ширины (ник влезает, «Путь и слова» как раньше); «Уроки» — узкая карточка по центру, как картинка счёта */
.pcard { background: var(--card); border: 1px solid var(--border); border-radius: 18px; overflow: hidden }
.top { display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 4px }
.who { flex: 1; min-width: 0 } .who h2 { margin: 0; font-size: 19px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
/* строка под именем: уровень · цена · статус (сжимается с «…») и ник целиком — кнопкой; раньше длинный ник обрезался вместе со строкой и от кнопки оставался один значок */
.nick { flex: 0 1 auto; min-width: 48px; display: inline-flex; align-items: center; gap: 3px; padding: 0 2px; border: 0; border-radius: 6px; background: none; font: inherit; color: var(--blue); cursor: pointer }
.nick span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.nick:hover { background: var(--blue-l) } .nick svg { flex: none; opacity: .8 }
.sub { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; font-weight: 600; color: var(--hint); white-space: nowrap } .sub .st { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis } .sub .on { color: var(--blue) } .sub .wait { color: var(--orange-d) }
.ib { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 10px; background: none; color: var(--hint); cursor: pointer } .ib:hover { background: var(--surface); color: var(--text) } .ib.on { background: var(--group); color: var(--text) }      /* значки — серые, как во всём приложении */
.pan { display: grid; gap: 10px; padding: 12px 14px 14px; border-top: 1px solid var(--border); background: var(--surface) }
.pl { flex: none; width: 92px; font-size: 13px; font-weight: 800; color: var(--hint) }
.fr { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px } .fr input { flex: 1; min-width: 120px; margin: 0; padding: 7px 10px; font-size: 14px; background: var(--card) }
.fr .hint { flex-basis: 100%; padding-left: 100px; font-size: 12px }
.acts { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px } .acts .btn { padding: 9px 18px }
.lv { flex: 1; display: grid; grid-template-columns: repeat(6, 1fr); padding: 2px; background: var(--card) } .lv button { padding: 4px 0; font-size: 13px }
.chips { display: flex; flex-wrap: wrap; gap: 6px }
.chipb { padding: 6px 12px; border: 1px solid var(--border); border-radius: 99px; background: var(--card); color: var(--blue); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer } .chipb:hover { background: var(--blue-l); border-color: var(--blue) }
.tabs { justify-self: start }
.arch { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border: 0; border-radius: 14px; background: none; color: var(--red-d); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer } .arch:hover { background: var(--red-l) }
@media (max-width: 480px) { .pl { width: 100% } .fr .hint { padding-left: 0 } }
</style>

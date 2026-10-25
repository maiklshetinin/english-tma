<script setup>
import { ref, computed } from 'vue'
import { state, pathOf, pctOf, applyPreset, presetFromPath } from '../../store/mock'
import { showToast } from '../../composables/useToast'
import { useTelegram } from '../../composables/useTelegram'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import PathEditor from '../../components/PathEditor.vue'
import StudentDecks from '../../components/StudentDecks.vue'
import { createInvite } from '../../composables/useTelegramAuth'
const props = defineProps({ id: { type: Number, required: true }, backLabel: { type: String, default: 'Ученики' } })
defineEmits(['back'])
const { notify, haptic } = useTelegram()
const s = computed(() => state.students.find(x => x.id === props.id))
const PRESETS = ['Урок скоро', 'Сделай ДЗ', 'Пора оплатить', 'Повтори слова']
const remind = (t) => { haptic('medium'); notify(`Отправлено: ${s.value.name} — ${t}`) }   // TODO: бэкенд → Bot API sendMessage

// Ссылка-приглашение: ученик открывает её в Telegram, и его аккаунт привязывается к этой записи (одноразовая)
const inviteUrl = ref(''), inviteBusy = ref(false)
async function invite() {
  inviteBusy.value = true
  try {
    inviteUrl.value = await createInvite(s.value.id)
    try { await navigator.clipboard.writeText(inviteUrl.value); showToast('Ссылка скопирована — отправьте её ученику') } catch { /* покажем ссылку на экране */ }
  } catch (e) { notify(e.message) } finally { inviteBusy.value = false }
}

// Пресеты пути: добавить в путь ученика / сохранить его путь как новый пресет
const pid = ref(state.presets[0]?.id ?? null), pname = ref('')
const addToPath = () => {
  const p = state.presets.find(x => x.id === pid.value); if (!p) return
  const { from, count } = applyPreset(props.id, p); haptic('light')
  showToast(`Пресет «${p.name}» добавлен в путь`, () => pathOf(props.id).splice(from, count))
}
const saveAsPreset = () => {
  const p = presetFromPath(pname.value.trim() || `Путь: ${s.value.name}`, pathOf(props.id))
  pid.value = p.id; pname.value = ''; showToast(`Сохранено как пресет «${p.name}»`)
}
</script>
<template>
  <div class="page wide">
    <button class="btn ghost" style="justify-self:start" @click="$emit('back')"><AppIcon name="back" :size="18" /> {{ backLabel }}</button>
    <div class="card">
      <div class="row2"><Avatar :s="s" :size="56" /><div><h3 style="margin:0">{{ s.name }}</h3><div class="hint">Уровень {{ s.level }} · прогресс {{ pctOf(pathOf(s.id)) }}%</div></div></div>
      <div class="row2" style="margin-top:12px">
        <span class="badge ok">🔥 {{ s.streak }}</span><span class="badge ok">{{ s.coins }} монет</span>
        <span class="badge" :class="s.payment.status === 'paid' ? 'ok' : 'warn'">Уроков осталось: {{ s.payment.lessonsLeft }}</span>
      </div>
      <div class="row2" style="margin-top:12px"><button class="btn ghost" :disabled="inviteBusy" @click="invite">Пригласить в приложение</button>
        <input v-if="inviteUrl" :value="inviteUrl" readonly aria-label="Ссылка-приглашение" style="flex:1;min-width:180px;margin:0" @focus="$event.target.select()" /></div>
      <div class="row2" style="margin-top:12px"><AppIcon name="bell" :size="18" />
        <button v-for="p in PRESETS" :key="p" class="btn ghost" @click="remind(p)">{{ p }}</button></div>
    </div>
    <StudentDecks :student-id="s.id" />
    <div class="card">
      <h3>Путь ученика</h3>
      <p class="hint" style="margin:0 0 10px">Добавьте готовый пресет или соберите путь вручную ниже: режим «Правка» — кружки (ДЗ, слова, слова + ДЗ) и юниты.</p>
      <div class="row2"><select v-model.number="pid" style="flex:1;min-width:140px;margin:0"><option v-for="p in state.presets" :key="p.id" :value="p.id">{{ p.name }}</option></select>
        <button class="btn" :disabled="!pid" @click="addToPath">Добавить пресет</button></div>
      <div class="row2" style="margin-top:10px"><input v-model="pname" placeholder="Название нового пресета" style="flex:1;min-width:140px;margin:0" />
        <button class="btn ghost" @click="saveAsPreset">Сохранить путь как пресет</button></div>
    </div>
    <PathEditor :units="pathOf(s.id)" :student-id="s.id" />
  </div>
</template>

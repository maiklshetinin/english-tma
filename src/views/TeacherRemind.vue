<script setup>
import { state } from '../store/mock'
import { useTelegram } from '../composables/useTelegram'
const { notify, haptic } = useTelegram()
const presets = ['⏰ Урок через час', '📝 Сделай домашку', '💳 Пора оплатить занятия', '🃏 Повтори карточки']
function send(s, text) {
  state.sentReminders.unshift({ id: Date.now(), to: s.name, text })
  haptic('medium'); notify(`Отправлено: ${s.name} — ${text}`)   // TODO: бэкенд → Bot API sendMessage
}
</script>
<template>
  <div class="page">
    <div class="card" v-for="s in state.students" :key="s.id">
      <h3>{{ s.name }}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <button class="btn ghost" v-for="p in presets" :key="p" @click="send(s, p)">{{ p }}</button>
      </div>
    </div>
    <div class="card" v-if="state.sentReminders.length"><h3>Отправлено</h3>
      <div class="hint" v-for="r in state.sentReminders.slice(0, 5)" :key="r.id">{{ r.to }}: {{ r.text }}</div></div>
  </div>
</template>

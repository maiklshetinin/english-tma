<script setup>
import { reactive } from 'vue'
import { state } from '../store/mock'
import { useTelegram } from '../composables/useTelegram'
const { notify } = useTelegram()
const f = reactive({ studentId: 1, title: '', description: '', due: '' })
function send() {
  if (!f.title) return
  state.homework.push({ id: Date.now(), ...f, done: false })
  // TODO: POST /api/homework + отправка уведомления через бота
  notify('ДЗ отправлено ученику'); f.title = f.description = ''
}
</script>
<template>
  <div class="page">
    <div class="card">
      <h3>Новое задание</h3>
      <select v-model="f.studentId" style="width:100%;padding:12px;margin-bottom:10px;border-radius:12px;border:0">
        <option v-for="s in state.students" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <input v-model="f.title" placeholder="Название" />
      <textarea v-model="f.description" rows="3" placeholder="Описание"></textarea>
      <input v-model="f.due" type="date" />
      <button class="btn" @click="send">Отправить</button>
    </div>
  </div>
</template>

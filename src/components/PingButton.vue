<script setup>
import { ref } from 'vue'
import { apiFetch } from '../composables/useTelegramAuth'
import { showToast } from '../composables/useToast'
const busy = ref(false)
async function ping() {
  if (!import.meta.env.VITE_API_URL) return showToast('Не задан API_URL — приложение не знает адрес сервера')
  busy.value = true
  try {
    const r = await apiFetch('/ping', { method: 'POST', body: JSON.stringify({ msg: 'тест из Профиля' }) })
    showToast(r.ok ? `Сервер ответил: ${(await r.json()).who}` : `Сервер ответил ошибкой ${r.status}`)
  } catch { showToast('Сервер не отвечает (спит, неверный адрес или CORS) — см. консоль браузера') }
  finally { busy.value = false }
}
</script>
<template><button class="btn ghost" :disabled="busy" @click="ping">Проверить связь с сервером</button></template>

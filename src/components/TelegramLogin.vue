<script setup>
// Официальная кнопка Telegram Login Widget. Домен сайта нужно один раз привязать к боту: @BotFather → /setdomain.
import { ref, onMounted } from 'vue'
import { BOT_USERNAME } from '../firebase'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const box = ref(null)
onMounted(() => {
  window.onTelegramAuth = auth.loginWithWidget
  const s = document.createElement('script')
  s.src = 'https://telegram.org/js/telegram-widget.js?22'; s.async = true
  Object.entries({ 'telegram-login': BOT_USERNAME, size: 'large', radius: '14', onauth: 'onTelegramAuth(user)', 'request-access': 'write' })
    .forEach(([k, v]) => s.setAttribute(`data-${k}`, v))
  box.value.appendChild(s)
})
</script>
<template><div ref="box" class="tl" /></template>
<style scoped>.tl { min-height: 40px; display: grid; justify-items: center }</style>

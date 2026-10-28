<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BOT_USERNAME } from './firebase'
import TelegramLogin from './components/TelegramLogin.vue'
import BottomNav from './components/BottomNav.vue'
import Toast from './components/Toast.vue'
import DragGhost from './components/DragGhost.vue'
import WakeUp from './components/WakeUp.vue'
import PresenceBar from './components/PresenceBar.vue'
import { startLive, stopLive, setWhere, onLive } from './composables/useLive'
import { useStudentsStore } from './stores/students'
import { useScheduleStore } from './stores/schedule'
import { useGroupsStore } from './stores/groups'
import { useContentStore } from './stores/content'
import { redirectFor, goUp } from './router'
import { useBackButton } from './composables/useBackButton'
import { useAuthStore } from './stores/auth'
const auth = useAuthStore()

const router = useRouter(), route = useRoute()
// Роль становится известна только после входа: если адрес (закладка, обновление) не для этой роли — на первую вкладку роли
const booted = ref(false)      // вход закончен и демо-роль из адреса применена: до этого роль «временная» и адрес трогать нельзя
watch(() => [booted.value, auth.status, auth.role, route.fullPath], () => {
  if (!booted.value || auth.status !== 'ready') return
  const to = redirectFor(route, auth.role)
  if (to) router.replace(to)
}, { immediate: true })
// Открыта карточка ученика → в шапке Telegram появляется системная «Назад»
useBackButton(computed(() => auth.status === 'ready' && !!route.params.id), () => goUp(router))
// В демо-режиме роль можно задать в URL: ?demo&role=teacher (переключатель — в «Профиле»)
// Вместе в реальном времени (только преподаватели): кто где сейчас и «коллега поменял данные — перезагрузить»
watch(() => auth.status === 'ready' && auth.isTeacher, (on) => (on ? startLive() : stopLive()), { immediate: true })
watch(() => route.meta.tab, (t) => { if (t !== 'courses') setWhere(String(t || '')) }, { immediate: true })      // в редакторе он сам скажет, какой курс
const RELOAD = { students: () => useStudentsStore().load(), schedule: () => useScheduleStore().load(), groups: () => useGroupsStore().load(),
  paths: () => useContentStore().load(), presets: () => useContentStore().load(), decks: () => useContentStore().load(), content: () => useContentStore().load() }
const pending = new Map()
onLive('changed', ({ what }) => {          // несколько правок подряд — одна перезагрузка
  const fn = RELOAD[what]; if (!fn) return
  clearTimeout(pending.get(what)); pending.set(what, setTimeout(() => fn()?.catch?.(() => {}), 250))
})
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
onMounted(() => auth.authenticate().then(() => { const r = new URLSearchParams(location.search).get('role'); if (demo && (r === 'teacher' || r === 'student')) auth.setRole(r) }).finally(() => { booted.value = true }))
</script>

<template>
  <WakeUp v-if="auth.status === 'loading'" />
  <div v-else-if="auth.status === 'login'" class="splash card">
    <h3>Вход</h3><p class="hint">Войдите через Telegram. Ученикам сначала нужна ссылка-приглашение от преподавателя: открыв её в Telegram, вы попадёте в приложение, и дальше можно входить здесь.</p>
    <TelegramLogin v-if="BOT_USERNAME" />
  </div>
  <div v-else-if="auth.status === 'error'" class="splash card">
    <h3>Не удалось войти</h3><p class="hint">{{ auth.error }}</p><button class="btn" @click="auth.authenticate()">Повторить</button>
  </div>
  <template v-else>
    <div class="shell">
      <PresenceBar v-if="auth.isTeacher && route.name !== 'courses'" />
      <main><RouterView v-slot="{ Component, route: r }"><component :is="Component" :key="auth.role + r.meta.tab" /></RouterView></main>
    </div>
    <BottomNav /><Toast /><DragGhost />
  </template>
</template>

<style>
.shell { padding-top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)) }
.splash { min-height: 60vh; display: grid; place-content: center; justify-items: center; gap: 12px; max-width: 360px; margin: 20vh auto 0; text-align: center }
.spin { width: 40px; height: 40px; border-radius: 50%; border: 5px solid var(--border); border-top-color: var(--green); animation: r .8s linear infinite }
@keyframes r { to { transform: rotate(360deg) } }
@media (min-width: 1024px) { .shell { padding-left: 124px } .page { padding-bottom: 40px } }
</style>

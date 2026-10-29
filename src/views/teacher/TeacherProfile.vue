<script setup>
// Профиль преподавателя — как настройки в Telegram: сверху аватар и имя, ниже — группы строк (значок, название, справа значение или переключатель).
// Только настройки. Цифры (ученики, уроки, оплаты, выученные слова) здесь не показываем — это есть на своих экранах.
import { ref, computed } from 'vue'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppVersion from '../../components/AppVersion.vue'
import { showToast } from '../../composables/useToast'
import { apiFetch, canLogout } from '../../firebase'
import { useStudentsStore } from '../../stores/students'
import { useAuthStore } from '../../stores/auth'
const auth = useAuthStore()
const studentStore = useStudentsStore()
const name = computed(() => auth.user?.first_name || auth.teacher.name)
const me = computed(() => ({ ...auth.teacher, name: name.value }))     // запись преподавателя (photoUrl — из Telegram)
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
const noStudents = computed(() => auth.role === 'teacher' && !studentStore.list.length)
const switchRole = () => { if (!noStudents.value) auth.setRole(auth.role === 'student' ? 'teacher' : 'student') }
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
<template>
  <div class="page tg">
    <header class="me">
      <Avatar :s="me" :size="84" />
      <b>{{ name }}</b>
      <small>@{{ auth.user?.username || auth.teacher.username }} · {{ auth.isDev ? 'Разработчик' : 'Преподаватель' }}</small>
    </header>

    <section class="grp">
      <button class="it" :disabled="noStudents" :title="noStudents ? 'Сначала добавьте ученика' : ''" @click="switchRole">
        <span class="ic"><AppIcon name="users" :size="18" /></span>
        <span class="tx">{{ demo ? 'Демо-режим' : 'Смотреть как ученик' }}</span>
        <span class="val">{{ auth.role === 'student' ? 'ученик' : 'преподаватель' }}</span>
      </button>
    </section>

    <!-- Для разработчика (DEV_IDS): проверка связи с сервером. Обычный преподаватель этого не видит -->
    <template v-if="auth.isDev">
      <h4 class="gh">Для разработчика</h4>
      <section class="grp">
        <button class="it" :disabled="busy" @click="ping">
          <span class="ic"><AppIcon name="refresh" :size="18" /></span>
          <span class="tx">Проверить связь с сервером</span>
          <span class="val">{{ busy ? '…' : '' }}</span>
        </button>
      </section>
    </template>

    <section v-if="canLogout" class="grp">
      <button class="it red" @click="auth.logout()"><span class="tx">Выйти</span></button>
    </section>
    <AppVersion />
  </div>
</template>
<style scoped>
.tg { gap: 8px }
.me { display: grid; justify-items: center; gap: 4px; padding: 8px 0 14px; text-align: center }
.me > b { margin-top: 8px; font-size: 22px } .me small { font-size: 14px; font-weight: 600; color: var(--hint) }
.gh { margin: 10px 16px 2px; font-size: 13px; font-weight: 700; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
/* Группа строк как в Telegram: белая плашка, строки с тонким разделителем от текста (не от края) */
.grp { overflow: hidden; border-radius: 14px; background: var(--card); border: 1px solid var(--border) }
.it { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 48px; padding: 8px 16px; border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer }
.it + .it { background: linear-gradient(var(--border), var(--border)) right top / calc(100% - 60px) 1px no-repeat }      /* разделитель — от текста, как в Telegram */
.it:hover:not(:disabled) { background: var(--surface) } .it:disabled { cursor: default; opacity: .6 }
.ic { flex: none; display: grid; place-items: center; width: 30px; height: 30px; color: var(--hint) }      /* значки — просто серые, без цветных квадратиков */
.tx { flex: 1; display: grid; gap: 1px; min-width: 0; font-size: 16px; font-weight: 600 } .tx small { font-size: 12px; font-weight: 500; color: var(--hint) }
.val { flex: none; font-size: 15px; font-weight: 500; color: var(--hint) }
.red .tx { color: var(--red-d); text-align: center }
.sw { appearance: none; flex: none; width: 46px; height: 28px; margin: 0; border-radius: 14px; background: var(--border); position: relative; cursor: pointer; transition: background .15s }
.sw::after { content: ''; position: absolute; left: 3px; top: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: transform .15s }
.sw:checked { background: var(--green) } .sw:checked::after { transform: translateX(18px) }
</style>

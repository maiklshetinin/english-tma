<script setup>
// Плашка «Вышло обновление» (useUpdate.js): человек работает — не перезагружаем без спроса; отвлечётся — обновится само.
// Разработчику, пока новая сборка ещё не появилась на сайте, — «Ждём новую версию…».
import { upd, reloadNow } from '../composables/useUpdate'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
</script>
<template>
  <Teleport to="body">
    <div v-if="upd.ready" class="ub" role="status">
      <span>🚀 Вышло обновление<template v-if="upd.by"> · {{ upd.by }}</template><small>обновится само, когда отвлечётесь</small></span>
      <button type="button" @click="reloadNow">Обновить</button>
    </div>
    <div v-else-if="upd.wait && auth.isDev" class="ub wait" role="status"><span>⏳ Ждём, пока новая версия появится на сайте…<small>потом обновятся все, кто в приложении</small></span></div>
  </Teleport>
</template>
<style scoped>
.ub { position: fixed; z-index: 9000; top: 12px; left: 50%; translate: -50% 0; display: flex; align-items: center; gap: 14px; max-width: calc(100vw - 24px); box-sizing: border-box; padding: 10px 10px 10px 16px; border-radius: 16px; background: #1e1e1e; color: #fff; box-shadow: 0 10px 30px rgba(0, 0, 0, .3); font-size: 14px; font-weight: 800; animation: ubIn .3s cubic-bezier(.34, 1.4, .64, 1) }
@keyframes ubIn { from { opacity: 0; translate: -50% -20px } }
.ub span { display: grid; gap: 1px } .ub small { font-size: 11px; font-weight: 700; color: #bdbdbd }
.ub button { flex: none; height: 34px; padding: 0 16px; border: 0; border-radius: 10px; background: var(--blue); color: #fff; font: inherit; cursor: pointer }
.ub.wait { padding-right: 16px }
</style>

<script setup>
// «Вышло обновление» — список новых коммитов, как на GitHub, только проще: слева линия с точками, заголовок коммита,
// под ним автор и «25 мин назад», справа метка коммита. Слева снизу (на телефоне — сверху и только последний коммит).
// «Обновить» — перезагрузить приложение, «Скрыть» — до следующей сборки. Логика — composables/useUpdates.js.
import { ref, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'
import { update, later, reloadApp } from '../composables/useUpdates'
const now = ref(Date.now()); let t = 0
onMounted(() => { t = setInterval(() => { now.value = Date.now() }, 30e3) }); onUnmounted(() => clearInterval(t))
function ago(sec) {
  if (!sec) return ''
  const m = Math.max(0, Math.round((now.value / 1000 - sec) / 60))
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : m < 24 * 60 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} д назад`
}
</script>
<template>
  <Transition name="un">
    <div v-if="update.ready" class="un" role="status" aria-live="polite">
      <div class="hd">
        <span class="ic" aria-hidden="true"><AppIcon name="refresh" :size="14" /></span>
        <b>Обновления · {{ update.ready.items.length + update.ready.more }}</b>
        <button class="hide" type="button" @click="later">Скрыть</button>
        <button class="go" type="button" @click="reloadApp">Обновить</button>
      </div>
      <ol class="log">
        <li v-for="(c, k) in update.ready.items" :key="c.h" :class="{ rest: k > 0 }">
          <span class="msg"><b :title="c.s">{{ c.s }}</b><small><template v-if="c.a">{{ c.a }} · </template>{{ ago(c.t) }}</small></span>
          <code>{{ c.h }}</code>
        </li>
        <li v-if="update.ready.more" class="more rest">и ещё {{ update.ready.more }}</li>
      </ol>
    </div>
  </Transition>
</template>
<style scoped>
.un { position: fixed; z-index: 45; left: 16px; bottom: calc(16px + var(--safe-b)); width: 360px; overflow: hidden; border-radius: 14px; background: var(--card); box-shadow: 0 12px 34px rgba(0, 0, 0, .18), 0 0 0 1px var(--border) }
.hd { display: flex; align-items: center; gap: 8px; padding: 7px 7px 7px 10px; background: var(--surface); border-bottom: 1px solid var(--border); font-size: 12.5px }
.ic { flex: none; width: 22px; height: 22px; border-radius: 7px; background: var(--blue); color: #fff; display: grid; place-items: center }
.hd b { flex: 1; min-width: 0; font-weight: 900; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.hide { padding: 0 2px; border: 0; background: none; font: inherit; font-weight: 800; color: var(--hint); cursor: pointer }
.go { height: 26px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--blue); color: #fff; font: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer }
/* Список коммитов: линия с точками слева, как история коммитов на GitHub */
.log { list-style: none; margin: 0; padding: 4px 0 }
.log li { position: relative; display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 30px }
.log li + li { border-top: 1px solid var(--border) }
.log li::before { content: ''; position: absolute; left: 14px; top: 0; bottom: 0; width: 2px; background: var(--border) }
.log li:first-child::before { top: 50% } .log li:last-child::before { bottom: 50% } .log li:only-child::before { display: none }
.log li::after { content: ''; position: absolute; left: 10px; top: 50%; width: 10px; height: 10px; margin-top: -5px; border-radius: 50%; background: var(--card); box-shadow: inset 0 0 0 2px var(--hint-2) }
.log li:first-child::after { box-shadow: inset 0 0 0 3px var(--blue) }
.msg { flex: 1; min-width: 0; display: grid; line-height: 1.3 }
.msg b { font-size: 13px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.msg small { font-size: 11px; font-weight: 700; color: var(--hint) }
code { flex: none; padding: 2px 6px; border: 1px solid var(--border); border-radius: 6px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--hint) }
.more { font-size: 12px; font-weight: 800; color: var(--hint) } .more::after { display: none }
@media (max-width: 719px) { .un { left: 10px; right: 10px; width: auto; bottom: auto; top: calc(8px + var(--safe-t, 0px)) } .rest { display: none !important } }
.un-enter-active, .un-leave-active { transition: opacity .2s, transform .2s } .un-enter-from, .un-leave-to { opacity: 0; transform: translateX(-16px) }
@media (max-width: 719px) { .un-enter-from, .un-leave-to { transform: translateY(-12px) } }
</style>

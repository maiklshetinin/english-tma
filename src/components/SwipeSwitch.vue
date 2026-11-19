<script setup>
// Профиль ученика: блокировка свайпа вниз (не сворачивает приложение). См. composables/useTelegram.js → swipeLock.
import { swipeLock, setSwipeLock } from '../composables/useTelegram'
</script>
<template>
  <label class="card hs">
    <span class="tx"><b>Блокировать свайп вниз</b><small>Свайп вниз не сворачивает приложение — удобнее листать</small></span>
    <input type="checkbox" class="sw" :checked="swipeLock" aria-label="Блокировать свайп вниз" @change="setSwipeLock($event.target.checked)" />
  </label>
</template>
<style scoped>
.hs { display: flex; align-items: center; gap: 14px; cursor: pointer }
.tx { flex: 1; display: grid; gap: 2px; line-height: 1.3 } .tx b { font-size: 16px } .tx small { font-size: 13px; font-weight: 600; color: var(--hint) }
/* Переключатель как в Telegram (как у «Вибрации») */
.sw { appearance: none; -webkit-appearance: none; flex: none; width: 46px; height: 28px; margin: 0; border-radius: 14px; background: var(--border); position: relative; cursor: pointer; transition: background .15s }
.sw::after { content: ''; position: absolute; left: 3px; top: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: transform .15s }
.sw:checked { background: var(--green) } .sw:checked::after { transform: translateX(18px) }
</style>

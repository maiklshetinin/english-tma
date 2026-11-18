<script setup>
// Профиль ученика: выключатель звуков ответов в уроке («дзынь» — верно, «бум» — ошибка, как в Busuu). См. composables/useSfx.js → sfxOn.
import { sfxOn, setSfx, sfxResult } from '../composables/useSfx'
function flip(on) { setSfx(on); if (on) sfxResult(true) }          // включили — сразу слышно, как звучит
</script>
<template>
  <label class="card hs">
    <span class="tx"><b>Звуки ответов</b><small>«Дзынь», когда верно, и мягкий звук при ошибке</small></span>
    <input type="checkbox" class="sw" :checked="sfxOn" aria-label="Звуки ответов" @change="flip($event.target.checked)" />
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

<script setup>
// Версия приложения, метка коммита и время сборки (подставляются при сборке, см. vite.config.js).
const version = __APP_VERSION__, commit = __APP_COMMIT__
const built = new Date(__APP_BUILT__).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>
<template><p class="ver" :title="`Сборка ${built}`">v{{ version }} · {{ commit }} · {{ built }}</p></template>
<style scoped>.ver { margin: 4px 0 0; text-align: center; font-size: 12px; font-weight: 700; color: var(--hint-2); user-select: text }</style>

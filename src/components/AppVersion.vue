<script setup>
// Версия приложения и метка коммита (подставляются при сборке, см. vite.config.js).
const version = __APP_VERSION__, commit = __APP_COMMIT__
</script>
<template><p class="ver">v{{ version }} · {{ commit }}</p></template>
<style scoped>.ver { margin: 4px 0 0; text-align: center; font-size: 12px; font-weight: 700; color: var(--hint-2); user-select: text }</style>

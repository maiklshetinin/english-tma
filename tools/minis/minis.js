// Все шаблоны экранов живыми миниатюрами (ExerciseMini live) — их снимает tools/minis/shoot.py в public/minis/
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import '../../src/styles/theme.css'
import ExerciseMini from '../../src/components/ExerciseMini.vue'
import { TEMPLATES } from '../../src/utils/lesson'

const dark = new URLSearchParams(location.search).get('theme') === 'dark'
document.documentElement.dataset.theme = dark ? 'dark' : 'light'
const ids = TEMPLATES.map((t) => t.id)
createApp({
  render: () => h('div', { style: 'display:flex;flex-wrap:wrap;gap:16px;padding:16px' },
    ids.map((id) => h('div', { 'data-mini': id }, [h(ExerciseMini, { id, size: 'rail', live: true })]))),
}).use(createPinia()).mount('#app')
window.__minis = ids

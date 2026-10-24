import { createApp } from 'vue'
import App from './App.vue'
import './styles/theme.css'
import { initTelegram } from './composables/useTelegram'
initTelegram()
createApp(App).mount('#app')

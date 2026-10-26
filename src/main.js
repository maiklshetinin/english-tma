import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/theme.css'
import { initTelegram } from './composables/useTelegram'
import { createAppRouter } from './router'
initTelegram()
const router = createAppRouter()
createApp(App).use(createPinia()).use(router).mount('#app')      // Pinia раньше роутера: проверки роли в роутере читают стор входа

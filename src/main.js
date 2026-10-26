import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/theme.css'
import { initTelegram } from './composables/useTelegram'
import { linkStores } from './store/app'
initTelegram()
const app = createApp(App).use(createPinia())
linkStores()          // после подключения Pinia: смена роли возвращает экран на первую вкладку
app.mount('#app')

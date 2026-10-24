import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  base: '/english-tma/', // Обязательно имя вашего репозитория с слэшами по бокам
})

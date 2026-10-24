# Tutor TMA
npm install && npm run dev      # локальная разработка (откройте в браузере)
npm run build                   # сборка в dist/
Для Telegram: захостите dist/ по HTTPS (Vercel/Netlify/GitHub Pages) и укажите URL в @BotFather → /newapp или Menu Button.
Для теста на телефоне: ngrok http 5173 / cloudflared tunnel.

## Авторизация
- Фронт: `src/composables/useTelegramAuth.js` — берёт `Telegram.WebApp.initData`, шлёт `Authorization: tma <initData>`.
- Бэк: `server/validate-init-data.example.js` — проверка HMAC-подписи; роль и studentId определяются по user.id в БД.
- Переменная `VITE_API_URL` в `.env`; без неё приложение работает на mock-данных.
- Демо-переключатель ролей виден в `npm run dev` или с `?demo` в URL.

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Версия — из package.json; метка коммита — из GitHub Actions (GITHUB_SHA) или локально из git; без git будет "local".
// Показываются в «Профиле» (AppVersion.vue), чтобы было видно, какая сборка открыта.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const gitSha = () => { try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } }
const commit = (process.env.GITHUB_SHA || gitSha()).slice(0, 7) || 'local'

export default defineConfig({
  plugins: [vue()],
  base: '/english-tma/', // Обязательно имя вашего репозитория с слэшами по бокам
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },     // npm test (vitest)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
})

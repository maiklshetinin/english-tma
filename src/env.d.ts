/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

interface Window { Telegram?: { WebApp?: any } }

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_BOT_USERNAME?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Состояние панели разработчика (DevTools.vue): открыта ли, ширина справа / высота снизу, вкладка — запоминается в браузере.
// Открыть можно и из «Профиля» (кнопка «Панель разработчика»).
// Вкладку «Сеть» (журнал запросов с чтениями базы) убрали 18.11.2026 — это дубль Network в Chrome DevTools; чтения базы — во вкладке «Нагрузка».
import { reactive, watch } from 'vue'

const KEY = 'tutor-devtools'
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })()
const TABS = ['console', 'usage', 'server', 'visits', 'activity', 'ai']
/** Переход из «Заходов» в «Активность»: человек и день (DevActivity.vue раскроет его строки) */
export const devJump = reactive({ day: '', uid: '', n: 0 })
export const devtools = reactive({ open: !!saved.open, w: saved.w || 460, h: saved.h || 360, tab: TABS.includes(saved.tab) ? saved.tab : 'console' })
watch(devtools, () => { try { localStorage.setItem(KEY, JSON.stringify(devtools)) } catch { /* приватный режим */ } }, { deep: true })

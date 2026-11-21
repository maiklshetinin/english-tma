// Тема кода JSON (светлая / тёмная) — одна на всё приложение: карточка экрана, окно правки, общие настройки упражнения (21.11.2026)
import { ref } from 'vue'

const KEY = 'tma.jsonTheme'
export const jsonTheme = ref((() => { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' } })())
export function flipJsonTheme() { jsonTheme.value = jsonTheme.value === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(KEY, jsonTheme.value) } catch { /* приватный режим */ } }

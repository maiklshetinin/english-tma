// Тема кода JSON (светлая / тёмная) — одна на всё приложение: карточка экрана, окно правки, общие настройки упражнения (21.11.2026)
import { ref } from 'vue'

const KEY = 'tma.jsonTheme'
// 26.11.2026: третья — «Как VS Code» (vs, Solarized Light: кремовый фон, как у автора в VS Code)
export const JSON_THEMES = [['light', 'Светлая'], ['vs', 'Как VS Code'], ['dark', 'Тёмная']]
export const jsonTheme = ref((() => { try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'vs' ? v : 'light' } catch { return 'light' } })())
export function setJsonTheme(v) { jsonTheme.value = v; try { localStorage.setItem(KEY, v) } catch { /* приватный режим */ } }
export function flipJsonTheme() { jsonTheme.value = jsonTheme.value === 'dark' ? 'light' : jsonTheme.value === 'light' ? 'vs' : 'dark'; try { localStorage.setItem(KEY, jsonTheme.value) } catch { /* приватный режим */ } }

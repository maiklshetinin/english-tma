// Настройки алгоритма повторений (FSRS) — одни на всё приложение: Review и колоды (у каждого свои числа).
// Отдельный модуль без обращения к серверу, чтобы колоды (composables/useSrs) читали настройки, не таща за собой сеть.
// Загрузка и сохранение на сервере — stores/review.ts (loadAlgo, saveAlgo).
import { reactive } from 'vue'
import { ALGO_DEFAULT, type AlgoCfg } from '../utils/review'

export const ALGO_KEY = 'tma.review.algo.v1'
const saved = (): Partial<AlgoCfg> => { try { return JSON.parse(localStorage.getItem(ALGO_KEY) ?? 'null') ?? {} } catch { return {} } }
export const algo = reactive<AlgoCfg>({ ...ALGO_DEFAULT, ...saved() })
export const deckCfg = () => ({ retention: algo.deckRetention, maxDays: algo.deckMaxDays })

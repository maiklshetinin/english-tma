// Стикеры-закладки в расписании (в базе — урок с trial: true и без учеников): 5 цветов, как в пачке клейких закладок.
// c — плотный кончик, bg — полупрозрачный пластик. Последний выбранный цвет запоминается на устройстве:
// с кнопки над таблицей приклеивается стикер этого цвета.
import { ref } from 'vue'

export const STICKERS = [
  { id: 'blue', title: 'Голубой', c: '#1ea7ff', bg: '#a5dcff' },
  { id: 'green', title: 'Зелёный', c: '#5ee05a', bg: '#bff3bd' },
  { id: 'yellow', title: 'Жёлтый', c: '#f4f04a', bg: '#fbf9b7' },
  { id: 'pink', title: 'Розовый', c: '#ff5fa8', bg: '#ffbfdc' },
  { id: 'orange', title: 'Оранжевый', c: '#ff9a2e', bg: '#ffd7ab' },
]
const KEY = 'tma.stickerColor'
const DEF = 'yellow'
export const stickerOf = (id) => STICKERS.find((s) => s.id === id) ?? STICKERS.find((s) => s.id === DEF)
/** CSS-переменные цвета стикера: --c (кончик), --bg (пластик) */
export const stickerVars = (id) => { const s = stickerOf(id); return { '--c': s.c, '--bg': s.bg } }
export const lastSticker = ref((() => { try { const v = localStorage.getItem(KEY); return STICKERS.some((s) => s.id === v) ? v : DEF } catch { return DEF } })())
export function setLastSticker(id) { if (!STICKERS.some((s) => s.id === id)) return; lastSticker.value = id; try { localStorage.setItem(KEY, id) } catch { /* приватный режим */ } }

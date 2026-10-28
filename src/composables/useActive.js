// «Человек сейчас за приложением»: окно на экране и было движение мышью / нажатие / касание за последние 10 минут.
// Пока никого нет (вкладка в фоне, окно забыли открытым на ночь), приложение ничего не перечитывает с сервера —
// иначе открытые окна тратят дневной лимит чтений базы круглые сутки. Вернулся — onActive(fn) вызывает fn(сколько мс не было).
import { ref } from 'vue'

const IDLE = 10 * 60_000
export const active = ref(true)
let last = Date.now(), awaySince = 0
const subs = new Set()
/** Подписка на возвращение: fn(awayMs). Возвращает отписку. */
export function onActive(fn) { subs.add(fn); return () => subs.delete(fn) }

function check() {
  const now = Date.now(), a = document.visibilityState === 'visible' && now - last < IDLE
  if (a === active.value) return
  active.value = a
  if (!a) { awaySince = now; return }
  const away = now - awaySince
  subs.forEach(fn => { try { fn(away) } catch { /* — */ } })
}
let moveT = 0
const poke = () => { last = Date.now(); check() }
if (typeof document !== 'undefined') {
  for (const e of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus']) addEventListener(e, poke, { passive: true, capture: true })
  addEventListener('pointermove', () => { if (Date.now() - moveT > 5000) { moveT = Date.now(); poke() } }, { passive: true, capture: true })
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? poke() : check()))
  setInterval(check, 30_000)
}
/** Обновлять данные при возвращении, если человека не было хотя бы minAway мс (короткое переключение окон — не повод читать базу). */
export const refreshOnReturn = (load, minAway = 60_000) => onActive((away) => { if (away >= minAway) load() })

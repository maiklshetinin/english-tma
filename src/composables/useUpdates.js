// «Вышло обновление»: при сборке в dist/version.json пишутся метка сборки и последние коммиты (vite.config.js).
// Открытое приложение читает этот файл при запуске, раз в 5 минут и когда к нему вернулись; если сборка новее —
// показывается уведомление с заголовками новых коммитов (UpdateNotice.vue). «Позже» — до следующей сборки.
// Выключить у себя можно в «Профиле» → «Для разработчика» (на этом устройстве).
import { reactive, ref } from 'vue'

const MINE = __APP_COMMIT__
const OFF = 'tma.updatesOff', SKIP = 'tma.updateSkip'
const get = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* приватный режим */ } }

/** ready — { version, commit, items: [{ h, s, t, a }], more } или null (t — время коммита в секундах, a — автор) */
export const update = reactive({ ready: null })
export const updatesOn = ref(get(OFF) !== '1')
export function setUpdatesOn(on) { updatesOn.value = !!on; put(OFF, on ? null : '1'); if (on) check(); else update.ready = null }

/** Коммиты новее моего (по порядку из version.json, до моего), не больше 4 + сколько ещё. Каждое — отдельная узкая плашка, как уведомления в телефоне */
export function newer(log, mine) {
  const items = []
  for (const c of log || []) { if (c.h === mine) break; items.push(c) }
  return { items: items.slice(0, 4), more: Math.max(0, items.length - 4) }
}

export async function check() {
  if (MINE === 'local' || !updatesOn.value) return
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const v = await r.json()
    if (!v?.commit || v.commit === MINE) { update.ready = null; return }
    if (get(SKIP) === v.commit) return
    const { items, more } = newer(v.log, MINE)
    update.ready = { version: v.version, commit: v.commit, items: items.length ? items : [{ h: v.commit, s: 'Новая версия приложения' }], more }
  } catch { /* нет сети — проверим позже */ }
}

let timer = 0
export function startUpdates() {
  if (timer) return
  check()
  timer = setInterval(check, 5 * 60e3)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
}
export function later() { if (update.ready) put(SKIP, update.ready.commit); update.ready = null }
export function reloadApp() { location.reload() }

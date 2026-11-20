// Обновление по команде разработчика (17.11.2026): «Профиль → Для разработчика → Обновить у всех» — всем преподавателям в приложении
// (и себе) приходит { t: 'reload' } через live. Приложение ждёт, пока новая сборка появится на сайте (version.json от vite.config.js:
// GitHub Pages выкладывает не мгновенно), и тогда: человек не работает (вкладка в фоне или минуту ничего не делал) — тихо перезагружается;
// работает — плашка «Вышло обновление — Обновить» (UpdateBanner.vue), а как отвлечётся — обновится сам.
// Новой сборки за 10 минут так и не появилось — всё равно перезагружаем (вдруг файл версии не дошёл).
import { reactive } from 'vue'
import { onLive, liveSend } from './useLive'
import { idleFor } from './useActive'

export const MY_VER = __APP_COMMIT__
export const upd = reactive({ wait: false, ready: false, by: '' })
/** Версия сборки на сайте сейчас (commit) или null — файла нет (локальная разработка) */
export async function siteVer() {
  try { const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' }); return r.ok ? (await r.json()).commit ?? null : null } catch { return null }
}
/** «Свежая / старая» версия — одна логика для «Профиля → Версии в приложении» и кружков «Сейчас в приложении» (PresenceBar, 20.11.2026).
 *  ver.site — версия на сайте (loadSiteVer), свежая — она (нет файла — своя сборка); старая — хоть одна вкладка не на ней (нет версии — '?', тоже старая) */
export const ver = reactive({ site: '' })
export const loadSiteVer = () => siteVer().then((v) => { ver.site = v || '' })
export const freshVer = () => ver.site || MY_VER
export const isOldVer = (vers) => vers.some((v) => v !== freshVer())
/** Версии вкладок человека из «кто в приложении» (live.users) */
export const versOf = (users, uid) => [...new Set(users.filter((u) => u.uid === uid).map((u) => u.ver || '?'))]
const quiet = () => document.visibilityState !== 'visible' || idleFor() > 60_000
let poll = 0, idleT = 0
function ready() {
  upd.wait = false; upd.ready = true
  if (quiet()) return location.reload()
  idleT = setInterval(() => { if (quiet()) location.reload() }, 5000)
}
export function startUpdate(by = '') {
  upd.by = by
  if (upd.wait || upd.ready) return
  upd.wait = true
  const t0 = Date.now()
  const tick = async () => {
    const v = await siteVer()
    if (v === MY_VER && Date.now() - t0 < 10 * 60_000) return      // новая сборка ещё не на сайте — ждём
    clearInterval(poll); ready()
  }
  tick(); poll = setInterval(tick, 15_000)
}
export const reloadNow = () => { clearInterval(idleT); location.reload() }
/** Разработчик: обновить у всех преподавателей в приложении (и у себя) */
export const updateAll = () => liveSend({ t: 'reload' })
onLive('reload', (m) => startUpdate(m.by || ''))

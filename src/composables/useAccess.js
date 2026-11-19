// «Только просмотр» (17.11.2026): разработчик назначает преподавателю в «Профиле → Для разработчика → Права».
// Сервер сам не пускает записи (любой запрос, кроме чтения, — 403); здесь — чтобы приложение это показывало
// (плашка «Только просмотр», редактор курсов не пытается сохранять). Меняется сразу, без перезахода (живое соединение: access).
import { reactive } from 'vue'
import { request } from '../stores/api'
import { onLive } from './useLive'
import { fb } from '../firebase'
import { showToast } from './useToast'

export const access = reactive({ viewOnly: false, lessonsLock: false })          // lessonsLock — «уроки — только просмотр» (19.11.2026): нельзя только правки уроков в расписании
let ready = null
/** Узнать у сервера свои права (один раз после входа); ждать — accessReady() */
export function loadAccess() {
  ready = request('/me/access', undefined, 'Права').then((r) => { access.viewOnly = r.viewOnly === true; access.lessonsLock = r.lessonsLock === true }).catch(() => { /* старый сервер — как раньше */ })
  return ready
}
export const accessReady = () => ready ?? Promise.resolve()
onLive('access', ({ uid, viewOnly, lessonsLock }) => {
  if (uid !== fb?.currentUser?.uid) return
  const lk = lessonsLock === true
  if (access.viewOnly === viewOnly && access.lessonsLock === lk) return
  const was = { ...access }
  access.viewOnly = viewOnly; access.lessonsLock = lk
  if (was.viewOnly !== viewOnly) showToast(viewOnly ? 'Вам включили режим «только просмотр»' : 'Режим «только просмотр» выключен — можно править')
  else showToast(lk ? 'Уроки в расписании — только просмотр' : 'Уроки в расписании снова можно менять')
})

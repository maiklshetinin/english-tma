// «Только просмотр» (17.11.2026): разработчик назначает преподавателю в «Профиле → Для разработчика → Права».
// Сервер сам не пускает записи (любой запрос, кроме чтения, — 403); здесь — чтобы приложение это показывало
// (плашка «Только просмотр», редактор курсов не пытается сохранять). Меняется сразу, без перезахода (живое соединение: access).
import { reactive } from 'vue'
import { request } from '../stores/api'
import { onLive } from './useLive'
import { fb } from '../firebase'
import { showToast } from './useToast'

export const access = reactive({ viewOnly: false })
let ready = null
/** Узнать у сервера свои права (один раз после входа); ждать — accessReady() */
export function loadAccess() {
  ready = request('/me/access', undefined, 'Права').then((r) => { access.viewOnly = r.viewOnly === true }).catch(() => { /* старый сервер — как раньше */ })
  return ready
}
export const accessReady = () => ready ?? Promise.resolve()
onLive('access', ({ uid, viewOnly }) => {
  if (uid !== fb?.currentUser?.uid || access.viewOnly === viewOnly) return
  access.viewOnly = viewOnly
  showToast(viewOnly ? 'Вам включили режим «только просмотр»' : 'Режим «только просмотр» выключен — можно править')
})

// Откуда берётся аватарка: photoUrl (Telegram) → через сервер по tgId → инициал на цветном фоне.
//  • Своя аватарка (ученик/преподаватель, открывший приложение) приходит из Telegram.WebApp.initDataUnsafe.user.photo_url —
//    stores/auth.ts кладёт её в auth.teacher / запись ученика.
//  • Чужие аватарки (преподаватель видит учеников) Telegram в Mini App не отдаёт: бэкенд берёт их через Bot API
//    (getUserProfilePhotos → getFile) и отдаёт по GET /avatar/:tgId — см. server/avatar.example.js.
//  • Ученик, который ещё не входил (есть только @ник): photoUrl — адрес фото со страницы t.me, он временный и со временем
//    перестаёт открываться. Тогда берём свежее фото через сервер: GET /avatar/nick/:username (server/tgphoto.ts → nickPhoto).
// Порядок: photoUrl → по tgId → по нику → инициал. Не открывшийся адрес запоминаем (markBad) и берём следующий.
import { reactive } from 'vue'
import { apiFetch } from '../firebase'

const API = import.meta.env.VITE_API_URL
const blobs = reactive({})              // 'id:<tgId>' / 'nick:<ник>' → blob:URL
const bad = reactive({})                // адреса, которые не открылись
const asked = new Set()
function loadViaApi(key, path) {
  if (asked.has(key)) return
  asked.add(key)
  Promise.resolve().then(() => apiFetch(path, { headers: {} }))
    .then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then(b => { blobs[key] = URL.createObjectURL(b) })
    .catch(() => { /* нет фото или нет доступа — останется инициал */ })
}
/** Картинка не загрузилась — больше её не предлагаем, Avatar возьмёт следующий источник. */
export const markBad = (url) => { if (url) bad[url] = true }
export function avatarSrc(s) {
  if (!s) return ''
  if (s.photoUrl && !bad[s.photoUrl]) return s.photoUrl
  if (!API) return ''
  const via = s.tgId ? ['id:' + s.tgId, `/avatar/${s.tgId}`] : s.username ? ['nick:' + s.username, `/avatar/nick/${encodeURIComponent(s.username)}`] : null
  if (!via) return ''
  loadViaApi(via[0], via[1])
  const b = blobs[via[0]]
  return b && !bad[b] ? b : ''
}

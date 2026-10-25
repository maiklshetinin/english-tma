// Откуда берётся аватарка: photo_url (Telegram) → через сервер по tgId → инициал на цветном фоне.
//  • Своя аватарка (ученик/преподаватель, открывший приложение) приходит из Telegram.WebApp.initDataUnsafe.user.photo_url —
//    useTelegramAuth кладёт её в state.teacher / запись ученика.
//  • Чужие аватарки (преподаватель видит учеников) Telegram в Mini App не отдаёт: бэкенд берёт их через Bot API
//    (getUserProfilePhotos → getFile) и отдаёт по GET /avatar/:tgId — см. server/avatar.example.js.
import { reactive } from 'vue'
import { apiFetch } from './useTelegramAuth'

const API = import.meta.env.VITE_API_URL
const blobs = reactive({})              // tgId → blob:URL
const asked = new Set()
function loadViaApi(id) {
  if (asked.has(id)) return
  asked.add(id)
  Promise.resolve().then(() => apiFetch(`/avatar/${id}`, { headers: {} }))
    .then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then(b => { blobs[id] = URL.createObjectURL(b) })
    .catch(() => { /* нет фото или нет доступа — останется инициал */ })
}
export function avatarSrc(s) {
  if (!s) return ''
  if (s.photo_url) return s.photo_url
  if (s.tgId && API) { loadViaApi(s.tgId); return blobs[s.tgId] || '' }
  return ''
}

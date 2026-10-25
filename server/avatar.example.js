// Пример отдачи аватарок учеников через Bot API (Node 18+, Express). Telegram Mini App отдаёт фото только самого пользователя
// (initDataUnsafe.user.photo_url); фото остальных получает бот: getUserProfilePhotos → getFile → скачать файл.
// Ссылка на файл содержит токен бота — наружу её отдавать нельзя, поэтому фото проксируется этим маршрутом.
// Фронт (src/composables/useAvatar.js) запрашивает GET /avatar/:tgId с заголовком Authorization: tma <initData>.
import { validateInitData } from './validate-init-data.example.js'

const BOT = process.env.BOT_TOKEN
const api = (m, q) => fetch(`https://api.telegram.org/bot${BOT}/${m}?${new URLSearchParams(q)}`).then(r => r.json())

export async function avatarRoute(req, res) {
  const user = validateInitData((req.headers.authorization || '').replace(/^tma /, ''), BOT)
  if (!user) return res.sendStatus(401)
  // TODO: разрешайте только tgId, которые есть в вашей БД (ученики этого преподавателя) — иначе это открытый прокси к фото
  const id = Number(req.params.tgId)
  const photos = await api('getUserProfilePhotos', { user_id: id, limit: 1 })
  const sizes = photos.result?.photos?.[0]
  if (!sizes) return res.sendStatus(404)
  const file = await api('getFile', { file_id: sizes[0].file_id })           // sizes[0] — самый маленький (~160px), хватает для аватарки
  const img = await fetch(`https://api.telegram.org/file/bot${BOT}/${file.result.file_path}`)
  res.set('Content-Type', img.headers.get('content-type') || 'image/jpeg').set('Cache-Control', 'private, max-age=86400')
  res.send(Buffer.from(await img.arrayBuffer()))
}
// app.get('/avatar/:tgId', avatarRoute)

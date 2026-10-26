// Ссылки на фото и озвучку карточек: только https и только Google (Диск, Cloud Storage, Firebase Storage).
// Файл чистый, без импортов: его используют и сервер (проверка при сохранении колоды), и фронт (проверка при вводе и импорте).
export const MEDIA_HOSTS = [
  'drive.google.com', 'drive.usercontent.google.com', 'googleusercontent.com',
  'storage.googleapis.com', 'storage.cloud.google.com', 'firebasestorage.googleapis.com',
]

export function isMediaUrl(s: unknown): boolean {
  if (typeof s !== 'string') return false
  let u: URL
  try { u = new URL(s.trim()) } catch { return false }
  const h = u.hostname.toLowerCase()
  return u.protocol === 'https:' && MEDIA_HOSTS.some((d) => h === d || h.endsWith('.' + d))      // bucket.storage.googleapis.com, lh3.googleusercontent.com …
}

// Фото и озвучка карточек. Подходит любая https-ссылка (проверка — server/media.ts); прямая ссылка на файл остаётся как есть.
// Исключение — Google Диск («Поделиться» → доступ по ссылке): …/file/d/<id>/view, …/open?id=<id>, …/uc?id=<id> открывают страницу просмотра,
// поэтому здесь они превращаются в прямые адреса файла.
export { isMediaUrl } from '../../server/media'

/** id файла в ссылке Google Диска; null, если это не ссылка на Диск. */
export function driveId(url: string): string | null {
  let u: URL
  try { u = new URL(url.trim()) } catch { return null }
  if (u.hostname !== 'drive.google.com' && u.hostname !== 'drive.usercontent.google.com') return null
  return u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id')
}

/** Адрес картинки для <img>. Для Диска — lh3.googleusercontent.com/d/<id>: он отдаёт сам файл, а не страницу просмотра. */
export const imageSrc = (url?: string): string => {
  if (!url) return ''
  const id = driveId(url)
  return id ? `https://lh3.googleusercontent.com/d/${id}` : url.trim()
}

/** Адрес звука для <audio>. Для Диска — прямая загрузка (файл должен быть открыт «всем, у кого есть ссылка»). */
export const audioSrc = (url?: string): string => {
  if (!url) return ''
  const id = driveId(url)
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url.trim()
}

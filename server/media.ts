// Ссылки на фото и озвучку карточек: любой адрес, но только https (http браузер всё равно блокирует на https-странице,
// а javascript:, data: и подобное не нужны). Файл чистый, без импортов: его используют и сервер (проверка при сохранении колоды),
// и фронт (проверка при вводе и импорте).
export function isMediaUrl(s: unknown): boolean {
  if (typeof s !== 'string') return false
  try { return new URL(s.trim()).protocol === 'https:' } catch { return false }
}

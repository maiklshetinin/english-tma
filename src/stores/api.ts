// Запросы за путём, колодами и повторениями. Типы ответов — из server/types.ts.
import type { ContentResponse, SrsResponse } from '../../server/types'
import { apiRequest } from '../firebase'

/** Запрос к серверу: сетевая ошибка → понятный текст, код ответа → сообщение. */
export async function request<T>(path: string, opts: RequestInit | undefined, what: string): Promise<T> {
  const r = await apiRequest(path, opts)
  if (!r.ok) {
    throw new Error(r.status === 403 ? 'Нет прав на это действие' : r.status === 404 ? 'Не найдено — данные обновлены' : r.status === 409 ? 'Сейчас так нельзя — данные обновлены'
      : r.status === 413 ? 'Слишком много данных' : r.status === 400 ? `${what}: сервер не принял данные` : `${what} (${r.status})`)
  }
  return r.json() as Promise<T>
}
export const put = (path: string, body: unknown, what: string) => request(path, { method: 'PUT', body: JSON.stringify(body) }, what)
export const post = <T = unknown>(path: string, body: unknown, what: string) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }, what)
export const del = (path: string, what: string) => request(path, { method: 'DELETE' }, what)
export const enc = encodeURIComponent

export const fetchContent = () => request<ContentResponse>('/content', undefined, 'Не удалось загрузить путь и колоды')
export const fetchSrs = () => request<SrsResponse>('/srs', undefined, 'Не удалось загрузить прогресс слов')

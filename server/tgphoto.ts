// Фото по нику Telegram. Bot API не умеет искать человека по @нику (только по числовому id, и то после его входа),
// поэтому берём фото с публичной страницы https://t.me/<ник> — той, что открывается в браузере. Фото там есть, только если
// в настройках приватности Telegram у человека «Фото профиля» видно всем. Нет фото / страница не открылась → пустая строка.
const NICK = /^[A-Za-z][A-Za-z0-9_]{4,31}$/

/** «@maria», «maria», «https://t.me/maria», «t.me/maria?start=1» → «maria» (без проверки формата) */
export function cleanUsername(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0]
}
export const isUsername = (s: string) => NICK.test(s)

/** Адрес картинки из html страницы t.me; пусто, если у профиля нет открытого фото */
export function parsePhoto(html: string): string {
  const img = /<img\b[^>]*\bclass="[^"]*tgme_page_photo_image[^"]*"[^>]*>/i.exec(html)?.[0]
  const src = img && /\bsrc="([^"]+)"/i.exec(img)?.[1]?.replace(/&amp;/g, '&')
  if (!src) return ''
  try { const u = new URL(src); return u.protocol === 'https:' && /(^|\.)(telesco\.pe|cdn-telegram\.org|telegram\.org)$/.test(u.hostname) ? u.href : '' } catch { return '' }
}

export async function photoByUsername(username: string, fetchFn: typeof fetch = fetch): Promise<string> {
  if (!isUsername(username)) return ''
  const r = await fetchFn(`https://t.me/${username}`, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; tutor-tma)' } })
  return r.ok ? parsePhoto(await r.text()) : ''
}

/** Картинка аватарки для ответа сервера. */
export interface Img { type: string; body: Uint8Array }

// Фото по нику — свежее, через сервер. Адрес фото со страницы t.me временный: Telegram со временем его отключает,
// поэтому сохранённый при добавлении ученика photoUrl перестаёт открываться. Тогда приложение просит фото здесь:
// сервер заново читает страницу t.me и отдаёт саму картинку. Только для ников, которые есть у учеников (не открытый прокси),
// в памяти держим 6 ч (нет фото — 30 мин), чтобы не дёргать t.me на каждый показ.
export function nickPhoto(deps: { isKnown: (username: string) => Promise<boolean>; find?: typeof photoByUsername; fetchFn?: typeof fetch; now?: () => number }) {
  const { isKnown, find = photoByUsername, fetchFn = fetch, now = Date.now } = deps
  const HIT = 6 * 3600_000, MISS = 30 * 60_000, MAX = 500
  const cache = new Map<string, { at: number; img: Img | null }>()
  return async (raw: string): Promise<Img | null> => {
    const u = cleanUsername(raw), key = u.toLowerCase()
    if (!isUsername(u)) return null
    const hit = cache.get(key)
    if (hit && now() - hit.at < (hit.img ? HIT : MISS)) return hit.img
    if (!(await isKnown(u))) return null
    let img: Img | null = null
    try {
      const url = await find(u, fetchFn)
      if (url) {
        const r = await fetchFn(url, { signal: AbortSignal.timeout(5000) })
        const type = r.headers.get('content-type') || ''
        if (r.ok && /^image\//.test(type)) img = { type, body: new Uint8Array(await r.arrayBuffer()) }
      }
    } catch { /* t.me не ответил — без фото, попробуем позже */ }
    cache.delete(key); cache.set(key, { at: now(), img })
    if (cache.size > MAX) cache.delete(cache.keys().next().value!)
    return img
  }
}

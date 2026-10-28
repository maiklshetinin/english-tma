// Видео-кружки и фото курсов — в S3 (AWS или совместимое: Backblaze B2, Yandex Object Storage, Cloudflare R2…).
//  • Загрузка — через наш сервер: браузер шлёт файл сюда, сервер потоком (без чтения в память) кладёт его в бакет.
//    Так в бакете не нужна настройка CORS, а ключи хранилища никогда не попадают в браузер.
//  • Просмотр: бакет приватный, сервер выдаёт временные ссылки (GET, 6 ч) — <video> играет по ним напрямую из хранилища.
//  • Ключ файла: t/<кто загрузил>/c/<курс>/<случайное>.<расширение>. Пространство пока общее: любой преподаватель видит
//    и удаляет файлы курсов (как и сами курсы); папка по загрузившему — задел на разделение (claude/multi-tutor-plan.md).
// Переменные окружения: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY и S3_ENDPOINT (если не AWS).
import { randomBytes } from 'node:crypto'
import type { Readable } from 'node:stream'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { fail } from './login.js'

export interface StorageEnv { S3_BUCKET?: string; S3_REGION?: string; S3_ENDPOINT?: string; S3_ACCESS_KEY_ID?: string; S3_SECRET_ACCESS_KEY?: string }
type Sign = (client: S3Client, cmd: GetObjectCommand, expiresIn: number) => Promise<string>
type Put = (client: S3Client, cmd: PutObjectCommand) => Promise<unknown>
export const VIDEO_MAX = 200 * 1024 * 1024, IMAGE_MAX = 30 * 1024 * 1024        // фото — как есть, без сжатия (с телефона обычно 2–10 МБ)
const TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' }
export const safe = (s: string) => String(s).replace(/[^\w-]/g, '_').slice(0, 64)
export const ownPrefix = (uid: string) => `t/${safe(uid)}/`
/** Ключ из нашего хранилища курсов (а не произвольный путь в бакете) */
export const isOurKey = (k: string) => /^t\/[\w-]{1,64}\/c\/[\w-]{1,64}\/[\w-]+\.\w{2,5}$/.test(k) && k.length <= 300

export function makeStorage(env: StorageEnv, sign: Sign = (c, cmd, e) => getSignedUrl(c, cmd, { expiresIn: e }), put: Put = (c, cmd) => c.send(cmd)) {
  const { S3_BUCKET: Bucket, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env
  const ready = !!(Bucket && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY)
  const client = ready ? new S3Client({
    region: S3_REGION || 'us-east-1',
    ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT, forcePathStyle: true } : {}),
    credentials: { accessKeyId: S3_ACCESS_KEY_ID!, secretAccessKey: S3_SECRET_ACCESS_KEY! },
    // без лишних контрольных сумм в ссылке: иначе часть совместимых хранилищ и браузер не договорятся
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  }) : null
  const need = () => { if (!client) throw fail(503, 'storage not configured'); return client }
  const own = (_uid: string, key: unknown): string => {
    const k = String(key ?? '')
    if (!isOurKey(k)) throw fail(403, 'foreign key')
    return k
  }

  return {
    ready,
    /** Загрузить видео или фото потоком: query { courseId, type }, размер — из Content-Length. → { key } */
    async upload(uid: string, query: unknown, body: Readable, length: unknown) {
      const c = need(), q = (query ?? {}) as { courseId?: unknown; type?: unknown }
      const type = String(q.type ?? '').split(';')[0].trim().toLowerCase(), courseId = q.courseId, ext = TYPES[type]
      if (!ext) throw fail(400, 'video or image only (mp4, webm, mov, jpg, png, webp)')
      const n = Number(length)
      if (!Number.isInteger(n) || n <= 0) throw fail(411, 'length required')
      if (n > (type.startsWith('image/') ? IMAGE_MAX : VIDEO_MAX)) throw fail(413, 'file too big')
      const course = safe(String(courseId ?? ''))
      if (!course) throw fail(400, 'courseId required')
      const key = `${ownPrefix(uid)}c/${course}/${Date.now().toString(36)}${randomBytes(6).toString('hex')}.${ext}`
      await put(c, new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: type, ContentLength: n }))
      return { key }
    },
    /** Временные ссылки на просмотр: { keys: [...] } → { urls: { key: url } }. Только ключи курсов (t/…/c/…). */
    async viewUrls(uid: string, input: unknown) {
      const c = need(), keys = (input as { keys?: unknown } | null)?.keys
      if (!Array.isArray(keys) || keys.length > 200) throw fail(400, 'keys required')
      const urls: Record<string, string> = {}
      for (const k of new Set(keys.map((x) => own(uid, x)))) urls[k] = await sign(c, new GetObjectCommand({ Bucket, Key: k }), 6 * 3600)
      return { urls }
    },
    /** Удалить файл курса (из курса убрали кружок / фото). */
    async remove(uid: string, key: unknown) {
      const c = need(), k = own(uid, key)
      await c.send(new DeleteObjectCommand({ Bucket, Key: k }))
    },
  }
}

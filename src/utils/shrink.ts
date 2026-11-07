// Фото экранов урока — как в Busuu: главное фото экрана 16:9 (как видео), фото варианта ответа 3:2, обложка урока 1:1 (кругом).
// Перед сохранением обрезаем по центру под эти пропорции и сжимаем (WebP, иначе JPEG) — хранилище не забиваем.
export const PHOTO = {
  main: { w: 1280, h: 720, min: [640, 360] as const, label: '16:9, лучше от 1280×720' },
  opt: { w: 600, h: 400, min: [300, 200] as const, label: '3:2, лучше от 600×400' },
  cover: { w: 480, h: 480, min: [160, 160] as const, label: '1:1, лучше от 480×480' },      // обложка урока — кругом
}
export type PhotoKind = keyof typeof PHOTO

/** Часть картинки по центру с нужными пропорциями: [sx, sy, sw, sh] */
export function cropBox(w: number, h: number, ratio: number): [number, number, number, number] {
  if (w / h > ratio) { const sw = Math.round(h * ratio); return [Math.round((w - sw) / 2), 0, sw, h] }
  const sh = Math.round(w / ratio); return [0, Math.round((h - sh) / 2), w, sh]
}
/** Размер на выходе: не больше цели, не увеличиваем маленькое */
export function outSize(sw: number, sh: number, tw: number, th: number): [number, number] {
  const k = Math.min(1, tw / sw, th / sh); return [Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k))]
}

const blob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q))

/** Обрезать и сжать фото. Возвращает новый файл и исходный размер (чтобы предупредить о маленьком фото). GIF и SVG не трогаем. */
export async function shrinkPhoto(f: File, kind: PhotoKind): Promise<{ file: File; w: number; h: number; small: boolean }> {
  if (!/^image\/(jpe?g|png|webp|heic|heif|bmp)$/i.test(f.type) || typeof createImageBitmap !== 'function') return { file: f, w: 0, h: 0, small: false }
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(f) } catch { return { file: f, w: 0, h: 0, small: false } }
  const P = PHOTO[kind], [sx, sy, sw, sh] = cropBox(bmp.width, bmp.height, P.w / P.h), [ow, oh] = outSize(sw, sh, P.w, P.h)
  const c = document.createElement('canvas'); c.width = ow; c.height = oh
  const g = c.getContext('2d'); if (!g) return { file: f, w: bmp.width, h: bmp.height, small: false }
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, sx, sy, sw, sh, 0, 0, ow, oh); bmp.close?.()
  const b = (await blob(c, 'image/webp', 0.82)) ?? (await blob(c, 'image/jpeg', 0.85))
  const small = sw < P.min[0] || sh < P.min[1]
  if (!b || (b.size >= f.size && sw === bmp.width && sh === bmp.height)) return { file: f, w: sw, h: sh, small }   // уже меньше и в пропорциях
  const ext = b.type === 'image/webp' ? 'webp' : 'jpg'
  return { file: new File([b], f.name.replace(/\.\w+$/, '') + '.' + ext, { type: b.type }), w: sw, h: sh, small }
}

// Счёт за месяц для ученика: проведённые уроки месяца (дата, время, цена) и сумма к оплате.
// Текст — для отправки в Telegram, картинка PNG или PDF — для «Скачать».
// PDF — лёгкий, без библиотек: внутри одна картинка счёта (JPEG) на листе A4.
import { fmtMoney } from './price'

export interface ReceiptLine { date: string; hour: number; minute?: number; price: number }
export interface Receipt { month: string; student: string; teacher?: string; lines: ReceiptLine[] }

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const pad = (n: number) => String(n).padStart(2, '0')

/** «Октябрь 2026» */
export const monthTitle = (month: string) => { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}` }
/** «7 окт, вт · 18:00» */
export const lineDate = (l: ReceiptLine) => { const d = new Date(l.date + 'T12:00'); return `${d.getDate()} ${MON[d.getMonth()]}, ${DOW[d.getDay()]} · ${pad(l.hour)}:${pad(l.minute ?? 0)}` }
export const receiptTotal = (r: Receipt) => r.lines.reduce((s, l) => s + l.price, 0)
const lessonsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'урок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'урока' : 'уроков')
export const receiptCount = (r: Receipt) => `${r.lines.length} ${lessonsWord(r.lines.length)}`
/** Имя файла: schet-2026-10-marat.png / .pdf (латиница — чтобы имя не ломалось при скачивании) */
export const receiptFile = (r: Receipt, ext: 'png' | 'pdf' = 'png') => {
  const tr: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' }
  const slug = [...r.student.toLowerCase()].map((c) => tr[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `schet-${r.month}${slug ? '-' + slug : ''}.${ext}`
}

/** Текст счёта для Telegram. */
export function receiptText(r: Receipt): string {
  return [
    `🧾 Счёт за ${monthTitle(r.month).toLowerCase()}`,
    `Ученик: ${r.student}`,
    ...(r.teacher ? [`Преподаватель: ${r.teacher}`] : []),
    '',
    ...r.lines.map((l) => `${lineDate(l)} — ${fmtMoney(l.price)}`),
    '',
    `Проведено: ${receiptCount(r)}`,
    `К оплате: ${fmtMoney(receiptTotal(r))}`,
  ].join('\n')
}

/** Счёт на холсте, как бумажный: заголовок, строки с точками до цены, сумма к оплате. */
function draw(r: Receipt, font: string): HTMLCanvasElement {
  const W = 360, S = 3, PAD = 24, ROW = 26
  const H = PAD + 30 + 20 + (r.teacher ? 20 : 0) + 22 + r.lines.length * ROW + 22 + 26 + 34 + PAD
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S
  const g = c.getContext('2d'); if (!g) throw new Error('canvas')
  g.scale(S, S)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
  const text = (t: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'left') => {
    g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y)
  }
  const dash = (y: number) => { g.strokeStyle = '#d6d6d6'; g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(PAD, y); g.lineTo(W - PAD, y); g.stroke(); g.setLineDash([]) }
  let y = PAD + 22
  text('Счёт', PAD, y, 22, 900, '#3c3c3c'); text(monthTitle(r.month), W - PAD, y, 15, 800, '#1cb0f6', 'right')
  y += 22; text(`Ученик: ${r.student}`, PAD, y, 13, 700, '#777777')
  if (r.teacher) { y += 20; text(`Преподаватель: ${r.teacher}`, PAD, y, 13, 700, '#777777') }
  y += 14; dash(y); y += 8
  for (const l of r.lines) {
    y += ROW
    const left = lineDate(l), price = fmtMoney(l.price)
    text(left, PAD, y - 8, 14, 700, '#3c3c3c'); text(price, W - PAD, y - 8, 14, 800, '#3c3c3c', 'right')
    g.font = `700 14px ${font}`; const x1 = PAD + g.measureText(left).width + 6; g.font = `800 14px ${font}`; const x2 = W - PAD - g.measureText(price).width - 6
    if (x2 > x1) { g.fillStyle = '#cfcfcf'; for (let x = x1; x < x2; x += 5) g.fillRect(x, y - 11, 1.5, 1.5) }
  }
  y += 8; dash(y)
  y += 22; text('Проведено', PAD, y, 13, 700, '#777777'); text(receiptCount(r), W - PAD, y, 13, 800, '#777777', 'right')
  y += 30; text('К оплате', PAD, y, 18, 900, '#3c3c3c'); text(fmtMoney(receiptTotal(r)), W - PAD, y, 22, 900, '#58a700', 'right')
  return c
}
const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error(type))), type, q))

/** Картинка счёта (PNG). */
export const receiptPng = (r: Receipt, font = 'system-ui, sans-serif') => blobOf(draw(r, font), 'image/png')

/** PDF счёта: та же картинка (JPEG) по центру листа A4 сверху. */
export async function receiptPdf(r: Receipt, font = 'system-ui, sans-serif'): Promise<Blob> {
  const c = draw(r, font)
  const jpg = new Uint8Array(await (await blobOf(c, 'image/jpeg', 0.9)).arrayBuffer())
  return new Blob([jpegPdf(jpg, c.width, c.height)], { type: 'application/pdf' })
}

/** Минимальный PDF из одной JPEG-картинки: A4 (595×842 pt), картинка шириной 420 pt по центру, отступ сверху 56 pt. */
export function jpegPdf(jpg: Uint8Array, w: number, h: number): Uint8Array<ArrayBuffer> {
  const PW = 595, PH = 842, IW = 420, IH = Math.min(PH - 112, Math.round(IW * h / w)), X = (PW - IW) / 2, Y = PH - 56 - IH
  const enc = new TextEncoder(), parts: Uint8Array[] = [], offs: number[] = []
  let len = 0
  const put = (x: string | Uint8Array) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length }
  const obj = (n: number, body: string) => { offs[n] = len; put(`${n} 0 obj\n${body}\nendobj\n`) }
  const cmd = `q ${IW} 0 0 ${IH} ${X} ${Y} cm /Im0 Do Q`
  put('%PDF-1.4\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`)
  obj(4, `<< /Length ${cmd.length} >>\nstream\n${cmd}\nendstream`)
  offs[5] = len
  put(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`)
  put(jpg); put('\nendstream\nendobj\n')
  const xref = len
  put(`xref\n0 6\n0000000000 65535 f \n${offs.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`)
  put(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(len); let p = 0
  for (const b of parts) { out.set(b, p); p += b.length }
  return out
}

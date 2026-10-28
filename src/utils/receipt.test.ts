// Счёт за месяц: текст для Telegram, сумма, имя файла, PDF.
import { describe, expect, it } from 'vitest'
import { receiptText, receiptTotal, receiptFile, lineDate, monthTitle, receiptCount, jpegPdf } from './receipt'

const r = { month: '2026-10', student: 'Марат', teacher: 'Анна', lines: [{ date: '2026-10-06', hour: 18, minute: 0, price: 700 }, { date: '2026-10-13', hour: 18, minute: 30, price: 1500 }] }

describe('receipt', () => {
  it('строка: дата, день недели, время', () => { expect(lineDate(r.lines[1])).toBe('13 окт, вт · 18:30') })
  it('итог и число уроков', () => { expect(receiptTotal(r)).toBe(2200); expect(receiptCount(r)).toBe('2 урока'); expect(receiptCount({ ...r, lines: [r.lines[0]] })).toBe('1 урок') })
  it('текст для Telegram', () => {
    const t = receiptText(r)
    expect(t.split('\n')[0]).toBe('🧾 Счёт за октябрь 2026')
    expect(t).toContain('Ученик: Марат'); expect(t).toContain('Преподаватель: Анна')
    expect(t).toContain('6 окт, вт · 18:00 — 700'); expect(t).toMatch(/К оплате: 2\s200$/)
  })
  it('без преподавателя — без строки', () => { expect(receiptText({ ...r, teacher: '' })).not.toContain('Преподаватель') })
  it('имя файла латиницей', () => { expect(receiptFile(r)).toBe('schet-2026-10-marat.png'); expect(receiptFile(r, 'pdf')).toBe('schet-2026-10-marat.pdf'); expect(monthTitle('2026-01')).toBe('Январь 2026') })
  it('PDF: заголовок, картинка JPEG, таблица xref с верными смещениями', () => {
    const jpg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])
    const pdf = jpegPdf(jpg, 1080, 600), txt = new TextDecoder('latin1').decode(pdf)
    expect(txt.startsWith('%PDF-1.4')).toBe(true); expect(txt.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(txt).toContain('/Filter /DCTDecode /Length 7'); expect(txt).toContain('/MediaBox [0 0 595 842]')
    const offs = [...txt.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => +m[1])
    expect(offs).toHaveLength(5)
    offs.forEach((o, i) => expect(txt.slice(o, o + 7)).toBe(`${i + 1} 0 obj`))
    expect(txt.slice(+txt.match(/startxref\n(\d+)/)![1], +txt.match(/startxref\n(\d+)/)![1] + 4)).toBe('xref')
  })
})

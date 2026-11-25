// «Красный Мерфи» (25.11.2026): данные экрана kind 'mf' — один тип, несколько видов (mode).
//  mode: info — объяснение (разделы A, B, C… в opts: w — буква, t — текст **жирный**, image — фото из книги, video — кружок преподавателя);
//        write (по умолчанию) — строки: q — задание, a — ответ (варианты через /), ex — образец, r — реплика собеседника, pre — начало строки, h — подсказка справа;
//        gaps — пропуски прямо в предложении: q с [ответом] (несколько в строке);
//        match — сопоставить: rows — 1, 2, 3…, opts — A, B, C…; a — буква;
//        order — слова в скобках плашками: q «(is / working / Ben / today)», тап — слово в строку.
//  Общее: no — номер «17.1», head — задание (**жирный**, ==маркер==, !!красный!!), note — пояснение серым, who — имя собеседника (фото — image),
//  hints — плашки-подсказки у поля («Have you ever»), banks — рамки со словами ({ t: «it’s …», w: слова, x: уже использованы в образце }),
//  two — на планшете в две колонки, inl — задание и поле в одну строку, post — знак в конце строки («?»), copy — кнопка «Скопировать»,
//  below — плашки слов (order) под полем, а не в скобках. opts с фото и mode write — сетка картинок 1, 2, 3…
import { gapList, gapOk } from '../../utils/lesson'

export const MF_MODES = ['info', 'write', 'gaps', 'match', 'order'] as const
export const MF_ROWS = 16, MF_OPTS = 8
const S = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.slice(0, n) : undefined)
const L = (v: unknown, n: number, m: number) => (Array.isArray(v) ? v.map((x) => S(x, m)).filter(Boolean).slice(0, n) as string[] : [])

/** Поля «Мёрфи» из сырого объекта (JSON экрана, пресет): только знакомые и нужного вида */
export function mfClean(o: any) {
  const s: any = {}
  if (MF_MODES.includes(o?.mode) && o.mode !== 'write') s.mode = o.mode
  for (const [k, n] of [['no', 8], ['who', 30], ['post', 4]] as const) { const v = S(o?.[k], n); if (v) s[k] = v }
  for (const k of ['two', 'inl', 'copy', 'below']) if (o?.[k] === true) s[k] = true
  const h = L(o?.hints, 6, 40); if (h.length) s.hints = h
  if (Array.isArray(o?.banks)) { const b = o.banks.slice(0, 3).map((x: any) => ({ t: S(x?.t, 30) ?? '', w: L(x?.w, 14, 40), x: L(x?.x, 14, 40) })).filter((x: any) => x.w.length); if (b.length) s.banks = b }
  if (Array.isArray(o?.rows)) s.rows = o.rows.slice(0, MF_ROWS).filter((x: any) => x && typeof x === 'object').map((x: any) => {
    const r: any = { q: S(x.q, 300) ?? '' }
    for (const [k, n] of [['a', 300], ['r', 40], ['pre', 30], ['h', 40]] as const) { const v = S(x[k], n); if (v) r[k] = v }
    if (x.ex === true) r.ex = true
    return r
  })
  return s
}

/** Поля, которые вписывает ученик: k — ключ ответа ('3' или '3.1' — второй пропуск строки 3), a — верный ответ */
export function mfFields(s: any): { k: string; r: number; a: string }[] {
  const out: { k: string; r: number; a: string }[] = []
  if (s?.mode === 'info') return out
  ;(s?.rows ?? []).forEach((x: any, r: number) => {
    if (x.ex) return
    if (s.mode === 'gaps') { for (const p of gapList(x.q)) if (p.g != null) out.push({ k: r + '.' + p.i, r, a: p.g }) }
    else out.push({ k: String(r), r, a: x.a ?? '' })
  })
  return out
}
// сокращения — как полные формы: isn't = is not, they're = they are (’s не трогаем — is / has)
const FULL = (v: string) => (v ?? '').toLowerCase().replace(/[’‘`]/g, "'").replace(/\bcan't\b/g, 'can not').replace(/\bcannot\b/g, 'can not').replace(/\bwon't\b/g, 'will not')
  .replace(/n't\b/g, ' not').replace(/'re\b/g, ' are').replace(/'m\b/g, ' am').replace(/'ve\b/g, ' have').replace(/'ll\b/g, ' will').replace(/'d\b/g, ' would')
/** Ответ верный: любой вариант через «/», без учёта регистра и знаков; сокращение = полная форма */
export const mfOk = (typed: string, a: string) => gapOk(typed, a) || a.split('/').some((x) => !!x.trim() && gapOk(FULL(typed), FULL(x)))
/** Проверка: по каждому полю — верно / нет */
export function mfCheck(s: any, typed: Record<string, string>) {
  const ok: Record<string, boolean> = {}
  for (const f of mfFields(s)) ok[f.k] = mfOk(typed[f.k] ?? '', f.a)
  return { ok, all: Object.values(ok).every(Boolean) }
}
/** Текст с разметкой → кусочки: **жирный**, ==маркер==, !!красный!!, __ошибка__ (волнистая черта) */
export function mfRich(t?: string) {
  return (t ?? '').split(/(\*\*.+?\*\*|==.+?==|!!.+?!!|__.+?__)/g).filter(Boolean).map((x) =>
    /^\*\*.+\*\*$/.test(x) ? { x: x.slice(2, -2), c: 'b' } : /^==.+==$/.test(x) ? { x: x.slice(2, -2), c: 'mk' } : /^!!.+!!$/.test(x) ? { x: x.slice(2, -2), c: 'rd' } : /^__.+__$/.test(x) ? { x: x.slice(2, -2), c: 'wv' } : { x, c: '' })
}
/** Слова в скобках для «Собери вопрос»: «(the children / what / are / doing?)» → ['the children', 'what', 'are', 'doing?'] */
export const mfWords = (q?: string) => (q ?? '').replace(/^\s*\(|\)\s*$/g, '').split('/').map((x) => x.trim()).filter(Boolean)
/** Первый вариант ответа — для «правильно: …» */
export const mfFirst = (a?: string) => (a ?? '').split('/')[0].trim()
/** Какая это плитка вкладки «Красный Мерфи» — по виду экрана (для значка и тегов на ветке урока) */
export function mfTpl(s: any): string {
  const m = s?.mode, rows: any[] = Array.isArray(s?.rows) ? s.rows : []
  if (m === 'info') return 'mfinfo'
  if (m === 'match') return 'mf314'
  if (m === 'gaps') return 'mf395'
  if (m === 'order') return s.below ? 'mf51' : 'mf43'
  if (s.who) return 'mf171'
  if (s.copy) return 'mf212'
  if (s.opts?.length) return 'mf15'
  if (rows.some((r) => r.h)) return 'mf193'
  if (s.inl) return rows.some((r) => /\s/.test((r.q ?? '').trim())) ? 'mf31' : 'mf112'
  return 'mf25'
}

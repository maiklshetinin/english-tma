import { apiFetch } from './useTelegramAuth'
import { nextId } from '../store/mock'
// Колонки таблицы: A — слово, B — перевод, C — пример (необязательно). Первая строка-заголовок пропускается.
export function sheetUrlToCsv(url) {
  const m = url.match(/\/spreadsheets\/d\/([\w-]+)/)
  if (!m) throw new Error('Это не похоже на ссылку Google Таблицы')
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1]
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`
}
export async function fetchSheetCsv(url) {
  // С бэкендом (VITE_API_URL) запрос идёт через прокси — работает и с приватными таблицами через сервисный аккаунт.
  const useApi = !!import.meta.env.VITE_API_URL
  let r
  try { r = useApi ? await apiFetch(`/sheets/csv?url=${encodeURIComponent(url)}`) : await fetch(sheetUrlToCsv(url)) }
  catch { throw new Error('Не удалось загрузить. Откройте доступ «Все, у кого есть ссылка» или вставьте данные вручную.') }
  if (!r.ok) throw new Error(`Таблица недоступна (${r.status}). Проверьте доступ по ссылке.`)
  return r.text()
}
export function parseCsv(text) {
  const d = text.split('\n')[0].includes('\t') ? '\t' : ','
  const rows = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === d) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}
export function parseCards(text) {
  const rows = parseCsv(text).map(r => r.map(c => c.trim())).filter(r => r[0] && r[1])
  if (rows[0] && /^(word|слово|front|english)/i.test(rows[0][0])) rows.shift()
  return rows.map(([front, back, example = '']) => ({ front, back, example }))
}

// Вливает строки таблицы в колоду: новые слова добавляются, у существующих (по слову) обновляются перевод и пример.
// Прогресс учеников не теряется: id карточки остаётся прежним.
export function mergeCards(deck, rows) {
  const by = new Map(deck.cards.map(c => [c.front.trim().toLowerCase(), c]))
  let added = 0, updated = 0
  for (const r of rows) {
    const k = r.front.trim().toLowerCase(), ex = by.get(k)
    if (ex) {
      if (ex.back !== r.back || (r.example && ex.example !== r.example)) { ex.back = r.back; if (r.example) ex.example = r.example; updated++ }
    } else {
      deck.cards.push({ id: nextId(), front: r.front, back: r.back, example: r.example })
      by.set(k, deck.cards[deck.cards.length - 1]); added++
    }
  }
  return { added, updated }
}

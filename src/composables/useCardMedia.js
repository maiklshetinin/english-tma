// Фото и озвучка карточек — общее для таблицы карточек (CardStudio) и окна правки карточки (CardEditModal).
//  • Фото строго 450×300 (3:2 — как место под фото у ученика): обрезаем по центру, WebP ≤ 40 КБ. Меньше 450×300 — не берём.
//  • Файлы — в S3 (server/storage.ts, папка колоды); в карточке — ссылка ${API}/media/f/<ключ>, её открывают и ученики.
//    Без сервера (демо) файлы остаются ссылками в памяти браузера.
import { reactive } from 'vue'
import { API, apiRequest, fb, isDemo } from '../firebase'
import { imageSrc, audioSrc } from '../utils/media'
import { showToast } from './useToast'
import { waveOf } from '../utils/wave'

export const online = !isDemo && !!API && !!fb
export const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)
export const isAud = (f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|weba)$/i.test(f.name)
const kb = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ')
const PW = 450, PH = 300, GOAL = 40 * 1024
const enc = (cv, type, qq) => new Promise(ok => cv.toBlob(ok, type, qq))
export async function squeeze(file) {
  let bmp; try { bmp = await createImageBitmap(file) } catch { throw new Error(`не удалось открыть фото ${file.name}`) }
  const sw = Math.min(bmp.width, bmp.height * PW / PH), sh = sw * PH / PW            // самый большой кадр 3:2 — по центру
  if (sw < PW || sh < PH) throw new Error(`${file.name}: фото маленькое (${bmp.width}×${bmp.height}) — нужно хотя бы ${PW}×${PH}`)
  const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH
  const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, PW, PH)
  let type = 'image/webp', qq = 0.85, blob = await enc(cv, type, qq)
  if (blob?.type !== type) { type = 'image/jpeg'; blob = await enc(cv, type, qq) }        // Safari старше 14 не умеет WebP
  while (blob.size > GOAL && qq > 0.5) { qq = Math.round((qq - 0.07) * 100) / 100; blob = await enc(cv, type, qq) }
  return { blob, note: `${kb(file.size)} → ${kb(blob.size)} · ${PW}×${PH}` }
}
const audioType = (f) => f.type || ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', weba: 'audio/webm' })[f.name.split('.').pop().toLowerCase()] || 'audio/mpeg'

export const MEDIA = `${API}/media/f/`
export const ourKey = (url) => (url?.startsWith(MEDIA) ? decodeURIComponent(url.slice(MEDIA.length)) : null)
/** Ссылка на чужой сайт (Google Диск, britlex…) — не наш файл в хранилище и не только что выбранный */
export const isLink = (u) => !!u && !u.startsWith('blob:') && !ourKey(u)
export const audSrc = (u) => (u?.startsWith('blob:') ? u : audioSrc(u))
export const imgSrc = (u) => (u?.startsWith('blob:') ? u : imageSrc(u))
/** Убрать старый файл из хранилища (заменили или удалили) — молча, это не главное */
export const forget = (url) => { const k = ourKey(url); if (k && online) apiRequest('/media/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }) }).catch(() => {}) }

/** Загрузка файлов в колоду: busy[id+поле] — % загрузки, info[id+поле] — «было → стало» для фото. deck — () => колода. */
export function useCardMedia(deck) {
  const busy = reactive({}), info = reactive({})
  async function send(blob, type, id) {
    const token = await fb?.currentUser?.getIdToken()
    return new Promise((ok, no) => {
      const x = new XMLHttpRequest()
      x.open('POST', `${API}/media/upload?deckId=${encodeURIComponent(deck().id)}`)
      x.setRequestHeader('Content-Type', type); if (token) x.setRequestHeader('Authorization', `Bearer ${token}`)
      x.upload.onprogress = (e) => { if (e.lengthComputable) busy[id] = Math.round(e.loaded / e.total * 100) }
      x.onload = () => { if (x.status < 300) return ok(JSON.parse(x.responseText).key); let m = ''; try { m = JSON.parse(x.responseText).error } catch { /* не JSON */ } no(new Error(`${x.status}${m ? ': ' + m : ''}`)) }
      x.onerror = () => no(new Error('сервер не отвечает'))
      x.send(blob)
    })
  }
  /** Положить файл в поле карточки: фото — ужать, всё — в хранилище, в карточку — ссылку. false — не вышло (причина — во всплывашке) */
  async function attach(c, k, file) {
    const id = c.id + k
    if (busy[id] != null) return false
    busy[id] = 0
    try {
      let blob = file, type = audioType(file)
      if (k === 'image') { const r = await squeeze(file); blob = r.blob; type = blob.type; info[id] = r.note }
      const old = c[k]
      if (!online) c[k] = URL.createObjectURL(blob)
      else { const key = await send(blob, type, id); c[k] = MEDIA + key }
      if (k !== 'image') { try { c[k + 'Meta'] = await waveOf(blob) } catch { delete c[k + 'Meta'] } }      // волна и длительность — сразу из файла
      if (old && old !== c[k]) forget(old)
      return true
    } catch (e) { showToast(/фото маленькое|не удалось открыть/.test(e.message) ? e.message : `Не удалось загрузить ${file.name} (${e.message})`, null, 'bad'); return false }
    finally { delete busy[id] }
  }
  function clearField(c, k) { forget(c[k]); delete c[k]; delete c[k + 'Meta']; delete info[c.id + k] }
  return { busy, info, attach, clearField }
}

/** Удалить карточку из колоды (с вопросом, если в ней что-то есть); её фото и звук — из хранилища. true — удалили. */
export function removeCard(deck, c) {
  const files = ['image', 'audio', 'exampleAudio'].filter(k => c[k])
  if ((c.front || files.length) && !confirm(`Удалить карточку «${c.front || 'без слова'}»?${files.length ? ' Её фото и озвучка удалятся из хранилища.' : ''}`)) return false
  files.forEach(k => forget(c[k]))
  const i = deck.cards.findIndex(x => x.id === c.id); if (i >= 0) deck.cards.splice(i, 1)
  return true
}

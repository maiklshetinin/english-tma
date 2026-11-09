// Файлы курса для показа: свой ключ курса в S3 (t/…) — ссылка на просмотр (пачкой), «idb:» — из этого браузера (курс без сервера),
// остальное — как в карточках. Общий для просмотра курса и раздела Review.
import { reactive } from 'vue'
import { apiRequest } from '../firebase'
import { audSrc, imgSrc } from './useCardMedia'

const idb = () => new Promise((ok, no) => { const r = indexedDB.open('tma-course-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('v'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })

export function useCourseMedia(online) {
  const urls = reactive({}), want = new Set(); let vt = 0
  function askView(key) {
    want.add(key); clearTimeout(vt)
    vt = setTimeout(async () => {
      const keys = [...want]; want.clear()
      try { const r = await apiRequest('/media/view', { method: 'POST', body: JSON.stringify({ keys }) }); if (r.ok) Object.assign(urls, (await r.json()).urls) } catch { /* без сети — позже */ }
    }, 50)
  }
  function local(id) {
    if (!(id in urls)) {
      urls[id] = ''
      idb().then(db => { const q = db.transaction('v').objectStore('v').get(id); q.onsuccess = () => { if (q.result) urls[id] = URL.createObjectURL(q.result) } }).catch(() => {})
    }
    return urls[id]
  }
  function resolve(v, kind) {
    if (!v) return ''
    if (v.startsWith('idb:')) return local(v.slice(4))
    if (/^t\//.test(v)) { if (!online) return ''; if (!(v in urls)) { urls[v] = ''; askView(v) } return urls[v] }
    return kind === 'audio' ? audSrc(v) : kind === 'image' ? imgSrc(v) : v
  }
  return { resolve, local }
}

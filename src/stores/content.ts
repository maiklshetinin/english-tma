// Путь, пресеты, колоды и прогресс повторений приходят с сервера двумя запросами (GET /content и GET /srs) и раскладываются по сторам.
// Перечитывание — после входа, при возврате в приложение и при открытии вкладки «Ученики». Правки на экране не затираются:
// если пока шёл запрос что-то поменяли или сохраняют, устаревший ответ не применяется.
import { defineStore } from 'pinia'
import { isDemo } from '../firebase'
import { fetchContent, fetchSrs } from './api'
import { useDecksStore } from './decks'
import { usePathStore } from './path'
import { useSrsStore } from './srs'

export const useContentStore = defineStore('content', () => {
  async function load(): Promise<void> {
    if (isDemo) return
    const path = usePathStore(), decks = useDecksStore(), srs = useSrsStore()
    const was = { path: path.revs(), decks: decks.rev(), srs: srs.rev() }
    const [c, s] = await Promise.all([fetchContent(), fetchSrs()])
    path.applyPaths(c.paths, was.path.paths); path.applyPresets(c.presets, was.path.presets)
    decks.apply(c.decks, was.decks)
    srs.apply(s.users, was.srs)
  }

  let onVisible: (() => void) | null = null
  function startRefresh() {                  // перечитывать, когда пользователь возвращается в приложение
    stopRefresh()
    onVisible = () => { if (document.visibilityState === 'visible') load().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)
  }
  function stopRefresh() { if (onVisible) document.removeEventListener('visibilitychange', onVisible); onVisible = null }
  function clear() { stopRefresh(); usePathStore().clear(); useDecksStore().clear(); useSrsStore().clear() }

  return { load, startRefresh, stopRefresh, clear }
})

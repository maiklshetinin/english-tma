// Путь, пресеты, колоды и прогресс повторений приходят с сервера двумя запросами (GET /content и GET /srs) и раскладываются по сторам.
// Запросы независимы: «Путь, колоды, пресеты» нужны одним экранам, «прогресс слов» — другим (Слова, кольцо слов), поэтому
// loadContent() и loadSrs() читаются отдельно, по требованию экрана (stores/screens.ts); load() — оба сразу (когда коллега изменил данные).
// Перечитывание — при входе на экран, при возврате в приложение. Правки на экране не затираются:
// если пока шёл запрос что-то поменяли или сохраняют, устаревший ответ не применяется.
import { defineStore } from 'pinia'
import { isDemo } from '../firebase'
import { fetchContent, fetchSrs } from './api'
import { useDecksStore } from './decks'
import { usePathStore } from './path'
import { useSrsStore } from './srs'

export const useContentStore = defineStore('content', () => {
  /** GET /content: путь, пресеты, колоды. */
  async function loadContent(): Promise<void> {
    if (isDemo) return
    const path = usePathStore(), decks = useDecksStore()
    const was = { path: path.revs(), decks: decks.rev() }
    const c = await fetchContent()
    path.applyPaths(c.paths, was.path.paths); path.applyPresets(c.presets, was.path.presets)
    decks.apply(c.decks, was.decks)
  }
  /** GET /srs: прогресс повторений слов. */
  async function loadSrs(): Promise<void> {
    if (isDemo) return
    const srs = useSrsStore()
    const was = srs.rev()
    srs.apply((await fetchSrs()).users, was)
  }
  /** Оба сразу — для «коллега изменил» и после ошибок сохранения. */
  async function load(): Promise<void> { await Promise.all([loadContent(), loadSrs()]) }

  function clear() { usePathStore().clear(); useDecksStore().clear(); useSrsStore().clear() }

  return { load, loadContent, loadSrs, clear }
})

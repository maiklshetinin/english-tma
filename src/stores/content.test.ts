// Тесты загрузки контента: один вызов раскладывает ответы сервера по сторам и не затирает свежие правки.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn(), tg: undefined, fb: null }))

import { useContentStore } from './content'
import { useDecksStore } from './decks'
import { usePathStore } from './path'
import { useSrsStore } from './srs'
import { useStudentsStore } from './students'
import { session } from './session'

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const unit = (title: string) => ({ id: 'u1', title, sub: '', nodes: [{ id: 'n1', type: 'hw' as const, title: 'ДЗ', xp: 20, done: false }] })
const CONTENT = { paths: { s1: [unit('С сервера')] }, presets: [{ id: 'p1', name: 'Базовый', units: [] }], decks: [{ id: 'd1', title: 'Business', forAll: true, assigned: [], newPerDay: 20, source: { url: '', lastSync: null }, cards: [] }] }
const SRS = { users: { s1: { cards: {}, log: { '2026-10-26': 3 } } } }
const serve = () => apiRequest.mockImplementation((p: string) => ok(p === '/content' ? CONTENT : p === '/srs' ? SRS : { ok: true }))

describe('content store', () => {
  beforeEach(() => { setActivePinia(createPinia()); apiRequest.mockReset(); serve(); session.canEdit = true })
  afterEach(() => { session.canEdit = false })

  it('load: путь, пресеты, колоды и прогресс разложены по сторам', async () => {
    const students = useStudentsStore(); students.set([{ id: 's1', name: 'Маша' } as never])
    await useContentStore().load()
    expect(usePathStore().of('s1')[0].title).toBe('С сервера')
    expect(usePathStore().presets.map((p) => p.id)).toEqual(['p1'])
    expect(useDecksStore().list.map((d) => d.id)).toEqual(['d1'])
    expect(useSrsStore().of('s1')!.log['2026-10-26']).toBe(3)
    expect(apiRequest.mock.calls.map((c) => c[0]).sort()).toEqual(['/content', '/srs'])
  })

  it('пока шёл запрос, ученик ответил на карточку — этот ответ не затирается', async () => {
    useStudentsStore().set([{ id: 's1', name: 'Маша' } as never])
    const srs = useSrsStore()
    let release!: () => void
    apiRequest.mockImplementation((p: string) => p === '/srs' ? new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => SRS } as Response) }) : ok(p === '/content' ? CONTENT : {}))
    const loading = useContentStore().load()
    await nextTick()
    srs.set('s2', 'c1', { ease: 2.5, interval: 1, reps: 1, lapses: 0, first: '2026-10-26', last: '2026-10-26', due: '2026-10-27' }, '2026-10-26', 1)
    release(); await loading
    expect(srs.of('s2')).toBeDefined()                         // прогресс не перезаписан устаревшим ответом
  })

  it('пока шёл запрос, преподаватель правил путь — правки не затираются', async () => {
    const students = useStudentsStore(); students.set([{ id: 's1', name: 'Маша' } as never])
    const path = usePathStore(); path.applyPaths({ s1: [unit('Моё')] })
    let release!: () => void
    apiRequest.mockImplementation((p: string) => p === '/content' ? new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => CONTENT } as Response) }) : ok(SRS))
    const loading = useContentStore().load()
    await nextTick()
    path.of('s1')[0].title = 'Правка во время загрузки'
    await nextTick()
    release(); await loading
    expect(path.of('s1')[0].title).toBe('Правка во время загрузки')
  })

  it('clear очищает всё', async () => {
    useStudentsStore().set([{ id: 's1', name: 'Маша' } as never])
    const c = useContentStore(); await c.load(); c.clear()
    expect(usePathStore().presets).toEqual([]); expect(useDecksStore().list).toEqual([]); expect(useSrsStore().users).toEqual({})
  })
})

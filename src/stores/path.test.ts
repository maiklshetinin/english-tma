// Тесты пути и пресетов: правки на месте сохраняются, ученик не сохраняет, выполнение кружка идёт через сервер.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { PathUnit, Student } from '../../server/types'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn(), tg: undefined, fb: null }))

import { usePathStore } from './path'
import { useStudentsStore } from './students'
import { session } from './session'
import { addNode, addUnit } from '../utils/path'

const ok = (body: unknown = { ok: true }) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const st = (id: string): Student => ({ id, name: id, level: 'A1', color: '#fff', username: '', streak: 0, coins: 10, status: 'active', tgId: null, photoUrl: '', price: 0, priceHistory: [{ from: '', price: 0 }], payment: { status: 'paid', until: '2026-12-01', lessonsLeft: 3, packageSize: 8 } })
const unit = (nodes: PathUnit['nodes'] = []): PathUnit => ({ id: 'u1', title: 'Unit', sub: '', nodes })
const node = (id: string, xp = 20) => ({ id, type: 'hw' as const, title: id, xp, done: false })
const calls = () => apiRequest.mock.calls.map((c) => [c[1]?.method ?? 'GET', c[0]] as const)

describe('path store', () => {
  beforeEach(() => { vi.useFakeTimers(); setActivePinia(createPinia()); apiRequest.mockReset(); apiRequest.mockImplementation(() => ok()); session.canEdit = true; session.ownKey = 'teacher' })
  afterEach(() => { vi.useRealTimers(); session.canEdit = false; session.ownKey = null })

  const setup = () => {
    const students = useStudentsStore(), path = usePathStore()
    students.set([st('s1'), st('s2')])
    path.applyPaths({ s1: [unit([node('a'), node('b', 30)])] })
    return { students, path }
  }

  it('у каждого ученика есть свой путь, пустые пути на сервер не отправляются', async () => {
    const { path } = setup()
    expect(path.of('s2')).toEqual([])
    expect(path.paths.s2).toBeDefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls()).toEqual([])
  })

  it('новый ученик получает путь, и правки в нём сохраняются', async () => {
    const { students, path } = setup()
    students.set([st('s1'), st('s2'), st('s3')])
    addUnit(path.of('s3'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([['PUT', '/paths/s3']])
    expect(JSON.parse(apiRequest.mock.calls[0][1].body).units[0].title).toBe('Новый юнит')
  })

  it('правка названия кружка «на месте» → PUT /paths/<id> с целым путём', async () => {
    const { path } = setup()
    path.of('s1')[0].nodes[0].title = 'Новое имя'
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([['PUT', '/paths/s1']])
    expect(JSON.parse(apiRequest.mock.calls[0][1].body).units[0].nodes[0].title).toBe('Новое имя')
  })

  it('конструктор: добавленный кружок попадает в запрос', async () => {
    const { path } = setup()
    addNode(path.of('s1'), 0, 'cards')
    await vi.advanceTimersByTimeAsync(1000)
    expect(JSON.parse(apiRequest.mock.calls[0][1].body).units[0].nodes).toHaveLength(3)
  })

  it('ученик (canEdit=false) путь на сервер не сохраняет', async () => {
    session.canEdit = false
    const { path } = setup()
    path.of('s1')[0].nodes[0].title = 'Хак'
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls()).toEqual([])
  })

  it('complete: отметка и монеты на экране сразу, потом монеты берутся у сервера', async () => {
    apiRequest.mockImplementation((p: string) => ok(p.endsWith('/complete') ? { coins: 35 } : { ok: true }))
    const { students, path } = setup()
    const n = path.of('s1')[0].nodes[0]
    path.complete(n, 's1')
    expect(n.done).toBe(true); expect(students.byId('s1')!.coins).toBe(30)
    await vi.advanceTimersByTimeAsync(10)
    expect(calls()[0]).toEqual(['POST', '/paths/s1/complete'])
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ nodeId: 'a' })
    expect(students.byId('s1')!.coins).toBe(35)               // авторитетное значение с сервера
  })

  it('complete: повторная отметка ничего не делает', async () => {
    const { students, path } = setup()
    const n = path.of('s1')[0].nodes[0]
    path.complete(n, 's1'); path.complete(n, 's1')
    await vi.advanceTimersByTimeAsync(10)
    expect(calls().filter(([m]) => m === 'POST')).toHaveLength(1)
    expect(students.byId('s1')!.coins).toBe(30)
  })

  it('complete у ученика (canEdit=false): запрос уходит, а путь целиком не пересохраняется', async () => {
    session.canEdit = false; session.ownKey = 's1'
    const { path } = setup()
    path.complete(path.of('s1')[0].nodes[0], 's1')
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls()).toEqual([['POST', '/paths/s1/complete']])
  })

  it('complete: отказ сервера (кружок закрыт) → перечитывание пути', async () => {
    apiRequest.mockImplementation((p: string, o?: RequestInit) => o?.method === 'POST' ? Promise.resolve({ ok: false, status: 409, json: async () => ({}) } as Response)
      : ok({ paths: { s1: [unit([node('a'), node('b', 30)])] }, presets: [], decks: [] }))
    const { path } = setup()
    path.complete(path.of('s1')[0].nodes[0], 's1')
    await vi.advanceTimersByTimeAsync(50)
    expect(path.of('s1')[0].nodes[0].done).toBe(false)         // экран откатился к данным сервера
  })

  it('пресеты: создать → PUT, удалить → DELETE, удалить и тут же вернуть → ничего', async () => {
    const { path } = setup()
    const p = path.addPreset('Базовый', [unit([node('x')])])
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([['PUT', `/presets/${p.id}`]])
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ name: 'Базовый', units: [unit([node('x')])] })

    apiRequest.mockClear()
    const gone = path.removePreset(p.id)!
    path.restorePreset(gone)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([])

    path.removePreset(p.id)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls()).toEqual([['DELETE', `/presets/${p.id}`]])
  })

  it('пресет из пути: без уроков, дат и времени, с новыми id и без отметок', () => {
    const { path } = setup()
    const units: PathUnit[] = [unit([{ ...node('t'), type: 'tutor', date: '2026-10-27', time: '09:00' }, { ...node('h'), date: '2026-10-28', done: true }])]
    const p = path.presetFromPath('Копия', units)
    const ns = p.units[0].nodes
    expect(ns).toHaveLength(1); expect(ns[0]).not.toHaveProperty('date'); expect(ns[0].done).toBe(false)
    expect(ns[0].id).not.toBe('h'); expect(p.units[0].id).not.toBe('u1')
  })

  it('applyPreset: копия в конец пути, кружки датируются через день', () => {
    const { path } = setup()
    const p = path.addPreset('П', [unit([node('x'), node('y')])])
    const { from, count } = path.applyPreset('s2', p)
    expect(from).toBe(0); expect(count).toBe(1)
    const ns = path.of('s2')[0].nodes
    expect(ns).toHaveLength(2); expect(ns[0].date).toBeTruthy(); expect(ns[1].date).not.toBe(ns[0].date)
    expect(path.of('s2')[0].id).not.toBe(p.units[0].id)
  })

  it('ответ сервера не затирает несохранённые правки', async () => {
    const { path } = setup()
    const was = path.revs().paths
    path.of('s1')[0].nodes[0].title = 'Мои правки'
    await nextTick()                                          // ответ сервера приходит позже правки — наблюдатель уже сработал
    path.applyPaths({ s1: [unit([node('a')])] }, was)
    expect(path.of('s1')[0].nodes[0].title).toBe('Мои правки')
  })

  it('applyPaths без правок: заменяет данные и ничего не отправляет', async () => {
    const { path } = setup()
    path.applyPaths({ s1: [unit([node('z')])] }, path.revs().paths)
    await vi.advanceTimersByTimeAsync(2000)
    expect(path.of('s1')[0].nodes[0].id).toBe('z'); expect(calls()).toEqual([])
  })
})

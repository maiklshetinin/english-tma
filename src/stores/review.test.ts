// «Твой словарь» с сервером: ответы уходят пачкой, неотправленное не затирается загрузкой, чужой словарь не уезжает.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, API: 'https://api', fb: 'key', apiRequest: (...a: unknown[]) => apiRequest(...a) }))
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const choice = { id: 's1', kind: 'choice', opts: [{ w: 'no problem', t: 'без проблем' }, { w: 'go ahead' }], ans: 0 } as any

describe('stores/review', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); apiRequest.mockReset(); vi.useFakeTimers() })

  it('ответ → через пару секунд POST /review только с изменённой записью', async () => {
    apiRequest.mockImplementation(() => ok({ items: {} }))
    const { recordStep, review } = await import('./review')
    recordStep(choice, { ok: true })
    expect(review.items['no problem'].f?.n).toBe(1)
    await vi.advanceTimersByTimeAsync(2500)
    const post = apiRequest.mock.calls.find((c) => c[0] === '/review' && c[1]?.method === 'POST')
    expect(Object.keys(JSON.parse(post![1].body).items)).toEqual(['no problem', 'skill:listening'])
  })

  it('загрузка с сервера: серверное + ещё не отправленное (оно новее)', async () => {
    apiRequest.mockImplementation((p: string, o?: RequestInit) => (o?.method === 'POST' ? new Promise(() => {}) : ok({ items: { hello: { key: 'hello', kind: 'word', text: 'Hello', tr: '', s: 50, due: 0, seen: 0, ok: 2, bad: 0, hist: [] } } })))
    const { recordStep, syncReview, review } = await import('./review')
    localStorage.setItem('tma.review.owner.v1', JSON.stringify('1'))
    recordStep(choice, { ok: false })
    await syncReview(1)
    expect(Object.keys(review.items).sort()).toEqual(['hello', 'no problem', 'skill:listening'])
    expect(review.sync).toBe('synced')
  })

  it('в браузере был другой пользователь — его словарь не отправляем', async () => {
    localStorage.setItem('tma.review.owner.v1', JSON.stringify('2'))
    localStorage.setItem('tma.review.v1', JSON.stringify({ x: { key: 'x', kind: 'word', text: 'x', tr: '', s: 20, due: 0, seen: 0, ok: 0, bad: 0, hist: [] } }))
    localStorage.setItem('tma.review.pending.v1', JSON.stringify(['x']))
    apiRequest.mockImplementation(() => ok({ items: {} }))
    const { syncReview, review } = await import('./review')
    await syncReview(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(review.items).toEqual({})
    expect(apiRequest.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false)
  })

  it('первый раз с сервером — словарь из браузера переезжает в базу', async () => {
    localStorage.setItem('tma.review.v1', JSON.stringify({ x: { key: 'x', kind: 'word', text: 'x', tr: '', s: 20, due: 0, seen: 0, ok: 0, bad: 0, hist: [] } }))
    apiRequest.mockImplementation(() => ok({ items: {} }))
    const { syncReview, review } = await import('./review')
    await syncReview(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(review.items.x).toBeTruthy()
    const post = apiRequest.mock.calls.find((c) => c[1]?.method === 'POST')
    expect(Object.keys(JSON.parse(post![1].body).items)).toEqual(['x'])
  })

  it('«Очистить»: сначала дожидается отправки в пути, потом сброс на сервере — слова не возвращаются', async () => {
    const order: string[] = []
    let release!: () => void
    apiRequest.mockImplementation((p: string, o?: RequestInit) => {
      if (p === '/review' && o?.method === 'POST') { order.push('save'); return new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => ({}) } as Response) }) }
      if (p === '/review/reset') { order.push('reset'); return ok({ ok: true }) }
      return ok({ items: {} })
    })
    const { recordStep, resetReview, review } = await import('./review')
    recordStep(choice, { ok: true })
    await vi.advanceTimersByTimeAsync(2500)                    // отправка ушла и висит
    const done = resetReview()
    await vi.advanceTimersByTimeAsync(10)
    expect(order).toEqual(['save'])                            // сброс ждёт
    release(); expect(await done).toBe(true)
    expect(order).toEqual(['save', 'reset']); expect(review.items).toEqual({})
  })
})

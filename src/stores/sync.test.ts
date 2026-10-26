// Тесты автосохранения: пауза, только изменённые документы, удаление, ошибка → перечитывание, «устаревший ответ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocSync } from './sync'

type Doc = { v: number }
const make = (over: Partial<Parameters<typeof createDocSync<Doc>>[0]> = {}) => {
  const docs: Record<string, Doc> = { a: { v: 1 }, b: { v: 1 } }
  const save = vi.fn(async () => {}), remove = vi.fn(async () => {}), reload = vi.fn(async () => {})
  const sync = createDocSync<Doc>({ what: 'Тест', snapshot: () => docs, save, remove, reload, enabled: () => true, delay: 100, ...over })
  sync.accept(docs)
  return { docs, save, remove, reload, sync }
}

describe('doc sync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('сохраняет после паузы и только изменённый документ', async () => {
    const { docs, save, sync } = make()
    docs.a.v = 2; sync.touch()
    await vi.advanceTimersByTimeAsync(99); expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith('a', { v: 2 })
  })

  it('частые правки склеиваются в одно сохранение', async () => {
    const { docs, save, sync } = make()
    for (let i = 2; i < 8; i++) { docs.a.v = i; sync.touch(); await vi.advanceTimersByTimeAsync(50) }
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith('a', { v: 7 })
  })

  it('если вернули прежнее значение — сохранять нечего', async () => {
    const { docs, save, sync } = make()
    docs.a.v = 5; sync.touch(); docs.a.v = 1; sync.touch()
    await vi.advanceTimersByTimeAsync(300)
    expect(save).not.toHaveBeenCalled()
  })

  it('новый документ сохраняется, пропавший — удаляется', async () => {
    const { docs, save, remove, sync } = make()
    docs.c = { v: 9 }; delete docs.b; sync.touch()
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledWith('c', { v: 9 }); expect(remove).toHaveBeenCalledWith('b')
  })

  it('отправляется копия на момент проверки, а не живой объект', async () => {
    const { docs, save, sync } = make()
    docs.a.v = 2; sync.touch(); await vi.advanceTimersByTimeAsync(150)
    docs.a.v = 99
    expect((save.mock.calls[0] as unknown[])[1]).toEqual({ v: 2 })
  })

  it('выключено (демо, ученик) — не сохраняет, но ревизия растёт', async () => {
    const { docs, save, sync } = make({ enabled: () => false })
    const r = sync.rev(); docs.a.v = 2; sync.touch()
    await vi.advanceTimersByTimeAsync(500)
    expect(save).not.toHaveBeenCalled(); expect(sync.rev()).toBe(r + 1)
  })

  it('ошибка сервера: тост-сообщение не роняет очередь, после неё данные перечитываются', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Это время занято')).mockResolvedValue(undefined)
    const { docs, reload, sync } = make({ save })
    docs.a.v = 2; docs.b.v = 2; sync.touch()
    await vi.advanceTimersByTimeAsync(300)
    expect(save).toHaveBeenCalledTimes(2)                    // второй документ всё равно отправлен
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('запросы идут строго по очереди', async () => {
    const order: string[] = []
    let release!: () => void
    const save = vi.fn((id: string) => id === 'a' ? new Promise<void>((r) => { release = () => { order.push('a-done'); r() } }) : (order.push('b'), Promise.resolve()))
    const { docs, sync } = make({ save })
    docs.a.v = 2; docs.b.v = 2; sync.touch()
    await vi.advanceTimersByTimeAsync(200)
    expect(order).toEqual([])                                // b ждёт, пока завершится a
    release(); await vi.advanceTimersByTimeAsync(10)
    expect(order).toEqual(['a-done', 'b'])
  })

  it('settled: ответ сервера, полученный до правок или во время сохранения, применять нельзя', async () => {
    const { docs, sync } = make()
    const was = sync.rev()
    expect(sync.settled(was)).toBe(true)
    docs.a.v = 2; sync.touch()
    expect(sync.settled(was)).toBe(false)                    // правка после запроса
    await vi.advanceTimersByTimeAsync(300)
    expect(sync.settled(was)).toBe(false)                    // сохранилось, но ответ всё равно старее правки
    expect(sync.settled(sync.rev())).toBe(true)              // новый запрос — можно
  })

  it('flushNow сохраняет сразу, без паузы', async () => {
    const { docs, save, sync } = make()
    docs.a.v = 2; sync.touch(); sync.flushNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('служебные изменения (accept, know) не считаются правкой: ни паузы, ни смены ревизии', async () => {
    const { docs, save, sync } = make()
    const r = sync.rev(), busyBefore = sync.busy()
    docs.z = { v: 0 }; sync.know('z', { v: 0 }); sync.touch()
    expect(sync.rev()).toBe(r); expect(sync.busy()).toBe(busyBefore)
    docs.a = { v: 7 }; sync.accept(docs); sync.touch()
    expect(sync.rev()).toBe(r); expect(sync.busy()).toBe(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(save).not.toHaveBeenCalled()
  })

  it('возврат к прежнему значению отменяет ожидающее сохранение', async () => {
    const { docs, sync } = make()
    docs.a.v = 5; sync.touch(); expect(sync.busy()).toBe(true)
    docs.a.v = 1; sync.touch(); expect(sync.busy()).toBe(false)
  })

  it('know: известный документ не считается новым', async () => {
    const { docs, save, sync } = make()
    docs.z = { v: 0 }; sync.know('z', { v: 0 }); sync.touch()
    await vi.advanceTimersByTimeAsync(300)
    expect(save).not.toHaveBeenCalled()
  })
})

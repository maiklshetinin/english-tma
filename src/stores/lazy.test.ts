// Загрузка по требованию: свежее не читается заново, одновременные запросы сливаются, ошибка не считается «прочитано».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FRESH_MS, isFresh, isLoaded, load, loadedKeys, markStale, resetLazy } from './lazy'

describe('stores/lazy', () => {
  beforeEach(() => { resetLazy(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('прочитанное свежо FRESH_MS: повторный запрос ничего не читает, потом — читает заново', async () => {
    const fn = vi.fn(async () => {})
    await load('a', fn); await load('a', fn)
    expect(fn).toHaveBeenCalledTimes(1); expect(isFresh('a')).toBe(true)
    vi.advanceTimersByTime(FRESH_MS + 1)
    expect(isFresh('a')).toBe(false); expect(isLoaded('a')).toBe(true)          // устарело, но уже читалось — экран покажет его сразу
    await load('a', fn); expect(fn).toHaveBeenCalledTimes(2)
  })

  it('два экрана просят одно и то же одновременно — один поход на сервер', async () => {
    let release!: () => void
    const fn = vi.fn(() => new Promise<void>((r) => { release = r }))
    const a = load('a', fn), b = load('a', fn)
    release(); await Promise.all([a, b])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('ошибка: данные не считаются прочитанными, следующий вход пробует снова', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('нет связи')).mockResolvedValue(undefined)
    await expect(load('a', fn)).rejects.toThrow('нет связи')
    expect(isLoaded('a')).toBe(false); expect(loadedKeys()).toEqual([])
    await load('a', fn)
    expect(fn).toHaveBeenCalledTimes(2); expect(isLoaded('a')).toBe(true)
  })

  it('force во время чтения: ждёт его и читает ещё раз (оно могло начаться до правки)', async () => {
    let release!: () => void
    const fn = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => { release = r })).mockResolvedValue(undefined)
    const first = load('a', fn)
    const forced = load('a', fn, { force: true })
    expect(fn).toHaveBeenCalledTimes(1)
    release(); await first; await forced
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('markStale: следующий запрос читает заново, пока не нужен — ничего не делает; resetLazy забывает всё', async () => {
    const fn = vi.fn(async () => {})
    await load('a', fn); markStale('a'); markStale('нет-такого')
    expect(isFresh('a')).toBe(false); expect(fn).toHaveBeenCalledTimes(1)
    await load('a', fn); expect(fn).toHaveBeenCalledTimes(2)
    resetLazy(); expect(loadedKeys()).toEqual([]); expect(isLoaded('a')).toBe(false)
  })
})

// Откуда аватарка: photoUrl → по tgId → по @нику через сервер; не открывшийся адрес пропускаем.
import { describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn(async (path: string) => new Response('x', { status: path.includes('none') ? 404 : 200 }))
vi.mock('../firebase', () => ({ apiFetch: (p: string) => apiFetch(p) }))
vi.stubEnv('VITE_API_URL', 'https://api.test')
URL.createObjectURL = vi.fn((b: Blob) => 'blob:' + b.size) as any
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('avatarSrc', async () => {
  const { avatarSrc, markBad } = await import('./useAvatar')
  it('сохранённое фото — сразу', () => { expect(avatarSrc({ photoUrl: 'https://cdn/a.jpg', username: 'maria_en' })).toBe('https://cdn/a.jpg') })
  it('фото не открылось → свежее по нику через сервер', async () => {
    const s = { photoUrl: 'https://cdn/old.jpg', username: 'maria_en' }
    markBad('https://cdn/old.jpg')
    expect(avatarSrc(s)).toBe('')                                   // грузится
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/avatar/nick/maria_en'))
    await vi.waitFor(() => expect(avatarSrc(s)).toMatch(/^blob:/))
  })
  it('вошедший ученик — по tgId, не по нику', async () => {
    avatarSrc({ tgId: 42, username: 'vika_k' }); await flush()
    expect(apiFetch).toHaveBeenCalledWith('/avatar/42'); expect(apiFetch).not.toHaveBeenCalledWith('/avatar/nick/vika_k')
  })
  it('нет ника и фото — инициал', () => { expect(avatarSrc({ name: 'Маша' })).toBe('') })
})

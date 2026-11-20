import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { prepSticker } from './sticker'

// Стикер персонажа (public/talk/avatar.tgs): рты «заморожены» и с class — их можно показывать на любом кадре
describe('персонаж: подготовка стикера', () => {
  const raw = () => JSON.parse(gunzipSync(readFileSync('public/talk/avatar.tgs')).toString())
  it('у ртов — class и нет анимации (ни прозрачности, ни формы)', () => {
    const d = prepSticker(raw())
    const mo = d.layers.find((l: any) => l.nm === 'mouth 3'), mc = d.layers.find((l: any) => l.nm === 'mouth_close')
    expect(mo.cl).toBe('ava-mo'); expect(mc.cl).toBe('ava-mc')
    expect(mo.ks.o).toEqual({ a: 0, k: 100 })
    expect(JSON.stringify(mo.shapes)).not.toContain('"a":1'); expect(JSON.stringify(mc.shapes)).not.toContain('"a":1')
  })
  it('повторная подготовка ничего не меняет', () => {
    const once = JSON.stringify(prepSticker(raw()))
    expect(JSON.stringify(prepSticker(JSON.parse(once)))).toBe(once)
  })
})

import { describe, it, expect } from 'vitest'
import { cropBox, outSize } from './shrink'

describe('фото экрана', () => {
  it('обрезка по центру под пропорции', () => {
    expect(cropBox(2000, 1000, 16 / 9)).toEqual([111, 0, 1778, 1000])
    expect(cropBox(1000, 1000, 16 / 9)).toEqual([0, 219, 1000, 563])
    expect(cropBox(600, 400, 3 / 2)).toEqual([0, 0, 600, 400])
  })
  it('сжатие до цели, маленькое не растягиваем', () => {
    expect(outSize(3840, 2160, 1280, 720)).toEqual([1280, 720])
    expect(outSize(800, 450, 1280, 720)).toEqual([800, 450])
  })
})

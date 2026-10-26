import { describe, expect, it } from 'vitest'
import { audioSrc, driveId, imageSrc, isMediaUrl } from './media'

describe('ссылки на фото и озвучку', () => {
  it('id файла берётся из всех видов ссылок Google Диска', () => {
    expect(driveId('https://drive.google.com/file/d/1AbC_-x/view?usp=sharing')).toBe('1AbC_-x')
    expect(driveId('https://drive.google.com/open?id=1AbC')).toBe('1AbC')
    expect(driveId('https://drive.google.com/uc?export=download&id=1AbC')).toBe('1AbC')
    expect(driveId('https://storage.googleapis.com/bucket/a.png')).toBeNull()
    expect(driveId('не ссылка')).toBeNull()
  })
  it('Диск превращается в прямые адреса, остальное остаётся как есть', () => {
    expect(imageSrc('https://drive.google.com/file/d/1AbC/view')).toBe('https://lh3.googleusercontent.com/d/1AbC')
    expect(audioSrc('https://drive.google.com/file/d/1AbC/view')).toBe('https://drive.google.com/uc?export=download&id=1AbC')
    expect(imageSrc(' https://storage.googleapis.com/b/a.png ')).toBe('https://storage.googleapis.com/b/a.png')
    expect(imageSrc(undefined)).toBe('')
  })
  it('можно любые ссылки, но только https', () => {
    expect(isMediaUrl('https://drive.google.com/file/d/1/view')).toBe(true)
    expect(isMediaUrl('https://cdn.example.com/a.mp3')).toBe(true)
    expect(isMediaUrl('http://cdn.example.com/a.mp3')).toBe(false)
    expect(isMediaUrl('javascript:alert(1)')).toBe(false)
    expect(isMediaUrl('сюжет')).toBe(false)
    expect(isMediaUrl('')).toBe(false)
  })
})

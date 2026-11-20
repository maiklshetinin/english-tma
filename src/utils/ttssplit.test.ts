// @ts-nocheck
import { describe, it, expect } from 'vitest'
import { batchText, splitPcm, rangesOf } from './ttssplit'

// «звук»: 3 фразы — тон, длинная тишина между ними
function fake(parts, rate = 24000) {
  const seg = []
  parts.forEach((sec, i) => { seg.push(...Array(Math.round(sec * rate)).fill(0).map((_, k) => Math.round(Math.sin(k / 5) * 8000))); if (i < parts.length - 1) seg.push(...Array(Math.round(0.9 * rate)).fill(0)) })
  return new Int16Array(seg)
}
describe('пакетная озвучка: нарезка', () => {
  it('текст пачки: многоточия и разрывы', () => { expect(batchText(['apple', 'Do you like it?', 'Yes.'])).toBe('apple...\n\n\n\nDo you like it?...\n\n\n\nYes.') })
  it('три фразы с паузами — три куска по границам пауз', () => {
    const pcm = fake([1, 1.5, 0.8]), { info, cuts } = splitPcm(pcm, 24000, ['apple', 'banana split', 'cat'])
    const r = rangesOf(info, cuts)
    expect(r).toHaveLength(3)
    expect(r[0][1] / 24000).toBeLessThan(1.2); expect(r[1][0] / 24000).toBeGreaterThan(1.6); expect(r[2][0] / 24000).toBeGreaterThan(4)
  })
})

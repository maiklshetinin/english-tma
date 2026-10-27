// Нагрузка недели (мини-спидометр): часы, зона относительно нормы, норма меняется в меню.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WeekLoad from './WeekLoad.vue'

const dates = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
const L = (i: number, hour: number, extra = {}) => ({ id: `${i}-${hour}`, date: dates[i], hour, studentIds: ['s'], ...extra })
const activeOf = (l: any) => !l.studentIds.every((id: string) => l.canceled?.[id])

describe('WeekLoad', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* нет хранилища */ } })

  it('часы недели: отменённый всеми и чужая неделя не считаются; зона «Комфортно»', () => {
    const w = mount(WeekLoad, { props: { dates, activeOf, lessons: [L(0, 10), L(2, 12), L(4, 18, { canceled: { s: 't' } }), { id: 'x', date: '2026-11-05', hour: 9, studentIds: ['s'] }] } })
    expect(w.find('.v b').text()).toBe('2'); expect(w.classes()).toContain('ok')
  })

  it('зоны от нормы: 22 из 25 — «Плотно»; норма 20 в меню — «Риск выгорания»', async () => {
    const ls = Array.from({ length: 22 }, (_, k) => L(k % 5, 8 + Math.floor(k / 5)))
    const w = mount(WeekLoad, { props: { dates, activeOf, lessons: ls } })
    expect(w.classes()).toContain('warn')
    await w.find('.g').trigger('click')
    expect(w.find('.pop').text()).toContain('Плотно')
    for (let k = 0; k < 5; k++) await w.findAll('.norm button')[0].trigger('click')
    expect(w.classes()).toContain('bad'); expect(w.find('.pop').text()).toContain('Риск выгорания')
  })
})

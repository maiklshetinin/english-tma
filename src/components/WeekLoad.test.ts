// Нагрузка недели: часы, зона относительно нормы, предупреждения об утомлении.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WeekLoad from './WeekLoad.vue'

const dates = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
const L = (i: number, hour: number, extra = {}) => ({ id: `${i}-${hour}`, date: dates[i], hour, studentIds: ['s'], ...extra })
const activeOf = (l: any) => !l.studentIds.every((id: string) => l.canceled?.[id])

describe('WeekLoad', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* нет хранилища */ } })

  it('лёгкая неделя: комфортно, без предупреждений; отменённый урок не считается', () => {
    const w = mount(WeekLoad, { props: { dates, activeOf, lessons: [L(0, 10), L(2, 12), L(4, 18, { canceled: { s: 't' } })] } })
    expect(w.find('.val b').text()).toBe('2'); expect(w.find('.state').text()).toBe('Комфортно')
    expect(w.find('.warns .ok').exists()).toBe(true)
  })

  it('тяжёлая неделя: выше нормы, перегруженный день, подряд без перерыва, нет выходного, поздние уроки', () => {
    const ls = [10, 11, 12, 13, 14, 15, 16].map(h => L(2, h))                       // среда: 7 подряд
    for (const i of [0, 1, 3, 4, 5, 6]) ls.push(L(i, 21), L(i, 9), L(i, 12))        // ещё 18 часов, поздние уроки каждый день
    ls.push(L(2, 19))                                                                  // итого 26 > нормы 25
    const w = mount(WeekLoad, { props: { dates, activeOf, lessons: ls } })
    const t = w.find('.warns').text()
    expect(w.find('.state').text()).toBe('Риск выгорания')
    expect(t).toContain('Выше вашей нормы'); expect(t).toContain('Ср: 8 уроков за день'); expect(t).toContain('7 уроков подряд')
    expect(t).toContain('Нет ни одного выходного'); expect(t).toContain('Поздние уроки')
  })

  it('норма меняется кнопками и меняет зону', async () => {
    const ls = Array.from({ length: 22 }, (_, k) => L(k % 5, 8 + Math.floor(k / 5)))
    const w = mount(WeekLoad, { props: { dates, activeOf, lessons: ls } })
    expect(w.find('.state').text()).toBe('Плотно')                                    // 22 из 25
    for (let k = 0; k < 5; k++) await w.findAll('.norm button')[0].trigger('click')   // норма 20
    expect(w.find('.state').text()).toBe('Риск выгорания')
  })
})

// Курс у ученика: преподаватель назначает и смотрит прохождение; ученик проходит — «Сейчас» переезжает дальше.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, API: 'https://api', fb: 'key', apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)

import StudentCourses from './StudentCourses.vue'
import CourseViewer from './CourseViewer.vue'

const tasks = [{ id: 'a', type: 'lesson', title: 'Урок 1' }, { id: 'v', type: 'video', title: 'Кружок' }, { id: 'b', type: 'lesson', title: 'Урок 2' }]

describe('курс у ученика', () => {
  beforeEach(() => { setActivePinia(createPinia()); apiRequest.mockReset() })

  it('преподаватель: назначить → POST assign; прохождение — пройдено, «Сейчас», впереди', async () => {
    let assigned = false
    apiRequest.mockImplementation((p: string, o?: RequestInit) => {
      if (p.endsWith('/assign')) { assigned = JSON.parse(String(o!.body)).on; return ok({ ok: true }) }
      return ok({ courses: [{ id: 'k1', title: 'A1', total: 3, assigned, tasks, run: { done: assigned ? 1 : 0, lessons: assigned ? { a: { ok: 3, all: 4, sec: 90, at: Date.now() } } : {} } }] })
    })
    const w = mount(StudentCourses, { props: { studentId: 's1' } })
    await flushPromises()
    expect(w.text()).toContain('Назначить')
    await w.find('.top .btn').trigger('click'); await flushPromises()
    expect(apiRequest.mock.calls.find((c) => c[0] === '/courses/k1/assign')![1].body).toBe(JSON.stringify({ studentId: 's1', on: true }))
    expect(w.text()).toContain('1 из 3 · 33%')
    await w.find('.more').trigger('click')
    const li = w.findAll('.tl li')
    expect(li[0].classes()).toContain('d'); expect(li[0].text()).toContain('75%'); expect(li[0].text()).toContain('3 из 4')
    expect(li[1].text()).toContain('Сейчас'); expect(li[2].classes()).toContain('t')
  })

  it('ученик: курс со своим прогрессом, «Посмотрел — дальше» у кружка → POST done', async () => {
    apiRequest.mockImplementation((p: string) => {
      if (p === '/my/courses/k1') return ok({ id: 'k1', title: 'A1', items: [{ id: 'u1', type: 'unit', title: 'Chapter 1' }, ...tasks], run: { done: 1, lessons: {} } })
      if (p === '/my/courses/k1/done') return ok({ done: 2, lessons: { v: { ok: 0, all: 0, sec: 0, at: 1 } } })
      return ok({ items: {} })
    })
    const w = mount(CourseViewer, { props: { id: 'k1', student: true }, global: { stubs: { Teleport: true } } })
    await flushPromises()
    expect(w.text()).not.toContain('Как видит ученик')
    expect(w.find('.cpill').text()).toContain('1 из 3')
    await w.findAll('.vrow')[1].find('.bead').trigger('click')            // кружок — «Сейчас»
    await w.find('.kin .pgo').trigger('click'); await flushPromises()
    expect(apiRequest.mock.calls.some((c) => c[0] === '/my/courses/k1/done' && JSON.parse(c[1].body).itemId === 'v')).toBe(true)
    expect(w.find('.cpill').text()).toContain('2 из 3')
  })

  it('чекпоинт собирается сам: экраны уроков Chapter, где ученик ошибся; ошибок нет — экраны уроков Chapter', async () => {
    const ch = (id: string, ans: number) => ({ id, kind: 'choice', q: 'Как сказать «привет»?', opts: [{ w: 'Hello', t: 'привет' }, { w: 'Bye', t: 'пока' }], ans })
    const items = [{ id: 'u1', type: 'unit', title: 'Chapter 1' }, { id: 'a', type: 'lesson', title: 'Урок 1', steps: [ch('s1', 0), ch('s2', 0), ch('s3', 0)] }, { id: 'ck', type: 'checkpoint', title: 'Чекпоинт' }]
    let miss: string[] = ['s2']
    apiRequest.mockImplementation((p: string) => (p === '/my/courses/k1' ? ok({ id: 'k1', title: 'A1', items, run: { done: 1, lessons: { a: { ok: 2, all: 3, sec: 1, at: 1, miss } } } }) : ok({ items: {} })))
    let w = mount(CourseViewer, { props: { id: 'k1', student: true }, global: { stubs: { Teleport: true } } })
    await flushPromises()
    await w.findAll('.vrow')[1].find('.cap').trigger('click')
    expect(w.find('.pv').text()).toContain('1 экран'); expect(w.find('.cka').text()).toContain('Собран сам: 1 — где вы ошибались')
    expect(w.find('.pv').text()).not.toContain('Готово — дальше')
    miss = []; w.unmount()
    w = mount(CourseViewer, { props: { id: 'k1', student: true }, global: { stubs: { Teleport: true } } })
    await flushPromises()
    await w.findAll('.vrow')[1].find('.cap').trigger('click')
    expect(w.find('.cka').text()).toContain('Собран сам из уроков Chapter: 3')
  })
})

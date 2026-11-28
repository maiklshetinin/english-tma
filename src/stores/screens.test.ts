// Данные по экранам: что нужно вкладке, что уходит на сервер при входе на неё и внутри урока, как обновляется уже прочитанное.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiRequest = vi.fn()
vi.mock('../firebase', () => ({ isDemo: false, apiRequest: (...a: unknown[]) => apiRequest(...a), apiFetch: vi.fn(), tg: undefined, fb: null }))

import { toast } from '../composables/useToast'
import { isLoaded, resetLazy } from './lazy'
import { CHANGED, inLesson, loadNeeds, need, refresh, screenNeeds, setCurrent, stopRefresh, unread } from './screens'
import { useStudentsStore } from './students'

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const week = (weekStart: string) => ({ weekStart, lessons: [] })
const BODY: Record<string, unknown> = {
  '/students': [], '/students/archived': [], '/schedule': { current: week('2026-11-23'), next: week('2026-11-30') },
  '/groups': { groups: [], seeded: true }, '/content': { paths: {}, presets: [], decks: [] }, '/srs': { users: {} },
}
const asked = () => apiRequest.mock.calls.map((c) => c[0] as string).sort()
const at = (name: string, o: { id?: string; l?: string } = {}) => ({ name, params: o.id ? { id: o.id } : {}, query: o.l ? { c: 'k1', l: o.l } : {} })

describe('screenNeeds — что нужно экрану', () => {
  it('преподаватель, «Главная»: ученики, архив (для проведённых уроков), расписание, группы — без пути и колод', () => {
    expect(screenNeeds(at('home'), 'teacher').sort()).toEqual(['archived', 'groups', 'schedule', 'students'])
  })
  it('преподаватель, «Ученики»: плюс путь и колоды; прогресс слов — только когда открыта карточка ученика', () => {
    expect(screenNeeds(at('students'), 'teacher')).not.toContain('srs')
    expect(screenNeeds(at('students'), 'teacher')).toContain('content')
    expect(screenNeeds(at('students', { id: '2' }), 'teacher')).toEqual(expect.arrayContaining(['content', 'srs']))
    expect(screenNeeds(at('home', { id: '2' }), 'teacher')).toEqual(expect.arrayContaining(['students', 'content', 'srs']))
  })
  it('преподаватель: «Курсы», Review, «Как работает курс» ничего общего не просят; «Слова» — колоды и прогресс; редактор карточек — только колоды', () => {
    for (const n of ['path', 'review', 'review-algo', 'course-how']) expect(screenNeeds(at(n), 'teacher'), n).toEqual([])
    expect(screenNeeds(at('words'), 'teacher').sort()).toEqual(['content', 'srs'])
    expect(screenNeeds(at('cards-studio'), 'teacher')).toEqual(['content'])
    expect(screenNeeds(at('profile'), 'teacher')).toEqual(['students'])
    expect(screenNeeds(at('info'), 'teacher').sort()).toEqual(['archived', 'students'])
  })
  it('ученик: «Путь» и «Слова» — путь, колоды, прогресс; «Уроки» — расписание; Review — только своя запись', () => {
    expect(screenNeeds(at('path'), 'student').sort()).toEqual(['content', 'srs', 'students'])
    expect(screenNeeds(at('cards'), 'student').sort()).toEqual(['content', 'srs', 'students'])
    expect(screenNeeds(at('lessons'), 'student').sort()).toEqual(['schedule', 'students'])
    expect(screenNeeds(at('review'), 'student')).toEqual(['students'])
  })
  it('внутри открытого урока (#/path?c=…&l=…) — ничего, у обеих ролей; без урока — как обычно', () => {
    expect(inLesson(at('path', { l: 'x' }))).toBe(true); expect(inLesson(at('path'))).toBe(false); expect(inLesson(at('cards', { l: 'x' }))).toBe(false)
    expect(screenNeeds(at('path', { l: 'x' }), 'student')).toEqual([])
    expect(screenNeeds(at('path', { l: 'x' }), 'teacher')).toEqual([])
    expect(screenNeeds(at('path'), 'student').length).toBeGreaterThan(0)
  })
})

describe('загрузка по экрану', () => {
  beforeEach(() => { setActivePinia(createPinia()); resetLazy(); stopRefresh(); apiRequest.mockReset(); apiRequest.mockImplementation((p: string) => ok(BODY[p] ?? {})); toast.open = false })

  it('вход на «Главную» читает ровно своё; повторный вход — из кэша, ни одного запроса', async () => {
    await loadNeeds(screenNeeds(at('home'), 'teacher'))
    expect(asked()).toEqual(['/groups', '/schedule', '/students', '/students/archived'])          // расписание и ученики для групп — по разу, не дважды
    apiRequest.mockClear()
    await loadNeeds(screenNeeds(at('home'), 'teacher'))
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('обновление страницы внутри урока: ни одного запроса за данными других вкладок', async () => {
    for (const role of ['teacher', 'student'] as const) await loadNeeds(screenNeeds(at('path', { l: 'lesson-1' }), role))
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('ученик: путь и колоды читаются отдельно от прогресса слов', async () => {
    await need('content'); expect(asked()).toEqual(['/content'])
    await need('srs'); expect(asked()).toEqual(['/content', '/srs'])
    expect(unread(['content', 'srs', 'groups'])).toEqual(['groups'])
  })

  it('закрыли урок — вкладка под ним дочитывается; то, что уже есть, не читается заново', async () => {
    await need('students'); apiRequest.mockClear()
    await loadNeeds(screenNeeds(at('path'), 'student'))
    expect(asked()).toEqual(['/content', '/srs'])
  })

  it('группы переносятся из расписания только когда прочитаны и ученики, и расписание', async () => {
    apiRequest.mockImplementation((p: string) => (p === '/schedule' ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response) : ok(p === '/groups' ? { groups: [], seeded: false } : BODY[p] ?? {})))
    await loadNeeds(['groups'])
    expect(asked()).not.toContain('/groups/seed')           // расписания нет — переносить нечего, иначе «перенесётся» пустота и больше не повторится
  })

  it('ошибка чтения — тост; данные не считаются прочитанными, следующий вход пробует снова', async () => {
    apiRequest.mockImplementation((p: string) => (p === '/students' ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response) : ok(BODY[p] ?? {})))
    await loadNeeds(['students'])
    expect(toast.open).toBe(true); expect(toast.kind).toBe('bad'); expect(isLoaded('students')).toBe(false)
    apiRequest.mockImplementation((p: string) => ok(BODY[p] ?? {}))
    await loadNeeds(['students']); expect(isLoaded('students')).toBe(true)
  })
})

describe('обновление уже прочитанного (коллега изменил / вернулись в приложение)', () => {
  beforeEach(() => { setActivePinia(createPinia()); resetLazy(); stopRefresh(); apiRequest.mockReset(); apiRequest.mockImplementation((p: string) => ok(BODY[p] ?? {})) })

  it('нужное открытому экрану — читается заново сразу, остальное — при следующем входе', async () => {
    await loadNeeds(['students', 'schedule'])
    setCurrent(['students']); apiRequest.mockClear()
    refresh(['students', 'schedule'])
    await vi.waitFor(() => expect(asked()).toEqual(['/students']))
    apiRequest.mockClear()
    await loadNeeds(['students', 'schedule'])                 // расписание — устаревшее: при входе на его экран читается
    expect(asked()).toContain('/schedule')
  })

  it('внутри урока (нужного нет) не читается ничего; не открывавшееся в сессии — тоже', async () => {
    await need('students'); setCurrent([]); apiRequest.mockClear()
    refresh(['students', 'schedule', 'content'])
    await Promise.resolve()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('«коллега изменил»: что перечитывается; «в сети» учеников не трогает список', () => {
    expect(CHANGED.students).toEqual(['students']); expect(CHANGED.decks).toEqual(['content']); expect(CHANGED.content).toEqual(['content', 'srs'])
    useStudentsStore().set([{ id: 'a', name: 'А' } as never])
    expect(useStudentsStore().list).toHaveLength(1)
  })
})

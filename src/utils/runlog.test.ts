import { describe, it, expect, beforeEach } from 'vitest'
import { makeRunLog, newRun, byDay, dur, seen, saveLocal, readLocal, removeLocal, DELAY } from './runlog'

function clock() {
  let t = 1_000_000, fn: (() => void) | null = null
  return {
    now: () => t, go: (ms: number) => { t += ms }, fire: () => { const f = fn; fn = null; f?.() },
    timer: { set: (f: () => void) => { fn = f; return 1 }, clear: () => { fn = null } },
  }
}

describe('журнал захода в урок', () => {
  it('id захода — как проверяет сервер', () => { expect(newRun()).toMatch(/^[A-Za-z0-9]{6,32}$/) })

  it('пишет по ходу: время на экране, ответы, попытки, текст — пачкой через DELAY', () => {
    const c = clock(), sent: any[] = []
    const log = makeRunLog({ itemId: 'a', n: 3, send: (b) => sent.push(b), now: c.now, timer: c.timer })
    log.step('s1'); c.go(4000)
    log.answer('s1', { ok: false, text: ' cat ' }); c.go(2000)
    log.answer('s1', { ok: true, text: 'cats' })
    expect(sent).toHaveLength(0)
    c.fire()                                       // прошло DELAY — ушла пачка
    expect(DELAY).toBeGreaterThan(0)
    expect(sent[0]).toMatchObject({ itemId: 'a', n: 3, fin: false, steps: { s1: { ok: true, sec: 6, t: 2, x: 'cats' } } })
    log.step('s2'); c.go(3000); log.answer('s2', { ok: null })
    log.step('s3'); c.go(1500); log.answer('s3', { ok: true, score: 87.4 })
    log.finish()
    const b = sent.at(-1)
    expect(b.fin).toBe(true)
    expect(b.steps.s2).toEqual({ ok: null, sec: 3, t: 0 })
    expect(b.steps.s3).toMatchObject({ ok: true, t: 1, sc: 87 })
    expect(b.sec).toBe(11)
    expect(b.run).toBe(sent[0].run)                // один заход — один run
  })

  it('закрыл недоделанный урок — отправляет, что есть; без изменений — не шлёт', () => {
    const c = clock(), sent: any[] = []
    const log = makeRunLog({ itemId: 'a', n: 5, send: (b) => sent.push(b), now: c.now, timer: c.timer })
    log.step('s1'); c.go(1000); log.close()
    expect(sent).toHaveLength(1); expect(sent[0].fin).toBe(false); expect(sent[0].steps.s1.sec).toBe(1)
    log.flush(); expect(sent).toHaveLength(1)
    log.save(); expect(sent).toHaveLength(2)        // свернули вкладку — шлём сейчас
  })
})

describe('журнал по дням', () => {
  beforeEach(() => localStorage.clear())
  it('день: разных уроков, минуты, верно', () => {
    const at = new Date(2026, 10, 21, 10).getTime(), at2 = new Date(2026, 10, 20, 9).getTime()
    const runs = [
      { run: 'r1', course: 'k', item: 'a', at, sec: 600, ok: 3, all: 4, fin: true, steps: [] },
      { run: 'r2', course: 'k', item: 'a', at: at + 3600e3, sec: 300, ok: 1, all: 2, fin: false, steps: [] },
      { run: 'r3', course: 'k', item: 'b', at: at2, sec: 60, ok: 0, all: 0, fin: true, steps: [] },
    ]
    const d = byDay(runs)
    expect(d.map((x) => x.day)).toEqual(['2026-11-21', '2026-11-20'])
    expect(d[0]).toMatchObject({ lessons: 1, sec: 900, ok: 4, all: 6, fin: 1 })
    expect(d[0].runs).toHaveLength(2)
  })
  it('длительность и пройденные экраны', () => {
    expect(dur(40)).toBe('40 с'); expect(dur(720)).toBe('12 мин'); expect(dur(3900)).toBe('1 ч 05 мин')
    expect(seen({ steps: [{ id: 'a', ok: true, sec: 3 }, { id: 'b', ok: null, sec: 1 }, { id: 'c' }] })).toBe(2)
  })
  it('без сервера: в этом браузере, тот же заход перезаписывается, номер попытки', () => {
    saveLocal({ run: 'r1', course: 'k', item: 'a', at: 1, steps: [] })
    saveLocal({ run: 'r2', course: 'k', item: 'a', at: 2, steps: [] })
    saveLocal({ run: 'r1', course: 'k', item: 'a', at: 1, fin: true, steps: [] })
    const r = readLocal()
    expect(r.map((x: any) => `${x.run}:${x.try}`)).toEqual(['r2:2', 'r1:1'])
    expect(r[1].fin).toBe(true)
  })
  it('без сервера: удалить один заход и весь журнал', () => {
    saveLocal({ run: 'r1', course: 'k', item: 'a', at: 1, steps: [] }); saveLocal({ run: 'r2', course: 'k', item: 'b', at: 2, steps: [] })
    removeLocal(['r1']); expect(readLocal().map((x: any) => x.run)).toEqual(['r2'])
    removeLocal(); expect(readLocal()).toEqual([])
  })
})

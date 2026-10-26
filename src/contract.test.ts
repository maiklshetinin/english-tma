// Контракт фронт ↔ сервер: всё, что создаёт сайт, должно проходить настоящие серверные проверки (server/clean.ts).
// Если поменять форму данных только с одной стороны, этот тест упадёт.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { cleanDeck, cleanPreset, cleanRate, cleanSrsState, cleanUnits, id as cleanId } from '../server/clean'

const bodies: { method: string; path: string; body: any }[] = []
vi.mock('./firebase', () => ({ isDemo: false, apiRequest: (path: string, o?: RequestInit) => { bodies.push({ method: o?.method ?? 'GET', path, body: o?.body ? JSON.parse(o.body as string) : undefined }); return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, coins: 0 }) } as Response) }, apiFetch: vi.fn(), tg: undefined, fb: null }))

import { loadDemo, DEMO_STUDENTS } from './store/demo'
import { usePathStore } from './stores/path'
import { useDecksStore } from './stores/decks'
import { useSrsStore } from './stores/srs'
import { useStudentsStore } from './stores/students'
import { session } from './stores/session'
import { addNode, addUnit } from './utils/path'
import { newId } from './utils/id'
import { nextSrs, rate } from './composables/useSrs'

const settle = () => vi.advanceTimersByTimeAsync(1500)

describe('контракт фронт ↔ сервер', () => {
  beforeEach(() => { vi.useFakeTimers(); setActivePinia(createPinia()); bodies.length = 0; session.canEdit = true; session.ownKey = 'teacher' })

  it('id, которые придумывает сайт, подходят серверу', () => {
    for (const p of ['n', 'u', 'p', 'd', 'c', 'x']) expect(() => cleanId(newId(p), 'id')).not.toThrow()
    expect(new Set(Array.from({ length: 500 }, () => newId('n'))).size).toBe(500)
  })

  it('все демо-пути, пресеты и колоды проходят проверку сервера', async () => {
    await loadDemo()
    const path = usePathStore(), decks = useDecksStore()
    for (const st of DEMO_STUDENTS) expect(() => cleanUnits(path.of(st.id)), 'путь ' + st.name).not.toThrow()
    for (const p of path.presets) expect(() => cleanPreset({ name: p.name, units: p.units }), 'пресет ' + p.name).not.toThrow()
    for (const d of decks.list) expect(() => cleanDeck({ title: d.title, forAll: d.forAll, assigned: d.assigned, newPerDay: d.newPerDay, source: d.source, cards: d.cards }), 'колода ' + d.title).not.toThrow()
  })

  it('что сайт реально отправляет при правках, сервер принимает без потерь', async () => {
    loadDemo(); await settle(); bodies.length = 0
    const path = usePathStore(), decks = useDecksStore()
    const sid = DEMO_STUDENTS[1].id

    // конструктор пути: новый юнит и кружки всех типов
    const ui = addUnit(path.of(sid)) - 1
    for (const t of ['hw', 'cards', 'combo'] as const) addNode(path.of(sid), ui, t)
    path.of(sid)[ui].nodes[0].desc = 'Сделать упражнение'
    // пресеты: из пути и добавление в путь
    const preset = path.presetFromPath('Из пути', path.of(sid)); path.applyPreset(DEMO_STUDENTS[2].id, preset)
    // колода: создать, добавить карточки так, как это делает редактор (с пустым примером)
    const deck = decks.add('Новая', 'https://docs.google.com/spreadsheets/d/x'); deck.cards.push({ id: newId('c'), front: 'word', back: 'слово', example: '' })
    deck.forAll = true; deck.newPerDay = 7
    await settle()

    const put = (re: RegExp) => bodies.filter((b) => b.method === 'PUT' && re.test(b.path))
    const paths = put(/^\/paths\//), presets = put(/^\/presets\//), dk = put(/^\/decks\//)
    expect(paths.length).toBe(2); expect(presets.length).toBe(1); expect(dk.length).toBe(1)
    for (const b of paths) { const clean = cleanUnits(b.body.units); expect(clean.length).toBe(b.body.units.length) }
    const sent = paths.find((b) => b.path === `/paths/${sid}`)!.body.units
    const back = cleanUnits(sent)
    expect(back[ui].nodes.map((n) => n.type)).toEqual(['hw', 'cards', 'combo'])
    expect(back[ui].nodes[0].desc).toBe('Сделать упражнение')
    expect(cleanPreset(presets[0].body).name).toBe('Из пути')
    const cd = cleanDeck(dk[0].body)
    expect(cd.cards).toHaveLength(1); expect(cd.newPerDay).toBe(7); expect(cd.forAll).toBe(true); expect(cd.source.url).toContain('docs.google.com')
  })

  it('состояния повторений и ответы на карточки проходят проверку сервера', async () => {
    useStudentsStore().set([]); session.ownKey = 's1'
    const card = { id: newId('c'), front: 'a', back: 'б' }
    for (const q of [0, 1, 2, 3]) expect(() => cleanSrsState(nextSrs(null, q)), 'оценка ' + q).not.toThrow()
    let s = nextSrs(null, 2); for (let i = 0; i < 12; i++) s = nextSrs(s, i % 5 === 4 ? 0 : 2)
    expect(() => cleanSrsState(s)).not.toThrow()
    rate('s1', card, 2)
    await vi.advanceTimersByTimeAsync(50)
    const sent = bodies.find((b) => b.path === '/srs/rate')!.body
    expect(() => cleanRate(sent)).not.toThrow()
    expect(useSrsStore().of('s1')!.cards[card.id]).toBeDefined()
  })

  it('отметка кружка: тело запроса — только nodeId', async () => {
    loadDemo(); await settle(); bodies.length = 0
    const sid = DEMO_STUDENTS[0].id
    const node = usePathStore().of(sid).flatMap((u) => u.nodes).find((n) => !n.done)!
    usePathStore().complete(node, sid)
    await vi.advanceTimersByTimeAsync(50)
    const b = bodies.find((x) => x.path === `/paths/${sid}/complete`)!
    expect(b.method).toBe('POST'); expect(b.body).toEqual({ nodeId: node.id }); expect(() => cleanId(b.body.nodeId, 'node id')).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { newer } from './useUpdates'

const log = [{ h: 'e', s: 'E' }, { h: 'd', s: 'D' }, { h: 'c', s: 'C' }, { h: 'b', s: 'B' }, { h: 'a', s: 'A' }]
describe('useUpdates.newer', () => {
  it('коммиты новее моего, по порядку', () => expect(newer(log, 'c')).toEqual({ items: [{ h: 'e', s: 'E' }, { h: 'd', s: 'D' }], more: 0 }))
  it('не больше четырёх и «ещё N»', () => expect(newer(log, 'zzz')).toEqual({ items: log.slice(0, 4), more: 1 }))
  it('моя сборка — последняя: пусто', () => expect(newer(log, 'e').items).toEqual([]))
})

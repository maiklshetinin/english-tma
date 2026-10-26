// Импорт колоды из таблицы: колонки A–F (слово, перевод, пример, перевод примера, фото, озвучка), обновление по слову, отсев чужих ссылок.
import { describe, expect, it } from 'vitest'
import { mergeCards, parseCards } from './useSheetImport'

const DRIVE = 'https://drive.google.com/file/d/1AbC/view'
const SND = 'https://storage.googleapis.com/b/plot.mp3'
const csv = (...lines: string[]) => lines.join('\n')
const deck = () => ({ cards: [] as any[] })

describe('parseCards', () => {
  it('читает колонки A–F, пропускает заголовок и пустые строки', () => {
    const rows = parseCards(csv('Word,Translation,Example,Example translation,Image,Audio', `plot,сюжет,Let me tell you the plot.,Давай я расскажу сюжет.,${DRIVE},${SND}`, ',,,,,', 'deadline,срок'))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ front: 'plot', back: 'сюжет', example: 'Let me tell you the plot.', exampleTr: 'Давай я расскажу сюжет.', image: DRIVE, audio: SND })
    expect(rows[1]).toMatchObject({ front: 'deadline', back: 'срок', example: '', exampleTr: '', image: '', audio: '' })
  })
  it('понимает ячейки, скопированные из таблицы (табуляция) и запятые в кавычках', () => {
    const rows = parseCards(`plot\tсюжет\t"Well, the plot."\t"Ну, сюжет."\t${DRIVE}\t${SND}`)
    expect(rows[0].example).toBe('Well, the plot.'); expect(rows[0].image).toBe(DRIVE); expect(rows[0].audio).toBe(SND)
  })
})

describe('mergeCards', () => {
  it('новые слова добавляются со всеми полями, пустые поля не создаются', () => {
    const d = deck()
    const r = mergeCards(d, parseCards(csv(`plot,сюжет,Ex.,Пр.,${DRIVE},${SND}`, 'deadline,срок')))
    expect(r).toEqual({ added: 2, updated: 0, badLinks: 0 })
    expect(d.cards[0]).toMatchObject({ front: 'plot', back: 'сюжет', example: 'Ex.', exampleTr: 'Пр.', image: DRIVE, audio: SND })
    expect(Object.keys(d.cards[1]).sort()).toEqual(['back', 'front', 'id'])
  })
  it('повторная синхронизация обновляет по слову, сохраняет id и не стирает данные пустыми ячейками', () => {
    const d = deck()
    mergeCards(d, parseCards(`plot,сюжет,Ex.,Пр.,${DRIVE},${SND}`))
    const id = d.cards[0].id
    const r = mergeCards(d, parseCards('Plot,сюжет (книги),,,,'))
    expect(r).toEqual({ added: 0, updated: 1, badLinks: 0 })
    expect(d.cards).toHaveLength(1)
    expect(d.cards[0]).toMatchObject({ id, back: 'сюжет (книги)', example: 'Ex.', exampleTr: 'Пр.', image: DRIVE, audio: SND })
    expect(mergeCards(d, parseCards(`plot,сюжет (книги),Ex.,Пр.,${DRIVE},${SND}`)).updated).toBe(0)       // ничего не изменилось
  })
  it('ссылки не на Google пропускаются и считаются, слово при этом добавляется', () => {
    const d = deck()
    const r = mergeCards(d, parseCards('plot,сюжет,,,https://evil.example.com/a.png,http://drive.google.com/uc?id=1'))
    expect(r).toEqual({ added: 1, updated: 0, badLinks: 2 })
    expect(d.cards[0].image).toBeUndefined(); expect(d.cards[0].audio).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import { cardsFromJson, cardJson, cardsToTsv } from './cardsJson'

describe('карточки ⇄ JSON', () => {
  it('массив, обёртка cards, синонимы ключей', () => {
    expect(cardsFromJson('[{"front":"apple","back":"яблоко"}]').cards).toEqual([{ front: 'apple', back: 'яблоко' }])
    const r = cardsFromJson('{"cards":[{"word":"cat","translation":"кошка","sentence":"My cat sleeps.","example_translation":"Моя кошка спит."},{"word":"dog"}]}')
    expect(r.cards).toEqual([{ front: 'cat', back: 'кошка', example: 'My cat sleeps.', exampleTr: 'Моя кошка спит.' }])
    expect(r.skipped).toBe(1)
  })
  it('ответ нейросети: текст и несколько ```json-блоков', () => {
    const t = 'Вот карточки:\n```json\n[{"front":"a","back":"б"}]\n```\nи ещё\n```json\n{"front":"c","back":"д"}\n```'
    expect(cardsFromJson(t).cards?.map((c: any) => c.front)).toEqual(['a', 'c'])
  })
  it('не JSON — null', () => { expect(cardsFromJson('привет').cards).toBeNull() })
  it('карточка → JSON без служебных полей; TSV с заголовками', () => {
    expect(cardJson({ id: 'x', front: 'a', back: 'б', due: 5, example: '' })).toEqual({ front: 'a', back: 'б' })
    expect(cardsToTsv([{ front: 'a\tb', back: 'в' }])).toBe('Слово\tПеревод\na b\tв')
  })
})

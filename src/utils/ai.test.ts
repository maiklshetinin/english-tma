import { describe, it, expect } from 'vitest'
import { checkAnswer, PASS } from './ai'
import { stepsFromJson, stepIssue, fishStep } from './lesson'

// поддельный сервер: запоминает запрос, отвечает заданным
const fake = (status: number, body: unknown) => {
  const calls: any[] = []
  const f = (async (path: string, init: any) => { calls.push({ path, body: JSON.parse(init.body) }); return { ok: status < 300, status, json: async () => body } }) as any
  return { f, calls }
}
const q = { question: 'Kiedy i jak obchodzimy Mikołajki?', reference: 'Mikołajki obchodzimy 6 grudnia…', answer: 'Szóstego grudnia, dzieci dostają prezenty' }

describe('Проверка ответа через мост', () => {
  it('запрос на /ai/check, оценка и зачёт от 60 %', async () => {
    const { f, calls } = fake(200, { score: 64.4, missed: ['подарки в ботинках'], feedback: 'Dobrze!', site: 'Gemini' })
    const r = await checkAnswer(q, f)
    expect(calls[0]).toEqual({ path: '/ai/check', body: { question: q.question, reference: q.reference, answer: q.answer } })
    expect(r).toEqual({ score: 64, missed: ['подарки в ботинках'], feedback: 'Dobrze!', site: 'Gemini', ok: true })
    expect(PASS).toBe(60)
  })
  it('свой промпт уходит на сервер, свой порог — считается здесь', async () => {
    const { f, calls } = fake(200, { score: 64, missed: [], feedback: '' })
    const r = await checkAnswer({ ...q, prompt: '  Sprawdzasz…  ', pass: 70 }, f)
    expect(calls[0].body.prompt).toBe('Sprawdzasz…'); expect(r.ok).toBe(false)
  })
  it('чату эталон уходит без оформления', async () => {
    const { f, calls } = fake(200, { score: 50, missed: [], feedback: '' })
    await checkAnswer({ ...q, reference: '==Adwent== trwa **cztery tygodnie** _(na przykład)_ pod_kreślnik\n• ==Choinka==: życie' }, f)
    expect(calls[0].body.reference).toBe('Adwent trwa cztery tygodnie (na przykład) pod_kreślnik\n- Choinka: życie')
  })
  it('мост не в сети — ошибка с текстом сервера', async () => {
    const { f } = fake(503, { error: 'Мост с чатом не в сети — откройте вкладку с чатом и скриптом' })
    await expect(checkAnswer(q, f)).rejects.toThrow(/не в сети/)
  })
})

describe('«Ответ по смыслу» в уроке', () => {
  it('рыба готова, без эталона — не готов', () => {
    expect(stepIssue(fishStep('kp'))).toBe('')
    expect(stepIssue({ id: 'a', kind: 'kp', text: 'Pytanie?' })).toBe('Нет эталона')
    expect(stepIssue({ id: 'a', kind: 'kp', ideal: 'x' })).toBe('Нет вопроса')
  })
  it('JSON вопросов ({ questions: [{ question, reference }] }) → экраны', () => {
    const r = stepsFromJson(JSON.stringify({ lesson_id: 'm2l6', pass_threshold: 70, api_config: { system_prompt: 'Sprawdzasz…' }, questions: [
      { id: 1, question: 'Kiedy i jak obchodzimy Mikołajki?', reference: 'Mikołajki obchodzimy…' }, { id: 2, question: 'Co to jest Wielki Post?', reference: 'Wielki Post to…' }, { id: 3, reference: 'без вопроса' }] }))!
    expect(r.steps.map(s => [s.kind, s.text, s.ideal])).toEqual([['kp', 'Kiedy i jak obchodzimy Mikołajki?', 'Mikołajki obchodzimy…'], ['kp', 'Co to jest Wielki Post?', 'Wielki Post to…']])
    expect(r.steps.every(s => s.prompt === 'Sprawdzasz…' && s.pass === 70)).toBe(true)          // промпт и порог урока — каждому экрану
    expect(r.steps.every(s => !stepIssue(s))).toBe(true)
  })
  it('JSON упражнения из учебника: задание (head), учебник (bk), номер (bn) и варианты ответа сохраняются', () => {
    const r = stepsFromJson(JSON.stringify([{ kind: 'gap', bk: 'bkword', bn: 5, head: 'Write the possessive adjectives', phrase: '(I) [My] sister is ten years old.', tr: 'Моей сестре десять лет.', opts: [] },
      { kind: 'gap', bk: 'bkqa', head: 'Answer the questions', phrase: 'Is he a doctor? [No, he isn’t./No, he is not./No he isn’t]', tr: 'Он врач? Нет.', opts: [] }]))!
    expect(r.steps[0]).toMatchObject({ kind: 'gap', bk: 'bkword', bn: 5, head: 'Write the possessive adjectives', phrase: '(I) [My] sister is ten years old.' })
    expect(r.steps[1].head).toBe('Answer the questions'); expect(r.bad).toBe(0)
  })
  it('правка экрана JSON-ом: поля заменяются, id и незагруженные файлы остаются, ошибки — понятным текстом', async () => {
    const { applyStepJson } = await import('./lesson')
    const s: any = { id: 'x1', kind: 'gap', phrase: 'A [b].', tr: 'a', image: 'idb:123', opts: [] }
    expect(applyStepJson(s, '{ сломано')).toMatch(/Не JSON/); expect(applyStepJson(s, '[{}]')).toMatch(/один объект/); expect(applyStepJson(s, '{"kind": "zzz"}')).toMatch(/Неизвестный kind «zzz»/)
    expect(s.phrase).toBe('A [b].')                                                                         // при ошибке экран не тронут
    expect(applyStepJson(s, JSON.stringify({ kind: 'gap', bk: 'bkword', head: 'Write it', phrase: '(He) [His] dog.', tr: 'Его собака.', image: 'idb:123', opts: [] }))).toBe('')
    expect(s).toMatchObject({ id: 'x1', kind: 'gap', bk: 'bkword', head: 'Write it', phrase: '(He) [His] dog.', image: 'idb:123' })
    expect(applyStepJson(s, JSON.stringify({ kind: 'odd', opts: [{ w: 'a' }, { w: 'b' }, { w: 'c' }], ans: 2 }))).toBe('')
    expect(s.kind).toBe('odd'); expect(s.phrase).toBeUndefined(); expect(s.ans).toBe(2); expect(s.id).toBe('x1')          // сменили тип — старые поля ушли
  })
  it('свой цвет плитки #rrggbb: фон как есть, текст — тёмный оттенок; кривой — по кругу', async () => {
    const { tileOf, TILE } = await import('./lesson')
    expect(tileOf('#E8D5FF', 0)).toEqual({ bg: '#e8d5ff', fg: '#4a4452' }); expect(tileOf('p', 0)).toEqual(TILE.p); expect(tileOf('#zzz', 1)).toEqual(TILE.g)
    const r = stepsFromJson(JSON.stringify({ kind: 'odd', opts: [{ w: 'a', k: '#FFAA00' }, { w: 'b', k: 'y' }, { w: 'c', k: 'red' }], ans: 0 }))!
    expect(r.steps[0].opts!.map((o) => o.k)).toEqual(['#ffaa00', '#fbedb0', undefined])          // буква → код
  })
  it('экраны по одному, каждый в ```json и с «[cite: 1]» (как отдаёт Gemini) — тоже вставляются', () => {
    const one = (w: string) => '```json\n{\n"kind": "gap",\n"bk": "bkword",\n"head": "Write the possessive adjectives",\n"phrase": "(He) [' + w + '] father {x}.",\n"tr": "Его отец.",\n"opts": []\n}\n```[cite: 1]'
    const r = stepsFromJson(one('His') + '\n\n' + one('My') + '\n\n' + one('Their'))!
    expect(r.steps.map((s) => s.phrase)).toEqual(['(He) [His] father {x}.', '(He) [My] father {x}.', '(He) [Their] father {x}.']); expect(r.steps[0].head).toBe('Write the possessive adjectives')
  })
  it('оформление из домашки: reference_html → разметка, звезда и номер', () => {
    const r = stepsFromJson(JSON.stringify({ questions: [{ id: 5, star: true, question: 'Tradycje?', reference: 'x',
      reference_html: '<p>Podczas <b>Wigilii</b>:</p><ul><li><b class="acc">Kolędowanie</b>: <i>„</i><b>Cicha noc</b><i>”</i> &amp; <i>(dary)</i></li></ul>' }, { id: 6, question: 'Bez?', reference: 'y' }] }))!
    expect(r.steps[0]).toMatchObject({ kind: 'kp', n: 5, star: true, ideal: 'Podczas **Wigilii**:\n• ==Kolędowanie==: „**Cicha noc**” & _(dary)_' })
    expect(r.steps[1].star).toBeUndefined(); expect(r.steps[1]).toMatchObject({ n: 6, ideal: 'y' })
  })
})

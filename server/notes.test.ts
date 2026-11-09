// Запуск: npx tsx notes.test.ts — заметки на общем экране (без базы) и их пересылка через WebSocket /live
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { makeNotes } from './notes.js'
import { makeLive } from './live.js'

let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const misha = { uid: 'tg:1', name: 'Миша', photo: '', color: '#f00' }, stasya = { uid: 'tg:2', name: 'Стася', photo: '', color: '#00f' }

const N = makeNotes()
ok('пустой текст и чужой путь — нет заметки', !N.create(misha, { path: '/', text: '   ' }) && !N.create(misha, { path: 'http://x', text: 'hi' }))
const n = N.create(misha, { path: '/', where: 'home', sel: 'div:nth-child(1)', rx: 0.5, ry: 2.9, x: 10, y: 20, text: ' Перенеси Веру ' })!
ok('заметка: место, первое сообщение, обрезано', n.path === '/' && n.ry === 2 && n.msgs[0].text === 'Перенеси Веру' && n.msgs[0].name === 'Миша' && !n.done)
N.reply(stasya, n.id, { text: 'Ок' })
ok('ответ', n.msgs.length === 2 && n.msgs[1].uid === 'tg:2')
N.react(stasya, n.id, n.msgs[0].id, '👍'); N.react(misha, n.id, n.msgs[0].id, '👍')
ok('реакции копятся', n.msgs[0].react['👍'].length === 2)
N.react(misha, n.id, n.msgs[0].id, '👍')
ok('повторное нажатие снимает реакцию', n.msgs[0].react['👍'].join() === 'tg:2')
ok('чужая реакция не принимается', !N.react(misha, n.id, n.msgs[0].id, '💩'))
ok('автор сразу «прочитал» свою заметку', n.seen['tg:1'] && n.seen['tg:2'] && !n.seen['tg:3'])
N.seen({ ...stasya, uid: 'tg:3' }, n.id); ok('прочитал', n.seen['tg:3'])
N.done(n.id, true); ok('готово', n.done)
N.reply(misha, n.id, { text: 'ещё' }); ok('ответ снова открывает', !n.done)
ok('удалить может только автор', !N.remove(stasya, n.id) && N.remove(misha, n.id) === n.id && !N.all().length)

// --- через WebSocket ---
const users: Record<string, any> = { a: { uid: 'tg:1', role: 'teacher', name: 'Миша', photo: '' }, b: { uid: 'tg:2', role: 'teacher', name: 'Стася', photo: '' }, c: { uid: 'tg:3', role: 'teacher', name: 'Оля', photo: '' } }
const notes = makeNotes()
const live = makeLive({ origins: [], verify: async (t) => users[t] ?? null, notes })
const srv = createServer(); live.attach(srv)
await new Promise<void>((r) => srv.listen(0, r))
const port = (srv.address() as any).port
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
function client(t: string) {
  const ws = new WebSocket(`ws://localhost:${port}/live?t=${t}`), got: any[] = []
  ws.on('message', (d) => got.push(JSON.parse(String(d))))
  return { ws, got, last: (type: string) => [...got].reverse().find((m) => m.t === type), send: (m: unknown) => ws.send(JSON.stringify(m)) }
}
const A = client('a'), B = client('b'), C = client('c'); await wait(200)
A.send({ t: 'note+', path: '/', where: 'home', text: 'Привет', ref: 'r1' }); await wait(100)
const got = B.last('note')
ok('новая заметка приходит всем, автору — с его ref', got?.note.msgs[0].text === 'Привет' && A.last('note')?.ref === 'r1' && C.last('note'))
B.send({ t: 'typing', id: got.note.id }); await wait(80)
ok('«печатает…» — другим, не себе', A.last('typing')?.name === 'Стася' && !B.last('typing'))
B.send({ t: 'note:reply', id: got.note.id, text: 'Ок' }); await wait(80)
ok('ответ — всем', A.last('note').note.msgs.length === 2)
A.send({ t: 'nudge', id: got.note.id, to: 'tg:2' }); await wait(80)
ok('«позвать» — только адресату', B.last('nudge')?.from.name === 'Миша' && !C.last('nudge') && !A.last('nudge'))
B.send({ t: 'note:seen', id: got.note.id }); await wait(80)
ok('закрыла уведомление — у автора «прочитано»', A.last('note').note.seen['tg:2'])
const D = client('c'); await wait(150)
ok('новичок получает заметки в hello', D.last('hello')?.notes.length === 1)
A.send({ t: 'note:del', id: got.note.id }); await wait(80)
ok('удаление — всем', B.last('note-')?.id === got.note.id)
for (const x of [A, B, C, D]) x.ws.close()
srv.close()
process.exit(bad ? 1 : 0)

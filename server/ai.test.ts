// npx tsx ai.test.ts — «Ответ по смыслу» через мост с чатом: текст для чата, разбор ответа, очередь
import { chatText, parseReply, makeAi } from './ai.js'
let fails = 0
const ok = (c: unknown, m: string) => { if (c) console.log('PASS', m); else { fails++; console.log('FAIL', m) } }
const status = async (p: Promise<unknown>) => { try { await p; return 0 } catch (e) { return (e as { status?: number }).status ?? -1 } }

// в чат уходит ровно prompt + message + format экрана; подставляются только метки; никакой обрезки и своих строк
{ const t2 = chatText('k9', { prompt: 'P', question: 'Q', reference: 'R', answer: 'A', message: 'Pytanie: {question} / {reference} / {answer}', format: 'JSON, id={id}' })
  ok(t2 === 'P\n\nPytanie: Q / R / A\n\nJSON, id=k9', 'prompt, message и format экрана — ровно они')
  const long = 'я'.repeat(10_000)
  ok(chatText('k', { message: long }) === long, 'длинный текст не обрезается')
  ok(chatText('k', { message: '  два  пробела\n\nи абзац ' }) === '  два  пробела\n\nи абзац ', 'пробелы и абзацы не трогаются')
  ok(chatText('k', {}) === '', 'экран ничего не прислал — пусто, своего текста не подставляем') }

const r = parseReply('k1', 'Вот оценка:\n```json\n{"id": "k1", "score": 72.4, "missed_points": ["про подарки", ""], "feedback": "Хорошо {в целом}"}\n```\nCopy code', 'id=k1')
ok(r?.score === 72.4 && r.missed.length === 2 && r.feedback === 'Хорошо {в целом}' && r.text.includes('Вот оценка'), 'JSON в обёртке ```json; значения как есть; text — весь ответ чата')
ok(parseReply('k1', '{"id": "k0", "score": 90} {"id": "k1", "score": 150}', 'id=k1')?.score === 150, 'метка id была в тексте — берётся объект со своим id; score не зажимается')
ok(parseReply('k1', '{"score": 55, "feedback": "ok"}', 'без метки')?.score === 55, 'метки в тексте не было — id в ответе не требуется')
ok(parseReply('k1', 'Не могу оценить', '') === null && parseReply('k1', '{"id": "k1"}', 'id=k1') === null, 'без JSON или без score — null')

const Q0 = { question: 'q', reference: 'r', answer: 'a', message: '{question}/{reference}/{answer}', format: 'JSON, id={id}' }
let now = 1e9
const store: { token: string } = { token: 'abc' }
const ai = makeAi({ loadToken: async () => store.token, saveToken: async (x) => { store.token = x }, now: () => now, jobMs: 200, pollMs: 50, seenMs: 60_000 })
ok(await status(ai.check(Q0)) === 503, 'моста не видно — сразу 503')
await ai.next('ChatGPT', () => {})
ok(await status(ai.check({ answer: 'a' })) === 400, 'экран не прислал message/format — 400, в чат нечего слать')
ok((await ai.next('ChatGPT', () => {})) === null && ai.status().online && ai.status().site === 'ChatGPT', 'пустой опрос — null, мост в сети')

const p = ai.check(Q0)
const job = await ai.next('ChatGPT', () => {})
ok(!!job && job.text.includes(job.id), 'скрипт получил задание')
ok(ai.done(job!.id, { text: `{"id":"${job!.id}","score":65,"missed_points":["x"],"feedback":"ok"}` }), 'ответ принят')
const res = await p
ok(res.score === 65 && res.missed[0] === 'x' && ai.status().served === 1, 'ученик получил оценку')
ok(res.site === 'ChatGPT', 'и знает, какой чат проверил')
ok(ai.pub().online && ai.pub().sites.includes('ChatGPT'), 'ученику видно, какой чат в сети')

const w = ai.next('Claude', () => {})                        // скрипт уже ждёт — задание отдаётся сразу
const p2 = ai.check(Q0)
const j2 = await w
ai.done(j2!.id, { text: 'Извините, не понял' })
ok(await status(p2) === 502 && ai.status().lastError.includes('JSON'), 'ответ не по формату — 502')
const p3 = ai.check(Q0); const j3 = await ai.next('Claude', () => {})
ai.done(j3!.id, { error: 'Чат не ответил' })
ok(await status(p3) === 502, 'ошибка скрипта — 502')
ok(await status(ai.check(Q0)) === 502, 'никто не забрал задание — по таймеру 502')

ok(await status(ai.check({ message: 'есть текст, но нет метки', format: 'JSON' })) === 400, 'в тексте нет {id} — сразу 400, а не 85 секунд ожидания')
let gone: () => void = () => {}
const w2 = ai.next('Gemini', (f) => { gone = f }); gone()
ok((await w2) === null, 'скрипт отключился — опрос закрыт')

ok(await ai.isToken('abc') && !(await ai.isToken('abd')) && !(await ai.isToken(undefined)), 'ключ моста сверяется')
const nt = await ai.newToken()
ok(nt.length >= 20 && store.token === nt && await ai.isToken(nt) && !(await ai.isToken('abc')), 'новый ключ — старый перестаёт работать')
now += 61_000
ok(!ai.status().online, 'минуту не было опроса — мост не в сети')

// мост 1.6: выключили во вкладке — чат сразу не в списке; последний — сразу «не в сети», невзятая проверка — сразу ошибкой
{ let n2 = 1e9
  const a2 = makeAi({ loadToken: async () => 'abc', saveToken: async () => {}, now: () => n2, jobMs: 100_000, pollMs: 50, seenMs: 60_000 })
  await a2.next('ChatGPT', () => {}); await a2.next('Gemini', () => {})
  ok(a2.bye('Gemini').online && a2.pub().sites.join() === 'ChatGPT', 'выключили Gemini — остался ChatGPT, мост в сети')
  const t0 = Date.now(), pr = status(a2.check(Q0))
  ok(!a2.bye('ChatGPT').online && !a2.pub().online, 'выключили последний — сразу не в сети')
  ok(await pr === 502 && Date.now() - t0 < 1000, 'невзятая проверка — сразу ошибкой, не ждёт 100 с')
  ok(await status(a2.check(Q0)) === 503, 'после выключения — сразу 503') }

if (fails) { console.log(`\n${fails} FAIL`); process.exit(1) } else console.log('\nвсё PASS')

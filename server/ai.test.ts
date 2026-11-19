// npx tsx ai.test.ts — «Ответ по смыслу» через мост с чатом: текст для чата, разбор ответа, очередь
import { chatText, parseReply, makeAi } from './ai.js'
let fails = 0
const ok = (c: unknown, m: string) => { if (c) console.log('PASS', m); else { fails++; console.log('FAIL', m) } }
const status = async (p: Promise<unknown>) => { try { await p; return 0 } catch (e) { return (e as { status?: number }).status ?? -1 } }

const t = chatText('k1a2b3', { question: 'Kiedy Mikołajki?', reference: '6 grudnia', answer: 'Szóstego grudnia' })
ok(t.includes('Kiedy Mikołajki?') && t.includes('6 grudnia') && t.includes('Szóstego grudnia') && t.includes('k1a2b3') && t.startsWith('Ты проверяешь'), 'вопрос, эталон, ответ и метка — в тексте; промпт по умолчанию')
ok(chatText('x', { prompt: 'Свой промпт', reference: 'r', answer: 'a' }).startsWith('Свой промпт'), 'свой промпт экрана')

const r = parseReply('k1', 'Вот оценка:\n```json\n{"id": "k1", "score": 72.4, "missed_points": ["про подарки", ""], "feedback": "Хорошо {в целом}"}\n```\nCopy code')
ok(r?.score === 72 && r.missed.length === 1 && r.feedback === 'Хорошо {в целом}', 'JSON в обёртке ```json, скобки внутри строки не мешают')
ok(parseReply('k1', '{"id": "k0", "score": 90, "missed_points": [], "feedback": ""} {"id": "k1", "score": 150, "missed_points": [], "feedback": ""}')?.score === 100, 'берётся объект со своим id, score — в пределах 0–100')
ok(parseReply('k1', 'Не могу оценить') === null && parseReply('k1', '{"id": "k1"}') === null, 'без JSON или без score — null')

let now = 1e9
const store: { token: string } = { token: 'abc' }
const ai = makeAi({ loadToken: async () => store.token, saveToken: async (x) => { store.token = x }, now: () => now, jobMs: 200, pollMs: 50, seenMs: 60_000 })
ok(await status(ai.check({ question: 'q', reference: 'r', answer: 'a' })) === 503, 'моста не видно — сразу 503')
ok(await status(ai.check({ question: 'q', reference: 'r', answer: '' })) === 400, 'пустой ответ — 400')
ok((await ai.next('ChatGPT', () => {})) === null && ai.status().online && ai.status().site === 'ChatGPT', 'пустой опрос — null, мост в сети')

const p = ai.check({ question: 'q', reference: 'r', answer: 'a' })
const job = await ai.next('ChatGPT', () => {})
ok(!!job && job.text.includes(job.id), 'скрипт получил задание')
ok(ai.done(job!.id, { text: `{"id":"${job!.id}","score":65,"missed_points":["x"],"feedback":"ok"}` }), 'ответ принят')
const res = await p
ok(res.score === 65 && res.missed[0] === 'x' && ai.status().served === 1, 'ученик получил оценку')
ok(res.site === 'ChatGPT', 'и знает, какой чат проверил')
ok(ai.pub().online && ai.pub().sites.includes('ChatGPT'), 'ученику видно, какой чат в сети')

const w = ai.next('Claude', () => {})                        // скрипт уже ждёт — задание отдаётся сразу
const p2 = ai.check({ question: 'q', reference: 'r', answer: 'a' })
const j2 = await w
ai.done(j2!.id, { text: 'Извините, не понял' })
ok(await status(p2) === 502 && ai.status().lastError.includes('JSON'), 'ответ не по формату — 502')
const p3 = ai.check({ question: 'q', reference: 'r', answer: 'a' }); const j3 = await ai.next('Claude', () => {})
ai.done(j3!.id, { error: 'Чат не ответил' })
ok(await status(p3) === 502, 'ошибка скрипта — 502')
ok(await status(ai.check({ question: 'q', reference: 'r', answer: 'a' })) === 502, 'никто не забрал задание — по таймеру 502')

let gone: () => void = () => {}
const w2 = ai.next('Gemini', (f) => { gone = f }); gone()
ok((await w2) === null, 'скрипт отключился — опрос закрыт')

ok(await ai.isToken('abc') && !(await ai.isToken('abd')) && !(await ai.isToken(undefined)), 'ключ моста сверяется')
const nt = await ai.newToken()
ok(nt.length >= 20 && store.token === nt && await ai.isToken(nt) && !(await ai.isToken('abc')), 'новый ключ — старый перестаёт работать')
now += 61_000
ok(!ai.status().online, 'минуту не было опроса — мост не в сети')

if (fails) { console.log(`\n${fails} FAIL`); process.exit(1) } else console.log('\nвсё PASS')

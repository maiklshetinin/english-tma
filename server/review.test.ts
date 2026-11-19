// Запуск: npx tsx review.test.ts — «Твой словарь» (без Firebase — база в памяти)
import { store, db, FieldValue } from './fake-db.js'
import { makeReview, cleanReviewItem, cleanAlgo, ALGO_DEFAULT, REVIEW_LIMITS, monthOf } from './review.js'
import type { TokenUser } from './types.js'

const R = makeReview({ db, FieldValue })
let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const code = async (p: Promise<unknown>) => { try { await p; return 200 } catch (e: any) { return e.status ?? 500 } }
const T0 = Date.parse('2026-11-09T18:00:00Z')
const it = (text: string, o: object = {}) => ({ key: text.toLowerCase(), kind: text.split(' ').length <= 2 ? 'word' : 'phrase', text, tr: 'перевод', s: 20, due: T0 + 864e5, seen: T0, ok: 0, bad: 0, hist: [{ t: T0, ok: null, ex: 'Новое слово', lesson: 'Урок 1' }], ...o })

store.set('students/s1', { name: 'Маша', archived: false, tgId: 10 })
store.set('students/s2', { name: 'Петя', archived: false, tgId: 11 })
const teacher: TokenUser = { uid: 'tg:1', role: 'teacher' }
const masha: TokenUser = { uid: 'tg:10', role: 'student', studentId: 's1' }
const petya: TokenUser = { uid: 'tg:11', role: 'student', studentId: 's2' }
const stray: TokenUser = { uid: 'tg:99', role: 'student', studentId: 's1' }

// --- запись и чтение ---
await R.save(masha, { items: { hello: it('Hello'), 'see you later': it('See you later', { s: 35, ok: 1 }) } })
ok('ученик: записи в свой документ', Object.keys(store.get('review/s1').items).length === 2 && store.get('review/s1').items['see you later'].s === 35)
await R.save(masha, { items: { hello: it('Hello', { s: 35, ok: 1 }) } })
ok('изменённая запись заменяется, остальные на месте', store.get('review/s1').items.hello.s === 35 && store.get('review/s1').items['see you later'].ok === 1)
ok('get — свой словарь', Object.keys((await R.get(masha)).items).length === 2)
ok('у Пети пусто', Object.keys((await R.get(petya)).items).length === 0)
await R.save(teacher, { items: { bye: it('Bye') } })
ok('преподаватель пишет в свой документ', !!store.get('review/teacher_tg:1').items.bye && !store.get('review/s1').items.bye)
ok('преподаватель читает словарь ученика', Object.keys((await R.get(teacher, 's1')).items).length === 2)
ok('ученик не читает чужой словарь → 403', (await code(R.get(petya, 's1'))) === 403)
ok('чужой аккаунт с чужим studentId → 403', (await code(R.save(stray, { items: { x: it('x') } }))) === 403)

// --- проверка формы ---
ok('лишние поля отбрасываются', !('evil' in cleanReviewItem({ ...it('Hi'), evil: 1 })))
ok('история обрезается', cleanReviewItem(it('Hi', { hist: Array.from({ length: 20 }, () => ({ t: T0, ok: true, ex: 'Пары' })) })).hist.length === REVIEW_LIMITS.hist)
ok('сила вне 0–100 → 400', (await code(R.save(masha, { items: { a: it('a', { s: 140 }) } }))) === 400)
ok('плохой kind → 400', (await code(R.save(masha, { items: { a: it('a', { kind: 'x' }) } }))) === 400)
ok('ключ «__…» → 400', (await code(R.save(masha, { items: { a: it('a', { key: '__name__' }) } }))) === 400)
const mem = { s: 2.31, d: 2.1, last: T0, n: 1, l: 0, st: 2 }
ok('память FSRS сохраняется', JSON.stringify(cleanReviewItem(it('Hi', { f: mem })).f) === JSON.stringify(mem))
ok('плохая память → 400', (await code(R.save(masha, { items: { a: it('a', { f: { ...mem, d: 40 } }) } }))) === 400)
ok('настройки по умолчанию', JSON.stringify(await R.algo()) === JSON.stringify(ALGO_DEFAULT))
await R.setAlgo({ retention: 0.85, maxDays: 365, evil: 1 })
ok('настройки сохраняются', (await R.algo()).retention === 0.85 && (await R.algo()).maxDays === 365 && !('evil' in cleanAlgo({ retention: 0.85, maxDays: 365, evil: 1 })))
ok('колоды: свои числа, без них — стандартные', cleanAlgo({ retention: 0.85, maxDays: 365 }).deckRetention === 0.9 && cleanAlgo({ retention: 0.85, maxDays: 365, deckRetention: 0.8, deckMaxDays: 90 }).deckMaxDays === 90)
ok('запоминание вне 0.70–0.97 → 400', (await code(R.setAlgo({ retention: 0.99, maxDays: 365 }))) === 400)
ok('экран урока сохраняется', cleanReviewItem(it('Выбери ответ · hello', { key: 'screen:k1:l1:s1', kind: 'screen' })).kind === 'screen')
ok('навык сохраняется', cleanReviewItem(it('Слушание', { key: 'skill:listening', kind: 'skill' })).kind === 'skill')
ok('тема с чужим ключом → 400', (await code(R.save(masha, { items: { a: it('Present Perfect', { key: 'present perfect', kind: 'topic' }) } }))) === 400)
ok('слово с ключом навыка → 400', (await code(R.save(masha, { items: { a: it('x', { key: 'skill:x' }) } }))) === 400)
ok('нет items → 400', (await code(R.save(masha, {}))) === 400)
ok('слишком большая пачка → 413', (await code(R.save(masha, { items: Object.fromEntries(Array.from({ length: REVIEW_LIMITS.batch + 1 }, (_, k) => ['w' + k, it('w' + k)])) }))) === 413)

// --- избранное ---
await R.save(masha, { items: { apply: it('apply', { fav: true }), go: it('go', { fav: 'yes' }) } })
ok('избранное сохраняется (только true)', store.get('review/s1').items.apply.fav === true && !('fav' in store.get('review/s1').items.go))

// --- снимки навыков и тем по месяцам («Аналитика прогресса») ---
{ const f = { s: 12, d: 5, last: T0, n: 3, l: 0, st: 2 }, sk = (o: object = {}) => ({ key: 'skill:W', kind: 'skill', text: 'Письмо', tr: '', s: 90, due: T0 + 864e6, seen: T0, ok: 3, bad: 0, f, hist: [{ t: T0, ok: true, ex: 'Собери фразу' }], ...o })
  await R.save(masha, { items: { 'skill:W': sk(), hello: it('Hello') } })
  const m = store.get('review/s1').mon
  ok('снимок: навык в месяц ответа (по Москве), слова — нет', Object.keys(m).join() === '2026-11' && m['2026-11']['skill:W'].f.s === 12 && m['2026-11']['skill:W'].ok === true && !m['2026-11'].hello)
  await R.save(masha, { items: { 'skill:W': sk({ f: { ...f, s: 30 } }) } })
  ok('в том же месяце снимок обновляется, словарь при этом цел', store.get('review/s1').mon['2026-11']['skill:W'].f.s === 30 && store.get('review/s1').items['see you later'])
  const dec = T0 + 25 * 864e5
  await R.save(masha, { items: { 'skill:W': sk({ f: { ...f, s: 45, last: dec }, hist: [{ t: dec, ok: false, ex: 'x' }] }) } })
  ok('новый месяц — свой снимок, прошлый на месте', Object.keys(store.get('review/s1').mon).sort().join() === '2026-11,2026-12' && store.get('review/s1').mon['2026-12']['skill:W'].ok === false)
  ok('months — свои; преподаватель — ученика; ученик чужие — 403', Object.keys(await R.months(masha)).length === 2 && Object.keys(await R.months(teacher, 's1')).length === 2 && (await code(R.months(petya, 's1'))) === 403)
  ok('месяц по Москве: 31.12 22:30 UTC — уже январь', monthOf(Date.parse('2026-12-31T22:30:00Z')) === '2027-01')
  const mon: Record<string, Record<string, unknown>> = {}; for (let i = 0; i < 30; i++) mon[`2024-${String((i % 12) + 1).padStart(2, '0')}`.replace('2024', String(2024 + Math.floor(i / 12)))] = {}
  store.set('review/s2', { items: {}, mon }); await R.save(petya, { items: { 'skill:R': sk({ key: 'skill:R', text: 'Чтение' }) } })
  ok('хранится не больше 24 месяцев — старые убираются', Object.keys(store.get('review/s2').mon).length === 24 && !store.get('review/s2').mon['2024-01'])
}

// --- оценка по проценту (ИИ-проверка) в истории ---
{ const h = (g: unknown) => cleanReviewItem(it('Hi', { hist: [{ t: T0, ok: true, ex: 'ИИ', g }] })).hist[0] as any
  ok('оценка 1–4 в истории сохраняется', h(4).g === 4 && h(2).g === 2)
  ok('кривая оценка не сохраняется (без 400)', h(7).g === undefined && h('4').g === undefined && h(undefined).g === undefined) }

// --- очистка ---
await R.reset(masha)
ok('«Очистить» — свой словарь удалён, у преподавателя на месте', !store.has('review/s1') && store.has('review/teacher_tg:1'))

if (bad) { console.log(`\n${bad} FAIL`); process.exit(1) } else console.log('\nall passed')

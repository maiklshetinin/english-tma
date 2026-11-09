// Запуск: npx tsx review.test.ts — «Твой словарь» (без Firebase — база в памяти)
import { store, db, FieldValue } from './fake-db.js'
import { makeReview, cleanReviewItem, REVIEW_LIMITS } from './review.js'
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
ok('нет items → 400', (await code(R.save(masha, {}))) === 400)
ok('слишком большая пачка → 413', (await code(R.save(masha, { items: Object.fromEntries(Array.from({ length: REVIEW_LIMITS.batch + 1 }, (_, k) => ['w' + k, it('w' + k)])) }))) === 413)

// --- очистка ---
await R.reset(masha)
ok('«Очистить» — свой словарь удалён, у преподавателя на месте', !store.has('review/s1') && store.has('review/teacher_tg:1'))

if (bad) { console.log(`\n${bad} FAIL`); process.exit(1) } else console.log('\nall passed')

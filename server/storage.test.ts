// Запуск: npx tsx storage.test.ts — кружки в S3 (без сети: подпись и загрузка подменены)
import { Readable } from 'node:stream'
import { makeStorage, ownPrefix, VIDEO_MAX } from './storage.js'

let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const code = async (p: Promise<unknown>) => { try { await p; return 200 } catch (e: any) { return e.status ?? 500 } }
const env = { S3_BUCKET: 'b', S3_REGION: 'eu-central-003', S3_ENDPOINT: 'https://s3.eu-central-003.backblazeb2.com', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret' }
const puts: any[] = []
const S = makeStorage(env, async (_c, cmd) => `https://signed/${(cmd as any).input.Key}`, async (_c, cmd) => { puts.push((cmd as any).input) })
const body = () => Readable.from(['x'])

ok('без переменных — выключено (503)', !makeStorage({}).ready && await code(makeStorage({}).upload('tg:1', {}, body(), 1)) === 503)
ok('с переменными — включено', S.ready)
ok('пробелы и переносы в переменных не мешают', makeStorage({ ...env, S3_ACCESS_KEY_ID: ' id\n', S3_SECRET_ACCESS_KEY: 'secret \n', S3_ENDPOINT: env.S3_ENDPOINT + '/\n' }).ready)
const u = await S.upload('tg:1', { courseId: 'c1', type: 'video/mp4; codecs=avc1' }, body(), 1234)
ok('загрузка: ключ в своей папке и в папке курса, тип и размер переданы', u.key.startsWith('t/tg_1/c/c1/') && u.key.endsWith('.mp4') && puts[0].Key === u.key && puts[0].ContentType === 'video/mp4' && puts[0].ContentLength === 1234 && puts[0].Bucket === 'b')
const ph = await S.upload('tg:1', { courseId: 'c1', type: 'image/jpeg' }, body(), 300000)
ok('фото: jpg в папке курса', ph.key.startsWith('t/tg_1/c/c1/') && ph.key.endsWith('.jpg'))
ok('фото больше 30 МБ — 413', await code(S.upload('tg:1', { courseId: 'c1', type: 'image/png' }, body(), 31 * 1024 * 1024)) === 413)
ok('не видео и не фото — 400', await code(S.upload('tg:1', { courseId: 'c1', type: 'application/pdf' }, body(), 10)) === 400)
ok('без размера — 411, слишком большое — 413', await code(S.upload('tg:1', { courseId: 'c1', type: 'video/mp4' }, body(), undefined)) === 411 && await code(S.upload('tg:1', { courseId: 'c1', type: 'video/mp4' }, body(), VIDEO_MAX + 1)) === 413)
ok('без курса — 400', await code(S.upload('tg:1', { type: 'video/mp4' }, body(), 10)) === 400)
const v = await S.viewUrls('tg:1', { keys: [u.key, u.key] })
ok('ссылки на просмотр — только свои, без повторов', Object.keys(v.urls).length === 1 && v.urls[u.key] === `https://signed/${u.key}`)
ok('коллега тоже видит файл курса (пространство общее)', !!(await S.viewUrls('tg:2', { keys: [u.key] })).urls[u.key])
ok('произвольный путь в бакете — 403', await code(S.viewUrls('tg:1', { keys: ['private/x.mp4'] })) === 403)
ok('выход из папки (..) — 403', await code(S.viewUrls('tg:1', { keys: [ownPrefix('tg:1') + '../x'] })) === 403)
ok('кривой запрос — 400', await code(S.viewUrls('tg:1', {})) === 400)
const a = await S.upload('tg:1', { deckId: 'd1', type: 'audio/mpeg' }, body(), 50000)
ok('озвучка карточки: mp3 в папке колоды', a.key.startsWith('t/tg_1/d/d1/') && a.key.endsWith('.mp3'))
const w = await S.upload('tg:1', { deckId: 'd1', type: 'audio/webm;codecs=opus' }, body(), 50000)
ok('запись с микрофона (webm) — тоже звук', w.key.endsWith('.weba'))
ok('звук больше 15 МБ — 413', await code(S.upload('tg:1', { deckId: 'd1', type: 'audio/mpeg' }, body(), 16 * 1024 * 1024)) === 413)
ok('общая ссылка на файл колоды → временная ссылка', await S.open(a.key) === `https://signed/${a.key}`)
ok('по общей ссылке нельзя открыть файл курса или чужой путь — 404', await code(S.open(u.key)) === 404 && await code(S.open('private/x.mp3')) === 404 && await code(S.open('t/tg_1/d/d1/../x.mp3')) === 404)
ok('файл колоды можно удалить', await code(S.remove('tg:1', a.key)) !== 403)
ok('удалить не файл курса — 403', await code(S.remove('tg:1', 't/tg_1/secret.txt')) === 403)

if (bad) { console.log(`\n${bad} FAIL`); process.exit(1) } else console.log('\nвсё ок')

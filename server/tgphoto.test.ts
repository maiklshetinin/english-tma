// Запуск: npx tsx tgphoto.test.ts  (сеть не нужна: страница t.me подставляется)
import { cleanUsername, isUsername, parsePhoto, photoByUsername, nickPhoto } from './tgphoto.js'
let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const page = (img: string) => `<html><div class="tgme_page_photo"><a href="x">${img}</a></div></html>`
const resp = (body: string, status = 200) => async () => new Response(body, { status })

ok('cleanUsername: @, ссылки, параметры', cleanUsername('@maria') === 'maria' && cleanUsername(' t.me/maria?start=1 ') === 'maria' && cleanUsername('https://telegram.me/maria/') === 'maria' && cleanUsername(undefined) === '')
ok('isUsername: 5–32 символа, латиница/цифры/_, с буквы', isUsername('maria') && isUsername('Anna_En1') && !isUsername('abcd') && !isUsername('1maria') && !isUsername('ma ria') && !isUsername('марияааа'))
ok('parsePhoto: берёт фото, &amp; раскодирует', parsePhoto(page('<img class="tgme_page_photo_image" src="https://cdn4.cdn-telegram.org/file/a.jpg?x=1&amp;y=2">')) === 'https://cdn4.cdn-telegram.org/file/a.jpg?x=1&y=2')
ok('parsePhoto: атрибуты в другом порядке', parsePhoto(page('<img src="https://cdn1.telesco.pe/file/b.jpg" class="tgme_page_photo_image" alt="">')) === 'https://cdn1.telesco.pe/file/b.jpg')
ok('parsePhoto: нет фото → пусто', parsePhoto('<html><div class="tgme_page_title">Мария</div></html>') === '')
ok('parsePhoto: чужой хост и http отброшены', parsePhoto(page('<img class="tgme_page_photo_image" src="https://evil.example/a.jpg">')) === '' && parsePhoto(page('<img class="tgme_page_photo_image" src="http://cdn1.telesco.pe/a.jpg">')) === '')
ok('photoByUsername: страница с фото', (await photoByUsername('maria_en', resp(page('<img class="tgme_page_photo_image" src="https://cdn1.telesco.pe/c.jpg">')) as any)) === 'https://cdn1.telesco.pe/c.jpg')
ok('photoByUsername: 404 и кривой ник → пусто, без запроса для кривого', (await photoByUsername('maria_en', resp('', 404) as any)) === '' && (await photoByUsername('a b', (() => { throw new Error('не должен вызываться') }) as any)) === '')

// nickPhoto: свежее фото по нику через сервер, только для известных ников, с кэшем
{
  let pages = 0, imgs = 0, t = 0
  const fetchFn = (async (url: string) => {
    if (url.startsWith('https://t.me/')) { pages++; return new Response(page('<img class="tgme_page_photo_image" src="https://cdn1.telesco.pe/p.jpg">')) }
    imgs++; return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
  }) as any
  const get = nickPhoto({ isKnown: async (u) => u === 'Maria_en', fetchFn, now: () => t })
  const a = await get('@Maria_en')
  ok('nickPhoto: известный ник → картинка', !!a && a.type === 'image/jpeg' && a.body.length === 3 && pages === 1 && imgs === 1)
  await get('maria_en'); ok('nickPhoto: повтор в течение 6 ч — из памяти', pages === 1)
  t += 7 * 3600_000; await get('Maria_en'); ok('nickPhoto: через 6 ч — заново', pages === 2)
  ok('nickPhoto: чужой ник — без запроса к t.me', (await get('stranger1')) === null && pages === 2)
  ok('nickPhoto: кривой ник → null', (await get('a b')) === null)
  const none = nickPhoto({ isKnown: async () => true, fetchFn: resp('<html></html>') as any, now: () => 0 })
  ok('nickPhoto: нет открытого фото → null', (await none('nophoto1')) === null)
  const boom = nickPhoto({ isKnown: async () => true, fetchFn: (async () => { throw new Error('net') }) as any })
  ok('nickPhoto: t.me не ответил → null, без ошибки', (await boom('maria_en')) === null)
}
process.exit(bad ? 1 : 0)

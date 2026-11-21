// Запуск: npx tsx courses.test.ts — курсы (без Firebase — база в памяти). Пространство общее: все преподаватели видят все курсы.
import { store, db, FieldValue } from './fake-db.js'
import { makeCourses } from './courses.js'

const C = makeCourses({ db, FieldValue })
let bad = 0
const ok = (name: string, c: unknown) => { console.log(c ? 'PASS' : 'FAIL', name); if (!c) bad++ }
const code = async (p: Promise<unknown>) => { try { await p; return 200 } catch (e: any) { return e.status ?? 500 } }
const me = 'tg:1', other = 'tg:2'
const course = {
  title: 'Курс A1', mode: 'line', progress: 99,
  items: [{ id: 'u1', type: 'unit', title: 'Юнит 1', sub: 'Present', junk: 'x' }, { id: 'a', type: 'lesson', title: 'Урок' },
    { id: 'v', type: 'video', title: 'Кружок', file: 't/tg_1/c/k1/x.mp4' }, { id: 'p', type: 'photo', title: 'Фото', file: 't/tg_2/c/k1/p.jpg' }],
  loose: [{ id: 'l', type: 'words', title: 'Слова', x: 12.6, y: -3 }],
}

ok('сначала пусто', (await C.list()).length === 0)
await C.put(me, 'k1', course)
const d = store.get('courses/k1')
ok('сохранён: автор и кто правил, лишние поля выкинуты, прогресс не больше числа заданий', d.teacherId === me && d.updatedBy === me && !('junk' in d.items[0]) && d.progress === 3 && d.mode === 'line')
ok('черновики с координатами (округлены)', d.loose[0].x === 13 && d.loose[0].y === -3 && !('x' in d.items[1]))
ok('файлы любого преподавателя курса сохранены', d.items[2].file === 't/tg_1/c/k1/x.mp4' && d.items[3].file === 't/tg_2/c/k1/p.jpg')
ok('произвольный путь в бакете вместо файла курса — 403', await code(C.put(me, 'k2', { ...course, items: [{ id: 'v', type: 'photo', title: '', file: 'secret/../x.jpg' }] })) === 403)
await C.put(other, 'k1', { ...course, title: 'Правка коллеги' })
const d2 = store.get('courses/k1')
ok('коллега правит общий курс: автор тот же, updatedBy — коллега', d2.title === 'Правка коллеги' && d2.teacherId === me && d2.updatedBy === other)
const g = await C.get('k1')
ok('прочитать', g.title === 'Правка коллеги' && g.items.length === 4 && g.loose.length === 1)
ok('список общий', (await C.list()).length === 1 && (await C.list())[0].count === 4)
ok('неизвестный тип / кривой id / повтор id — 400', await code(C.put(me, 'k1', { items: [{ id: 'a', type: 'boom', title: '' }] })) === 400
  && await code(C.put(me, 'a/b', course)) === 400 && await code(C.put(me, 'k1', { items: [{ id: 'a', type: 'lesson' }, { id: 'a', type: 'test' }] })) === 400)
ok('без items — 400', await code(C.put(me, 'k1', { title: 'x' })) === 400)
ok('длинное название обрезано', (await C.put(me, 'k1', { ...course, title: 'я'.repeat(500) }), store.get('courses/k1').title.length === 120))
ok('файлы курса для чистки', C.filesOf(g).length === 2)
const lesson = { id: 'L', type: 'lesson', title: 'Урок', min: 12, steps: [
  { id: 's1', kind: 'intro', word: 'go ahead', tr: 'давай', min: 2.3, video: 't/tg_1/c/k1/v.mp4', image: 'https://x.ru/p.jpg', audio: 'idb:m1', junk: 1 },
  { id: 's2', kind: 'choice', min: 'x', ask: 'zzz', show: 'text', ans: 9, opts: [{ w: 'a', audio: 'javascript:alert(1)' }, { w: 'b', image: 't/tg_1/c/k1/b.jpg' }] },
  { id: 's3', kind: 'pairs', min: 999, pairs: [{ a: 'x', b: 'y' }, ...Array(9).fill({ a: '1', b: '2' })] }] }
await C.put(me, 'k3', { ...course, items: [...course.items, lesson] })
const st = store.get('courses/k3').items[4].steps
ok('экраны урока: лишнее выкинуто, файлы — только свои ключи и https', st.length === 3 && !('junk' in st[0]) && st[0].video === 't/tg_1/c/k1/v.mp4' && st[0].image === 'https://x.ru/p.jpg' && !('audio' in st[0]))
ok('выбор: верный ответ в пределах, плохая ссылка выкинута; пар не больше 6', st[1].ask === 'audio' && st[1].ans === 1 && !('audio' in st[1].opts[0]) && st[2].pairs.length === 6)
ok('у урока своего времени нет — только сумма экранов', !('min' in store.get('courses/k3').items[4]))
ok('время экрана: шаг ½, не больше 60, мусор выкинут', st[0].min === 2.5 && !('min' in st[1]) && st[2].min === 60)
ok('файлы экранов — в чистку', C.filesOf({ items: store.get('courses/k3').items, loose: [] }).includes('t/tg_1/c/k1/b.jpg'))
await C.put(me, 'k6', { ...course, loose: [{ id: 'F', type: 'screen', title: '', x: 5, y: 6, steps: [{ id: 'a', kind: 'tip', text: 'x' }, { id: 'b', kind: 'tip' }] }] })
const fr = store.get('courses/k6').loose[0]
ok('экран на доске: один экран, с местом', fr.type === 'screen' && fr.steps.length === 1 && fr.x === 5)
ok('экран на доске — только черновиком', await code(C.put(me, 'k6', { ...course, items: [{ id: 'F', type: 'screen', title: '' }] })) === 400)
await C.put(me, 'k7', { ...course, items: [{ id: 'cp', type: 'checkpoint', title: 'Чекпоинт', ck: 'photo', file: 't/tg_1/c/k7/a.jpg', steps: [] }, { id: 'l2', type: 'lesson', title: '', sub: 'Знакомство', ck: 'zzz', file: 't/tg_1/c/k7/b.jpg' }] })
const k7 = store.get('courses/k7').items
ok('чекпоинт и обложка урока: фото/кружок; без вида обложки файл не берём', k7[0].type === 'checkpoint' && k7[0].ck === 'photo' && k7[0].file === 't/tg_1/c/k7/a.jpg' && !('file' in k7[1]) && !('ck' in k7[1]) && k7[1].sub === 'Знакомство')
await C.put(me, 'k7', { ...course, items: [{ id: 'l3', type: 'lesson', title: 'PP', topic: 'present-perfect' }, { id: 'l4', type: 'lesson', title: 'x', topic: 'Bad Topic!' }, { id: 'u9', type: 'unit', title: 'U', topic: 'past-simple' }] })
{ const k = store.get('courses/k7').items; ok('тема урока: id сохраняется, мусор и у главы — нет', k[0].topic === 'present-perfect' && !('topic' in k[1]) && !('topic' in k[2])) }
await C.put(me, 'k8', { ...course, items: [{ id: 'u1', type: 'unit', title: 'Глава', hl: 'none', hlw: true, hlc: '#C4E1FF', hlo: 40.4 }, { id: 'u2', type: 'unit', title: 'Глава 2', hl: 'pink', hlw: 'yes', hlc: 'red' }] })
const k8 = store.get('courses/k8').items
ok('подсветка главы: вид, с ветками, цвет; мусор выкинут', k8[0].hl === 'none' && k8[0].hlw === true && k8[0].hlc === '#c4e1ff' && k8[0].hlo === 40 && !('hl' in k8[1]) && !('hlw' in k8[1]) && !('hlc' in k8[1]))
await C.put(me, 'k19', { ...course, loose: [{ id: 'gu', type: 'unit', title: 'Глава', x: 1, y: 2 }, { id: 'gl', type: 'lesson', title: '', x: 1, y: 90, grp: 'gu' }, { id: 'gx', type: 'lesson', title: '', x: 1, y: 90, grp: 'bad id!' }] })
const k9 = store.get('courses/k19').loose
ok('глава на доске: урок помнит главу (grp), плохой grp выкинут', k9[1].grp === 'gu' && !('grp' in k9[2]))
// книжные экраны: «Найди лишнее» и «Распредели по колонкам» — сохраняются, лишнее срезается
await C.put(me, 'k8', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [
  { id: 'o1', kind: 'odd', bs: 'boom', ans: 7, note: 'x', mix: false, opts: [{ w: 'egg', k: 'y' }, { w: 'coffee', k: 'zzz' }] },
  { id: 'o2', kind: 'sort', bk: 'sort', bn: 7, bs: 'page', cols: [{ t: 'A' }, { t: 'B' }, { t: 'C' }, { t: 'D' }, { t: 'E' }, { t: 'F' }], items: [{ w: 'p', c: 1, k: 'g' }, { w: 'q', c: 9 }], hint: false }] }] })
{ const s = ((await C.get('k8')) as any).items[0].steps
  ok('найди лишнее: опции, цвет, ответ в пределах', s[0].opts.length === 2 && s[0].opts[0].k === '#fbedb0' && !s[0].opts[1].k && s[0].ans === 1 && s[0].mix === false && s[0].note === 'x')
  ok('распредели: до 5 колонок, метка задания учебника, колонка фразы в пределах', s[1].cols.length === 5 && s[1].items[0].c === 1 && s[1].items[1].c === 4 && s[1].hint === false && s[1].bk === 'sort' && s[1].bn === 7 && s[1].bs === 'page' && !('bs' in s[0])) }
// «Ответ по смыслу» (Karta Polaka): вопрос и эталон сохраняются, лишнее срезается
await C.put(me, 'k11', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [{ id: 'q1', kind: 'kp', text: 'Kiedy i jak obchodzimy Mikołajki?', ideal: 'Mikołajki obchodzimy szóstego grudnia…', prompt: 'Mój prompt', pass: 70, star: true, n: 3, look: 'cards', plain: true, autoplay: true, engine: 'api', model: 'gemini-3.5-flash-lite', audioBy: 'gemini-2.5-flash-preview-tts|Kore', note: 'x', junk: 1 }, { id: 'q2', kind: 'kp', text: 'Q', ideal: 'I', pass: 500, engine: 'live' }] }] })
{ const s = ((await C.get('k11')) as any).items[0].steps[0]
  ok('ответ по смыслу: вопрос и эталон на месте, мусор срезан', s.kind === 'kp' && s.text === 'Kiedy i jak obchodzimy Mikołajki?' && s.ideal === 'Mikołajki obchodzimy szóstego grudnia…' && s.prompt === 'Mój prompt' && s.pass === 70 && s.star === true && s.n === 3 && s.look === 'cards' && s.plain === true && !('note' in s) && !('junk' in s))
  ok('ответ по смыслу: автозвук и «чем озвучено» сохраняются', ((await C.get('k11')) as any).items[0].steps[0].autoplay === true && ((await C.get('k11')) as any).items[0].steps[0].audioBy === 'gemini-2.5-flash-preview-tts|Kore' && ((await C.get('k11')) as any).items[0].steps[0].engine === 'api' && ((await C.get('k11')) as any).items[0].steps[0].model === 'gemini-3.5-flash-lite')
  ok('ответ по смыслу: старый «Live (голос)» сохраняется как Gemini API', ((await C.get('k11')) as any).items[0].steps[1].engine === 'api')
  ok('ответ по смыслу: кривой порог не сохраняется', !('pass' in ((await C.get('k11')) as any).items[0].steps[1])) }
// «Разговор с Gemini»: задание, роль, голос, модель; кривое — мимо
await C.put(me, 'k12', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [{ id: 'g1', kind: 'talk', text: 'Собеседование', prompt: 'Jesteś konsulem', voice: 'Puck', model: 'gemini-3.8-live', junk: 1 }, { id: 'g2', kind: 'talk', voice: 'Pu ck!', model: 'X Y' }] }] })
{ const s = ((await C.get('k12')) as any).items[0].steps
  ok('разговор с Gemini: поля сохраняются, мусор срезан', s[0].kind === 'talk' && s[0].text === 'Собеседование' && s[0].prompt === 'Jesteś konsulem' && s[0].voice === 'Puck' && s[0].model === 'gemini-3.8-live' && !('junk' in s[0]) && !('voice' in s[1]) && !('model' in s[1])) }
// 20.11.2026: настройки моделей из JSON экрана и персонаж — сохраняются, неверные значения срезаются
await C.put(me, 'k13t', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [
  { id: 't1', kind: 'talk', avatar: true, lock: 'Mów po polsku.', opener: 'Dzień dobry', silenceMs: 2000, endSens: 'high', temperature: 0.4, noiseSuppression: true },
  { id: 't2', kind: 'talk', avatar: 'yes', silenceMs: 50, temperature: 9, endSens: 'mid' },
  { id: 'k1', kind: 'kp', text: 'Q', ideal: 'I', engine: 'api', model: 'live', format: 'JSON.', message: 'P: {question}', thinking: true, temperature: 0.2, livePrompt: 'L', liveAsk: 'A', liveMore: 'M', discussPrompt: 'D', discussOpener: 'O' },
  { id: 'k2', kind: 'kp', text: 'Q', ideal: 'I', dic: 'file' }, { id: 'k3', kind: 'kp', text: 'Q', ideal: 'I', dic: 'stream' }] }] })
{ const s = ((await C.get('k13t')) as any).items[0].steps
  ok('разговор: персонаж и настройки модели сохраняются', s[0].avatar === true && s[0].lock === 'Mów po polsku.' && s[0].opener === 'Dzień dobry' && s[0].silenceMs === 2000 && s[0].endSens === 'high' && s[0].temperature === 0.4 && s[0].noiseSuppression === true)
  ok('разговор: неверные значения срезаны', !('avatar' in s[1]) && !('silenceMs' in s[1]) && !('temperature' in s[1]) && !('endSens' in s[1]))
  ok('ответ по смыслу · Gemini API: промпты и настройки проверки сохраняются', s[2].engine === 'api' && s[2].model === 'live' && s[2].format === 'JSON.' && s[2].message === 'P: {question}' && s[2].thinking === true && s[2].temperature === 0.2 && s[2].livePrompt === 'L' && s[2].liveAsk === 'A' && s[2].liveMore === 'M' && s[2].discussPrompt === 'D' && s[2].discussOpener === 'O')
  ok('ответ по смыслу · целым аудио: dic: file сохраняется, чужое значение — нет', s[3].dic === 'file' && !('dic' in s[4])) }
await C.put(me, 'k13', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [{ id: 'z1', kind: 'stt', text: 'Powiedz coś', lang: 'en-US', junk: 1 }] }] })
{ const s = ((await C.get('k13')) as any).items[0].steps[0]; ok('транскрипция: подсказка и язык сохраняются', s.kind === 'stt' && s.text === 'Powiedz coś' && s.lang === 'en-US' && !('junk' in s)) }
// «Заполни таблицу»: ответ и образец в клетке, строки, регистр — сохраняются; колонки чистятся
await C.put(me, 'k10', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [
  { id: 't1', kind: 'sort', bk: 'sort', tw: true, rows: 40, cs: true, noEx: 'x', cols: [{ t: '-s', z: 1 }, { t: 'other' }], items: [{ w: 'bag', a: 'bags', c: 0, ex: true }, { w: 'man', a: 'men', c: 1, ex: 'y' }] }] }] })
{ const s = ((await C.get('k10')) as any).items[0].steps[0]
  ok('заполни таблицу: a/ex/tw/rows/cs, мусор срезан', s.tw === true && s.rows === 8 && s.cs === true && !('noEx' in s) && s.items[0].a === 'bags' && s.items[0].ex === true && !('ex' in s.items[1]) && s.cols[0].t === '-s' && !('z' in s.cols[0])) }
// подсказка: длинное пояснение в строке не режется на 120; банк пропуска чистится
await C.put(me, 'k11', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [
  { id: 't1', kind: 'tip', text: 'x', opts: [{ w: 'Hi', t: 'я'.repeat(300), z: 1 }] },
  { id: 'g1', kind: 'gap', phrase: 'I [am].', opts: [{ w: 'am', junk: 1 }, { w: 'is' }] }] }] })
{ const st = ((await C.get('k11')) as any).items[0].steps
  ok('подсказка: пояснение 300 знаков целиком, мусор срезан; банк пропуска чистый', st[0].opts[0].t.length === 300 && !('z' in st[0].opts[0]) && st[1].opts.length === 2 && !('junk' in st[1].opts[0])) }
ok('неизвестный экран — 400', await code(C.put(me, 'k3', { items: [{ id: 'L', type: 'lesson', title: '', steps: [{ id: 's', kind: 'boom' }] }] })) === 400)
await C.put(me, 'k4', { ...course, notes: [{ id: 'n1', x: 1.4, y: 2, text: 'я'.repeat(2000), color: 'red', junk: 1 }] })
const nt = store.get('courses/k4').notes[0]
ok('стикеры: координаты округлены, текст обрезан, чужой цвет заменён', nt.x === 1 && nt.text.length === 1000 && nt.color === '#ffe99a' && !('junk' in nt))
await C.put(me, 'k5', { ...course, ink: [{ id: 'k1', c: 'javascript:x', w: 99, p: [1.6, 2, 3], junk: 1 }] })
const ik = store.get('courses/k5').ink[0]
ok('рисунки: цвет только #rrggbb, толщина ≤ 20, точки парами и целые', ik.c === '#1e1e1e' && ik.w === 20 && ik.p.join() === '2,2' && !('junk' in ik))
await C.put(me, 'k6', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [{ id: 's1', kind: 'intro', word: 'x', video: 't/tg_1/c/k1/v.mp4' }] }] })
ok('общий файл (экран скопирован в другой курс) — виден как нужный другим курсам', (await C.filesElsewhere('k1')).has('t/tg_1/c/k1/v.mp4') && !(await C.filesElsewhere('k6')).has('t/tg_1/c/k6/zz.mp4'))
await C.put(me, 'k7', { ...course, notes: [{ id: 'n2', x: 0, y: 0, text: 'x', color: '#ffe99a', by: 'Миша', sz: 'l', font: 'hand', b: true, st: 'yes', list: true, nob: 1, junk: 2 }] })
const n2 = store.get('courses/k7').notes[0]
ok('стикер: автор, размер, шрифт и отметки сохраняются, мусор — нет', n2.by === 'Миша' && n2.sz === 'l' && n2.font === 'hand' && n2.b === true && n2.list === true && !('st' in n2) && !('nob' in n2) && !('junk' in n2))
await C.put(me, 'k8', { ...course, items: [{ id: 'L', type: 'lesson', title: '', steps: [{ id: 's1', kind: 'order', phrase: 'bye', by: 'letters' }, { id: 's2', kind: 'order', phrase: 'a b', by: 'junk' }] }] })
const st8 = store.get('courses/k8').items[0].steps
ok('«Собери слово»: по буквам сохраняется, чужое значение — нет', st8[0].by === 'letters' && !('by' in st8[1]))
// Конструктор упражнений: свои упражнения курса и свои поля экрана (задание, название, описание плитки)
await C.put(me, 'k19', { ...course, items: [{ id: 'l9', type: 'lesson', title: 'Урок', steps: [{ id: 's9', kind: 'order', phrase: 'See you later!', head: 'Соберите фразу по фото', tn: 'Фраза по фото', td: 'Фото и слова по порядку', image: 'https://maiklshetinin.github.io/english-tma/fish/wave.jpg', bad: 1 }] }],
  templates: [{ id: 'my1', t: 'Фраза по фото', d: 'Фото и слова по порядку', step: { id: 'x1', kind: 'order', phrase: 'See you later!', tn: 'Фраза по фото', image: 'https://maiklshetinin.github.io/english-tma/fish/wave.jpg' } }, { id: 'my2', t: '', step: { id: 'x2', kind: 'pairs', pairs: [{ a: 'hi', b: 'привет' }] } }] })
const c9 = store.get('courses/k19'), s9 = c9.items[0].steps[0]
ok('экран: своё задание, название и описание плитки сохраняются, лишнее — нет', s9.head === 'Соберите фразу по фото' && s9.tn === 'Фраза по фото' && s9.td === 'Фото и слова по порядку' && !('bad' in s9) && !!s9.image)
ok('свои упражнения курса: сохраняются, пустое название — «Моё упражнение»', c9.templates.length === 2 && c9.templates[0].step.kind === 'order' && c9.templates[1].t === 'Моё упражнение')
ok('свои упражнения — отдаются вместе с курсом', (await C.get('k19')).templates?.length === 2)
ok('кривое упражнение — 400', await code(C.put(me, 'k19', { ...course, templates: [{ id: 'my1', step: { id: 'x', kind: 'nope' } }] })) === 400)
ok('удалить, потом — 404', (await C.remove('k1'), !store.has('courses/k1')) && await code(C.get('k1')) === 404)

if (bad) { console.log(`\n${bad} FAIL`); process.exit(1) } else console.log('\nвсё ок')

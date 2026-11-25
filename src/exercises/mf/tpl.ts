// «Красный Мерфи» (25.11.2026): «рыбы» плиток вкладки — объяснение (A, B, C, D) и упражнения как в English Grammar in Use.
// Тексты — наши, по образцу заданий книги; фото книги вставляет преподаватель. Подробно о полях — exercises/mf/data.ts
const R = (q: string, a: string, x: Record<string, unknown> = {}) => ({ q, a, ...x })
const E = (q: string, a: string, x: Record<string, unknown> = {}) => ({ q, a, ex: true, ...x })
export const MF_TPL: { id: string; t: string; d: string; s: Record<string, unknown> }[] = [
  { id: 'mfinfo', t: 'Объяснение A · B · C · D', d: 'Разделы с фото из книги и кружком преподавателя', s: { mode: 'info', no: '7', head: 'Do you … ? (present simple questions)', opts: [
    { w: 'A', t: 'We use **do/does** in present simple questions:\n**Do** you work? · **Does** she like music?' },
    { w: 'B', t: 'Study the word order: **do/does** + subject + infinitive\nWhere **do** your parents **live**? · How often **do** you **wash** your hair?' },
    { w: 'C', t: 'Remember: **do** I/we/you/they … · **does** he/she/it …' },
    { w: 'D', t: 'Short answers: Yes, I **do**. · No, she **doesn’t**.' }] } },
  { id: 'mf171', t: 'Вопросы собеседнику', d: 'Have you ever …? — ответы Helen, подсказка у поля', s: { no: '17.1', head: 'You are asking Helen questions beginning !!Have you ever …?!! Write the questions.', who: 'Helen', hints: ['Have you ever'], rows: [
    E('(be / London?)', 'Have you ever been to London?', { r: 'No, never.' }), R('(play / golf?)', 'Have you ever played golf?', { r: 'Yes, many times.' }),
    R('(be / Australia?)', 'Have you ever been to Australia?', { r: 'Yes, once.' }), R('(lose / your passport?)', 'Have you ever lost your passport?', { r: 'No, never.' }),
    R('(fly / in a helicopter?)', 'Have you ever flown in a helicopter?', { r: 'Yes, a few times.' }), R('(win / a race?)', 'Have you ever won a race?', { r: 'No, never.' })] } },
  { id: 'mf25', t: 'Короткие ответы', d: 'Yes, I am. / No, he isn’t. — плашки Yes, / No,', s: { no: '2.5', head: 'Write short answers (**Yes, I am. / No, he isn’t.** etc.).', two: true, hints: ['Yes,', 'No,'], rows: [
    E('Are you married?', 'No, I’m not.'), R('Are you thirsty?', 'Yes, I am./No, I’m not./No, I am not.'), R('Is it cold today?', 'Yes, it is./No, it isn’t./No, it’s not./No, it is not.'),
    R('Are your hands cold?', 'Yes, they are./No, they aren’t./No, they’re not./No, they are not.'), R('Is it dark now?', 'Yes, it is./No, it isn’t./No, it’s not./No, it is not.'), R('Are you a teacher?', 'Yes, I am./No, I’m not./No, I am not.')] } },
  { id: 'mf112', t: 'Форма глагола', d: 'Слово — поле рядом, в две колонки', s: { no: '11.2', head: '==Write the past simple== of these verbs.', two: true, inl: true, rows: [
    E('get', 'got'), ...([['see', 'saw'], ['play', 'played'], ['pay', 'paid'], ['visit', 'visited'], ['buy', 'bought'], ['go', 'went'], ['think', 'thought'], ['copy', 'copied'], ['know', 'knew'], ['put', 'put'], ['speak', 'spoke']] as const).map(([q, a]) => R(q, a))] } },
  { id: 'mf51', t: 'Порядок слов', d: 'Слова плашками под полем', s: { mode: 'order', below: true, no: '5.1', head: 'Make questions with these words. Put the words in the right order.', two: true, rows: [
    E('(has / gone / where / David?)', 'Where has David gone?'), R('(working / Rachel / is / today?)', 'Is Rachel working today?'), R('(the children / what / are / doing?)', 'What are the children doing?'),
    R('(made / is / how / cheese?)', 'How is cheese made?'), R('(to the party / coming / is / your sister?)', 'Is your sister coming to the party?'), R('(you / the truth / tell / don’t / why?)', 'Why don’t you tell the truth?'),
    R('(your guests / have / yet / arrived?)', 'Have your guests arrived yet?'), R('(leave / what time / your train / does?)', 'What time does your train leave?'),
    R('(to work / Emily / why / go / didn’t?)', 'Why didn’t Emily go to work?'), R('(your car / in the accident / was / damaged?)', 'Was your car damaged in the accident?')] } },
  { id: 'mf395', t: 'Слова из рамок', d: 'Пропуски в предложении, две рамки слов', s: { mode: 'gaps', no: '39.5', head: '==Complete the sentences.== Choose from the boxes.', banks: [
    { t: 'it’s …', w: ['easy', 'difficult', 'impossible', 'dangerous', 'nice', 'interesting'], x: ['difficult'] },
    { t: 'to …', w: ['work here', 'get up early', 'visit different places', 'go out alone', 'see you again', 'make friends'], x: ['get up early'] }], rows: [
    E('If you go to bed late, [it’s difficult to get up early] in the morning.', ''), R('Hello, Jane. **It’s** [nice] **to** [see you again]. How are you?', ''),
    R('**It’s** [impossible] **to** [work here]. There is too much noise.', ''), R('Everybody is very nice at work. **It’s** [easy] **to** [make friends].', ''),
    R('I like travelling. **It’s** [interesting] **to** [visit different places].', ''), R('Some cities are not safe. **It’s** [dangerous] **to** [go out alone] at night.', '')] } },
  { id: 'mf212', t: 'Исправь ошибку', d: 'Ошибка подчёркнута, «Скопировать» предложение', s: { no: '21.2', head: 'These sentences are not correct. Correct them.', two: true, copy: true, rows: [
    E('This house __built__ 100 years ago.', 'This house was built 100 years ago.'), R('Football plays in most countries of the world.', 'Football is played in most countries of the world.'),
    R('Why did the letter send to the wrong address?', 'Why was the letter sent to the wrong address?'), R('A film studio is a place where films make.', 'A film studio is a place where films are made.'),
    R('Where are you born?', 'Where were you born?'), R('How many languages are speaking in Switzerland?', 'How many languages are spoken in Switzerland?'),
    R('Somebody broke into our house, but nothing stolen.', 'Somebody broke into our house, but nothing was stolen.'), R('When was invented the bicycle?', 'When was the bicycle invented?')] } },
  { id: 'mf314', t: 'Одинаковый смысл', d: '1–5 ↔ A–E, буквы кружками', s: { mode: 'match', no: '31.4', head: '==Find== the sentences with the same meaning.', note: 'Tap a letter for each numbered sentence.',
    opts: ['We must stay until the end.', 'We couldn’t stay until the end.', 'We can’t stay until the end.', 'We can stay until the end.', 'We don’t need to stay until the end.'].map((w) => ({ w })), rows: [
    E('We can leave the meeting early.', 'E'), R('We must leave the meeting early.', 'C'), R('We mustn’t leave the meeting early.', 'A'), R('We had to leave the meeting early.', 'B'), R('We don’t need to leave the meeting early.', 'D')] } },
  { id: 'mf43', t: 'Собери вопрос', d: 'Слова в скобках — плашки, «?» в конце', s: { mode: 'order', no: '4.3', head: '==Make questions== from these words. Put the words in the right order.', note: 'Tap the words in order to build each question — or type.', two: true, post: '?', rows: [
    E('(is / working / Ben / today)', 'Is Ben working today'), R('(what / the children / are / doing)', 'What are the children doing'), R('(you / are / listening / to me)', 'Are you listening to me'),
    R('(where / your friends / are / going)', 'Where are your friends going'), R('(are / watching / your parents / TV)', 'Are your parents watching TV'), R('(what / Jessica / is / cooking)', 'What is Jessica cooking'),
    R('(why / you / are / looking / at me)', 'Why are you looking at me'), R('(is / coming / the bus)', 'Is the bus coming')] } },
  { id: 'mf31', t: 'Сделай отрицание', d: 'Фраза — поле рядом; isn’t = is not', s: { no: '3.1', head: '**Make these sentences negative.**', note: 'Type the whole negative sentence. Contractions (isn’t) and full forms (is not) are both fine.', two: true, inl: true, rows: [
    E('He’s gone away.', 'He hasn’t gone away.'), R('They’re married.', 'They aren’t married./They’re not married.'), R('I’ve had dinner.', 'I haven’t had dinner.'),
    R('It’s cold today.', 'It isn’t cold today./It’s not cold today.'), R('We’ll be late.', 'We won’t be late.'), R('You should go.', 'You shouldn’t go.')] } },
  { id: 'mf15', t: 'По картинкам', d: 'Сетка фото 1–6, рамка слов, начало строки', s: { no: '1.5', head: 'Write sentences for the pictures. Use:', inl: true, banks: [{ t: '', w: ['angry', 'cold', 'hot', 'hungry', 'scared', 'thirsty'], x: ['thirsty'] }],
    opts: ['1', '2', '3', '4', '5', '6'].map((w) => ({ w })), rows: [
    E('', 'She’s thirsty.'), R('', 'are cold.', { pre: 'They' }), R('', 'is hot./’s hot.', { pre: 'He' }), R('', 'He’s scared./He is scared.'), R('', 'They’re hungry./They are hungry.'), R('', 'She’s angry./She is angry.')] } },
  { id: 'mf193', t: 'Подсказка справа', d: 'for / ago — слова в скобках у поля', s: { no: '19.3', head: '**Complete the sentences. Use !!for!! or !!ago!! with these words.**', rows: [
    E('Helen arrived in Ireland', 'three days ago.', { h: '(three days)' }), R('Helen has been in Ireland', 'for three days.', { h: '(three days)' }),
    R('Lynn and Mark have been married', 'for 20 years./for twenty years.', { h: '(20 years)' }), R('Lynn and Mark got married', '20 years ago./twenty years ago.', { h: '(20 years)' }), R('Dan arrived', 'an hour ago.', { h: '(an hour)' })] } },
]

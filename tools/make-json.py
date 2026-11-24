#!/usr/bin/env python3
"""PDF домашки Karta Polaka → JSON экранов ЛЮБОГО упражнения: один скрипт, упражнение выбирается по ID шаблона (24.11.2026).

Заменяет kp-json / kpapi-json / kpfile-json / talk-json / ptt-json / exam-json (их можно удалить, когда сверите).
PDF по-прежнему разбирает tools/kp-json.py — вопросы, эталоны и звёзды везде одинаковые.

Проще всего: положить PDF в tools/pdf/ и дважды щёлкнуть «Сделать JSON.bat» — он спросит, какое упражнение.
Из терминала:
    python tools/make-json.py                          # спросит номер упражнения, потом все PDF из tools/pdf/
    python tools/make-json.py --list                   # все ID с названиями и папками
    python tools/make-json.py talkvn                   # все PDF из tools/pdf/ → tools/json/<папка talkvn>/
    python tools/make-json.py talkexam "ДЗ 8.pdf"      # рядом появится «ДЗ 8.talkexam.json»
    python tools/make-json.py talkptt "json/мост/ДЗ 8. Кухня.json"   # можно из готового JSON «моста»
    python tools/make-json.py kpapi --model auto       # «Gemini API» с проверкой Flash Lite вместо Live

ID — те же, что в приложении (src/utils/lesson.ts → TEMPLATES). Отдельного поля «шаблон» в JSON экрана нет: приложение узнаёт его
по kind и флагам (lesson.ts → tplOf) — флаги каждого ID в таблице TPL ниже. Новый шаблон — одна строка в TPL.
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KP = os.path.join(HERE, 'kp-json.py')
PROMPT_MAX, TEXT_MAX = 3900, 300          # сервер хранит роль до 4000 знаков, задание — до 300

# ID шаблона → (название, папка в tools/json/, как собрать экраны, флаги экрана)
#   raw   — JSON «Ответа по смыслу» как его выдаёт kp-json.py ({ questions })
#   api   — то же + engine/model
#   kp    — экраны «Ответа по смыслу» ({ steps }): вопрос, эталон, звезда, номер
#   role  — экраны разговора: роль консула с вопросом и эталоном вшита в промпт экрана
#   exam  — экраны собеседования: у экрана вопрос, эталон, звезда, номер; роль — общий шаблон курса
TPL = {
    'kp':       ('Ответ по смыслу (мост)',              'мост',                    'raw',  {}),
    'kpapi':    ('Ответ по смыслу · Gemini API',        'gemini-live',             'api',  {}),
    'kpfile':   ('Ответ по смыслу · целым аудио',       'запись целиком',          'kp',   {'dic': 'file'}),
    'talk':     ('Разговор с Gemini (без персонажа)',   'разговор без персонажа',  'role', {}),
    'talkava':  ('Разговор с персонажем',               'разговор',                'role', {'avatar': True}),
    'talkptt':  ('Разговор · рация',                    'рация',                   'role', {'avatar': True, 'ptt': True}),
    'talkptt2': ('Разговор · рация (Busuu)',            'рация busuu',             'role', {'avatar': True, 'ptt': True, 'busuu': True}),
    'talkvn':   ('Рация · голосовые',                   'голосовые',               'role', {'avatar': True, 'ptt': True, 'vn': True}),
    'talkexam': ('Собеседование · рация',               'собеседование',           'exam', {'avatar': True, 'ptt': True, 'exam': True}),
}

ap = argparse.ArgumentParser(description='PDF домашки Karta Polaka → JSON экранов выбранного упражнения')
ap.add_argument('tpl', nargs='?', help='ID упражнения (см. --list); без него — спросит')
ap.add_argument('src', nargs='?', help='PDF домашки или JSON «моста» (без него — все PDF из tools/pdf/)')
ap.add_argument('-o', '--out', help='куда сохранить JSON (по умолчанию — рядом, «<имя>.<ID>.json»)')
ap.add_argument('--list', action='store_true', help='показать все ID упражнений')
ap.add_argument('--no-avatar', action='store_true', help='без персонажа (у разговоров и раций)')
ap.add_argument('--model', default='live', help='kpapi: модель проверки — live (по умолчанию), auto (Flash Lite) или имя модели')
ap.add_argument('--lesson', help='название урока, если в PDF его нет текстом (передаётся в kp-json.py)')
ARGS = ap.parse_args()


def show_list():
    for i, (k, (t, folder, _, flags)) in enumerate(TPL.items(), 1):
        f = ', '.join(f'{a}' if b is True else f'{a}={b}' for a, b in flags.items())
        print(f'  {i}. {k:<9} {t:<36} → json/{folder}/' + (f'   [{f}]' if f else ''))


def pick():
    print('Какое упражнение сделать из PDF?\n'); show_list()
    v = input('\nНомер или ID: ').strip()
    keys = list(TPL)
    if v.isdigit() and 1 <= int(v) <= len(keys): return keys[int(v) - 1]
    if v in TPL: return v
    sys.exit(f'Нет такого упражнения: {v}')


# ---------- данные урока ----------
def kp_data(src):
    """Урок: готовый JSON — как есть; PDF — через kp-json.py во временный файл"""
    if src.lower().endswith('.json'):
        return json.load(open(src, encoding='utf-8'))
    fd, tmp = tempfile.mkstemp(suffix='.json'); os.close(fd)
    try:
        cmd = [sys.executable, KP, src, '-o', tmp] + (['--lesson', ARGS.lesson] if ARGS.lesson else [])
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
        if r.returncode != 0: sys.exit((r.stderr or r.stdout).strip() or 'Не получилось разобрать PDF')
        return json.load(open(tmp, encoding='utf-8'))
    finally:
        os.remove(tmp)


def from_html(h):
    """Эталон из HTML домашки → разметка экрана (копия kpFromHtml из src/utils/lesson.ts):
    <b class="acc"> — ==оранжевый==, <b> — **жирный**, <i> — _курсив_, <p> — абзац, <li> — «• »"""
    h = re.sub(r'<b class="acc">([\s\S]*?)</b>', r'==\1==', h)
    h = re.sub(r'<b class="[^"]*">([\s\S]*?)</b>', r'**\1**', h)
    h = re.sub(r'<(b|strong)>([\s\S]*?)</\1>', r'**\2**', h)
    h = re.sub(r'<(i|em)>([\s\S]*?)</\1>', lambda m: '_' + m.group(2) + '_' if re.search(r'[^\W_]', m.group(2)) else m.group(2), h)
    h = re.sub(r'<li>', '\n• ', h)
    h = re.sub(r'</(p|li|ul)>|<br\s*/?>', '\n', h)
    h = re.sub(r'<[^>]+>', '', h)
    for a, b in (('&lt;', '<'), ('&gt;', '>'), ('&quot;', '"'), ('&#39;', "'"), ('&amp;', '&')): h = h.replace(a, b)
    return '\n'.join(l for l in (re.sub(r'\s+', ' ', x).strip() for x in h.split('\n')) if l)


def items(d, plain_ref=False):
    """Вопросы урока → [(вопрос, эталон, звезда, номер)]. Из questions (PDF / мост) или из готовых экранов (steps).
    plain_ref — эталон без разметки (для роли консула), иначе — с разметкой экрана (из reference_html)"""
    if isinstance(d.get('steps'), list):
        return [((s.get('text') or '').strip(), (s.get('ideal') or '').strip(), s.get('star') is True, s.get('n'))
                for s in d['steps'] if s.get('kind') in ('kp', 'talk') and (s.get('text') or '').strip()]
    out = []
    for q in d.get('questions', []):
        text = (q.get('question') or '').strip()
        if not text: continue
        html, ref = (q.get('reference_html') or '').strip(), (q.get('reference') or '').strip()
        out.append((text, ref if plain_ref or not html else from_html(html), q.get('star') is True, q.get('id')))
    return out


def num_ok(n): return isinstance(n, int) and 0 < n < 100


# ---------- сборщики ----------
def short(t, n):
    """Эталон в одну строку и не длиннее n знаков (по границе слова)"""
    t = re.sub(r'([.!?…])\s*\n\s*(•\s*)?', r'\1 ', t.strip())
    t = re.sub(r'\s*\n\s*(•\s*)?', '; ', t).strip('; ')
    t = re.sub(r'\s+', ' ', t)
    if len(t) <= n: return t
    return t[:n].rsplit(' ', 1)[0].rstrip(',;:—-') + '…'


def role(q, ref, star):
    """Роль Gemini для одного вопроса: консул обсуждает только его, эталон — для сверки"""
    head = ('Jesteś konsulem RP. Prowadzisz rozmowę kwalifikacyjną na Kartę Polaka. Mówisz tylko po polsku, spokojnie i życzliwie. '
            f'W tej rozmowie omawiasz tylko jedno pytanie: «{q}». '
            'Na początku zadaj to pytanie (możesz je lekko przeformułować) i czekaj na odpowiedź. '
            'Porównuj odpowiedź z wzorcową odpowiedzią poniżej: jeśli brakuje czegoś ważnego — dopytaj (najwyżej 2–3 pytania pomocnicze) albo krótko podpowiedz. '
            'Jeśli rozmówca robi błąd językowy — delikatnie popraw jednym zdaniem. '
            + ('To pytanie jest bardzo ważne — uczeń musi znać odpowiedź. ' if star else '')
            + 'Na koniec krótko oceń odpowiedź: co było dobrze, czego zabrakło — i powiedz, że można przejść do następnego pytania.')
    if not ref: return head, False
    room = PROMPT_MAX - len(head) - len('\n\nWzorcowa odpowiedź:\n')
    body = ref if len(ref) <= room else short(ref, room)
    return head + '\n\nWzorcowa odpowiedź:\n' + body, body != ref


def flags_of(tpl):
    f = dict(TPL[tpl][3])
    if ARGS.no_avatar: f.pop('avatar', None)
    return f


def build(tpl, d):
    """→ (JSON для вставки, строка отчёта)"""
    how = TPL[tpl][2]
    if how == 'raw':
        if 'questions' not in d: sys.exit('Для «моста» нужен PDF или JSON «моста» (questions)')
        return d, f'вопросов: {len(d["questions"])}'
    if how == 'api':
        if 'questions' not in d: sys.exit('Для «Gemini API» нужен PDF или JSON «моста» (questions)')
        r, put = {}, False          # engine и model — сразу после pass_threshold (так их читает приложение, stepsFromJson)
        for k, v in d.items():
            if k in ('engine', 'model'): continue
            r[k] = v
            if k == 'pass_threshold': r['engine'], r['model'], put = 'api', ARGS.model, True
        if not put: r['engine'], r['model'] = 'api', ARGS.model
        return r, f'вопросов: {len(d["questions"])} · проверка: Gemini API, модель {ARGS.model}'
    fl, steps, cut = flags_of(tpl), [], []
    if how == 'kp':
        pas = d.get('pass_threshold')
        for text, ideal, star, n in items(d):
            s = {'kind': 'kp', 'text': text}
            if ideal: s['ideal'] = ideal
            if star: s['star'] = True
            if num_ok(n): s['n'] = n
            if pas is not None: s['pass'] = pas
            steps.append({**s, **fl})
    elif how == 'exam':
        for text, ideal, star, n in items(d):
            s = {'kind': 'talk', **fl, 'text': text[:TEXT_MAX]}
            if ideal: s['ideal'] = ideal
            if star: s['star'] = True
            if num_ok(n): s['n'] = n
            steps.append(s)
    elif how == 'role':
        for i, (q, ref, star, n) in enumerate(items(d, plain_ref=True)):
            prompt, c = role(q, ref, star)
            if len(prompt) > PROMPT_MAX: sys.exit(f'Не получилось: вопрос {i + 1} длиннее {PROMPT_MAX} знаков')
            if c: cut.append(i + 1)
            num = n if isinstance(n, int) else i + 1
            text = f"Вопрос {num}{' ★' if star else ''}: {q} — поговорите с консулом по-польски"[:TEXT_MAX]
            steps.append({'kind': 'talk', 'text': text, 'prompt': prompt, **fl})
    if not steps: sys.exit('Не нашёл вопросов — экранов нет')
    stars = sum(1 for s in steps if s.get('star') or ' ★:' in s.get('text', ''))
    rep = f'экранов: {len(steps)} (один вопрос — один экран) · со звездой: {stars}'
    if how == 'role': rep += f' · самая длинная роль Gemini: {max(len(s["prompt"]) for s in steps)} знаков' + (f' · эталон сокращён у вопросов: {", ".join(map(str, cut))}' if cut else '')
    if how == 'exam':
        noref = [i + 1 for i, s in enumerate(steps) if not s.get('ideal')]
        if noref: rep += f' · без эталона: {", ".join(map(str, noref))}'
    if fl: rep += ' · флаги: ' + ', '.join(k for k in fl)
    return {'steps': steps}, rep


def one(tpl, src, out):
    if not os.path.exists(src): sys.exit(f'Нет файла: {src}')
    res, rep = build(tpl, kp_data(src))
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'Готово: {out}\n  {TPL[tpl][0]} · {rep}')


if ARGS.list:
    show_list(); sys.exit(0)
tpl = ARGS.tpl or pick()
if tpl not in TPL:
    print(f'Нет упражнения «{tpl}». Есть:'); show_list(); sys.exit(2)
if ARGS.src:
    one(tpl, ARGS.src, ARGS.out or re.sub(r'\.(pdf|json)$', '', ARGS.src, flags=re.I) + f'.{tpl}.json')
else:                                          # пакетный режим: tools/pdf/*.pdf → tools/json/<папка>/
    IN, OUT = os.path.join(HERE, 'pdf'), os.path.join(HERE, 'json', TPL[tpl][1])
    os.makedirs(IN, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    pdfs = sorted(f for f in os.listdir(IN) if f.lower().endswith('.pdf'))
    if not pdfs: sys.exit(f'В папке {IN} нет PDF — положите туда домашки и запустите ещё раз')
    ok = 0
    for f in pdfs:
        print(f'\n— {f}')
        try: one(tpl, os.path.join(IN, f), os.path.join(OUT, os.path.splitext(f)[0] + '.json')); ok += 1
        except SystemExit as e: print(e)
    print(f'\nИтого: готово {ok} из {len(pdfs)} · {TPL[tpl][0]} · JSON — в {OUT}')
    sys.exit(0 if ok == len(pdfs) else 1)

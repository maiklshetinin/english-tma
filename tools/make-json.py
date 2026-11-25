#!/usr/bin/env python3
"""PDF домашки Karta Polaka → JSON экранов любого упражнения. Один скрипт, меняется только тип (24.11.2026).

Один вопрос — один файл, на каждый урок — своя папка (24.11.2026): tools/json/<папка типа>/<урок>/01 ★ Jakie Pan(i) zna….json
В файле — только данные, без промптов и настроек:
    { "type": "talkvn", "text": "вопрос", "ideal": "эталон", "star": true, "n": 1 }
  type  — ID упражнения (как на плашке в меню Exercise и в src/utils/lesson.ts → TEMPLATES);
  text  — вопрос; ideal — эталонный ответ (с выделениями домашки); star — обязательный вопрос (★); n — номер в домашке.
Всё остальное (kind, флаги, промпты, роль консула, модели) приложение берёт из шаблона упражнения и настроек курса («{ }» на плитке).

Проще всего: положить PDF в tools/pdf/ и дважды щёлкнуть «Сделать JSON.bat» — он спросит, какое упражнение.
Из терминала:
    python tools/make-json.py                          # спросит номер, потом все PDF из tools/pdf/
    python tools/make-json.py --list                   # все типы
    python tools/make-json.py talkvn                   # все PDF из tools/pdf/ → tools/json/<папка типа>/<урок>/
    python tools/make-json.py kpball "ДЗ 8.pdf"        # рядом появится папка «ДЗ 8.kpball» — по файлу на вопрос
    python tools/make-json.py kpballive "ДЗ 8.pdf"    # то же для «шара Live» (папка json/шар live/)
    python tools/make-json.py talkptt "json/мост/ДЗ 8. Кухня.json"   # можно из готового JSON
    python tools/make-json.py pl-kp-1                  # ID с номером: "type": "pl-kp-1", папка json/мост-1/
В меню .bat можно ввести номер, ID из списка, название целиком или ID с номером (25.11.2026).
PDF разбирает tools/lib/kp-json.py — вопросы, эталоны и звёзды у всех типов одинаковые. Новый тип — одна строка в TYPES.
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KP = next((p for p in (os.path.join(HERE, 'lib', 'kp-json.py'), os.path.join(HERE, 'kp-json.py')) if os.path.exists(p)), os.path.join(HERE, 'lib', 'kp-json.py'))          # разбор PDF — в lib/

# ID упражнения → (название, папка в tools/json/). Больше ничего: данные у всех одинаковые.
# ID начинается с языка (24.11.2026): Карта поляка — только польский, pl-… Старые ID без языка (kp, talkptt) тоже принимаются
TYPES = {
    'pl-kp':       ('Ответ по смыслу',                     'мост'),
    'pl-kpapi':    ('Ответ по смыслу · Gemini API',        'gemini-live'),
    'pl-kpfile':   ('Ответ по смыслу · целым аудио',       'запись целиком'),
    'pl-kpball':   ('Ответ по смыслу · шар',               'шар'),
    'pl-kpballive': ('Ответ по смыслу · шар Live',          'шар live'),
    'pl-talk':     ('Разговор с Gemini',                   'разговор без персонажа'),
    'pl-talkava':  ('Разговор с персонажем',               'разговор'),
    'pl-talkptt':  ('Разговор · рация',                    'рация'),
    'pl-talkvn':   ('Рация · голосовые',                   'голосовые'),
    'pl-talkexam': ('Собеседование · рация',               'собеседование'),
}

ap = argparse.ArgumentParser(description='PDF домашки Karta Polaka → JSON экранов: тип + вопрос + эталон')
ap.add_argument('type', nargs='?', help='ID упражнения (см. --list); без него — спросит')
ap.add_argument('src', nargs='?', help='PDF домашки или готовый JSON (без него — все PDF из tools/pdf/)')
ap.add_argument('-o', '--out', help='в какую папку сложить файлы (по умолчанию — рядом, «<имя>.<тип>»)')
ap.add_argument('--list', action='store_true', help='показать все типы')
ap.add_argument('--lesson', help='название урока, если в PDF его нет текстом (передаётся в kp-json.py)')
ARGS = ap.parse_args()


def show_list():
    for i, (k, (t, folder)) in enumerate(TYPES.items(), 1):
        print(f'  {i:>2}. {k:<12} {t:<34} → json/{folder}/')


def resolve(v):
    """Номер / ID / название из списка → ID. ID с номером (pl-kp-1) — вариант упражнения из списка,
    в JSON будет "type": "pl-kp-1", файлы — в json/<папка>-1/ (25.11.2026). Без подтверждения"""
    v = v.strip()
    keys = list(TYPES)
    if v.isdigit() and 1 <= int(v) <= len(keys): return keys[int(v) - 1]
    if v in TYPES: return v
    if 'pl-' + v in TYPES: return 'pl-' + v          # старый ID без языка
    low = v.lower()
    by_name = [k for k, (t, _) in TYPES.items() if t.lower() == low]
    if by_name: return by_name[0]                    # написали название целиком: «Разговор · рация»
    m = re.fullmatch(r'(.+?)-(\d+)', v)              # ID из списка + номер: pl-kp-1 / kp-1 (25.11.2026)
    if m:
        base = m.group(1) if m.group(1) in TYPES else 'pl-' + m.group(1)
        if base in TYPES:
            vid = f'{base}-{m.group(2)}'
            t, folder = TYPES[base]
            TYPES[vid] = (f'{t} · вариант {m.group(2)}', f'{folder}-{m.group(2)}')   # папка json/мост-1/
            return vid
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', v):
        sys.exit(f'Нет такого упражнения: {v}\nСвой ID — латиницей, цифрами и - _ . (например pl-kp-1)')
    TYPES[v] = ('свой ID', v)                         # совсем свой ID — папка json/<ID>/
    return v


def pick():
    print('Какое упражнение сделать из PDF?\n'); show_list()
    print('\n  Можно ID с номером: pl-kp-1 → "type": "pl-kp-1", папка json/мост-1/')
    v = input('\nНомер или ID: ').strip()
    if not v: sys.exit('Ничего не выбрано')
    return resolve(v)


def lesson(src):
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


def steps(d):
    """Урок → экраны: вопрос, эталон, звезда, номер — и всё. Из questions (PDF / мост) или из готовых экранов (steps)"""
    out = []
    if isinstance(d.get('steps'), list):
        src = [((s.get('text') or '').strip(), (s.get('ideal') or '').strip(), s.get('star') is True, s.get('n')) for s in d['steps']]
    else:
        src = []
        for q in d.get('questions', []):
            html, ref = (q.get('reference_html') or '').strip(), (q.get('reference') or '').strip()
            src.append(((q.get('question') or '').strip(), from_html(html) if html else ref, q.get('star') is True, q.get('id')))
    for text, ideal, star, n in src:
        if not text: continue
        s = {'text': text[:300]}
        if ideal: s['ideal'] = ideal
        if star: s['star'] = True
        if isinstance(n, int) and 0 < n < 100: s['n'] = n
        out.append(s)
    return out


def fname(s):
    """Имя файла вопроса: «01 ★ Jakie Pan(i) zna tradycyjne polskie potrawy.json» — номер, звезда, начало вопроса"""
    q = re.sub(r'[\\/:*?"<>|\n\r\t]+', ' ', s['text']).strip().rstrip('?.!').strip()
    q = re.sub(r'\s+', ' ', q)
    q = (q[:60].rsplit(' ', 1)[0] if len(q) > 60 else q).rstrip(',;:—-( ')
    return f"{s.get('n', 0):02d}{' ★' if s.get('star') else ''} {q}.json"


def one(typ, src, out):
    """Урок → папка out: по файлу на вопрос — { type, text, ideal, star, n }"""
    if not os.path.exists(src): sys.exit(f'Нет файла: {src}')
    st = steps(lesson(src))
    if not st: sys.exit('Не нашёл вопросов — экранов нет')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):          # прошлый запуск — убрать, чтобы не осталось старых вопросов
        if f.endswith('.json'): os.remove(os.path.join(out, f))
    for i, s in enumerate(st):
        s.setdefault('n', i + 1)
        json.dump({'type': typ, **s}, open(os.path.join(out, fname(s)), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    noref = [str(s['n']) for s in st if not s.get('ideal')]
    print(f'Готово: {out}\n  {typ} · {TYPES[typ][0]} · файлов: {len(st)} (вопрос — файл) · со звездой: {sum(1 for s in st if s.get("star"))}'
          + (f' · без эталона: {", ".join(noref)}' if noref else ''))


if ARGS.list:
    show_list(); sys.exit(0)
typ = resolve(ARGS.type) if ARGS.type else pick()
if ARGS.src:
    one(typ, ARGS.src, ARGS.out or re.sub(r'\.(pdf|json)$', '', ARGS.src, flags=re.I) + f'.{typ}')
else:                                          # пакетный режим: tools/pdf/*.pdf → tools/json/<папка>/
    IN, OUT = os.path.join(HERE, 'pdf'), os.path.join(HERE, 'json', TYPES[typ][1])
    os.makedirs(IN, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    pdfs = sorted(f for f in os.listdir(IN) if f.lower().endswith('.pdf'))
    if not pdfs: sys.exit(f'В папке {IN} нет PDF — положите туда домашки и запустите ещё раз')
    ok = 0
    for f in pdfs:
        print(f'\n— {f}')
        try: one(typ, os.path.join(IN, f), os.path.join(OUT, os.path.splitext(f)[0])); ok += 1          # папка урока
        except SystemExit as e: print(e)
    print(f'\nИтого: готово {ok} из {len(pdfs)} · {typ} · JSON — в {OUT}')
    sys.exit(0 if ok == len(pdfs) else 1)

#!/usr/bin/env python3
"""PDF домашки Karta Polaka (курс Марии Кобрыни) → JSON для упражнения «Ответ по смыслу».

Запуск (нужен Python 3 и пакет pymupdf: pip install pymupdf):
    python tools/kp-json.py "ДЗ 6. Пасха.pdf"
    python tools/kp-json.py "ДЗ 5. Рождество.pdf" --lesson "Урок 5. Период рождества"     # если шапка в PDF картинкой
Рядом с PDF появится «ДЗ 6. Пасха.json» — его вставляют в редактор урока (Ctrl+V на холст или «Вставить JSON»).

Что достаёт: вопросы из задания (1-я страница с «Ответьте…»), эталоны из «Ответов» с оформлением
(оранжевые термины, жирный, красный, курсив, абзацы, списки), красные звёзды, заметки Марии по-русски — отдельно (notes),
«Дополнение» (первые строки песен). Проверено на ДЗ 5 «Рождество» и ДЗ 6 «Пасха» (20.11.2026).
"""
import argparse, glob, html, json, os, re, sys
try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        sys.exit('Нужен пакет pymupdf: pip install pymupdf')

ap = argparse.ArgumentParser(description='PDF домашки Karta Polaka → JSON «Ответ по смыслу»')
ap.add_argument('pdf', help='PDF домашки')
ap.add_argument('-o', '--out', help='куда сохранить JSON (по умолчанию — рядом с PDF, то же имя)')
ap.add_argument('--lesson', help='название урока, если в PDF его нет текстом: «Урок 5. Период рождества»')
ARGS = ap.parse_args()
SRC = ARGS.pdf
if not os.path.exists(SRC): sys.exit(f'Нет файла: {SRC}')
OUT = ARGS.out or os.path.splitext(SRC)[0] + '.json'


def fail(msg): sys.exit('Не получилось: ' + msg)


d = fitz.open(SRC)
PAGES = [p.get_text() for p in d]
TASK = next((i for i, t in enumerate(PAGES) if 'Ответьте' in t), None)
if TASK is None: fail('не нашёл страницу с заданием («Ответьте…»)')
ANS0 = next((i for i, t in enumerate(PAGES) if i > TASK and 'Ответы' in t), None)
if ANS0 is None: fail('не нашёл страницу «Ответы»')
APP = next((i for i, t in enumerate(PAGES) if 'Дополнение' in t), None)            # «Дополнение» (может быть на странице с ответами)
head = [l.strip() for t in PAGES for l in t.split('\n') if l.strip()]
pick = lambda pre, dflt: next((l for l in head if l.startswith(pre)), dflt)
fname_num = re.search(r'(\d+)', os.path.basename(SRC))
LESSON = ARGS.lesson or pick('Урок', f'Урок {fname_num[1]}' if fname_num else 'Урок')
MODULE = pick('Модуль', 'Модуль 2 - Праздники'); COURSE = pick('Курс', 'Курс Karta Polaka / Pobyt Stały от Марии Кобрыни')
NUM = int(re.search(r'Урок\s*(\d+)', LESSON)[1]) if re.search(r'Урок\s*(\d+)', LESSON) else 0

TEXT, ACCENT, NOTE_C, GRAY, RED = 0x351a05, 0xcd8a30, 0x7b4224, 0x737373, 0xff3131
BODY = {}          # страница → шрифт обычного текста: имена шрифтов в PDF врут (в уроке 6 обычный текст — «BoldIta»), берём самый частый


def body_font(pn):
    if pn not in BODY:
        from collections import Counter
        c = Counter()
        for b in d[pn].get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    if s['color'] == TEXT and 13 <= s['size'] <= 17: c[s['font']] += len(s['text'])
        BODY[pn] = c.most_common(1)[0][0] if c else ''
    return BODY[pn]


def kind(s, pn):
    """Оформление куска текста: accent (оранжевый термин), red (красное), bold, italic, note (заметка Марии), plain"""
    c, f = s['color'], s['font']
    if c in (NOTE_C, GRAY) or re.search('[А-Яа-яЁё]', s['text']): return 'note'          # по-русски (даже оранжевым) — заметка Марии, не эталон
    if c == ACCENT: return 'accent'
    if c == RED: return 'red'
    if f == body_font(pn): return 'plain'
    if 'Bold' in f: return 'bold'
    if 'Ital' in f: return 'italic'
    return 'plain'


def lines_of(pn):
    """Строки страницы без шапки, подвала и водяного знака: (x0, y0, x1, spans)"""
    p = d[pn]
    out = []
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            sp = [s for s in l['spans'] if s['text']]
            t = ''.join(s['text'] for s in sp)
            if not t.strip() or l['bbox'][1] < 130: continue                       # шапка
            if any(s['size'] > 40 or s['font'] == 'Forum' for s in sp): continue  # водяной знак, подвал
            if t.strip() == 'продолжение': continue
            out.append((l['bbox'][0], l['bbox'][1], l['bbox'][2], sp))
    out.sort(key=lambda r: (round(r[1]), r[0]))
    return out


def stars(pn):
    return [(i['bbox'][1] + i['bbox'][3]) / 2 for i in d[pn].get_image_info() if i['bbox'][2] < 50]


# ── вопросы из задания (стр. 2) ──
task = {}
cur = None
for x0, y0, x1, sp in lines_of(TASK):
    t = ''.join(s['text'] for s in sp).strip()
    m = re.match(r'^(\d{1,2})\.\s*(.+)$', t)
    if m: cur = int(m[1]); task[cur] = m[2]
    elif cur and not t.startswith('Ответьте'): task[cur] += ' ' + t
if not task or sorted(task) != list(range(1, len(task) + 1)): fail(f'вопросы в задании идут не по порядку: {sorted(task)}')
N = len(task)

# ── ответы (стр. 3–8) ──
Q = {}          # n → {'heading', 'star', 'blocks': [[runs]], 'notes': [..]}
intro = []
order = []
cur = None
for pn in range(ANS0, len(d)):
    st = stars(pn)
    stop_y = None
    if APP == pn:
        for b in d[pn].get_text('dict')['blocks']:
            for l in b.get('lines', []):
                if 'Дополнение' in ''.join(s['text'] for s in l['spans']): stop_y = l['bbox'][1]
    prev = None                                                    # предыдущая строка ответа: (x0, x1)
    pending_q = False
    for x0, y0, x1, sp in lines_of(pn):
        if stop_y is not None and y0 >= stop_y - 2: break
        t = ''.join(s['text'] for s in sp)
        m = re.match(r'^\s*(\d{1,2})\.\s+(.+)$', t)
        if m and sp[0]['color'] == TEXT and x0 < 56 and (cur is None or int(m[1]) in (cur, cur + 1)):
            n = int(m[1])
            if n not in Q:
                Q[n] = {'heading': m[2].strip(), 'star': any(abs(s - (y0 + 9)) < 16 for s in st), 'blocks': [], 'notes': []}
                order.append(n)
            cur, prev = n, None
            pending_q = not re.search(r'[?.)]\s*$', m[2])
            continue
        if cur is None:                                            # вступление на стр. 3 (после легенды про звезду)
            if intro or re.match(r'^\W', t.strip()) and not t.strip().startswith('('): intro.append(t.strip())          # после легенды: строка с эмодзи (🎄 / 🐇) и дальше
            continue
        if pending_q:                                              # перенос строки вопроса
            Q[cur]['heading'] += ' ' + t.strip(); pending_q = False; continue
        q = Q[cur]
        if all(kind(s, pn) == 'note' or not s['text'].strip() for s in sp) or sp[0]['font'].startswith('Type3'):
            # заметка Марии по-русски (📌 …) — отдельно от эталона
            txt = ''.join(s['text'] for s in sp if not s['font'].startswith('Type3')).strip()
            txt = re.sub(r'\s+([.,;:!?])', r'\1', txt)
            if q['notes'] and prev == 'note': q['notes'][-1] += ' ' + txt
            else: q['notes'].append(txt)
            prev = 'note'
            continue
        runs = [(kind(s, pn), s['text']) for s in sp]
        notes_inline = [r[1].strip() for r in runs if r[0] == 'note']
        runs = [r for r in runs if r[0] != 'note']
        for n_ in notes_inline: q['notes'].append(n_)
        first = next((r for r in runs if r[1].strip()), ('plain', ''))
        term = first[0] == 'accent' and re.match(r'^\s*[^:]{2,40}:', ''.join(r[1] for r in runs))   # «Термин: …» — новый пункт списка
        first_ch = next((ch for ch in t.strip() if ch.isalpha()), '')
        cont = (prev not in (None, 'note') and q['blocks'] and q['blocks'][-1]['bullet'] and x0 < prev[0] - 8)   # перенос внутри пункта (строка левее)
        item = (prev not in (None, 'note') and q['blocks'] and q['blocks'][-1]['bullet'] and x0 >= 56 and abs(x0 - prev[0]) < 6
                and re.match(r'^[A-ZĄĆĘŁŃÓŚŹŻ][^–:.,]{1,40}( – |: )', t.strip()))                           # тот же отступ и «Подпись – …» / «Подпись: …» — новый пункт
        new = not cont and (prev is None or prev == 'note' or t.startswith('  ') or term or item
               or (prev[1] < 470)                                   # прошлая строка короткая — абзац или пункт кончился
               or (x0 > prev[0] + 12))                              # отступ вправо — пункт списка
        bullet = (x0 >= 56 and not t.startswith('  ')) or bool(term)
        if new: q['blocks'].append({'bullet': bullet, 'runs': runs})
        else:
            last = q['blocks'][-1]['runs']
            if last and runs and last[-1][0] == runs[0][0]: last[-1] = (last[-1][0], last[-1][1] + ' ')   # «miejsce / narodzin» — одно выделение через перенос
            else: last.append(('plain', ' '))
            last.extend(runs)
        prev = (x0, x1)

if order != list(range(1, N + 1)): fail(f'в ответах нашёл вопросы {order}, а в задании их {N}')

# ── «Дополнение»: текст и две колонки строк (колядки / песни) ──
appendix = None
if APP is not None:
    rows = [(x0, y0, ''.join(s['text'] for s in sp).strip()) for x0, y0, x1, sp in lines_of(APP)]
    y_app = next(y for x, y, t in rows if t.startswith('Дополнение'))
    after = [(x, y, t) for x, y, t in rows if y > y_app]
    text = []
    for x, y, t in after:
        text.append(t)
        if t.endswith(':'): break
    y_txt = max(y for x, y, t in after if t in text)
    body = [(x, y, t) for x, y, t in after if y > y_txt and not t.startswith('Друзья, спасибо') and not t.startswith('Рекомендую')]
    y_end = min([y for x, y, t in after if t.startswith('Друзья, спасибо')] + [10_000])
    body = [(x, y, t) for x, y, t in body if y < y_end]
    mid = d[APP].rect.width * 0.45                                           # две колонки: левая и правая половина страницы
    cols = [[t.replace('Сicha', 'Cicha') for x, y, t in body if x < mid], [t for x, y, t in body if x >= mid]]
    appendix = {'title': 'Дополнение', 'text': ' '.join(text), 'songs': [{'title': re.sub(r'[,;.]$', '', c[0]), 'lines': c} for c in cols if c]}


# ── сборка текста в трёх видах ──
def norm(s): return re.sub(r'\s+', ' ', s)


def merge(runs):
    out = []
    for k, t in runs:
        if out and out[-1][0] == k: out[-1] = (k, out[-1][1] + t)
        else: out.append((k, t))
    return out


def tidy(s): return re.sub(r'\s+([.,;:!?])', r'\1', norm(s)).strip()


def plain(b): return tidy(''.join(t for _, t in b['runs']))


def md(b):
    s = ''
    for k, t in merge([('bold' if k in ('accent', 'red') else k, t) for k, t in b['runs']]):
        if k in ('bold', 'accent') and t.strip():
            lead, core, tail = re.match(r'^(\s*)(.*?)(\s*)$', t, re.S).groups()
            s += lead + '**' + core + '**' + tail
        else: s += t
    return tidy(s).replace('** **', ' ')


TAG = {'bold': ('<b>', '</b>'), 'italic': ('<i>', '</i>'), 'accent': ('<b class="acc">', '</b>'), 'red': ('<b class="red">', '</b>'), 'plain': ('', '')}


def hx(b):
    s = ''
    for k, t in merge(b['runs']):
        a, z = TAG[k]
        s += (a + html.escape(t, quote=False) + z) if t.strip() else t
    return tidy(s)


def join(q, f):
    lines = [('• ' if b['bullet'] else '') + f(b) for b in q['blocks']]
    return '\n'.join(lines)


def join_html(q):
    out, ul = [], False
    for b in q['blocks']:
        if b['bullet'] and not ul: out.append('<ul>'); ul = True
        if not b['bullet'] and ul: out.append('</ul>'); ul = False
        out.append(('<li>' if b['bullet'] else '<p>') + hx(b) + ('</li>' if b['bullet'] else '</p>'))
    if ul: out.append('</ul>')
    return ''.join(out)


questions = []
for n in order:
    q = Q[n]
    item = {'id': n, 'star': q['star'], 'question': norm(task[n]).strip()}
    if norm(q['heading']).strip() != item['question']: item['question_in_answers'] = norm(q['heading']).strip()
    item['reference'] = join(q, plain)
    item['reference_md'] = join(q, md)
    item['reference_html'] = join_html(q)
    if q['notes']: item['notes'] = [norm(x).strip() for x in q['notes'] if x.strip()]
    questions.append(item)

out = {
    'lesson_id': f'm2l{NUM}' if NUM else 'lesson',
    'course': COURSE,
    'module': MODULE,
    'lesson': LESSON,
    'pass_threshold': 60,
    'style': {
        'fonts': {'titles': 'Alice', 'text': 'Libra Serif Modern (похож — PT Serif)'},
        'colors': {'background': '#ffeccf', 'text': '#351a05', 'accent': '#cd8a30', 'red': '#ff3131', 'note': '#7b4224', 'titles': '#cda15e'},
        'markup': {
            'star': 'true — красная звезда: ответ нужно знать обязательно (в уроке и презентации тоже выделены)',
            'reference': 'чистый текст: абзацы — с новой строки, пункты списка — «• »',
            'reference_md': '**жирный** — и жирные факты, и оранжевые термины (как понимает приложение)',
            'reference_html': '<b class="acc"> — оранжевый термин, <b class="red"> — красное, <b> — жирный, <i> — курсив, <ul><li> — список',
            'notes': 'заметки Марии по-русски — не часть эталона',
        },
    },
    'intro': re.sub(r'^[^\w(]+', '', norm(' '.join(intro))).strip(),
    'questions': questions,
    'appendix': appendix,
}
if appendix is None: del out['appendix']
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
stars = [q['id'] for q in questions if q['star']]
print(f'Готово: {OUT}')
print(f'  {LESSON} · вопросов: {len(questions)} · со звездой: {len(stars)} ({", ".join(map(str, stars)) or "—"})')
print(f'  заметок Марии: {sum(len(q.get("notes", [])) for q in questions)} · дополнение: {"есть" if appendix else "нет"}')
if not ARGS.lesson and not pick('Урок', ''): print('  ! названия урока нет в PDF текстом — укажите: --lesson "Урок N. Название"')

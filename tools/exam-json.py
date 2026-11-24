#!/usr/bin/env python3
"""PDF домашки Karta Polaka → JSON экранов «Собеседование · рация» (тест): консул (Gemini Live) спрашивает ОДИН вопрос голосом.

Один скрипт — одно упражнение (24.11.2026). Проще всего: положить PDF в tools/pdf/ и дважды щёлкнуть «Сделать собеседование.bat» —
JSON появятся в tools/json/собеседование/.
Из терминала:
    python tools/exam-json.py                          # все PDF из tools/pdf/ → tools/json/собеседование/
    python tools/exam-json.py "ДЗ 8. Кухня.pdf"         # рядом появится «ДЗ 8. Кухня.собеседование.json»
    python tools/exam-json.py "json/мост/ДЗ 8. Кухня.json"   # можно из готового JSON «моста»
    python tools/exam-json.py "ДЗ 8.pdf" --no-avatar    # без персонажа

Чем отличается от «Разговор · рация» (ptt-json.py): там роль консула с вопросом и эталоном вшита в промпт каждого экрана.
Здесь — как у «Ответа по смыслу»: у экрана только вопрос (text), эталон (ideal), звезда (star) и номер (n), а роль — общий
шаблон упражнения с метками {question}, {reference}, {star} (src/exercises/talk/defaults.ts EXAM_PROMPT). Поменять роль сразу
для всех экранов — «{ }» на плитке «Собеседование · рация» в меню Exercise (вкладка Karta Polaka). Своя роль у экрана — в его JSON.
Шаблон: "kind": "talk", "exam": true, "ptt": true — рация (нажал — говоришь, нажал ещё раз — отправил), оценка речи — как у рации.
Вопросы и эталоны достаёт tools/kp-json.py (тот же разбор PDF); эталон с оформлением — как в приложении (kpFromHtml).
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KP = os.path.join(HERE, 'kp-json.py')
FOLDER = 'собеседование'

ap = argparse.ArgumentParser(description='PDF домашки Karta Polaka → JSON «Собеседование · рация»')
ap.add_argument('src', nargs='?', help=f'PDF домашки или JSON «моста» (без него — все PDF из tools/pdf/ → tools/json/{FOLDER}/)')
ap.add_argument('-o', '--out', help='куда сохранить JSON (по умолчанию — рядом, «<имя>.собеседование.json»)')
ap.add_argument('--no-avatar', action='store_true', help='без персонажа')
ap.add_argument('--lesson', help='название урока, если в PDF его нет текстом (передаётся в kp-json.py)')
ARGS = ap.parse_args()


def kp_data(src):
    """Урок из PDF — через kp-json.py во временный файл (или готовый JSON «моста»)"""
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
    """questions (или экраны «Ответа по смыслу») → экраны «Собеседование · рация»"""
    src = d['steps'] if isinstance(d.get('steps'), list) else None
    out = []
    if src is not None:          # уже экраны — берём вопрос, эталон, звезду и номер
        items = [(s.get('text'), s.get('ideal'), s.get('star'), s.get('n')) for s in src if s.get('kind') in ('kp', 'talk')]
    else:
        items = []
        for q in d.get('questions', []):
            html, ref = (q.get('reference_html') or '').strip(), (q.get('reference') or '').strip()
            items.append((q.get('question'), from_html(html) if html else ref, q.get('star'), q.get('id')))
    for text, ideal, star, n in items:
        text = (text or '').strip()
        if not text: continue
        s = {'kind': 'talk', 'exam': True, 'ptt': True, 'text': text[:300]}
        if not ARGS.no_avatar: s['avatar'] = True
        if (ideal or '').strip(): s['ideal'] = ideal.strip()
        if star is True: s['star'] = True
        if isinstance(n, int) and 0 < n < 100: s['n'] = n
        out.append(s)
    return out


def one(src, out):
    if not os.path.exists(src): sys.exit(f'Нет файла: {src}')
    st = steps(kp_data(src))
    if not st: sys.exit('Не нашёл вопросов — экранов нет')
    json.dump({'steps': st}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    stars, noref = sum(1 for s in st if s.get('star')), [i + 1 for i, s in enumerate(st) if not s.get('ideal')]
    print(f'Готово: {out}')
    print(f'  экранов: {len(st)} (один вопрос — один экран) · со звездой: {stars} · собеседование-рация'
          + ('' if ARGS.no_avatar else ' · с персонажем') + (f' · без эталона: {", ".join(map(str, noref))}' if noref else ''))


if ARGS.src:
    one(ARGS.src, ARGS.out or re.sub(r'\.(pdf|json)$', '', ARGS.src, flags=re.I) + '.собеседование.json')
else:
    IN, OUT = os.path.join(HERE, 'pdf'), os.path.join(HERE, 'json', FOLDER)
    os.makedirs(IN, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    pdfs = sorted(f for f in os.listdir(IN) if f.lower().endswith('.pdf'))
    if not pdfs: sys.exit(f'В папке {IN} нет PDF — положите туда домашки и запустите ещё раз')
    ok = 0
    for f in pdfs:
        print(f'\n— {f}')
        try: one(os.path.join(IN, f), os.path.join(OUT, os.path.splitext(f)[0] + '.json')); ok += 1
        except SystemExit as e: print(e)
    print(f'\nИтого: готово {ok} из {len(pdfs)} · JSON — в {OUT}')
    sys.exit(0 if ok == len(pdfs) else 1)

#!/usr/bin/env python3
"""PDF домашки Karta Polaka → JSON экрана «Разговор с персонажем» (Gemini Live): консул проводит собеседование по вопросам урока.

Проще всего: положить PDF в tools/pdf/ и дважды щёлкнуть «Сделать разговор.bat» — JSON появятся в tools/json/разговор/.
Из терминала:
    python tools/talk-json.py                          # все PDF из tools/pdf/ → tools/json/разговор/
    python tools/talk-json.py "ДЗ 8. Кухня.pdf"         # рядом появится «ДЗ 8. Кухня.разговор.json»
    python tools/talk-json.py "ДЗ 8. Кухня.json"        # или из готового JSON «Ответа по смыслу» (tools/json/мост/…)
    python tools/talk-json.py "ДЗ 8.pdf" --no-avatar    # обычный «Разговор с Gemini», без персонажа

Вопросы и эталоны достаёт tools/kp-json.py (тот же разбор PDF — один на оба скрипта). Получается один экран на урок:
роль Gemini (prompt) — консул на Карту поляка, тема урока, вопросы по порядку (со звездой — обязательно) и ключевые факты
эталонов, чтобы дополнять и поправлять. Роль — до 4000 знаков (столько хранит сервер): длинные эталоны сокращаются.
Вставляют, как и JSON домашки: скопировать весь текст файла и Ctrl+V на холсте урока.
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KP = os.path.join(HERE, 'kp-json.py')
PROMPT_MAX, TEXT_MAX = 3900, 300          # сервер хранит роль до 4000 знаков, задание — до 300

ap = argparse.ArgumentParser(description='PDF домашки Karta Polaka → JSON экрана «Разговор с персонажем»')
ap.add_argument('src', nargs='?', help='PDF домашки или JSON «Ответа по смыслу» (без него — все PDF из tools/pdf/ → tools/json/разговор/)')
ap.add_argument('-o', '--out', help='куда сохранить JSON (по умолчанию — рядом, «<имя>.разговор.json»)')
ap.add_argument('--no-avatar', action='store_true', help='без персонажа — обычный «Разговор с Gemini»')
ap.add_argument('--lesson', help='название урока, если в PDF его нет текстом (передаётся в kp-json.py)')
ARGS = ap.parse_args()


def kp_data(src):
    """Вопросы урока: из JSON «Ответа по смыслу» или из PDF (через kp-json.py во временный файл)"""
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


def short(t, n):
    """Эталон в одну строку и не длиннее n знаков (по границе слова)"""
    t = re.sub(r'([.!?…])\s*\n\s*(•\s*)?', r'\1 ', t.strip())          # абзац после точки — через пробел
    t = re.sub(r'\s*\n\s*(•\s*)?', '; ', t).strip('; ')          # пункты списка — через «; »
    t = re.sub(r'\s+', ' ', t)
    if len(t) <= n: return t
    cut = t[:n].rsplit(' ', 1)[0].rstrip(',;:—-')
    return cut + '…'


def build(d):
    lesson = (d.get('lesson') or '').strip()
    qs = [q for q in d.get('questions', []) if (q.get('question') or '').strip()]
    if not qs: sys.exit('Не получилось: в домашке нет вопросов')
    head = ('Jesteś konsulem RP. Prowadzisz rozmowę kwalifikacyjną na Kartę Polaka. '
            + (f'Temat rozmowy — lekcja «{lesson}» (nazwa po rosyjsku). ' if lesson else '')
            + 'Mówisz tylko po polsku, spokojnie i życzliwie. '
            'Zadawaj po kolei pytania z listy poniżej, po jednym — możesz je lekko przeformułować. Czekaj na odpowiedź. '
            'Porównuj odpowiedź z kluczowymi faktami: jeśli brakuje czegoś ważnego — dopytaj albo krótko podpowiedz. '
            'Jeśli rozmówca robi błąd językowy — delikatnie popraw jednym zdaniem i idź dalej. '
            'Pytania oznaczone * są najważniejsze — zadaj je na pewno. '
            'Po ostatnim pytaniu podziękuj i krótko oceń rozmowę: co było dobrze, co poćwiczyć.\n\nPytania i kluczowe fakty:\n')
    lines = lambda n: '\n'.join(f"{i + 1}.{'*' if q.get('star') else ''} {q['question'].strip()}"
                                + (f" — {short(q.get('reference', ''), n)}" if n and q.get('reference') else '')
                                for i, q in enumerate(qs))
    n = 400                                    # эталон к вопросу — до n знаков; не влезает в 4000 — короче
    while n > 0 and len(head + lines(n)) > PROMPT_MAX: n -= 20
    prompt = head + lines(n)
    if len(prompt) > PROMPT_MAX: sys.exit(f'Не получилось: даже без эталонов вопросы длиннее {PROMPT_MAX} знаков')
    num = re.match(r'Урок\s*(\d+)\.?\s*(.*)', lesson)
    text = ('Собеседование на Карту поляка' + (f' по уроку {num.group(1)} «{num.group(2)}»' if num and num.group(2) else f' — {lesson}' if lesson else '')
            + ': консул задаёт вопросы урока — отвечайте по-польски')[:TEXT_MAX]
    step = {'kind': 'talk', 'text': text, 'prompt': prompt}
    if not ARGS.no_avatar: step['avatar'] = True
    return {'steps': [step]}, len(qs), n, len(prompt)


def one(src, out):
    if not os.path.exists(src): sys.exit(f'Нет файла: {src}')
    res, nq, n, plen = build(kp_data(src))
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'Готово: {out}')
    print(f'  вопросов: {nq} · роль Gemini: {plen} знаков' + ('' if n >= 400 else f' (эталоны сокращены до {n} знаков)' if n else ' (без эталонов — не влезли)')
          + ('' if ARGS.no_avatar else ' · с персонажем'))


if ARGS.src:
    one(ARGS.src, ARGS.out or re.sub(r'\.(pdf|json)$', '', ARGS.src, flags=re.I) + '.разговор.json')
else:                                          # пакетный режим: tools/pdf/*.pdf → tools/json/разговор/
    IN, OUT = os.path.join(HERE, 'pdf'), os.path.join(HERE, 'json', 'разговор')
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

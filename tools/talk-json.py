#!/usr/bin/env python3
"""PDF домашки Karta Polaka → JSON экранов «Разговор с персонажем» (Gemini Live): один вопрос — один экран, как у «Ответа по смыслу».

Проще всего: положить PDF в tools/pdf/ и дважды щёлкнуть «Сделать разговор.bat» — JSON появятся в tools/json/разговор/.
Из терминала:
    python tools/talk-json.py                          # все PDF из tools/pdf/ → tools/json/разговор/
    python tools/talk-json.py "ДЗ 8. Кухня.pdf"         # рядом появится «ДЗ 8. Кухня.разговор.json»
    python tools/talk-json.py "ДЗ 8. Кухня.json"        # или из готового JSON «Ответа по смыслу» (tools/json/мост/…)
    python tools/talk-json.py "ДЗ 8.pdf" --no-avatar    # обычный «Разговор с Gemini», без персонажа
                                                       # «Разговор · рация» — свой скрипт: ptt-json.py («Сделать рацию.bat»)

Вопросы и эталоны достаёт tools/kp-json.py (тот же разбор PDF — один на оба скрипта). На каждый вопрос — свой экран (21.11.2026;
раньше — один экран на весь урок): консул на Карту поляка задаёт ЭТОТ вопрос, сверяет ответ с его эталоном, допрашивает (2–3 вопроса),
поправляет ошибки и в конце коротко оценивает. Роль Gemini — до 4000 знаков (столько хранит сервер): длинный эталон сокращается.
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


def role(q):
    """Роль Gemini для одного вопроса: консул обсуждает только его, эталон — для сверки"""
    head = ('Jesteś konsulem RP. Prowadzisz rozmowę kwalifikacyjną na Kartę Polaka. Mówisz tylko po polsku, spokojnie i życzliwie. '
            f'W tej rozmowie omawiasz tylko jedno pytanie: «{q["question"].strip()}». '
            'Na początku zadaj to pytanie (możesz je lekko przeformułować) i czekaj na odpowiedź. '
            'Porównuj odpowiedź z wzorcową odpowiedzią poniżej: jeśli brakuje czegoś ważnego — dopytaj (najwyżej 2–3 pytania pomocnicze) albo krótko podpowiedz. '
            'Jeśli rozmówca robi błąd językowy — delikatnie popraw jednym zdaniem. '
            + ('To pytanie jest bardzo ważne — uczeń musi znać odpowiedź. ' if q.get('star') else '')
            + 'Na koniec krótko oceń odpowiedź: co było dobrze, czego zabrakło — i powiedz, że można przejść do następnego pytania.')
    ref = (q.get('reference') or '').strip()
    if not ref: return head, 0
    room = PROMPT_MAX - len(head) - len('\n\nWzorcowa odpowiedź:\n')
    body = ref if len(ref) <= room else short(ref, room)
    return head + '\n\nWzorcowa odpowiedź:\n' + body, (0 if body == ref else len(body))


def build(d):
    qs = [q for q in d.get('questions', []) if (q.get('question') or '').strip()]
    if not qs: sys.exit('Не получилось: в домашке нет вопросов')
    steps, cut = [], []
    for i, q in enumerate(qs):
        prompt, c = role(q)
        if len(prompt) > PROMPT_MAX: sys.exit(f'Не получилось: вопрос {i + 1} длиннее {PROMPT_MAX} знаков')
        if c: cut.append(i + 1)
        num = q.get('id') if isinstance(q.get('id'), int) else i + 1
        text = (f"Вопрос {num}{' ★' if q.get('star') else ''}: {q['question'].strip()} — поговорите с консулом по-польски")[:TEXT_MAX]
        step = {'kind': 'talk', 'text': text, 'prompt': prompt}
        if not ARGS.no_avatar: step['avatar'] = True
        steps.append(step)
    return {'steps': steps}, len(qs), cut, max(len(s['prompt']) for s in steps)


def one(src, out):
    if not os.path.exists(src): sys.exit(f'Нет файла: {src}')
    res, nq, cut, plen = build(kp_data(src))
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'Готово: {out}')
    print(f'  экранов: {nq} (один вопрос — один экран) · самая длинная роль Gemini: {plen} знаков'
          + (f' · эталон сокращён у вопросов: {", ".join(map(str, cut))}' if cut else '') + ('' if ARGS.no_avatar else ' · с персонажем'))


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

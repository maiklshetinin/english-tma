#!/usr/bin/env python3
"""PDF домашки Karta Polaka → JSON экранов «Ответ по смыслу · целым аудио» (запись целиком → Gemini · тест).

Один скрипт — одно упражнение (23.11.2026). Проще всего: положить PDF в tools/pdf/ и дважды щёлкнуть «Сделать запись целиком.bat» —
JSON появятся в tools/json/запись целиком/.
Из терминала:
    python tools/kpfile-json.py                         # все PDF из tools/pdf/ → tools/json/запись целиком/
    python tools/kpfile-json.py "ДЗ 8. Кухня.pdf"        # рядом появится «ДЗ 8. Кухня.запись.json»
    python tools/kpfile-json.py "json/мост/ДЗ 8. Кухня.json"   # можно из готового JSON «моста»

Вопросы и эталоны достаёт tools/kp-json.py (тот же разбор PDF). Формат { questions: [...] } поле "dic" в приложение не передаёт
(src/utils/lesson.ts → stepsFromJson), поэтому скрипт пишет сразу экраны { steps: [...] }: "kind": "kp", "dic": "file" —
шаблон «Ответ по смыслу · целым аудио» (после «Стоп» вся запись уходит в Gemini одним файлом, utils/sttfile.js).
Эталон с оформлением (reference_html) переводится в разметку экрана так же, как это делает приложение (kpFromHtml).
Промпты в JSON не пишутся: у экранов — умолчания упражнения, их видно и можно поменять на вкладке JSON экрана («{ }»).
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KP = os.path.join(HERE, 'kp-json.py')
FOLDER = 'запись целиком'

ap = argparse.ArgumentParser(description='PDF домашки Karta Polaka → JSON «Ответ по смыслу · целым аудио»')
ap.add_argument('src', nargs='?', help=f'PDF домашки или JSON «моста» (без него — все PDF из tools/pdf/ → tools/json/{FOLDER}/)')
ap.add_argument('-o', '--out', help='куда сохранить JSON (по умолчанию — рядом, «<имя>.запись.json»)')
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
    """questions → экраны «Ответ по смыслу · целым аудио»"""
    if isinstance(d.get('steps'), list):          # уже экраны — только ставим dic
        return [dict(s, dic='file') for s in d['steps'] if s.get('kind') == 'kp']
    pas = d.get('pass_threshold')
    out = []
    for q in d.get('questions', []):
        text = (q.get('question') or '').strip()
        if not text: continue
        html, ref = (q.get('reference_html') or '').strip(), (q.get('reference') or '').strip()
        ideal = from_html(html) if html else ref
        s = {'kind': 'kp', 'text': text}
        if ideal: s['ideal'] = ideal
        if q.get('star') is True: s['star'] = True
        if isinstance(q.get('id'), int) and 0 < q['id'] < 100: s['n'] = q['id']
        if pas is not None: s['pass'] = pas
        s['dic'] = 'file'
        out.append(s)
    return out


def one(src, out):
    if not os.path.exists(src): sys.exit(f'Нет файла: {src}')
    d = kp_data(src)
    st = steps(d)
    if not st: sys.exit('Не нашёл вопросов — экранов нет')
    json.dump({'steps': st}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    stars = sum(1 for s in st if s.get('star'))
    print(f'Готово: {out}')
    print(f'  экранов: {len(st)} · со звездой: {stars} · запись целиком → Gemini')


if ARGS.src:
    one(ARGS.src, ARGS.out or re.sub(r'\.(pdf|json)$', '', ARGS.src, flags=re.I) + '.запись.json')
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

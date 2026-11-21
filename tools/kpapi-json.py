#!/usr/bin/env python3
"""PDF домашки Karta Polaka → JSON «Ответ по смыслу · Gemini API» (проверка напрямую, без моста).

Один скрипт — одно упражнение (21.11.2026). Проще всего: положить PDF в tools/pdf/ и дважды щёлкнуть «Сделать Gemini API.bat» —
JSON появятся в tools/json/gemini-live/.
Из терминала:
    python tools/kpapi-json.py                         # все PDF из tools/pdf/ → tools/json/gemini-live/
    python tools/kpapi-json.py "ДЗ 6. Пасха.pdf"        # рядом появится «ДЗ 6. Пасха.gemini.json»
    python tools/kpapi-json.py "ДЗ 6.pdf" --model auto  # проверка текстовой Flash Lite, а не голосовой Live-моделью

Вопросы и эталоны достаёт tools/kp-json.py (тот же разбор PDF). Этот скрипт только помечает урок: "engine": "api" и "model"
(по умолчанию "live" — проверка голосовой Live-моделью). Промпты в JSON не пишутся: у экрана — умолчания «Gemini API», их видно и
можно поменять на вкладке JSON экрана («{ }»).
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KP = os.path.join(HERE, 'kp-json.py')

ap = argparse.ArgumentParser(description='PDF домашки Karta Polaka → JSON «Ответ по смыслу · Gemini API»')
ap.add_argument('src', nargs='?', help='PDF домашки (без него — все PDF из tools/pdf/ → tools/json/gemini-live/)')
ap.add_argument('-o', '--out', help='куда сохранить JSON (по умолчанию — рядом, «<имя>.gemini.json»)')
ap.add_argument('--model', default='live', help='модель проверки: live (голосовая Live, по умолчанию), auto (Flash Lite) или имя модели')
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


def mark(d):
    """engine и model — сразу после pass_threshold (так их читает приложение, stepsFromJson); остальное как было"""
    r, put = {}, False
    for k, v in d.items():
        if k in ('engine', 'model'): continue
        r[k] = v
        if k == 'pass_threshold': r['engine'], r['model'], put = 'api', ARGS.model, True
    if not put: r['engine'], r['model'] = 'api', ARGS.model
    return r


def one(src, out):
    if not os.path.exists(src): sys.exit(f'Нет файла: {src}')
    d = mark(kp_data(src))
    json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'Готово: {out}')
    print(f'  вопросов: {len(d.get("questions", []))} · проверка: Gemini API, модель {ARGS.model}')


if ARGS.src:
    one(ARGS.src, ARGS.out or re.sub(r'\.(pdf|json)$', '', ARGS.src, flags=re.I) + '.gemini.json')
else:
    IN, OUT = os.path.join(HERE, 'pdf'), os.path.join(HERE, 'json', 'gemini-live')
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
